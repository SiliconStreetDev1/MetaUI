/**
 * @file FileUploaderPlugin.ts
 * @description Renders a sap.ui.unified.FileUploader.
 */

import { BasePlugin } from "./BasePlugin";
import { IPropertyMetadata } from "../../interfaces/ISchema";
import FileUploader from "sap/ui/unified/FileUploader";
import Control from "sap/ui/core/Control";

/**
 * Handles rendering logic for file uploads.
 * 
 * @namespace nz.co.siliconst.ui5.metaui.plugins.controls
 * @public
 */
export class FileUploaderPlugin extends BasePlugin {
    public render(fieldMetadata: IPropertyMetadata,  bindingPath: string,  modelName: string = "meta", engineScopeId?: string, onChange?: (isValid: boolean, fieldKey?: string) => void): Control {
        this.onChange = onChange;
        this.metadata = fieldMetadata;
        
        if (!this.isEditable) {
            sap.ui.requireSync("sap/m/Link");
            const LinkControl = sap.ui.require("sap/m/Link");
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
                const result = this.validate();
                if (this.onChange) {
                    this.onChange(result.isValid, this.fieldKey);
                }
            }
        });

        this.applyCommonDirectives(this.control, fieldMetadata, modelName);
        return this.control as Control;
    }

    protected getValue(): any {
        return this.control ? (this.control as FileUploader).getValue() : null;
    }

    protected applyState(): void {
        if (this.control && this.metadata) {
            if (!this.isEditable) return;
            (this.control as FileUploader).setEnabled(!this.metadata.ui?.readOnly);
        }
    }
}
