/**
 * @file CameraPlugin.ts
 * @description Renders a CameraControl component in edit mode and an Image in display mode.
 */

import { HardwareControlPlugin } from "./HardwareControlPlugin";
import { IPropertyMetadata } from "../../interfaces/ISchema";
import Control from "sap/ui/core/Control";
import CameraControl from "../../controls/CameraControl";
import { I18n, TEXT_KEY } from "../../utils/I18n";

/**
 * Plugin responsible for rendering the hardware `CameraControl` widget.
 *
 * @namespace nz.co.siliconst.ui5.metaui.plugins.controls
 * @internal
 */
export class CameraPlugin extends HardwareControlPlugin<CameraControl> {
    protected readonly HardwareControlClass = CameraControl;

    /**
     * Renders a URL-validated `sap.m.Image` in display mode.
     *
     * @param metadata The property metadata.
     * @param bindingPath The JSON path bound to this control.
     * @param modelName The UI5 JSONModel name.
     * @param engineScopeId The deterministic scope ID.
     * @returns {Control} The configured Image control.
     */
    protected renderDisplayControl(
        metadata: IPropertyMetadata,
        bindingPath: string,
        modelName: string,
        engineScopeId?: string
    ): Control {
        return this.renderSafeImageDisplay(metadata, bindingPath, modelName, engineScopeId, I18n.getText(TEXT_KEY.hardwareImageAlt));
    }
}
