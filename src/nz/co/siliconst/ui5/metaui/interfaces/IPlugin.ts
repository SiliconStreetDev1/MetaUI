/**
 * @file IPlugin.ts
 * @description Contract for all discrete UI control generation plugins.
 * Enforces a strict lifecycle for rendering, validation, and dynamic state updates.
 */

import Control from "sap/ui/core/Control";
import { IFieldMetadata } from "./ISchema";

/**
 * Defines the contract that every MetaUI plugin must fulfill.
 */
export interface IPlugin {
    /**
     * Instantiates and binds the appropriate UI5 control based on the field metadata.
     * @param fieldMetadata The immutable schema configuration for this specific field.
     * @param bindingPath The exact model path where this field's data is stored.
     * @returns The fully constructed and bound UI5 Control ready for layout insertion.
     */
    render(fieldMetadata: IFieldMetadata, bindingPath: string): Control;

    /**
     * Evaluates the current state of the UI5 control against the required schema rules.
     * @returns True if the input is valid, false otherwise. Must set ValueState natively.
     */
    validate(): boolean;

    /**
     * Hook triggered when a cross-field dependency requires this field to re-evaluate its state.
     * @param newMetadata The dynamically updated schema rules for this field.
     */
    onStateChange(newMetadata: IFieldMetadata): void;
}
