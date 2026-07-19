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
    public render(fieldMetadata: IPropertyMetadata,  bindingPath: string,  modelName: string = "meta", engineScopeId?: string): Control {
        this.metadata = fieldMetadata;
        
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
            change: (oEvent: any) => {
                const val = oEvent.getParameter("value");
                this.validate();
            }
        });

        return this.control as Control;
    }

    protected getValue(): any {
        return this.control ? (this.control as DatePicker).getValue() : null;
    }

    protected applyState(): void {
        if (this.control && this.metadata) {
            const dp = this.control as DatePicker;
            dp.setEditable(!this.metadata.ui?.readOnly);
            dp.setRequired(this.metadata.required);
        }
    }
}
