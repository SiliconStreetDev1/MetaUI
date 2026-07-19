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
    public render(fieldMetadata: IPropertyMetadata,  bindingPath: string,  modelName: string = "meta", engineScopeId?: string): Control {
        this.metadata = fieldMetadata;
        
        this.control = new Slider({
            id: this.generateStableId(engineScopeId, bindingPath),
            value: `{${modelName}>${bindingPath}}`,
            enabled: !fieldMetadata.ui?.readOnly,
            min: fieldMetadata.minimum !== undefined ? fieldMetadata.minimum : 0,
            max: fieldMetadata.maximum !== undefined ? fieldMetadata.maximum : 100,
            step: fieldMetadata.multipleOf !== undefined ? fieldMetadata.multipleOf : 1,
            enableTickmarks: true,
            change: (oEvent: any) => {
                const val = oEvent.getParameter("value");
                this.validate();
            }
        });

        return this.control as Control;
    }

    protected getValue(): any {
        return this.control ? (this.control as Slider).getValue() : 0;
    }

    protected applyState(): void {
        if (this.control && this.metadata) {
            (this.control as Slider).setEnabled(!this.metadata.ui?.readOnly);
        }
    }
}
