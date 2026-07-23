/**
 * @file FileUploaderPlugin.ts
 * @description Renders a sap.ui.unified.FileUploader.
 */

import { BasePlugin } from "./BasePlugin";
import { IPropertyMetadata } from "../../interfaces/ISchema";
import FileUploader from "sap/ui/unified/FileUploader";
import Control from "sap/ui/core/Control";
import LinkControl from "sap/m/Link";

/**
 * Handles rendering logic for file uploads.
 * 
 * @namespace nz.co.siliconst.ui5.metaui.plugins.controls
 * @public
 */
export class FileUploaderPlugin extends BasePlugin {
    /**
     * Renders a `sap.ui.unified.FileUploader` component.
     * 
     * @param fieldMetadata The specific JSON schema properties for this field.
     * @param bindingPath The JSON path bound to this control.
     * @param modelName The UI5 JSONModel name.
     * @param engineScopeId The deterministic scope ID.
     * @param onChange The callback fired on value change.
     * @returns {Control} The configured FileUploader control.
     */
    public render(fieldMetadata: IPropertyMetadata,  bindingPath: string,  modelName: string = "meta", engineScopeId?: string, onChange?: (isValid: boolean, fieldKey?: string) => void): Control {
        this.onChange = onChange;
        this.metadata = fieldMetadata;
        this.fieldKey = bindingPath.startsWith('/') ? bindingPath.substring(1) : bindingPath;
        
        if (!this.isEditable) {
            
            this.control = new LinkControl({
                id: this.generateStableId(engineScopeId, bindingPath),
                text: `{${modelName}>${bindingPath}}`,
                href: `{${modelName}>${bindingPath}}`, // Assuming the value is a URL to the file
                target: "_blank"
            });
            this.applyCommonDirectives(this.control, fieldMetadata, modelName);
            return this.control as Control;
        }

        this.control = new FileUploader({
            id: this.generateStableId(engineScopeId, bindingPath),
            value: `{${modelName}>${bindingPath}}`,
            enabled: !fieldMetadata.ui?.readOnly,
            placeholder: fieldMetadata.ui?.label || "Choose a file...",
            width: "100%",
            change: (oEvent: sap.ui.base.Event) => {
                const val = oEvent.getParameter("newValue");
                const result = this.validateAndApplyVisualState();
                if (this.onChange) {
                    this.onChange(result.isValid, this.fieldKey);
                }
            }
        });

        this.applyCommonDirectives(this.control, fieldMetadata, modelName);
        return this.control as Control;
    }

    /**
     * Retrieves the current file path.
     * @returns {unknown} The file value.
     */
    protected getValue(): unknown {
        return this.control ? (this.control as FileUploader).getValue() : null;
    }

    /**
     * Applies dynamic read-only state.
     */
    protected applyState(): void {
        if (this.control && this.metadata) {
            if (!this.isEditable) return;
            (this.control as FileUploader).setEnabled(!this.metadata.ui?.readOnly);
        }
    }
}
