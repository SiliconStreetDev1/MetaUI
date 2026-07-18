/**
 * @file DropdownPlugin.ts
 * @description Renders a sap.m.Select utilizing the schema's valueHelp structure.
 */

import { BasePlugin } from "./BasePlugin";
import { IPropertyMetadata } from "../interfaces/ISchema";
import Select from "sap/m/Select";
import Item from "sap/ui/core/Item";
import Control from "sap/ui/core/Control";

/**
 * Handles rendering logic for dropdown inputs.
 */
export class DropdownPlugin extends BasePlugin {
    public render(fieldMetadata: IPropertyMetadata, bindingPath: string, modelName: string = "meta"): Control {
        this.metadata = fieldMetadata;
        
        const select = new Select({
            selectedKey: `{${modelName}>${bindingPath}}`,
            enabled: !fieldMetadata.ui?.readOnly,
            forceSelection: false,
            change: (oEvent: any) => {
                const item = oEvent.getParameter("selectedItem");
                const val = item ? item.getKey() : "";
                this.publishChange(val);
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
        return this.control;
    }

    public validate(): boolean {
        if (!this.control || !this.metadata) return true;
        const select = this.control as Select;
        const val = select.getSelectedKey();

        if (this.metadata.required && (!val || val.trim() === "")) {
            select.setValueState("Error" as any);
            select.setValueStateText("Selection is required.");
            return false;
        }

        select.setValueState("None" as any);
        return true;
    }

    protected applyState(): void {
        if (this.control && this.metadata) {
            const select = this.control as Select;
            select.setEnabled(!this.metadata.ui?.readOnly);
        }
    }
}
