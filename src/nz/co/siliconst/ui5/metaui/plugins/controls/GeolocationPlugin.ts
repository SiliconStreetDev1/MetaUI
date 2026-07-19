import { BasePlugin } from "../controls/BasePlugin";
import { IPropertyMetadata } from "../../interfaces/ISchema";
import Control from "sap/ui/core/Control";
import GeolocationControl from "../../controls/GeolocationControl";

export class GeolocationPlugin extends BasePlugin {
    public render(metadata: IPropertyMetadata,  bindingPath: string,  modelName: string = "meta", engineScopeId?: string): Control {
        this.metadata = metadata;
        this.fieldKey = bindingPath.replace('/', '');
        this.modelName = modelName;

        this.control = new GeolocationControl({
            id: this.generateStableId(engineScopeId, bindingPath),
            value: `{${modelName}>${bindingPath}}`,
            schemaMetadata: metadata,
            readOnly: !!metadata.ui?.readOnly
        });

        this.applyCommonDirectives(this.control, metadata, modelName);

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
