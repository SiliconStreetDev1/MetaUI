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
import { I18n, TEXT_KEY } from "../../../utils/I18n";
import { ISchema } from "../../../interfaces/ISchema";
import { SchemaWalker } from "../../../core/SchemaWalker";
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
    private openRequestId: number = 0;

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
     * Detaches `this.host` from `dialog`, restores it to the location captured before the dialog opened and
     * settles any pending `openInDialog` promise. The dialog must never own the host's lifecycle, so this runs
     * on every teardown path: normal close, delegate destruction, and destruction of the dialog by its
     * `dependents` owner (for example when the owning view is destroyed during navigation).
     *
     * Safe to call repeatedly; it does nothing once the host has already left the dialog.
     *
     * @param dialog The dialog currently hosting the generated content.
     */
    private releaseHostFromDialog(dialog: Dialog): void {
        const content = typeof dialog.getContent === "function" ? dialog.getContent() : [];
        if (Array.isArray(content) && content.indexOf(this.host) > -1) {
            dialog.removeContent(this.host);
            this.restoreToOrigin(this.pendingOrigin);
        }
        if (this.activeDialog === dialog) {
            this.activeDialog = null;
        }
        this.pendingOrigin = null;
        const res = this.pendingResolve;
        this.pendingResolve = null;
        res?.();
    }

    /**
     * Dialog Modality: Opens the generated layout inside a `sap.m.Dialog`.
     * Automatically wires up customizable submit (default: `'OK'`) and `'Cancel'` buttons.
     *
     * Re-entrant: a call issued while an earlier one is still generating supersedes it, so a double-click on
     * an "Edit" button can never leave an orphaned modal behind.
     *
     * @returns {Promise<void>} Resolves once the dialog has closed, or immediately if superseded.
     */
    public async openInDialog(
        title: string = I18n.getText(TEXT_KEY.dialogDefaultTitle),
        submitButtonText: string = I18n.getText(TEXT_KEY.dialogSubmit),
        _isGenerated: boolean = false,
        cancelButtonText: string = I18n.getText(TEXT_KEY.dialogCancel),
        dialogWidth: string = "auto",
        parentView?: Control,
        extraButtons: Button[] = []
    ): Promise<void> {
        const requestId = ++this.openRequestId;
        this.destroy();
        this.requestedWidth = dialogWidth;
        this.calculatedOptimalWidth = dialogWidth;

        const busyDialog = new BusyDialog({ text: I18n.getText(TEXT_KEY.dialogBuilding) });
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

        if (requestId !== this.openRequestId) {
            Logger.warn(
                `openInDialog('${title}') was superseded by a later call while generating; no dialog was opened.`,
                undefined,
                "DialogDelegate"
            );
            return;
        }

        const finalWidth = this.requestedWidth === "auto" && this.calculatedOptimalWidth !== "auto"
            ? this.calculatedOptimalWidth
            : this.requestedWidth;

        const origin = this.captureOriginLocation();
        this.pendingOrigin = origin;
        const isReadOnlyHost = this.host.getProperty("editable") === false;
        const isCloseOnly =
            isReadOnlyHost &&
            (submitButtonText === "Close" || submitButtonText === I18n.getText(TEXT_KEY.editorClose));

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
                        if (isCloseOnly) {
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
                            this.host.fireEvent("validationError", { fieldPath: "", message: errMsg });
                        }
                    }
                }),
                endButton:
                    isCloseOnly
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
                    // Detach host from the dialog before destroying the dialog so the host is never destroyed with it.
                    this.releaseHostFromDialog(dialog);
                    dialog.destroy();
                }
            });

            this.activeDialog = dialog;

            if (extraButtons.length > 0) {
                // sap.m.Dialog ignores beginButton and endButton once its buttons aggregation is used, so the
                // standard buttons move there too, after the caller's own.
                const footer = [...extraButtons, dialog.getBeginButton(), dialog.getEndButton()];
                for (const button of footer) {
                    if (button) {
                        dialog.addButton(button);
                    }
                }
            }

            const origDialogInvalidate = dialog.invalidate.bind(dialog);
            dialog.invalidate = (oOrigin?: ManagedObject): void => {
                if (dialog.isOpen()) {
                    origDialogInvalidate(oOrigin);
                }
            };

            // The dialog lives in the owner's `dependents`; destroying that owner (e.g. on navigation) destroys
            // the dialog. Release the host first so it is never destroyed as part of the dialog's content.
            const origDialogDestroy = dialog.destroy.bind(dialog);
            dialog.destroy = (bSuppressInvalidate?: boolean): void => {
                this.releaseHostFromDialog(dialog);
                origDialogDestroy(bSuppressInvalidate);
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
        if (schema.type === SCHEMA_TYPE.ARRAY) return "80vw";
        let requiresWideDialog = false;

        SchemaWalker.walk(
            schema,
            (ctx) => {
                const prop = ctx.node;
                if (
                    prop.type === SCHEMA_TYPE.ARRAY ||
                    prop.ui?.fullWidth === true ||
                    prop.ui?.widget === WIDGET_TYPE.CODE_EDITOR ||
                    prop.ui?.widget === WIDGET_TYPE.TEXT_AREA ||
                    prop.ui?.widget === WIDGET_TYPE.RICH_TEXT
                ) {
                    requiresWideDialog = true;
                    return "stop";
                }
                return undefined;
            },
            { resolveRefs: false }
        );

        return requiresWideDialog ? "80vw" : "auto";
    }

    /**
     * Closes and destroys any active popup dialog when the owning host exits,
     * restoring origin placement and settling any pending `openInDialog` promise.
     */
    public destroy(): void {
        if (this.activeDialog) {
            const dlg = this.activeDialog;
            this.releaseHostFromDialog(dlg);
            dlg.destroy();
        }
    }
}
