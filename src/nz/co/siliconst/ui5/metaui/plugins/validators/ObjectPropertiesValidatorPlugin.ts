/**
 * @file ObjectPropertiesValidatorPlugin.ts
 * @description Validates object key counts against JSON Schema `minProperties` and `maxProperties`.
 */

import { IValidator, IValidationResult, IValidatorRuleExtraction } from "../../interfaces/IPipeline";
import { IPropertyMetadata } from "../../interfaces/ISchema";
import { isRecord, readNumber } from "../../utils/TypeGuards";
import { I18n, TEXT_KEY } from "../../utils/I18n";

/**
 * Enforces `minProperties` and `maxProperties` bounds on object payloads.
 *
 * @namespace nz.co.siliconst.ui5.metaui.plugins.validators
 * @internal
 */
export class ObjectPropertiesValidatorPlugin implements IValidator {
    /**
     * Extracts `minProperties` and `maxProperties` bounds from an object schema descriptor.
     *
     * @param propMeta The schema property descriptor.
     * @returns {IValidatorRuleExtraction} Activation status and property count bounds.
     */
    public extractRule(propMeta: IPropertyMetadata): IValidatorRuleExtraction {
        const hasMin = typeof propMeta.minProperties === "number";
        const hasMax = typeof propMeta.maxProperties === "number";
        if (!hasMin && !hasMax) {
            return { active: false };
        }
        return {
            active: true,
            args: {
                minProperties: propMeta.minProperties,
                maxProperties: propMeta.maxProperties
            }
        };
    }

    /**
     * Validates that the key count of an object value satisfies `minProperties` and `maxProperties`.
     *
     * @param parsedValue The object value to test.
     * @param args Bounds object containing `minProperties` and/or `maxProperties`.
     * @returns {IValidationResult} Invalid if the object key count violates the configured bounds.
     */
    public validate(parsedValue: unknown, args?: unknown): IValidationResult {
        if (!isRecord(parsedValue) || !isRecord(args)) {
            return { isValid: true };
        }
        const keyCount = Object.keys(parsedValue).length;
        const minProps = readNumber(args, "minProperties");
        const maxProps = readNumber(args, "maxProperties");

        if (minProps !== undefined && keyCount < minProps) {
            return { isValid: false, errorMessage: I18n.getText(TEXT_KEY.objectMinProperties, [minProps]) };
        }
        if (maxProps !== undefined && keyCount > maxProps) {
            return { isValid: false, errorMessage: I18n.getText(TEXT_KEY.objectMaxProperties, [maxProps]) };
        }
        return { isValid: true };
    }
}

