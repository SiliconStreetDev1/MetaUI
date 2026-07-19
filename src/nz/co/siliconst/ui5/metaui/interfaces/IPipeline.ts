/**
 * @file IPipeline.ts
 * @description Interfaces for the generic data manipulation pipeline (Formatters, Parsers, Validators).
 */

export interface IFormatter {
    /**
     * Formats raw JSON model data into a UI-friendly string.
     * @param rawValue The raw value from the JSON payload.
     * @param args Optional arguments provided in the schema.
     * @returns The formatted string for the UI control.
     */
    format(rawValue: any, args?: any): string;
}

export interface IParser {
    /**
     * Parses UI-formatted strings back into raw data types.
     * @param uiValue The value extracted from the UI control.
     * @param args Optional arguments provided in the schema.
     * @returns The raw typed value for the JSON payload.
     */
    parse(uiValue: any, args?: any): any;
}

export interface IValidationResult {
    isValid: boolean;
    errorMessage?: string;
}

export interface IValidator {
    /**
     * Validates parsed data before it enters the JSON model.
     * @param parsedValue The cleaned data to validate.
     * @param args Optional arguments provided in the schema (e.g. max length number)
     * @returns IValidationResult containing status and optional error message.
     */
    validate(parsedValue: any, args?: any): IValidationResult;
}
