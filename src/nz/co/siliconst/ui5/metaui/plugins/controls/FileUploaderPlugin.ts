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
    public render(fieldMetadata: IPropertyMetadata,  bindingPath: string,  modelName: string = "meta", engineScopeId?: string): Control {
        this.metadata = fieldMetadata;
        
        this.control = new FileUploader({
            id: this.generateStableId(engineScopeId, bindingPath),
            value: `{${modelName}>${bindingPath}}`,
            enabled: !fieldMetadata.ui?.readOnly,
            placeholder: fieldMetadata.ui?.label || "Choose a file...",
            width: "100%",
            change: (oEvent: any) => {
                const val = oEvent.getParameter("newValue");
                this.validate();
            }
        });

        return this.control as Control;
    }

    protected getValue(): any {
        return this.control ? (this.control as FileUploader).getValue() : null;
    }

    protected applyState(): void {
        if (this.control && this.metadata) {
            (this.control as FileUploader).setEnabled(!this.metadata.ui?.readOnly);
        }
    }
}
