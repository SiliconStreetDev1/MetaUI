import { BasePlugin } from "../controls/BasePlugin";
import { IPropertyMetadata } from "../../interfaces/ISchema";
import Control from "sap/ui/core/Control";
import CameraControl from "../../controls/CameraControl";
import ImageControl from "sap/m/Image";

export class CameraPlugin extends BasePlugin {
    /**
     * Renders a `CameraControl` component.
     * 
     * @param metadata The specific JSON schema properties for this field.
     * @param bindingPath The JSON path bound to this control.
     * @param modelName The UI5 JSONModel name.
     * @param engineScopeId The deterministic scope ID.
     * @param onChange The callback fired on value change.
     * @returns {Control} The configured CameraControl.
     */
    public render(metadata: IPropertyMetadata,  bindingPath: string,  modelName: string = "meta", engineScopeId?: string, onChange?: (isValid: boolean, fieldKey?: string) => void): Control {
        this.onChange = onChange;
        this.metadata = metadata;
        this.fieldKey = bindingPath.replace('/', '');
        this.modelName = modelName;

        if (!this.isEditable) {
            
            this.control = new ImageControl({
                id: this.generateStableId(engineScopeId, bindingPath),
                src: `{${modelName}>${bindingPath}}`,
                width: "400px",
                alt: metadata.ui?.label || "Image"
            });
            this.applyCommonDirectives(this.control, metadata, modelName);
            return this.control as Control;
        }

        this.control = new CameraControl({
            id: this.generateStableId(engineScopeId, bindingPath),
            value: `{${modelName}>${bindingPath}}`,
            schemaMetadata: metadata,
            readOnly: !!metadata.ui?.readOnly
        });

        this.applyCommonDirectives(this.control, metadata, modelName);

        // Validation mapping could be hooked into the 'capture' event if needed, but Two-Way binding updates the model naturally.
        (this.control as CameraControl).attachCapture(() => {
            const result = this.validate();
                if (this.onChange) {
                    this.onChange(result.isValid, this.fieldKey);
                }
        });

        return this.control as Control;
    }

    /**
     * Retrieves the current base64 image state.
     * @returns {unknown} The image value.
     */
    protected getValue(): unknown {
        return this.control ? (this.control as CameraControl).getValue() : null;
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
