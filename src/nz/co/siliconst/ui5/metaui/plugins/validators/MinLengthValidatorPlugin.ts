/**
 * @file MinLengthValidatorPlugin.ts
 * @description Standard business logic validator for string minimum lengths.
 */

import { IValidator, IValidationResult, IValidatorRuleExtraction } from "../../interfaces/IPipeline";
import { IPropertyMetadata } from "../../interfaces/ISchema";
import { isEmptyValue } from "./RequiredValidatorPlugin";
import { I18n, TEXT_KEY } from "../../utils/I18n";

/**
 * Ensures string length meets a minimum threshold.
 *
 * @namespace nz.co.siliconst.ui5.metaui.plugins.validators
 * @internal
 */
export class MinLengthValidatorPlugin implements IValidator {
    /**
     * Extracts the `minLength` constraint from a schema property descriptor.
     *
     * @param propMeta The schema property descriptor.
     * @returns {IValidatorRuleExtraction} Activation status and `minLength` threshold.
     */
    public extractRule(propMeta: IPropertyMetadata): IValidatorRuleExtraction {
        return {
            active: propMeta.minLength !== undefined,
            args: propMeta.minLength
        };
    }

    /**
     * Validates parsed data before it enters the JSON model.
     *
     * A non-numeric `minLength` is a schema configuration error and fails closed, matching
     * `PatternValidatorPlugin`: a constraint the engine cannot apply must never report the field as valid.
     *
     * @param parsedValue The cleaned data to validate.
     * @param args Optional arguments provided in the schema.
     * @returns IValidationResult containing status and optional error message.
     */
    public validate(parsedValue: unknown, args?: unknown): IValidationResult {
        if (typeof args !== "number") {
            return {
                isValid: false,
                errorMessage: I18n.getText(TEXT_KEY.schemaConfigMustBeNumber, ["minLength"])
            };
        }
        if (isEmptyValue(parsedValue)) return { isValid: true }; // Let RequiredValidator handle empty

        if (typeof parsedValue === "string" && Array.from(parsedValue).length < args) {
            return { isValid: false, errorMessage: I18n.getText(TEXT_KEY.minLength, [args]) };
        }

        return { isValid: true };
    }
}
