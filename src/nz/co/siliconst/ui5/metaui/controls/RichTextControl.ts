/**
 * @file RichTextControl.ts
 * @description Custom UI5 control wrapping sap.ui.richtexteditor.RichTextEditor with fallback to sap.m.TextArea.
 *
 * @namespace nz.co.siliconst.ui5.metaui.controls
 */
import BaseHardwareControl, { $BaseHardwareControlSettings } from "./BaseHardwareControl";
import BaseHardwareControlRenderer from "./BaseHardwareControlRenderer";
import VBox from "sap/m/VBox";
import TextArea from "sap/m/TextArea";
import Control from "sap/ui/core/Control";
import Event from "sap/ui/base/Event";
import RichTextEditor, {
    RichTextEditor$ChangeEventParameters
} from "sap/ui/richtexteditor/RichTextEditor";
import { Logger } from "../utils/Logger";

/**
 * Custom UI5 control that lazily loads `sap.ui.richtexteditor.RichTextEditor` (or falls back to `sap.m.TextArea`
 * when the `sap.ui.richtexteditor` library is not available) and emits `capture` on content changes.
 *
 * @namespace nz.co.siliconst.ui5.metaui.controls
 * @internal
 */
export default class RichTextControl extends BaseHardwareControl {
    static renderer = BaseHardwareControlRenderer;
    private editorControl: Control | null = null;
    private container!: VBox;

    constructor(idOrSettings?: string | $BaseHardwareControlSettings, settings?: $BaseHardwareControlSettings) {
        super(idOrSettings, settings);
    }

    /**
     * Initializes the internal VBox container with a synchronous TextArea editor and upgrades to
     * `sap.ui.richtexteditor.RichTextEditor` when the library is loaded in the UI5 environment.
     */
    public init(): void {
        if (BaseHardwareControl.prototype.init) {
            BaseHardwareControl.prototype.init.call(this);
        }

        this.container = new VBox({
            width: "100%"
        });

        this.setAggregation("_content", this.container);
        this.mountFallbackTextArea();
        this.instantiateEditor();
    }

    /**
     * Sanitizes raw HTML strings in fallback mode by stripping `<script>` blocks, inline `on*` event attributes,
     * and `javascript:` protocol URIs.
     *
     * @param raw The raw HTML string.
     * @returns {string} The sanitized HTML string.
     */
    private static sanitizeHtml(raw: string): string {
        if (!raw) {
            return "";
        }
        return raw
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
            .replace(/\bon[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
            .replace(/javascript\s*:/gi, "");
    }

    /**
     * Mounts a synchronous `sap.m.TextArea` editor so the control immediately renders with non-zero
     * geometry and interactive editing before or without `sap.ui.richtexteditor`.
     */
    private mountFallbackTextArea(): void {
        const currentVal = RichTextControl.sanitizeHtml((this.getProperty("value") as string) || "");
        const isReadOnly = Boolean(this.getProperty("readOnly"));
        const fallbackTa = new TextArea({
            width: "100%",
            rows: 6,
            value: currentVal,
            editable: !isReadOnly,
            valueState: this.getValueState(),
            valueStateText: this.getValueStateText(),
            change: () => {
                const newVal = RichTextControl.sanitizeHtml(fallbackTa.getValue());
                if (fallbackTa.getValue() !== newVal) {
                    fallbackTa.setValue(newVal);
                }
                this.setProperty("value", newVal, true);
                this.fireEvent("capture", { value: newVal });
            }
        });
        this.editorControl = fallbackTa;
        this.container.destroyItems();
        this.container.addItem(fallbackTa);
    }

    /**
     * Upgrades to `sap/ui/richtexteditor/RichTextEditor` when the library is registered in the UI5 core.
     */
    private instantiateEditor(): void {
        const loadedLibs = sap.ui.getCore().getLoadedLibraries?.() || {};
        if (!loadedLibs["sap.ui.richtexteditor"]) {
            return;
        }
        sap.ui.require(
            ["sap/ui/richtexteditor/RichTextEditor"],
            (RichTextEditorClass: typeof RichTextEditor) => {
                if (this.isDestroyed()) {
                    return;
                }
                const currentVal = (this.getProperty("value") as string) || "";
                const isReadOnly = Boolean(this.getProperty("readOnly"));

                const rte = new RichTextEditorClass({
                    width: "100%",
                    height: "250px",
                    value: currentVal,
                    editable: !isReadOnly,
                    showGroupFont: true,
                    showGroupInsert: true,
                    change: (oEvent: Event<RichTextEditor$ChangeEventParameters>) => {
                        const newVal = oEvent.getParameters()?.newValue ?? rte.getValue();
                        this.setProperty("value", newVal, true);
                        this.fireEvent("capture", { value: newVal });
                    }
                });

                this.editorControl = rte;
                this.container.destroyItems();
                this.container.addItem(rte);
            },
            () => {
                Logger.debug(
                    "[MetaUI RichTextControl]",
                    "sap.ui.richtexteditor not available; keeping sap.m.TextArea.",
                    "RichTextControl"
                );
            }
        );
    }

    /**
     * Synchronizes `value` and `editable` with the inner editor before rendering.
     */
    public onBeforeRendering(): void {
        this.syncEditorState();
    }

    /**
     * Synchronizes `readOnly`, `valueState`, and `valueStateText` with the active inner editor.
     */
    protected override syncHardwareState(): void {
        this.syncEditorState();
    }

    /**
     * Updates the `value` property and propagates it to the underlying editor instance.
     *
     * @param sValue The new HTML string value.
     * @returns {this} This control instance for chaining.
     */
    public setValue(sValue: string | null): this {
        const sanitized = sValue ? RichTextControl.sanitizeHtml(sValue) : sValue;
        this.setProperty("value", sanitized, true);
        this.syncEditorState();
        return this;
    }

    /**
     * Propagates the current `value` and `readOnly` state to the active inner editor (`RichTextEditor` or `TextArea`).
     */
    private syncEditorState(): void {
        if (!this.editorControl) {
            return;
        }
        const currentVal = RichTextControl.sanitizeHtml((this.getProperty("value") as string) || "");
        const isReadOnly = Boolean(this.getProperty("readOnly"));

        if (this.editorControl instanceof TextArea) {
            if (this.editorControl.getValue() !== currentVal) {
                this.editorControl.setValue(currentVal);
            }
            this.editorControl.setEditable(!isReadOnly);
            this.editorControl.setValueState(this.getValueState());
            this.editorControl.setValueStateText(this.getValueStateText());
        } else {
            const rte = this.editorControl as RichTextEditor;
            if (typeof rte.getValue === "function" && typeof rte.setValue === "function" && rte.getValue() !== currentVal) {
                rte.setValue(currentVal);
            }
            if (typeof rte.setEditable === "function") {
                rte.setEditable(!isReadOnly);
            }
        }
    }

    /**
     * Releases the active inner editor reference when the control is destroyed.
     */
    public exit(): void {
        this.editorControl = null;
    }
}
