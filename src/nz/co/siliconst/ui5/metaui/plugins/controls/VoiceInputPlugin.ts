/**
 * @file VoiceInputPlugin.ts
 * @description Renders a VoiceInputControl component for speech-to-text transcription.
 */

import { HardwareControlPlugin } from "./HardwareControlPlugin";
import { IPropertyMetadata } from "../../interfaces/ISchema";
import Control from "sap/ui/core/Control";
import VoiceInputControl from "../../controls/VoiceInputControl";
import { PropertyBindingInfo } from "sap/ui/base/ManagedObject";

/**
 * Plugin responsible for rendering the hardware `VoiceInputControl` speech-to-text widget.
 *
 * @namespace nz.co.siliconst.ui5.metaui.plugins.controls
 * @internal
 */
export class VoiceInputPlugin extends HardwareControlPlugin<VoiceInputControl> {
    protected readonly HardwareControlClass = VoiceInputControl;

    /**
     * Renders a `sap.m.Text` control in display mode, sanitizing empty/null strings.
     *
     * @param _metadata The property metadata.
     * @param bindingPath The JSON path bound to this control.
     * @param modelName The UI5 JSONModel name.
     * @param engineScopeId The deterministic scope ID.
     * @returns {Control} The configured Text control.
     */
    protected renderDisplayControl(
        _metadata: IPropertyMetadata,
        bindingPath: string,
        modelName: string,
        engineScopeId?: string
    ): Control {
        const voiceBinding = this.generateBindingInfo(bindingPath, modelName, undefined, {
            formatter: (val: unknown) => {
                if (!val || val === "undefined" || val === "null") {
                    return "";
                }
                return String(val);
            }
        }) as PropertyBindingInfo;
        return this.createDisplayText(engineScopeId, bindingPath, voiceBinding);
    }
}
