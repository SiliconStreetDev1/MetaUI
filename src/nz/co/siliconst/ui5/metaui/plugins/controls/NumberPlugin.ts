/**
 * @file NumberPlugin.ts
 * @description Renders a sap.m.Input configured for generic dynamic numeric data.
 */

import { BasePlugin } from "./BasePlugin";
import { IPropertyMetadata } from "../../interfaces/ISchema";
import Input from "sap/m/Input";
import Control from "sap/ui/core/Control";
import TextControl from "sap/m/Text";
import Float from "sap/ui/model/type/Float";
import Integer from "sap/ui/model/type/Integer";

/**
 * Handles rendering and logic for dynamic numeric inputs.
 */
export class NumberPlugin extends BasePlugin {
    /**
     * Renders a `sap.m.Input` component for numeric evaluation with dynamic Float type.
     * 
     * @param fieldMetadata The specific JSON schema properties for this field.
     * @param bindingPath The JSON path bound to this control.
     * @param modelName The UI5 JSONModel name.
     * @param engineScopeId The deterministic scope ID.
     * @param onChange The callback fired on value change.
     * @returns {Control} The configured Input control.
     */
    public render(fieldMetadata: IPropertyMetadata, bindingPath: string, modelName: string = "meta", engineScopeId?: string, onChange?: (isValid: boolean, fieldKey?: string) => void): Control {
        this.onChange = onChange;
        this.metadata = fieldMetadata;
        this.fieldKey = bindingPath.startsWith('/') ? bindingPath.substring(1) : bindingPath;

        if (!this.isEditable) {
            this.control = new TextControl({
                id: this.generateStableId(engineScopeId, bindingPath),
                text: `{${modelName}>${bindingPath}}`
            });
            this.applyCommonDirectives(this.control, fieldMetadata, modelName);
            return this.control as Control;
        }

        let typeInstance;
        if (fieldMetadata.type === "integer") {
            typeInstance = new Integer({ groupingEnabled: false });
        } else {
            typeInstance = new Float({
                groupingEnabled: false,
                minFractionDigits: fieldMetadata.scale !== undefined ? fieldMetadata.scale : 0,
                maxFractionDigits: fieldMetadata.scale !== undefined ? fieldMetadata.scale : 9
            });
        }

        this.control = new Input({
            id: this.generateStableId(engineScopeId, bindingPath),
            value: {
                path: `${modelName}>${bindingPath}`,
                type: typeInstance
            },
            type: "Number",
            editable: !fieldMetadata.ui?.readOnly,
            required: !!fieldMetadata.required,
            change: (oEvent: sap.ui.base.Event) => {
                const val = oEvent.getParameter("value");
                const result = this.validateAndApplyVisualState();
                if (this.onChange) {
                    this.onChange(result.isValid, this.fieldKey);
                }
            }
        });

        this.applyCommonDirectives(this.control, fieldMetadata, modelName);

        return this.control as Control;
    }

    /**
     * Retrieves the current numeric state.
     * @returns {unknown} The numeric value.
     */
    protected getValue(): unknown {
        if (!this.control) return null;
        // In UI5, Input.getValue() returns a string. We must parse it if it's bound.
        // However, we can also extract it directly from the binding.
        const input = this.control as Input;
        const binding = input.getBinding("value");
        if (binding) {
            return binding.getValue();
        }
        return input.getValue();
    }

    /**
     * Applies dynamic read-only state.
     */
    protected applyState(): void {
        if (this.control && this.metadata) {
            if (!this.isEditable) return;
            const input = this.control as Input;
            input.setEditable(!this.metadata.ui?.readOnly);
            input.setRequired(!!this.metadata.required);
        }
    }
}
