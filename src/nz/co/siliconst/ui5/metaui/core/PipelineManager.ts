/**
 * @file PipelineManager.ts
 * @description Central manager for the data manipulation pipeline.
 * Orchestrates Formatting, Parsing, and Validating data using the generic Registry.
 */

import { Registry } from "./Registry";
import { IFormatter, IParser, IValidator, IValidationResult } from "../interfaces/IPipeline";
import { IPropertyMetadata } from "../interfaces/ISchema";
import { PatternValidatorPlugin } from "../plugins/validators/PatternValidatorPlugin";
import { MinLengthValidatorPlugin } from "../plugins/validators/MinLengthValidatorPlugin";
import { RangeValidatorPlugin } from "../plugins/validators/RangeValidatorPlugin";
import { UrlValidatorPlugin } from "../plugins/validators/UrlValidatorPlugin";
import { IbanValidatorPlugin } from "../plugins/validators/IbanValidatorPlugin";
import { EmailValidatorPlugin } from "../plugins/validators/EmailValidatorPlugin";
import { DateFormatterPlugin } from "../plugins/formatters/DateFormatterPlugin";
import { PhoneFormatterPlugin } from "../plugins/formatters/PhoneFormatterPlugin";
import { TextCaseFormatterPlugin } from "../plugins/formatters/TextCaseFormatterPlugin";
import { CurrencyFormatterPlugin } from "../plugins/formatters/CurrencyFormatterPlugin";
import { RequiredValidatorPlugin, isEmptyValue } from "../plugins/validators/RequiredValidatorPlugin";
import { MaxLengthValidatorPlugin } from "../plugins/validators/MaxLengthValidatorPlugin";
import { ArrayItemsValidatorPlugin } from "../plugins/validators/ArrayItemsValidatorPlugin";
import { MultipleOfValidatorPlugin } from "../plugins/validators/MultipleOfValidatorPlugin";
import { EnumValidatorPlugin } from "../plugins/validators/EnumValidatorPlugin";
import { ConstValidatorPlugin } from "../plugins/validators/ConstValidatorPlugin";
import { IntegerValidatorPlugin } from "../plugins/validators/IntegerValidatorPlugin";
import { ObjectPropertiesValidatorPlugin } from "../plugins/validators/ObjectPropertiesValidatorPlugin";
import { Logger } from "../utils/Logger";
import { isRecord } from "../utils/TypeGuards";
import { I18n, TEXT_KEY } from "../utils/I18n";
import { safeToString } from "./SafeConvert";

/**
 * The core engine responsible for marshalling data through the validation, formatting, and parsing phases.
 * Pluggable design allows new validators and formatters to be registered dynamically without modifying the kernel.
 * Architectural Note: Unlike UI5 control/layout plugins (which pull heavy SAPUI5 widget modules and are lazy-loaded
 * asynchronously via `PluginRegistry`), validators and formatters are pure synchronous functions invoked inside
 * UI5 property-binding formatters and synchronous keystroke/submit validation, so they are registered eagerly here.
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
     * Returns the shared singleton `PipelineManager` instance.
     * @returns {PipelineManager} The global pipeline manager.
     */
    public static getInstance(): PipelineManager {
        return GlobalPipeline;
    }

    /**
     * Bootstraps the PipelineManager with default validators and formatters.
     */
    constructor() {
        this.validators.register("required", new RequiredValidatorPlugin());
        this.validators.register("maxLength", new MaxLengthValidatorPlugin());
        this.validators.register("pattern", new PatternValidatorPlugin());
        this.validators.register("minLength", new MinLengthValidatorPlugin());
        this.validators.register("range", new RangeValidatorPlugin());
        this.validators.register("multipleOf", new MultipleOfValidatorPlugin());
        this.validators.register("arrayItems", new ArrayItemsValidatorPlugin());
        this.validators.register("url", new UrlValidatorPlugin());
        this.validators.register("iban", new IbanValidatorPlugin());
        this.validators.register("email", new EmailValidatorPlugin());
        this.validators.register("enum", new EnumValidatorPlugin());
        this.validators.register("const", new ConstValidatorPlugin());
        this.validators.register("integer", new IntegerValidatorPlugin());
        this.validators.register("objectProperties", new ObjectPropertiesValidatorPlugin());

        const dateFormatter = new DateFormatterPlugin();
        const phoneFormatter = new PhoneFormatterPlugin();
        const textCaseFormatter = new TextCaseFormatterPlugin();
        const currencyFormatter = new CurrencyFormatterPlugin();

        this.formatters.register("date", dateFormatter);
        this.formatters.register("phone", phoneFormatter);
        this.formatters.register("textCase", textCaseFormatter);
        this.formatters.register("currency", currencyFormatter);

        this.parsers.register("date", dateFormatter);
        this.parsers.register("phone", phoneFormatter);
        this.parsers.register("currency", currencyFormatter);
    }

    /**
     * Returns true if at least one formatter in the chain is presentational (registered in `parsers` or implementing `IParser.parse`).
     *
     * @param formatterNames A single formatter name or array of formatter names.
     * @returns {boolean} True when the formatter chain is presentational (reversible).
     */
    public hasPresentationalParser(formatterNames: string | string[]): boolean {
        const list = Array.isArray(formatterNames) ? formatterNames : [formatterNames];
        return list.some((name) => Boolean(this.parsers.get(name) ?? this.getFormatterAsParser(name)));
    }

    /**
     * Executes a chain of registered formatters sequentially on a raw model value.
     *
     * Fails **soft**, which is the mirror image of {@link executeValidation}'s fail-closed contract and
     * for the same reason: a formatter runs inside a UI5 property binding, where a thrown error does not
     * invalidate one field but takes the whole render with it. A formatter that crashes is reported and
     * its step is replaced by the safe string form of its input, so the chain still yields a display
     * value. The invariant a caller may rely on is that a formatter step either formats or degrades —
     * it never propagates.
     *
     * @param rawValue The raw value from the model.
     * @param formatterNames A single formatter name or array of formatter names.
     * @param args Optional formatter arguments.
     * @returns {unknown} The formatted display value.
     */
    public runFormatters(rawValue: unknown, formatterNames: string | string[], args?: unknown): unknown {
        const list = Array.isArray(formatterNames) ? formatterNames : [formatterNames];
        let current: unknown = rawValue;
        for (const name of list) {
            const formatter = this.formatters.get(name);
            if (formatter) {
                try {
                    current = formatter.format(current, args);
                } catch (error) {
                    const detail = error instanceof Error ? error.message : safeToString(error);
                    Logger.error(`[MetaUI] PipelineManager: Formatter '${name}' crashed during execution.`, detail);
                    current = safeToString(current);
                }
            }
        }
        return current;
    }

    /**
     * Executes a chain of registered parsers in reverse order on a UI control value to recover the raw model value.
     *
     * @param uiValue The value extracted from the UI control.
     * @param parserNames A single formatter/parser name or array of names.
     * @param args Optional parser arguments.
     * @returns {unknown} The parsed raw value for the model.
     */
    public runParsers(uiValue: unknown, parserNames: string | string[], args?: unknown): unknown {
        const list = Array.isArray(parserNames) ? parserNames : [parserNames];
        let current: unknown = uiValue;
        for (let i = list.length - 1; i >= 0; i--) {
            const name = list[i];
            const parser = this.parsers.get(name) ?? this.getFormatterAsParser(name);
            if (parser) {
                current = parser.parse(current, args);
            }
        }
        return current;
    }

    private getFormatterAsParser(name: string): IParser | undefined {
        const formatter = this.formatters.get(name);
        return formatter && typeof formatter.parse === "function" ? (formatter as IParser) : undefined;
    }

    /**
     * Runs all schema-configured validators for a given value and property metadata.
     *
     * @param value The live value to validate.
     * @param propMeta The property metadata defining constraints.
     * @param isDynamicallyRequired Optional dynamic required override.
     * @returns {IValidationResult} The validation outcome.
     */
    public runValidators(
        value: unknown,
        propMeta: IPropertyMetadata,
        isDynamicallyRequired?: boolean
    ): IValidationResult {
        return this.assembleAndExecute(propMeta, value, isDynamicallyRequired);
    }

    /**
     * Executes the validation pipeline sequentially. Fails fast on the first encountered error.
     *
     * Fails **closed** on every rule it cannot honour: an unregistered rule name and a validator that throws both
     * return `{ isValid: false }` with a schema-configuration message, so a misconfigured field is reported rather
     * than silently waved through.
     *
     * @param parsedValue The raw extracted value from the UI control.
     * @param requestedValidators Array of validation rule keys (e.g. `['required', 'email']`).
     * @param argsMap Optional map of parameters required by specific rules (e.g. `{ maxLength: 50 }`).
     * @returns {IValidationResult} The final result state and any associated error message.
     */
    public executeValidation(
        parsedValue: unknown,
        requestedValidators: string[],
        argsMap?: Record<string, unknown>
    ): IValidationResult {
        const reqArgs = argsMap?.required;
        const isRequired =
            requestedValidators.includes("required") &&
            !(isRecord(reqArgs) && reqArgs.required === false && parsedValue !== null);
        const hasArrayRule = requestedValidators.includes("arrayItems") && Array.isArray(parsedValue);
        const hasObjectRule =
            requestedValidators.includes("objectProperties") &&
            typeof parsedValue === "object" &&
            parsedValue !== null &&
            !Array.isArray(parsedValue);
        if (isEmptyValue(parsedValue) && !isRequired && !hasArrayRule && !hasObjectRule) {
            return { isValid: true };
        }

        for (const rule of requestedValidators) {
            const validator = this.validators.get(rule);
            if (!validator) {
                // Fail closed, exactly as the `catch` below does for a validator that crashes. Skipping an
                // unregistered rule meant a single typo in `ui.validators` silently disabled validation for the
                // field, and the two opposite contracts lived three lines apart in the same loop.
                const detail = `Requested validator '${rule}' is not registered.`;
                Logger.error(`[MetaUI] PipelineManager: ${detail}`);
                return {
                    isValid: false,
                    errorMessage: I18n.getText(TEXT_KEY.schemaConfigUnregisteredValidator, [rule])
                };
            }
            const args = argsMap ? argsMap[rule] : undefined;
            try {
                const result = validator.validate(parsedValue, args);
                if (!result.isValid) {
                    return result;
                }
            } catch (error) {
                const msg = error instanceof Error ? error.message : safeToString(error);
                Logger.error(`[MetaUI] PipelineManager: Validator '${rule}' crashed during execution.`, msg);
                return { isValid: false, errorMessage: I18n.getText(TEXT_KEY.systemError, [msg]) };
            }
        }
        return { isValid: true };
    }

    /**
     * Assembles the validator list polymorphically by querying each registered validator plugin's
     * `extractRule` hook, plus any explicit `ui.validators` entries, and executes the pipeline.
     *
     * @param propMeta The schema property descriptor for the field.
     * @param value The current raw value to validate.
     * @param isDynamicallyRequired Optional override for the `required` state (e.g. from PolicyEngine).
     * @returns {IValidationResult} The combined validation result.
     */
    public assembleAndExecute(
        propMeta: IPropertyMetadata,
        value: unknown,
        isDynamicallyRequired?: boolean
    ): IValidationResult {
        const validatorsToRun: string[] = [];
        const argsMap: Record<string, unknown> = {};

        for (const [key, validator] of this.validators.items.entries()) {
            if (typeof validator.extractRule === "function") {
                const extraction = validator.extractRule(propMeta, isDynamicallyRequired);
                if (extraction.active) {
                    validatorsToRun.push(key);
                    if (extraction.args !== undefined) {
                        argsMap[key] = extraction.args;
                    }
                }
            }
        }

        if (propMeta.ui?.validators) {
            for (const v of propMeta.ui.validators) {
                if (typeof v === "string") {
                    if (!validatorsToRun.includes(v)) {
                        validatorsToRun.push(v);
                    }
                } else if (v && v.name) {
                    if (!validatorsToRun.includes(v.name)) {
                        validatorsToRun.push(v.name);
                    }
                    if (v.args !== undefined) {
                        argsMap[v.name] = v.args;
                    }
                }
            }
        }

        if (validatorsToRun.length > 0) {
            return this.executeValidation(value, validatorsToRun, argsMap);
        }
        return { isValid: true };
    }
}

/**
 * Singleton instance for global access to the active validation pipeline.
 * @public
 */
export const GlobalPipeline = new PipelineManager();
