/**
 * @file ArrayItemsValidatorPlugin.ts
 * @description Enforces the JSON-Schema array keywords `minItems`, `maxItems` and `uniqueItems`.
 */

import { IValidator, IValidationResult, IValidatorRuleExtraction } from "../../interfaces/IPipeline";
import { IPropertyMetadata } from "../../interfaces/ISchema";
import { isRecord, readNumber, readBoolean } from "../../utils/TypeGuards";

/** Arguments accepted by the array items validator. */
export interface IArrayItemsArgs {
    minItems?: number;
    maxItems?: number;
    uniqueItems?: boolean;
}

/**
 * Produces a deterministic, key-order-independent JSON string signature for structural equality checks.
 *
 * @param value The value to serialize.
 * @returns {string} Canonical JSON string.
 */
export function canonicalSerialize(value: unknown): string {
    if (Array.isArray(value)) {
        return `[${value.map((entry) => canonicalSerialize(entry)).join(",")}]`;
    }
    if (isRecord(value)) {
        const sortedKeys = Object.keys(value).sort();
        const pairs = sortedKeys.map((k) => `${JSON.stringify(k)}:${canonicalSerialize(value[k])}`);
        return `{${pairs.join(",")}}`;
    }
    return JSON.stringify(value);
}

/**
 * Validates array cardinality and uniqueness. Non-array values are ignored.
 * Uniqueness compares items structurally (JSON serialization), matching JSON-Schema semantics for objects.
 */
export class ArrayItemsValidatorPlugin implements IValidator {
    /**
     * Extracts `minItems`, `maxItems`, and `uniqueItems` constraints from a schema property descriptor.
     *
     * @param propMeta The schema property descriptor.
     * @returns {IValidatorRuleExtraction} Activation status and array constraint arguments.
     */
    public extractRule(propMeta: IPropertyMetadata): IValidatorRuleExtraction {
        const active =
            propMeta.minItems !== undefined || propMeta.maxItems !== undefined || propMeta.uniqueItems === true;
        if (!active) {
            return { active: false };
        }
        return {
            active: true,
            args: {
                minItems: propMeta.minItems,
                maxItems: propMeta.maxItems,
                uniqueItems: propMeta.uniqueItems
            }
        };
    }

    /**
     * @param parsedValue The array to test.
     * @param args The {@link IArrayItemsArgs} constraints.
     * @returns {IValidationResult} Invalid if any constraint is violated.
     */
    public validate(parsedValue: unknown, args?: unknown): IValidationResult {
        if (!Array.isArray(parsedValue) || !isRecord(args)) return { isValid: true };

        const minItems = readNumber(args, "minItems");
        const maxItems = readNumber(args, "maxItems");

        if (minItems !== undefined && parsedValue.length < minItems) {
            return { isValid: false, errorMessage: `At least ${minItems} item(s) required.` };
        }
        if (maxItems !== undefined && parsedValue.length > maxItems) {
            return { isValid: false, errorMessage: `At most ${maxItems} item(s) allowed.` };
        }
        if (readBoolean(args, "uniqueItems") === true) {
            const seen = new Set<string>();
            for (const item of parsedValue) {
                const signature = canonicalSerialize(item);
                if (seen.has(signature)) {
                    return { isValid: false, errorMessage: "All items must be unique." };
                }
                seen.add(signature);
            }
        }
        return { isValid: true };
    }
}
