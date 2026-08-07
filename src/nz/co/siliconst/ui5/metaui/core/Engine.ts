/**
 * @file Engine.ts
 * @description The central orchestrator that routes data between the Layout Factory and Plugin Registry (v2).
 */

import { ISchema, IPropertyMetadata } from "../interfaces/ISchema";
import { ILayoutManager } from "../interfaces/ILayoutManager";
import { IPlugin, IPluginValidationResult } from "../interfaces/IPlugin";
import { IEngineHost } from "../interfaces/IEngineHost";

import { PluginRegistry } from "./PluginRegistry";
import Control from "sap/ui/core/Control";
import VBox from "sap/m/VBox";
import Text from "sap/m/Text";
import { Logger } from "../utils/Logger";
import { DefaultLayoutGenerator } from "./DefaultLayoutGenerator";
import Core from "sap/ui/core/Core";
import Messaging from "sap/ui/core/Messaging";
import Message from "sap/ui/core/message/Message";
import coreLibrary from "sap/ui/core/library";
import { GlobalPipeline } from "./PipelineManager";

/**
 * The Engine is responsible for translating a normalized schema into a physical UI5 layout.
 * It delegates layout generation to the configured `LayoutManager` and field generation to the `PluginRegistry`.
 * It strictly routes execution flow and tracks active plugins for validation.
 * It embodies the "Plugin-First Philosophy" by routing all complex field and layout rendering
 * through discrete, decoupled plugins rather than handling native overrides.
 * 
 * @namespace nz.co.siliconst.ui5.metaui.core
 * @public
 */
export class Engine {


    /** Array of all instantiated plugins generated during the current build. */
    private activePlugins: { plugin: IPlugin, path: string }[] = [];

    /** Array of template plugins generated for table rows to prevent memory leaks during destruction. */
    private templatePlugins: { plugin: IPlugin, path: string }[] = [];

    /** Deterministic scope ID injected by the host control to prevent clone collisions. */
    public engineScopeId?: string;

    private activeModel?: unknown;

    /** Ledger tracking local vs cross-field errors to prevent visual race conditions. */
    private validationLedger: Map<string, { schemaError: string | null, policyError: string | null }> = new Map();

    /** Tracks active MessageManager messages created by this engine instance. */
    private activeMessages: Map<string, Message> = new Map();

    /** Reference to the GeneratorHost that instantiated this engine, for retrieving global definitions. */
    public host?: IEngineHost;

    /** Callback to notify the host that an internal field changed. */
    public onChange?: (isValid: boolean, fieldKey?: string, errorMessage?: string, controlId?: string) => void;

    /** Tracks whether the entire engine is running in Editable mode. */
    public readonly isEditable: boolean = true;

    /** Tracks if any fields or sub-layouts failed to render, requiring a warning strip. */
    public hasPartialRenderingErrors: boolean = false;

    /** Tracks whether the engine should delegate visual state to the global MessageManager. */
    public readonly useMessageManager: boolean = false;

    /** The injected PluginRegistry instance */
    public readonly pluginRegistry: PluginRegistry;

    /**
     * Initializes a new Engine instance.
     * @param editable Whether the engine should render form fields as editable or read-only.
     * @param useMessageManager Whether to delegate visual state to UI5 MessageManager.
     * @param pluginRegistry Optional injected plugin registry. Defaults to singleton.
     */
    constructor(editable: boolean = true, useMessageManager: boolean = false, pluginRegistry?: PluginRegistry) {
        this.isEditable = editable;
        this.useMessageManager = useMessageManager;
        this.pluginRegistry = pluginRegistry || PluginRegistry.getInstance();
    }

    /**
     * Bootstraps the layout generation process by resolving the correct layout strategy.
     * 
     * @param schema The normalized JSON schema representing the view.
     * @param model The active StateManager JSONModel instance.
     * @param modelName The UI5 model alias used for isolation.
     * @param onSubmit Callback fired when form is submitted.
     * @param engineScopeId Deterministic scope ID for this engine instance.
     * @param onChange Callback fired when field values change.
     * @returns The generated root UI5 Control container.
     */
    public build(schema: ISchema, model: unknown, modelName: string = "meta", onSubmit?: () => void, engineScopeId?: string, onChange?: (isValid: boolean, fieldKey?: string, errorMessage?: string, controlId?: string) => void): Control {

        this.activePlugins = [];
        this.activeModel = model;
        this.engineScopeId = engineScopeId;
        this.onChange = (isValid: boolean, fieldKey?: string, errorMessage?: string, controlId?: string) => {
            if (fieldKey) {
                this.reportSchemaError(fieldKey, isValid ? null : errorMessage || "Invalid input");
            }

            if (onChange) {
                onChange(isValid, fieldKey, errorMessage, controlId);
            }
        };

        try {
            const layoutStrategy = schema.layoutStrategy || (schema.type === "array" ? "table" : "form");
            const layoutManager = this.pluginRegistry.getLayout(layoutStrategy);

            return layoutManager.render(schema, modelName, this, onSubmit);
        } catch (error) {
            this.hasPartialRenderingErrors = true;
            const msg = (error as Error).message;
            Logger.error("[MetaUI Engine] Critical error during layout generation", msg);
            Logger.showErrorPopup(`Engine failed to generate the layout.\n\nDetails: ${msg}`);
            return new Text({ text: "Critical Layout Error" });
        }
    }

    /**
     * Instantiates the correct plugin for a specific field based on type and widget hints,
     * and tracks the plugin for global validation.
     * 
     * @param fieldMeta The metadata schema specific to the field.
     * @param bindingPath The JSON path representing the field within the payload.
     * @param modelName The UI5 JSONModel name used for data binding.
     * @returns The generated UI5 Control for the field.
     */
    public generateField(fieldMeta: IPropertyMetadata, bindingPath: string, modelName: string, isTemplate: boolean = false): Control {
        try {
            const plugin = this.pluginRegistry.getPlugin(fieldMeta.type || "string", fieldMeta.ui?.widget);
            if (typeof plugin.setEditable === "function") {
                plugin.setEditable(this.isEditable);
            }

            if (typeof plugin.setUseMessageManager === "function") {
                plugin.setUseMessageManager(this.useMessageManager);
            }

            if (!isTemplate) {
                this.activePlugins.push({ plugin, path: bindingPath });
            } else {
                this.templatePlugins.push({ plugin, path: bindingPath });
            }
            const scopeId = isTemplate ? undefined : this.engineScopeId;
            const control = plugin.render(fieldMeta, bindingPath, modelName, scopeId, this.onChange, this.activeModel);



            return control;
        } catch (error) {
            this.hasPartialRenderingErrors = true;
            const msg = (error as Error).message;
            Logger.error(`[MetaUI Engine] Failed to generate field at ${bindingPath}`, msg);
            Logger.showErrorPopup(`Failed to generate field '${bindingPath}'.\n\nDetails: ${msg}`);
            return new Text({ text: `[Error generating field ${bindingPath}]` });
        }
    }

    /**
     * Generates a sub-layout (like an embedded table or nested form) without 
     * destroying the current Engine state or Condition tracking.
     * 
     * @param schema The normalized JSON schema representing the view.
     * @param modelName The UI5 JSONModel name used for data binding (defaults to "meta").
     * @param bindingPath Optional path to bind the sub-layout to a specific array/object property.
     * @returns The generated root UI5 Control container.
     */
    public generateLayout(schema: ISchema, modelName: string, bindingPath?: string): Control {
        try {
            if (DefaultLayoutGenerator.ensureLayout(schema)) {
                Logger.warn(`[MetaUI Engine] Missing 'uiLayout' array in sub-schema for ${bindingPath}. Synthesized a default layout mapping.`);
            }

            const layoutStrategy = schema.layoutStrategy || (schema.type === "array" ? "table" : "form");
            const layoutManager = this.pluginRegistry.getLayout(layoutStrategy);
            return layoutManager.render(schema, modelName, this, undefined, bindingPath);
        } catch (error) {
            this.hasPartialRenderingErrors = true;
            const msg = (error as Error).message;
            Logger.error(`[MetaUI Engine] Critical error generating sub-layout for ${bindingPath}`, msg);
            Logger.showErrorPopup(`Engine failed to generate a sub-layout.\n\nDetails: ${msg}`);
            return new Text({ text: "Critical Sub-Layout Error" });
        }
    }

    /**
     * Iterates through all active plugins and triggers their internal validation pipelines.
     * 
     * @param applyVisualState If true, explicitly instructs the plugin to natively paint its own ValueState.
     * @returns {IPluginValidationResult[]} Array of validation error objects. Empty array if valid.
     */
    public validateAll(applyVisualState: boolean = false): IPluginValidationResult[] {
        const errors: IPluginValidationResult[] = [];
        for (const item of this.activePlugins) {
            try {
                const result = item.plugin.validate();
                if (applyVisualState) {
                    this.reportSchemaError(item.path, result.isValid ? null : result.errorMessage || "Invalid input");
                }

                if (!result.isValid) {
                    // Ensure the path is bound to the error so GeneratorHost knows where to target it
                    result.fieldKey = result.fieldKey || item.path.replace(/^\//, "");
                    errors.push(result);
                    // Add console log to find which plugin fails silently
                    Logger.error("[MetaUI Validation] Plugin failed validation silently:", item.path || item.plugin.constructor.name);
                }
            } catch (error) {
                Logger.error(`[MetaUI Engine] Error validating plugin at ${item.path}`, (error as Error).message);
            }
        }

        // 2. Recursively validate arrays via StateManager payload traversing for Table layout rows
        if (this.host && typeof this.host.getStateManager === "function") {
            const stateManager = this.host.getStateManager();
            if (stateManager) {
                const payload = stateManager.extractPayload();
                const schema = stateManager.getSchema ? stateManager.getSchema() : this.host.getParsedSchema?.();
                if (payload && schema) {
                    const arrayErrors = this.validatePayloadArrays(schema, payload, "");
                    if (applyVisualState) {
                        arrayErrors.forEach(err => {
                            if (err.fieldKey) {
                                this.reportSchemaError(err.fieldKey, err.isValid ? null : err.errorMessage || "Invalid input");
                            }
                        });
                    }
                    errors.push(...arrayErrors.filter(e => !e.isValid));
                }
            }
        }

        return errors;
    }

    public onArrayMutated(arrayPath: string): void {
        if (this.host && typeof this.host.getStateManager === "function") {
            const stateManager = this.host.getStateManager();
            if (stateManager && typeof stateManager.clearArrayMessages === "function") {
                stateManager.clearArrayMessages(arrayPath);
            }
        }
    }

    private validatePayloadArrays(schema: ISchema, payload: Record<string, unknown>, currentPath: string): IPluginValidationResult[] {
        const errors: IPluginValidationResult[] = [];
        if (!schema || !payload || typeof payload !== "object") return errors;

        if (schema.type === "object" && schema.properties) {
            for (const key of Object.keys(schema.properties)) {
                const propSchema = schema.properties[key];
                const childValue = payload[key];
                if (childValue !== undefined) {
                    const childPath = currentPath ? `${currentPath}/${key}` : key;
                    errors.push(...this.validatePayloadArrays(propSchema as ISchema, childValue as Record<string, unknown>, childPath));
                }
            }
        } else if (schema.type === "array" && schema.items && Array.isArray(payload)) {
            (payload as Record<string, unknown>[]).forEach((item, index) => {
                const itemPath = currentPath ? `${currentPath}/${index}` : `${index}`;
                const items = schema.items;
                if (items && items.type === "object" && items.properties) {
                    for (const key of Object.keys(items.properties)) {
                        const propMeta = items.properties[key];
                        const propPath = `${itemPath}/${key}`;
                        const val = item ? item[key] : undefined;

                        const res = GlobalPipeline.assembleAndExecute(propMeta, val);
                        if (!res.isValid) {
                            errors.push({
                                isValid: false,
                                errorMessage: res.errorMessage,
                                fieldKey: propPath,
                                fieldLabel: propMeta.ui?.label || key
                            });
                        } else {
                            errors.push({ isValid: true, fieldKey: propPath }); // Clear old errors
                        }
                    }
                }
            });
        }
        return errors;
    }

    /**
     * Retrieves an active plugin instance by its absolute binding path.
     * Useful for programmatic field manipulation (e.g., custom error injection).
     * 
     * @param path The binding path (e.g. "/General/CustomerName").
     * @returns {IPlugin | undefined} The plugin instance, or undefined if not found.
     */
    public getPluginByPath(path: string): import("../interfaces/IPlugin").IPlugin | undefined {
        const cleanPath = path.replace(/^\//, "");
        const match = this.activePlugins.find(p => p.path.replace(/^\//, "") === cleanPath);
        return match ? match.plugin : undefined;
    }

    /**
     * Reports a localized schema validation error to the coordinator ledger.
     */
    public reportSchemaError(fieldPath: string, errorMessage: string | null): void {
        const cleanPath = fieldPath.replace(/^\//, "");
        if (!this.validationLedger.has(cleanPath)) {
            this.validationLedger.set(cleanPath, { schemaError: null, policyError: null });
        }
        this.validationLedger.get(cleanPath)!.schemaError = errorMessage;
        this.resolveVisualState(cleanPath);
    }

    /**
     * Reports a cross-field policy error to the coordinator ledger.
     */
    public reportPolicyError(fieldPath: string, errorMessage: string | null): void {
        const cleanPath = fieldPath.replace(/^\//, "");
        if (!this.validationLedger.has(cleanPath)) {
            this.validationLedger.set(cleanPath, { schemaError: null, policyError: null });
        }
        this.validationLedger.get(cleanPath)!.policyError = errorMessage;
        this.resolveVisualState(cleanPath);
    }

    /**
     * Computes the final visual state by checking both engines and applies it to the plugin.
     */
    private resolveVisualState(cleanPath: string): void {
        const plugin = this.getPluginByPath(cleanPath);
        const ledgerEntry = this.validationLedger.get(cleanPath);
        if (!ledgerEntry) return;

        const isError = ledgerEntry.policyError !== null || ledgerEntry.schemaError !== null;
        const errorMessage = ledgerEntry.policyError || ledgerEntry.schemaError;

        if (plugin && typeof plugin.setVisualValidationState === "function") {
            plugin.setVisualValidationState(!isError, isError ? errorMessage || undefined : undefined);
        } else {
            // Un-tracked template clones (Table Layout rows)
            this.setNativeControlError(cleanPath, isError ? errorMessage || undefined : undefined);
        }

        if (this.useMessageManager) {
            const currentMsg = this.activeMessages.get(cleanPath);
            if (currentMsg) {
                Messaging.removeMessages(currentMsg);
                this.activeMessages.delete(cleanPath);
            }
            if (isError) {
                const targetPath = `/${cleanPath}`;
                const processorModel = this.host && typeof this.host.getStateManager === "function" 
                    ? this.host.getStateManager()?.getModel() 
                    : undefined;
                
                const fieldLabel = typeof plugin?.getFieldLabel === "function" ? plugin.getFieldLabel() : undefined;
                const displayLabel = fieldLabel || cleanPath;
                const displayText = `Field '${displayLabel}': ${errorMessage || "Validation Error"}`;
                
                const newMsg = new Message({
                    message: displayText,
                    additionalText: displayLabel !== targetPath ? displayLabel : undefined,
                    type: coreLibrary.MessageType.Error,
                    target: targetPath,
                    processor: processorModel
                });
                Messaging.addMessages(newMsg);
                this.activeMessages.set(cleanPath, newMsg);
            }
        }
    }

    private setNativeControlError(targetPath: string, errorMessage?: string): void {
        if (this.host && this.host.generatedContent) {
            const rootControl = this.host.generatedContent;
            this.traverseAndSetError(rootControl, targetPath, errorMessage);
        }
    }

    private traverseAndSetError(control: any, targetPath: string, errorMessage?: string): void {
        if (!control) return;
        
        const bindingInfos = [control.getBindingInfo("value"), control.getBindingInfo("selectedKey"), control.getBindingInfo("dateValue"), control.getBindingInfo("selected")];
        for (const info of bindingInfos) {
            if (info && info.parts && info.parts.length > 0) {
                const boundPath = info.parts[0].path;
                // UI5 relative bindings drop the leading slash in the context, but retain it in the path
                if (boundPath === targetPath || targetPath.endsWith(boundPath)) {
                    // Ensure we match the exact row context path
                    const context = control.getBindingContext(this.host!.activeModelName);
                    if (context) {
                        const fullPath = context.getPath() + "/" + boundPath;
                        const cleanedFullPath = fullPath.replace(/^\//, "");
                        if (cleanedFullPath === targetPath) {
                            if (typeof control.setValueState === "function") {
                                control.setValueState(errorMessage ? "Error" : "None");
                                if (typeof control.setValueStateText === "function") {
                                    control.setValueStateText(errorMessage || "");
                                }
                            }
                        }
                    }
                }
            }
        }
        
        if (typeof control.getAggregation === "function" && typeof control.getMetadata === "function") {
            const aggs = control.getMetadata().getAggregations();
            for (const aggName in aggs) {
                const child = control.getAggregation(aggName);
                if (Array.isArray(child)) {
                    child.forEach(c => this.traverseAndSetError(c, targetPath, errorMessage));
                } else if (child) {
                    this.traverseAndSetError(child, targetPath, errorMessage);
                }
            }
        }
    }

    /**
     * Cleans up internal state and destroys the condition engine to prevent memory leaks.
     */
    public destroy(): void {


        for (const item of this.activePlugins) {
            if (typeof item.plugin.destroy === "function") {
                item.plugin.destroy();
            }
        }

        for (const item of this.templatePlugins) {
            if (typeof item.plugin.destroy === "function") {
                item.plugin.destroy();
            }
        }

        if (this.useMessageManager && this.activeMessages.size > 0) {
            Messaging.removeMessages(Array.from(this.activeMessages.values()));
        }

        this.validationLedger.clear();
        this.activeMessages.clear();
        this.activePlugins = [];
        this.templatePlugins = [];
    }
}
