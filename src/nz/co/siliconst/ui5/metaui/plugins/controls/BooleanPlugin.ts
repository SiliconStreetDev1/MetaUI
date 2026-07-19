/**
 * @file BooleanPlugin.ts
 * @description Renders a sap.m.Switch for boolean states.
 */

import { BasePlugin } from "./BasePlugin";
import { IPropertyMetadata } from "../../interfaces/ISchema";
import CheckBox from "sap/m/CheckBox";
import Control from "sap/ui/core/Control";

/**
 * Handles rendering logic for toggleable booleans using `sap.m.CheckBox`.
 * 
 * @namespace nz.co.siliconst.ui5.metaui.plugins.controls
 * @public
 */
export class BooleanPlugin extends BasePlugin {
    /**
     * Renders a `sap.m.CheckBox` component for boolean evaluation.
     * 
     * @param fieldMetadata The specific JSON schema properties for this field.
     * @param bindingPath The JSON path bound to this control.
     * @param modelName The UI5 JSONModel name.
     * @returns {Control} The configured CheckBox control.
     */
    public render(fieldMetadata: IPropertyMetadata,  bindingPath: string,  modelName: string = "meta", engineScopeId?: string): Control {
        this.metadata = fieldMetadata;
        
        this.control = new CheckBox({
            id: this.generateStableId(engineScopeId, bindingPath),
            selected: `{${modelName}>${bindingPath}}`,
            enabled: !fieldMetadata.ui?.readOnly,
            select: (oEvent: any) => {
                const val = oEvent.getParameter("selected");
                this.validate();
            }
        });

        return this.control as Control;
    }

    /**
     * Retrieves the current boolean state.
     * @returns {boolean} The selected state.
     */
    protected getValue(): any {
        return this.control ? (this.control as CheckBox).getSelected() : false;
    }

    /**
     * Applies dynamic read-only state.
     */
    protected applyState(): void {
        if (this.control && this.metadata) {
            (this.control as CheckBox).setEnabled(!this.metadata.ui?.readOnly);
        }
    }
}
