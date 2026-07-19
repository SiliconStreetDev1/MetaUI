/**
 * @file RatingIndicatorPlugin.ts
 * @description Renders a sap.m.RatingIndicator for 1-5 numeric feedback.
 */

import { BasePlugin } from "./BasePlugin";
import { IPropertyMetadata } from "../../interfaces/ISchema";
import RatingIndicator from "sap/m/RatingIndicator";
import Control from "sap/ui/core/Control";

/**
 * Handles rendering logic for rating feedback.
 * 
 * @namespace nz.co.siliconst.ui5.metaui.plugins.controls
 * @public
 */
export class RatingIndicatorPlugin extends BasePlugin {
    public render(fieldMetadata: IPropertyMetadata,  bindingPath: string,  modelName: string = "meta", engineScopeId?: string): Control {
        this.metadata = fieldMetadata;
        
        this.control = new RatingIndicator({
            id: this.generateStableId(engineScopeId, bindingPath),
            value: `{${modelName}>${bindingPath}}`,
            enabled: !fieldMetadata.ui?.readOnly,
            maxValue: fieldMetadata.maximum !== undefined ? fieldMetadata.maximum : 5,
            change: (oEvent: any) => {
                const val = oEvent.getParameter("value");
                this.validate();
            }
        });

        return this.control as Control;
    }

    protected getValue(): any {
        return this.control ? (this.control as RatingIndicator).getValue() : 0;
    }

    protected applyState(): void {
        if (this.control && this.metadata) {
            (this.control as RatingIndicator).setEnabled(!this.metadata.ui?.readOnly);
        }
    }
}
