/**
 * @file CodeEditorPlugin.ts
 * @description Renders a sap.ui.codeeditor.CodeEditor control for source code or raw JSON editing.
 */

import { TextLikeInputPlugin } from "./TextLikeInputPlugin";
import { IPropertyMetadata } from "../../interfaces/ISchema";
import Control from "sap/ui/core/Control";
import Event from "sap/ui/base/Event";
import CodeEditor from "sap/ui/codeeditor/CodeEditor";

/** Pixel height of one rendered editor line, used to translate `ui.rows` into a CSS height. */
const LINE_HEIGHT_PX = 18;

/** Vertical padding added on top of the `ui.rows` line budget. */
const EDITOR_PADDING_PX = 20;

/** Height applied when neither `ui.options.height` nor `ui.rows` is supplied. */
const DEFAULT_EDITOR_HEIGHT = "250px";

/**
 * Plugin responsible for rendering syntax-highlighted code editors (`sap.ui.codeeditor.CodeEditor`).
 *
 * @namespace nz.co.siliconst.ui5.metaui.plugins.controls
 * @internal
 */
export class CodeEditorPlugin extends TextLikeInputPlugin {
    protected override readonly supportsExpandDialog: boolean = true;

    /**
     * Resolves the Ace syntax mode from `ui.options.language`, falling back to the generic `ui.args`
     * directive that the same widget documents, and finally to `json`.
     *
     * @param metadata The specific JSON schema properties for this field.
     * @returns {string} The Ace language identifier.
     */
    private resolveLanguage(metadata: IPropertyMetadata): string {
        if (metadata.ui?.options && typeof metadata.ui.options.language === "string") {
            return metadata.ui.options.language;
        }
        return typeof metadata.ui?.args === "string" ? metadata.ui.args : "json";
    }

    /**
     * Resolves the editor height from `ui.options.height`, or from the shared `ui.rows` directive that
     * `TextAreaPlugin` honours, so a row count sizes both multi-line widgets identically.
     *
     * @param metadata The specific JSON schema properties for this field.
     * @returns {string} The CSS height for the editor.
     */
    private resolveHeight(metadata: IPropertyMetadata): string {
        if (metadata.ui?.options && typeof metadata.ui.options.height === "string") {
            return metadata.ui.options.height;
        }
        const rows =
            typeof metadata.ui?.rows === "number"
                ? metadata.ui.rows
                : metadata.ui?.options && typeof metadata.ui.options.rows === "number"
                  ? metadata.ui.options.rows
                  : undefined;
        return typeof rows === "number" && rows > 0
            ? `${rows * LINE_HEIGHT_PX + EDITOR_PADDING_PX}px`
            : DEFAULT_EDITOR_HEIGHT;
    }

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
        return new CodeEditor({
            id: this.generateStableId(engineScopeId, bindingPath),
            value: this.generateBindingInfo(bindingPath, modelName) as unknown as string,
            type: this.resolveLanguage(metadata),
            height: this.resolveHeight(metadata),
            width: "100%",
            editable: this.isControlEditable(),
            change: (oEvent: Event) => {
                this.notifyChange((oEvent.getSource() as Control).getId());
            }
        });
    }

    /**
     * Renders a non-editable `sap.ui.codeeditor.CodeEditor` in display mode. The inherited `sap.m.Text`
     * collapses a multi-line document onto a single unformatted line and drops syntax highlighting, which
     * makes a read-only form unable to show the payload it is displaying.
     *
     * @param metadata The property metadata.
     * @param bindingPath The property binding path.
     * @param modelName The UI5 JSONModel alias.
     * @param engineScopeId The deterministic scope ID.
     * @returns {Control} The read-only CodeEditor control.
     */
    protected override renderDisplayControl(
        metadata: IPropertyMetadata,
        bindingPath: string,
        modelName: string,
        engineScopeId?: string
    ): Control {
        this.control = new CodeEditor({
            id: this.generateStableId(engineScopeId, bindingPath),
            value: this.generateBindingInfo(bindingPath, modelName) as unknown as string,
            type: this.resolveLanguage(metadata),
            height: this.resolveHeight(metadata),
            width: "100%",
            editable: false,
            // A read-only viewer must not nag about syntax errors in data the user cannot fix. This also keeps
            // the Ace background worker out of display mode, which is pure overhead when nothing is edited.
            syntaxHints: false
        });
        this.applyCommonDirectives(this.control, metadata, modelName);
        return this.control;
    }
}
