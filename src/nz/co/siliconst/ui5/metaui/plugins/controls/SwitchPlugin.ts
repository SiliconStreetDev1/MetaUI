/**
 * @file SwitchPlugin.ts
 * @description Renders a sap.m.Switch for boolean data specifically marked with the switch widget.
 */

import { BasePlugin } from "./BasePlugin";
import { IPropertyMetadata } from "../../interfaces/ISchema";
import Switch from "sap/m/Switch";
import Control from "sap/ui/core/Control";
import TextControl from "sap/m/Text";

/**
 * Handles rendering logic for toggleable boolean switches.
 */
export class SwitchPlugin extends BasePlugin {
    /**
     * Renders a `sap.m.Switch` component.
     * 
     * @param fieldMetadata The specific JSON schema properties for this field.
     * @param bindingPath The JSON path bound to this control.
     * @param modelName The UI5 JSONModel name.
     * @param engineScopeId The deterministic scope ID.
     * @param onChange The callback fired on value change.
     * @returns {Control} The configured Switch control.
     */
    public render(fieldMetadata: IPropertyMetadata,  bindingPath: string,  modelName: string = "meta", engineScopeId?: string, onChange?: (isValid: boolean, fieldKey?: string) => void): Control {
        this.onChange = onChange;
        this.metadata = fieldMetadata;

        if (!this.isEditable) {
            
            this.control = new TextControl({
                id: this.generateStableId(engineScopeId, bindingPath),
                text: {
                    path: `${modelName}>${bindingPath}`,
                    formatter: (val: boolean) => val ? "Yes" : "No"
                }
            });
            this.applyCommonDirectives(this.control, fieldMetadata, modelName);
            return this.control as Control;
        }

        this.control = new Switch({
            id: this.generateStableId(engineScopeId, bindingPath),
            state: `{${modelName}>${bindingPath}}`,
            enabled: !fieldMetadata.ui?.readOnly,
            change: (oEvent: sap.ui.base.Event) => {
                const val = (oEvent as sap.ui.base.Event).getParameter("state");
                const result = this.validate();
                if (this.onChange) {
                    this.onChange(result.isValid, this.fieldKey);
                }
            }
        });

        this.applyCommonDirectives(this.control, fieldMetadata, modelName);

        return this.control as Control;
    }

    /**
     * Retrieves the current switch state.
     * @returns {unknown} The boolean state.
     */
    protected getValue(): unknown {
        return this.control ? (this.control as Switch).getState() : false;
    }

    /**
     * Applies dynamic read-only state.
     */
    protected applyState(): void {
        if (this.control && this.metadata) {
            if (!this.isEditable) return;
            const sw = this.control as Switch;
            sw.setEnabled(!this.metadata.ui?.readOnly);
        }
    }
}
