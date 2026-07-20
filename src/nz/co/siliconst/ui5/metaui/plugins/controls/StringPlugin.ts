/**
 * @file StringPlugin.ts
 * @description Renders a sap.m.Input for string data and validates lengths.
 */

import { BasePlugin } from "./BasePlugin";
import { IPropertyMetadata } from "../../interfaces/ISchema";
import Input from "sap/m/Input";
import Control from "sap/ui/core/Control";

/**
 * Handles rendering and logic for basic text inputs.
 * Maps schema properties like `maxLength` and `required` natively to `sap.m.Input`.
 * 
 * @namespace nz.co.siliconst.ui5.metaui.plugins.controls
 * @public
 */
export class StringPlugin extends BasePlugin {
    /**
     * Renders a `sap.m.Input` control configured via the provided schema metadata.
     * 
     * @param fieldMetadata The specific JSON schema properties for this field.
     * @param bindingPath The JSON path bound to this control.
     * @param modelName The UI5 JSONModel name.
     * @param engineScopeId The deterministic scope ID.
     * @param onChange The callback fired on value change.
     * @returns {Control} The configured Input control.
     */
    public render(fieldMetadata: IPropertyMetadata,  bindingPath: string,  modelName: string = "meta", engineScopeId?: string, onChange?: (isValid: boolean, fieldKey?: string) => void): Control {
        this.onChange = onChange;
        this.metadata = fieldMetadata;
        this.fieldKey = bindingPath.replace("/", ""); // For EventBus
        
        if (!this.isEditable) {
            (sap.ui as unknown as { requireSync: (s: string) => unknown }).requireSync("sap/m/Text");
            const TextControl = sap.ui.require("sap/m/Text");
            this.control = new TextControl({
                id: this.generateStableId(engineScopeId, bindingPath),
                text: `{${modelName}>${bindingPath}}`
            });
            this.applyCommonDirectives(this.control, fieldMetadata, modelName);
            return this.control as Control;
        }

        this.control = new Input({
            id: this.generateStableId(engineScopeId, bindingPath),
            value: `{${modelName}>${bindingPath}}`,
            maxLength: fieldMetadata.maxLength || 0,
            required: !!fieldMetadata.required,
            showValueHelp: fieldMetadata.ui?.widget === "searchHelp",
            change: (oEvent: unknown) => {
                const val = (oEvent as { getParameter: (s: string) => unknown }).getParameter("value");
                const result = this.validate();
                if (this.onChange) {
                    this.onChange(result.isValid, this.fieldKey);
                }
            }
        });

        this.applyCommonDirectives(this.control, fieldMetadata, modelName);

        return this.control as Control;
    }

    /**
     * Retrieves the current string value from the input.
     * @returns {any} The string value.
     */
    protected getValue(): any {
        return this.control ? (this.control as Input).getValue() : null;
    }

    /**
     * Adjusts dynamic state properties (editable/required) based on ConditionEngine mutations.
     */
    protected applyState(): void {
        if (this.control && this.metadata) {
            if (!this.isEditable) {
                // Text doesn't have editable/required state
                return;
            }
            const input = this.control as Input;
            input.setEditable(!this.metadata.ui?.readOnly);
            input.setRequired(this.metadata.required);
        }
    }
}
