/**
 * @file ClearFormActionPlugin.ts
 * @description Action plugin that renders a button to reset all fields in the current form model.
 */

import { BasePlugin } from "../controls/BasePlugin";
import { IPropertyMetadata } from "../../interfaces/ISchema";
import Button from "sap/m/Button";
import Control from "sap/ui/core/Control";
import JSONModel from "sap/ui/model/json/JSONModel";
import { ButtonType } from "sap/m/library";
import { isRecord } from "../../utils/TypeGuards";

/**
 * Plugin responsible for rendering a form reset button (`ui.widget = "clearButton"`).
 * Resets all properties in the bound `JSONModel` to empty defaults and notifies the Engine.
 *
 * @namespace nz.co.siliconst.ui5.metaui.plugins.actions
 * @public
 */
export class ClearFormActionPlugin extends BasePlugin {
    /**
     * Renders a `sap.m.Button` that clears the bound form data when pressed.
     *
     * @param metadata The specific JSON schema properties for this action field.
     * @param bindingPath The JSON path bound to this control.
     * @param modelName The UI5 JSONModel name.
     * @param engineScopeId The deterministic scope ID.
     * @param onChange The callback fired on value change.
     * @returns {Control} The configured Clear Button control.
     */
    public render(
        metadata: IPropertyMetadata,
        bindingPath: string,
        modelName: string = "meta",
        engineScopeId?: string,
        onChange?: (isValid: boolean, fieldKey?: string, errorMessage?: string, controlId?: string) => void
    ): Control {
        this.initialize(metadata, bindingPath, modelName, onChange);

        const fallbackLabel = metadata.ui?.label || "Clear Form";
        const textBinding = this.generateBindingInfo(bindingPath, modelName, undefined, {
            formatter: (val: unknown) => (typeof val === "string" && val.trim() ? val.trim() : fallbackLabel)
        });

        this.control = new Button({
            id: this.generateStableId(engineScopeId, bindingPath),
            text: textBinding as unknown as string,
            type: ButtonType.Default,
            icon: "sap-icon://clear-all",
            enabled: this.isControlEditable(),
            press: () => {
                this.clearFormModel();
            }
        });

        this.applyCommonDirectives(this.control, metadata, modelName);
        return this.control;
    }

    /**
     * Recursively resets a data value to its empty representation while preserving nested object keys.
     *
     * @param val The current property value.
     * @returns {unknown} The cleared value.
     */
    private clearDataValue(val: unknown): unknown {
        if (typeof val === "boolean") {
            return false;
        }
        if (typeof val === "number" || val === null) {
            return null;
        }
        if (Array.isArray(val)) {
            return [];
        }
        if (isRecord(val)) {
            const nested: Record<string, unknown> = {};
            for (const [childKey, childVal] of Object.entries(val)) {
                nested[childKey] = this.clearDataValue(childVal);
            }
            return nested;
        }
        return "";
    }

    /**
     * Resets all top-level and nested keys in the bound `JSONModel` to empty values (`""`, `false`, `null`, `[]`),
     * clears active validation errors, and triggers `notifyChange` so the Engine re-evaluates policies and state.
     */
    private clearFormModel(): void {
        if (!this.control) {
            return;
        }
        const model = (this.control.getModel(this.modelName) || this.engineContext?.getModel()) as
            | JSONModel
            | undefined;
        if (!model) {
            return;
        }

        const currentData = model.getData();
        if (isRecord(currentData)) {
            const cleared = this.clearDataValue(currentData) as Record<string, unknown>;
            this.engineContext?.clearValidationErrors?.();
            this.engineContext?.clearValidationPrefix?.("");
            model.setData(cleared);
            this.notifyChange();
        }
    }

    /**
     * Action buttons do not hold user data and never fail schema validation.
     * @returns {{ isValid: boolean; errorMessage?: string }} Always `{ isValid: true }`.
     */
    public override validate(): { isValid: boolean; errorMessage?: string } {
        return { isValid: true };
    }

    /**
     * Action buttons have no bound value.
     * @returns {unknown} Always `null`.
     */
    protected getValue(): unknown {
        return null;
    }

    /**
     * Updates the button's `enabled` state when `isEditable` or `readOnly` changes.
     */
    protected applyState(): void {
        if (this.control && this.metadata) {
            (this.control as Button).setEnabled(this.isControlEditable());
        }
    }
}
