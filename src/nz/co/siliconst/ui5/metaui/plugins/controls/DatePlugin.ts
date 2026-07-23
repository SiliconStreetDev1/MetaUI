/**
 * @file DatePlugin.ts
 * @description Renders a sap.m.DatePicker natively bound to ISO date strings.
 */

import { BasePlugin } from "./BasePlugin";
import { IPropertyMetadata } from "../../interfaces/ISchema";
import DatePicker from "sap/m/DatePicker";
import Control from "sap/ui/core/Control";
import TextControl from "sap/m/Text";

/**
 * Handles rendering logic for Date strings.
 */
export class DatePlugin extends BasePlugin {
    /**
     * Renders a `sap.m.DatePicker` component.
     * 
     * @param fieldMetadata The specific JSON schema properties for this field.
     * @param bindingPath The JSON path bound to this control.
     * @param modelName The UI5 JSONModel name.
     * @param engineScopeId The deterministic scope ID.
     * @param onChange The callback fired on value change.
     * @returns {Control} The configured DatePicker control.
     */
    public render(fieldMetadata: IPropertyMetadata,  bindingPath: string,  modelName: string = "meta", engineScopeId?: string, onChange?: (isValid: boolean, fieldKey?: string) => void): Control {
        this.onChange = onChange;
        this.metadata = fieldMetadata;
        this.fieldKey = bindingPath.startsWith('/') ? bindingPath.substring(1) : bindingPath;
        
        if (!this.isEditable) {
            
            this.control = new TextControl({
                id: this.generateStableId(engineScopeId, bindingPath),
                text: {
                    path: `${modelName}>${bindingPath}`,
                    type: "sap.ui.model.type.Date",
                    formatOptions: {
                        source: { pattern: "yyyy-MM-dd" },
                        pattern: "yyyy-MM-dd"
                    }
                }
            });
            this.applyCommonDirectives(this.control, fieldMetadata, modelName);
            return this.control as Control;
        }

        this.control = new DatePicker({
            id: this.generateStableId(engineScopeId, bindingPath),
            value: {
                path: `${modelName}>${bindingPath}`,
                type: "sap.ui.model.type.Date",
                formatOptions: {
                    source: { pattern: "yyyy-MM-dd" },
                    pattern: "yyyy-MM-dd"
                }
            },
            displayFormat: "long",
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

        return this.control as Control;
    }

    /**
     * Retrieves the current date string.
     * @returns {unknown} The date value.
     */
    protected getValue(): unknown {
        return this.control ? (this.control as DatePicker).getValue() : null;
    }

    /**
     * Applies dynamic read-only state.
     */
    protected applyState(): void {
        if (this.control && this.metadata) {
            if (!this.isEditable) return;
            const dp = this.control as DatePicker;
            dp.setEditable(!this.metadata.ui?.readOnly);
            dp.setRequired(this.metadata.required);
        }
    }
}
