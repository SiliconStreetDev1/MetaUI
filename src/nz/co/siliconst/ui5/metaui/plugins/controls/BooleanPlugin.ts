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
    public render(fieldMetadata: IPropertyMetadata,  bindingPath: string,  modelName: string = "meta", engineScopeId?: string, onChange?: (isValid: boolean, fieldKey?: string) => void): Control {
        this.onChange = onChange;
        this.metadata = fieldMetadata;
        
        if (this.isDisplayMode) {
            sap.ui.requireSync("sap/m/Text");
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

        this.control = new CheckBox({
            id: this.generateStableId(engineScopeId, bindingPath),
            selected: `{${modelName}>${bindingPath}}`,
            enabled: !fieldMetadata.ui?.readOnly,
            select: (oEvent: sap.ui.base.Event) => {
                const val = oEvent.getParameter("selected");
                const result = this.validate();
                if (this.onChange) {
                    this.onChange(result.isValid, this.fieldKey);
                }
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
            if (this.isDisplayMode) return;
            (this.control as CheckBox).setEnabled(!this.metadata.ui?.readOnly);
        }
    }
}
