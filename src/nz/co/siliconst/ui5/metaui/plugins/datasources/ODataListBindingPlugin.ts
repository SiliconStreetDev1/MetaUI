/**
 * @file ODataListBindingPlugin.ts
 * @description A custom datasource plugin that binds a ComboBox to an OData EntitySet.
 */

import { BasePlugin } from "../controls/BasePlugin";
import { IPropertyMetadata } from "../../interfaces/ISchema";
import ComboBox from "sap/m/ComboBox";
import Item from "sap/ui/core/Item";
import Control from "sap/ui/core/Control";

/**
 * Renders a ComboBox natively bound to an OData Model entity set.
 * Expects args: { path: "/Categories", key: "ID", text: "Name" }
 * 
 * @namespace nz.co.siliconst.ui5.metaui.plugins.datasources
 * @public
 */
export class ODataListBindingPlugin extends BasePlugin {
    public render(fieldMetadata: IPropertyMetadata, bindingPath: string, modelName: string = "meta"): Control {
        this.metadata = fieldMetadata;
        
        const args = fieldMetadata.ui?.args || { path: "/", key: "ID", text: "Name" };
        
        this.control = new ComboBox({
            selectedKey: `{${modelName}>${bindingPath}}`,
            enabled: !fieldMetadata.ui?.readOnly,
            placeholder: fieldMetadata.ui?.label || "Select...",
            change: (oEvent: unknown) => {
                const val = (oEvent as { getParameter: (s: string) => unknown }).getParameter("selectedItem")?.getKey();
                this.validate();
            }
        });

        // Natively bind aggregation to the default model (OData)
        (this.control as ComboBox).bindAggregation("items", {
            path: args.path,
            template: new Item({
                key: `{${args.key}}`,
                text: `{${args.text}}`
            }),
            templateShareable: false
        });

        return this.control as Control;
    }

    protected getValue(): any {
        return this.control ? (this.control as ComboBox).getSelectedKey() : null;
    }

    protected applyState(): void {
        if (this.control && this.metadata) {
            (this.control as ComboBox).setEnabled(!this.metadata.ui?.readOnly);
        }
    }
}
