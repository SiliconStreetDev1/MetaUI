/**
 * @file CodeEditorPlugin.ts
 * @description Renders a sap.ui.codeeditor.CodeEditor for editing source code/JSON.
 */

import { BasePlugin } from "./BasePlugin";
import { IPropertyMetadata } from "../../interfaces/ISchema";
import Control from "sap/ui/core/Control";
import CodeEditor from "sap/ui/codeeditor/CodeEditor";
import HBox from "sap/m/HBox";
import Button from "sap/m/Button";
import Dialog from "sap/m/Dialog";
import FlexItemData from "sap/m/FlexItemData";

/**
 * Handles rendering logic for code editing.
 * Requires the `sap.ui.codeeditor` library to be loaded.
 * 
 * @namespace nz.co.siliconst.ui5.metaui.plugins.controls
 * @public
 */
export class CodeEditorPlugin extends BasePlugin {
    private codeEditorRef?: CodeEditor;

    /**
     * Infers the language type from the content.
     * @param value The raw string.
     * @returns The language string.
     */
    private detectLanguage(value: string): string {
        if (!value || typeof value !== "string") return "javascript";
        
        const trimmed = value.trim();
        if (trimmed === "") return "javascript";

        // 1. JSON
        if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
            try {
                JSON.parse(trimmed);
                return "json";
            } catch (e) {
                // Not valid JSON, continue testing
            }
        }

        // 2. XML / HTML
        if (/^\s*<[\s\S]*>\s*$/.test(trimmed)) {
            return "xml";
        }

        // 3. Fallback to JavaScript
        return "javascript";
    }

    /**
     * Dynamically adjusts the height of the editor based on content lines.
     */
    private adjustHeight(): void {
        if (!this.codeEditorRef) return;
        
        // If a static height was requested via ui.rows, do not auto-adjust
        if (this.metadata?.ui?.rows) return;
        
        const val = this.codeEditorRef.getProperty('value') || "";
        const lines = val.split(/\r\n|\r|\n/).length;
        // 18px per line + 20px padding, minimum 100px
        const newHeight = Math.max(100, (lines * 18) + 20);
        this.codeEditorRef.setHeight(newHeight + "px");
    }

    /**
     * Renders a `sap.ui.codeeditor.CodeEditor` component.
     * 
     * @param fieldMetadata The specific JSON schema properties for this field.
     * @param bindingPath The JSON path bound to this control.
     * @param modelName The UI5 JSONModel name.
     * @param engineScopeId The deterministic scope ID.
     * @param onChange The callback fired on value change.
     * @returns {Control} The configured CodeEditor control.
     */
    public render(fieldMetadata: IPropertyMetadata, bindingPath: string, modelName: string = "meta", engineScopeId?: string, onChange?: (isValid: boolean, fieldKey?: string, errorMessage?: string, controlId?: string) => void): Control {
        this.onChange = onChange;
        this.metadata = fieldMetadata;
        this.fieldKey = bindingPath.replace("/", ""); // For EventBus
        
        const schemaRows = fieldMetadata.ui?.rows;
        const useDialog = fieldMetadata.ui?.expandable !== false;
        const baseHeight = schemaRows ? (schemaRows * 18 + 20) + "px" : "200px"; // 200px is ~10 rows
        
        const codeEditor = new CodeEditor({
            id: this.generateStableId(engineScopeId, bindingPath),
            value: this.generateBindingInfo(bindingPath, modelName),
            type: fieldMetadata.ui?.args || "javascript", // will be dynamically overridden if args is missing
            editable: !this.isEditable ? false : !fieldMetadata.ui?.readOnly,
            height: baseHeight, // Initial minimum height
            width: "100%",
            change: () => {
                const result = this.validate();
                if (this.onChange) {
                    this.onChange(result.isValid, this.fieldKey, result.errorMessage);
                }
                
                // If language isn't explicitly defined, try to guess it dynamically
                if (!fieldMetadata.ui?.args) {
                    const currentVal = this.codeEditorRef!.getProperty('value');
                    const detectedType = this.detectLanguage(currentVal);
                    if (this.codeEditorRef!.getType() !== detectedType) {
                        this.codeEditorRef!.setType(detectedType);
                    }
                }
                
                this.adjustHeight();
            }
        });
        
        this.codeEditorRef = codeEditor;
        this.mainControl = codeEditor;

        if (useDialog) {
            const expandBtn = new Button({
                icon: "sap-icon://full-screen",
                type: "Transparent",
                tooltip: "Expand Code Editor",
                press: () => {
                    const dlg = new Dialog({
                        title: fieldMetadata.title || fieldMetadata.ui?.label || "Edit Code",
                        contentWidth: "80%",
                        contentHeight: "80%",
                        verticalScrolling: false,
                        resizable: true,
                        content: new CodeEditor({
                            value: this.generateBindingInfo(bindingPath, modelName),
                            type: this.codeEditorRef!.getType(),
                            width: "100%",
                            height: "100%",
                            editable: !this.isEditable ? false : !fieldMetadata.ui?.readOnly
                        }),
                        beginButton: new Button({
                            text: "Close",
                            press: () => dlg.close()
                        }),
                        afterClose: () => dlg.destroy()
                    });
                    this.control?.addDependent(dlg);
                    dlg.open();
                }
            });

            codeEditor.setLayoutData(new FlexItemData({ growFactor: 1 }));

            this.control = new HBox({
                width: "100%",
                alignItems: "Start",
                items: [codeEditor, expandBtn]
            });
        } else {
            this.control = codeEditor;
        }

        // Clean architecture: Wait for the model context, then attach safely to the binding itself.
        // No timeouts, no DOM hacks, pure UI5 Eventing.
        this.codeEditorRef.attachEventOnce("modelContextChange", () => {
            const oBinding = this.codeEditorRef!.getBinding("value");
            
            const initLogic = () => {
                if (this.codeEditorRef) {
                    const currentVal = this.codeEditorRef.getProperty('value');
                    if (!fieldMetadata.ui?.args) {
                        this.codeEditorRef.setType(this.detectLanguage(currentVal));
                    }
                    this.adjustHeight();
                    // CRITICAL: Ace Editor sometimes loses its constructor `editable` flag 
                    // when the model asynchronously injects a new value string. 
                    // We must forcefully re-apply the correct state after binding.
                    this.applyState();
                }
            };

            if (oBinding) {
                // Attach for future model changes
                oBinding.attachChange(initLogic);
            }
            
            // Execute immediately in case the model is synchronous (JSONModel)
            initLogic();
        });

        this.applyCommonDirectives(this.control, fieldMetadata, modelName);

        return this.control as Control;
    }

    /**
     * Retrieves the current code string.
     * @returns {unknown} The code value.
     */
    protected getValue(): unknown {
        return this.codeEditorRef ? this.codeEditorRef.getProperty('value') : null;
    }

    /**
     * Applies dynamic read-only state.
     */
    protected applyState(): void {
        if (this.codeEditorRef && this.metadata) {
            if (!this.isEditable) {
                this.codeEditorRef.setEditable(false);
            } else {
                this.codeEditorRef.setEditable(!this.metadata.ui?.readOnly);
            }
        }
    }
}
