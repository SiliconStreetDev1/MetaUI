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
    public validate(parsedValue: any, args?: any): IValidationResult {
        if (!parsedValue) return { isValid: true }; // Let RequiredValidator handle empty
        if (!args || typeof args !== "string") {
            return { isValid: true }; // Invalid config, skip
        }

        try {
            const regex = new RegExp(args);
            if (!regex.test(parsedValue)) {
                return { isValid: false, errorMessage: `Input does not match the required pattern.` };
            }
        } catch (e) {
            // Invalid regex string provided
            return { isValid: false, errorMessage: `Schema configuration error: Invalid regex pattern.` };
        }
        
        return { isValid: true };
    }
}
