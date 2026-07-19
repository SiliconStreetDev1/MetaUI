/**
 * @file NumberPlugin.ts
 * @description Renders a sap.m.StepInput for numeric data.
 */

import { BasePlugin } from "./BasePlugin";
import { IPropertyMetadata } from "../../interfaces/ISchema";
import StepInput from "sap/m/StepInput";
import Control from "sap/ui/core/Control";

/**
 * Handles rendering and logic for numeric inputs.
 */
export class NumberPlugin extends BasePlugin {
    public render(fieldMetadata: IPropertyMetadata,  bindingPath: string,  modelName: string = "meta", engineScopeId?: string): Control {
        this.metadata = fieldMetadata;

        this.control = new StepInput({
            id: this.generateStableId(engineScopeId, bindingPath),
            value: `{${modelName}>${bindingPath}}`,
            displayValuePrecision: fieldMetadata.scale || 0,
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
        return this.control ? (this.control as StepInput).getValue() : null;
    }

    protected applyState(): void {
        if (this.control && this.metadata) {
            const input = this.control as StepInput;
            input.setEditable(!this.metadata.ui?.readOnly);
            input.setRequired(this.metadata.required);
        }
    }
}
