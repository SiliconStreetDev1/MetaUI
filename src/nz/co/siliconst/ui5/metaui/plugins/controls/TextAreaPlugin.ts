/**
 * @file TextAreaPlugin.ts
 * @description Renders a multi-line sap.m.TextArea control.
 */

import { TextLikeInputPlugin } from "./TextLikeInputPlugin";
import { IPropertyMetadata } from "../../interfaces/ISchema";
import TextArea from "sap/m/TextArea";
import Control from "sap/ui/core/Control";

/**
 * Plugin responsible for rendering multi-line text areas (`sap.m.TextArea`).
 *
 * @namespace nz.co.siliconst.ui5.metaui.plugins.controls
 * @internal
 */
export class TextAreaPlugin extends TextLikeInputPlugin {
    protected override readonly syncPlaceholderAndMaxLength: boolean = true;
    protected override readonly supportsExpandDialog: boolean = true;

    /**
     * Constructs the editable `sap.m.TextArea` component.
     *
     * @param metadata The specific JSON schema properties for this field.
     * @param bindingPath The JSON path bound to this control.
     * @param modelName The UI5 JSONModel name.
     * @param engineScopeId The deterministic scope ID.
     * @returns {Control} The configured TextArea control.
     */
    protected createEditableControl(
        metadata: IPropertyMetadata,
        bindingPath: string,
        modelName: string,
        engineScopeId?: string
    ): Control {
        const rows =
            typeof metadata.ui?.rows === "number"
                ? metadata.ui.rows
                : metadata.ui?.options && typeof metadata.ui.options.rows === "number"
                  ? metadata.ui.options.rows
                  : 4;

        return new TextArea({
            id: this.generateStableId(engineScopeId, bindingPath),
            value: this.generateBindingInfo(bindingPath, modelName) as unknown as string,
            rows,
            // The box starts at `rows` and grows with the text rather than scrolling inside a fixed
            // height. `ui.rows` therefore sets the starting size, and growth stops at four times it so
            // one long value cannot push the rest of the form off the screen. Growing was lost in the
            // 2.0.0 refactor and restored here; `TextLikeInputPlugin` still turns it off explicitly for
            // the full-screen expanded editor, which has its own height.
            growing: true,
            growingMaxLines: rows * 4,
            width: "100%",
            placeholder: metadata.ui?.placeholder || "",
            maxLength: metadata.maxLength || 0,
            required: this.isRequired(),
            change: (oEvent) => {
                const src = oEvent.getSource() as Control;
                this.notifyChange(src.getId());
            }
        });
    }
}
