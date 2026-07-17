/**
 * @file DropdownPlugin.ts
 * @description Renders a sap.m.Select utilizing the schema's valueHelp structure.
 */

import { BasePlugin } from "./BasePlugin";
import { IFieldMetadata } from "../interfaces/ISchema";
import Select from "sap/m/Select";
import Item from "sap/ui/core/Item";
import Control from "sap/ui/core/Control";

/**
 * Handles rendering logic for dropdown inputs.
 */
export class DropdownPlugin extends BasePlugin {
    public render(fieldMetadata: IFieldMetadata, bindingPath: string): Control {
        this.metadata = fieldMetadata;
        
        const select = new Select({
            selectedKey: `{meta>${bindingPath}}`,
            enabled: !fieldMetadata.isReadOnly,
            change: (oEvent: any) => {
                const item = oEvent.getParameter("selectedItem");
                const val = item ? item.getKey() : "";
                this.publishChange(val);
                this.validate();
            }
        });

        if (fieldMetadata.valueHelp && Array.isArray(fieldMetadata.valueHelp)) {
            if (!fieldMetadata.isRequired) {
                select.addItem(new Item({ key: "", text: "--- Select ---" }));
            }
            
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

        if (this.metadata.isRequired && (!val || val.trim() === "")) {
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
            select.setEnabled(!this.metadata.isReadOnly);
        }
    }
}
