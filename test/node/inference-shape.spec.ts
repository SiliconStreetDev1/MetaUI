/**
 * @file inference-shape.spec.ts
 * @description What `DataInferenceBuilder` publishes for a given payload, stated absolutely.
 *
 * `data-inference.spec.ts` and `inference-merge.spec.ts` state relations — inference is pure, the
 * inferred type matches the value, two rows reconcile this way. Those hold just as well for an
 * implementation that got the surrounding structure wrong. This file states the structure itself:
 * the root descriptor for each payload shape, the per-field `ui` block the renderer relies on, the
 * documented sampling limit and the documented recursion limit.
 *
 * The documented constants (`DataInferenceBuilder.ts` header) are the reference:
 *  - up to 50 array rows are sampled when inferring a table;
 *  - nesting is traversed to 10 levels and then truncated, with a diagnostic (engineering rule 2);
 *  - a `null`/`undefined` value is inferred as a nullable string field so it stays editable.
 */

import * as assert from "assert";
import { withLogCapture, reported } from "./fc-config";
import { ISchema, IPropertyMetadata } from "../../src/nz/co/siliconst/ui5/metaui/interfaces/ISchema";
import { DataInferenceBuilder } from "../../src/nz/co/siliconst/ui5/metaui/core/DataInferenceBuilder";
import { MAX_SCHEMA_DEPTH } from "../../src/nz/co/siliconst/ui5/metaui/constants/MetaUIConstants";

/** The documented row-sampling limit. */
const INFERENCE_SAMPLE_LIMIT = 50;
/**
 * The single published nesting cap. Every walker in the engine shares it — the `[DEPTH_CONSTANT]`
 * gate in `scripts/run-tests.js` forbids a second one — so the tests read it rather than restating
 * a number that would then disagree with the gate.
 */
const MAX_INFERENCE_DEPTH = MAX_SCHEMA_DEPTH;

describe("DataInferenceBuilder — generateLabel", () => {
    it("splits camelCase and snake_case into Title Case words", () => {
        assert.strictEqual(DataInferenceBuilder.generateLabel("firstName"), "First Name");
        assert.strictEqual(DataInferenceBuilder.generateLabel("order_id"), "Order Id");
        assert.strictEqual(DataInferenceBuilder.generateLabel("customer_first_name"), "Customer First Name");
        assert.strictEqual(DataInferenceBuilder.generateLabel("totalAmountDue"), "Total Amount Due");
        assert.strictEqual(DataInferenceBuilder.generateLabel("id"), "Id");
        assert.strictEqual(DataInferenceBuilder.generateLabel("a"), "A");
    });

    it("lowercases the tail of a word it capitalises", () => {
        assert.strictEqual(DataInferenceBuilder.generateLabel("STATUS"), "S T A T U S");
        assert.strictEqual(DataInferenceBuilder.generateLabel("myURL"), "My U R L");
    });

    it("an empty name yields an empty label, and padding is trimmed", () => {
        assert.strictEqual(DataInferenceBuilder.generateLabel(""), "");
        assert.strictEqual(DataInferenceBuilder.generateLabel("_"), "");
        assert.strictEqual(DataInferenceBuilder.generateLabel("__a__b__"), "A B");
    });
});

describe("DataInferenceBuilder — the root descriptor per payload shape", () => {
    it("a plain object becomes a compact object schema with an empty title", () => {
        const schema: ISchema = DataInferenceBuilder.inferSchemaFromData({ a: 1 });
        assert.strictEqual(schema.type, "object");
        assert.strictEqual(schema.layoutStrategy, "compact");
        assert.strictEqual(schema.title, "");
        assert.deepStrictEqual(Object.keys(schema.properties || {}), ["a"]);
        assert.strictEqual(schema.items, undefined);
    });

    it("an array of objects becomes a table-laid-out array schema with no root properties", () => {
        const schema = DataInferenceBuilder.inferSchemaFromData([{ a: 1 }, { b: "x" }]);
        assert.strictEqual(schema.type, "array");
        assert.strictEqual(schema.layoutStrategy, "table");
        assert.strictEqual(schema.properties, undefined, "an array root must not also carry root properties");
        assert.strictEqual(schema.items?.type, "object");
        assert.deepStrictEqual(Object.keys(schema.items?.properties || {}).sort(), ["a", "b"]);
    });

    it("an array of primitives becomes an array of that primitive, laid out compactly", () => {
        for (const [sample, expected] of [[1, "number"], [true, "boolean"], ["x", "string"]] as const) {
            const schema = DataInferenceBuilder.inferSchemaFromData([sample, sample]);
            assert.strictEqual(schema.type, "array");
            assert.strictEqual(schema.layoutStrategy, "compact", "a list of scalars is not a table");
            assert.strictEqual(schema.items?.type, expected);
            assert.strictEqual(schema.items?.properties, undefined);
        }
    });

    it("an empty array, or one holding only nulls, falls back to a list of strings", () => {
        for (const payload of [[], [null], [null, undefined]]) {
            const schema = DataInferenceBuilder.inferSchemaFromData(payload);
            assert.strictEqual(schema.type, "array");
            assert.strictEqual(schema.items?.type, "string");
            assert.strictEqual(schema.layoutStrategy, "compact");
        }
    });

    it("the first non-null element decides the item type, not the first element", () => {
        assert.strictEqual(DataInferenceBuilder.inferSchemaFromData([null, 7]).items?.type, "number");
        assert.strictEqual(DataInferenceBuilder.inferSchemaFromData([null, { a: 1 }]).items?.type, "object");
    });

    it("an unstructured payload becomes an empty object schema rather than nothing", () => {
        for (const payload of [null, undefined, 7, "text", true]) {
            const schema = DataInferenceBuilder.inferSchemaFromData(payload);
            assert.strictEqual(schema.type, "object");
            assert.deepStrictEqual(schema.properties, {});
            assert.strictEqual(schema.layoutStrategy, "compact");
        }
    });

    it("the ISchemaBuilderPlugin contract claims structured payloads only, and delegates", () => {
        const builder = new DataInferenceBuilder();
        assert.strictEqual(builder.canHandle({ a: 1 }), true);
        assert.strictEqual(builder.canHandle([1]), true);
        assert.strictEqual(builder.canHandle("text"), false);
        assert.strictEqual(builder.canHandle(null), false);
        assert.strictEqual(builder.canHandle(7), false);
        assert.deepStrictEqual(builder.build({ a: 1 }), DataInferenceBuilder.inferSchemaFromData({ a: 1 }));
    });
});

describe("DataInferenceBuilder — the per-field descriptor", () => {
    /** Infers one field from a single-key payload. */
    const field = (value: unknown): IPropertyMetadata => {
        const properties = DataInferenceBuilder.inferPropertiesFromObject({ sampleKey: value });
        assert.ok(properties.sampleKey, "the key was not inferred at all");
        return properties.sampleKey;
    };

    it("every inferred field carries a generated label and is editable and not a key", () => {
        const meta = field("x");
        assert.strictEqual(meta.ui?.label, "Sample Key");
        assert.strictEqual(meta.ui?.isKey, false);
        assert.strictEqual(meta.ui?.readOnly, false);
    });

    it("a scalar is typed from its JavaScript type and is not nullable", () => {
        assert.strictEqual(field("x").type, "string");
        assert.strictEqual(field(7).type, "number");
        assert.strictEqual(field(0).type, "number");
        assert.strictEqual(field(true).type, "boolean");
        assert.strictEqual(field(false).type, "boolean");
        assert.strictEqual(field(new Date()).type, "date");
        assert.strictEqual(field("2024-02-29").type, "date");
        assert.strictEqual(field("x").nullable, undefined);
        assert.strictEqual(field(0).nullable, undefined);
        assert.strictEqual(field(false).nullable, undefined);
    });

    it("null and undefined become nullable string fields, so the value stays editable", () => {
        for (const value of [null, undefined]) {
            const meta = field(value);
            assert.strictEqual(meta.type, "string");
            assert.strictEqual(meta.nullable, true);
            assert.strictEqual(meta.items, undefined);
            assert.strictEqual(meta.properties, undefined);
        }
    });

    it("an array of scalars gets the multiInput widget; an array of objects does not", () => {
        assert.strictEqual(field([1, 2]).ui?.widget, "multiInput");
        assert.strictEqual(field(["a"]).ui?.widget, "multiInput");
        assert.strictEqual(field([]).ui?.widget, "multiInput");
        assert.strictEqual(field([{ a: 1 }]).ui?.widget, undefined, "a table is not a token input");
    });

    it("a scalar or object field gets no widget at all", () => {
        assert.strictEqual(field("x").ui?.widget, undefined);
        assert.strictEqual(field(7).ui?.widget, undefined);
        assert.strictEqual(field({ a: 1 }).ui?.widget, undefined);
    });

    it("a nested object is typed object and its children are inferred", () => {
        const meta = field({ inner: 1 });
        assert.strictEqual(meta.type, "object");
        assert.strictEqual(meta.properties?.inner.type, "number");
        assert.strictEqual(meta.items, undefined);
    });

    it("a nested array of objects is typed array with an object item descriptor", () => {
        const meta = field([{ inner: 1 }]);
        assert.strictEqual(meta.type, "array");
        assert.strictEqual(meta.items?.type, "object");
        assert.strictEqual(meta.items?.properties?.inner.type, "number");
    });

    it("an empty nested array, or one of only nulls, is a list of strings", () => {
        assert.strictEqual(field([]).items?.type, "string");
        assert.strictEqual(field([null]).items?.type, "string");
    });

    it("a key present with an undefined value is still published", () => {
        const properties = DataInferenceBuilder.inferPropertiesFromObject({ present: undefined });
        assert.deepStrictEqual(Object.keys(properties), ["present"]);
    });
});

describe("DataInferenceBuilder — row sampling", () => {
    it("the union of keys across sampled rows is inferred", () => {
        const columns = DataInferenceBuilder.inferPropertiesFromRows([{ a: 1 }, { b: 2 }, { c: 3 }]);
        assert.deepStrictEqual(Object.keys(columns).sort(), ["a", "b", "c"]);
    });

    it("rows that are not objects contribute nothing but do not stop the walk", () => {
        const columns = DataInferenceBuilder.inferPropertiesFromRows([null, 7, "x", { a: 1 }, [2]]);
        assert.deepStrictEqual(Object.keys(columns), ["a"]);
    });

    it("no rows at all yields no columns", () => {
        assert.deepStrictEqual(DataInferenceBuilder.inferPropertiesFromRows([]), {});
    });

    it("at most the documented number of rows is sampled", () => {
        const rows: Record<string, number>[] = [];
        for (let i = 0; i < INFERENCE_SAMPLE_LIMIT + 10; i++) {
            rows.push({ [`k${i}`]: i });
        }
        const columns = DataInferenceBuilder.inferPropertiesFromRows(rows);
        assert.strictEqual(Object.keys(columns).length, INFERENCE_SAMPLE_LIMIT);
        assert.ok(columns[`k${INFERENCE_SAMPLE_LIMIT - 1}`], "the last sampled row was not read");
        assert.strictEqual(columns[`k${INFERENCE_SAMPLE_LIMIT}`], undefined, "a row past the limit was sampled");
    });

    it("a shorter array is sampled in full", () => {
        const rows = [{ a: 1 }, { b: 2 }];
        assert.deepStrictEqual(Object.keys(DataInferenceBuilder.inferPropertiesFromRows(rows)).sort(), ["a", "b"]);
    });
});

describe("DataInferenceBuilder — the recursion limit", () => {
    /** A chain of `depth` nested objects around a leaf `{ leaf: 1 }`. */
    const nest = (depth: number): Record<string, unknown> => {
        let node: Record<string, unknown> = { leaf: 1 };
        for (let i = 0; i < depth; i++) {
            node = { child: node };
        }
        return node;
    };

    /** Walks `depth` levels of `properties.child`. */
    const descend = (
        properties: Record<string, IPropertyMetadata>,
        depth: number
    ): Record<string, IPropertyMetadata> | undefined => {
        let current: Record<string, IPropertyMetadata> | undefined = properties;
        for (let i = 0; i < depth; i++) {
            current = current?.child?.properties;
        }
        return current;
    };

    it("a chain within the limit is inferred in full", () => {
        const properties = DataInferenceBuilder.inferPropertiesFromObject(nest(MAX_INFERENCE_DEPTH - 2));
        assert.strictEqual(descend(properties, MAX_INFERENCE_DEPTH - 2)?.leaf.type, "number");
    });

    it("a chain past the limit is truncated and the truncation is reported", () => {
        const { value: properties, entries } = withLogCapture(() =>
            DataInferenceBuilder.inferPropertiesFromObject(nest(MAX_INFERENCE_DEPTH + 3))
        );
        assert.strictEqual(descend(properties, MAX_INFERENCE_DEPTH + 3), undefined, "nothing was truncated");
        assert.ok(reported(entries, String(MAX_INFERENCE_DEPTH)), "the truncation did not name the limit");
    });

    it("an array nested past the limit degrades to a list of strings and is reported", () => {
        let node: Record<string, unknown> = { leaf: [1, 2] };
        for (let i = 0; i < MAX_INFERENCE_DEPTH + 1; i++) {
            node = { child: node };
        }
        const { entries } = withLogCapture(() => DataInferenceBuilder.inferPropertiesFromObject(node));
        assert.ok(reported(entries, String(MAX_INFERENCE_DEPTH)), "the array truncation was not reported");
    });

    it("entering above the limit yields nothing at all, and says so", () => {
        const fromObject = withLogCapture(() =>
            DataInferenceBuilder.inferPropertiesFromObject({ a: 1 }, MAX_INFERENCE_DEPTH)
        );
        assert.deepStrictEqual(fromObject.value, {});
        assert.ok(reported(fromObject.entries, String(MAX_INFERENCE_DEPTH)));

        const fromRows = withLogCapture(() =>
            DataInferenceBuilder.inferPropertiesFromRows([{ a: 1 }], MAX_INFERENCE_DEPTH)
        );
        assert.deepStrictEqual(fromRows.value, {});
        assert.ok(reported(fromRows.entries, String(MAX_INFERENCE_DEPTH)));
    });

    it("entering one level below the limit still infers", () => {
        assert.ok(DataInferenceBuilder.inferPropertiesFromObject({ a: 1 }, MAX_INFERENCE_DEPTH - 1).a);
        assert.ok(DataInferenceBuilder.inferPropertiesFromRows([{ a: 1 }], MAX_INFERENCE_DEPTH - 1).a);
    });
});

describe("DataInferenceBuilder — mergeHybridProperties", () => {
    it("an explicit declaration overrides the inferred one key by key", () => {
        const merged = DataInferenceBuilder.mergeHybridProperties(
            { a: { type: "string", ui: { label: "A", isKey: false, readOnly: false } } },
            { a: { type: "integer", minimum: 1 } }
        );
        const a = merged.a as Record<string, unknown>;
        assert.strictEqual(a.type, "integer");
        assert.strictEqual(a.minimum, 1);
    });

    it("an inferred key the schema never declared is kept", () => {
        const merged = DataInferenceBuilder.mergeHybridProperties({ extra: { type: "number" } }, { a: { type: "string" } });
        assert.deepStrictEqual(Object.keys(merged).sort(), ["a", "extra"]);
    });

    it("an explicit title suppresses the inferred label, so the schema's wording wins", () => {
        const merged = DataInferenceBuilder.mergeHybridProperties(
            { a: { type: "string", ui: { label: "Generated", isKey: false, readOnly: false } } },
            { a: { type: "string", title: "Declared" } }
        );
        const ui = (merged.a as Record<string, unknown>).ui as Record<string, unknown>;
        assert.strictEqual(ui.label, undefined, "the inferred label would have overwritten the declared title");
    });

    it("an explicit ui.label keeps the inferred label out of the way without deleting it", () => {
        const merged = DataInferenceBuilder.mergeHybridProperties(
            { a: { type: "string", ui: { label: "Generated", isKey: false, readOnly: false } } },
            { a: { type: "string", title: "Declared", ui: { label: "Explicit" } } }
        );
        const ui = (merged.a as Record<string, unknown>).ui as Record<string, unknown>;
        assert.strictEqual(ui.label, "Explicit");
    });

    it("an explicit readOnly suppresses the inferred readOnly: false", () => {
        const merged = DataInferenceBuilder.mergeHybridProperties(
            { a: { type: "string", ui: { label: "A", isKey: false, readOnly: false } } },
            { a: { type: "string", readOnly: true } }
        );
        const ui = (merged.a as Record<string, unknown>).ui as Record<string, unknown>;
        assert.strictEqual(ui.readOnly, undefined, "an inferred readOnly: false would unlock a read-only field");
    });

    it("an explicit type that contradicts the inferred one suppresses the inferred widget", () => {
        const merged = DataInferenceBuilder.mergeHybridProperties(
            { a: { type: "array", ui: { label: "A", isKey: false, readOnly: false, widget: "multiInput" } } },
            { a: { type: "string" } }
        );
        const ui = (merged.a as Record<string, unknown>).ui as Record<string, unknown>;
        assert.strictEqual(ui.widget, undefined, "a multiInput widget on a declared string field is wrong");
    });

    it("a matching explicit type keeps the inferred widget", () => {
        const merged = DataInferenceBuilder.mergeHybridProperties(
            { a: { type: "array", ui: { label: "A", isKey: false, readOnly: false, widget: "multiInput" } } },
            { a: { type: "array" } }
        );
        const ui = (merged.a as Record<string, unknown>).ui as Record<string, unknown>;
        assert.strictEqual(ui.widget, "multiInput");
    });

    it("an explicit ui.widget always wins", () => {
        const merged = DataInferenceBuilder.mergeHybridProperties(
            { a: { type: "array", ui: { label: "A", isKey: false, readOnly: false, widget: "multiInput" } } },
            { a: { type: "string", ui: { widget: "textArea" } } }
        );
        const ui = (merged.a as Record<string, unknown>).ui as Record<string, unknown>;
        assert.strictEqual(ui.widget, "textArea");
    });

    it("a closed nested object drops inferred child keys it never declared", () => {
        const merged = DataInferenceBuilder.mergeHybridProperties(
            { a: { type: "object", properties: { declared: { type: "string" }, extra: { type: "number" } } } },
            { a: { type: "object", additionalProperties: false, properties: { declared: { type: "string" } } } }
        );
        const properties = (merged.a as Record<string, unknown>).properties as Record<string, unknown>;
        assert.deepStrictEqual(Object.keys(properties), ["declared"]);
    });

    it("an open nested object keeps the inferred child keys", () => {
        const merged = DataInferenceBuilder.mergeHybridProperties(
            { a: { type: "object", properties: { declared: { type: "string" }, extra: { type: "number" } } } },
            { a: { type: "object", properties: { declared: { type: "string" } } } }
        );
        const properties = (merged.a as Record<string, unknown>).properties as Record<string, unknown>;
        assert.deepStrictEqual(Object.keys(properties).sort(), ["declared", "extra"]);
    });

    it("nested declarations are merged recursively rather than replaced wholesale", () => {
        const merged = DataInferenceBuilder.mergeHybridProperties(
            { a: { type: "object", properties: { child: { type: "string", ui: { label: "Child" } } } } },
            { a: { type: "object", properties: { child: { type: "string", maxLength: 4 } } } }
        );
        const properties = (merged.a as Record<string, unknown>).properties as Record<string, unknown>;
        const child = properties.child as Record<string, unknown>;
        assert.strictEqual(child.maxLength, 4);
        assert.strictEqual((child.ui as Record<string, unknown>).label, "Child");
    });

    it("an inferred entry that is not a record is passed through untouched", () => {
        const merged = DataInferenceBuilder.mergeHybridProperties({ a: "not a schema" }, {});
        assert.strictEqual(merged.a, "not a schema");
    });

    it("merging is pure: neither input dictionary is modified", () => {
        const inferred = { a: { type: "string", ui: { label: "A", isKey: false, readOnly: false } } };
        const explicit = { a: { type: "integer", title: "Declared" } };
        const inferredBefore = JSON.stringify(inferred);
        const explicitBefore = JSON.stringify(explicit);
        DataInferenceBuilder.mergeHybridProperties(inferred, explicit);
        assert.strictEqual(JSON.stringify(inferred), inferredBefore);
        assert.strictEqual(JSON.stringify(explicit), explicitBefore);
    });
});
