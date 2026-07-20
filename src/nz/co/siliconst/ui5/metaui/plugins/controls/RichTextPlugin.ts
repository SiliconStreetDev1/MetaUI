import { BasePlugin } from "../controls/BasePlugin";
import { IPropertyMetadata } from "../../interfaces/ISchema";
import Control from "sap/ui/core/Control";
import RichTextControl from "../../controls/RichTextControl";

interface IValueAccessor {
    getValue(): unknown;
    attachCapture?(fn: Function): void;
}

function isValueAccessor(control: unknown): control is IValueAccessor {
    return control !== null && typeof (control as IValueAccessor).getValue === 'function';
}

export class RichTextPlugin extends BasePlugin {
    public render(metadata: IPropertyMetadata,  bindingPath: string,  modelName: string = "meta", engineScopeId?: string, onChange?: (isValid: boolean, fieldKey?: string) => void): Control {
        this.onChange = onChange;
        this.metadata = metadata;
        this.fieldKey = bindingPath.replace('/', '');
        this.modelName = modelName;

        if (!this.isEditable) {
            (sap.ui as unknown as { requireSync: (s: string) => unknown }).requireSync("sap/m/FormattedText");
            const FormattedTextControl = sap.ui.require("sap/m/FormattedText");
            this.control = new FormattedTextControl({
                id: this.generateStableId(engineScopeId, bindingPath),
                htmlText: `{${modelName}>${bindingPath}}`
            }) as unknown as sap.ui.core.Control;
            this.applyCommonDirectives(this.control, metadata, modelName);
            return this.control as Control;
        }

        this.control = new RichTextControl({
            id: this.generateStableId(engineScopeId, bindingPath),
            value: `{${modelName}>${bindingPath}}`,
            schemaMetadata: metadata,
            readOnly: !!metadata.ui?.readOnly
        }) as unknown as sap.ui.core.Control;

        this.applyCommonDirectives(this.control, metadata, modelName);

        if (isValueAccessor(this.control) && this.control.attachCapture) {
            this.control.attachCapture(() => {
                const result = this.validate();
                if (this.onChange) {
                    this.onChange(result.isValid, this.fieldKey);
                }
            });
        }

        return this.control as Control;
    }

    protected getValue(): unknown {
        if (isValueAccessor(this.control)) {
            return this.control.getValue();
        }
        return null;
    }

    protected applyState(): void {
        if (this.control && this.metadata) {
            if (!this.isEditable) return;
            (this.control as unknown as { setProperty: (k: string, v: unknown) => void }).setProperty("readOnly", !!this.metadata.ui?.readOnly);
        }
    }
}
