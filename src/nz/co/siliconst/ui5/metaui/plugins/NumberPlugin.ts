/**
 * @file NumberPlugin.ts
 * @description Renders a sap.m.StepInput for numeric data.
 */

import { BasePlugin } from "./BasePlugin";
import { IFieldMetadata } from "../interfaces/ISchema";
import StepInput from "sap/m/StepInput";
import Control from "sap/ui/core/Control";

/**
 * Handles rendering and logic for numeric inputs with precision and scale.
 */
export class NumberPlugin extends BasePlugin {
    public render(fieldMetadata: IFieldMetadata, bindingPath: string): Control {
        this.metadata = fieldMetadata;
        
        this.control = new StepInput({
            value: `{meta>${bindingPath}}`,
            displayValuePrecision: fieldMetadata.scale || 0,
            editable: !fieldMetadata.isReadOnly,
            required: fieldMetadata.isRequired,
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

        if (this.metadata.isRequired && (val === null || val === undefined)) {
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
            input.setEditable(!this.metadata.isReadOnly);
            input.setRequired(this.metadata.isRequired);
        }
    }
}
