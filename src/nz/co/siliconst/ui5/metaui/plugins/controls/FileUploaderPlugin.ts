/**
 * @file FileUploaderPlugin.ts
 * @description Renders a sap.ui.unified.FileUploader control with live image preview and Base64 conversion.
 */

import { BasePlugin } from "./BasePlugin";
import { IPropertyMetadata } from "../../interfaces/ISchema";
import FileUploader from "sap/ui/unified/FileUploader";
import VBox from "sap/m/VBox";
import Image from "sap/m/Image";
import Text from "sap/m/Text";
import JSONModel from "sap/ui/model/json/JSONModel";
import Control from "sap/ui/core/Control";
import Event from "sap/ui/base/Event";
import { UrlValidator } from "../../utils/UrlValidator";

/**
 * Handles rendering logic for binary/byte string uploads.
 * Converts selected files to Base64 Data URLs and binds them to the JSON model.
 *
 * @namespace nz.co.siliconst.ui5.metaui.plugins.controls
 * @public
 */
export class FileUploaderPlugin extends BasePlugin {
    /**
     * Renders a `sap.ui.unified.FileUploader` paired with an image preview inside a `sap.m.VBox`.
     *
     * @param metadata The specific JSON schema properties for this field.
     * @param bindingPath The JSON path bound to this control.
     * @param modelName The UI5 JSONModel name.
     * @param engineScopeId The deterministic scope ID.
     * @param onChange The callback fired on value change.
     * @returns {Control} The configured VBox or Image control.
     */
    public render(
        metadata: IPropertyMetadata,
        bindingPath: string,
        modelName: string = "meta",
        engineScopeId?: string,
        onChange?: (isValid: boolean, fieldKey?: string, errorMessage?: string, controlId?: string) => void
    ): Control {
        this.initialize(metadata, bindingPath, modelName, onChange);

        const safeImageSrcBinding = this.generateBindingInfo(bindingPath, modelName, undefined, {
            formatter: (val: unknown) => (UrlValidator.isSafeImageSource(val) ? val.trim() : "")
        });

        const safeImageVisibleBinding = this.generateBindingInfo(bindingPath, modelName, undefined, {
            formatter: (val: unknown) => UrlValidator.isSafeImageSource(val)
        });

        if (!this.isEditable) {
            const displayTextBinding = this.generateBindingInfo(bindingPath, modelName, undefined, {
                formatter: (val: unknown) => {
                    if (UrlValidator.isSafeImageSource(val)) {
                        return "";
                    }
                    return typeof val === "string" && val.trim() ? val.trim() : "No file uploaded";
                }
            });
            const displayTextVisibleBinding = this.generateBindingInfo(bindingPath, modelName, undefined, {
                formatter: (val: unknown) => !UrlValidator.isSafeImageSource(val)
            });
            const displayImage = new Image({
                src: safeImageSrcBinding as unknown as string,
                visible: safeImageVisibleBinding as unknown as boolean,
                width: "200px",
                alt: metadata.ui?.label || "Uploaded Image"
            });
            const displayText = new Text({
                text: displayTextBinding as unknown as string,
                visible: displayTextVisibleBinding as unknown as boolean
            });
            this.control = new VBox({
                id: this.generateStableId(engineScopeId, bindingPath),
                items: [displayImage, displayText]
            }).addStyleClass("sapUiSmallMarginBottom");
            this.applyCommonDirectives(this.control, metadata, modelName);
            return this.control;
        }

        const vBox = new VBox({
            id: this.generateStableId(engineScopeId, bindingPath)
        });

        const previewImage = new Image({
            src: safeImageSrcBinding as unknown as string,
            visible: safeImageVisibleBinding as unknown as boolean,
            width: "200px",
            densityAware: false
        }).addStyleClass("sapUiSmallMarginBottom");

        const uploader = new FileUploader({
            id: this.generateStableId(engineScopeId, `${bindingPath}-uploader`),
            placeholder: metadata.ui?.placeholder || "Choose a file...",
            enabled: this.isControlEditable(),
            width: "100%",
            buttonText: "Browse...",
            change: this.onFileChange.bind(this)
        });

        vBox.addItem(previewImage);
        vBox.addItem(uploader);

        // Assign mainControl before applyCommonDirectives so enabled/valueState target the FileUploader
        this.mainControl = uploader;
        this.control = vBox;

        this.applyCommonDirectives(this.control, metadata, modelName);
        return this.control;
    }

    /**
     * Reads the selected file via `FileReader.readAsDataURL` and writes the Base64 payload to the bound model path.
     *
     * @param oEvent The `FileUploader` change event.
     */
    private onFileChange(oEvent: Event): void {
        const uploader = (oEvent.getSource() as FileUploader | undefined) ?? (this.mainControl as FileUploader | undefined);
        const params = oEvent.getParameters() as { files?: FileList | File[] };
        const files = params.files;

        if (files && files.length > 0 && uploader) {
            const file = files[0];
            const reader = new FileReader();

            reader.onload = (e: ProgressEvent<FileReader>) => {
                const base64Data = e.target?.result;
                if (typeof base64Data === "string" && !uploader.isDestroyed()) {
                    const model = (uploader.getModel(this.modelName) || this.engineContext?.getModel()) as
                        | JSONModel
                        | undefined;
                    if (model) {
                        const targetPath = this.resolveAbsolutePath(uploader);
                        model.setProperty(targetPath, base64Data);
                        this.notifyChange(uploader.getId());
                    }
                }
            };

            reader.readAsDataURL(file);
        } else {
            this.notifyChange(uploader?.getId());
        }
    }

    /**
     * Retrieves the current Base64 image data or filename from the bound model.
     * @param sourceControl Optional cloned control instance for table rows.
     * @returns {unknown} The stored file value.
     */
    protected getValue(sourceControl?: Control): unknown {
        const target = sourceControl || this.mainControl || this.control;
        if (!target) {
            return null;
        }
        const modelVal = this.getModelValue(target);
        if (modelVal !== undefined) {
            return modelVal;
        }
        return typeof (target as FileUploader).getValue === "function" ? (target as FileUploader).getValue() : null;
    }

    /**
     * Applies dynamic `readOnly` state to the FileUploader control.
     */
    protected applyState(): void {
        if (this.mainControl && this.metadata && this.isEditable) {
            const uploader = this.mainControl as FileUploader;
            uploader.setEnabled(this.isControlEditable());
        }
    }
}
