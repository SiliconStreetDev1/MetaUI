/**
 * @file SliderPlugin.ts
 * @description Renders a sap.m.Slider for picking numbers in a range.
 */

import { BasePlugin } from "./BasePlugin";
import { IPropertyMetadata } from "../../interfaces/ISchema";
import Slider from "sap/m/Slider";
import Control from "sap/ui/core/Control";

/**
 * Handles rendering logic for numeric sliders.
 * 
 * @namespace nz.co.siliconst.ui5.metaui.plugins.controls
 * @public
 */
export class SliderPlugin extends BasePlugin {
    /**
     * Renders a `sap.m.Slider` component.
     * 
     * @param fieldMetadata The specific JSON schema properties for this field.
     * @param bindingPath The JSON path bound to this control.
     * @param modelName The UI5 JSONModel name.
     * @param engineScopeId The deterministic scope ID.
     * @param onChange The callback fired on value change.
     * @returns {Control} The configured Slider control.
     */
    public render(fieldMetadata: IPropertyMetadata,  bindingPath: string,  modelName: string = "meta", engineScopeId?: string, onChange?: (isValid: boolean, fieldKey?: string) => void): Control {
        this.onChange = onChange;
        this.metadata = fieldMetadata;
        
        if (!this.isEditable) {
            (sap.ui as unknown as { requireSync: (s: string) => unknown }).requireSync("sap/m/Text");
            const TextControl = sap.ui.require("sap/m/Text");
            this.control = new TextControl({
                id: this.generateStableId(engineScopeId, bindingPath),
                text: `{${modelName}>${bindingPath}}`
            });
            this.applyCommonDirectives(this.control, fieldMetadata, modelName);
            return this.control as Control;
        }

        this.control = new Slider({
            id: this.generateStableId(engineScopeId, bindingPath),
            value: `{${modelName}>${bindingPath}}`,
            enabled: !fieldMetadata.ui?.readOnly,
            min: fieldMetadata.minimum !== undefined ? fieldMetadata.minimum : 0,
            max: fieldMetadata.maximum !== undefined ? fieldMetadata.maximum : 100,
            step: fieldMetadata.multipleOf !== undefined ? fieldMetadata.multipleOf : 1,
            enableTickmarks: true,
            change: (oEvent: unknown) => {
                const val = (oEvent as { getParameter: (s: string) => unknown }).getParameter("value");
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
     * Retrieves the current slider value.
     * @returns {any} The numeric value.
     */
    protected getValue(): any {
        return this.control ? (this.control as Slider).getValue() : 0;
    }

    /**
     * Applies dynamic read-only state.
     */
    protected applyState(): void {
        if (this.control && this.metadata) {
            if (!this.isEditable) return;
            (this.control as Slider).setEnabled(!this.metadata.ui?.readOnly);
        }
    }
}
