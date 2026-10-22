/**
 * @file OpenApiConstraintMapper.ts
 * @description Pure mapping helpers for OpenAPI 2.0/3.0 validation constraints,
 * format patterns, state modifiers, `allOf` composition merging, and `discriminator` blocks.
 */

import { IPropertyMetadata } from "../../interfaces/ISchema";
import { OpenApiRefResolver } from "../OpenApiRefResolver";
import { SchemaDirectiveNormalizer } from "../../core/SchemaDirectiveNormalizer";
import { Logger } from "../../utils/Logger";
import { JsonRecord, isRecord, readString, readNumber, readBoolean, deepClone } from "../../utils/TypeGuards";

const MAX_BOUND_KEYS: ReadonlySet<string> = new Set([
    "minimum",
    "minLength",
    "minItems",
    "minProperties",
    "exclusiveMinimum"
]);

const MIN_BOUND_KEYS: ReadonlySet<string> = new Set([
    "maximum",
    "maxLength",
    "maxItems",
    "maxProperties",
    "exclusiveMaximum"
]);

/** Standard RFC regex patterns for OpenAPI string formats not covered by dedicated validators. */
const FORMAT_PATTERNS: Readonly<Record<string, string>> = {
    uuid: "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$",
    ipv4: "^(?:(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)\\.){3}(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)$",
    ipv6: "^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$",
    hostname: "^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$"
};

/**
 * Stateless utility for mapping OpenAPI constraints, state flags, and `allOf` compositions
 * onto a normalized `IPropertyMetadata` target.
 *
 * @namespace nz.co.siliconst.ui5.metaui.openapi.parsers
 * @public
 */
export class OpenApiConstraintMapper {
    private static readonly MAX_ALLOF_DEPTH = 10;

    /**
     * Resolves and merges an OpenAPI `allOf` array into a single combined raw schema object.
     *
     * @param currentProp The raw OpenAPI property schema.
     * @param openApiRoot The OpenAPI root document for resolving `$ref` pointers.
     * @param depth Current recursion depth to prevent stack overflows.
     * @param activeRefs Set of active `$ref` strings on the recursion stack.
     * @returns {JsonRecord} The merged property schema object.
     */
    public static resolveAllOf(
        currentProp: JsonRecord,
        openApiRoot: unknown,
        depth: number = 0,
        activeRefs: Set<string> = new Set()
    ): JsonRecord {
        if (!Array.isArray(currentProp.allOf) || depth > this.MAX_ALLOF_DEPTH) {
            return currentProp;
        }

        let accumulatedBase: JsonRecord = {};
        for (const subSchema of currentProp.allOf) {
            if (!isRecord(subSchema)) {
                continue;
            }
            let resolvedSub: JsonRecord = subSchema;
            const refPath = readString(resolvedSub, "$ref");
            const nextRefs = new Set(activeRefs);
            if (refPath) {
                if (nextRefs.has(refPath)) {
                    continue;
                }
                nextRefs.add(refPath);
                const resolved = OpenApiRefResolver.resolve(refPath, openApiRoot);
                resolvedSub = isRecord(resolved) ? { ...resolved, ...resolvedSub } : { ...resolvedSub };
                delete resolvedSub.$ref;
            }
            if (Array.isArray(resolvedSub.allOf)) {
                resolvedSub = this.resolveAllOf(resolvedSub, openApiRoot, depth + 1, nextRefs);
            }
            const mergedSub = this.deepMergeSchemas(accumulatedBase, resolvedSub);
            if (isRecord(mergedSub)) {
                accumulatedBase = mergedSub;
            }
        }
        const ownProps: JsonRecord = { ...currentProp };
        delete ownProps.allOf;
        const finalMerged = this.deepMergeSchemas(accumulatedBase, ownProps);
        return isRecord(finalMerged) ? finalMerged : ownProps;
    }

    /**
     * Applies string, numeric, array, object, and exclusive range constraints
     * from a raw OpenAPI property onto `metaProp`.
     *
     * @param metaProp The target `IPropertyMetadata` descriptor.
     * @param currentProp The source OpenAPI property record.
     */
    public static applyConstraints(
        metaProp: IPropertyMetadata,
        currentProp: JsonRecord
    ): void {
        const maxLength = readNumber(currentProp, "maxLength");
        const minLength = readNumber(currentProp, "minLength");
        const pattern = readString(currentProp, "pattern");
        const format = readString(currentProp, "format");

        if (maxLength !== undefined) metaProp.maxLength = maxLength;
        if (minLength !== undefined) metaProp.minLength = minLength;
        if (pattern !== undefined) {
            metaProp.pattern = pattern;
        } else if (format && FORMAT_PATTERNS[format]) {
            metaProp.pattern = FORMAT_PATTERNS[format];
        }

        const maximum = readNumber(currentProp, "maximum");
        const minimum = readNumber(currentProp, "minimum");
        const multipleOf = readNumber(currentProp, "multipleOf");
        if (maximum !== undefined) metaProp.maximum = maximum;
        if (minimum !== undefined) metaProp.minimum = minimum;
        if (multipleOf !== undefined) metaProp.multipleOf = multipleOf;

        const maxItems = readNumber(currentProp, "maxItems");
        const minItems = readNumber(currentProp, "minItems");
        const uniqueItems = readBoolean(currentProp, "uniqueItems");
        if (maxItems !== undefined) metaProp.maxItems = maxItems;
        if (minItems !== undefined) metaProp.minItems = minItems;
        if (uniqueItems !== undefined) metaProp.uniqueItems = uniqueItems;

        const maxProperties = readNumber(currentProp, "maxProperties");
        const minProperties = readNumber(currentProp, "minProperties");
        if (maxProperties !== undefined) metaProp.maxProperties = maxProperties;
        if (minProperties !== undefined) metaProp.minProperties = minProperties;

        const exMaxBool = readBoolean(currentProp, "exclusiveMaximum");
        const exMaxNum = readNumber(currentProp, "exclusiveMaximum");
        if (exMaxBool !== undefined) {
            if (exMaxBool === true && maximum !== undefined) {
                metaProp.exclusiveMaximum = true;
            } else if (exMaxBool === false) {
                metaProp.exclusiveMaximum = false;
            }
        } else if (exMaxNum !== undefined) {
            metaProp.exclusiveMaximum = exMaxNum;
        }

        const exMinBool = readBoolean(currentProp, "exclusiveMinimum");
        const exMinNum = readNumber(currentProp, "exclusiveMinimum");
        if (exMinBool !== undefined) {
            if (exMinBool === true && minimum !== undefined) {
                metaProp.exclusiveMinimum = true;
            } else if (exMinBool === false) {
                metaProp.exclusiveMinimum = false;
            }
        } else if (exMinNum !== undefined) {
            metaProp.exclusiveMinimum = exMinNum;
        }
    }

    /**
     * Copies OpenAPI state modifiers (`readOnly`, `writeOnly`, `nullable`, `deprecated`) onto `metaProp`.
     *
     * @param metaProp The target `IPropertyMetadata` descriptor.
     * @param currentProp The source OpenAPI property record.
     */
    public static applyStateModifiers(metaProp: IPropertyMetadata, currentProp: JsonRecord): void {
        if (readBoolean(currentProp, "readOnly") === true) metaProp.readOnly = true;
        if (readBoolean(currentProp, "writeOnly") === true) metaProp.writeOnly = true;
        const hasNullType = Array.isArray(currentProp.type) && currentProp.type.includes("null");
        if (
            readBoolean(currentProp, "nullable") === true ||
            readBoolean(currentProp, "x-nullable") === true ||
            hasNullType
        ) {
            metaProp.nullable = true;
        }
        if (readBoolean(currentProp, "deprecated") === true) metaProp.deprecated = true;
        if (currentProp.default !== undefined) metaProp.default = deepClone(currentProp.default);
        if (currentProp.example !== undefined) metaProp.example = deepClone(currentProp.example);
        if (currentProp.const !== undefined) metaProp.const = deepClone(currentProp.const);
    }

    /**
     * Maps OpenAPI 2.0 string or OpenAPI 3.0 object `discriminator` metadata onto `metaProp`.
     *
     * @param metaProp The target `IPropertyMetadata` descriptor.
     * @param currentProp The source OpenAPI property record.
     */
    public static applyDiscriminator(
        metaProp: IPropertyMetadata,
        currentProp: JsonRecord
    ): void {
        const disc = SchemaDirectiveNormalizer.normalizeDiscriminator(currentProp.discriminator);
        if (disc) {
            metaProp.discriminator = disc;
        }
    }

    /**
     * Deeply merges two raw OpenAPI schema objects (used for `allOf` composition) using JSON Schema intersection semantics.
     *
     * @param target The target schema object.
     * @param source The source schema object to merge into `target`.
     * @returns {unknown} A new merged schema record.
     */
    public static deepMergeSchemas(target: unknown, source: unknown): unknown {
        const outTarget: JsonRecord = isRecord(target) ? target : {};
        const output: JsonRecord = { ...outTarget };
        if (!isRecord(source)) {
            return output;
        }

        for (const key of Object.keys(source)) {
            const srcVal = source[key];
            const targetVal = outTarget[key];
            if (key === "type" && targetVal !== undefined && srcVal !== undefined && targetVal !== srcVal) {
                Logger.error(
                    `[MetaUI OpenApiConstraintMapper] Conflicting 'type' in allOf merge ` +
                        `('${String(targetVal)}' vs '${String(srcVal)}'); keeping '${String(targetVal)}'.`
                );
                output[key] = targetVal;
            } else if (MAX_BOUND_KEYS.has(key) && typeof targetVal === "number" && typeof srcVal === "number") {
                output[key] = Math.max(targetVal, srcVal);
            } else if (MIN_BOUND_KEYS.has(key) && typeof targetVal === "number" && typeof srcVal === "number") {
                output[key] = Math.min(targetVal, srcVal);
            } else if (
                (key === "exclusiveMinimum" || key === "exclusiveMaximum") &&
                typeof targetVal === "boolean" &&
                typeof srcVal === "boolean"
            ) {
                output[key] = targetVal || srcVal;
            } else if (key === "enum" && Array.isArray(targetVal) && Array.isArray(srcVal)) {
                output[key] = targetVal.filter((item) => srcVal.includes(item));
            } else if (key === "pattern" && typeof targetVal === "string" && typeof srcVal === "string" && targetVal !== srcVal) {
                output[key] = `^(?=[\\s\\S]*(?:${targetVal}))(?=[\\s\\S]*(?:${srcVal}))`;
            } else if (Array.isArray(srcVal)) {
                output[key] = Array.isArray(targetVal)
                    ? Array.from(new Set([...targetVal, ...srcVal]))
                    : [...srcVal];
            } else if (isRecord(srcVal)) {
                output[key] = isRecord(targetVal)
                    ? this.deepMergeSchemas(targetVal, srcVal)
                    : { ...srcVal };
            } else {
                output[key] = srcVal;
            }
        }
        return output;
    }
}
