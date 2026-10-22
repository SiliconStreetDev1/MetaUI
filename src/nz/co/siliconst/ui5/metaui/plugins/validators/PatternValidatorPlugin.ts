/**
 * @file PatternValidatorPlugin.ts
 * @description Validates string values against a JSON-Schema `pattern` regular expression.
 */

import { IValidator, IValidationResult, IValidatorRuleExtraction } from "../../interfaces/IPipeline";
import { IPropertyMetadata } from "../../interfaces/ISchema";

/**
 * Enforces the JSON-Schema `pattern` keyword. Per JSON-Schema semantics the keyword only constrains
 * strings; other value types are ignored. An invalid regex is a schema authoring error and is reported
 * as a failed validation rather than silently skipped.
 */
export class PatternValidatorPlugin implements IValidator {
    /**
     * Extracts the `pattern` regular expression from a schema property descriptor.
     *
     * @param propMeta The schema property descriptor.
     * @returns {IValidatorRuleExtraction} Activation status and regex string.
     */
    public extractRule(propMeta: IPropertyMetadata): IValidatorRuleExtraction {
        return {
            active: propMeta.pattern !== undefined,
            args: propMeta.pattern
        };
    }

    /**
     * @param parsedValue The value to test.
     * @param args The regular expression source string.
     * @returns {IValidationResult} Invalid if the string does not match, or if the pattern itself is malformed.
     */
    public validate(parsedValue: unknown, args?: unknown): IValidationResult {
        if (typeof parsedValue !== "string" || parsedValue === "") return { isValid: true };
        if (typeof args !== "string") {
            return { isValid: false, errorMessage: "Schema configuration error: 'pattern' must be a string." };
        }

        let regex: RegExp;
        try {
            regex = new RegExp(args);
        } catch (e) {
            return { isValid: false, errorMessage: `Schema configuration error: invalid regex pattern '${args}'.` };
        }

        if (!regex.test(parsedValue)) {
            return { isValid: false, errorMessage: "Input does not match the required pattern." };
        }
        return { isValid: true };
    }
}
