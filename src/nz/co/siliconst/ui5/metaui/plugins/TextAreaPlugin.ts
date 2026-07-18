/**
 * @file TextAreaPlugin.ts
 * @description Renders a sap.m.TextArea for string data specifically marked with the textArea widget.
 */

import { BasePlugin } from "./BasePlugin";
import { IPropertyMetadata } from "../interfaces/ISchema";
import TextArea from "sap/m/TextArea";
import Control from "sap/ui/core/Control";

/**
 * Handles rendering and logic for multi-line text areas.
 */
export class TextAreaPlugin extends BasePlugin {
    public render(fieldMetadata: IPropertyMetadata, bindingPath: string, modelName: string = "meta"): Control {
        this.metadata = fieldMetadata;
        this.fieldKey = bindingPath.replace("/", ""); // For EventBus
        
        this.control = new TextArea({
            value: `{${modelName}>${bindingPath}}`,
            maxLength: fieldMetadata.maxLength || 0,
            required: !!fieldMetadata.required,
            rows: fieldMetadata.ui?.rows || 4, // Default to 4 rows for text areas
            change: (oEvent: any) => {
                const val = oEvent.getParameter("value");
                this.publishChange(val);
                this.validate();
            }
        });

        this.applyCommonDirectives(this.control, fieldMetadata, modelName);

        return this.control;
    }

    public validate(): boolean {
        if (!this.control || !this.metadata) return true;
        const input = this.control as TextArea;
        const val = input.getValue();

        if (this.metadata.required && (!val || typeof val !== 'string' || val.trim() === "")) {
            input.setValueState("Error" as any);
            input.setValueStateText("This field is required.");
            return false;
        }

        input.setValueState("None" as any);
        return true;
    }

    protected applyState(): void {
        if (this.control && this.metadata) {
            const input = this.control as TextArea;
            input.setEditable(!this.metadata.ui?.readOnly);
            input.setRequired(this.metadata.required);
        }
    }
}
