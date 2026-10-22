/**
 * @file TextLikeInputPlugin.ts
 * @description Shared abstract base class for text-input control plugins (String, Email, Password, TextArea, CodeEditor, LiveSearch, RemoteValueHelp, BarcodeScanner).
 */

import { BasePlugin } from "./BasePlugin";
import { IPropertyMetadata } from "../../interfaces/ISchema";
import Control from "sap/ui/core/Control";
import HBox from "sap/m/HBox";

/**
 * Structural interface for SAPUI5 text-like controls (`sap.m.Input`, `sap.m.TextArea`, `sap.ui.codeeditor.CodeEditor`).
 *
 * @namespace nz.co.siliconst.ui5.metaui.plugins.controls
 * @public
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
 * @public
 */
export abstract class TextLikeInputPlugin extends BasePlugin {
    protected readonly syncPlaceholderAndMaxLength: boolean = false;

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
        this.applyCommonDirectives(this.control, metadata, modelName);
        return this.control;
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

