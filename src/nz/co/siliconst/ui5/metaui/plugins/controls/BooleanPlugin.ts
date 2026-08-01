/**
 * @file BooleanPlugin.ts
 * @description Renders a sap.m.Switch for boolean states.
 */

import { BasePlugin } from "./BasePlugin";
import { IPropertyMetadata } from "../../interfaces/ISchema";
import CheckBox from "sap/m/CheckBox";
import Switch from "sap/m/Switch";
import Control from "sap/ui/core/Control";
import TextControl from "sap/m/Text";

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
    public render(fieldMetadata: IPropertyMetadata,  bindingPath: string,  modelName: string = "meta", engineScopeId?: string, onChange?: (isValid: boolean, fieldKey?: string, errorMessage?: string, controlId?: string) => void): Control {
        // text is safe for Boolean controls
        this.BLOCKED_PROPS = this.BLOCKED_PROPS.filter(p => p !== "text");

        this.onChange = onChange;
        this.metadata = fieldMetadata;
        this.fieldKey = bindingPath.startsWith('/') ? bindingPath.substring(1) : bindingPath;
        
        if (!this.isEditable) {
            
            this.control = new TextControl({
                id: this.generateStableId(engineScopeId, bindingPath),
                text: this.generateBindingInfo(bindingPath, modelName, undefined, {
                    formatter: (val: boolean) => val ? "Yes" : "No"
                })
            });
            this.applyCommonDirectives(this.control, fieldMetadata, modelName);
            return this.control as Control;
        }

        const onChangeFn = (oEvent: sap.ui.base.Event) => {
            const val = (oEvent as any).getParameter("state") ?? (oEvent as any).getParameter("selected");
            const result = this.validate();
            if (this.onChange) {
                this.onChange(result.isValid, this.fieldKey, result.errorMessage);
            }
        };

        if (fieldMetadata.ui?.widget === "switch") {
            this.control = new Switch({
                id: this.generateStableId(engineScopeId, bindingPath),
                state: this.generateBindingInfo(bindingPath, modelName),
                enabled: !fieldMetadata.ui?.readOnly,
                change: onChangeFn
            });
        } else {
            this.control = new CheckBox({
                id: this.generateStableId(engineScopeId, bindingPath),
                width: "100%",
                selected: this.generateBindingInfo(bindingPath, modelName),
                enabled: !fieldMetadata.ui?.readOnly,
                select: onChangeFn
            });
        }

        this.applyCommonDirectives(this.control, fieldMetadata, modelName);

        return this.control as Control;
    }

    /**
     * Retrieves the current boolean state.
     * @returns {boolean} The selected state.
     */
    protected getValue(): unknown {
        if (!this.control) return false;
        if (this.control instanceof Switch) {
            return (this.control as Switch).getState();
        }
        return (this.control as CheckBox).getSelected();
    }

    /**
     * Applies dynamic read-only state.
     */
    protected applyState(): void {
        if (this.control && this.metadata) {
            if (!this.isEditable) return;
            if (this.control instanceof Switch) {
                (this.control as Switch).setEnabled(!this.metadata.ui?.readOnly);
            } else {
                (this.control as CheckBox).setEnabled(!this.metadata.ui?.readOnly);
            }
        }
    }
}
