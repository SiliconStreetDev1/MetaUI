/**
 * @file TextAreaPlugin.ts
 * @description Renders a sap.m.TextArea for string data specifically marked with the textArea widget.
 */

import { BasePlugin } from "./BasePlugin";
import { IPropertyMetadata } from "../../interfaces/ISchema";
import TextArea from "sap/m/TextArea";
import Control from "sap/ui/core/Control";

/**
 * Handles rendering and logic for multi-line text areas.
 */
export class TextAreaPlugin extends BasePlugin {
    public render(fieldMetadata: IPropertyMetadata,  bindingPath: string,  modelName: string = "meta", engineScopeId?: string): Control {
        this.metadata = fieldMetadata;
        this.fieldKey = bindingPath.replace("/", ""); // For EventBus
        
        this.control = new TextArea({
            id: this.generateStableId(engineScopeId, bindingPath),
            value: `{${modelName}>${bindingPath}}`,
            maxLength: fieldMetadata.maxLength || 0,
            required: !!fieldMetadata.required,
            rows: fieldMetadata.ui?.rows || 4, // Default to 4 rows for text areas
            change: (oEvent: any) => {
                const val = oEvent.getParameter("value");
                this.validate();
            }
        });

        this.applyCommonDirectives(this.control, fieldMetadata, modelName);

        return this.control as Control;
    }

    protected getValue(): any {
        return this.control ? (this.control as TextArea).getValue() : null;
    }

    protected applyState(): void {
        if (this.control && this.metadata) {
            const input = this.control as TextArea;
            input.setEditable(!this.metadata.ui?.readOnly);
            input.setRequired(this.metadata.required);
        }
    }
}
