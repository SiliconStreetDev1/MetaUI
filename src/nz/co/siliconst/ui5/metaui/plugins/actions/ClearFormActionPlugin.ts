/**
 * @file ClearFormActionPlugin.ts
 * @description A custom action plugin that renders a Button to reset the model data.
 */

import { BasePlugin } from "../controls/BasePlugin";
import { IPropertyMetadata } from "../../interfaces/ISchema";
import Button from "sap/m/Button";
import Control from "sap/ui/core/Control";
import JSONModel from "sap/ui/model/json/JSONModel";

/**
 * A custom action plugin that renders a Button to reset the model data.
 * Demonstrates how to create functional action plugins that interact with the bound model.
 * 
 * @namespace nz.co.siliconst.ui5.metaui.plugins.actions
 * @public
 */
export class ClearFormActionPlugin extends BasePlugin {
    public render(fieldMetadata: IPropertyMetadata, bindingPath: string, modelName: string = "meta"): Control {
        this.metadata = fieldMetadata;
        
        if (this.isDisplayMode) {
            sap.ui.requireSync("sap/m/Text");
            const TextControl = sap.ui.require("sap/m/Text");
            this.control = new TextControl({ visible: false });
            return this.control as Control;
        }
        
        this.control = new Button({
            text: fieldMetadata.ui?.label || "Clear Data",
            type: "Reject",
            icon: "sap-icon://delete",
            press: (oEvent: sap.ui.base.Event) => {
                const btn = oEvent.getSource() as Button;
                const model = btn.getModel(modelName) as JSONModel;
                if (model) {
                    // Reset the entire model payload to an empty object
                    model.setProperty("/", {});
                }
            }
        });

        return this.control as Control;
    }

    protected getValue(): any {
        return null; // Actions do not store scalar values
    }

    protected applyState(): void {
        if (this.control && this.metadata) {
            if (this.isDisplayMode) return;
            (this.control as Button).setEnabled(!this.metadata.ui?.readOnly);
        }
    }
}
