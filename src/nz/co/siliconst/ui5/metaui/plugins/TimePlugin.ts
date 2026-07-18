/**
 * @file TimePlugin.ts
 * @description Handles rendering logic for Time strings.
 */

import { BasePlugin } from "./BasePlugin";
import { IPropertyMetadata } from "../interfaces/ISchema";
import TimePicker from "sap/m/TimePicker";
import Control from "sap/ui/core/Control";

/**
 * Handles rendering and logic for time inputs.
 */
export class TimePlugin extends BasePlugin {
    public render(fieldMetadata: IPropertyMetadata, bindingPath: string, modelName: string = "meta"): Control {
        this.metadata = fieldMetadata;
        
        this.control = new TimePicker({
            value: {
                path: `${modelName}>${bindingPath}`,
                type: "sap.ui.model.type.Time",
                formatOptions: {
                    source: { pattern: "HH:mm:ss" },
                    pattern: "HH:mm:ss"
                }
            },
            displayFormat: "HH:mm:ss",
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
        const input = this.control as TimePicker;
        const isValid = typeof input.isValidValue === "function" ? input.isValidValue() : true;
        const val = input.getValue();
        const coreLibrary = sap.ui.require("sap/ui/core/library");
        const ValueState = coreLibrary ? coreLibrary.ValueState : { Error: "Error", None: "None" };

        if (this.metadata.required && (!val || typeof val !== 'string' || val.trim() === "")) {
            input.setValueState(ValueState.Error);
            input.setValueStateText("This field is required.");
            return false;
        }

        if (val && !isValid) {
            input.setValueState(ValueState.Error);
            input.setValueStateText("Invalid time format.");
            return false;
        }

        input.setValueState(ValueState.None);
        return true;
    }

    protected applyState(): void {
        if (this.control && this.metadata) {
            const input = this.control as TimePicker;
            input.setEditable(!this.metadata.ui?.readOnly);
            input.setRequired(this.metadata.required);
        }
    }
}
