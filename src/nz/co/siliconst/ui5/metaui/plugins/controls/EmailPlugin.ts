import { BasePlugin } from "./BasePlugin";
import { IPropertyMetadata } from "../../interfaces/ISchema";
import Input from "sap/m/Input";
import Control from "sap/ui/core/Control";
import TextControl from "sap/m/Text";

export class EmailPlugin extends BasePlugin {
    public render(fieldMetadata: IPropertyMetadata, bindingPath: string, modelName: string = "meta", engineScopeId?: string, onChange?: (isValid: boolean, fieldKey?: string, errorMessage?: string, controlId?: string) => void): Control {
        this.onChange = onChange;
        this.metadata = fieldMetadata;
        this.fieldKey = bindingPath.replace("/", "");
        
        if (!this.isEditable) {
            this.control = new TextControl({
                id: this.generateStableId(engineScopeId, bindingPath),
                text: this.generateBindingInfo(bindingPath, modelName)
            });
            this.applyCommonDirectives(this.control, fieldMetadata, modelName);
            return this.control as Control;
        }

        this.control = new Input({
            id: this.generateStableId(engineScopeId, bindingPath),
            value: this.generateBindingInfo(bindingPath, modelName),
            type: "Email",
            maxLength: fieldMetadata.maxLength || 0,
            required: !!fieldMetadata.required,
            change: (oEvent: sap.ui.base.Event) => {
                const result = this.validate();
                if (this.onChange) this.onChange(result.isValid, this.fieldKey, result.errorMessage);
            }
        });

        this.applyCommonDirectives(this.control, fieldMetadata, modelName);
        return this.control as Control;
    }

    protected getValue(): unknown {
        return this.control && this.control.getMetadata().getName() === "sap.m.Input" ? (this.control as Input).getProperty('value') : null;
    }

    protected applyState(): void {
        if (!this.control || !this.metadata || this.control.getMetadata().getName() !== "sap.m.Input") return;
        const input = this.control as Input;
        input.setEditable(!this.metadata.ui?.readOnly);
        input.setRequired(!!this.metadata.required);
    }
}
