/**
 * @file RatingIndicatorPlugin.ts
 * @description Renders a sap.m.RatingIndicator for 1-5 numeric feedback.
 */

import { BasePlugin } from "./BasePlugin";
import { IPropertyMetadata } from "../../interfaces/ISchema";
import RatingIndicator from "sap/m/RatingIndicator";
import Control from "sap/ui/core/Control";
import TextControl from "sap/m/Text";

/**
 * Handles rendering logic for rating feedback.
 * 
 * @namespace nz.co.siliconst.ui5.metaui.plugins.controls
 * @public
 */
export class RatingIndicatorPlugin extends BasePlugin {
    /**
     * Renders a `sap.m.RatingIndicator` component.
     * 
     * @param fieldMetadata The specific JSON schema properties for this field.
     * @param bindingPath The JSON path bound to this control.
     * @param modelName The UI5 JSONModel name.
     * @param engineScopeId The deterministic scope ID.
     * @param onChange The callback fired on value change.
     * @returns {Control} The configured RatingIndicator control.
     */
    public render(fieldMetadata: IPropertyMetadata,  bindingPath: string,  modelName: string = "meta", engineScopeId?: string, onChange?: (isValid: boolean, fieldKey?: string) => void): Control {
        this.onChange = onChange;
        this.metadata = fieldMetadata;

        if (!this.isEditable) {
            
            this.control = new TextControl({
                id: this.generateStableId(engineScopeId, bindingPath),
                text: `{${modelName}>${bindingPath}}`
            });
            this.applyCommonDirectives(this.control, fieldMetadata, modelName);
            return this.control as Control;
        }
        
        this.control = new RatingIndicator({
            id: this.generateStableId(engineScopeId, bindingPath),
            value: `{${modelName}>${bindingPath}}`,
            enabled: !fieldMetadata.ui?.readOnly,
            maxValue: fieldMetadata.maximum !== undefined ? fieldMetadata.maximum : 5,
            change: (oEvent: sap.ui.base.Event) => {
                const val = oEvent.getParameter("value");
                const result = this.validateAndApplyVisualState();
                if (this.onChange) {
                    this.onChange(result.isValid, this.fieldKey);
                }
            }
        });

        this.applyCommonDirectives(this.control, fieldMetadata, modelName);

        return this.control as Control;
    }

    /**
     * Retrieves the current rating value.
     * @returns {unknown} The rating value.
     */
    protected getValue(): unknown {
        return this.control ? (this.control as RatingIndicator).getValue() : 0;
    }

    /**
     * Applies dynamic read-only state.
     */
    protected applyState(): void {
        if (this.control && this.metadata) {
            if (!this.isEditable) return;
            (this.control as RatingIndicator).setEnabled(!this.metadata.ui?.readOnly);
        }
    }
}
