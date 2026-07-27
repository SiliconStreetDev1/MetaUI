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
import ListBinding from "sap/ui/model/ListBinding";
import { Logger } from "../../utils/Logger";

/**
 * Handles rendering logic for arrays of primitive strings.
 * Users can type custom strings and press Enter to add them as tokens.
 * Adheres strictly to native UI5 Model-View-Controller ListBinding principles.
 * 
 * @namespace nz.co.siliconst.ui5.metaui.plugins.controls
 * @public
 */
export class MultiInputPlugin extends BasePlugin {
    /**
     * Renders a `sap.m.MultiInput` component natively bound to a JSONModel array.
     * 
     * @param fieldMetadata The specific JSON schema properties for this field.
     * @param bindingPath The JSON path bound to this control.
     * @param modelName The UI5 JSONModel name.
     * @param engineScopeId The deterministic scope ID.
     * @param onChange The callback fired on value change.
     * @returns {Control} The configured MultiInput control.
     */
    public render(fieldMetadata: IPropertyMetadata, bindingPath: string, modelName: string = "meta", engineScopeId?: string, onChange?: (isValid: boolean, fieldKey?: string) => void): Control {
        this.onChange = onChange;
        this.metadata = fieldMetadata;
        this.fieldKey = bindingPath.startsWith('/') ? bindingPath.substring(1) : bindingPath;
        this.modelName = modelName;

        if (!this.isEditable) {
            this.control = new TextControl({
                id: this.generateStableId(engineScopeId, bindingPath),
                text: this.generateBindingInfo(bindingPath, modelName, undefined, {
                    formatter: (val: unknown[]) => Array.isArray(val) ? val.join(", ") : ""
                })
            });
            this.applyCommonDirectives(this.control, fieldMetadata, modelName);
            return this.control as Control;
        }
        const plugin = this;

        const mi = new MultiInput({
            id: this.generateStableId(engineScopeId, bindingPath),
            enabled: !fieldMetadata.ui?.readOnly,
            placeholder: fieldMetadata.ui?.label || "Type and press Enter...",
            showValueHelp: false, // We don't have a list of options for primitive tags
            tokenUpdate: (oEvent: Event) => {
                const type = oEvent.getParameter("type");
                const sourceMi = oEvent.getSource() as MultiInput;
                
                // Native UI5 tokens removed via the 'x' icon. We sync this directly back to the model.
                if (type === "removed") {
                    const removedTokens = oEvent.getParameter("removedTokens") as Token[];
                    const removedTexts = removedTokens.map(t => t.getText());
                    
                    const bindingInfo = plugin.getNativeBindingContext(sourceMi);
                    if (bindingInfo) {
                        const { model, absPath } = bindingInfo;
                        const currentArray = (model.getProperty(absPath) || []) as string[];
                        const newArray = currentArray.filter(text => !removedTexts.includes(text));
                        
                        Logger.debug(`[MultiInputPlugin] Removing tokens from absolute path: ${absPath}`, removedTexts.join(", "), "MultiInputPlugin");
                        plugin.syncTokensToModel(sourceMi, newArray);
                    }
                }
            }
        });

        // The native addValidator pipeline is notoriously unreliable when there is no suggestion list bound,
        // often completely dropping the 'Enter' key event. Therefore, we use the standard `submit` event 
        // inherited from InputBase to robustly capture when the user presses Enter.
        if (typeof mi.attachSubmit === "function") {
            mi.attachSubmit((oEvent: Event) => {
                const sourceMi = oEvent.getSource() as MultiInput;
                const val = (oEvent.getParameter("value") as string || sourceMi.getValue()).trim();
                
                if (val) {
                    const bindingInfo = plugin.getNativeBindingContext(sourceMi);
                    if (bindingInfo) {
                        const { model, absPath } = bindingInfo;
                        const currentArray = (model.getProperty(absPath) || []) as string[];
                        
                        if (!currentArray.includes(val)) { // Prevent exact duplicates in primitive arrays
                            const newArray = [...currentArray, val];
                            Logger.debug(`[MultiInputPlugin] submit (Enter) fired. Adding token to absolute path: ${absPath}`, val, "MultiInputPlugin");
                            
                            // Natively clear the text input
                            sourceMi.setValue("");
                            
                            // Synchronize natively to the JSON model
                            plugin.syncTokensToModel(sourceMi, newArray);
                        } else {
                            sourceMi.setValue("");
                        }
                    }
                }
            });
        }

        // We must still register an addValidator returning null.
        // If UI5 *does* sporadically trigger the validator pipeline, this prevents the control 
        // from attempting to natively mutate the bound ListBinding aggregation, which causes a core crash.
        mi.addValidator(function(args: { text: string }) {
            return null;
        });

        // Bind existing strings to tokens using a factory function
        mi.bindAggregation("tokens", this.generateBindingInfo(bindingPath, modelName, undefined, {
            factory: (sId: string, oContext: sap.ui.model.Context) => {
                const text = (oContext.getObject() as string) || "";
                return new Token(sId, { key: text, text: text });
            }
        }));

        this.control = mi;
        this.applyCommonDirectives(this.control, fieldMetadata, modelName);
        return this.control as Control;
    }

    /**
     * Extracts the native UI5 ListBinding, its absolute path, and underlying JSONModel.
     * 
     * @param sourceMi The live, cloned MultiInput control instance inside the DOM tree.
     * @returns Object containing model and absolute path, or null if resolution fails.
     */
    private getNativeBindingContext(sourceMi: MultiInput): { model: JSONModel, absPath: string } | null {
        const binding = sourceMi.getBinding("tokens") as ListBinding;
        if (!binding) {
            Logger.error("[MultiInputPlugin] token list binding is completely missing on the source clone.");
            return null;
        }

        const model = binding.getModel() as JSONModel;
        if (!model) {
            Logger.error("[MultiInputPlugin] Failed to resolve underlying JSONModel from ListBinding.");
            return null;
        }

        let absPath: string;
        const ctx = binding.getContext();
        const bindingPath = binding.getPath();

        if (ctx) {
            const cp = ctx.getPath();
            absPath = cp.endsWith("/") ? cp + bindingPath : (cp === "/" ? "/" + bindingPath : cp + "/" + bindingPath);
        } else {
            absPath = bindingPath.startsWith("/") ? bindingPath : "/" + bindingPath;
        }

        return { model, absPath };
    }

    /**
     * Synchronizes the primitive string array derived from the MultiInput tokens directly back into the Model.
     * 
     * @param sourceMi The live MultiInput clone.
     * @param newArray The final array of string values to save.
     */
    private syncTokensToModel(sourceMi: MultiInput, newArray: string[]): void {
        const bindingInfo = this.getNativeBindingContext(sourceMi);
        if (!bindingInfo) return;

        const { model, absPath } = bindingInfo;
        
        model.setProperty(absPath, newArray);
        model.refresh(true); // Force UI5 to sync bindings down the tree

        if (this.onChange) {
            const result = this.validateAndApplyVisualState();
            this.onChange(result.isValid, this.fieldKey);
        }
    }

    /**
     * Retrieves the current primitive array from the control.
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
