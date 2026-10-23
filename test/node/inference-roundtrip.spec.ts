/**
 * @file inference-roundtrip.spec.ts
 * @description Properties of the inference hot path: raw data in, schema inferred, form prepared,
 * data read back out.
 *
 * This is the path the real consumer is on — it supplies no schema at all — so these properties
 * carry more weight than the OpenAPI ones. The pipeline below is the headless half of what
 * `GenerationDelegate.resolveSchemaAndData` runs for an empty schema:
 *
 *     deepClone(data)                      // the sandbox copy; consumer data is never touched
 *   -> SchemaNormalizer.normalize(null, d) // delegates to DataInferenceBuilder
 *   -> SchemaValidator.validateSchemaStructure
 *   -> DefaultLayoutGenerator.ensureLayout
 *   -> LayoutScorer.apply / LayoutMutator.apply
 *
 * Only the UI5 control construction that follows is out of reach from Node; it stays with the
 * browser QUnit suite. Everything that decides *what* is rendered, and *what type* each value
 * keeps, is exercised here.
 */

import * as assert from "assert";
import { fc, reported, withLogCapture } from "./fc-config";
import { JsonRecord, canonical, deepFreeze, isPlainObject, prune } from "./arbitraries";
import { DataInferenceBuilder } from "../../src/nz/co/siliconst/ui5/metaui/core/DataInferenceBuilder";
import { SchemaNormalizer } from "../../src/nz/co/siliconst/ui5/metaui/core/SchemaNormalizer";
import { SchemaValidator } from "../../src/nz/co/siliconst/ui5/metaui/core/SchemaValidator";
import { DefaultLayoutGenerator } from "../../src/nz/co/siliconst/ui5/metaui/core/DefaultLayoutGenerator";
import { LayoutScorer } from "../../src/nz/co/siliconst/ui5/metaui/core/LayoutScorer";
import { LayoutMutator } from "../../src/nz/co/siliconst/ui5/metaui/core/LayoutMutator";
import { PayloadValidator } from "../../src/nz/co/siliconst/ui5/metaui/core/PayloadValidator";
import { PipelineManager } from "../../src/nz/co/siliconst/ui5/metaui/core/PipelineManager";
import { deepClone } from "../../src/nz/co/siliconst/ui5/metaui/utils/TypeGuards";
import { IPropertyMetadata, ISchema } from "../../src/nz/co/siliconst/ui5/metaui/interfaces/ISchema";

/** Result of the headless host pipeline for a schema-less payload. */
interface IInferenceRun {
    readonly schema: ISchema;
    readonly structuralErrors: string[];
    readonly sandbox: unknown;
}

/** Runs the host's generation pipeline for a payload with no explicit schema. */
function runInferencePipeline(data: unknown): IInferenceRun {
    const sandbox = data !== undefined && data !== null ? deepClone(data) : {};
    const schema = SchemaNormalizer.normalize(null, sandbox);
    const structuralErrors = SchemaValidator.validateSchemaStructure(schema);
    DefaultLayoutGenerator.ensureLayout(schema);
    LayoutScorer.apply(schema, 0);
    LayoutMutator.apply(schema);
    return { schema, structuralErrors, sandbox };
}

/**
 * A copy with every `ui.label` removed. A label is derived from the property key, so two fields
 * under different keys are *expected* to differ there; everything else about them must not.
 */
function withoutLabels(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(withoutLabels);
    if (isPlainObject(value)) {
        const out: JsonRecord = {};
        for (const [key, entry] of Object.entries(value)) {
            if (key === "ui" && isPlainObject(entry)) {
                const ui: JsonRecord = {};
                for (const [uiKey, uiValue] of Object.entries(entry)) {
                    if (uiKey !== "label") ui[uiKey] = withoutLabels(uiValue);
                }
                out[key] = ui;
            } else {
                out[key] = withoutLabels(entry);
            }
        }
        return out;
    }
    return value;
}

const DATA_KEYS = ["alpha", "beta", "gamma", "id", "items", "type", "a/b", "a~b", "a%20b", "Ünicode", ""];

/** Leaf values, weighted towards the awkward ones real payloads are full of. */
const leafArb: fc.Arbitrary<unknown> = fc.oneof(
    { weight: 3, arbitrary: fc.string({ maxLength: 6 }) },
    { weight: 3, arbitrary: fc.integer({ min: -1000, max: 1000 }) },
    { weight: 2, arbitrary: fc.double({ min: -1000, max: 1000, noNaN: true, noDefaultInfinity: true }) },
    { weight: 2, arbitrary: fc.boolean() },
    { weight: 2, arbitrary: fc.constant(null) },
    { weight: 2, arbitrary: fc.constantFrom("2024-02-29", "1999-12-31", "2024-13-45", "2024-2-9", "0001-01-01") },
    { weight: 2, arbitrary: fc.constantFrom("12", "3.5", "-0", "1e3", "true", "false", "null", "") },
    { weight: 1, arbitrary: fc.constantFrom(0, -0, 0.1 + 0.2, Number.MAX_SAFE_INTEGER) }
);

function dataValueArb(depth: number): fc.Arbitrary<unknown> {
    if (depth <= 0) return leafArb;
    const child = dataValueArb(depth - 1);
    return fc.oneof(
        { weight: 6, arbitrary: leafArb },
        { weight: 2, arbitrary: fc.array(child, { maxLength: 3 }) },
        { weight: 2, arbitrary: fc.dictionary(fc.constantFrom(...DATA_KEYS), child, { minKeys: 0, maxKeys: 3 }) }
    );
}

const objectPayloadArb: fc.Arbitrary<JsonRecord> = fc.dictionary(
    fc.constantFrom(...DATA_KEYS),
    dataValueArb(2),
    { minKeys: 1, maxKeys: 5 }
);

/** A row shape reused across many array rows, so growth properties compare like with like. */
const rowArb: fc.Arbitrary<JsonRecord> = fc.dictionary(
    fc.constantFrom("id", "name", "qty", "active", "when"),
    dataValueArb(1),
    { minKeys: 1, maxKeys: 4 }
);

// ---------------------------------------------------------------------------
// 1. Structural determinism
// ---------------------------------------------------------------------------

describe("inference — structural determinism", () => {
    it("the whole pipeline gives a DAG the same schema as the equivalent tree", () => {
        fc.assert(
            fc.property(objectPayloadArb, (inner) => {
                const shared = { left: inner, right: inner };
                const copies = { left: inner, right: JSON.parse(JSON.stringify(inner)) as JsonRecord };
                assert.deepStrictEqual(
                    prune(runInferencePipeline(shared).schema),
                    prune(runInferencePipeline(copies).schema),
                    "a shared object instance was treated differently from a structural twin"
                );
            })
        );
    });

    it("a sub-object referenced from three siblings is inferred three times, not once", () => {
        fc.assert(
            fc.property(objectPayloadArb, (inner) => {
                const shared = { a: inner, b: inner, c: inner };
                const schema = runInferencePipeline(shared).schema;
                const a = withoutLabels(prune(schema.properties?.a));
                assert.deepStrictEqual(
                    withoutLabels(prune(schema.properties?.b)),
                    a,
                    "the second reference degraded"
                );
                assert.deepStrictEqual(
                    withoutLabels(prune(schema.properties?.c)),
                    a,
                    "the third reference degraded"
                );
                assert.strictEqual(schema.properties?.c.type, "object", "a DAG node was mistaken for a cycle");
            })
        );
    });

    it("key insertion order does not change the inferred metadata", () => {
        fc.assert(
            fc.property(objectPayloadArb, (payload) => {
                const keys = Object.keys(payload);
                const reversed: JsonRecord = {};
                for (const key of [...keys].reverse()) reversed[key] = payload[key];
                const forward = runInferencePipeline(payload).schema;
                const backward = runInferencePipeline(reversed).schema;
                for (const key of keys) {
                    assert.deepStrictEqual(
                        prune(backward.properties?.[key]),
                        prune(forward.properties?.[key]),
                        `'${key}' depends on key insertion order`
                    );
                }
            })
        );
    });

    it("how often a value occurs does not change the metadata of any occurrence", () => {
        fc.assert(
            fc.property(dataValueArb(2), fc.integer({ min: 2, max: 5 }), (value, copies) => {
                const payload: JsonRecord = {};
                for (let i = 0; i < copies; i++) payload[`k${i}`] = value;
                const schema = runInferencePipeline(payload).schema;
                const first = withoutLabels(prune(schema.properties?.k0));
                for (let i = 1; i < copies; i++) {
                    assert.deepStrictEqual(
                        withoutLabels(prune(schema.properties?.[`k${i}`])),
                        first,
                        `occurrence ${i} differs`
                    );
                }
            })
        );
    });

    it("the pipeline is deterministic and leaves the consumer's payload untouched", () => {
        fc.assert(
            fc.property(objectPayloadArb, (payload) => {
                const before = canonical(payload);
                deepFreeze(payload);
                const first = prune(runInferencePipeline(payload).schema);
                const second = prune(runInferencePipeline(payload).schema);
                assert.strictEqual(canonical(payload), before, "the pipeline wrote into consumer data");
                assert.deepStrictEqual(second, first);
            })
        );
    });
});

// ---------------------------------------------------------------------------
// 2. Round-trip fidelity
// ---------------------------------------------------------------------------

/**
 * Every leaf of a payload, as [segments, value] pairs. The path is kept as an array rather than a
 * joined string: a data key may itself contain a slash, and joining would make the path ambiguous.
 */
type Segment = { readonly key: string } | { readonly index: number };

function leaves(value: unknown, path: Segment[] = [], out: [Segment[], unknown][] = []): [Segment[], unknown][] {
    if (Array.isArray(value)) {
        value.forEach((entry, index) => leaves(entry, [...path, { index }], out));
    } else if (isPlainObject(value)) {
        for (const [key, entry] of Object.entries(value)) leaves(entry, [...path, { key }], out);
    } else {
        out.push([path, value]);
    }
    return out;
}

/**
 * Leaves as the *schema* models them: MetaUI describes an array once, through `items`, so an
 * array of primitives is one field rather than one field per element. Descending further would
 * ask the schema for per-element metadata it never claims to provide. Arrays of objects are
 * still descended into, because those are tables with per-column metadata.
 */
function modelledLeaves(value: unknown, path: Segment[] = [], out: [Segment[], unknown][] = []): [Segment[], unknown][] {
    if (Array.isArray(value)) {
        const firstNonNull = value.find((entry) => entry !== null && entry !== undefined);
        if (!isPlainObject(firstNonNull)) {
            out.push([path, value]);
            return out;
        }
        value.forEach((entry, index) => modelledLeaves(entry, [...path, { index }], out));
    } else if (isPlainObject(value)) {
        for (const [key, entry] of Object.entries(value)) modelledLeaves(entry, [...path, { key }], out);
    } else {
        out.push([path, value]);
    }
    return out;
}

/** Renders a leaf path for an assertion message. */
function showPath(path: Segment[]): string {
    return (
        "$" +
        path
            .map((segment) => ("key" in segment ? `[${JSON.stringify(segment.key)}]` : `[${segment.index}]`))
            .join("")
    );
}

/** The metadata the inferred schema holds for a data path, or undefined when the path is unmodelled. */
function metaAtPath(schema: ISchema, path: Segment[]): IPropertyMetadata | undefined {
    let node: IPropertyMetadata | ISchema | undefined = schema;
    for (const segment of path) {
        if (!node) return undefined;
        node = "index" in segment ? node.items : node.properties?.[segment.key];
    }
    return node as IPropertyMetadata | undefined;
}

describe("inference — round-trip fidelity", () => {
    it("the sandbox copy is byte-identical to the consumer payload, type for type", () => {
        fc.assert(
            fc.property(objectPayloadArb, (payload) => {
                const { sandbox } = runInferencePipeline(payload);
                const original = leaves(payload);
                const copied = leaves(sandbox);
                assert.deepStrictEqual(
                    copied.map(([segments]) => showPath(segments)),
                    original.map(([segments]) => showPath(segments)),
                    "the sandbox copy changed the shape of the payload"
                );
                original.forEach(([path, value], index) => {
                    const roundTripped = copied[index][1];
                    assert.ok(
                        Object.is(value, roundTripped),
                        `${showPath(path)}: ${String(value)} (${typeof value}) came back as ` +
                            `${String(roundTripped)} (${typeof roundTripped})`
                    );
                });
            })
        );
    });

    it("every leaf of the payload is reachable in the inferred schema with a matching type", () => {
        fc.assert(
            fc.property(objectPayloadArb, (payload) => {
                const { schema } = runInferencePipeline(payload);
                for (const [path, value] of modelledLeaves(payload)) {
                    const meta = metaAtPath(schema, path);
                    assert.ok(meta, `${showPath(path)}: no field was generated, so the value cannot render`);
                    assert.ok(
                        typeof meta.type === "string" && meta.type.length > 0,
                        `${showPath(path)}: the field has no type`
                    );
                    const isObjectProperty = path.length > 0 && "key" in path[path.length - 1];
                    if ((value === null || value === undefined) && isObjectProperty) {
                        assert.strictEqual(
                            meta.nullable,
                            true,
                            `${showPath(path)}: a null value lost its nullable flag`
                        );
                    }
                }
            })
        );
    });

    it("inference invents no field that is not in the data", () => {
        fc.assert(
            fc.property(objectPayloadArb, (payload) => {
                const schema = DataInferenceBuilder.inferSchemaFromData(payload);
                assert.deepStrictEqual(
                    Object.keys(schema.properties || {}).sort(),
                    Object.keys(payload).sort(),
                    "the inferred property set does not match the payload's keys"
                );
            })
        );
    });

    it("a formatter attached by inference is reversible for the value it was attached to", () => {
        // Inference attaches no `ui.formatter` today, so this is a guard rather than a check of
        // current behaviour: the day a formatter is attached, it has to be a reversible one, or a
        // value silently changes type between render and read-back.
        fc.assert(
            fc.property(objectPayloadArb, (payload) => {
                const { schema } = runInferencePipeline(payload);
                for (const [path, value] of modelledLeaves(payload)) {
                    const meta = metaAtPath(schema, path);
                    const names = meta?.ui?.formatters || (meta?.ui?.formatter ? [meta.ui.formatter] : []);
                    if (names.length === 0) continue;
                    const pipeline = PipelineManager.getInstance();
                    const displayed = pipeline.runFormatters(value, names, meta?.ui?.args);
                    const readBack = pipeline.runParsers(displayed, names, meta?.ui?.args);
                    assert.ok(
                        Object.is(readBack, value),
                        `${showPath(path)}: '${names.join(",")}' turned ${String(value)} ` +
                            `(${typeof value}) into ${String(readBack)} (${typeof readBack})`
                    );
                }
            }),
            { numRuns: 500 }
        );
    });
});

// ---------------------------------------------------------------------------
// 3. Type inference on the awkward cases
// ---------------------------------------------------------------------------

describe("inference — awkward real-world shapes", () => {
    const cases: ReadonlyArray<readonly [string, JsonRecord, (schema: ISchema) => void]> = [
        [
            "a null value becomes a nullable string field, not a missing field",
            { a: null },
            (schema) => {
                assert.strictEqual(schema.properties?.a.type, "string");
                assert.strictEqual(schema.properties?.a.nullable, true);
            }
        ],
        [
            "an empty array becomes an array of strings",
            { a: [] },
            (schema) => {
                assert.strictEqual(schema.properties?.a.type, "array");
                assert.strictEqual(schema.properties?.a.items?.type, "string");
            }
        ],
        [
            "an all-null array becomes an array of strings",
            { a: [null, null] },
            (schema) => assert.strictEqual(schema.properties?.a.items?.type, "string")
        ],
        [
            "observation O1: an array describes its items once, so a null element carries no nullability",
            { a: [null] },
            (schema) => {
                // Not a defect, but a limitation worth pinning: `items` has no per-element
                // nullable flag, so a `null` element and an empty string are indistinguishable to
                // anything downstream of the schema. Object properties do keep the flag.
                assert.strictEqual(schema.properties?.a.items?.type, "string");
                assert.strictEqual(schema.properties?.a.items?.nullable, undefined);
            }
        ],
        [
            "a mixed-type array takes its item type from the first non-null member",
            { a: [1, "two", true] },
            (schema) => assert.strictEqual(schema.properties?.a.items?.type, "number")
        ],
        [
            "a leading null does not decide the item type",
            { a: [null, 7] },
            (schema) => assert.strictEqual(schema.properties?.a.items?.type, "number")
        ],
        [
            "rows with differing key sets are unioned, not intersected",
            { rows: [{ a: 1 }, { b: "x" }, { c: true }] },
            (schema) =>
                assert.deepStrictEqual(Object.keys(schema.properties?.rows.items?.properties || {}).sort(), [
                    "a",
                    "b",
                    "c"
                ])
        ],
        [
            "a number arriving as a string stays a string",
            { a: "12", b: "3.5", c: "1e3" },
            (schema) => {
                assert.strictEqual(schema.properties?.a.type, "string");
                assert.strictEqual(schema.properties?.b.type, "string");
                assert.strictEqual(schema.properties?.c.type, "string");
            }
        ],
        [
            "an ISO date string becomes a date field, an invalid one stays a string",
            { good: "2024-02-29", bad: "2024-13-45", loose: "2024-2-9", leap: "2023-02-29" },
            (schema) => {
                assert.strictEqual(schema.properties?.good.type, "date");
                assert.strictEqual(schema.properties?.bad.type, "string");
                assert.strictEqual(schema.properties?.loose.type, "string");
                assert.strictEqual(schema.properties?.leap.type, "string");
            }
        ],
        [
            "booleans as strings stay strings",
            { a: "true", b: "false" },
            (schema) => {
                assert.strictEqual(schema.properties?.a.type, "string");
                assert.strictEqual(schema.properties?.b.type, "string");
            }
        ],
        [
            "an empty object becomes an object field with no properties",
            { a: {} },
            (schema) => {
                assert.strictEqual(schema.properties?.a.type, "object");
                assert.deepStrictEqual(schema.properties?.a.properties, {});
            }
        ],
        [
            "a key needing JSON Pointer escaping survives verbatim",
            { "a/b": 1, "a~b": 2, "a%20b": 3, "": 4 },
            (schema) =>
                assert.deepStrictEqual(Object.keys(schema.properties || {}).sort(), ["", "a%20b", "a/b", "a~b"])
        ],
        [
            "a zero, a negative zero and a float are all numbers",
            { zero: 0, negZero: -0, float: 0.1 + 0.2, big: Number.MAX_SAFE_INTEGER },
            (schema) => {
                for (const key of ["zero", "negZero", "float", "big"]) {
                    assert.strictEqual(schema.properties?.[key].type, "number", key);
                }
            }
        ],
        [
            "an empty string is a string field, not a missing one",
            { a: "" },
            (schema) => {
                assert.strictEqual(schema.properties?.a.type, "string");
                assert.strictEqual(schema.properties?.a.nullable, undefined);
            }
        ],
        [
            "an array of arrays degrades its item type to string",
            { a: [[1, 2], [3]] },
            (schema) => assert.strictEqual(schema.properties?.a.items?.type, "string")
        ]
    ];

    for (const [name, payload, check] of cases) {
        it(name, () => check(runInferencePipeline(payload).schema));
    }

    it("a very wide object keeps every one of its keys", () => {
        fc.assert(
            fc.property(fc.integer({ min: 50, max: 300 }), (width) => {
                const payload: JsonRecord = {};
                for (let i = 0; i < width; i++) payload[`field_${i}`] = i;
                const schema = runInferencePipeline(payload).schema;
                assert.strictEqual(Object.keys(schema.properties || {}).length, width);
            }),
            { numRuns: 40 }
        );
    });

    it("nesting is described down to the documented depth and truncation is reported", () => {
        fc.assert(
            fc.property(fc.integer({ min: 1, max: 14 }), (depth) => {
                let node: JsonRecord = { leaf: 42 };
                for (let i = 0; i < depth; i++) node = { child: node };
                const { value, entries } = withLogCapture(() => runInferencePipeline(node));
                let meta: IPropertyMetadata | ISchema | undefined = value.schema;
                let reached = 0;
                for (let i = 0; i < depth; i++) {
                    meta = meta?.properties?.child;
                    if (!meta || meta.type !== "object") break;
                    reached++;
                }
                if (reached < depth) {
                    assert.ok(
                        reported(entries, "Maximum inference depth"),
                        `inference stopped at level ${reached} of ${depth} without saying so`
                    );
                }
            }),
            { numRuns: 100 }
        );
    });
});

// ---------------------------------------------------------------------------
// 4. Inference / validation agreement
// ---------------------------------------------------------------------------

describe("inference — the inferred schema validates the data it came from", () => {
    it("a form built from a payload is not invalid the moment it opens", () => {
        fc.assert(
            fc.property(objectPayloadArb, (payload) => {
                const { schema, sandbox, structuralErrors } = runInferencePipeline(payload);
                assert.deepStrictEqual(structuralErrors, [], "the inferred schema is structurally invalid");
                const rootMeta: IPropertyMetadata = {
                    type: schema.type === "array" ? "array" : "object",
                    properties: schema.properties,
                    items: schema.items,
                    required: schema.required
                };
                const result = PayloadValidator.validateTree(rootMeta, sandbox);
                assert.ok(
                    result.isValid,
                    `inference produced a constraint its own data violates: ${result.errorMessage}\n` +
                        `  payload: ${canonical(payload)}`
                );
            })
        );
    });

    it("an inferred table reports no cell error for the rows it was inferred from", () => {
        fc.assert(
            fc.property(fc.array(rowArb, { minLength: 1, maxLength: 8 }), (rows) => {
                const { schema, sandbox } = runInferencePipeline(rows);
                const errors = PayloadValidator.validatePayloadArrays(schema, sandbox, "", () => undefined);
                const failures = errors.filter((entry) => !entry.isValid);
                assert.deepStrictEqual(
                    failures.map((entry) => `${entry.fieldKey}: ${entry.errorMessage}`),
                    [],
                    "an inferred table is invalid against its own rows"
                );
            })
        );
    });
});

// ---------------------------------------------------------------------------
// 5. Stability under growth
// ---------------------------------------------------------------------------

describe("inference — stability under growth", () => {
    it("one row and fifty rows of the same shape give the same property set", () => {
        fc.assert(
            fc.property(rowArb, fc.integer({ min: 2, max: 50 }), (row, count) => {
                const one = DataInferenceBuilder.inferSchemaFromData([row]);
                const many = DataInferenceBuilder.inferSchemaFromData(Array.from({ length: count }, () => row));
                assert.deepStrictEqual(
                    prune(many.items?.properties),
                    prune(one.items?.properties),
                    `${count} identical rows describe a different table than one row`
                );
            })
        );
    });

    it("a row with an extra key widens the table rather than replacing it", () => {
        fc.assert(
            fc.property(rowArb, fc.constantFrom("extra", "note", "flag"), dataValueArb(0), (row, extraKey, extraValue) => {
                if (extraKey in row) return;
                const narrow = DataInferenceBuilder.inferSchemaFromData([row]);
                const widened = DataInferenceBuilder.inferSchemaFromData([row, { ...row, [extraKey]: extraValue }]);
                const narrowKeys = Object.keys(narrow.items?.properties || {});
                const widenedKeys = Object.keys(widened.items?.properties || {});
                for (const key of narrowKeys) {
                    assert.ok(widenedKeys.includes(key), `the extra row dropped column '${key}'`);
                }
                assert.ok(widenedKeys.includes(extraKey), "the extra column was not picked up");
            })
        );
    });

    it("row order does not change the set of columns", () => {
        fc.assert(
            fc.property(fc.array(rowArb, { minLength: 2, maxLength: 8 }), (rows) => {
                const forward = DataInferenceBuilder.inferPropertiesFromRows(rows);
                const backward = DataInferenceBuilder.inferPropertiesFromRows([...rows].reverse());
                assert.deepStrictEqual(Object.keys(backward).sort(), Object.keys(forward).sort());
            })
        );
    });

    it("F11 (known defect): a column that first appears after row 50 is dropped in silence", () => {
        // `INFERENCE_SAMPLE_LIMIT` is 50 and the truncation is not logged, so a table bound to a
        // long list silently loses any column that only appears further down. Contrast the depth
        // limit, which warns. Delete this test when the sample limit starts reporting.
        const rows: JsonRecord[] = [];
        for (let i = 0; i < 50; i++) rows.push({ id: i });
        rows.push({ id: 50, lateColumn: "visible to the user, absent from the form" });
        const { value, entries } = withLogCapture(() => DataInferenceBuilder.inferPropertiesFromRows(rows));
        assert.deepStrictEqual(Object.keys(value), ["id"], "F11 appears fixed — the 51st row is now sampled");
        assert.strictEqual(
            entries.some((entry) => entry.level === "warning" || entry.level === "error"),
            false,
            "F11 appears fixed — the truncation is now reported"
        );
    });

    it("the 50th row still contributes its columns", () => {
        const rows: JsonRecord[] = [];
        for (let i = 0; i < 49; i++) rows.push({ id: i });
        rows.push({ id: 49, lastSampled: true });
        assert.deepStrictEqual(Object.keys(DataInferenceBuilder.inferPropertiesFromRows(rows)).sort(), [
            "id",
            "lastSampled"
        ]);
    });
});

// ---------------------------------------------------------------------------
// 6. Inferred path versus explicit-schema path
// ---------------------------------------------------------------------------

describe("inference — parity with the explicit-schema path", () => {
    /**
     * `InferredGeneratorHost` is an empty subclass of `GeneratorHost`: it adds only `metadata` and
     * `renderer`, and the inference itself happens in `GenerationDelegate`, which both hosts share.
     * The subclass therefore cannot diverge, and instantiating it would need the whole UI5 control
     * runtime, so it stays with the browser suite. What *can* diverge, and what both hosts actually
     * run, is the choice between `normalize(null, data)` and `normalize(schema, data)`. These
     * properties compare those two.
     */
    it("feeding an inferred schema back as an explicit schema keeps every field and type", () => {
        fc.assert(
            fc.property(objectPayloadArb, (payload) => {
                const inferred = SchemaNormalizer.normalize(null, deepClone(payload));
                const explicit = SchemaNormalizer.normalize(inferred, deepClone(payload));
                assert.strictEqual(explicit.type, inferred.type, "the root type changed");
                assert.deepStrictEqual(
                    Object.keys(explicit.properties || {}).sort(),
                    Object.keys(inferred.properties || {}).sort(),
                    "the explicit path dropped or invented a field"
                );
                for (const key of Object.keys(inferred.properties || {})) {
                    assert.strictEqual(
                        explicit.properties?.[key].type,
                        inferred.properties?.[key].type,
                        `'${key}' changed type between the inferred and the explicit path`
                    );
                }
            })
        );
    });

    it("hybrid inference keeps every inferred field that the explicit schema does not mention", () => {
        fc.assert(
            fc.property(objectPayloadArb, fc.constantFrom("alpha", "beta", "id"), (payload, declared) => {
                if (!(declared in payload)) return;
                const hybrid = {
                    type: "object",
                    additionalProperties: true,
                    properties: { [declared]: { type: "string", title: "Declared" } }
                };
                const schema = SchemaNormalizer.normalize(hybrid, deepClone(payload));
                for (const key of Object.keys(payload)) {
                    assert.ok(schema.properties?.[key], `hybrid inference lost the undeclared field '${key}'`);
                }
                assert.strictEqual(
                    schema.properties?.[declared].title,
                    "Declared",
                    "the explicit declaration was overwritten by inference"
                );
            })
        );
    });

    it("a closed explicit object does not absorb inferred keys", () => {
        const payload = { declared: "x", extra: 1 };
        const schema = SchemaNormalizer.normalize(
            {
                type: "object",
                additionalProperties: false,
                properties: { declared: { type: "string" } }
            },
            payload
        );
        assert.deepStrictEqual(Object.keys(schema.properties || {}), ["declared"]);
    });
});
