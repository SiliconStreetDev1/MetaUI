import { BasePlugin } from "../controls/BasePlugin";
import { IPropertyMetadata } from "../../interfaces/ISchema";
import Control from "sap/ui/core/Control";
import RichTextControl from "../../controls/RichTextControl";
import FormattedTextControl from "sap/m/FormattedText";

interface IValueAccessor {
    getValue(): unknown;
    attachCapture?(fn: Function): void;
}

function isValueAccessor(control: unknown): control is IValueAccessor {
    return control !== null && typeof (control as IValueAccessor).getValue === 'function';
}

export class RichTextPlugin extends BasePlugin {
    /**
     * Renders a `RichTextControl` component.
     * 
     * @param metadata The specific JSON schema properties for this field.
     * @param bindingPath The JSON path bound to this control.
     * @param modelName The UI5 JSONModel name.
     * @param engineScopeId The deterministic scope ID.
     * @param onChange The callback fired on value change.
     * @returns {Control} The configured RichTextControl.
     */
    public render(metadata: IPropertyMetadata,  bindingPath: string,  modelName: string = "meta", engineScopeId?: string, onChange?: (isValid: boolean, fieldKey?: string) => void): Control {
        this.onChange = onChange;
        this.metadata = metadata;
        this.fieldKey = bindingPath.replace('/', '');
        this.modelName = modelName;

        if (!this.isEditable) {
            
            this.control = new FormattedTextControl({
                id: this.generateStableId(engineScopeId, bindingPath),
                htmlText: `{${modelName}>${bindingPath}}`
            }) as Control;
            this.applyCommonDirectives(this.control, metadata, modelName);
            return this.control as Control;
        }

        this.control = new RichTextControl({
            id: this.generateStableId(engineScopeId, bindingPath),
            value: `{${modelName}>${bindingPath}}`,
            schemaMetadata: metadata,
            readOnly: !!metadata.ui?.readOnly
        }) as Control;

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

    /**
     * Retrieves the current HTML string value.
     * @returns {unknown} The string value.
     */
    protected getValue(): unknown {
        if (isValueAccessor(this.control)) {
            return this.control.getValue();
        }
        return null;
    }

    /**
     * Applies dynamic read-only state.
     */
    protected applyState(): void {
        if (this.control && this.metadata) {
            if (!this.isEditable) return;
            (this.control as sap.ui.core.Control).setProperty("readOnly", !!this.metadata.ui?.readOnly);
        }
    }
}
