/**
 * @file CodeEditorPlugin.ts
 * @description Renders a sap.ui.codeeditor.CodeEditor control for source code or raw JSON editing.
 */

import { TextLikeInputPlugin } from "./TextLikeInputPlugin";
import { IPropertyMetadata } from "../../interfaces/ISchema";
import Control from "sap/ui/core/Control";
import Event from "sap/ui/base/Event";
import CodeEditor from "sap/ui/codeeditor/CodeEditor";

/**
 * Plugin responsible for rendering syntax-highlighted code editors (`sap.ui.codeeditor.CodeEditor`).
 *
 * @namespace nz.co.siliconst.ui5.metaui.plugins.controls
 * @public
 */
export class CodeEditorPlugin extends TextLikeInputPlugin {
    /**
     * Constructs the editable `sap.ui.codeeditor.CodeEditor` component.
     *
     * @param metadata The specific JSON schema properties for this field.
     * @param bindingPath The JSON path bound to this control.
     * @param modelName The UI5 JSONModel name.
     * @param engineScopeId The deterministic scope ID.
     * @returns {Control} The configured CodeEditor control.
     */
    protected createEditableControl(
        metadata: IPropertyMetadata,
        bindingPath: string,
        modelName: string,
        engineScopeId?: string
    ): Control {
        const language =
            metadata.ui?.options && typeof metadata.ui.options.language === "string"
                ? metadata.ui.options.language
                : "json";
        const height =
            metadata.ui?.options && typeof metadata.ui.options.height === "string"
                ? metadata.ui.options.height
                : "250px";

        return new CodeEditor({
            id: this.generateStableId(engineScopeId, bindingPath),
            value: this.generateBindingInfo(bindingPath, modelName) as unknown as string,
            type: language,
            height,
            width: "100%",
            editable: this.isControlEditable(),
            change: (oEvent: Event) => {
                this.notifyChange((oEvent.getSource() as Control).getId());
            }
        });
    }
}
