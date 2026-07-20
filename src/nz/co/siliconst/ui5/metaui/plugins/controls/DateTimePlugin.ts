/**
 * @file DateTimePlugin.ts
 * @description Handles rendering logic for DateTime strings (timestamps).
 */

import { BasePlugin } from "./BasePlugin";
import { IPropertyMetadata } from "../../interfaces/ISchema";
import DateTimePicker from "sap/m/DateTimePicker";
import Control from "sap/ui/core/Control";
import TextControl from "sap/m/Text";

/**
 * Handles rendering and logic for timestamps/datetime inputs.
 */
export class DateTimePlugin extends BasePlugin {
    /**
     * Renders a `sap.m.DateTimePicker` component.
     * 
     * @param fieldMetadata The specific JSON schema properties for this field.
     * @param bindingPath The JSON path bound to this control.
     * @param modelName The UI5 JSONModel name.
     * @param engineScopeId The deterministic scope ID.
     * @param onChange The callback fired on value change.
     * @returns {Control} The configured DateTimePicker control.
     */
    public render(fieldMetadata: IPropertyMetadata,  bindingPath: string,  modelName: string = "meta", engineScopeId?: string, onChange?: (isValid: boolean, fieldKey?: string) => void): Control {
        this.onChange = onChange;
        this.metadata = fieldMetadata;
        
        if (!this.isEditable) {
            
            this.control = new TextControl({
                id: this.generateStableId(engineScopeId, bindingPath),
                text: {
                    path: `${modelName}>${bindingPath}`,
                    type: "sap.ui.model.type.DateTime",
                    formatOptions: {
                        source: { pattern: "yyyy-MM-dd'T'HH:mm:ss'Z'" },
                        pattern: "yyyy-MM-dd'T'HH:mm:ss'Z'"
                    }
                }
            });
            this.applyCommonDirectives(this.control, fieldMetadata, modelName);
            return this.control as Control;
        }

        this.control = new DateTimePicker({
            id: this.generateStableId(engineScopeId, bindingPath),
            value: {
                path: `${modelName}>${bindingPath}`,
                type: "sap.ui.model.type.DateTime",
                formatOptions: {
                    source: { pattern: "yyyy-MM-dd'T'HH:mm:ss'Z'" },
                    pattern: "yyyy-MM-dd'T'HH:mm:ss'Z'"
                }
            },
            editable: !fieldMetadata.ui?.readOnly,
            required: fieldMetadata.required,
            change: (oEvent: sap.ui.base.Event) => {
                const val = oEvent.getParameter("value");
                const result = this.validate();
                if (this.onChange) {
                    this.onChange(result.isValid, this.fieldKey);
                }
            }
        });

        this.applyCommonDirectives(this.control, fieldMetadata, modelName);

        return this.control as Control;
    }

    /**
     * Retrieves the current datetime string.
     * @returns {unknown} The datetime value.
     */
    protected getValue(): unknown {
        return this.control ? (this.control as DateTimePicker).getValue() : null;
    }

    /**
     * Applies dynamic read-only state.
     */
    protected applyState(): void {
        if (this.control && this.metadata) {
            if (!this.isEditable) return;
            const input = this.control as DateTimePicker;
            input.setEditable(!this.metadata.ui?.readOnly);
            input.setRequired(this.metadata.required);
        }
    }
}
