/**
 * @file EmailValidatorPlugin.ts
 * @description Standard business logic validator for email addresses.
 */

import { IValidator, IValidationResult, IValidatorRuleExtraction } from "../../interfaces/IPipeline";
import { IPropertyMetadata } from "../../interfaces/ISchema";
import { isEmptyValue } from "./RequiredValidatorPlugin";

/**
 * Standard business logic validator for email addresses.
 * Extracts the email regex validation logic into a standalone, modular plugin.
 *
 * @namespace nz.co.siliconst.ui5.metaui.plugins.validators
 * @public
 */
export class EmailValidatorPlugin implements IValidator {
    /**
     * Activates when `ui.format` is set to `"email"`.
     *
     * @param propMeta The schema property descriptor.
     * @returns {IValidatorRuleExtraction} Activation status.
     */
    public extractRule(propMeta: IPropertyMetadata): IValidatorRuleExtraction {
        const fmt = propMeta.ui?.format || propMeta.format;
        const widget = propMeta.ui?.widget;
        return { active: fmt === "email" || widget === "email" };
    }

    /**
     * Validates parsed data before it enters the JSON model.
     * @param parsedValue The cleaned data to validate.
     * @param args Optional arguments provided in the schema.
     * @returns IValidationResult containing status and optional error message.
     */
    public validate(parsedValue: unknown, _args?: unknown): IValidationResult {
        if (isEmptyValue(parsedValue)) return { isValid: true }; // Let RequiredValidator handle empty
        const emailRegex = /^[^\s@.]+(?:\.[^\s@.]+)*@[^\s@.]+(?:\.[^\s@.]+)+$/;
        if (typeof parsedValue !== "string" || !emailRegex.test(parsedValue)) {
            return { isValid: false, errorMessage: "Please enter a valid email address." };
        }
        return { isValid: true };
    }
}
