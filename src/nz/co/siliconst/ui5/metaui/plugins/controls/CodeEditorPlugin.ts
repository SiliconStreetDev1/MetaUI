/**
 * @file CodeEditorPlugin.ts
 * @description Renders a sap.ui.codeeditor.CodeEditor for editing source code/JSON.
 */

import { BasePlugin } from "./BasePlugin";
import { IPropertyMetadata } from "../../interfaces/ISchema";
import Control from "sap/ui/core/Control";

/**
 * Handles rendering logic for code editing.
 * Requires the `sap.ui.codeeditor` library to be loaded.
 * 
 * @namespace nz.co.siliconst.ui5.metaui.plugins.controls
 * @public
 */
export class CodeEditorPlugin extends BasePlugin {
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

    private adjustHeight(): void {
        if (!this.control) return;
        const val = (this.control as unknown as { getValue: () => unknown }).getValue() || "";
        const lines = val.split(/\r\n|\r|\n/).length;
        // 18px per line + 20px padding, minimum 100px
        const newHeight = Math.max(100, (lines * 18) + 20);
        (this.control as unknown).setHeight(newHeight + "px");
    }

    public render(fieldMetadata: IPropertyMetadata, bindingPath: string, modelName: string = "meta", engineScopeId?: string, onChange?: (isValid: boolean, fieldKey?: string) => void): Control {
        this.onChange = onChange;
        this.metadata = fieldMetadata;
        this.fieldKey = bindingPath.replace("/", ""); // For EventBus
        
        sap.ui.requireSync("sap/ui/codeeditor/CodeEditor");
        const CodeEditor = sap.ui.require("sap/ui/codeeditor/CodeEditor");
        
        this.control = new CodeEditor({
            id: this.generateStableId(engineScopeId, bindingPath),
            value: `{${modelName}>${bindingPath}}`,
            type: fieldMetadata.ui?.args || "javascript", // will be dynamically overridden if args is missing
            editable: this.isDisplayMode ? false : !fieldMetadata.ui?.readOnly,
            height: "100px", // Initial minimum height
            width: "100%",
            change: () => {
                const result = this.validate();
                if (this.onChange) {
                    this.onChange(result.isValid, this.fieldKey);
                }
                
                // If language isn't explicitly defined, try to guess it dynamically
                if (!fieldMetadata.ui?.args) {
                    const currentVal = (this.control as unknown as { getValue: () => unknown }).getValue();
                    const detectedType = this.detectLanguage(currentVal);
                    if ((this.control as unknown).getType() !== detectedType) {
                        (this.control as unknown).setType(detectedType);
                    }
                }
                
                this.adjustHeight();
            }
        });

        // Clean architecture: Wait for the model context, then attach safely to the binding itself.
        // No timeouts, no DOM hacks, pure UI5 Eventing.
        (this.control as unknown).attachEventOnce("modelContextChange", () => {
            const oBinding = (this.control as unknown).getBinding("value");
            
            const initLogic = () => {
                if (this.control) {
                    const currentVal = (this.control as unknown as { getValue: () => unknown }).getValue();
                    if (!fieldMetadata.ui?.args) {
                        (this.control as unknown).setType(this.detectLanguage(currentVal));
                    }
                    this.adjustHeight();
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

    protected getValue(): any {
        return this.control ? (this.control as unknown as { getValue: () => unknown }).getValue() : null;
    }

    protected applyState(): void {
        if (this.control && this.metadata) {
            if (this.isDisplayMode) return;
            (this.control as unknown).setEditable(!this.metadata.ui?.readOnly);
        }
    }
}
