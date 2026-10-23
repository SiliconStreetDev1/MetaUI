/**
 * @file EnumValidatorPlugin.ts
 * @description Validates that a value matches one of the allowed JSON Schema `enum` entries.
 */

import { IValidator, IValidationResult, IValidatorRuleExtraction } from "../../interfaces/IPipeline";
import { IPropertyMetadata } from "../../interfaces/ISchema";
import { canonicalSerialize } from "./ArrayItemsValidatorPlugin";
import { isRecord } from "../../utils/TypeGuards";
import { I18n, TEXT_KEY } from "../../utils/I18n";

/**
 * Enforces the JSON Schema `enum` constraint across primitive, object, array, and `{ key, text }` enum entries.
 *
 * @namespace nz.co.siliconst.ui5.metaui.plugins.validators
 * @internal
 */
export class EnumValidatorPlugin implements IValidator {
    /**
     * Extracts the `enum` array from a schema property descriptor.
     *
     * @param propMeta The schema property descriptor.
     * @returns {IValidatorRuleExtraction} Activation status and allowed enum list.
     */
    public extractRule(propMeta: IPropertyMetadata): IValidatorRuleExtraction {
        if (Array.isArray(propMeta.enum) && propMeta.enum.length > 0) {
            return { active: true, args: { enum: propMeta.enum, isItemEnum: false } };
        }
        if (Array.isArray(propMeta.items?.enum) && propMeta.items!.enum.length > 0) {
            return { active: true, args: { enum: propMeta.items!.enum, isItemEnum: true } };
        }
        return { active: false };
    }

    /**
     * Validates that `parsedValue` is included in the allowed `enum` array.
     *
     * @param parsedValue The value to test.
     * @param args The allowed enum values array or `{ enum: unknown[], isItemEnum: boolean }`.
     * @returns {IValidationResult} Invalid if the value is not in the allowed set.
     */
    public validate(parsedValue: unknown, args?: unknown): IValidationResult {
        const enumList = Array.isArray(args)
            ? args
            : isRecord(args) && Array.isArray(args.enum)
              ? args.enum
              : null;
        const isItemEnum = isRecord(args) && args.isItemEnum === true;
        if (parsedValue === undefined || parsedValue === null || parsedValue === "" || !enumList || enumList.length === 0) {
            return { isValid: true };
        }
        const matchesEntry = (val: unknown): boolean => {
            if (enumList.includes(val)) return true;
            const serializedVal = typeof val === "object" && val !== null ? canonicalSerialize(val) : null;
            return enumList.some((item) => {
                if (serializedVal !== null && typeof item === "object" && item !== null) {
                    if (canonicalSerialize(item) === serializedVal) return true;
                }
                if (isRecord(item) && "key" in item && "text" in item) {
                    return item.key === val || String(item.key) === String(val);
                }
                return false;
            });
        };
        const shouldCheckItems = Array.isArray(parsedValue) && (isItemEnum || !enumList.some(Array.isArray));
        const matched = shouldCheckItems
            ? parsedValue.every((elem) => matchesEntry(elem))
            : matchesEntry(parsedValue);
        if (!matched) {
            const labels = enumList.map((item) =>
                isRecord(item) && "key" in item && "text" in item && item.key !== undefined
                    ? String(item.key)
                    : typeof item === "object" && item !== null
                      ? JSON.stringify(item)
                      : String(item)
            );
            return { isValid: false, errorMessage: I18n.getText(TEXT_KEY.enumMembership, [labels.join(", ")]) };
        }
        return { isValid: true };
    }
}

