/**
 * @file MultiSelectPlugin.ts
 * @description Renders a sap.m.MultiComboBox for selecting multiple string values.
 */

import { BasePlugin } from "./BasePlugin";
import { IPropertyMetadata } from "../../interfaces/ISchema";
import MultiComboBox from "sap/m/MultiComboBox";
import Item from "sap/ui/core/Item";
import Control from "sap/ui/core/Control";

/**
 * Handles rendering logic for selecting multiple strings from a predefined list.
 * Expects the payload to be an array of strings.
 * 
 * @namespace nz.co.siliconst.ui5.metaui.plugins.controls
 * @public
 */
export class MultiSelectPlugin extends BasePlugin {
    public render(fieldMetadata: IPropertyMetadata,  bindingPath: string,  modelName: string = "meta", engineScopeId?: string): Control {
        this.metadata = fieldMetadata;
        
        const mcb = new MultiComboBox({
            selectedKeys: `{${modelName}>${bindingPath}}`,
            enabled: !fieldMetadata.ui?.readOnly,
            placeholder: fieldMetadata.ui?.label || "Select items...",
            selectionChange: (oEvent: any) => {
                const keys = (this.control as MultiComboBox).getSelectedKeys();
                this.validate();
            }
        });

        if (fieldMetadata.enum) {
            fieldMetadata.enum.forEach((val: string | number) => {
                mcb.addItem(new Item({ key: val.toString(), text: val.toString() }));
            });
        }

        this.control = mcb;
        return this.control as Control;
    }

    protected getValue(): any {
        return this.control ? (this.control as MultiComboBox).getSelectedKeys() : [];
    }

    protected applyState(): void {
        if (this.control && this.metadata) {
            (this.control as MultiComboBox).setEnabled(!this.metadata.ui?.readOnly);
        }
    }
}
