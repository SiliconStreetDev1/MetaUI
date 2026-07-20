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
    public render(fieldMetadata: IPropertyMetadata,  bindingPath: string,  modelName: string = "meta", engineScopeId?: string, onChange?: (isValid: boolean, fieldKey?: string) => void): Control {
        this.onChange = onChange;
        this.metadata = fieldMetadata;
        
        if (this.isDisplayMode) {
            (sap.ui as unknown as { requireSync: (s: string) => unknown }).requireSync("sap/m/Text");
            const TextControl = sap.ui.require("sap/m/Text");
            this.control = new TextControl({
                id: this.generateStableId(engineScopeId, bindingPath),
                text: {
                    path: `${modelName}>${bindingPath}`,
                    type: "sap.ui.model.type.Time",
                    formatOptions: {
                        source: { pattern: "HH:mm:ss" },
                        pattern: "HH:mm:ss"
                    }
                }
            });
            this.applyCommonDirectives(this.control, fieldMetadata, modelName);
            return this.control as Control;
        }

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
            change: (oEvent: unknown) => {
                const val = (oEvent as { getParameter: (s: string) => unknown }).getParameter("value");
                const result = this.validate();
                if (this.onChange) {
                    this.onChange(result.isValid, this.fieldKey);
                }
            }
        });

        this.applyCommonDirectives(this.control, fieldMetadata, modelName);

        return this.control as Control;
    }

    protected getValue(): any {
        return this.control ? (this.control as TimePicker).getValue() : null;
    }

    protected applyState(): void {
        if (this.control && this.metadata) {
            if (this.isDisplayMode) return;
            const input = this.control as TimePicker;
            input.setEditable(!this.metadata.ui?.readOnly);
            input.setRequired(this.metadata.required);
        }
    }
}
