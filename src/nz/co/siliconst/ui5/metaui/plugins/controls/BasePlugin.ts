/**
 * @file BasePlugin.ts
 * @description Abstract foundation for all MetaUI plugins, enforcing lifecycle hooks for v2 Schema.
 */

import { IPlugin } from "../../interfaces/IPlugin";
import { IPropertyMetadata } from "../../interfaces/ISchema";
import { EventBus } from "../../core/EventBus";
import Control from "sap/ui/core/Control";
import { GlobalPipeline } from "../../core/PipelineManager";

/**
 * Abstract class representing a standard MetaUI Plugin.
 * Enforces the required rendering, state extraction, and validation contracts.
 * 
 * @abstract
 * @public
 */
export abstract class BasePlugin implements IPlugin {
    /** The instantiated UI5 control for this plugin. */
    protected control: Control | null = null;
    
    /** The metadata schema defining the field rules. */
    protected metadata: IPropertyMetadata | null = null;
    
    /** The internal JSON path of the field relative to its parent payload. */
    protected fieldKey: string = "";
    
    /** The UI5 JSONModel name used for absolute binding paths. */
    protected modelName: string = "meta";

    /**
     * Instantiates the raw UI5 control and binds it to the model.
     * 
     * @param fieldMetadata The JSON Schema for the field.
     * @param bindingPath The JSON path to bind to.
     * @param modelName The UI5 model name.
     * @param engineScopeId The deterministic scope ID provided by the Engine to prevent cloning collisions.
     * @returns {Control} The generated UI5 control.
     */
    public abstract render(fieldMetadata: IPropertyMetadata, bindingPath: string, modelName?: string, engineScopeId?: string): Control;

    /**
     * Generates a deterministic, globally unique ID for this control.
     * Prefixes the sanitized binding path with the Engine's scoped ID.
     */
    protected generateStableId(engineScopeId: string | undefined, bindingPath: string): string | undefined {
        if (!engineScopeId) return undefined;
        // Strip leading slash and replace internal slashes with hyphens
        const safePath = bindingPath.replace(/^\//, '').replace(/\//g, '-');
        return `${engineScopeId}--${safePath}`;
    }

    /**
     * Extracts the current raw value from the underlying UI5 control.
     */
    protected abstract getValue(): any;

    /**
     * Universal pipeline validation.
     */
    public validate(): import("../../interfaces/IPlugin").IPluginValidationResult {
        if (!this.control || !this.metadata) return { isValid: true };
        
        // Skip validation for hidden fields (e.g. hidden by ConditionEngine visibleOn)
        if (typeof (this.control as any).getVisible === "function") {
            if (!(this.control as any).getVisible()) {
                return { isValid: true };
            }
        }
        
        const validatorsToRun: string[] = [];
        const argsMap: Record<string, any> = {
            "maxLength": this.metadata.maxLength
        };

        if (this.metadata.required) {
            validatorsToRun.push("required");
        }
        if (this.metadata.maxLength) validatorsToRun.push("maxLength");
        
        if (this.metadata.ui?.validators) {
            for (const v of this.metadata.ui.validators) {
                if (typeof v === "string") {
                    validatorsToRun.push(v);
                } else if (v && v.name) {
                    validatorsToRun.push(v.name);
                    if (v.args !== undefined) {
                        argsMap[v.name] = v.args;
                    }
                }
            }
        }

        if (validatorsToRun.length === 0) return { isValid: true };

        const val = this.getValue();
        const result = GlobalPipeline.executeValidation(val, validatorsToRun, argsMap);
        
        if (typeof (this.control as any).setValueState === "function") {
            if (!result.isValid) {
                (this.control as any).setValueState("Error");
                (this.control as any).setValueStateText(result.errorMessage || "Invalid value.");
            } else {
                (this.control as any).setValueState("None");
                (this.control as any).setValueStateText("");
            }
        }
        
        return { isValid: result.isValid, errorMessage: result.errorMessage, fieldKey: this.fieldKey };
    }

    /**
     * Executes when the condition engine pushes new schema metadata to this field (e.g. readOnly changing).
     * @param newMetadata The mutated schema metadata.
     */
    public onStateChange(newMetadata: IPropertyMetadata): void {
        this.metadata = newMetadata;
        this.applyState();
    }

    /**
     * Abstract hook for the plugin to apply state changes to its specific UI5 control (e.g. placeholders, labels).
     */
    protected abstract applyState(): void;

    /**
     * Helper to apply common UI directives (like readOnly, visibleOn) directly to any control.
     */
    protected applyCommonDirectives(control: any, metadata: IPropertyMetadata, modelName: string = "meta"): void {
        if (metadata.ui?.readOnly !== undefined && typeof control.setEditable === "function") {
            control.setEditable(!metadata.ui.readOnly);
        }

        if (metadata.ui?.visibleOn) {
            const expr = `{= ${metadata.ui.visibleOn.replace(/\$root\./g, `${modelName}>/`).replace(/\./g, '/')} }`;
            control.bindProperty("visible", { parts: [{ path: "meta>/" }], formatter: () => false });
            // The ConditionEngine handles actual binding injection, but here we can set a fallback or natively bind if we bypass ConditionEngine.
            control.bindProperty("visible", expr);
        }
        
        if (metadata.ui?.enabledOn && typeof control.setEnabled === "function") {
            const expr = `{= ${metadata.ui.enabledOn.replace(/\$root\./g, `${modelName}>/`).replace(/\./g, '/')} }`;
            control.bindProperty("enabled", expr);
        }
    }



    /**
     * Natively destroys the instantiated UI5 control to prevent memory leaks.
     * Can be overridden by subclasses if they manage secondary controls or custom models.
     */
    public destroy(): void {
        if (this.control && typeof this.control.destroy === "function") {
            this.control.destroy();
            this.control = null;
        }
    }
}
