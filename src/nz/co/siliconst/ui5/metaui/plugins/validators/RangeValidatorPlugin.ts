/**
 * @file RangeValidatorPlugin.ts
 * @description Validates numeric values against JSON-Schema `minimum`/`maximum` and their exclusive variants.
 */

import { IValidator, IValidationResult, IValidatorRuleExtraction } from "../../interfaces/IPipeline";
import { IPropertyMetadata } from "../../interfaces/ISchema";
import { isRecord, readNumber, readBoolean } from "../../utils/TypeGuards";

/**
 * Arguments accepted by the range validator.
 * `exclusiveMinimum`/`exclusiveMaximum` accept both JSON-Schema dialects:
 * draft-4 booleans (modifying `min`/`max`) and draft-6+ numeric bounds.
 */
export interface IRangeArgs {
    min?: number;
    max?: number;
    exclusiveMinimum?: boolean | number;
    exclusiveMaximum?: boolean | number;
}

/**
 * Enforces numeric boundaries. Non-numeric values are ignored (type coercion is the binding type's job).
 */
export class RangeValidatorPlugin implements IValidator {
    /**
     * Extracts numeric range bounds (`minimum`, `maximum`, `exclusiveMinimum`, `exclusiveMaximum`)
     * from a schema property descriptor.
     *
     * @param propMeta The schema property descriptor.
     * @returns {IValidatorRuleExtraction} Activation status and range boundary arguments.
     */
    public extractRule(propMeta: IPropertyMetadata): IValidatorRuleExtraction {
        const active =
            propMeta.minimum !== undefined ||
            propMeta.maximum !== undefined ||
            typeof propMeta.exclusiveMinimum === "number" ||
            typeof propMeta.exclusiveMaximum === "number";
        if (!active) {
            return { active: false };
        }
        return {
            active: true,
            args: {
                min: propMeta.minimum,
                max: propMeta.maximum,
                exclusiveMinimum: propMeta.exclusiveMinimum,
                exclusiveMaximum: propMeta.exclusiveMaximum
            }
        };
    }

    /**
     * @param parsedValue The value to test.
     * @param args The {@link IRangeArgs} boundaries.
     * @returns {IValidationResult} Invalid if the value violates any boundary.
     */
    public validate(parsedValue: unknown, args?: unknown): IValidationResult {
        if (typeof parsedValue !== "number" || Number.isNaN(parsedValue) || !isRecord(args)) return { isValid: true };
        if (!Number.isFinite(parsedValue)) {
            return { isValid: false, errorMessage: "Value must be a finite number." };
        }

        const min = readNumber(args, "min") ?? readNumber(args, "minimum");
        const max = readNumber(args, "max") ?? readNumber(args, "maximum");
        const exMinFlag = readBoolean(args, "exclusiveMinimum");
        const exMaxFlag = readBoolean(args, "exclusiveMaximum");
        const exMinBound = readNumber(args, "exclusiveMinimum");
        const exMaxBound = readNumber(args, "exclusiveMaximum");

        if (min !== undefined) {
            if (exMinFlag === true ? parsedValue <= min : parsedValue < min) {
                const msg = exMinFlag
                    ? `Value must be greater than ${min}.`
                    : `Value must be greater than or equal to ${min}.`;
                return { isValid: false, errorMessage: msg };
            }
        }
        if (exMinBound !== undefined && parsedValue <= exMinBound) {
            return { isValid: false, errorMessage: `Value must be greater than ${exMinBound}.` };
        }
        if (max !== undefined) {
            if (exMaxFlag === true ? parsedValue >= max : parsedValue > max) {
                const msg = exMaxFlag
                    ? `Value must be less than ${max}.`
                    : `Value must be less than or equal to ${max}.`;
                return { isValid: false, errorMessage: msg };
            }
        }
        if (exMaxBound !== undefined && parsedValue >= exMaxBound) {
            return { isValid: false, errorMessage: `Value must be less than ${exMaxBound}.` };
        }
        return { isValid: true };
    }
}
