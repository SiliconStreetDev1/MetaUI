/**
 * @file IPlugin.ts
 * @description Contract for all discrete UI control generation plugins.
 * Enforces a strict lifecycle for rendering, validation, and dynamic state updates.
 */

import Control from "sap/ui/core/Control";
import Label from "sap/m/Label";
import Model from "sap/ui/model/Model";
import { IPropertyMetadata, ISchema } from "./ISchema";
import type { PluginRegistry } from "../core/PluginRegistry";

/**
 * Result returned when a control plugin executes its internal validation pipeline.
 */
export interface IPluginValidationResult {
    isValid: boolean;
    errorMessage?: string;
    fieldKey?: string;
    fieldLabel?: string;
}

/**
 * Contextual callbacks and services injected into a plugin by the orchestrating {@link Engine}.
 * Replaces parent-tree walking and singleton lookups with explicit dependency injection.
 */
export interface IPluginEngineContext {
    /** The active PluginRegistry for this engine instance. */
    pluginRegistry: PluginRegistry;
    /** Resolves a `$ref` pointer (e.g. `#/definitions/Address`) against the host's definitions dictionary. */
    resolveSchemaRef?: (refPath: string) => ISchema | undefined;
    /** Resolves a `$ref` pointer against the host's definitions dictionary. */
    getSchemaDefinition: (refPath: string) => ISchema | undefined;
    /** Returns the full normalized definitions dictionary from the host. */
    getSchemaDefinitions: () => Record<string, ISchema> | undefined;
    /** Returns the active JSONModel bound to the Engine. */
    getModel: () => Model | undefined;
    /** Triggers the host's form submission pipeline. */
    onSubmit?: () => void;
    /** Reports or clears a localized schema validation error in the ValidationLedger. */
    reportSchemaError?: (fieldPath: string, errorMessage: string | null) => void;
    /** Clears all validation ledger entries under a given path prefix. */
    clearValidationPrefix?: (prefix: string) => void;
    /** Clears all validation errors across the Engine and active plugins. */
    clearValidationErrors?: () => void;
}

/**
 * Standardized hooks for the Policy-Based Rule Engine (PBRE) to dynamically mutate visual state.
 * Implemented by `PluginStateBase` and inherited by every control plugin via `BasePlugin`.
 */
export interface IPluginStateReceiver {
    applyError(errorMessage: string): void;
    clearError(): void;
    applyVisibility(isVisible: boolean): void;
    applyRequired(isRequired: boolean): void;
    applyEditable(isEditable: boolean): void;
    isVisible(): boolean;
    getFieldLabel(): string | undefined;
    getControlId(): string | undefined;
    setAssociatedLabel(label: Label): void;
}

/**
 * Core contract for all UI5 control, action, and datasource generation plugins in MetaUI.
 */
export interface IPlugin extends IPluginStateReceiver {
    /**
     * Instructs the plugin whether to delegate visual error states to the global MessageManager.
     * @param useMessageManager True if the global MessageManager is active.
     */
    setUseMessageManager?(useMessageManager: boolean): void;

    /**
     * Injects engine-scoped services (registry, `$ref` resolver, submit callback) into the plugin.
     * @param context The engine context.
     */
    setEngineContext(context: IPluginEngineContext): void;

    /**
     * Instantiates the raw UI5 control and binds it to the specified data model.
     *
     * @param fieldMetadata The JSON Schema defining the field's constraints and UI hints.
     * @param bindingPath The specific JSON path representing the field within the payload.
     * @param modelName The UI5 JSONModel alias used for data binding (defaults to 'meta').
     * @param engineScopeId The deterministic scope ID provided by the Engine.
     * @param onChange The callback fired natively when a field value blur/change occurs.
     * @param model Optional reference to the active JSONModel.
     * @returns {Control} The generated UI5 control ready to be mounted.
     */
    render(
        fieldMetadata: IPropertyMetadata,
        bindingPath: string,
        modelName?: string,
        engineScopeId?: string,
        onChange?: (isValid: boolean, fieldKey?: string, errorMessage?: string, controlId?: string) => void,
        model?: unknown
    ): Control;

    /**
     * Triggers the internal validation pipeline for this specific plugin instance.
     *
     * @returns {IPluginValidationResult} The structural validity state and error messages.
     */
    validate(): IPluginValidationResult;

    /**
     * Executes when the ConditionEngine pushes dynamic metadata mutations to the field.
     *
     * @param newMetadata The mutated schema metadata.
     */
    onStateChange(newMetadata: IPropertyMetadata): void;

    /**
     * Updates the plugin's UI control visual ValueState (e.g., red borders).
     *
     * @param isValid Whether the field passed validation.
     * @param errorMessage The error message to display if invalid.
     */
    setVisualValidationState(isValid: boolean, errorMessage?: string): void;

    /**
     * Lifecycle hook executed when the parent layout is destroyed.
     * Plugins use this to destroy isolated JSONModels, custom EventBus listeners,
     * or embedded Dialogs to prevent memory leaks in the SAP Fiori Launchpad.
     */
    destroy(): void;

    /**
     * Injects the global editable mode context into the plugin before rendering.
     * @param editable True if the plugin should render in an editable mode.
     */
    setEditable(editable: boolean): void;

    /**
     * Dynamically updates a specific state property (`visible`, `editable`, `required`, `valid`) at runtime.
     */
    setState(property: "visible" | "editable" | "required" | "valid", value: boolean, message?: string): void;

    /**
     * Resolves a nested child plugin by its binding path when this plugin manages dynamic child plugins (e.g. `PolymorphicPlugin`).
     */
    getChildPluginByPath?(path: string): IPlugin | undefined;
}
