/**
 * @file DropdownPlugin.ts
 * @description Renders a sap.m.Select utilizing the schema's valueHelp structure.
 */

import { BasePlugin } from "./BasePlugin";
import { IPropertyMetadata } from "../../interfaces/ISchema";
import Select from "sap/m/Select";
import Item from "sap/ui/core/Item";
import Control from "sap/ui/core/Control";
import TextControl from "sap/m/Text";

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
     * @param engineScopeId The deterministic scope ID.
     * @param onChange The callback fired on value change.
     * @returns {Control} The configured Select control.
     */
    public render(fieldMetadata: IPropertyMetadata,  bindingPath: string,  modelName: string = "meta", engineScopeId?: string, onChange?: (isValid: boolean, fieldKey?: string) => void): Control {
        this.onChange = onChange;
        this.metadata = fieldMetadata;
        
        if (!this.isEditable) {
            
            
            const valueHelpArray = fieldMetadata.valueHelp && Array.isArray(fieldMetadata.valueHelp) 
                ? fieldMetadata.valueHelp 
                : (fieldMetadata.enum ? fieldMetadata.enum.map(e => ({ key: String(e), text: String(e) })) : []);
            
            this.control = new TextControl({
                id: this.generateStableId(engineScopeId, bindingPath),
                text: {
                    path: `${modelName}>${bindingPath}`,
                    formatter: (key: string) => {
                        const match = valueHelpArray.find(vh => vh.key === key);
                        return match ? match.text : key;
                    }
                }
            });
            this.applyCommonDirectives(this.control, fieldMetadata, modelName);
            return this.control as Control;
        }

        const select = new Select({
            id: this.generateStableId(engineScopeId, bindingPath),
            selectedKey: `{${modelName}>${bindingPath}}`,
            enabled: !fieldMetadata.ui?.readOnly,
            forceSelection: false,
            change: (oEvent: sap.ui.base.Event) => {
                const item = oEvent.getParameter("selectedItem");
                const val = item ? item.getKey() : "";
                const result = this.validateAndApplyVisualState();
                if (this.onChange) {
                    this.onChange(result.isValid, this.fieldKey);
                }
            }
        });

        const valueHelpArray = fieldMetadata.valueHelp && Array.isArray(fieldMetadata.valueHelp) 
            ? fieldMetadata.valueHelp 
            : (fieldMetadata.enum ? fieldMetadata.enum.map(e => ({ key: String(e), text: String(e) })) : []);

        if (valueHelpArray.length > 0) {
            // Always add the empty placeholder so that 'required' checks can actually fire if the user hasn't made a choice
            select.addItem(new Item({ key: "", text: "--- Select ---" }));
            
            valueHelpArray.forEach(vh => {
                select.addItem(new Item({ key: vh.key, text: vh.text }));
            });
        }

        this.control = select;
        this.applyCommonDirectives(this.control, fieldMetadata, modelName);
        return this.control as Control;
    }

    /**
     * Retrieves the currently selected key.
     * @returns {unknown} The selected key.
     */
    protected getValue(): unknown {
        return this.control ? (this.control as Select).getSelectedKey() : null;
    }

    /**
     * Applies dynamic metadata state (e.g. readOnly) when the ConditionEngine fires.
     */
    protected applyState(): void {
        if (this.control && this.metadata) {
            if (!this.isEditable) return;
            const select = this.control as Select;
            select.setEnabled(!this.metadata.ui?.readOnly);
        }
    }
}
