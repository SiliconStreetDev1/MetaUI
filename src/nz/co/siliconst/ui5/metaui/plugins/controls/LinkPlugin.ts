import { BasePlugin } from "./BasePlugin";
import { IPropertyMetadata } from "../../interfaces/ISchema";
import Link from "sap/m/Link";
import Input from "sap/m/Input";
import Control from "sap/ui/core/Control";

export class LinkPlugin extends BasePlugin {
    public render(fieldMetadata: IPropertyMetadata, bindingPath: string, modelName: string = "meta", engineScopeId?: string, onChange?: (isValid: boolean, fieldKey?: string) => void): Control {
        this.onChange = onChange;
        this.metadata = fieldMetadata;
        this.fieldKey = bindingPath.replace("/", "");
        
        if (!this.isEditable) {
            this.control = new Link({
                id: this.generateStableId(engineScopeId, bindingPath),
                text: this.generateBindingInfo(bindingPath, modelName),
                href: this.generateBindingInfo(bindingPath, modelName),
                target: "_blank"
            });
            this.applyCommonDirectives(this.control, fieldMetadata, modelName);
            return this.control as Control;
        }

        // Editable mode: user needs to type a URL, so we use an Input configured for URLs
        this.control = new Input({
            id: this.generateStableId(engineScopeId, bindingPath),
            value: this.generateBindingInfo(bindingPath, modelName),
            type: "Url",
            maxLength: fieldMetadata.maxLength || 0,
            required: !!fieldMetadata.required,
            change: (oEvent: sap.ui.base.Event) => {
                const result = this.validateAndApplyVisualState();
                if (this.onChange) this.onChange(result.isValid, this.fieldKey);
            }
        });
        
        this.applyCommonDirectives(this.control, fieldMetadata, modelName);
        return this.control as Control;
    }
    
    protected getValue(): unknown {
        if (!this.control) return null;
        if (this.control.getMetadata().getName() === "sap.m.Input") {
            return (this.control as Input).getProperty('value');
        }
        return (this.control as Link).getHref();
    }
    
    protected applyState(): void {
        if (!this.control || !this.metadata) return;
        if (this.control.getMetadata().getName() === "sap.m.Input") {
            const input = this.control as Input;
            input.setEditable(!this.metadata.ui?.readOnly);
            input.setRequired(!!this.metadata.required);
        }
    }
}
