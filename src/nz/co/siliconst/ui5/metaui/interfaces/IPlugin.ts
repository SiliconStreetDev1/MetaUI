/**
 * @file IPlugin.ts
 * @description Contract for all discrete UI control generation plugins.
 * Enforces a strict lifecycle for rendering, validation, and dynamic state updates.
 */

import Control from "sap/ui/core/Control";
import { IPropertyMetadata } from "./ISchema";

export interface IPluginValidationResult {
    isValid: boolean;
    errorMessage?: string;
    fieldKey?: string;
}

export interface IPlugin {
    /**
     * Instructs the plugin whether to delegate visual error states to the global MessageManager.
     * @param useMessageManager True if the global MessageManager is active.
     */
    setUseMessageManager?(useMessageManager: boolean): void;

    /**
     * Instantiates the raw UI5 control and binds it to the specified data model.
     * 
     * @param fieldMetadata The JSON Schema defining the field's constraints and UI hints.
     * @param bindingPath The specific JSON path representing the field within the payload.
     * @param modelName The UI5 JSONModel alias used for data binding (defaults to 'meta').
     * @param engineScopeId The deterministic scope ID provided by the Engine.
     * @param onChange The callback fired natively when a field value blur/change occurs.
     * @returns {Control} The generated UI5 control ready to be mounted.
     */
    render(fieldMetadata: IPropertyMetadata, bindingPath: string, modelName?: string, engineScopeId?: string, onChange?: (isValid: boolean, fieldKey?: string, errorMessage?: string, controlId?: string) => void): Control;

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
     * Optionally allows the plugin to natively manage its own UI control's visual ValueState (e.g., red borders).
     * Used when the global MessageManager is disabled.
     * 
     * @param isValid Whether the field passed validation.
     * @param errorMessage The error message to display if invalid.
     */
    setVisualValidationState?(isValid: boolean, errorMessage?: string): void;

    /**
     * Optional lifecycle hook executed when the parent layout is destroyed.
     * Plugins must use this to destroy isolated JSONModels, custom EventBus listeners, 
     * or embedded Dialogs to prevent memory leaks in the SAP Fiori Launchpad.
     */
    destroy?(): void;

    /**
     * Injects the global editable mode context into the plugin before rendering.
     * @param editable True if the plugin should render in an editable mode.
     */
    setEditable?(editable: boolean): void;
}
