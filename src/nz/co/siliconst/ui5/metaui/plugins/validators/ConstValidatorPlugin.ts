/**
 * @file ConstValidatorPlugin.ts
 * @description Validates that a value strictly matches the JSON Schema `const` keyword.
 */

import { IValidator, IValidationResult, IValidatorRuleExtraction } from "../../interfaces/IPipeline";
import { IPropertyMetadata } from "../../interfaces/ISchema";
import { I18n, TEXT_KEY } from "../../utils/I18n";
import { safeToString } from "../../core/SafeConvert";

/**
 * Enforces the JSON Schema `const` constraint.
 *
 * @namespace nz.co.siliconst.ui5.metaui.plugins.validators
 * @internal
 */
export class ConstValidatorPlugin implements IValidator {
    /**
     * Extracts the `const` target value from a schema property descriptor.
     *
     * @param propMeta The schema property descriptor.
     * @returns {IValidatorRuleExtraction} Activation status and expected constant value.
     */
    public extractRule(propMeta: IPropertyMetadata): IValidatorRuleExtraction {
        if (propMeta.const === undefined) {
            return { active: false };
        }
        return { active: true, args: propMeta.const };
    }

    /**
     * Validates that `parsedValue` strictly equals the expected `const` argument.
     *
     * @param parsedValue The value to test.
     * @param args The expected constant value.
     * @returns {IValidationResult} Invalid if the value does not equal `args`.
     */
    public validate(parsedValue: unknown, args?: unknown): IValidationResult {
        if (parsedValue === undefined || parsedValue === null || parsedValue === "" || args === undefined) {
            return { isValid: true };
        }
        if (parsedValue !== args) {
            return { isValid: false, errorMessage: I18n.getText(TEXT_KEY.constEquality, [safeToString(args)]) };
        }
        return { isValid: true };
    }
}

