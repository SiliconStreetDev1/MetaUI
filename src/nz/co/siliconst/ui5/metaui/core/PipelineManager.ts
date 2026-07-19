/**
 * @file PipelineManager.ts
 * @description Central manager for the data manipulation pipeline. 
 * Orchestrates Formatting, Parsing, and Validating data using the generic Registry.
 */

import { Registry } from "./Registry";
import { IFormatter, IParser, IValidator, IValidationResult } from "../interfaces/IPipeline";
import { PatternValidatorPlugin } from "../plugins/validators/PatternValidatorPlugin";
import { MinLengthValidatorPlugin } from "../plugins/validators/MinLengthValidatorPlugin";
import { RangeValidatorPlugin } from "../plugins/validators/RangeValidatorPlugin";
import { UrlValidatorPlugin } from "../plugins/validators/UrlValidatorPlugin";
import { IbanValidatorPlugin } from "../plugins/validators/IbanValidatorPlugin";
import { EmailValidatorPlugin } from "../plugins/validators/EmailValidatorPlugin";
import { DateFormatterPlugin } from "../plugins/formatters/DateFormatterPlugin";
import { PhoneFormatterPlugin } from "../plugins/formatters/PhoneFormatterPlugin";
import { TextCaseFormatterPlugin } from "../plugins/formatters/TextCaseFormatterPlugin";
import { Logger } from "../utils/Logger";

// --- Built-in Default Validators ---
class RequiredValidator implements IValidator {
    validate(parsedValue: any, args?: any): IValidationResult {
        if (parsedValue === null || parsedValue === undefined || parsedValue === "") {
            return { isValid: false, errorMessage: "This field is required." };
        }
        return { isValid: true };
    }
}

class MaxLengthValidator implements IValidator {
    validate(parsedValue: any, args?: any): IValidationResult {
        if (typeof parsedValue === "string" && args && typeof args === "number") {
            if (parsedValue.length > args) {
                return { isValid: false, errorMessage: `Maximum length is ${args} characters.` };
            }
        }
        return { isValid: true };
    }
}


/**
 * The core engine responsible for marshalling data through the validation, formatting, and parsing phases.
 * Pluggable design allows new validators to be registered dynamically.
 * 
 * @namespace nz.co.siliconst.ui5.metaui.core
 * @public
 */
export class PipelineManager {
    /** Registry of data formatters applied before pushing to the UI. */
    public readonly formatters: Registry<IFormatter> = new Registry<IFormatter>("Formatters");
    /** Registry of data parsers applied when pulling data from the UI. */
    public readonly parsers: Registry<IParser> = new Registry<IParser>("Parsers");
    /** Registry of business logic validators. */
    public readonly validators: Registry<IValidator> = new Registry<IValidator>("Validators");

    /**
     * Bootstraps the PipelineManager with default validators (required, maxLength, email).
     */
    constructor() {
        // Register default validators
        this.validators.register("required", new RequiredValidator());
        this.validators.register("maxLength", new MaxLengthValidator());
        this.validators.register("pattern", new PatternValidatorPlugin());
        this.validators.register("minLength", new MinLengthValidatorPlugin());
        this.validators.register("range", new RangeValidatorPlugin());
        this.validators.register("url", new UrlValidatorPlugin());
        this.validators.register("iban", new IbanValidatorPlugin());
        this.validators.register("email", new EmailValidatorPlugin());

        // Register default formatters
        this.formatters.register("date", new DateFormatterPlugin());
        this.formatters.register("phone", new PhoneFormatterPlugin());
        this.formatters.register("textCase", new TextCaseFormatterPlugin());
    }

    /**
     * Executes the validation pipeline sequentially. Fails fast on the first encountered error.
     * 
     * @param parsedValue The raw extracted value from the UI control.
     * @param requestedValidators Array of validation rule keys (e.g. ['required', 'email']).
     * @param argsMap Optional map of parameters required by specific rules (e.g. { maxLength: 50 }).
     * @returns {IValidationResult} The final result state and any associated error message.
     */
    public executeValidation(parsedValue: any, requestedValidators: string[], argsMap?: Record<string, any>): IValidationResult {
        for (const rule of requestedValidators) {
            const validator = this.validators.get(rule);
            if (validator) {
                const args = argsMap ? argsMap[rule] : undefined;
                const result = validator.validate(parsedValue, args);
                if (!result.isValid) {
                    return result; // Fast fail on first error
                }
            } else {
                Logger.warn(`[MetaUI] PipelineManager: Requested validator '${rule}' not found in registry.`);
            }
        }
        return { isValid: true };
    }
}

/** 
 * Singleton instance for global access to the active validation pipeline. 
 * @public 
 */
export const GlobalPipeline = new PipelineManager();
