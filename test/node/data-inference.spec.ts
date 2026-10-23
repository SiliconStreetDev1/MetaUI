/**
 * @file data-inference.spec.ts
 * @description Properties of `DataInferenceBuilder` and of hybrid inference through
 * `SchemaNormalizer`.
 *
 * The audit's inference defect was a plain DAG — one object referenced from two siblings —
 * being mistaken for a cycle and silently degraded to `{ type: "string" }`. Identity-versus-
 * structure is therefore the first property here, and it is stated as an equality between two
 * payloads that differ only in sharing.
 */

import * as assert from "assert";
import { fc, reported, withLogCapture } from "./fc-config";
import {
    JsonRecord,
    canonical,
    conformingValueArb,
    deepFreeze,
    isPlainObject,
    prune,
    rootSchemaArb
} from "./arbitraries";
import { DataInferenceBuilder } from "../../src/nz/co/siliconst/ui5/metaui/core/DataInferenceBuilder";
import { SchemaNormalizer } from "../../src/nz/co/siliconst/ui5/metaui/core/SchemaNormalizer";
import { PayloadValidator } from "../../src/nz/co/siliconst/ui5/metaui/core/PayloadValidator";
import { IPropertyMetadata, ISchema } from "../../src/nz/co/siliconst/ui5/metaui/interfaces/ISchema";

/** Leaf values, including ISO date strings, which inference promotes to the `date` field type. */
const leafArb: fc.Arbitrary<unknown> = fc.oneof(
    fc.string({ maxLength: 6 }),
    fc.integer({ min: -1000, max: 1000 }),
    fc.boolean(),
    fc.constant(null),
    fc.constantFrom("2024-02-29", "1999-12-31", "2024-13-45", "2024-2-9")
);

const dataKeyArb: fc.Arbitrary<string> = fc.constantFrom("alpha", "beta", "gamma", "items", "type", "id");

/** Recursive JSON-like payload generator, bounded to `depth` nesting levels. */
function dataValueArb(depth: number): fc.Arbitrary<unknown> {
    if (depth <= 0) return leafArb;
    const child = dataValueArb(depth - 1);
    return fc.oneof(
        { weight: 5, arbitrary: leafArb },
        { weight: 2, arbitrary: fc.array(child, { maxLength: 3 }) },
        { weight: 3, arbitrary: fc.dictionary(dataKeyArb, child, { minKeys: 1, maxKeys: 3 }) }
    );
}

const objectPayloadArb: fc.Arbitrary<JsonRecord> = fc.dictionary(dataKeyArb, dataValueArb(2), {
    minKeys: 1,
    maxKeys: 4
});

function isIsoDate(value: string): boolean {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return false;
    const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
    if (month < 1 || month > 12 || day < 1 || day > 31) return false;
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return (
        parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day
    );
}

/** The field type MetaUI should infer for a value — a second, independent implementation. */
function expectedType(value: unknown): string {
    if (value === null || value === undefined) return "string";
    if (Array.isArray(value)) return "array";
    if (isPlainObject(value)) return "object";
    if (typeof value === "number") return "number";
    if (typeof value === "boolean") return "boolean";
    if (typeof value === "string") return isIsoDate(value) ? "date" : "string";
    return "string";
}

/** The field type inference should give to an array's `items`, mirroring the documented rules. */
function expectedItemsType(array: unknown[]): string {
    const firstNonNull = array.find((entry) => entry !== null && entry !== undefined);
    if (array.length === 0 || firstNonNull === undefined) return "string";
    if (isPlainObject(firstNonNull)) return "object";
    if (Array.isArray(firstNonNull)) return "string";
    return expectedType(firstNonNull);
}

/** Checks the inferred descriptor tree against {@link expectedType} for every reachable value. */
function assertTypesAgree(properties: Record<string, IPropertyMetadata>, data: JsonRecord, path: string): void {
    for (const [key, value] of Object.entries(data)) {
        const meta = properties[key];
        assert.ok(meta, `${path}/${key}: inference dropped the key`);
        assert.strictEqual(meta.type, expectedType(value), `${path}/${key}: wrong inferred type`);
        assert.strictEqual(
            meta.nullable === true,
            value === null || value === undefined,
            `${path}/${key}: nullable flag disagrees with the value`
        );
        if (Array.isArray(value)) {
            assert.strictEqual(meta.items?.type, expectedItemsType(value), `${path}/${key}: wrong items type`);
        } else if (isPlainObject(value)) {
            assertTypesAgree(meta.properties || {}, value, `${path}/${key}`);
        }
    }
}

describe("DataInferenceBuilder — structure, not identity", () => {
    it("a shared sub-object infers the same schema as two structurally equal copies", () => {
        fc.assert(
            fc.property(objectPayloadArb, (inner) => {
                const shared = { left: inner, right: inner };
                const copies = { left: inner, right: JSON.parse(JSON.stringify(inner)) as JsonRecord };
                assert.deepStrictEqual(
                    prune(DataInferenceBuilder.inferSchemaFromData(shared)),
                    prune(DataInferenceBuilder.inferSchemaFromData(copies)),
                    "a DAG was treated differently from a tree with the same shape"
                );
            })
        );
    });

    it("two sibling array rows that are the same object are both sampled", () => {
        fc.assert(
            fc.property(objectPayloadArb, (row) => {
                const shared = [row, row];
                const copies = [row, JSON.parse(JSON.stringify(row)) as JsonRecord];
                assert.deepStrictEqual(
                    prune(DataInferenceBuilder.inferSchemaFromData(shared)),
                    prune(DataInferenceBuilder.inferSchemaFromData(copies))
                );
            })
        );
    });

    it("inference is a pure function of its input", () => {
        fc.assert(
            fc.property(objectPayloadArb, (data) => {
                const before = canonical(data);
                deepFreeze(data);
                const first = prune(DataInferenceBuilder.inferSchemaFromData(data));
                const second = prune(DataInferenceBuilder.inferSchemaFromData(data));
                assert.strictEqual(canonical(data), before, "inference wrote into its input");
                assert.deepStrictEqual(second, first, "inference is not deterministic");
            })
        );
    });
});

describe("DataInferenceBuilder — inferred types describe the data", () => {
    it("every inferred field type matches the value it was inferred from", () => {
        fc.assert(
            fc.property(objectPayloadArb, (data) => {
                const schema = DataInferenceBuilder.inferSchemaFromData(data);
                assertTypesAgree(schema.properties || {}, data, "$");
            })
        );
    });

    it("row sampling yields the union of the keys present in the sampled rows", () => {
        fc.assert(
            fc.property(fc.array(objectPayloadArb, { minLength: 1, maxLength: 12 }), (rows) => {
                const inferred = DataInferenceBuilder.inferPropertiesFromRows(rows);
                const union = new Set<string>();
                for (const row of rows) {
                    for (const key of Object.keys(row)) union.add(key);
                }
                assert.deepStrictEqual(Object.keys(inferred).sort(), [...union].sort());
            })
        );
    });
});

describe("DataInferenceBuilder — cycles", () => {
    it("a genuine cycle terminates and still describes the acyclic part", () => {
        fc.assert(
            fc.property(objectPayloadArb, (data) => {
                const cyclic: JsonRecord = { ...data, child: {} };
                (cyclic.child as JsonRecord).back = cyclic;
                const schema = DataInferenceBuilder.inferSchemaFromData(cyclic);
                assert.ok(schema.properties, "a cyclic payload produced no properties at all");
                for (const key of Object.keys(data)) {
                    assert.ok(schema.properties?.[key], `the acyclic key '${key}' was lost`);
                }
                const back = schema.properties?.child?.properties?.back;
                assert.ok(back, "the back-edge property disappeared");
            }),
            { numRuns: 500 }
        );
    });

    it("a self-referencing array terminates", () => {
        const data: JsonRecord = { rows: [] as unknown[] };
        (data.rows as unknown[]).push(data);
        const schema = DataInferenceBuilder.inferSchemaFromData(data);
        assert.strictEqual(schema.properties?.rows.type, "array");
    });

    it("F6 (known defect): cycle truncation is silent, while depth truncation is logged", () => {
        // Depth truncation warns; a cycle degrades the field to `{ type: "string" }` with no
        // signal at all, so a consuming application cannot tell a cyclic payload from a string
        // field. Delete this test when the cycle branch starts logging — see finding F6.
        const cyclic: JsonRecord = { name: "root" };
        cyclic.self = cyclic;
        const { value, entries } = withLogCapture(() => DataInferenceBuilder.inferSchemaFromData(cyclic));
        assert.strictEqual(value.properties?.self.type, "string", "the cycle is no longer degraded to a string");
        assert.strictEqual(
            reported(entries, "cycle") || reported(entries, "circular") || reported(entries, "Circular"),
            false,
            "F6 appears fixed — the cycle is now reported"
        );
    });
});

/**
 * MetaUI treats `""` and `[]` as missing for a required field (`RequiredValidatorPlugin.isEmptyValue`),
 * which is stricter than JSON Schema's `required`, where the keyword only asserts presence. The
 * behaviour is documented in that plugin, so the property below asserts both halves of it rather
 * than discarding the cases — see divergence D2 in the report.
 */
function metaUiEmpty(value: unknown): boolean {
    return (
        value === null ||
        value === undefined ||
        (typeof value === "string" && value.trim() === "") ||
        (typeof value === "number" && Number.isNaN(value)) ||
        (Array.isArray(value) && value.length === 0)
    );
}

/** The first path at which a required key holds a MetaUI-empty value, if any. */
function emptyRequiredPath(schema: JsonRecord, value: unknown, path: string = "$"): string | undefined {
    if (Array.isArray(value) && isPlainObject(schema.items)) {
        for (let i = 0; i < value.length; i++) {
            const found = emptyRequiredPath(schema.items as JsonRecord, value[i], `${path}/${i}`);
            if (found) return found;
        }
        return undefined;
    }
    if (!isPlainObject(value)) return undefined;
    const required = Array.isArray(schema.required) ? (schema.required as string[]) : [];
    for (const key of required) {
        if (metaUiEmpty(value[key])) return `${path}/${key}`;
    }
    const properties = schema.properties;
    if (isPlainObject(properties)) {
        for (const [key, sub] of Object.entries(properties)) {
            if (key in value && isPlainObject(sub)) {
                const found = emptyRequiredPath(sub as JsonRecord, value[key], `${path}/${key}`);
                if (found) return found;
            }
        }
    }
    return undefined;
}

/**
 * Removes `format` keywords. MetaUI enforces semantic formats (`email`, `uri`, `iban`) with
 * dedicated validators, which a generic string generator cannot satisfy; that is a property of
 * those validators, tested in `pipeline.spec.ts`, not of schema ingestion.
 */
function stripFormats(schema: JsonRecord): JsonRecord {
    const out: JsonRecord = {};
    for (const [key, value] of Object.entries(schema)) {
        if (key === "format") continue;
        if (isPlainObject(value)) {
            out[key] = stripFormats(value);
        } else {
            out[key] = value;
        }
    }
    return out;
}

describe("hybrid inference — the merged schema still accepts the payload", () => {
    it("a payload that conforms to a schema still validates after inference is merged into it", () => {
        fc.assert(
            fc.property(
                rootSchemaArb(2)
                    .map(stripFormats)
                    .chain((root) => fc.tuple(fc.constant(root), conformingValueArb(root))),
                ([root, payload]) => {
                    const hybrid = { ...root, additionalProperties: true };
                    const schema: ISchema = SchemaNormalizer.normalize(hybrid, payload);
                    const rootMeta: IPropertyMetadata = {
                        type: "object",
                        properties: schema.properties,
                        required: schema.required
                    };
                    const result = PayloadValidator.validateTree(rootMeta, payload);
                    const emptyPath = emptyRequiredPath(root, payload);
                    if (emptyPath) {
                        assert.ok(
                            !result.isValid,
                            `MetaUI's stricter 'required' no longer rejects the empty value at ${emptyPath}`
                        );
                        return;
                    }
                    assert.ok(
                        result.isValid,
                        `hybrid inference invented a constraint the payload violates: ${result.errorMessage}\n` +
                            `  schema:  ${canonical(root)}\n  payload: ${canonical(payload)}`
                    );
                }
            )
        );
    });
});
