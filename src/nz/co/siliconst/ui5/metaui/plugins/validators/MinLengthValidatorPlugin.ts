/**
 * @file MinLengthValidatorPlugin.ts
 * @description Standard business logic validator for string minimum lengths.
 */

import { IValidator, IValidationResult } from "../../interfaces/IPipeline";

/**
 * Ensures string length meets a minimum threshold.
 * 
 * @namespace nz.co.siliconst.ui5.metaui.plugins.validators
 * @public
 */
export class MinLengthValidatorPlugin implements IValidator {
    public validate(parsedValue: any, args?: any): IValidationResult {
        if (!parsedValue) return { isValid: true }; // Let RequiredValidator handle empty
        if (typeof args !== "number") return { isValid: true }; // Invalid config

        if (typeof parsedValue === "string" && parsedValue.length < args) {
            return { isValid: false, errorMessage: `Minimum length is ${args} characters.` };
        }
        
        return { isValid: true };
    }
}
