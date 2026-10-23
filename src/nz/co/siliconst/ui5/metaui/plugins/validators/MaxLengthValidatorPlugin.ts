/**
 * @file MaxLengthValidatorPlugin.ts
 * @description Enforces the JSON-Schema `maxLength` keyword on strings.
 */

import { IValidator, IValidationResult, IValidatorRuleExtraction } from "../../interfaces/IPipeline";
import { IPropertyMetadata } from "../../interfaces/ISchema";
import { I18n, TEXT_KEY } from "../../utils/I18n";

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
     * A non-numeric `maxLength` is a schema configuration error and fails closed, matching
     * `PatternValidatorPlugin`: a constraint the engine cannot apply must never report the field as valid.
     * A non-string value is a different case and still passes — `maxLength` simply does not apply to it.
     *
     * @param parsedValue The value to test.
     * @param args The maximum allowed length.
     * @returns {IValidationResult} Invalid if the string is too long or the limit is misconfigured.
     */
    public validate(parsedValue: unknown, args?: unknown): IValidationResult {
        if (typeof args !== "number") {
            return { isValid: false, errorMessage: "Schema configuration error: 'maxLength' must be a number." };
        }
        if (typeof parsedValue !== "string") return { isValid: true };
        if (Array.from(parsedValue).length > args) {
            return { isValid: false, errorMessage: I18n.getText(TEXT_KEY.maxLength, [args]) };
        }
        return { isValid: true };
    }
}
