/**
 * @file IntegerValidatorPlugin.ts
 * @description Validates that numeric values for `type: "integer"` fields are finite whole numbers.
 */

import { IValidator, IValidationResult, IValidatorRuleExtraction } from "../../interfaces/IPipeline";
import { IPropertyMetadata } from "../../interfaces/ISchema";
import { I18n, TEXT_KEY } from "../../utils/I18n";

/**
 * Enforces that fields declared with `type: "integer"` contain finite whole integers.
 *
 * @namespace nz.co.siliconst.ui5.metaui.plugins.validators
 * @public
 */
export class IntegerValidatorPlugin implements IValidator {
    /**
     * Activates the integer validator when `propMeta.type === "integer"`.
     *
     * @param propMeta The schema property descriptor.
     * @returns {IValidatorRuleExtraction} Activation status.
     */
    public extractRule(propMeta: IPropertyMetadata): IValidatorRuleExtraction {
        return { active: propMeta.type === "integer" };
    }

    /**
     * Validates that `parsedValue` is a finite whole number when numeric.
     *
     * @param parsedValue The value to test.
     * @returns {IValidationResult} Invalid if the numeric value is fractional or non-finite.
     */
    public validate(parsedValue: unknown): IValidationResult {
        if (typeof parsedValue !== "number") {
            return { isValid: true };
        }
        if (!Number.isFinite(parsedValue) || !Number.isInteger(parsedValue)) {
            return { isValid: false, errorMessage: I18n.getText(TEXT_KEY.integer) };
        }
        return { isValid: true };
    }
}

