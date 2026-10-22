/**
 * @file Engine.ts
 * @description The central orchestrator that routes data between the Layout Factory, Plugin Registry,
 * and ValidationLedger (v2).
 */

import { ISchema, IPropertyMetadata } from "../interfaces/ISchema";
import { IPlugin, IPluginValidationResult } from "../interfaces/IPlugin";
import { IEngineHost } from "../interfaces/IEngineHost";
import { PluginRegistry } from "./PluginRegistry";
import { ValidationLedger } from "./ValidationLedger";
import { DefaultLayoutGenerator } from "./DefaultLayoutGenerator";
import { Logger } from "../utils/Logger";
import Control from "sap/ui/core/Control";
import Model from "sap/ui/model/Model";
import Text from "sap/m/Text";

/**
 * The Engine is responsible for translating a normalized schema into a physical UI5 layout.
 * It delegates layout generation to the configured `LayoutManager`, field generation to the `PluginRegistry`,
 * and validation state coordination to the `ValidationLedger`.
 *
 * @namespace nz.co.siliconst.ui5.metaui.core
 * @public
 */
export class Engine {
    /** Array of all instantiated plugins generated during the current build. */
    private activePlugins: { plugin: IPlugin; path: string }[] = [];

    /** Array of template plugins generated for table rows to prevent memory leaks during destruction. */
    private templatePlugins: { plugin: IPlugin; path: string }[] = [];

    /** Deterministic scope ID injected by the host control to prevent clone collisions. */
    public engineScopeId?: string;

    private activeModel?: Model;
    private onSubmitCallback?: () => void;

    /** Delegates validation ledger tracking, array validation, and Messaging sync. */
    private readonly validationLedger: ValidationLedger;

    /** Reference to the GeneratorHost that instantiated this engine, for retrieving global definitions. */
    public host?: IEngineHost;

    /** Callback to notify the host that an internal field changed. */
    public onChange?: (isValid: boolean, fieldKey?: string, errorMessage?: string, controlId?: string) => void;

    /** Tracks whether the entire engine is running in Editable mode. */
    public readonly isEditable: boolean = true;

    /** Tracks if any fields or sub-layouts failed to render, requiring a warning strip. */
    public hasPartialRenderingErrors: boolean = false;

    /** Tracks whether the engine should delegate visual state to the global MessageManager. */
    public useMessageManager: boolean = false;

    /** The injected PluginRegistry instance. */
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
        this.validationLedger = new ValidationLedger(
            useMessageManager,
            (path) => this.getPluginByPath(path),
            () => this.activePlugins,
            () => this.host
        );
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
    public build(
        schema: ISchema,
        model: Model | undefined,
        modelName: string = "meta",
        onSubmit?: () => void,
        engineScopeId?: string,
        onChange?: (isValid: boolean, fieldKey?: string, errorMessage?: string, controlId?: string) => void
    ): Control {
        this.activePlugins = [];
        this.activeModel = model;
        this.engineScopeId = engineScopeId;
        this.onSubmitCallback = onSubmit;
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
     * @param isTemplate True when building a reusable template control for a table column.
     * @returns The generated UI5 Control for the field.
     */
    public generateField(
        fieldMeta: IPropertyMetadata,
        bindingPath: string,
        modelName: string,
        isTemplate: boolean = false
    ): Control {
        try {
            const plugin = this.pluginRegistry.getPlugin(fieldMeta.type || "string", fieldMeta.ui?.widget);
            plugin.setEditable(this.isEditable);
            if (typeof plugin.setUseMessageManager === "function") {
                plugin.setUseMessageManager(this.useMessageManager);
            }
            plugin.setEngineContext({
                pluginRegistry: this.pluginRegistry,
                resolveSchemaRef: (refPath: string) => this.host?.getSchemaDefinition?.(refPath),
                getSchemaDefinition: (refPath: string) => this.host?.getSchemaDefinition?.(refPath),
                getSchemaDefinitions: () => this.host?.getSchemaDefinitions?.(),
                getModel: () => this.activeModel,
                onSubmit: this.onSubmitCallback,
                reportSchemaError: (fieldPath: string, errorMessage: string | null) =>
                    this.reportSchemaError(fieldPath, errorMessage),
                clearValidationPrefix: (prefix: string) => this.clearValidationPrefix(prefix),
                clearValidationErrors: () => this.clearValidationErrors()
            });

            if (!isTemplate) {
                this.activePlugins.push({ plugin, path: bindingPath });
            } else {
                this.templatePlugins.push({ plugin, path: bindingPath });
            }
            const scopeId = isTemplate ? undefined : this.engineScopeId;
            return plugin.render(fieldMeta, bindingPath, modelName, scopeId, this.onChange, this.activeModel);
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
                Logger.warn(
                    `[MetaUI Engine] Missing 'uiLayout' array in sub-schema for ${bindingPath}. Synthesized a default layout mapping.`
                );
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
     * Iterates through all active plugins, table-row arrays and the custom-error ledger.
     *
     * @param applyVisualState If true, explicitly instructs plugins to paint their own ValueState.
     * @returns {IPluginValidationResult[]} Array of validation error objects. Empty array if valid.
     */
    public validateAll(applyVisualState: boolean = false): IPluginValidationResult[] {
        return this.validationLedger.validateAll(applyVisualState);
    }

    /**
     * Dynamically toggles UI5 MessageManager integration at runtime on the Engine, ValidationLedger, and active plugins.
     *
     * @param use True to publish validation errors to `sap/ui/core/Messaging`, false to purge and disable.
     */
    public setUseMessageManager(use: boolean): void {
        this.useMessageManager = use;
        this.validationLedger.setUseMessageManager(use);
        for (const item of this.activePlugins) {
            if (typeof item.plugin.setUseMessageManager === "function") {
                item.plugin.setUseMessageManager(use);
            }
        }
        for (const item of this.templatePlugins) {
            if (typeof item.plugin.setUseMessageManager === "function") {
                item.plugin.setUseMessageManager(use);
            }
        }
    }

    /**
     * Notifies the StateManager and ValidationLedger when an array is mutated so stale row messages can be purged
     * and surviving row validation states can shift with their rows.
     *
     * @param arrayPath The array binding path that was modified.
     * @param deletedRowIndex Optional deleted row index (`-1` when appending a row) to shift surviving row errors.
     */
    public onArrayMutated(arrayPath: string, deletedRowIndex?: number): void {
        const shifted = this.validationLedger.extractShiftedRowEntries(arrayPath, deletedRowIndex);
        this.validationLedger.clearArrayEntries(arrayPath);
        for (const item of this.templatePlugins) {
            item.plugin.clearError();
        }
        if (this.host && typeof this.host.getStateManager === "function") {
            this.host.getStateManager()?.clearArrayMessages(arrayPath);
        }
        this.host?.resetAndEvaluatePoliciesNow?.();
        this.validationLedger.restoreRowEntries(shifted);
    }

    /**
     * Validates a specific inline array path and its nested rows, painting individual invalid cells.
     */
    public validateArrayPath(arrayPath: string, meta: IPropertyMetadata): boolean {
        return this.validationLedger.validateArrayField(arrayPath, meta);
    }

    /**
     * Returns true if a nested field path belongs to an optional parent object that is currently absent or unpopulated.
     *
     * @param fieldPath The field path to inspect.
     * @returns {boolean} True if an ancestor object is optional and unpopulated.
     */
    public isInsideAbsentOptionalObject(fieldPath: string): boolean {
        return this.validationLedger.isInsideAbsentOptionalObject(fieldPath);
    }

    /**
     * Returns true if any field or table cell currently holds an active validation error in the ledger.
     *
     * @returns {boolean} True if active validation errors exist.
     */
    public hasActiveErrors(): boolean {
        return this.validationLedger.hasActiveErrors();
    }

    /**
     * Returns true if any of the given field paths (or their nested children) currently holds an active error.
     *
     * @param fieldPaths Array of field paths to inspect.
     * @returns {boolean} True if an active error exists on any of the specified paths.
     */
    public hasActiveErrorsForPaths(fieldPaths: string[]): boolean {
        return this.validationLedger.hasActiveErrorsForPaths(fieldPaths);
    }

    /**
     * Applies a PBRE state mutation (`visibility`, `required`, `editable`) to cloned table row cell controls.
     *
     * @param targetPath The expanded row cell path (e.g. `"/Items/0/Price"`).
     * @param property The state property to update.
     * @param value The boolean state value.
     */
    public applyRowPolicyState(
        targetPath: string,
        property: "visibility" | "required" | "editable",
        value: boolean
    ): void {
        if (property === "editable" && !this.isEditable) {
            return;
        }
        this.validationLedger.applyRowControlState(targetPath, property, value);
    }

    /**
     * Clears all validation ledger entries and parse error flags under a specific path prefix (e.g. on variant switch).
     *
     * @param prefix The path prefix to clear.
     */
    public clearValidationPrefix(prefix: string): void {
        this.validationLedger.clearArrayEntries(prefix);
    }

    /**
     * Clears all active validation errors and resets control visual states (e.g. on data hot-swap or form clear).
     */
    public clearValidationErrors(): void {
        this.validationLedger.clear(true);
        for (const item of this.activePlugins) {
            item.plugin.clearError();
        }
        for (const item of this.templatePlugins) {
            item.plugin.clearError();
        }
    }

    /**
     * Returns the active sandbox JSONModel bound to this Engine instance.
     *
     * @returns {Model | undefined} The active UI5 model instance.
     */
    public getModel(): Model | undefined {
        return this.activeModel;
    }

    /**
     * Retrieves an active plugin instance by its absolute binding path.
     *
     * @param path The binding path (e.g. `"/General/CustomerName"`).
     * @returns {IPlugin | undefined} The plugin instance, or undefined if not found.
     */
    public getPluginByPath(path: string): IPlugin | undefined {
        const cleanPath = path.replace(/^\//, "");
        const match = this.activePlugins.find((p) => p.path.replace(/^\//, "") === cleanPath);
        if (match) {
            return match.plugin;
        }
        for (const entry of this.activePlugins) {
            const childMatch = entry.plugin.getChildPluginByPath?.(cleanPath);
            if (childMatch) {
                return childMatch;
            }
        }
        return undefined;
    }

    /**
     * Returns a read-only view of all active plugin instances and their binding paths.
     *
     * @returns {ReadonlyArray<{ plugin: IPlugin; path: string }>} The active plugin entries.
     */
    public getActivePlugins(): ReadonlyArray<{ plugin: IPlugin; path: string }> {
        return this.activePlugins;
    }

    /**
     * Reports a localized schema validation error to the coordinator ledger.
     */
    public reportSchemaError(fieldPath: string, errorMessage: string | null): void {
        this.validationLedger.reportSchemaError(fieldPath, errorMessage);
    }

    /**
     * Reports a cross-field policy error to the coordinator ledger.
     */
    public reportPolicyError(fieldPath: string, errorMessage: string | null): void {
        this.validationLedger.reportPolicyError(fieldPath, errorMessage);
    }

    /**
     * Reports (or clears, when null) an external custom error in the coordinator ledger.
     */
    public reportCustomError(fieldPath: string, errorMessage: string | null): void {
        this.validationLedger.reportCustomError(fieldPath, errorMessage);
    }

    /**
     * Re-evaluates the visual error state of a field in the ledger (e.g. after visibility changes).
     */
    public refreshFieldValidationState(fieldPath: string): void {
        this.validationLedger.resolveVisualState(fieldPath);
    }

    /**
     * Cleans up internal state and destroys active/template plugins to prevent memory leaks.
     */
    public destroy(): void {
        for (const item of this.activePlugins) {
            item.plugin.destroy();
        }
        for (const item of this.templatePlugins) {
            item.plugin.destroy();
        }
        this.validationLedger.clear();
        this.activePlugins = [];
        this.templatePlugins = [];
    }
}
