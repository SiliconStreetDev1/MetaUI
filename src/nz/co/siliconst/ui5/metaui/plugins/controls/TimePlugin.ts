/**
 * @file TimePlugin.ts
 * @description Handles rendering logic for Time strings.
 */

import { BasePlugin } from "./BasePlugin";
import { IPropertyMetadata } from "../../interfaces/ISchema";
import TimePicker from "sap/m/TimePicker";
import Control from "sap/ui/core/Control";

/**
 * Handles rendering and logic for time inputs.
 */
export class TimePlugin extends BasePlugin {
    public render(fieldMetadata: IPropertyMetadata,  bindingPath: string,  modelName: string = "meta", engineScopeId?: string): Control {
        this.metadata = fieldMetadata;
        
        this.control = new TimePicker({
            id: this.generateStableId(engineScopeId, bindingPath),
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
                this.validate();
            }
        });

        return this.control as Control;
    }

    protected getValue(): any {
        return this.control ? (this.control as TimePicker).getValue() : null;
    }

    protected applyState(): void {
        if (this.control && this.metadata) {
            const input = this.control as TimePicker;
            input.setEditable(!this.metadata.ui?.readOnly);
            input.setRequired(this.metadata.required);
        }
    }
}
