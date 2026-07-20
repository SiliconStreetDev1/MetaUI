/**
 * @file SwitchPlugin.ts
 * @description Renders a sap.m.Switch for boolean data specifically marked with the switch widget.
 */

import { BasePlugin } from "./BasePlugin";
import { IPropertyMetadata } from "../../interfaces/ISchema";
import Switch from "sap/m/Switch";
import Control from "sap/ui/core/Control";

/**
 * Handles rendering logic for toggleable boolean switches.
 */
export class SwitchPlugin extends BasePlugin {
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
            change: (oEvent: unknown) => {
                const val = (oEvent as { getParameter: (s: string) => unknown }).getParameter("state");
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
        return this.control ? (this.control as Switch).getState() : false;
    }

    protected applyState(): void {
        if (this.control && this.metadata) {
            if (this.isDisplayMode) return;
            const sw = this.control as Switch;
            sw.setEnabled(!this.metadata.ui?.readOnly);
        }
    }
}
