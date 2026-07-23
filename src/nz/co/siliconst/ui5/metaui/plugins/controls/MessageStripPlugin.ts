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
    /**
     * Renders a `sap.m.MessageStrip` component.
     * 
     * @param fieldMetadata The specific JSON schema properties for this field.
     * @param bindingPath The JSON path bound to this control.
     * @param modelName The UI5 JSONModel name.
     * @param engineScopeId The deterministic scope ID.
     * @param onChange The callback fired on value change.
     * @returns {Control} The configured MessageStrip control.
     */
    public render(fieldMetadata: IPropertyMetadata,  bindingPath: string,  modelName: string = "meta", engineScopeId?: string, onChange?: (isValid: boolean, fieldKey?: string) => void): Control {
        this.onChange = onChange;
        this.metadata = fieldMetadata;
        this.fieldKey = bindingPath.startsWith('/') ? bindingPath.substring(1) : bindingPath;
        
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

    /**
     * Read-only control, returns null.
     */
    protected getValue(): unknown {
        return null; // Read-only component
    }

    /**
     * Read-only control, no dynamic state needed.
     */
    protected applyState(): void {
        // Read-only component, no dynamic state needed currently
    }
}
