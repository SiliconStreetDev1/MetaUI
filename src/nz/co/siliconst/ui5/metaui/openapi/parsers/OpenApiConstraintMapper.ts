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
import { MAX_SCHEMA_DEPTH } from "../../constants/MetaUIConstants";

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

/**
 * Keywords whose value is a dictionary of caller-chosen names to sub-schemas.
 * Keys inside these dictionaries are user data, never JSON Schema keywords, so the
 * keyword merge rules below must not be applied one level down from them.
 */
const SCHEMA_MAP_KEYWORDS: ReadonlySet<string> = new Set([
    "properties",
    "patternProperties",
    "definitions",
    "$defs",
    "dependentSchemas"
]);

/**
 * Composition keywords. Their arrays are branch lists, not value lists: concatenating two of them
 * turns an intersection into a union, which admits values both sources reject.
 */
const COMPOSITION_KEYWORDS: ReadonlySet<string> = new Set(["allOf", "anyOf", "oneOf"]);

/**
 * Boolean keywords whose intersection is the logical OR, because `true` asserts a constraint and
 * `false` asserts nothing. Taking the later branch's value instead let `true ∧ false` resolve to
 * `false` and silently re-admit the values the `true` branch rejects.
 */
const OR_BOOLEAN_KEYWORDS: ReadonlySet<string> = new Set(["uniqueItems"]);

/** The two JSON Schema keywords that carry a draft-4 boolean modifier or a draft-6+ numeric bound. */
const EXCLUSIVE_BOUND_KEYS: ReadonlySet<string> = new Set(["exclusiveMinimum", "exclusiveMaximum"]);

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
        // WALKER_EXEMPT: OpenApiConstraintMapper.resolveAllOf folds nested allOf composition branch arrays via deepMergeSchemas into a single intersection record before property mapping begins.
        if (!Array.isArray(currentProp.allOf)) {
            return currentProp;
        }
        if (depth > MAX_SCHEMA_DEPTH) {
            Logger.warn(
                `[MetaUI OpenApiConstraintMapper] allOf nesting exceeded MAX_SCHEMA_DEPTH (${MAX_SCHEMA_DEPTH}); ` +
                    `${currentProp.allOf.length} branch(es) were not merged, so their properties and ` +
                    `constraints are missing from this schema.`
            );
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
     * Copies OpenAPI state modifiers (`readOnly`, `writeOnly`, `nullable`) onto `metaProp`.
     *
     * `deprecated` is deliberately not carried: nothing in the render or validation pipeline consumes it,
     * and a keyword that is mapped but never read reads as a supported feature that silently does nothing.
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
     * Both arguments are treated as schema objects, so every key is a JSON Schema keyword. Dictionaries whose
     * keys are caller-chosen names (`properties`, `patternProperties`, `definitions`, `$defs`, `dependentSchemas`)
     * are routed through {@link OpenApiConstraintMapper.mergeSchemaMap}, which re-enters this method one level
     * down. Without that routing a property literally named `type`, `enum` or `pattern` would be merged by the
     * keyword rules and lose its definition.
     *
     * Every keyword without an explicit rule below falls through to `output[key] = srcVal`, which is
     * *override* and not intersection. That default is safe only for keywords that carry no assertion
     * (`title`, `description`, `example`, …); for an assertion keyword it lets the later branch widen
     * the earlier one. `multipleOf`, the mixed-dialect exclusive bounds, `uniqueItems`, `const` and
     * `additionalProperties` are therefore intersected explicitly, and a pair that genuinely cannot be
     * reconciled in a single schema object is reported rather than silently resolved.
     *
     * @param target The target schema object.
     * @param source The source schema object to merge into `target`.
     * @returns {unknown} A new merged schema record.
     */
    public static deepMergeSchemas(target: unknown, source: unknown): unknown {
        return this.deepMergeSchemasInternal(target, source, 0, new WeakSet<object>());
    }

    private static deepMergeSchemasInternal(
        target: unknown,
        source: unknown,
        depth: number,
        activeRecords: WeakSet<object>
    ): unknown {
        // WALKER_EXEMPT: OpenApiConstraintMapper.deepMergeSchemasInternal performs a binary allOf intersection over two raw JsonRecord trees (target and source), not a single-schema walk.
        const outTarget: JsonRecord = isRecord(target) ? target : {};
        const output: JsonRecord = { ...outTarget };
        if (!isRecord(source)) {
            return output;
        }
        if (depth > MAX_SCHEMA_DEPTH) {
            Logger.warn(
                `[MetaUI OpenApiConstraintMapper] Maximum schema depth (${MAX_SCHEMA_DEPTH}) reached in ` +
                    `deepMergeSchemas; truncating recursive allOf merge.`
            );
            return output;
        }
        if ((isRecord(target) && activeRecords.has(target)) || activeRecords.has(source)) {
            Logger.warn(
                "[MetaUI OpenApiConstraintMapper] Circular schema record detected in deepMergeSchemas; " +
                    "truncating recursive allOf merge."
            );
            return output;
        }
        if (isRecord(target)) {
            activeRecords.add(target);
        }
        activeRecords.add(source);
        try {
            let contradictoryConst = false;

            for (const key of Object.keys(source)) {
                const srcVal = source[key];
                const targetVal = outTarget[key];
                if (key === "const" && "const" in outTarget && !this.isSameJsonValue(targetVal, srcVal)) {
                    contradictoryConst = true;
                    Logger.error(
                        `[MetaUI OpenApiConstraintMapper] Contradictory 'const' in allOf merge ` +
                            `(${JSON.stringify(targetVal)} vs ${JSON.stringify(srcVal)}); ` +
                            `no value satisfies both branches.`
                    );
                } else if (key === "multipleOf" && typeof targetVal === "number" && typeof srcVal === "number") {
                    output[key] = this.intersectMultipleOf(targetVal, srcVal);
                } else if (EXCLUSIVE_BOUND_KEYS.has(key) && this.isMixedExclusiveDialect(targetVal, srcVal)) {
                    output[key] = this.intersectMixedExclusive(key, outTarget, source);
                } else if (
                    OR_BOOLEAN_KEYWORDS.has(key) &&
                    typeof targetVal === "boolean" &&
                    typeof srcVal === "boolean"
                ) {
                    output[key] = targetVal || srcVal;
                } else if (key === "additionalProperties" && targetVal !== undefined) {
                    output[key] = this.intersectAdditionalProperties(targetVal, srcVal, depth + 1, activeRecords);
                } else if (SCHEMA_MAP_KEYWORDS.has(key) && isRecord(targetVal) && isRecord(srcVal)) {
                    output[key] = this.mergeSchemaMap(targetVal, srcVal, depth + 1, activeRecords);
                } else if (key === "type" && targetVal !== undefined && srcVal !== undefined && targetVal !== srcVal) {
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
                    output[key] = this.intersectEnums(targetVal, srcVal);
                } else if (
                    key === "pattern" &&
                    typeof targetVal === "string" &&
                    typeof srcVal === "string" &&
                    targetVal !== srcVal
                ) {
                    output[key] = this.composePatterns(targetVal, srcVal);
                } else if (COMPOSITION_KEYWORDS.has(key) && Array.isArray(targetVal) && Array.isArray(srcVal)) {
                    Logger.warn(
                        `[MetaUI OpenApiConstraintMapper] Two allOf branches declare '${key}'. ` +
                            `A single schema cannot express the intersection of two branch lists, so the ` +
                            `${srcVal.length} branch(es) of the later '${key}' are not enforced.`
                    );
                    output[key] = targetVal;
                } else if (Array.isArray(srcVal)) {
                    output[key] = Array.isArray(targetVal)
                        ? Array.from(new Set([...targetVal, ...srcVal]))
                        : [...srcVal];
                } else if (isRecord(srcVal)) {
                    output[key] = isRecord(targetVal)
                        ? this.deepMergeSchemasInternal(targetVal, srcVal, depth + 1, activeRecords)
                        : { ...srcVal };
                } else {
                    output[key] = srcVal;
                }
            }
            if (contradictoryConst) {
                // Follow the `enum` precedent: an intersection no value satisfies is published as an
                // empty choice list, which `OpenApiPropertyMapper` renders as a disabled, empty select
                // rather than as unconstrained free text. The first branch's `const` is kept so the
                // constraint stays enforced on the plain JSON Schema path, which drops an empty `enum`.
                output.enum = [];
            }
            return output;
        } finally {
            if (isRecord(target)) {
                activeRecords.delete(target);
            }
            activeRecords.delete(source);
        }
    }

    /**
     * Intersects two `multipleOf` constraints. A value satisfies both exactly when it is a multiple
     * of their least common multiple, so the LCM — not the later branch's value — is the intersection.
     *
     * @param targetVal The target `multipleOf`.
     * @param srcVal The source `multipleOf`.
     * @returns {number} The least common multiple, or the larger bound when it cannot be computed exactly.
     */
    private static intersectMultipleOf(targetVal: number, srcVal: number): number {
        if (targetVal === srcVal) {
            return targetVal;
        }
        const lcm = this.leastCommonMultiple(targetVal, srcVal);
        if (lcm !== undefined) {
            return lcm;
        }
        Logger.warn(
            `[MetaUI OpenApiConstraintMapper] Cannot express the intersection of 'multipleOf' ` +
                `${targetVal} and ${srcVal} exactly; keeping ${Math.max(targetVal, srcVal)}, ` +
                `the other bound is not enforced.`
        );
        return Math.max(targetVal, srcVal);
    }

    /**
     * Computes the least common multiple of two positive `multipleOf` values, scaling decimals to
     * integers first. Returns `undefined` when either value is non-positive, non-finite, written in
     * exponential notation, or when the result would leave the exact-integer range.
     *
     * @param a The first divisor.
     * @param b The second divisor.
     * @returns {number | undefined} The least common multiple, or `undefined` when it is not exact.
     */
    private static leastCommonMultiple(a: number, b: number): number | undefined {
        const places = Math.max(this.decimalPlaces(a), this.decimalPlaces(b));
        if (!Number.isFinite(places) || a <= 0 || b <= 0 || !Number.isFinite(a) || !Number.isFinite(b)) {
            return undefined;
        }
        const factor = Math.pow(10, places);
        const intA = Math.round(a * factor);
        const intB = Math.round(b * factor);
        if (!Number.isSafeInteger(intA) || !Number.isSafeInteger(intB) || intA <= 0 || intB <= 0) {
            return undefined;
        }
        let x = intA;
        let y = intB;
        while (y !== 0) {
            const next = x % y;
            x = y;
            y = next;
        }
        const multiple = (intA / x) * intB;
        return Number.isSafeInteger(multiple) ? multiple / factor : undefined;
    }

    /**
     * Counts the decimal places in a number's plain decimal notation.
     *
     * @param value The number to inspect.
     * @returns {number} The decimal place count, or `NaN` for exponential notation.
     */
    private static decimalPlaces(value: number): number {
        const text = String(value);
        if (text.includes("e") || text.includes("E")) {
            return Number.NaN;
        }
        const dot = text.indexOf(".");
        return dot === -1 ? 0 : text.length - dot - 1;
    }

    /** True when one branch states an exclusive bound as a draft-4 boolean and the other as a draft-6+ number. */
    private static isMixedExclusiveDialect(targetVal: unknown, srcVal: unknown): boolean {
        return (
            (typeof targetVal === "number" && typeof srcVal === "boolean") ||
            (typeof targetVal === "boolean" && typeof srcVal === "number")
        );
    }

    /**
     * Intersects an `exclusiveMinimum` / `exclusiveMaximum` pair whose branches use different dialects.
     *
     * A draft-4 `true` means "the sibling `minimum`/`maximum` is exclusive", so it is first rewritten as
     * the numeric bound it stands for; a draft-4 `false` asserts nothing and therefore cannot override a
     * numeric bound. Taking the later branch's raw value instead deleted a real `< n` bound whenever the
     * other branch happened to spell its dialect differently.
     *
     * @param key Either `"exclusiveMinimum"` or `"exclusiveMaximum"`.
     * @param targetRec The accumulated target schema object.
     * @param sourceRec The source schema object being merged in.
     * @returns {number} The tighter of the two effective exclusive bounds.
     */
    private static intersectMixedExclusive(key: string, targetRec: JsonRecord, sourceRec: JsonRecord): number {
        const isMax = key === "exclusiveMaximum";
        const boundKey = isMax ? "maximum" : "minimum";
        const targetBound = this.effectiveExclusiveBound(targetRec, key, boundKey);
        const sourceBound = this.effectiveExclusiveBound(sourceRec, key, boundKey);
        if (targetBound !== undefined && sourceBound !== undefined) {
            return isMax ? Math.min(targetBound, sourceBound) : Math.max(targetBound, sourceBound);
        }
        return targetBound !== undefined ? targetBound : (sourceBound as number);
    }

    /** Resolves a branch's exclusive bound to a number, rewriting the draft-4 `true` form via its sibling bound. */
    private static effectiveExclusiveBound(rec: JsonRecord, key: string, boundKey: string): number | undefined {
        const raw = rec[key];
        if (typeof raw === "number") {
            return raw;
        }
        if (raw === true) {
            return readNumber(rec, boundKey);
        }
        return undefined;
    }

    /**
     * Intersects two `additionalProperties` declarations. `false` closes an object and therefore wins over
     * both `true` and a sub-schema; a sub-schema is narrower than `true`; two sub-schemas merge as schemas.
     *
     * @param targetVal The target `additionalProperties`.
     * @param srcVal The source `additionalProperties`.
     * @returns {unknown} The intersected declaration.
     */
    private static intersectAdditionalProperties(
        targetVal: unknown,
        srcVal: unknown,
        depth: number = 0,
        activeRecords: WeakSet<object> = new WeakSet<object>()
    ): unknown {
        // WALKER_EXEMPT: Mutually-recursive helper of OpenApiConstraintMapper.deepMergeSchemas for binary allOf intersection over two raw JsonRecord trees.
        if (targetVal === false || srcVal === false) {
            return false;
        }
        if (isRecord(targetVal) && isRecord(srcVal)) {
            return this.deepMergeSchemasInternal(targetVal, srcVal, depth, activeRecords);
        }
        if (isRecord(targetVal)) {
            return targetVal;
        }
        if (isRecord(srcVal)) {
            return deepClone(srcVal);
        }
        return targetVal === true && srcVal === true ? true : (srcVal ?? targetVal);
    }

    /** Key-order-independent structural equality for two JSON values, used to compare `const` declarations. */
    private static isSameJsonValue(a: unknown, b: unknown): boolean {
        return this.canonicalJson(a) === this.canonicalJson(b);
    }

    /** Serializes a JSON value with object keys in sorted order so equality does not depend on key order. */
    private static canonicalJson(value: unknown): string {
        if (Array.isArray(value)) {
            return `[${value.map((entry) => this.canonicalJson(entry)).join(",")}]`;
        }
        if (isRecord(value)) {
            return `{${Object.keys(value)
                .sort()
                .map((key) => `${JSON.stringify(key)}:${this.canonicalJson(value[key])}`)
                .join(",")}}`;
        }
        return JSON.stringify(value) ?? "undefined";
    }

    /**
     * Merges two dictionaries of name-to-sub-schema entries. Entry keys are caller-chosen names, so no
     * keyword rule is applied at this level; each pair of sub-schemas is merged as a schema object again.
     *
     * @param target The target dictionary.
     * @param source The source dictionary to merge into `target`.
     * @returns {JsonRecord} A new merged dictionary.
     */
    private static mergeSchemaMap(
        target: JsonRecord,
        source: JsonRecord,
        depth: number = 0,
        activeRecords: WeakSet<object> = new WeakSet<object>()
    ): JsonRecord {
        // WALKER_EXEMPT: Mutually-recursive helper of OpenApiConstraintMapper.deepMergeSchemas for binary allOf intersection over two raw JsonRecord property maps.
        const output: JsonRecord = { ...target };
        for (const name of Object.keys(source)) {
            const srcEntry = source[name];
            const targetEntry = target[name];
            if (isRecord(targetEntry) && isRecord(srcEntry)) {
                const merged = this.deepMergeSchemasInternal(targetEntry, srcEntry, depth, activeRecords);
                output[name] = isRecord(merged) ? merged : srcEntry;
            } else {
                output[name] = srcEntry;
            }
        }
        return output;
    }

    /**
     * Intersects two `enum` lists. An empty result means no value satisfies the composition; the empty list
     * is kept (rather than dropped, which would read as "unconstrained") and reported.
     *
     * @param targetVal The target `enum` list.
     * @param srcVal The source `enum` list.
     * @returns {unknown[]} The intersected `enum` list, possibly empty.
     */
    private static intersectEnums(targetVal: unknown[], srcVal: unknown[]): unknown[] {
        const intersection = targetVal.filter((item) => srcVal.includes(item));
        if (intersection.length === 0) {
            Logger.error(
                `[MetaUI OpenApiConstraintMapper] Contradictory 'enum' in allOf merge ` +
                    `(${JSON.stringify(targetVal)} vs ${JSON.stringify(srcVal)}); no value satisfies both branches.`
            );
        }
        return intersection;
    }

    /**
     * Combines two `pattern` constraints into one regular expression that requires both.
     *
     * The composition nests each source inside a lookahead, which renumbers capture groups and therefore
     * rewires any backreference: `(a)\1` + `(b)\1` would compose into a regex that rejects strings both
     * sources accept, and two patterns using the same named group would not even compile. Renumbering
     * correctly needs a full regex parser (escapes, character classes, named-group collisions) — more risk
     * than the bug is worth — so a pattern carrying a capture group is left uncomposed and reported instead.
     *
     * @param targetVal The target `pattern`.
     * @param srcVal The source `pattern`.
     * @returns {string} The composed pattern, or `targetVal` when composition would be unsafe.
     */
    private static composePatterns(targetVal: string, srcVal: string): string {
        if (this.hasCaptureGroup(targetVal) || this.hasCaptureGroup(srcVal)) {
            Logger.warn(
                `[MetaUI OpenApiConstraintMapper] Cannot safely compose patterns '${targetVal}' and '${srcVal}': ` +
                    `a capture group would be renumbered by the composition. Keeping '${targetVal}'; ` +
                    `'${srcVal}' is not enforced.`
            );
            return targetVal;
        }
        return `^(?=[\\s\\S]*(?:${targetVal}))(?=[\\s\\S]*(?:${srcVal}))`;
    }

    /**
     * Reports whether a regular expression source contains a capturing group (numbered or named),
     * ignoring escaped parentheses and parentheses inside character classes.
     *
     * @param pattern The regular expression source text.
     * @returns {boolean} True when at least one capturing group is present.
     */
    private static hasCaptureGroup(pattern: string): boolean {
        let escaped = false;
        let inClass = false;
        for (let i = 0; i < pattern.length; i++) {
            const char = pattern[i];
            if (escaped) {
                escaped = false;
            } else if (char === "\\") {
                escaped = true;
            } else if (inClass) {
                if (char === "]") inClass = false;
            } else if (char === "[") {
                inClass = true;
            } else if (char === "(") {
                // "(" starts a capturing group unless followed by "?", and "(?<name>" captures again
                // (while "(?<=" and "(?<!" are lookbehinds and do not).
                if (pattern[i + 1] !== "?") return true;
                if (pattern[i + 2] === "<" && pattern[i + 3] !== "=" && pattern[i + 3] !== "!") return true;
            }
        }
        return false;
    }
}
