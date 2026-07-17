/**
 * @file BooleanPlugin.ts
 * @description Renders a sap.m.Switch for boolean states.
 */

import { BasePlugin } from "./BasePlugin";
import { IFieldMetadata } from "../interfaces/ISchema";
import Switch from "sap/m/Switch";
import Control from "sap/ui/core/Control";

/**
 * Handles rendering logic for toggleable booleans.
 */
export class BooleanPlugin extends BasePlugin {
    public render(fieldMetadata: IFieldMetadata, bindingPath: string): Control {
        this.metadata = fieldMetadata;
        
        this.control = new Switch({
            state: `{meta>${bindingPath}}`,
            enabled: !fieldMetadata.isReadOnly,
            change: (oEvent: any) => {
                const val = oEvent.getParameter("state");
                this.publishChange(val);
                this.validate();
            }
        });

        return this.control;
    }

    public validate(): boolean {
        // Boolean switches inherently have a state (true/false) so they rarely fail validation.
        return true;
    }

    protected applyState(): void {
        if (this.control && this.metadata) {
            const sw = this.control as Switch;
            sw.setEnabled(!this.metadata.isReadOnly);
        }
    }
}
