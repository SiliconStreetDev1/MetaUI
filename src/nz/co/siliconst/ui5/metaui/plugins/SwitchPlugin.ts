/**
 * @file SwitchPlugin.ts
 * @description Renders a sap.m.Switch for boolean data specifically marked with the switch widget.
 */

import { BasePlugin } from "./BasePlugin";
import { IPropertyMetadata } from "../interfaces/ISchema";
import Switch from "sap/m/Switch";
import Control from "sap/ui/core/Control";

/**
 * Handles rendering logic for toggleable boolean switches.
 */
export class SwitchPlugin extends BasePlugin {
    public render(fieldMetadata: IPropertyMetadata, bindingPath: string, modelName: string = "meta"): Control {
        this.metadata = fieldMetadata;

        this.control = new Switch({
            state: `{${modelName}>${bindingPath}}`,
            enabled: !fieldMetadata.ui?.readOnly,
            change: (oEvent: any) => {
                const val = oEvent.getParameter("state");
                this.publishChange(val);
                this.validate();
            }
        });

        return this.control;
    }

    public validate(): boolean {
        // Boolean states rarely fail validation.
        return true;
    }

    protected applyState(): void {
        if (this.control && this.metadata) {
            const sw = this.control as Switch;
            sw.setEnabled(!this.metadata.ui?.readOnly);
        }
    }
}
