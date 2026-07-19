/**
 * @file DateTimePlugin.ts
 * @description Handles rendering logic for DateTime strings (timestamps).
 */

import { BasePlugin } from "./BasePlugin";
import { IPropertyMetadata } from "../../interfaces/ISchema";
import DateTimePicker from "sap/m/DateTimePicker";
import Control from "sap/ui/core/Control";

/**
 * Handles rendering and logic for timestamps/datetime inputs.
 */
export class DateTimePlugin extends BasePlugin {
    public render(fieldMetadata: IPropertyMetadata,  bindingPath: string,  modelName: string = "meta", engineScopeId?: string): Control {
        this.metadata = fieldMetadata;
        
        this.control = new DateTimePicker({
            id: this.generateStableId(engineScopeId, bindingPath),
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
                this.validate();
            }
        });

        return this.control as Control;
    }

    protected getValue(): any {
        return this.control ? (this.control as DateTimePicker).getValue() : null;
    }

    protected applyState(): void {
        if (this.control && this.metadata) {
            const input = this.control as DateTimePicker;
            input.setEditable(!this.metadata.ui?.readOnly);
            input.setRequired(this.metadata.required);
        }
    }
}
