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
                    formatter: (val: any[]) => Array.isArray(val) ? val.join(", ") : ""
                }
            });
            this.applyCommonDirectives(this.control, fieldMetadata, modelName);
            return this.control as Control;
        }
        
        const mcb = new MultiComboBox({
            id: this.generateStableId(engineScopeId, bindingPath),
            selectedKeys: `{${modelName}>${bindingPath}}`,
            enabled: !fieldMetadata.ui?.readOnly,
            placeholder: fieldMetadata.ui?.label || "Select items...",
            selectionChange: (oEvent: sap.ui.base.Event) => {
                const keys = (this.control as MultiComboBox).getSelectedKeys();
                const result = this.validate();
                if (this.onChange) {
                    this.onChange(result.isValid, this.fieldKey);
                }
            }
        });

        if (fieldMetadata.enum) {
            fieldMetadata.enum.forEach((val: string | number) => {
                mcb.addItem(new Item({ key: val.toString(), text: val.toString() }));
            });
        }

        this.control = mcb;
        this.applyCommonDirectives(this.control, fieldMetadata, modelName);
        return this.control as Control;
    }

    protected getValue(): any {
        return this.control ? (this.control as MultiComboBox).getSelectedKeys() : [];
    }

    protected applyState(): void {
        if (this.control && this.metadata) {
            if (this.isDisplayMode) return;
            (this.control as MultiComboBox).setEnabled(!this.metadata.ui?.readOnly);
        }
    }
}
