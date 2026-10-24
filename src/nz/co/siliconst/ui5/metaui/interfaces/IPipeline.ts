/**
 * @file IPipeline.ts
 * @description Interfaces for the generic data manipulation pipeline (Formatters, Parsers, Validators).
 */

import { IPropertyMetadata } from "./ISchema";

/**
 * Contract for pipeline formatters that transform raw model values into UI display strings.
 */
export interface IFormatter {
    /**
     * Formats raw JSON model data into a UI-friendly string.
     * @param rawValue The raw value from the JSON payload.
     * @param args Optional arguments provided in the schema.
     * @returns The formatted string for the UI control.
     */
    format(rawValue: unknown, args?: unknown): string;

    /**
     * Optional reverse parser that converts UI-formatted strings back into raw model values.
     * When implemented, `PipelineManager` treats the formatter as presentational (reversible).
     * @param uiValue The value extracted from the UI control.
     * @param args Optional arguments provided in the schema.
     * @returns The raw typed value for the JSON payload.
     */
    parse?(uiValue: unknown, args?: unknown): unknown;
}

/**
 * Contract for pipeline parsers that convert UI input strings back into typed model values.
 */
export interface IParser {
    /**
     * Parses UI-formatted strings back into raw data types.
     * @param uiValue The value extracted from the UI control.
     * @param args Optional arguments provided in the schema.
     * @returns The raw typed value for the JSON payload.
     */
    parse(uiValue: unknown, args?: unknown): unknown;
}

/**
 * Result returned by a single pipeline validator execution.
 */
export interface IValidationResult {
    isValid: boolean;
    errorMessage?: string;
}

/**
 * Result returned by `IValidator.extractRule` when inspecting a schema property descriptor.
 */
export interface IValidatorRuleExtraction {
    /** True if this validator plugin should run for the given schema property. */
    readonly active: boolean;
    /** Optional constraint arguments extracted from the schema property. */
    readonly args?: unknown;
}

/**
 * Contract for synchronous data validators registered in the {@link PipelineManager}.
 */
export interface IValidator {
    /**
     * Validates parsed data before it enters the JSON model.
     * @param parsedValue The cleaned data to validate.
     * @param args Optional arguments provided in the schema (e.g. max length number).
     * @returns IValidationResult containing status and optional error message.
     */
    validate(parsedValue: unknown, args?: unknown): IValidationResult;

    /**
     * Optional self-activation hook allowing a validator plugin to inspect `IPropertyMetadata`
     * and declare whether it applies to the field and with what arguments.
     * Enforces the Open/Closed Principle in `PipelineManager.assembleAndExecute`.
     *
     * @param propMeta The schema property descriptor.
     * @param isDynamicallyRequired Optional dynamic `required` state override.
     * @returns {IValidatorRuleExtraction} Activation state and extracted arguments.
     */
    extractRule?(propMeta: IPropertyMetadata, isDynamicallyRequired?: boolean): IValidatorRuleExtraction;
}
