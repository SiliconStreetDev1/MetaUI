/**
 * @file NumberPlugin.ts
 * @description Renders a sap.m.StepInput for numeric data.
 */

import { BasePlugin } from "./BasePlugin";
import { IPropertyMetadata } from "../../interfaces/ISchema";
import StepInput from "sap/m/StepInput";
import Control from "sap/ui/core/Control";
import TextControl from "sap/m/Text";

/**
 * Handles rendering and logic for numeric inputs.
 */
export class NumberPlugin extends BasePlugin {
    /**
     * Renders a `sap.m.StepInput` component for numeric evaluation.
     * 
     * @param fieldMetadata The specific JSON schema properties for this field.
     * @param bindingPath The JSON path bound to this control.
     * @param modelName The UI5 JSONModel name.
     * @param engineScopeId The deterministic scope ID.
     * @param onChange The callback fired on value change.
     * @returns {Control} The configured StepInput control.
     */
    public render(fieldMetadata: IPropertyMetadata,  bindingPath: string,  modelName: string = "meta", engineScopeId?: string, onChange?: (isValid: boolean, fieldKey?: string) => void): Control {
        this.onChange = onChange;
        this.metadata = fieldMetadata;

        if (!this.isEditable) {
            
            this.control = new TextControl({
                id: this.generateStableId(engineScopeId, bindingPath),
                text: `{${modelName}>${bindingPath}}`
            });
            this.applyCommonDirectives(this.control, fieldMetadata, modelName);
            return this.control as Control;
        }

        this.control = new StepInput({
            id: this.generateStableId(engineScopeId, bindingPath),
            value: `{${modelName}>${bindingPath}}`,
            displayValuePrecision: fieldMetadata.scale !== undefined ? fieldMetadata.scale : (fieldMetadata.type === "integer" ? 0 : 3),
            editable: !fieldMetadata.ui?.readOnly,
            required: fieldMetadata.required,
            change: (oEvent: sap.ui.base.Event) => {
                const val = oEvent.getParameter("value");
                const result = this.validateAndApplyVisualState();
                if (this.onChange) {
                    this.onChange(result.isValid, this.fieldKey);
                }
            }
        });

        this.applyCommonDirectives(this.control, fieldMetadata, modelName);

        return this.control as Control;
    }

    /**
     * Retrieves the current numeric state.
     * @returns {unknown} The numeric value.
     */
    protected getValue(): unknown {
        return this.control ? (this.control as StepInput).getValue() : null;
    }

    /**
     * Applies dynamic read-only state.
     */
    protected applyState(): void {
        if (this.control && this.metadata) {
            if (!this.isEditable) return;
            const input = this.control as StepInput;
            input.setEditable(!this.metadata.ui?.readOnly);
            input.setRequired(this.metadata.required);
        }
    }
}
