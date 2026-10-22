/**
 * @file RichTextPlugin.ts
 * @description Renders a RichTextControl component in edit mode and a FormattedText in display mode.
 */

import { HardwareControlPlugin } from "./HardwareControlPlugin";
import { IPropertyMetadata } from "../../interfaces/ISchema";
import Control from "sap/ui/core/Control";
import RichTextControl from "../../controls/RichTextControl";
import FormattedTextControl from "sap/m/FormattedText";

/**
 * Plugin responsible for rendering the `RichTextControl` WYSIWYG HTML editor.
 *
 * @namespace nz.co.siliconst.ui5.metaui.plugins.controls
 * @public
 */
export class RichTextPlugin extends HardwareControlPlugin<RichTextControl> {
    protected readonly HardwareControlClass = RichTextControl;

    /**
     * Renders a `sap.m.FormattedText` control in display mode.
     *
     * @param metadata The property metadata.
     * @param bindingPath The JSON path bound to this control.
     * @param modelName The UI5 JSONModel name.
     * @param engineScopeId The deterministic scope ID.
     * @returns {Control} The configured FormattedText control.
     */
    protected renderDisplayControl(
        metadata: IPropertyMetadata,
        bindingPath: string,
        modelName: string,
        engineScopeId?: string
    ): Control {
        this.control = new FormattedTextControl({
            id: this.generateStableId(engineScopeId, bindingPath),
            htmlText: this.generateBindingInfo(bindingPath, modelName) as unknown as string
        });
        this.applyCommonDirectives(this.control, metadata, modelName);
        return this.control;
    }
}
