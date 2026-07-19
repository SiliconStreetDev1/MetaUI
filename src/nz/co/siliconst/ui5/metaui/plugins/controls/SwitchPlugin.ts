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
    public render(fieldMetadata: IPropertyMetadata,  bindingPath: string,  modelName: string = "meta", engineScopeId?: string): Control {
        this.metadata = fieldMetadata;

        this.control = new Switch({
            id: this.generateStableId(engineScopeId, bindingPath),
            state: `{${modelName}>${bindingPath}}`,
            enabled: !fieldMetadata.ui?.readOnly,
            change: (oEvent: any) => {
                const val = oEvent.getParameter("state");
                this.validate();
            }
        });

        return this.control as Control;
    }

    protected getValue(): any {
        return this.control ? (this.control as Switch).getState() : false;
    }

    protected applyState(): void {
        if (this.control && this.metadata) {
            const sw = this.control as Switch;
            sw.setEnabled(!this.metadata.ui?.readOnly);
        }
    }
}
