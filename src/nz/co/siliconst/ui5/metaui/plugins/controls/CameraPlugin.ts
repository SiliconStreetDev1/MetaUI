import { BasePlugin } from "../controls/BasePlugin";
import { IPropertyMetadata } from "../../interfaces/ISchema";
import Control from "sap/ui/core/Control";
import CameraControl from "../../controls/CameraControl";

export class CameraPlugin extends BasePlugin {
    public render(metadata: IPropertyMetadata,  bindingPath: string,  modelName: string = "meta", engineScopeId?: string): Control {
        this.metadata = metadata;
        this.fieldKey = bindingPath.replace('/', '');
        this.modelName = modelName;

        this.control = new CameraControl({
            id: this.generateStableId(engineScopeId, bindingPath),
            value: `{${modelName}>${bindingPath}}`,
            schemaMetadata: metadata,
            readOnly: !!metadata.ui?.readOnly
        });

        this.applyCommonDirectives(this.control, metadata, modelName);

        // Validation mapping could be hooked into the 'capture' event if needed, but Two-Way binding updates the model naturally.
        (this.control as any).attachCapture(() => {
            this.validate();
        });

        return this.control as Control;
    }

    protected getValue(): any {
        return this.control ? (this.control as any).getValue() : null;
    }

    protected applyState(): void {
        if (this.control && this.metadata) {
            (this.control as any).setProperty("readOnly", !!this.metadata.ui?.readOnly);
        }
    }
}
