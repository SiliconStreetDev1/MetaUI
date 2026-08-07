/**
 * @file BasePlugin.ts
 * @description Abstract foundation for all MetaUI plugins, enforcing lifecycle hooks for v2 Schema.
 */

import { IPlugin } from "../../interfaces/IPlugin";
import { IPropertyMetadata } from "../../interfaces/ISchema";
import Control from "sap/ui/core/Control";
import { GlobalPipeline } from "../../core/PipelineManager";
import * as coreLibrary from "sap/ui/core/library";
import { Logger } from "../../utils/Logger";

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

    /** Explicit reference to the core data widget when this plugin is wrapped in a layout. */
    protected mainControl?: Control;

    /** Properties strictly protected by the Sandbox engine. */
    protected BLOCKED_PROPS = ["value", "text", "selectedKey", "selected", "dateValue", "editable", "enabled", "visible", "valueState", "valueStateText", "items", "content", "pages", "formElements", "change", "press", "select", "submit"];

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
     * Tracks explicitly forced invalid states pushed down from the PolicyEngine.
     * When populated, this error takes absolute precedence over static SchemaValidator rules.
     */
    protected policyInvalidMessage: string | null = null;

    /** Transient state tracking for PBRE required evaluations to prevent schema clobbering */
    protected _isDynamicallyRequired?: boolean;

    /**
     * Injects the global editable mode context into the plugin before rendering.
     * @param editable True if the plugin should render in editable mode.
     */
    public setEditable(editable: boolean): void {
        this.isEditable = editable;
    }

    /**
     * Retrieves the human-readable label for the field from its metadata.
     */
    public getFieldLabel(): string | undefined {
        return this.metadata?.ui?.label || this.fieldKey;
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
    public abstract render(fieldMetadata: IPropertyMetadata, bindingPath: string, modelName?: string, engineScopeId?: string, onChange?: (isValid: boolean, fieldKey?: string, errorMessage?: string, controlId?: string) => void, model?: unknown): Control;

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
     * Generates a standardized programmatic binding configuration object.
     * Ensures perfect architectural consistency across all plugins instead of relying on string parsing.
     * 
     * @param bindingPath The relative or absolute path.
     * @param modelName The target model name.
     * @param typeInstance An optional UI5 Type instance (e.g. Integer, Float).
     * @param additionalOptions Optional extra configurations (e.g. formatOptions, constraints).
     * @returns A configuration object ready to be assigned to 'value', 'text', 'state', etc.
     */
    protected generateBindingInfo(bindingPath: string, modelName: string, typeInstance?: unknown, additionalOptions?: Record<string, unknown>): any {
        return {
            path: bindingPath,
            model: modelName,
            ...(typeInstance ? { type: typeInstance } : {}),
            ...(additionalOptions || {})
        };
    }

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

        if (this.policyInvalidMessage) {
            return { isValid: false, errorMessage: this.policyInvalidMessage, fieldKey: this.fieldKey };
        }

        const validatorsToRun: string[] = [];
        const argsMap: Record<string, unknown> = {
            "maxLength": this.metadata.maxLength
        };

        const isRequired = this._isDynamicallyRequired !== undefined ? this._isDynamicallyRequired : this.metadata.required;
        if (isRequired) {
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
        return { isValid: result.isValid, errorMessage: result.errorMessage, fieldKey: this.fieldKey, fieldLabel: this.metadata?.ui?.label };
    }

    /**
     * Natively manipulates the UI5 control's valueState if the control supports it.
     * Uses reflection to safely apply styles without crashing on structural controls.
     */
    public setVisualValidationState(isValid: boolean, errorMessage?: string): void {
        if (!this.control) return;


        // Use reflection to check if the control supports ValueState (e.g. sap.m.Input does, sap.m.Text does not)
        type StateControl = {
            setValueState?: (state: string) => void;
            setValueStateText?: (text: string) => void;
        };
        const ctrl = this.control as unknown as StateControl;
        if (typeof ctrl.setValueState === "function") {
            ctrl.setValueState(isValid ? coreLibrary.ValueState.None : coreLibrary.ValueState.Error);

            if (typeof ctrl.setValueStateText === "function") {
                ctrl.setValueStateText(isValid ? "" : (errorMessage || ""));
            }
        } else {
            // Quietly ignore. Controls like sap.m.Text natively do not support value states, which is completely valid.
        }
    }



    // --- IPluginStateReceiver Implementation for PBRE ---

    /**
     * Natively applies a forced error state from the PolicyEngine.
     * Per MetaUI Architecture Rule 12, this explicitly forces the visual state red 
     * independently of the MessageManager auto-sync.
     * 
     * @param errorMessage The custom error message to display.
     */
    public applyError(errorMessage: string): void {
        this.policyInvalidMessage = errorMessage;
        this.setVisualValidationState(false, errorMessage);
    }

    /**
     * Clears a previously forced error state.
     * Restores the visual boundary to standard (non-error) formatting.
     */
    public clearError(): void {
        this.policyInvalidMessage = null;
        this.setVisualValidationState(true);
    }

    /**
     * Dynamically manipulates the visibility state of the control based on PolicyEngine directives.
     * 
     * @param isVisible True to display the control, false to hide it.
     */
    public applyVisibility(isVisible: boolean): void {
        const ctrl = this.control as unknown as { setVisible?: (b: boolean) => void };
        if (ctrl && typeof ctrl.setVisible === "function") {
            ctrl.setVisible(isVisible);
        }
    }

    /**
     * Dynamically alters the mandatory status of the field.
     * Updates internal transient state to ensure the `validate()` pipeline enforces the change,
     * and natively triggers the UI5 required indicator (asterisk) if supported,
     * without permanently corrupting the shared global schema definition.
     * 
     * @param isRequired True to make the field mandatory, false to make it optional.
     */
    public applyRequired(isRequired: boolean): void {
        this._isDynamicallyRequired = isRequired;
        const ctrl = this.control as unknown as { setRequired?: (b: boolean) => void };
        if (ctrl && typeof ctrl.setRequired === "function") {
            ctrl.setRequired(isRequired);
        }
    }

    /**
     * Dynamically alters the editability of the field.
     * Falls back to `setEnabled` if the control is structural rather than purely input-driven.
     * 
     * @param isEditable True to allow user input, false to lock it.
     */
    public applyEditable(isEditable: boolean): void {
        const ctrl = this.control as unknown as { setEditable?: (b: boolean) => void, setEnabled?: (b: boolean) => void };
        if (ctrl && typeof ctrl.setEditable === "function") {
            ctrl.setEditable(isEditable);
        } else if (ctrl && typeof ctrl.setEnabled === "function") {
            ctrl.setEnabled(isEditable);
        }
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
        const ctrl = control as unknown as { setEditable?: (b: boolean) => void, setEnabled?: (b: boolean) => void };
        if (metadata.ui?.readOnly !== undefined && typeof ctrl.setEditable === "function") {
            ctrl.setEditable(!metadata.ui.readOnly);
        }

        if (metadata.ui?.visibleOn) {
            const expr = `{= ${metadata.ui.visibleOn.replace(/\$root\./g, `${modelName}>/`).replace(/\./g, '/')} }`;
            control.bindProperty("visible", { parts: [{ path: "meta>/" }], formatter: () => false });
            control.bindProperty("visible", expr);
        }

        if (metadata.ui?.enabledOn && typeof ctrl.setEnabled === "function") {
            const expr = `{= ${metadata.ui.enabledOn.replace(/\$root\./g, `${modelName}>/`).replace(/\./g, '/')} }`;
            control.bindProperty("enabled", expr);
        }

        if (metadata.ui?.controlProps) {
            Logger.debug(`[BasePlugin] controlProps found for ${this.fieldKey}: ` + JSON.stringify(metadata.ui.controlProps), "BasePlugin");
            const targetControl = this.mainControl || control;
            const target = targetControl as unknown as {
                getMetadata?: () => { getName(): string },
                applySettings?: (settings: Record<string, any>) => void,
                setProperty?: (p: string, v: unknown) => void,
                bindProperty?: (p: string, v: string) => void
            };

            if (typeof target.getMetadata === "function") {
                const targetMeta = target.getMetadata();
                const settings: Record<string, any> = {};
                for (const [propName, propValue] of Object.entries(metadata.ui.controlProps)) {
                    if (this.BLOCKED_PROPS.includes(propName)) {
                        Logger.warn(`[BasePlugin] Cannot apply controlProps '${propName}' for field '${this.fieldKey}' - ILLEGAL OVERRIDE (Property is protected by sandbox)`);
                        continue;
                    }
                    
                    // Natively block any aggregations or events to prevent sandbox escapes
                    if (typeof (targetMeta as any).hasAggregation === "function" && (targetMeta as any).hasAggregation(propName)) {
                        Logger.warn(`[BasePlugin] Cannot apply controlProps '${propName}' for field '${this.fieldKey}' - ILLEGAL OVERRIDE (Cannot hijack aggregations)`);
                        continue;
                    }
                    
                    if (typeof (targetMeta as any).hasEvent === "function" && (targetMeta as any).hasEvent(propName)) {
                        Logger.warn(`[BasePlugin] Cannot apply controlProps '${propName}' for field '${this.fieldKey}' - ILLEGAL OVERRIDE (Cannot hijack events)`);
                        continue;
                    }

                    if (typeof propValue === "string" && propValue.startsWith("{") && propValue.endsWith("}")) {
                        // The JSON payloads often hardcode 'metaui>' in raw expression bindings, 
                        // but the Engine dynamically generates model names like 'metaUI_Host1'. 
                        // We must inject the actual modelName dynamically into the expression string.
                        const injectedValue = propValue.replace(/metaui>/g, `${modelName}>`);
                        settings[propName] = injectedValue;
                    } else {
                        settings[propName] = propValue;
                    }
                }

                try {
                    const target = targetControl as unknown as { applySettings?: (s: Record<string, any>) => void };
                    if (typeof target.applySettings === "function") {
                        target.applySettings(settings);
                    }
                } catch (err: unknown) {
                    Logger.warn(`[BasePlugin] Failed to apply controlProps for field '${this.fieldKey}' on control ${targetMeta.getName()}: ${(err as Error).message}`);
                }
            }
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
