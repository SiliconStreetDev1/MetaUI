/**
 * @file StringPlugin.ts
 * @description Renders a sap.m.Input for string data and validates lengths.
 */

import { BasePlugin } from "./BasePlugin";
import { IFieldMetadata } from "../interfaces/ISchema";
import Input from "sap/m/Input";
import Control from "sap/ui/core/Control";

/**
 * Handles rendering and logic for basic text inputs.
 */
export class StringPlugin extends BasePlugin {
    public render(fieldMetadata: IFieldMetadata, bindingPath: string): Control {
        this.metadata = fieldMetadata;
        
        this.control = new Input({
            value: `{meta>${bindingPath}}`,
            maxLength: fieldMetadata.maxLength || 0,
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
        const input = this.control as Input;
        const val = input.getValue();

        if (this.metadata.isRequired && (!val || val.trim() === "")) {
            input.setValueState("Error" as any);
            input.setValueStateText("This field is required.");
            return false;
        }

        input.setValueState("None" as any);
        return true;
    }

    protected applyState(): void {
        if (this.control && this.metadata) {
            const input = this.control as Input;
            input.setEditable(!this.metadata.isReadOnly);
            input.setRequired(this.metadata.isRequired);
        }
    }
}
