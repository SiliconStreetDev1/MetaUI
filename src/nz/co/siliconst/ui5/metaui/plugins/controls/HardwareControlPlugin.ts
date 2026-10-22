/**
 * @file HardwareControlPlugin.ts
 * @description Shared abstract base class for hardware/media control plugins (Signature, Camera, VoiceInput, Geolocation, RichText).
 */

import { BasePlugin } from "./BasePlugin";
import { IPropertyMetadata } from "../../interfaces/ISchema";
import BaseHardwareControl, { $BaseHardwareControlSettings } from "../../controls/BaseHardwareControl";
import Control from "sap/ui/core/Control";
import Event from "sap/ui/base/Event";
import ImageControl from "sap/m/Image";
import { UrlValidator } from "../../utils/UrlValidator";

/**
 * Shared abstract base class for plugins wrapping a `BaseHardwareControl` subclass.
 * Consolidates edit-mode hardware control instantiation, `capture` event notification,
 * `getValue`, `applyState`, and safe image display-mode rendering.
 *
 * @namespace nz.co.siliconst.ui5.metaui.plugins.controls
 * @public
 */
export abstract class HardwareControlPlugin<T extends BaseHardwareControl = BaseHardwareControl> extends BasePlugin {
    protected abstract readonly HardwareControlClass: new (settings?: $BaseHardwareControlSettings) => T;

    /**
     * Renders the display-mode control when `this.isEditable === false`.
     *
     * @param metadata The property metadata.
     * @param bindingPath The property binding path.
     * @param modelName The UI5 JSONModel name.
     * @param engineScopeId The deterministic scope ID.
     * @returns {Control} The display-mode UI5 control.
     */
    protected abstract renderDisplayControl(
        metadata: IPropertyMetadata,
        bindingPath: string,
        modelName: string,
        engineScopeId?: string
    ): Control;

    /**
     * Helper for `SignaturePlugin` and `CameraPlugin` to render a URL-validated `sap.m.Image` in display mode.
     *
     * @param metadata The property metadata.
     * @param bindingPath The property binding path.
     * @param modelName The UI5 JSONModel name.
     * @param engineScopeId The deterministic scope ID.
     * @param defaultAlt Fallback alt text when `metadata.ui.label` is omitted.
     * @returns {Control} The configured `sap.m.Image` control.
     */
    protected renderSafeImageDisplay(
        metadata: IPropertyMetadata,
        bindingPath: string,
        modelName: string,
        engineScopeId: string | undefined,
        defaultAlt: string
    ): Control {
        const safeSrc = this.generateBindingInfo(bindingPath, modelName, undefined, {
            formatter: (val: unknown) => (UrlValidator.isSafeImageSource(val) ? val.trim() : "")
        });
        this.control = new ImageControl({
            id: this.generateStableId(engineScopeId, bindingPath),
            src: safeSrc as unknown as string,
            width: "400px",
            height: "150px",
            alt: metadata.ui?.label || defaultAlt
        });
        this.applyCommonDirectives(this.control, metadata, modelName);
        return this.control;
    }

    /**
     * Renders the `BaseHardwareControl` component in edit mode or delegates to `renderDisplayControl` in display mode.
     *
     * @param metadata The specific JSON schema properties for this field.
     * @param bindingPath The JSON path bound to this control.
     * @param modelName The UI5 JSONModel name.
     * @param engineScopeId The deterministic scope ID.
     * @param onChange The callback fired on value change.
     * @returns {Control} The configured hardware or display control.
     */
    public render(
        metadata: IPropertyMetadata,
        bindingPath: string,
        modelName: string = "meta",
        engineScopeId?: string,
        onChange?: (isValid: boolean, fieldKey?: string, errorMessage?: string, controlId?: string) => void
    ): Control {
        this.initialize(metadata, bindingPath, modelName, onChange);

        if (!this.isEditable) {
            return this.renderDisplayControl(metadata, bindingPath, modelName, engineScopeId);
        }

        const HwClass = this.HardwareControlClass;
        const hwControl = new HwClass({
            id: this.generateStableId(engineScopeId, bindingPath),
            value: this.generateBindingInfo(bindingPath, modelName),
            schemaMetadata: metadata,
            readOnly: !this.isControlEditable()
        });

        this.control = hwControl;
        this.applyCommonDirectives(this.control, metadata, modelName);

        hwControl.attachEvent("capture", (oEvent: Event) => {
            this.notifyChange((oEvent.getSource() as Control).getId());
        });

        return this.control;
    }

    /**
     * Retrieves the current `value` property from the `BaseHardwareControl` instance (or bound model in display mode).
     *
     * @param sourceControl Optional cloned control instance for table rows.
     * @returns {unknown} The current hardware value.
     */
    protected getValue(sourceControl?: Control): unknown {
        if (!this.isEditable) {
            return this.getModelValue(sourceControl) ?? null;
        }
        const target = sourceControl || this.control;
        return target ? target.getProperty("value") : null;
    }

    /**
     * Applies dynamic `readOnly` state to the `BaseHardwareControl` instance.
     */
    protected applyState(): void {
        if (this.control && this.metadata && this.isEditable) {
            this.control.setProperty("readOnly", !this.isControlEditable());
        }
    }
}
