/**
 * @file PatternValidatorPlugin.ts
 * @description Standard business logic validator for Regex patterns.
 */

import { IValidator, IValidationResult } from "../../interfaces/IPipeline";

/**
 * Validates a string against a regular expression pattern provided in the schema args.
 * 
 * @namespace nz.co.siliconst.ui5.metaui.plugins.validators
 * @public
 */
export class PatternValidatorPlugin implements IValidator {
    /**
     * Validates parsed data before it enters the JSON model.
     * @param parsedValue The cleaned data to validate.
     * @param args Optional arguments provided in the schema.
     * @returns IValidationResult containing status and optional error message.
     */
    public validate(parsedValue: unknown, args?: unknown): IValidationResult {
        if (!parsedValue) return { isValid: true }; // Let RequiredValidator handle empty
        if (typeof args !== "string") {
            return { isValid: true }; // Invalid config, skip
        }

        try {
            const regex = new RegExp(args);
            if (typeof parsedValue !== "string" || !regex.test(parsedValue)) {
                return { isValid: false, errorMessage: `Input does not match the required pattern.` };
            }
        } catch (e) {
            // Invalid regex string provided
            return { isValid: false, errorMessage: `Schema configuration error: Invalid regex pattern.` };
        }
        
        return { isValid: true };
    }
}
