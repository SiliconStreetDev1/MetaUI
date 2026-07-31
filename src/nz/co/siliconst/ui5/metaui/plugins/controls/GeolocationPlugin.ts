import { BasePlugin } from "../controls/BasePlugin";
import { IPropertyMetadata } from "../../interfaces/ISchema";
import Control from "sap/ui/core/Control";
import GeolocationControl from "../../controls/GeolocationControl";
import TextControl from "sap/m/Text";

export class GeolocationPlugin extends BasePlugin {
    /**
     * Renders a `GeolocationControl` component.
     * 
     * @param metadata The specific JSON schema properties for this field.
     * @param bindingPath The JSON path bound to this control.
     * @param modelName The UI5 JSONModel name.
     * @param engineScopeId The deterministic scope ID.
     * @param onChange The callback fired on value change.
     * @returns {Control} The configured GeolocationControl.
     */
    public render(metadata: IPropertyMetadata,  bindingPath: string,  modelName: string = "meta", engineScopeId?: string, onChange?: (isValid: boolean, fieldKey?: string) => void): Control {
        this.onChange = onChange;
        this.metadata = metadata;
        this.fieldKey = bindingPath.replace('/', '');
        this.modelName = modelName;

        if (!this.isEditable) {
            
            this.control = new TextControl({
                id: this.generateStableId(engineScopeId, bindingPath),
                text: this.generateBindingInfo(bindingPath, modelName, undefined, {
                    formatter: (val: Record<string, unknown>) => val && val.lat !== undefined && val.lng !== undefined ? `Lat: ${val.lat}, Lng: ${val.lng}` : ""
                })
            });
            this.applyCommonDirectives(this.control, metadata, modelName);
            return this.control as Control;
        }

        this.control = new GeolocationControl({
            id: this.generateStableId(engineScopeId, bindingPath),
            value: this.generateBindingInfo(bindingPath, modelName),
            schemaMetadata: metadata,
            readOnly: !!metadata.ui?.readOnly
        });

        this.applyCommonDirectives(this.control, metadata, modelName);

        (this.control as GeolocationControl).attachEvent('capture', () => {
            const result = this.validateAndApplyVisualState();
                if (this.onChange) {
                    this.onChange(result.isValid, this.fieldKey);
                }
        });

        return this.control as Control;
    }

    /**
     * Retrieves the current geolocation object.
     * @returns {unknown} The geolocation value.
     */
    protected getValue(): unknown {
        return this.control ? (this.control as GeolocationControl).getProperty('value') : null;
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
