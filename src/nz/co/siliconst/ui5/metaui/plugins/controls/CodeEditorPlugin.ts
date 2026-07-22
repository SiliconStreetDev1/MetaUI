/**
 * @file CodeEditorPlugin.ts
 * @description Renders a sap.ui.codeeditor.CodeEditor for editing source code/JSON.
 */

import { BasePlugin } from "./BasePlugin";
import { IPropertyMetadata } from "../../interfaces/ISchema";
import Control from "sap/ui/core/Control";
import CodeEditor from "sap/ui/codeeditor/CodeEditor";

/**
 * Handles rendering logic for code editing.
 * Requires the `sap.ui.codeeditor` library to be loaded.
 * 
 * @namespace nz.co.siliconst.ui5.metaui.plugins.controls
 * @public
 */
export class CodeEditorPlugin extends BasePlugin {
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
        if (!this.control) return;
        const val = (this.control as CodeEditor).getValue() || "";
        const lines = val.split(/\r\n|\r|\n/).length;
        // 18px per line + 20px padding, minimum 100px
        const newHeight = Math.max(100, (lines * 18) + 20);
        (this.control as CodeEditor).setHeight(newHeight + "px");
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
    public render(fieldMetadata: IPropertyMetadata, bindingPath: string, modelName: string = "meta", engineScopeId?: string, onChange?: (isValid: boolean, fieldKey?: string) => void): Control {
        this.onChange = onChange;
        this.metadata = fieldMetadata;
        this.fieldKey = bindingPath.replace("/", ""); // For EventBus
        
        
        
        this.control = new CodeEditor({
            id: this.generateStableId(engineScopeId, bindingPath),
            value: `{${modelName}>${bindingPath}}`,
            type: fieldMetadata.ui?.args || "javascript", // will be dynamically overridden if args is missing
            editable: !this.isEditable ? false : !fieldMetadata.ui?.readOnly,
            height: "100px", // Initial minimum height
            width: "100%",
            change: () => {
                const result = this.validateAndApplyVisualState();
                if (this.onChange) {
                    this.onChange(result.isValid, this.fieldKey);
                }
                
                // If language isn't explicitly defined, try to guess it dynamically
                if (!fieldMetadata.ui?.args) {
                    const currentVal = (this.control as CodeEditor).getValue();
                    const detectedType = this.detectLanguage(currentVal);
                    if ((this.control as CodeEditor).getType() !== detectedType) {
                        (this.control as CodeEditor).setType(detectedType);
                    }
                }
                
                this.adjustHeight();
            }
        });

        // Clean architecture: Wait for the model context, then attach safely to the binding itself.
        // No timeouts, no DOM hacks, pure UI5 Eventing.
        (this.control as CodeEditor).attachEventOnce("modelContextChange", () => {
            const oBinding = (this.control as CodeEditor).getBinding("value");
            
            const initLogic = () => {
                if (this.control) {
                    const currentVal = (this.control as CodeEditor).getValue();
                    if (!fieldMetadata.ui?.args) {
                        (this.control as CodeEditor).setType(this.detectLanguage(currentVal));
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
        return this.control ? (this.control as CodeEditor).getValue() : null;
    }

    /**
     * Applies dynamic read-only state.
     */
    protected applyState(): void {
        if (this.control && this.metadata) {
            if (!this.isEditable) {
                (this.control as CodeEditor).setEditable(false);
            } else {
                (this.control as CodeEditor).setEditable(!this.metadata.ui?.readOnly);
            }
        }
    }
}
