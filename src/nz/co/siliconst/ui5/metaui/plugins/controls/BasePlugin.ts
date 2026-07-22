/**
 * @file BasePlugin.ts
 * @description Abstract foundation for all MetaUI plugins, enforcing lifecycle hooks for v2 Schema.
 */

import { IPlugin } from "../../interfaces/IPlugin";
import { IPropertyMetadata } from "../../interfaces/ISchema";
import Control from "sap/ui/core/Control";
import { GlobalPipeline } from "../../core/PipelineManager";
import coreLibrary from "sap/ui/core/library";

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

    /** Indicates if the engine is enforcing an editable mode. */
    protected isEditable: boolean = true;

    /** Indicates if the plugin should delegate visual validation to the MessageManager. */
    protected useMessageManager: boolean = false;

    /** Internal callback provided by GeneratorHost to signal validation/data changes upwards */
    protected onChange?: (isValid: boolean, fieldKey?: string, errorMessage?: string, controlId?: string) => void;

    /**
     * Injects the global editable mode context into the plugin before rendering.
     * @param editable True if the plugin should render in editable mode.
     */
    public setEditable(editable: boolean): void {
        this.isEditable = editable;
    }

    /**
     * Injects the global MessageManager context into the plugin.
     * @param useMessageManager True if the MessageManager is handling validation visual states.
     */
    public setUseMessageManager(useMessageManager: boolean): void {
        this.useMessageManager = useMessageManager;
    }

    /**
     * Instantiates the raw UI5 control and binds it to the model.
     * 
     * @param fieldMetadata The JSON Schema for the field.
     * @param bindingPath The JSON path to bind to.
     * @param modelName The UI5 model name.
     * @param engineScopeId The deterministic scope ID provided by the Engine to prevent cloning collisions.
     * @param onChange The callback fired natively when a field value blur/change occurs.
     * @returns {Control} The generated UI5 control.
     */
    public abstract render(fieldMetadata: IPropertyMetadata, bindingPath: string, modelName?: string, engineScopeId?: string, onChange?: (isValid: boolean, fieldKey?: string) => void): Control;

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
    protected abstract getValue(): unknown;

    /**
     * Universal pipeline validation.
     */
    public validate(): import("../../interfaces/IPlugin").IPluginValidationResult {
        if (!this.control || !this.metadata) return { isValid: true };

        // Skip validation for hidden fields (e.g. hidden by ConditionEngine visibleOn)
        if (typeof (this.control as Control).getVisible === "function") {
            if (!(this.control as Control).getVisible()) {
                return { isValid: true };
            }
        }

        const validatorsToRun: string[] = [];
        const argsMap: Record<string, unknown> = {
            "maxLength": this.metadata.maxLength
        };

        if (this.metadata.required) {
            validatorsToRun.push("required");
        }
        if (this.metadata.maxLength) validatorsToRun.push("maxLength");
        if (this.metadata.minLength) {
            validatorsToRun.push("minLength");
            argsMap["minLength"] = this.metadata.minLength;
        }
        if (this.metadata.pattern) {
            validatorsToRun.push("pattern");
            argsMap["pattern"] = this.metadata.pattern;
        }
        if (this.metadata.minimum !== undefined || this.metadata.maximum !== undefined) {
            validatorsToRun.push("range");
            argsMap["range"] = { min: this.metadata.minimum, max: this.metadata.maximum };
        }
        
        const format = this.metadata.ui?.format;
        if (format === "email" || format === "url" || format === "iban") {
            validatorsToRun.push(format);
        }

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

        if (validatorsToRun.length === 0) {
            return { isValid: true, errorMessage: undefined, fieldKey: this.fieldKey };
        }

        const val = this.getValue();
        const result = GlobalPipeline.executeValidation(val, validatorsToRun, argsMap);
        return { isValid: result.isValid, errorMessage: result.errorMessage, fieldKey: this.fieldKey };
    }

    /**
     * Natively manipulates the UI5 control's valueState if the control supports it.
     * Uses reflection to safely apply styles without crashing on structural controls.
     */
    public setVisualValidationState(isValid: boolean, errorMessage?: string): void {
        if (!this.control) return;

        import("../../utils/Logger").then(m => m.Logger.error("[MetaUI]", `setVisualValidationState called on plugin: ${this.fieldKey}, isValid: ${isValid}`, "BasePlugin"));

        // Use reflection to check if the control supports ValueState (e.g. sap.m.Input does, sap.m.Text does not)
        if (typeof (this.control as any).setValueState === "function") {
            (this.control as any).setValueState(isValid ? coreLibrary.ValueState.None : coreLibrary.ValueState.Error);
            
            if (typeof (this.control as any).setValueStateText === "function") {
                (this.control as any).setValueStateText(isValid ? "" : (errorMessage || ""));
            }
        } else {
            import("../../utils/Logger").then(m => m.Logger.error("[MetaUI]", `Plugin ${this.fieldKey} has no setValueState function!`, "BasePlugin"));
        }
    }

    /**
     * Wraps standard validation and immediately applies the visual state.
     * Ideal for 'change' events to instantly turn fields red on blur.
     */
    protected validateAndApplyVisualState(): import("../../interfaces/IPlugin").IPluginValidationResult {
        const result = this.validate();
        this.setVisualValidationState(result.isValid, result.errorMessage);
        return result;
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
    protected applyCommonDirectives(control: Control, metadata: IPropertyMetadata, modelName: string = "meta"): void {
        if (metadata.ui?.readOnly !== undefined && typeof control.setEditable === "function") {
            control.setEditable(!metadata.ui.readOnly);
        }

        if (metadata.ui?.visibleOn) {
            const ExpressionBuilder = sap.ui.require("nz/co/siliconst/ui5/metaui/utils/ExpressionBuilder")?.ExpressionBuilder;
            let expr = "";
            if (ExpressionBuilder) {
                expr = ExpressionBuilder.build(metadata.ui.visibleOn, this.fieldKey, modelName);
            } else {
                expr = `{= ${metadata.ui.visibleOn.replace(/\$root\./g, `${modelName}>/`).replace(/\./g, '/')} }`;
            }
            control.bindProperty("visible", { parts: [{ path: "meta>/" }], formatter: () => false });
            control.bindProperty("visible", expr);
        }

        if (metadata.ui?.enabledOn && typeof control.setEnabled === "function") {
            const ExpressionBuilder = sap.ui.require("nz/co/siliconst/ui5/metaui/utils/ExpressionBuilder")?.ExpressionBuilder;
            let expr = "";
            if (ExpressionBuilder) {
                expr = ExpressionBuilder.build(metadata.ui.enabledOn, this.fieldKey, modelName);
            } else {
                expr = `{= ${metadata.ui.enabledOn.replace(/\$root\./g, `${modelName}>/`).replace(/\./g, '/')} }`;
            }
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
