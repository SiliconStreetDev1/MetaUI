/**
 * @file RequiredValidatorPlugin.ts
 * @description Enforces mandatory fields.
 */

import { IValidator, IValidationResult, IValidatorRuleExtraction } from "../../interfaces/IPipeline";
import { IPropertyMetadata } from "../../interfaces/ISchema";
import { isRecord } from "../../utils/TypeGuards";
import { I18n, TEXT_KEY } from "../../utils/I18n";

/**
 * Checks whether a value counts as "empty" for required-field purposes.
 * `null`, `undefined`, empty strings and empty arrays are all treated as missing.
 *
 * @param value The value to inspect.
 * @returns {boolean} True if the value is considered empty.
 */
export function isEmptyValue(value: unknown): boolean {
    return (
        value === null ||
        value === undefined ||
        value === "" ||
        (typeof value === "string" && value.trim() === "") ||
        (typeof value === "number" && Number.isNaN(value)) ||
        (Array.isArray(value) && value.length === 0)
    );
}

/**
 * Fails when a mandatory value is empty (see {@link isEmptyValue}) or when `nullable: false` receives `null`.
 */
export class RequiredValidatorPlugin implements IValidator {
    /**
     * Determines whether the `required` or `nullable: false` constraint is active on the given property metadata.
     *
     * @param propMeta The schema property descriptor.
     * @param isDynamicallyRequired Optional dynamic `required` override from PolicyEngine.
     * @returns {IValidatorRuleExtraction} Activation status and required/nullable arguments.
     */
    public extractRule(propMeta: IPropertyMetadata, isDynamicallyRequired?: boolean): IValidatorRuleExtraction {
        const isReq = isDynamicallyRequired !== undefined ? isDynamicallyRequired : propMeta.required === true;
        const rejectNullOnly = !isReq && propMeta.nullable === false;
        return {
            active: isReq || rejectNullOnly,
            args: { required: isReq, nullable: propMeta.nullable }
        };
    }

    /**
     * Validates that mandatory values are non-empty and `nullable: false` fields are not `null`.
     *
     * @param parsedValue The value to test.
     * @param args Optional rule arguments (`{ required, nullable }`).
     * @returns {IValidationResult} Invalid if the value violates required or non-nullable constraints.
     */
    public validate(parsedValue: unknown, args?: unknown): IValidationResult {
        const cfg = isRecord(args) ? args : undefined;
        if (cfg && cfg.required === false && cfg.nullable === false) {
            if (parsedValue === null) {
                return { isValid: false, errorMessage: I18n.getText(TEXT_KEY.requiredNull) };
            }
            return { isValid: true };
        }
        if (cfg && cfg.required === true && cfg.nullable === true && parsedValue === null) {
            return { isValid: true };
        }
        if (isEmptyValue(parsedValue)) {
            return { isValid: false, errorMessage: I18n.getText(TEXT_KEY.required) };
        }
        return { isValid: true };
    }
}
