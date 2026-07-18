/**
 * @file DatePlugin.ts
 * @description Renders a sap.m.DatePicker natively bound to ISO date strings.
 */

import { BasePlugin } from "./BasePlugin";
import { IPropertyMetadata } from "../interfaces/ISchema";
import DatePicker from "sap/m/DatePicker";
import Control from "sap/ui/core/Control";

/**
 * Handles rendering logic for Date strings.
 */
export class DatePlugin extends BasePlugin {
    public render(fieldMetadata: IPropertyMetadata, bindingPath: string, modelName: string = "meta"): Control {
        this.metadata = fieldMetadata;
        
        this.control = new DatePicker({
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
                this.publishChange(val);
                this.validate();
            }
        });

        return this.control;
    }

    public validate(): boolean {
        if (!this.control || !this.metadata) return true;
        const dp = this.control as DatePicker;
        const isValid = typeof dp.isValidValue === "function" ? dp.isValidValue() : true;
        const val = dp.getValue();

        if (this.metadata.required && (!val || typeof val !== 'string' || val.trim() === "")) {
            dp.setValueState("Error" as any);
            dp.setValueStateText("A valid date is required.");
            return false;
        }

        if (val && !isValid) {
            dp.setValueState("Error" as any);
            dp.setValueStateText("Invalid date format.");
            return false;
        }

        dp.setValueState("None" as any);
        return true;
    }

    protected applyState(): void {
        if (this.control && this.metadata) {
            const dp = this.control as DatePicker;
            dp.setEditable(!this.metadata.ui?.readOnly);
            dp.setRequired(this.metadata.required);
        }
    }
}
