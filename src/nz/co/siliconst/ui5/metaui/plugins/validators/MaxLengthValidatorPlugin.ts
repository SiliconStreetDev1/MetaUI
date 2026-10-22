/**
 * @file MaxLengthValidatorPlugin.ts
 * @description Enforces the JSON-Schema `maxLength` keyword on strings.
 */

import { IValidator, IValidationResult, IValidatorRuleExtraction } from "../../interfaces/IPipeline";
import { IPropertyMetadata } from "../../interfaces/ISchema";

/**
 * Fails when a string exceeds the configured number of characters. Non-strings are ignored.
 */
export class MaxLengthValidatorPlugin implements IValidator {
    /**
     * Extracts the `maxLength` constraint from a schema property descriptor.
     *
     * @param propMeta The schema property descriptor.
     * @returns {IValidatorRuleExtraction} Activation status and `maxLength` limit.
     */
    public extractRule(propMeta: IPropertyMetadata): IValidatorRuleExtraction {
        return {
            active: propMeta.maxLength !== undefined,
            args: propMeta.maxLength
        };
    }

    /**
     * @param parsedValue The value to test.
     * @param args The maximum allowed length.
     * @returns {IValidationResult} Invalid if the string is too long.
     */
    public validate(parsedValue: unknown, args?: unknown): IValidationResult {
        if (typeof parsedValue !== "string" || typeof args !== "number") return { isValid: true };
        if (Array.from(parsedValue).length > args) {
            return { isValid: false, errorMessage: `Maximum length is ${args} characters.` };
        }
        return { isValid: true };
    }
}
