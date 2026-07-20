/**
 * @file IbanValidatorPlugin.ts
 * @description Standard business logic validator for International Bank Account Numbers.
 */

import { IValidator, IValidationResult } from "../../interfaces/IPipeline";

/**
 * Validates a standard IBAN string.
 * This provides a simplified check for demonstration (starts with 2 chars, followed by digits/chars).
 * 
 * @namespace nz.co.siliconst.ui5.metaui.plugins.validators
 * @public
 */
export class IbanValidatorPlugin implements IValidator {
    public validate(parsedValue: unknown, args?: unknown): IValidationResult {
        if (!parsedValue) return { isValid: true }; // Let RequiredValidator handle empty
        
        // Very basic IBAN structure regex (e.g. DE89370400440532013000)
        // A true IBAN check requires modulo 97 arithmetic which is out of scope for a basic mock.
        const ibanRegex = /^[A-Z]{2}\d{2}[A-Z0-9]{1,30}$/;
        
        if (typeof parsedValue !== "string" || !ibanRegex.test(parsedValue.replace(/\s+/g, '').toUpperCase())) {
            return { isValid: false, errorMessage: "Please enter a valid IBAN." };
        }
        
        return { isValid: true };
    }
}
