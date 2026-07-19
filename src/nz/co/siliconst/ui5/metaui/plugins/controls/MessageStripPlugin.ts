/**
 * @file MessageStripPlugin.ts
 * @description Renders a sap.m.MessageStrip for informational text.
 */

import { BasePlugin } from "./BasePlugin";
import { IPropertyMetadata } from "../../interfaces/ISchema";
import MessageStrip from "sap/m/MessageStrip";
import Control from "sap/ui/core/Control";

/**
 * Renders read-only informational alerts within the layout.
 * Does not emit values to the payload.
 * 
 * @namespace nz.co.siliconst.ui5.metaui.plugins.controls
 * @public
 */
export class MessageStripPlugin extends BasePlugin {
    public render(fieldMetadata: IPropertyMetadata,  bindingPath: string,  modelName: string = "meta", engineScopeId?: string): Control {
        this.metadata = fieldMetadata;
        
        // Use binding to display text if the field has a value, otherwise use the label
        this.control = new MessageStrip({
            id: this.generateStableId(engineScopeId, bindingPath),
            text: `{${modelName}>${bindingPath}}`,
            type: "Information", // Can be driven by schema arguments in the future
            showIcon: true,
            showCloseButton: false
        });

        return this.control as Control;
    }

    protected getValue(): any {
        return null; // Read-only component
    }

    protected applyState(): void {
        // Read-only component, no dynamic state needed currently
    }
}
