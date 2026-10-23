/**
 * @file TextLikeInputPlugin.ts
 * @description Shared abstract base class for text-input control plugins (String, Email, Password, TextArea, CodeEditor, LiveSearch, RemoteValueHelp).
 */

import { BasePlugin } from "./BasePlugin";
import { IPropertyMetadata } from "../../interfaces/ISchema";
import Control from "sap/ui/core/Control";
import HBox from "sap/m/HBox";
import Button from "sap/m/Button";
import Dialog from "sap/m/Dialog";
import FlexItemData from "sap/m/FlexItemData";
import { ButtonType, FlexAlignItems } from "sap/m/library";
import { I18n, TEXT_KEY } from "../../utils/I18n";

/**
 * Structural interface for SAPUI5 text-like controls (`sap.m.Input`, `sap.m.TextArea`, `sap.ui.codeeditor.CodeEditor`).
 *
 * @namespace nz.co.siliconst.ui5.metaui.plugins.controls
 * @internal
 */
export interface ITextLikeControl extends Control {
    getValue?(): string;
    setEditable?(bEditable: boolean): this;
    setRequired?(bRequired: boolean): this;
    setPlaceholder?(sPlaceholder: string): this;
    setMaxLength?(iMaxLength: number): this;
}

/**
 * Shared abstract base class for text-input control plugins.
 * Consolidates the `render` skeleton, `getValue` (including the unmounted DOM model-value fallback),
 * and `applyState` across all text-based inputs.
 *
 * @namespace nz.co.siliconst.ui5.metaui.plugins.controls
 * @internal
 */
export abstract class TextLikeInputPlugin extends BasePlugin {
    protected readonly syncPlaceholderAndMaxLength: boolean = false;

    /**
     * Opts the concrete plugin into the `ui.expandable` full-screen editor. Only the two multi-line widgets
     * (`TextAreaPlugin`, `CodeEditorPlugin`) declare it; a single-line `sap.m.Input` gains nothing from an
     * 80% x 80% dialog, so the directive stays inert everywhere else.
     */
    protected readonly supportsExpandDialog: boolean = false;

    /**
     * Renders the editable text control in edit mode or a display control in read-only host mode.
     *
     * @param metadata The specific JSON schema properties for this field.
     * @param bindingPath The JSON path bound to this control.
     * @param modelName The UI5 JSONModel name.
     * @param engineScopeId The deterministic scope ID.
     * @param onChange The callback fired on value change.
     * @returns {Control} The configured editable or display control.
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

        this.control = this.createEditableControl(metadata, bindingPath, modelName, engineScopeId);
        if (this.supportsExpandDialog && metadata.ui?.expandable === true) {
            this.control = this.wrapWithExpandButton(this.control, metadata, bindingPath, modelName);
        }
        this.applyCommonDirectives(this.control, metadata, modelName);
        return this.control;
    }

    /**
     * Wraps the editable control in an `sap.m.HBox` next to a full-screen trigger `sap.m.Button`, keeping the
     * inner widget as `mainControl` so editability, validation state and value reads still target it.
     *
     * @param inner The editable control produced by `createEditableControl`.
     * @param metadata The property metadata.
     * @param bindingPath The property binding path.
     * @param modelName The UI5 JSONModel alias.
     * @returns {Control} The `HBox` wrapper holding the editor and its expand button.
     */
    private wrapWithExpandButton(
        inner: Control,
        metadata: IPropertyMetadata,
        bindingPath: string,
        modelName: string
    ): Control {
        this.mainControl = this.mainControl ?? inner;
        inner.setLayoutData(new FlexItemData({ growFactor: 1 }));
        const expandBtn = new Button({
            icon: "sap-icon://full-screen",
            type: ButtonType.Transparent,
            tooltip: I18n.getText(TEXT_KEY.editorExpand),
            press: () => {
                this.openExpandDialog(metadata, bindingPath, modelName);
            }
        });
        return new HBox({
            width: "100%",
            alignItems: FlexAlignItems.Start,
            items: [inner, expandBtn]
        });
    }

    /**
     * Opens a resizable 80% x 80% modal holding a second instance of the same editor bound to the same path,
     * so edits made full-screen flow back through the shared two-way binding.
     *
     * @param metadata The property metadata.
     * @param bindingPath The property binding path.
     * @param modelName The UI5 JSONModel alias.
     */
    private openExpandDialog(metadata: IPropertyMetadata, bindingPath: string, modelName: string): void {
        const expanded = this.createEditableControl(metadata, bindingPath, modelName);
        if (expanded.getMetadata().hasProperty("height")) {
            expanded.setProperty("height", "100%");
        }
        if (expanded.getMetadata().hasProperty("growing")) {
            expanded.setProperty("growing", false);
        }
        const dialog = new Dialog({
            title: metadata.ui?.label || metadata.title || I18n.getText(TEXT_KEY.editorDialogTitle),
            contentWidth: "80%",
            contentHeight: "80%",
            verticalScrolling: false,
            resizable: true,
            content: [expanded],
            beginButton: new Button({
                text: I18n.getText(TEXT_KEY.editorClose),
                press: () => {
                    dialog.close();
                }
            }),
            afterClose: () => {
                dialog.destroy();
            }
        });
        this.control?.addDependent(dialog);
        dialog.open();
    }

    /**
     * Creates the display-mode control when `this.isEditable === false`.
     * Subclasses such as `PasswordPlugin` can override this to mask or format the display text.
     *
     * @param _metadata The property metadata.
     * @param bindingPath The property binding path.
     * @param _modelName The UI5 JSONModel alias.
     * @param engineScopeId The deterministic scope ID.
     * @returns {Control} The display-mode `sap.m.Text` control.
     */
    protected renderDisplayControl(
        _metadata: IPropertyMetadata,
        bindingPath: string,
        _modelName: string,
        engineScopeId?: string
    ): Control {
        return this.createDisplayText(engineScopeId, bindingPath);
    }

    /**
     * Constructs the concrete editable UI5 control (`Input`, `TextArea`, `CodeEditor`, etc.).
     *
     * @param metadata The property metadata.
     * @param bindingPath The property binding path.
     * @param modelName The UI5 JSONModel alias.
     * @param engineScopeId The deterministic scope ID.
     * @returns {Control} The constructed editable control.
     */
    protected abstract createEditableControl(
        metadata: IPropertyMetadata,
        bindingPath: string,
        modelName: string,
        engineScopeId?: string
    ): Control;

    /**
     * Retrieves the current string value from the text-like control, falling back to the bound model
     * when the control has not yet been mounted into the DOM.
     *
     * @param sourceControl Optional runtime source control (e.g., cloned table cell).
     * @returns {unknown} The current text value.
     */
    protected getValue(sourceControl?: Control): unknown {
        if (!this.isEditable) {
            return this.getModelValue(sourceControl) ?? "";
        }
        let target: Control | undefined = sourceControl ?? this.mainControl ?? this.control;
        if (target instanceof HBox) {
            target = target.getItems()[0];
        }
        const textControl = target as ITextLikeControl | undefined;
        if (!textControl || typeof textControl.getValue !== "function") {
            return this.getModelValue(target) ?? "";
        }
        const val = textControl.getValue();
        if (val === "" && !textControl.getDomRef()) {
            return this.getModelValue(textControl) ?? "";
        }
        return val;
    }

    /**
     * Applies dynamic `readOnly`, `required`, and (when enabled) `placeholder`/`maxLength` state updates.
     */
    protected applyState(): void {
        const target = (this.mainControl ?? this.control) as ITextLikeControl | undefined;
        if (!target || !this.metadata || !this.isEditable) {
            return;
        }
        if (typeof target.setEditable === "function") {
            target.setEditable(this.isControlEditable());
        }
        if (typeof target.setRequired === "function") {
            target.setRequired(this.isRequired());
        }
        if (this.syncPlaceholderAndMaxLength) {
            if (typeof target.setPlaceholder === "function") {
                target.setPlaceholder(this.metadata.ui?.placeholder || "");
            }
            if (typeof target.setMaxLength === "function") {
                target.setMaxLength(this.metadata.maxLength || 0);
            }
        }
    }
}

