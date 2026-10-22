/**
 * @file NestedDialogPlugin.ts
 * @description Shared abstract base class for nested modal dialog button plugins (ObjectPlugin, ArrayPlugin, ReferencePlugin).
 */

import { BasePlugin } from "./BasePlugin";
import { IPropertyMetadata, ISchema } from "../../interfaces/ISchema";
import Button from "sap/m/Button";
import { ButtonType } from "sap/m/library";
import Control from "sap/ui/core/Control";
import JSONModel from "sap/ui/model/json/JSONModel";
import Event from "sap/ui/base/Event";
import { PayloadValidator } from "../../core/PayloadValidator";

/**
 * Resolved sub-schema and modal dialog configuration for a nested dialog launch.
 *
 * @namespace nz.co.siliconst.ui5.metaui.plugins.controls
 * @public
 */
export interface INestedDialogDescriptor {
    title: string;
    subSchema: ISchema;
    isArrayRoot: boolean;
}

/**
 * Shared abstract base class for `ObjectPlugin`, `ArrayPlugin`, and `ReferencePlugin`.
 * Consolidates trigger `Button` rendering, modal `DynamicHost` dialog launching, recursive `PayloadValidator`
 * validation, model value lookup, visual `ButtonType.Reject` error state, and `applyState`.
 *
 * @namespace nz.co.siliconst.ui5.metaui.plugins.controls
 * @public
 */
export abstract class NestedDialogPlugin extends BasePlugin {
    protected abstract readonly defaultErrorTooltip: string;
    protected abstract readonly emptyFallbackValue: unknown;

    /**
     * Resolves the default label for the trigger button when `metadata.ui.label` is omitted.
     *
     * @param metadata The property metadata.
     * @returns {string} The button label stem.
     */
    protected abstract getDefaultLabel(metadata: IPropertyMetadata): string;

    /**
     * Resolves the SAP icon URI for the trigger button based on current editability.
     *
     * @param canEdit True if the control is currently editable.
     * @returns {string} The SAP icon URI.
     */
    protected abstract getButtonIcon(canEdit: boolean): string;

    /**
     * Builds the modal `ISchema` descriptor and dialog title for the nested `DynamicHost`.
     *
     * @param metadata The property metadata.
     * @returns {INestedDialogDescriptor | null} The resolved dialog descriptor, or `null` to abort opening.
     */
    protected abstract buildDialogDescriptor(metadata: IPropertyMetadata): INestedDialogDescriptor | null;

    /**
     * Coerces the current raw model value before passing it into the nested `DynamicHost`.
     *
     * @param rawCurrent The raw value read from the parent `JSONModel`.
     * @returns {unknown} The normalized initial payload for the nested editor.
     */
    protected coerceCurrentData(rawCurrent: unknown): unknown {
        return rawCurrent;
    }

    /**
     * Coerces the extracted payload returned by the nested `DynamicHost` before writing back to the parent `JSONModel`.
     *
     * @param extractedData The payload emitted by the nested `DynamicHost`.
     * @returns {unknown} The coerced payload to persist.
     */
    protected coerceSavedData(extractedData: unknown): unknown {
        return extractedData;
    }

    /**
     * Renders a `sap.m.Button` that opens a nested `DynamicHost` dialog when pressed.
     *
     * @param metadata The specific JSON schema properties for this field.
     * @param bindingPath The JSON path bound to this control.
     * @param modelName The UI5 JSONModel name.
     * @param engineScopeId The deterministic scope ID.
     * @param onChange The callback fired on value change.
     * @returns {Control} The configured Button control.
     */
    public render(
        metadata: IPropertyMetadata,
        bindingPath: string,
        modelName: string = "meta",
        engineScopeId?: string,
        onChange?: (isValid: boolean, fieldKey?: string, errorMessage?: string, controlId?: string) => void
    ): Control {
        this.initialize(metadata, bindingPath, modelName, onChange);

        const label = this.getDefaultLabel(metadata);
        const canEdit = this.isControlEditable();
        const btnText = metadata.ui?.dialogButtonText || (canEdit ? `Edit ${label}` : `View ${label}`);
        const textBinding =
            !this.isEditable && !metadata.ui?.dialogButtonText
                ? this.generateBindingInfo(bindingPath, modelName, undefined, {
                      formatter: (val: unknown) => {
                          if (Array.isArray(val)) {
                              return `View ${label} (${val.length})`;
                          }
                          if (val && typeof val === "object") {
                              const summary = Object.values(val as Record<string, unknown>).join(", ");
                              return summary ? `View ${label} (${summary})` : `View ${label}`;
                          }
                          return `View ${label}`;
                      }
                  })
                : btnText;

        this.control = new Button({
            id: this.generateStableId(engineScopeId, bindingPath),
            text: textBinding as unknown as string,
            icon: this.getButtonIcon(canEdit),
            press: (oEvent: Event) => {
                this.openNestedDialog(oEvent.getSource() as Button, metadata);
            }
        });

        this.applyCommonDirectives(this.control, metadata, modelName);
        return this.control;
    }

    /**
     * Opens a modal `DynamicHost` dialog populated with the resolved sub-schema and current model data.
     *
     * @param btn The clicked `sap.m.Button` instance.
     * @param metadata The property metadata.
     */
    protected openNestedDialog(btn: Button, metadata: IPropertyMetadata): void {
        const descriptor = this.buildDialogDescriptor(metadata);
        if (!descriptor) {
            return;
        }

        const model = (btn.getModel(this.modelName) || this.engineContext?.getModel()) as JSONModel | undefined;
        if (!model) {
            return;
        }

        const absolutePath = this.resolveAbsolutePath(btn);
        const currentData = this.coerceCurrentData(model.getProperty(absolutePath));

        this.openNestedEditorDialog({
            title: descriptor.title,
            subSchema: descriptor.subSchema,
            currentData,
            definitions: this.engineContext?.getSchemaDefinitions(),
            editable: this.isControlEditable(),
            isArrayRoot: descriptor.isArrayRoot,
            onSave: (extractedData: unknown) => {
                model.setProperty(absolutePath, this.coerceSavedData(extractedData));
                this.notifyChange(btn.getId());
            }
        });
    }

    /**
     * Recursively validates the nested payload against its schema rules via `PayloadValidator`.
     *
     * @param sourceControl Optional cloned row control to validate when bound inside a `TableLayout`.
     * @returns {{ isValid: boolean; errorMessage?: string }} The validation outcome.
     */
    public override validate(sourceControl?: Control): { isValid: boolean; errorMessage?: string } {
        const target = sourceControl || this.control;
        if (!target || !this.metadata || !this.isTargetVisible(sourceControl)) {
            return { isValid: true };
        }
        return PayloadValidator.validateTree(
            this.metadata,
            this.getValue(target),
            (ref) => this.engineContext?.getSchemaDefinition(ref) ?? null
        );
    }

    /**
     * Retrieves the current nested payload from the bound `JSONModel`.
     *
     * @param sourceControl Optional cloned row control to read from when bound inside a `TableLayout`.
     * @returns {unknown} The nested data payload.
     */
    protected getValue(sourceControl?: Control): unknown {
        const target = sourceControl || this.control;
        if (!target) {
            return this.emptyFallbackValue;
        }
        const model = (target.getModel(this.modelName) || this.engineContext?.getModel()) as JSONModel | undefined;
        return model ? model.getProperty(this.resolveAbsolutePath(target)) : this.emptyFallbackValue;
    }

    /**
     * Reflects nested validation errors visually on the trigger `Button` via `ButtonType.Reject` and tooltip.
     *
     * @param isValid True if the nested payload is valid.
     * @param errorMessage Optional validation error message.
     */
    public override setVisualValidationState(isValid: boolean, errorMessage?: string): void {
        if (this.control instanceof Button) {
            this.control.setType(isValid ? ButtonType.Default : ButtonType.Reject);
            this.control.setTooltip(
                isValid ? this.metadata?.description || "" : errorMessage || this.defaultErrorTooltip
            );
        }
    }

    /**
     * Updates the trigger button text and icon when `isEditable` or `readOnly` state changes.
     */
    protected applyState(): void {
        if (this.control && this.metadata) {
            const btn = this.control as Button;
            const label = this.getDefaultLabel(this.metadata);
            const canEdit = this.isControlEditable();
            if (this.isEditable || this.metadata.ui?.dialogButtonText) {
                btn.setText(this.metadata.ui?.dialogButtonText || (canEdit ? `Edit ${label}` : `View ${label}`));
            }
            btn.setIcon(this.getButtonIcon(canEdit));
        }
    }
}
