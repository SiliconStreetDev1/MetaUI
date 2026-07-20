import { BasePlugin } from "../controls/BasePlugin";
import { IPropertyMetadata } from "../../interfaces/ISchema";
import Control from "sap/ui/core/Control";
import VoiceInputControl from "../../controls/VoiceInputControl";
import TextControl from "sap/m/Text";

export class VoiceInputPlugin extends BasePlugin {
    /**
     * Renders a `VoiceInputControl` component.
     * 
     * @param metadata The specific JSON schema properties for this field.
     * @param bindingPath The JSON path bound to this control.
     * @param modelName The UI5 JSONModel name.
     * @param engineScopeId The deterministic scope ID.
     * @param onChange The callback fired on value change.
     * @returns {Control} The configured VoiceInputControl.
     */
    public render(metadata: IPropertyMetadata,  bindingPath: string,  modelName: string = "meta", engineScopeId?: string, onChange?: (isValid: boolean, fieldKey?: string) => void): Control {
        this.onChange = onChange;
        this.metadata = metadata;
        this.fieldKey = bindingPath.replace('/', '');
        this.modelName = modelName;

        if (!this.isEditable) {
            
            this.control = new TextControl({
                id: this.generateStableId(engineScopeId, bindingPath),
                text: {
                    path: `${modelName}>${bindingPath}`,
                    formatter: (val: unknown) => {
                        if (!val || val === "undefined" || val === "null") return "";
                        return val;
                    }
                }
            }) as Control;
            this.applyCommonDirectives(this.control, metadata, modelName);
            return this.control as Control;
        }

        this.control = new VoiceInputControl({
            id: this.generateStableId(engineScopeId, bindingPath),
            value: `{${modelName}>${bindingPath}}`,
            schemaMetadata: metadata,
            readOnly: !!metadata.ui?.readOnly
        }) as Control;

        this.applyCommonDirectives(this.control, metadata, modelName);

        (this.control as VoiceInputControl).attachCapture(() => {
            const result = this.validate();
                if (this.onChange) {
                    this.onChange(result.isValid, this.fieldKey);
                }
        });

        return this.control as Control;
    }

    /**
     * Retrieves the current voice transcription text.
     * @returns {unknown} The text string.
     */
    protected getValue(): unknown {
        return this.control ? (this.control as VoiceInputControl).getValue() : null;
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
