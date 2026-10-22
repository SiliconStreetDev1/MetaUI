/**
 * @file MultipleOfValidatorPlugin.ts
 * @description Enforces the JSON-Schema `multipleOf` keyword on numbers.
 */

import { IValidator, IValidationResult, IValidatorRuleExtraction } from "../../interfaces/IPipeline";
import { IPropertyMetadata } from "../../interfaces/ISchema";

/**
 * Fails when a number is not an exact multiple of the configured step.
 * Uses a relative epsilon so decimal steps (e.g. 0.01) are not rejected by floating-point noise.
 */
export class MultipleOfValidatorPlugin implements IValidator {
    /**
     * Extracts the `multipleOf` step divisor from a schema property descriptor.
     *
     * @param propMeta The schema property descriptor.
     * @returns {IValidatorRuleExtraction} Activation status and divisor step.
     */
    public extractRule(propMeta: IPropertyMetadata): IValidatorRuleExtraction {
        return {
            active: propMeta.multipleOf !== undefined,
            args: propMeta.multipleOf
        };
    }

    /**
     * @param parsedValue The value to test.
     * @param args The positive step size.
     * @returns {IValidationResult} Invalid if the value is not a multiple of the step.
     */
    public validate(parsedValue: unknown, args?: unknown): IValidationResult {
        if (typeof parsedValue !== "number" || Number.isNaN(parsedValue)) return { isValid: true };
        if (!Number.isFinite(parsedValue)) {
            return { isValid: false, errorMessage: "Value must be a finite number." };
        }
        if (typeof args !== "number" || !Number.isFinite(args) || args <= 0) {
            return { isValid: false, errorMessage: "Schema configuration error: 'multipleOf' must be a positive number." };
        }
        const quotient = parsedValue / args;
        if (!Number.isFinite(quotient)) {
            return { isValid: false, errorMessage: `Value must be a multiple of ${args}.` };
        }
        const nearestInt = Math.round(quotient);
        const diff = Math.abs(quotient - nearestInt);
        if (diff > 1e-7) {
            return { isValid: false, errorMessage: `Value must be a multiple of ${args}.` };
        }
        return { isValid: true };
    }
}
