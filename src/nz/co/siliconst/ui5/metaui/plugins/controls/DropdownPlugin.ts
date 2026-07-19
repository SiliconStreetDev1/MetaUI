/**
 * @file DropdownPlugin.ts
 * @description Renders a sap.m.Select utilizing the schema's valueHelp structure.
 */

import { BasePlugin } from "./BasePlugin";
import { IPropertyMetadata } from "../../interfaces/ISchema";
import Select from "sap/m/Select";
import Item from "sap/ui/core/Item";
import Control from "sap/ui/core/Control";

/**
 * Handles rendering logic for dropdown inputs.
 * Maps the static `valueHelp` schema array to `sap.ui.core.Item` elements.
 * 
 * @namespace nz.co.siliconst.ui5.metaui.plugins.controls
 * @public
 */
export class DropdownPlugin extends BasePlugin {
    /**
     * Renders a `sap.m.Select` component populated with schema-defined value help.
     * 
     * @param fieldMetadata The specific JSON schema properties for this field.
     * @param bindingPath The JSON path bound to this control.
     * @param modelName The UI5 JSONModel name.
     * @returns {Control} The configured Select control.
     */
    public render(fieldMetadata: IPropertyMetadata,  bindingPath: string,  modelName: string = "meta", engineScopeId?: string): Control {
        this.metadata = fieldMetadata;
        
        const select = new Select({
            selectedKey: `{${modelName}>${bindingPath}}`,
            enabled: !fieldMetadata.ui?.readOnly,
            forceSelection: false,
            change: (oEvent: any) => {
                const item = oEvent.getParameter("selectedItem");
                const val = item ? item.getKey() : "";
                this.validate();
            }
        });

        if (fieldMetadata.valueHelp && Array.isArray(fieldMetadata.valueHelp)) {
            // Always add the empty placeholder so that 'required' checks can actually fire if the user hasn't made a choice
            select.addItem(new Item({ key: "", text: "--- Select ---" }));
            
            fieldMetadata.valueHelp.forEach(vh => {
                select.addItem(new Item({ key: vh.key, text: vh.text }));
            });
        }

        this.control = select;
        return this.control as Control;
    }

    /**
     * Retrieves the currently selected key.
     * @returns {any} The selected key.
     */
    protected getValue(): any {
        return this.control ? (this.control as Select).getSelectedKey() : null;
    }

    /**
     * Applies dynamic metadata state (e.g. readOnly) when the ConditionEngine fires.
     */
    protected applyState(): void {
        if (this.control && this.metadata) {
            const select = this.control as Select;
            select.setEnabled(!this.metadata.ui?.readOnly);
        }
    }
}
