/**
 * @file UrlValidatorPlugin.ts
 * @description Standard business logic validator for URL formats.
 */

import { IValidator, IValidationResult } from "../../interfaces/IPipeline";

/**
 * Ensures a string is a valid HTTP/HTTPS URL.
 * 
 * @namespace nz.co.siliconst.ui5.metaui.plugins.validators
 * @public
 */
export class UrlValidatorPlugin implements IValidator {
    /**
     * Validates parsed data before it enters the JSON model.
     * @param parsedValue The cleaned data to validate.
     * @param args Optional arguments provided in the schema.
     * @returns IValidationResult containing status and optional error message.
     */
    public validate(parsedValue: unknown, args?: unknown): IValidationResult {
        if (!parsedValue) return { isValid: true }; // Let RequiredValidator handle empty
        if (typeof parsedValue !== "string") return { isValid: true };
        
        try {
            const url = new URL(parsedValue);
            if (url.protocol !== "http:" && url.protocol !== "https:") {
                return { isValid: false, errorMessage: "URL must use http or https protocol." };
            }
        } catch (e) {
            return { isValid: false, errorMessage: "Please enter a valid URL." };
        }
        
        return { isValid: true };
    }
}
