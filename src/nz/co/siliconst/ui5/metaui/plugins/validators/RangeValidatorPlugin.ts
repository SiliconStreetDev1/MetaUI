/**
 * @file RangeValidatorPlugin.ts
 * @description Standard business logic validator for numeric ranges.
 */

import { IValidator, IValidationResult } from "../../interfaces/IPipeline";

/**
 * Ensures a numeric value falls within an optionally provided min and max range.
 * 
 * @namespace nz.co.siliconst.ui5.metaui.plugins.validators
 * @public
 */
export class RangeValidatorPlugin implements IValidator {
    public validate(parsedValue: unknown, args?: Record<string, unknown>): IValidationResult {
        if (parsedValue === null || parsedValue === undefined) return { isValid: true }; 
        if (typeof parsedValue !== "number") return { isValid: true };

        const min = args?.min;
        const max = args?.max;

        if (min !== undefined && typeof min === "number" && parsedValue < min) {
            return { isValid: false, errorMessage: `Value must be greater than or equal to ${min}.` };
        }

        if (max !== undefined && typeof max === "number" && parsedValue > max) {
            return { isValid: false, errorMessage: `Value must be less than or equal to ${max}.` };
        }
        
        return { isValid: true };
    }
}
