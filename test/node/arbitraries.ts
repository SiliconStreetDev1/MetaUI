/**
 * @file arbitraries.ts
 * @description Shared fast-check generators for the MetaUI property suite.
 *
 * Three families, all built on one schema generator so a document, its OpenAPI 2.0 and 3.0
 * encodings and a conforming payload always describe the same thing:
 *
 *  - `jsonSchemaArb` / `schemaDocumentArb` — valid JSON Schema documents, optionally with
 *    `$defs` and `$ref` pointers into them.
 *  - `toOpenApi2` / `toOpenApi3` — the same document in both OpenAPI dialects, with `$ref`
 *    pointers rewritten to the dialect's definitions location.
 *  - `conformingValueArb` — payloads that satisfy a generated schema, checked by the
 *    independent reference evaluator `admits`.
 *
 * `admits` is deliberately a second, hand-written implementation of the JSON Schema keyword
 * subset. Properties that compare MetaUI's behaviour against it are therefore differential,
 * not self-referential.
 */

import fc from "fast-check";

/** A plain JSON object. */
export type JsonRecord = Record<string, unknown>;

/** Keyword subset every generator, the reference evaluator and the merge properties share. */
export const CONSTRAINT_KEYWORDS: readonly string[] = [
    "type",
    "minLength",
    "maxLength",
    "pattern",
    "enum",
    "const",
    "minimum",
    "maximum",
    "exclusiveMinimum",
    "exclusiveMaximum",
    "multipleOf",
    "minItems",
    "maxItems",
    "uniqueItems",
    "minProperties",
    "maxProperties",
    "format"
];

/**
 * Regex sources with no capturing group, so `OpenApiConstraintMapper.composePatterns` always
 * composes rather than bailing out. `\n` is reachable from the string generators on purpose:
 * a composition built on `.` instead of `[\s\S]` only breaks on multi-line input.
 */
export const SAFE_PATTERNS: readonly string[] = [
    "^[a-z]+$",
    "[0-9]{2,4}",
    "^A",
    "b$",
    "[a-c]",
    "[x-z]",
    "\\d",
    "^[A-Za-z0-9_]{1,8}$",
    "(?:ab)+",
    "[a-z]*q"
];

/** Regex sources that do contain a capturing group; composition must refuse these and say so. */
export const CAPTURING_PATTERNS: readonly string[] = ["(a)b", "(?<n>x)y", "(ab|cd)", "x(y)?z"];

/** Formats that both the JSON Schema and the OpenAPI path treat identically (no pattern enrichment). */
export const NEUTRAL_FORMATS: readonly string[] = ["email", "uri", "password", "date", "date-time", "byte"];

/** Formats for which `OpenApiConstraintMapper` substitutes an RFC pattern when none is declared. */
export const PATTERN_ENRICHED_FORMATS: readonly string[] = ["uuid", "ipv4", "ipv6", "hostname"];

/** Property names. Includes JSON Schema keyword names, which must survive a merge as property names. */
const propertyNameArb: fc.Arbitrary<string> = fc.oneof(
    { weight: 6, arbitrary: fc.constantFrom("alpha", "beta", "gamma", "delta", "id", "name", "count", "nested") },
    { weight: 1, arbitrary: fc.constantFrom("type", "enum", "pattern", "items", "required", "properties", "allOf") },
    { weight: 1, arbitrary: fc.constantFrom("a b", "a/b", "a~b", "a%20b", "Ünicode") }
);

/** Definition names used for `$defs` / `definitions` / `components.schemas` entries. */
const definitionNameArb: fc.Arbitrary<string> = fc.constantFrom("DefA", "DefB", "DefC");

const stringLeafArb: fc.Arbitrary<JsonRecord> = fc.oneof(
    fc.constant<JsonRecord>({ type: "string" }),
    fc
        .tuple(fc.integer({ min: 0, max: 4 }), fc.integer({ min: 0, max: 6 }))
        .map(([a, b]): JsonRecord => ({ type: "string", minLength: Math.min(a, b), maxLength: Math.max(a, b) })),
    fc.integer({ min: 1, max: 8 }).map((n): JsonRecord => ({ type: "string", maxLength: n })),
    fc.constantFrom(...SAFE_PATTERNS).map((p): JsonRecord => ({ type: "string", pattern: p })),
    fc
        .uniqueArray(fc.string({ minLength: 1, maxLength: 5 }), { minLength: 1, maxLength: 4 })
        .map((e): JsonRecord => ({ type: "string", enum: e })),
    fc.constantFrom(...NEUTRAL_FORMATS).map((f): JsonRecord => ({ type: "string", format: f }))
);

const numericLeafArb = (type: "integer" | "number"): fc.Arbitrary<JsonRecord> =>
    fc.oneof(
        fc.constant<JsonRecord>({ type }),
        fc
            .tuple(fc.integer({ min: -50, max: 50 }), fc.integer({ min: 0, max: 50 }))
            .map(([min, span]): JsonRecord => ({ type, minimum: min, maximum: min + span })),
        fc.integer({ min: 1, max: 6 }).map((m): JsonRecord => ({ type, multipleOf: m })),
        // Spans start at 2 and 1 respectively so the range stays satisfiable once the
        // exclusive endpoints are applied; an unsatisfiable leaf has no conforming payload.
        fc
            .tuple(fc.integer({ min: -20, max: 20 }), fc.integer({ min: 2, max: 30 }))
            .map(([min, span]): JsonRecord => ({ type, exclusiveMinimum: min, exclusiveMaximum: min + span })),
        fc
            .tuple(fc.integer({ min: -20, max: 20 }), fc.integer({ min: 1, max: 30 }))
            .map(([min, span]): JsonRecord => ({
                type,
                minimum: min,
                maximum: min + span,
                exclusiveMinimum: true
            }))
    );

const booleanLeafArb: fc.Arbitrary<JsonRecord> = fc.constant<JsonRecord>({ type: "boolean" });

/** A primitive schema node: no `properties`, no `items`. */
export const primitiveSchemaArb: fc.Arbitrary<JsonRecord> = fc.oneof(
    { weight: 4, arbitrary: stringLeafArb },
    { weight: 3, arbitrary: numericLeafArb("integer") },
    { weight: 2, arbitrary: numericLeafArb("number") },
    { weight: 1, arbitrary: booleanLeafArb }
);

/**
 * Builds a recursive JSON Schema generator bounded by `maxDepth` nesting levels.
 *
 * @param maxDepth Maximum number of nested `properties` / `items` levels below the root.
 * @returns {fc.Arbitrary<JsonRecord>} A generator of schema nodes.
 */
export function schemaNodeArb(maxDepth: number): fc.Arbitrary<JsonRecord> {
    if (maxDepth <= 0) {
        return primitiveSchemaArb;
    }
    const child = schemaNodeArb(maxDepth - 1);
    const objectArb = fc
        .dictionary(propertyNameArb, child, { minKeys: 1, maxKeys: 4 })
        .chain((properties) => {
            const keys = Object.keys(properties);
            return fc.subarray(keys).map((required): JsonRecord => {
                const node: JsonRecord = { type: "object", properties };
                if (required.length > 0) node.required = required;
                return node;
            });
        });
    const arrayArb = fc
        .tuple(child, fc.integer({ min: 0, max: 2 }), fc.integer({ min: 0, max: 3 }), fc.boolean())
        .map(([items, a, b, unique]): JsonRecord => {
            const node: JsonRecord = { type: "array", items };
            // `uniqueItems` with a positive `minItems` is unsatisfiable for small value domains
            // (two distinct booleans, an empty object); the payload generator would spin looking
            // for distinct members. Keep the pair satisfiable instead of filtering later.
            node.minItems = unique ? 0 : Math.min(a, b);
            node.maxItems = Math.min(a, b) + Math.abs(a - b);
            if (unique) node.uniqueItems = true;
            return node;
        });
    return fc.oneof(
        { weight: 4, arbitrary: primitiveSchemaArb },
        { weight: 3, arbitrary: objectArb },
        { weight: 2, arbitrary: arrayArb }
    );
}

/** A root object schema with between one and four properties, nested up to `maxDepth` levels. */
export function rootSchemaArb(maxDepth: number = 3): fc.Arbitrary<JsonRecord> {
    return fc
        .dictionary(propertyNameArb, schemaNodeArb(maxDepth), { minKeys: 1, maxKeys: 4 })
        .chain((properties) =>
            fc.subarray(Object.keys(properties)).map((required): JsonRecord => {
                const node: JsonRecord = { type: "object", properties };
                if (required.length > 0) node.required = required;
                return node;
            })
        );
}

/** A schema document: a root schema plus an optional `$defs` dictionary the root may `$ref` into. */
export interface ISchemaDocument {
    /** The root schema, using `#/$defs/<name>` pointers. */
    readonly root: JsonRecord;
    /** The definitions dictionary, keyed by definition name. */
    readonly defs: Record<string, JsonRecord>;
}

/** Generates a document whose root optionally references one generated definition. */
export function schemaDocumentArb(maxDepth: number = 3): fc.Arbitrary<ISchemaDocument> {
    return fc
        .tuple(
            rootSchemaArb(maxDepth),
            fc.dictionary(definitionNameArb, schemaNodeArb(1), { minKeys: 0, maxKeys: 2 }),
            propertyNameArb,
            fc.boolean()
        )
        .map(([root, defs, refKey, useRef]): ISchemaDocument => {
            const defNames = Object.keys(defs);
            if (!useRef || defNames.length === 0) {
                return { root, defs };
            }
            const properties = { ...(root.properties as JsonRecord) };
            properties[refKey] = { $ref: `#/$defs/${defNames[0]}` };
            return { root: { ...root, properties }, defs };
        });
}

/**
 * Rewrites every `$ref` string in a JSON value from one pointer prefix to another.
 *
 * @param value The JSON value to rewrite.
 * @param from The pointer prefix to replace (e.g. `"#/$defs/"`).
 * @param to The replacement prefix (e.g. `"#/definitions/"`).
 * @returns {unknown} A deep copy with the pointers rewritten.
 */
export function rewriteRefs(value: unknown, from: string, to: string): unknown {
    if (Array.isArray(value)) {
        return value.map((entry) => rewriteRefs(entry, from, to));
    }
    if (value && typeof value === "object") {
        const out: JsonRecord = {};
        for (const [key, raw] of Object.entries(value as JsonRecord)) {
            if (key === "$ref" && typeof raw === "string" && raw.startsWith(from)) {
                out[key] = to + raw.slice(from.length);
            } else {
                out[key] = rewriteRefs(raw, from, to);
            }
        }
        return out;
    }
    return value;
}

/**
 * Replaces every dialect-specific `$ref` pointer with a neutral `#/ref/<name>` form, so two
 * parses of the same logical API can be compared for equality. The pointer spelling is the one
 * thing an OpenAPI 2.0 and an OpenAPI 3.0 parse are *allowed* to differ in.
 *
 * @param value The parsed schema tree.
 * @returns {unknown} A deep copy with pointers neutralised.
 */
export function neutralizeRefs(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(neutralizeRefs);
    if (isPlainObject(value)) {
        const out: JsonRecord = {};
        for (const [key, raw] of Object.entries(value)) {
            if (key === "$ref" && typeof raw === "string") {
                out[key] = `#/ref/${raw.replace(/^#\/(definitions|components\/schemas|\$defs)\//, "")}`;
            } else {
                out[key] = neutralizeRefs(raw);
            }
        }
        return out;
    }
    return value;
}

/** Wraps a schema document as an OpenAPI 2.0 specification with the root under `definitions.Root`. */
export function toOpenApi2(doc: ISchemaDocument, rootKey: string = "Root"): JsonRecord {
    const definitions: JsonRecord = {};
    definitions[rootKey] = rewriteRefs(doc.root, "#/$defs/", "#/definitions/");
    for (const [name, def] of Object.entries(doc.defs)) {
        definitions[name] = rewriteRefs(def, "#/$defs/", "#/definitions/");
    }
    return { swagger: "2.0", info: { title: "Parity", version: "1.0.0" }, definitions };
}

/** Wraps a schema document as an OpenAPI 3.0 specification with the root under `components.schemas.Root`. */
export function toOpenApi3(doc: ISchemaDocument, rootKey: string = "Root"): JsonRecord {
    const schemas: JsonRecord = {};
    schemas[rootKey] = rewriteRefs(doc.root, "#/$defs/", "#/components/schemas/");
    for (const [name, def] of Object.entries(doc.defs)) {
        schemas[name] = rewriteRefs(def, "#/$defs/", "#/components/schemas/");
    }
    return { openapi: "3.0.3", info: { title: "Parity", version: "1.0.0" }, components: { schemas } };
}

/** Wraps a schema document as a plain JSON Schema document with the root inlined and `$defs` attached. */
export function toJsonSchema(doc: ISchemaDocument): JsonRecord {
    const out: JsonRecord = { ...doc.root };
    if (Object.keys(doc.defs).length > 0) {
        out.$defs = doc.defs;
    }
    return out;
}

/**
 * Produces a generator of values that satisfy `schema` under {@link admits}.
 *
 * @param schema The schema node to satisfy.
 * @returns {fc.Arbitrary<unknown>} A generator of conforming values.
 */
export function conformingValueArb(schema: JsonRecord): fc.Arbitrary<unknown> {
    const type = schema.type;
    if (Array.isArray(schema.enum) && schema.enum.length > 0) {
        return fc.constantFrom(...(schema.enum as unknown[]));
    }
    if (type === "boolean") {
        return fc.boolean();
    }
    if (type === "integer" || type === "number") {
        return numericConformingArb(schema, type === "integer");
    }
    if (type === "array") {
        const items = (schema.items as JsonRecord) || { type: "string" };
        const minLength = typeof schema.minItems === "number" ? schema.minItems : 0;
        const maxLength = Math.max(minLength, typeof schema.maxItems === "number" ? schema.maxItems : minLength + 2);
        const element = conformingValueArb(items);
        return schema.uniqueItems === true
            ? fc.uniqueArray(element, {
                  // Not `minLength`: the member domain may be smaller than the requested length
                  // (booleans, a one-member enum), and fast-check would retry indefinitely.
                  minLength: 0,
                  maxLength: Math.min(maxLength, 3),
                  selector: (v) => canonical(v)
              })
            : fc.array(element, { minLength, maxLength });
    }
    if (type === "object") {
        const properties = (schema.properties as Record<string, JsonRecord>) || {};
        const required = Array.isArray(schema.required) ? (schema.required as string[]) : [];
        const keys = Object.keys(properties);
        if (keys.length === 0) {
            return fc.constant({});
        }
        return fc
            .tuple(
                fc.tuple(...keys.map((k) => conformingValueArb(properties[k]))),
                fc.subarray(keys.filter((k) => !required.includes(k)))
            )
            .map(([values, presentOptional]) => {
                const out: JsonRecord = {};
                keys.forEach((key, index) => {
                    if (required.includes(key) || presentOptional.includes(key)) {
                        out[key] = values[index];
                    }
                });
                return out;
            });
    }
    // string
    if (typeof schema.pattern === "string") {
        return fc.stringMatching(new RegExp(schema.pattern));
    }
    const minLength = typeof schema.minLength === "number" ? schema.minLength : 0;
    const maxLength = Math.max(minLength, typeof schema.maxLength === "number" ? schema.maxLength : minLength + 6);
    return fc.string({ minLength, maxLength });
}

function numericConformingArb(schema: JsonRecord, integral: boolean): fc.Arbitrary<number> {
    let min = typeof schema.minimum === "number" ? schema.minimum : -100;
    let max = typeof schema.maximum === "number" ? schema.maximum : 100;
    if (typeof schema.exclusiveMinimum === "number") min = Math.max(min, schema.exclusiveMinimum + 1);
    if (typeof schema.exclusiveMaximum === "number") max = Math.min(max, schema.exclusiveMaximum - 1);
    if (schema.exclusiveMinimum === true) min += 1;
    if (schema.exclusiveMaximum === true) max -= 1;
    // An empty range means the leaf is unsatisfiable; honour the upper bound so the generated
    // value violates as little as possible. `primitiveSchemaArb` does not produce such leaves.
    if (max < min) min = max;
    const multipleOf = typeof schema.multipleOf === "number" && schema.multipleOf > 0 ? schema.multipleOf : undefined;
    if (multipleOf !== undefined) {
        const lo = Math.ceil(min / multipleOf);
        const hi = Math.floor(max / multipleOf);
        if (hi < lo) {
            return fc.constant(lo * multipleOf);
        }
        return fc.integer({ min: lo, max: hi }).map((k) => k * multipleOf);
    }
    if (integral) {
        return fc.integer({ min: Math.ceil(min), max: Math.max(Math.ceil(min), Math.floor(max)) });
    }
    return fc.integer({ min: Math.ceil(min * 2), max: Math.max(Math.ceil(min * 2), Math.floor(max * 2)) }).map(
        (k) => k / 2
    );
}

/**
 * Independent reference evaluator for the JSON Schema keyword subset the generators emit.
 * Hand-written on purpose: the merge and inference properties compare MetaUI against *this*,
 * so a shared helper would make them tautological.
 *
 * @param schema The schema node.
 * @param value The value to test.
 * @returns {boolean} True when the value satisfies every keyword present on the node.
 */
export function admits(schema: JsonRecord, value: unknown): boolean {
    if (!admitsType(schema.type, value)) return false;
    if (Array.isArray(schema.enum) && !schema.enum.some((e) => canonical(e) === canonical(value))) return false;
    if ("const" in schema && canonical(schema.const) !== canonical(value)) return false;

    if (typeof value === "string") {
        if (typeof schema.minLength === "number" && value.length < schema.minLength) return false;
        if (typeof schema.maxLength === "number" && value.length > schema.maxLength) return false;
        if (typeof schema.pattern === "string" && !new RegExp(schema.pattern).test(value)) return false;
    }
    if (typeof value === "number") {
        if (typeof schema.minimum === "number") {
            if (schema.exclusiveMinimum === true ? value <= schema.minimum : value < schema.minimum) return false;
        }
        if (typeof schema.maximum === "number") {
            if (schema.exclusiveMaximum === true ? value >= schema.maximum : value > schema.maximum) return false;
        }
        if (typeof schema.exclusiveMinimum === "number" && value <= schema.exclusiveMinimum) return false;
        if (typeof schema.exclusiveMaximum === "number" && value >= schema.exclusiveMaximum) return false;
        if (typeof schema.multipleOf === "number" && schema.multipleOf > 0) {
            const quotient = value / schema.multipleOf;
            if (Math.abs(quotient - Math.round(quotient)) > 1e-9) return false;
        }
    }
    if (Array.isArray(value)) {
        if (typeof schema.minItems === "number" && value.length < schema.minItems) return false;
        if (typeof schema.maxItems === "number" && value.length > schema.maxItems) return false;
        if (schema.uniqueItems === true) {
            const seen = new Set(value.map((entry) => canonical(entry)));
            if (seen.size !== value.length) return false;
        }
        const items = schema.items;
        if (items && typeof items === "object" && !Array.isArray(items)) {
            if (!value.every((entry) => admits(items as JsonRecord, entry))) return false;
        }
    }
    if (isPlainObject(value)) {
        const keys = Object.keys(value);
        if (typeof schema.minProperties === "number" && keys.length < schema.minProperties) return false;
        if (typeof schema.maxProperties === "number" && keys.length > schema.maxProperties) return false;
        if (Array.isArray(schema.required) && !schema.required.every((k) => typeof k === "string" && k in value)) {
            return false;
        }
        const properties = schema.properties;
        if (isPlainObject(properties)) {
            for (const [key, sub] of Object.entries(properties)) {
                if (key in value && isPlainObject(sub) && !admits(sub as JsonRecord, value[key])) return false;
            }
        }
    }
    return true;
}

function admitsType(type: unknown, value: unknown): boolean {
    if (type === undefined) return true;
    if (Array.isArray(type)) return type.some((t) => admitsType(t, value));
    switch (type) {
        case "string":
            return typeof value === "string";
        case "number":
            return typeof value === "number" && Number.isFinite(value);
        case "integer":
            return typeof value === "number" && Number.isInteger(value);
        case "boolean":
            return typeof value === "boolean";
        case "array":
            return Array.isArray(value);
        case "object":
            return isPlainObject(value);
        case "null":
            return value === null;
        default:
            return true;
    }
}

/** True for a non-null, non-array, non-Date object. */
export function isPlainObject(value: unknown): value is JsonRecord {
    return typeof value === "object" && value !== null && !Array.isArray(value) && !(value instanceof Date);
}

/**
 * Key-order-independent JSON serialization, used for structural equality in generators and
 * assertions. `undefined` object members are dropped so an explicit `{ a: undefined }` and an
 * absent `a` compare equal — `SchemaNormalizer` emits every keyword as an own property.
 *
 * @param value The value to serialize.
 * @returns {string} A canonical string signature.
 */
export function canonical(value: unknown): string {
    if (value === undefined) return "undefined";
    if (value === null) return "null";
    if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
    if (value instanceof Date) return `Date(${value.getTime()})`;
    if (typeof value === "object") {
        const record = value as JsonRecord;
        const keys = Object.keys(record)
            .filter((k) => record[k] !== undefined)
            .sort();
        return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(record[k])}`).join(",")}}`;
    }
    return JSON.stringify(value) ?? String(value);
}

/**
 * Recursively removes `undefined`-valued keys so two descriptors that differ only in whether a
 * keyword is absent or explicitly `undefined` compare equal under `deepStrictEqual`.
 *
 * @param value The value to prune.
 * @returns {unknown} A pruned deep copy.
 */
export function prune(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(prune);
    if (isPlainObject(value)) {
        const out: JsonRecord = {};
        for (const key of Object.keys(value).sort()) {
            if (value[key] !== undefined) out[key] = prune(value[key]);
        }
        return out;
    }
    return value;
}

/**
 * Freezes a value and everything reachable from it, so an accidental in-place write by the
 * engine throws instead of silently corrupting consumer-owned input.
 *
 * @param value The value to freeze.
 * @returns {T} The same reference, now deeply frozen.
 */
export function deepFreeze<T>(value: T): T {
    if (value && typeof value === "object" && !Object.isFrozen(value)) {
        Object.freeze(value);
        for (const key of Object.keys(value as JsonRecord)) {
            deepFreeze((value as JsonRecord)[key]);
        }
    }
    return value;
}

/**
 * Keywords compared when two code paths are asserted to produce the same effective constraints.
 * Presentational fields (`ui`, `title`, `valueHelp`) are excluded on purpose: the two paths are
 * allowed to differ in how they present a field, never in what it accepts.
 */
export const COMPARED_CONSTRAINTS: readonly string[] = [
    "type",
    "format",
    "maxLength",
    "minLength",
    "minimum",
    "maximum",
    "pattern",
    "multipleOf",
    "enum",
    "const",
    "default",
    "maxItems",
    "minItems",
    "uniqueItems",
    "maxProperties",
    "minProperties",
    "exclusiveMinimum",
    "exclusiveMaximum",
    "nullable",
    "readOnly",
    "writeOnly"
];

/**
 * Projects a normalized descriptor onto {@link COMPARED_CONSTRAINTS}, recursing into
 * `properties` and `items` so a whole subtree can be compared in one assertion.
 *
 * @param meta The normalized descriptor (`IPropertyMetadata` or `ISchema`).
 * @returns {JsonRecord} The constraint-only projection.
 */
export function constraintsOf(meta: unknown): JsonRecord {
    if (!isPlainObject(meta)) return {};
    const out: JsonRecord = {};
    for (const key of COMPARED_CONSTRAINTS) {
        if (meta[key] !== undefined) out[key] = meta[key];
    }
    if (meta.required === true) out.required = true;
    if (Array.isArray(meta.required)) out.required = [...meta.required].sort();
    if (isPlainObject(meta.properties)) {
        const properties: JsonRecord = {};
        for (const key of Object.keys(meta.properties).sort()) {
            properties[key] = constraintsOf((meta.properties as JsonRecord)[key]);
        }
        out.properties = properties;
    }
    if (meta.items !== undefined) out.items = constraintsOf(meta.items);
    if (typeof meta.additionalProperties === "boolean") out.additionalProperties = meta.additionalProperties;
    else if (meta.additionalProperties !== undefined) out.additionalProperties = constraintsOf(meta.additionalProperties);
    return out;
}

/** Builds a `properties` chain `depth` levels deep whose innermost leaf is `leaf`. */
export function nestSchema(depth: number, leaf: JsonRecord, key: string = "child"): JsonRecord {
    let node: JsonRecord = leaf;
    for (let i = 0; i < depth; i++) {
        node = { type: "object", properties: { [key]: node } };
    }
    return node;
}

/** Walks `depth` levels of `properties.<key>` into a normalized schema tree. */
export function descend(
    root: { properties?: Record<string, { properties?: Record<string, unknown> }> },
    depth: number,
    key: string = "child"
): unknown {
    let node: unknown = root;
    for (let i = 0; i < depth; i++) {
        const properties = (node as { properties?: Record<string, unknown> }).properties;
        if (!properties) return undefined;
        node = properties[key];
        if (node === undefined) return undefined;
    }
    return node;
}
