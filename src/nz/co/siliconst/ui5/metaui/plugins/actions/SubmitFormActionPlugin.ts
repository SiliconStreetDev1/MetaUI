/**
 * @file SubmitFormActionPlugin.ts
 * @description A custom action plugin that triggers form submission.
 */

import { BasePlugin } from "../controls/BasePlugin";
import { IPropertyMetadata } from "../../interfaces/ISchema";
import Button from "sap/m/Button";
import Control from "sap/ui/core/Control";
import Core from "sap/ui/core/Core";

/**
 * Renders a Button that requests the host container to execute its submit flow.
 * 
 * @namespace nz.co.siliconst.ui5.metaui.plugins.actions
 * @public
 */
export class SubmitFormActionPlugin extends BasePlugin {
    public render(fieldMetadata: IPropertyMetadata, bindingPath: string, modelName: string = "meta"): Control {
        this.metadata = fieldMetadata;
        
        if (!this.isEditable) {
            sap.ui.requireSync("sap/m/Text");
            const TextControl = sap.ui.require("sap/m/Text");
            this.control = new TextControl({ visible: false });
            return this.control as Control;
        }
        
        this.control = new Button({
            text: fieldMetadata.ui?.label || "Submit",
            type: "Emphasized",
            icon: "sap-icon://save",
            press: () => {
                // Fire an event that the GeneratorHost or LayoutManager listens to
                // Suppressing TS error as UI5 1.118+ EventBus signature changed but still requires global bust cast
                // @ts-ignore
                (Core as unknown).getEventBus().publish("MetaUI", "TriggerSubmit", {});
            }
        });

        return this.control as Control;
    }

    protected getValue(): any {
        return null;
    }

    protected applyState(): void {
        if (this.control && this.metadata) {
            if (!this.isEditable) return;
            (this.control as Button).setEnabled(!this.metadata.ui?.readOnly);
        }
    }
}
