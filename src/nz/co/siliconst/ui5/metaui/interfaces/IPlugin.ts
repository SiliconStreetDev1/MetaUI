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
     * Instantiates the raw UI5 control and binds it to the specified data model.
     * 
     * @param fieldMetadata The JSON Schema defining the field's constraints and UI hints.
     * @param bindingPath The specific JSON path representing the field within the payload.
     * @param modelName The UI5 JSONModel alias used for data binding (defaults to 'meta').
     * @param engine The orchestrator instance for delegating complex sub-layouts.
     * @returns {Control} The generated UI5 control ready to be mounted.
     */
    render(fieldMetadata: IPropertyMetadata, bindingPath: string, modelName?: string, engine?: any): Control;

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
     * Optional lifecycle hook executed when the parent layout is destroyed.
     * Plugins must use this to destroy isolated JSONModels, custom EventBus listeners, 
     * or embedded Dialogs to prevent memory leaks in the SAP Fiori Launchpad.
     */
    destroy?(): void;
}
