/**
 * @file DateTimePlugin.ts
 * @description Handles rendering logic for DateTime strings (timestamps).
 */

import { BasePlugin } from "./BasePlugin";
import { IPropertyMetadata } from "../interfaces/ISchema";
import DateTimePicker from "sap/m/DateTimePicker";
import Control from "sap/ui/core/Control";

/**
 * Handles rendering and logic for timestamps/datetime inputs.
 */
export class DateTimePlugin extends BasePlugin {
    public render(fieldMetadata: IPropertyMetadata, bindingPath: string, modelName: string = "meta"): Control {
        this.metadata = fieldMetadata;
        
        this.control = new DateTimePicker({
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
        const input = this.control as DateTimePicker;
        const isValid = typeof input.isValidValue === "function" ? input.isValidValue() : true;
        const val = input.getValue();

        if (this.metadata.required && (!val || typeof val !== 'string' || val.trim() === "")) {
            input.setValueState("Error" as any);
            input.setValueStateText("This field is required.");
            return false;
        }

        if (val && !isValid) {
            input.setValueState("Error" as any);
            input.setValueStateText("Invalid datetime format.");
            return false;
        }

        input.setValueState("None" as any);
        return true;
    }

    protected applyState(): void {
        if (this.control && this.metadata) {
            const input = this.control as DateTimePicker;
            input.setEditable(!this.metadata.ui?.readOnly);
            input.setRequired(this.metadata.required);
        }
    }
}
