/**
 * @file UrlValidatorPlugin.ts
 * @description Standard business logic validator for URL formats.
 */

import { IValidator, IValidationResult, IValidatorRuleExtraction } from "../../interfaces/IPipeline";
import { IPropertyMetadata } from "../../interfaces/ISchema";
import { I18n, TEXT_KEY } from "../../utils/I18n";

/**
 * Ensures a string is a valid HTTP/HTTPS URL.
 *
 * @namespace nz.co.siliconst.ui5.metaui.plugins.validators
 * @public
 */
export class UrlValidatorPlugin implements IValidator {
    /**
     * Activates when `ui.format` is set to `"url"`.
     *
     * @param propMeta The schema property descriptor.
     * @returns {IValidatorRuleExtraction} Activation status.
     */
    public extractRule(propMeta: IPropertyMetadata): IValidatorRuleExtraction {
        const fmt = propMeta.ui?.format || propMeta.format;
        return { active: fmt === "url" || fmt === "uri" };
    }

    /**
     * Validates parsed data before it enters the JSON model.
     * @param parsedValue The cleaned data to validate.
     * @param args Optional arguments provided in the schema.
     * @returns IValidationResult containing status and optional error message.
     */
    public validate(parsedValue: unknown, _args?: unknown): IValidationResult {
        if (parsedValue === undefined || parsedValue === null || parsedValue === "") {
            return { isValid: true };
        }
        if (typeof parsedValue !== "string") {
            return { isValid: false, errorMessage: I18n.getText(TEXT_KEY.url) };
        }

        try {
            const url = new URL(parsedValue);
            if ((url.protocol !== "http:" && url.protocol !== "https:") || !url.hostname) {
                return { isValid: false, errorMessage: I18n.getText(TEXT_KEY.urlProtocol) };
            }
        } catch (_e) {
            // CATCH_EXEMPT: a throw from new URL() is the 'not a valid URL' answer this validator
            // exists to give. The returned invalid result paints the field and the message, which
            // is the observable signal; validate() runs per keystroke so a log would be noise.
            return { isValid: false, errorMessage: I18n.getText(TEXT_KEY.url) };
        }

        return { isValid: true };
    }
}
