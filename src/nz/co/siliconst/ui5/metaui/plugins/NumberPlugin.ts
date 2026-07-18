/**
 * @file NumberPlugin.ts
 * @description Renders a sap.m.StepInput for numeric data.
 */

import { BasePlugin } from "./BasePlugin";
import { IPropertyMetadata } from "../interfaces/ISchema";
import StepInput from "sap/m/StepInput";
import Control from "sap/ui/core/Control";

/**
 * Handles rendering and logic for numeric inputs.
 */
export class NumberPlugin extends BasePlugin {
    public render(fieldMetadata: IPropertyMetadata, bindingPath: string, modelName: string = "meta"): Control {
        this.metadata = fieldMetadata;

        this.control = new StepInput({
            value: `{${modelName}>${bindingPath}}`,
            displayValuePrecision: fieldMetadata.scale || 0,
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
        const input = this.control as StepInput;
        const val = input.getValue();

        // StepInput generally defaults to 0 and isn't usually undefined unless unbound or erased
        if (this.metadata.required && (val === null || val === undefined || Number.isNaN(val) || val === "")) {
            input.setValueState("Error" as any);
            input.setValueStateText("This field is required.");
            return false;
        }

        input.setValueState("None" as any);
        return true;
    }

    protected applyState(): void {
        if (this.control && this.metadata) {
            const input = this.control as StepInput;
            input.setEditable(!this.metadata.ui?.readOnly);
            input.setRequired(this.metadata.required);
        }
    }
}
