/**
 * @file DatePlugin.ts
 * @description Renders a sap.m.DatePicker natively bound to ISO date strings.
 */

import { BasePlugin } from "./BasePlugin";
import { IPropertyMetadata } from "../../interfaces/ISchema";
import DatePicker from "sap/m/DatePicker";
import Control from "sap/ui/core/Control";

/**
 * Handles rendering logic for Date strings.
 */
export class DatePlugin extends BasePlugin {
    public render(fieldMetadata: IPropertyMetadata,  bindingPath: string,  modelName: string = "meta", engineScopeId?: string, onChange?: (isValid: boolean, fieldKey?: string) => void): Control {
        this.onChange = onChange;
        this.metadata = fieldMetadata;
        
        if (this.isDisplayMode) {
            sap.ui.requireSync("sap/m/Text");
            const TextControl = sap.ui.require("sap/m/Text");
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
                const result = this.validate();
                if (this.onChange) {
                    this.onChange(result.isValid, this.fieldKey);
                }
            }
        });

        return this.control as Control;
    }

    protected getValue(): any {
        return this.control ? (this.control as DatePicker).getValue() : null;
    }

    protected applyState(): void {
        if (this.control && this.metadata) {
            if (this.isDisplayMode) return;
            const dp = this.control as DatePicker;
            dp.setEditable(!this.metadata.ui?.readOnly);
            dp.setRequired(this.metadata.required);
        }
    }
}
