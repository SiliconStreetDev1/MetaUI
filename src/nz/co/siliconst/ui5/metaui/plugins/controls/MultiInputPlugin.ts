/**
 * @file MultiInputPlugin.ts
 * @description Renders a sap.m.MultiInput for primitive arrays (e.g. arrays of strings).
 */

import { BasePlugin } from "./BasePlugin";
import { IPropertyMetadata } from "../../interfaces/ISchema";
import MultiInput from "sap/m/MultiInput";
import Token from "sap/m/Token";
import Control from "sap/ui/core/Control";
import TextControl from "sap/m/Text";
import JSONModel from "sap/ui/model/json/JSONModel";
import Event from "sap/ui/base/Event";
import Context from "sap/ui/model/Context";

/**
 * Handles rendering logic for arrays of primitive strings.
 * Users can type custom strings and press Enter to add them as tokens.
 * 
 * @namespace nz.co.siliconst.ui5.metaui.plugins.controls
 * @public
 */
export class MultiInputPlugin extends BasePlugin {
    /**
     * Renders a `sap.m.MultiInput` component.
     * 
     * @param fieldMetadata The specific JSON schema properties for this field.
     * @param bindingPath The JSON path bound to this control.
     * @param modelName The UI5 JSONModel name.
     * @param engineScopeId The deterministic scope ID.
     * @param onChange The callback fired on value change.
     * @returns {Control} The configured MultiInput control.
     */
    public render(fieldMetadata: IPropertyMetadata,  bindingPath: string,  modelName: string = "meta", engineScopeId?: string, onChange?: (isValid: boolean, fieldKey?: string) => void): Control {
        this.onChange = onChange;
        this.metadata = fieldMetadata;

        if (!this.isEditable) {
            this.control = new TextControl({
                id: this.generateStableId(engineScopeId, bindingPath),
                text: {
                    path: `${modelName}>${bindingPath}`,
                    formatter: (val: unknown[]) => Array.isArray(val) ? val.join(", ") : ""
                }
            });
            this.applyCommonDirectives(this.control, fieldMetadata, modelName);
            return this.control as Control;
        }
        
        const mi = new MultiInput({
            id: this.generateStableId(engineScopeId, bindingPath),
            enabled: !fieldMetadata.ui?.readOnly,
            placeholder: fieldMetadata.ui?.label || "Type and press Enter...",
            showValueHelp: false, // We don't have a list of options for primitive tags
            tokenUpdate: (oEvent: Event) => {
                const params = oEvent.getParameters();
                const type = params.type;
                
                if (type === "removed") {
                    const model = mi.getModel(modelName) as JSONModel;
                    
                    // Get current array from model
                    const rawArr = model.getProperty(bindingPath);
                    const arr: string[] = Array.isArray(rawArr) ? [...rawArr] : [];

                    const removedTokens = params.removedTokens as Token[];
                    removedTokens.forEach(t => {
                        const text = t.getText();
                        const idx = arr.indexOf(text);
                        if (idx > -1) {
                            arr.splice(idx, 1);
                        }
                    });
                    
                    // Update model
                    model.setProperty(bindingPath, arr);
                    
                    // Trigger engine validation/extraction
                    const result = this.validateAndApplyVisualState();
                    if (this.onChange) {
                        this.onChange(result.isValid, this.fieldKey);
                    }
                }
            }
        });

        // Add validator to instantly accept typed text, update model, and clear input
        mi.addValidator((args: { text: string }) => {
            const text = args.text?.trim();
            if (text) {
                const model = mi.getModel(modelName) as JSONModel;
                const rawArr = model.getProperty(bindingPath);
                const arr: string[] = Array.isArray(rawArr) ? [...rawArr] : [];
                
                arr.push(text);
                model.setProperty(bindingPath, arr);
                
                // Clear the input value immediately
                mi.setValue("");
                
                // Trigger engine validation/extraction
                const result = this.validateAndApplyVisualState();
                if (this.onChange) {
                    this.onChange(result.isValid, this.fieldKey);
                }
            }
            // Return null to explicitly prevent MultiInput from modifying the bound aggregation
            return null;
        });

        // Bind existing strings to tokens using a factory function
        mi.bindAggregation("tokens", {
            path: `${modelName}>${bindingPath}`,
            factory: (sId: string, oContext: Context) => {
                const text = (oContext.getObject() as string) || "";
                return new Token(sId, { key: text, text: text });
            }
        });

        this.control = mi;
        this.applyCommonDirectives(this.control, fieldMetadata, modelName);
        return this.control as Control;
    }

    /**
     * Retrieves the current primitive array from the model.
     * @returns {unknown} The array of string tokens.
     */
    protected getValue(): unknown {
        if (!this.control) return [];
        const tokens = (this.control as MultiInput).getTokens();
        return tokens.map(t => t.getText());
    }

    /**
     * Applies dynamic read-only state.
     */
    protected applyState(): void {
        if (this.control && this.metadata) {
            if (!this.isEditable) return;
            (this.control as MultiInput).setEnabled(!this.metadata.ui?.readOnly);
        }
    }
}
