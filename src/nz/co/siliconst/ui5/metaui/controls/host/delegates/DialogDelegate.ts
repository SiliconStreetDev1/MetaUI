/**
 * @file DialogDelegate.ts
 * @description Extracts all popup and dialog generation logic from the Host control.
 */

import Dialog from "sap/m/Dialog";
import Button from "sap/m/Button";
import { ButtonType } from "sap/m/library";
import Control from "sap/ui/core/Control";
import ManagedObject from "sap/ui/base/ManagedObject";
import BusyDialog from "sap/m/BusyDialog";
import { Logger } from "../../../utils/Logger";
import { ISchema, IPropertyMetadata } from "../../../interfaces/ISchema";
import { WIDGET_TYPE, SCHEMA_TYPE } from "../../../constants/MetaUIConstants";

/**
 * Host contract required by {@link DialogDelegate} to generate content, trigger submit, and fire dialog events.
 */
export interface IHostDialog {
    sParentAggregationName?: string;
    generate(): Promise<void> | void;
    triggerSubmit(): boolean;
    fireEvent(eventName: string, parameters?: Record<string, unknown>): unknown;
    revertUncommittedChanges?(): void;
}

interface IOriginLocation {
    parent: ManagedObject;
    aggregationName: string;
    multiple: boolean;
    index: number;
}

/**
 * Extracts all popup and dialog generation logic from the Host control.
 */
export class DialogDelegate {
    private host: IHostDialog & Control;
    private activeDialog: Dialog | null = null;
    private pendingResolve: (() => void) | null = null;
    private pendingOrigin: IOriginLocation | null = null;
    private requestedWidth: string = "auto";
    private calculatedOptimalWidth: string = "auto";

    /**
     * Initializes a new DialogDelegate to handle dialog-based rendering.
     * @param host The parent DynamicHost or GeneratorHost control.
     */
    constructor(host: IHostDialog & Control) {
        this.host = host;
    }

    /**
     * Records where `this.host` was mounted before being moved into the dialog so it can be
     * restored on close instead of being destroyed with the dialog.
     */
    private captureOriginLocation(): IOriginLocation | null {
        const parent = this.host.getParent();
        if (!parent) return null;

        type InspectableParent = ManagedObject & {
            getAggregation?: (name: string) => ManagedObject | ManagedObject[] | null;
            indexOfAggregation?: (name: string, child: ManagedObject) => number;
        };

        const inspectable = parent as InspectableParent;
        const directAggName = this.host.sParentAggregationName;
        if (directAggName) {
            const directContent = inspectable.getAggregation?.(directAggName);
            if (Array.isArray(directContent)) {
                const idx =
                    typeof inspectable.indexOfAggregation === "function"
                        ? inspectable.indexOfAggregation(directAggName, this.host)
                        : directContent.indexOf(this.host);
                if (idx >= 0) {
                    return { parent, aggregationName: directAggName, multiple: true, index: idx };
                }
            } else if (directContent === this.host) {
                return { parent, aggregationName: directAggName, multiple: false, index: 0 };
            }
        }

        const allAggregations = parent.getMetadata().getAllAggregations();
        for (const aggName of Object.keys(allAggregations)) {
            const aggMeta = allAggregations[aggName];
            const content = inspectable.getAggregation?.(aggName);
            if (Array.isArray(content)) {
                const idx = typeof inspectable.indexOfAggregation === "function"
                    ? inspectable.indexOfAggregation(aggName, this.host)
                    : content.indexOf(this.host);
                if (idx >= 0) {
                    return { parent, aggregationName: aggName, multiple: true, index: idx };
                }
            } else if (content === this.host) {
                return { parent, aggregationName: aggName, multiple: !!aggMeta.multiple, index: 0 };
            }
        }
        return null;
    }

    /**
     * Restores `this.host` to its original parent aggregation after the dialog closes.
     */
    private restoreToOrigin(origin: IOriginLocation | null): void {
        if (!origin || origin.parent.isDestroyed()) return;

        type MutableParent = ManagedObject & {
            insertAggregation?: (name: string, child: ManagedObject, index: number, suppressInvalidate?: boolean) => void;
            setAggregation?: (name: string, child: ManagedObject, suppressInvalidate?: boolean) => void;
            sParentAggregationName?: string;
        };

        const mutableParent = origin.parent as MutableParent;
        const suppress =
            origin.aggregationName === "dependents" || mutableParent.sParentAggregationName === "dependents";
        if (origin.multiple && typeof mutableParent.insertAggregation === "function") {
            mutableParent.insertAggregation(origin.aggregationName, this.host, origin.index, suppress);
        } else if (typeof mutableParent.setAggregation === "function") {
            mutableParent.setAggregation(origin.aggregationName, this.host, suppress);
        }
    }

    /**
     * Dialog Modality: Opens the generated layout inside a `sap.m.Dialog`.
     * Automatically wires up customizable submit (default: `'OK'`) and `'Cancel'` buttons.
     *
     * @returns {Promise<void>} Resolves once the dialog has closed.
     */
    public async openInDialog(
        title: string = "Form",
        submitButtonText: string = "OK",
        _isGenerated: boolean = false,
        cancelButtonText: string = "Cancel",
        dialogWidth: string = "auto",
        parentView?: Control
    ): Promise<void> {
        if (this.activeDialog) {
            this.destroy();
        }
        this.requestedWidth = dialogWidth;
        this.calculatedOptimalWidth = dialogWidth;

        const busyDialog = new BusyDialog({ text: "Building Form..." });
        busyDialog.open();

        try {
            const genResult = this.host.generate();
            if (genResult instanceof Promise) {
                await genResult;
            }
        } catch (err) {
            busyDialog.close();
            busyDialog.destroy();
            Logger.error("[MetaUI] Catastrophic error during pre-generation of dialog content", (err as Error).message, "DialogDelegate");
            throw err;
        }

        busyDialog.close();
        busyDialog.destroy();

        const finalWidth = this.requestedWidth === "auto" && this.calculatedOptimalWidth !== "auto"
            ? this.calculatedOptimalWidth
            : this.requestedWidth;

        const origin = this.captureOriginLocation();
        this.pendingOrigin = origin;
        const isReadOnlyHost = this.host.getProperty("editable") === false;

        return new Promise<void>((resolve) => {
            this.pendingResolve = resolve;
            let submittedOrCancelled = false;
            let wasSubmitted = false;
            const dialog = new Dialog({
                title: title,
                contentWidth: finalWidth,
                content: [this.host],
                beginButton: new Button({
                    text: submitButtonText,
                    type: ButtonType.Emphasized,
                    press: () => {
                        if (isReadOnlyHost && submitButtonText === "Close") {
                            submittedOrCancelled = true;
                            this.host.fireEvent("cancel");
                            dialog.close();
                            return;
                        }
                        try {
                            const success = this.host.triggerSubmit();
                            if (success) {
                                submittedOrCancelled = true;
                                wasSubmitted = true;
                                dialog.close();
                            }
                        } catch (err) {
                            const errMsg = (err as Error).message;
                            Logger.error(
                                "[MetaUI] Catastrophic error during validation/submit pipeline",
                                errMsg,
                                "DialogDelegate"
                            );
                            this.host.fireEvent("validationError", { fieldPath: "root", message: errMsg });
                        }
                    }
                }),
                endButton:
                    isReadOnlyHost && submitButtonText === "Close"
                        ? undefined
                        : new Button({
                              text: cancelButtonText,
                              press: () => {
                                  submittedOrCancelled = true;
                                  this.host.revertUncommittedChanges?.();
                                  this.host.fireEvent("cancel");
                                  dialog.close();
                              }
                          }),
                afterClose: () => {
                    if (!submittedOrCancelled) {
                        this.host.revertUncommittedChanges?.();
                        this.host.fireEvent("cancel");
                    } else if (!wasSubmitted) {
                        this.host.revertUncommittedChanges?.();
                    }
                    this.activeDialog = null;
                    this.pendingOrigin = null;
                    const res = this.pendingResolve;
                    this.pendingResolve = null;
                    // Detach host from the dialog before destroying the dialog so the host is never destroyed with it.
                    dialog.removeContent(this.host);
                    this.restoreToOrigin(origin);
                    dialog.destroy();
                    res?.();
                }
            });

            this.activeDialog = dialog;

            const origDialogInvalidate = dialog.invalidate.bind(dialog);
            dialog.invalidate = (oOrigin?: ManagedObject): void => {
                if (dialog.isOpen()) {
                    origDialogInvalidate(oOrigin);
                }
            };

            const dependentOwner = parentView || (origin?.parent as Control | undefined);
            if (dependentOwner && typeof dependentOwner.addAggregation === "function") {
                dependentOwner.addAggregation("dependents", dialog, true);
            } else if (dependentOwner && typeof dependentOwner.addDependent === "function") {
                dependentOwner.addDependent(dialog);
            }

            dialog.open();
        });
    }

    /**
     * Allows the Engine to retroactively calculate and expand the dialog once the schema is fully parsed.
     */
    public calculateAndApplyOptimalWidth(schema: ISchema | null): void {
        const optimalWidth = this.calculateOptimalDialogWidth(schema);
        this.calculatedOptimalWidth = optimalWidth;
        if (this.activeDialog && this.requestedWidth === "auto" && optimalWidth !== "auto") {
            this.activeDialog.setContentWidth(optimalWidth);
        }
    }

    /**
     * Heuristically calculates optimal dialog width based on schema content.
     */
    private calculateOptimalDialogWidth(schema: ISchema | null): string {
        if (!schema) return "auto";
        let requiresWideDialog = false;
        const visited = new WeakSet<object>();

        const scanProperties = (props: Record<string, IPropertyMetadata>) => {
            if (requiresWideDialog) return;
            if (visited.has(props)) return;
            visited.add(props);

            for (const key of Object.keys(props)) {
                const prop = props[key];
                if (!prop || typeof prop !== "object") continue;

                if (prop.type === SCHEMA_TYPE.ARRAY) {
                    requiresWideDialog = true;
                    return;
                }
                if (prop.ui?.fullWidth === true) {
                    requiresWideDialog = true;
                    return;
                }
                if (
                    prop.ui?.widget === WIDGET_TYPE.CODE_EDITOR ||
                    prop.ui?.widget === WIDGET_TYPE.TEXT_AREA ||
                    prop.ui?.widget === WIDGET_TYPE.RICH_TEXT
                ) {
                    requiresWideDialog = true;
                    return;
                }
                if (prop.properties) scanProperties(prop.properties);
                if (prop.items && prop.items.properties) scanProperties(prop.items.properties);
            }

            visited.delete(props);
        };

        if (schema.type === SCHEMA_TYPE.ARRAY) return "80vw";
        if (schema.properties) {
            scanProperties(schema.properties);
        }

        return requiresWideDialog ? "80vw" : "auto";
    }

    /**
     * Closes and destroys any active popup dialog when the owning host exits,
     * restoring origin placement and settling any pending `openInDialog` promise.
     */
    public destroy(): void {
        if (this.activeDialog) {
            const dlg = this.activeDialog;
            this.activeDialog = null;
            const origin = this.pendingOrigin;
            this.pendingOrigin = null;
            const res = this.pendingResolve;
            this.pendingResolve = null;
            dlg.removeContent(this.host);
            this.restoreToOrigin(origin);
            dlg.destroy();
            res?.();
        }
    }
}
