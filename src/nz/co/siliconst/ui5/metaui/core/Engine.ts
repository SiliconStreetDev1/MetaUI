/**
 * @file Engine.ts
 * @description The central orchestrator that routes data between the Layout Factory and Plugin Registry (v2).
 */

import { ISchema, IPropertyMetadata } from "../interfaces/ISchema";
import { ILayoutManager } from "../interfaces/ILayoutManager";
import { IPlugin, IPluginValidationResult } from "../interfaces/IPlugin";
import { ConditionEngine } from "./ConditionEngine";
import { PluginRegistry } from "./PluginRegistry";
import Control from "sap/ui/core/Control";
import VBox from "sap/m/VBox";
import Text from "sap/m/Text";
import { Logger } from "../utils/Logger";
import { DefaultLayoutGenerator } from "./DefaultLayoutGenerator";
import Core from "sap/ui/core/Core";
import Messaging from "sap/ui/core/Messaging";

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
    /** Handles dynamic conditional logic across the active form. */
    private conditionEngine: ConditionEngine | null = null;

    /** Array of all instantiated plugins generated during the current build. */
    private activePlugins: { plugin: IPlugin, path: string }[] = [];

    /** Deterministic scope ID injected by the host control to prevent clone collisions. */
    public engineScopeId?: string;

    private activeModel?: sap.ui.model.Model;

    /** Callback to notify the host that an internal field changed. */
    public onChange?: (isValid: boolean, fieldKey?: string, errorMessage?: string, controlId?: string) => void;

    /** Tracks whether the entire engine is running in Editable mode. */
    public readonly isEditable: boolean = true;

    /**
     * Initializes a new Engine instance.
     * @param editable Whether the engine should render form fields as editable or read-only.
     */
    constructor(editable: boolean = true) {
        this.isEditable = editable;
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
    public build(schema: ISchema, model: sap.ui.model.Model, modelName: string = "meta", onSubmit?: () => void, engineScopeId?: string, onChange?: (isValid: boolean, fieldKey?: string, errorMessage?: string, controlId?: string) => void): Control {
        this.conditionEngine = new ConditionEngine(schema);
        this.activePlugins = [];
        this.activeModel = model;
        this.engineScopeId = engineScopeId;
        this.onChange = (isValid: boolean, fieldKey?: string, errorMessage?: string, controlId?: string) => {
            if (this.conditionEngine && fieldKey) {
                this.conditionEngine.handleEvent(fieldKey, isValid);
            }
            if (onChange) {
                onChange(isValid, fieldKey, errorMessage, controlId);
            }
        };

        try {
            // Intercept and synthesize a default layout if the developer/backend failed to provide one
            if (DefaultLayoutGenerator.ensureLayout(schema)) {
                Logger.warn("[MetaUI Engine] Missing 'uiLayout' array in schema. Synthesized a default layout mapping to prevent a blank render.");
            }

            const layoutStrategy = schema.layoutStrategy || (schema.type === "array" ? "table" : "form");
            const layoutManager = PluginRegistry.getInstance().getLayout(layoutStrategy);

            return layoutManager.render(schema, modelName, this, onSubmit);
        } catch (error) {
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
            const plugin = PluginRegistry.getInstance().getPlugin(fieldMeta.type || "string", fieldMeta.ui?.widget);
            plugin.setEditable(this.isEditable);

            if (!isTemplate) {
                this.activePlugins.push({ plugin, path: bindingPath });
            }
            const scopeId = isTemplate ? undefined : this.engineScopeId;
            const control = plugin.render(fieldMeta, bindingPath, modelName, scopeId, this.onChange);

            if (this.conditionEngine) {
                this.conditionEngine.registerPlugin(bindingPath, plugin);
            }

            return control;
        } catch (error) {
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
            const layoutStrategy = schema.layoutStrategy || (schema.type === "array" ? "table" : "form");
            const layoutManager = PluginRegistry.getInstance().getLayout(layoutStrategy);
            return layoutManager.render(schema, modelName, this, undefined, bindingPath);
        } catch (error) {
            const msg = (error as Error).message;
            Logger.error(`[MetaUI Engine] Critical error generating sub-layout for ${bindingPath}`, msg);
            Logger.showErrorPopup(`Engine failed to generate a sub-layout.\n\nDetails: ${msg}`);
            return new Text({ text: "Critical Sub-Layout Error" });
        }
    }

    /**
     * Iterates through all active plugins and triggers their internal validation pipelines.
     * 
     * @returns {IPluginValidationResult[]} Array of validation error objects. Empty array if valid.
     */
    public validateAll(): IPluginValidationResult[] {
        const errors: IPluginValidationResult[] = [];
        for (const item of this.activePlugins) {
            try {
                const result = item.plugin.validate();
                if (!result.isValid) {
                    // Ensure the path is bound to the error so GeneratorHost knows where to target it
                    result.fieldKey = result.fieldKey || item.path.replace(/^\//, "");
                    errors.push(result);
                    // Add console log to find which plugin fails silently
                    Logger.error("[MetaUI Validation] Plugin failed validation silently:", item.path || item.plugin.constructor.name);
                }
            } catch (error) {
                const msg = (error as Error).message;
                Logger.error(`[MetaUI Validation] Exception during plugin validation at path ${item.path}`, msg);
                errors.push({ isValid: false, errorMessage: `Validation crashed: ${msg}`, fieldKey: item.path.replace(/^\//, "") });
            }
        }
        return errors;
    }

    /**
     * Cleans up internal state and destroys the condition engine to prevent memory leaks.
     */
    public destroy(): void {
        if (this.conditionEngine) {
            this.conditionEngine.destroy();
            this.conditionEngine = null;
        }

        // ------------------------------------------------------------------------
        // Ghost Error Prevention
        // Flush MessageManager for active plugins before destroying their controls
        // ------------------------------------------------------------------------
        const messageManager = Messaging;
        const existingMessages = messageManager.getMessageModel().getData();
        const messagesToRemove: sap.ui.core.message.Message[] = [];

        for (const item of this.activePlugins) {
            if (this.activeModel) {
                const targetPath = `/${item.path.replace(/^\//, "")}`;
                const matched = existingMessages.filter((msg: sap.ui.core.message.Message) =>
                    msg.getTarget() === targetPath && msg.getMessageProcessor() && msg.getMessageProcessor().getId() === this.activeModel.getId()
                );
                messagesToRemove.push(...matched);
            }
            if (typeof item.plugin.destroy === "function") {
                item.plugin.destroy();
            }
        }

        if (messagesToRemove.length > 0) {
            messageManager.removeMessages(messagesToRemove);
        }

        this.activePlugins = [];
    }
}
