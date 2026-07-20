import { BasePlugin } from "../controls/BasePlugin";
import { IPropertyMetadata } from "../../interfaces/ISchema";
import Control from "sap/ui/core/Control";
import CameraControl from "../../controls/CameraControl";

export class CameraPlugin extends BasePlugin {
    public render(metadata: IPropertyMetadata,  bindingPath: string,  modelName: string = "meta", engineScopeId?: string, onChange?: (isValid: boolean, fieldKey?: string) => void): Control {
        this.onChange = onChange;
        this.metadata = metadata;
        this.fieldKey = bindingPath.replace('/', '');
        this.modelName = modelName;

        if (this.isDisplayMode) {
            sap.ui.requireSync("sap/m/Image");
            const ImageControl = sap.ui.require("sap/m/Image");
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
        (this.control as unknown as { attachCapture: (fn: Function) => void }).attachCapture(() => {
            const result = this.validate();
                if (this.onChange) {
                    this.onChange(result.isValid, this.fieldKey);
                }
        });

        return this.control as Control;
    }

    protected getValue(): any {
        return this.control ? (this.control as unknown as { getValue: () => unknown }).getValue() : null;
    }

    protected applyState(): void {
        if (this.control && this.metadata) {
            if (this.isDisplayMode) return;
            (this.control as unknown as { setProperty: (k: string, v: unknown) => void }).setProperty("readOnly", !!this.metadata.ui?.readOnly);
        }
    }
}
