/**
 * @file normalizer-keywords.spec.ts
 * @description A keyword-by-keyword restatement of `SchemaNormalizer`'s descriptor contract.
 *
 * `schema-normalizer.spec.ts` asserts that constraints are *preserved* — whatever was declared is
 * still there after normalization. Preservation is a relation between input and output, so a
 * mutation that changes how a keyword is read changes both and survives. This file instead states,
 * one keyword at a time and from JSON Schema's own type table, what the descriptor must hold:
 *
 *  - the declared value when the keyword carries the JSON type its specification allows;
 *  - `undefined` when the keyword is absent;
 *  - `undefined` when the keyword carries a value of the wrong JSON type, because a form that
 *    silently coerced `"5"` into `maxLength: 5` would enforce a constraint nobody wrote.
 *
 * It also covers the structural paths `schema-normalizer.spec.ts` never enters: the root array and
 * hybrid-inference branches, polymorphic branch lists, `writeOnly` stripping and `resolveScope`.
 */

import * as assert from "assert";
import { fc, withLogCapture, reported } from "./fc-config";
import { ISchema, IPropertyMetadata } from "../../src/nz/co/siliconst/ui5/metaui/interfaces/ISchema";
import { SchemaNormalizer } from "../../src/nz/co/siliconst/ui5/metaui/core/SchemaNormalizer";
import { MAX_SCHEMA_DEPTH } from "../../src/nz/co/siliconst/ui5/metaui/constants/MetaUIConstants";

/** The single published nesting cap every walker in the engine shares. */
const MAX_NORMALIZE_DEPTH = MAX_SCHEMA_DEPTH;

/** Normalizes one leaf under `properties.field` and returns its descriptor. */
function leaf(declaration: Record<string, unknown>, data?: unknown): IPropertyMetadata {
    const schema = SchemaNormalizer.normalize({ type: "object", properties: { field: declaration } }, data);
    const meta = schema.properties?.field;
    assert.ok(meta, "the normalizer dropped the property entirely");
    return meta;
}

/** One row of the keyword table: the keyword, the JSON types it admits, and probes for each. */
interface IKeywordRow {
    readonly keyword: string;
    readonly accepted: readonly unknown[];
    readonly rejected: readonly unknown[];
}

/** Values of every JSON type other than `number`. */
const NOT_A_NUMBER: readonly unknown[] = ["5", true, false, null, [5], { value: 5 }];
/** Values of every JSON type other than `string`. */
const NOT_A_STRING: readonly unknown[] = [5, true, false, null, ["a"], { value: "a" }];
/** Values of every JSON type other than `boolean`. */
const NOT_A_BOOLEAN: readonly unknown[] = ["true", 1, 0, null, [true], { value: true }];

/**
 * JSON Schema draft 2020-12 §6: each assertion keyword admits exactly one JSON type. The base type
 * of the declaration is chosen so the keyword is meaningful, but the normalizer reads keywords
 * independently of the declared type, which is itself the contract being stated.
 */
const NUMERIC_KEYWORDS: readonly string[] = [
    "maxLength",
    "minLength",
    "minimum",
    "maximum",
    "multipleOf",
    "maxItems",
    "minItems",
    "maxProperties",
    "minProperties"
];

const STRING_KEYWORDS: readonly string[] = ["title", "description", "format", "pattern", "$ref"];

const BOOLEAN_KEYWORDS: readonly string[] = ["uniqueItems", "nullable", "writeOnly", "readOnly"];

const KEYWORD_TABLE: readonly IKeywordRow[] = [
    ...NUMERIC_KEYWORDS.map((keyword) => ({
        keyword,
        accepted: [0, 1, 7, 2.5, -3, Number.MAX_SAFE_INTEGER],
        rejected: [...NOT_A_NUMBER, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]
    })),
    ...STRING_KEYWORDS.map((keyword) => ({
        keyword,
        accepted: ["", "a", "^[a-z]+$", "a long enough value"],
        rejected: NOT_A_STRING
    })),
    ...BOOLEAN_KEYWORDS.map((keyword) => ({
        keyword,
        accepted: [true, false],
        rejected: NOT_A_BOOLEAN
    })),
    {
        // Draft-04 and OpenAPI 2.0 spell the exclusive bounds as booleans; draft 2020-12 and
        // OpenAPI 3.1 spell them as numbers. Both dialects are accepted verbatim.
        keyword: "exclusiveMinimum",
        accepted: [true, false, 0, 5, -2.5],
        rejected: ["5", null, [5], { value: 5 }]
    },
    {
        keyword: "exclusiveMaximum",
        accepted: [true, false, 0, 5, -2.5],
        rejected: ["5", null, [5], { value: 5 }]
    }
];

describe("SchemaNormalizer — the keyword type table", () => {
    for (const row of KEYWORD_TABLE) {
        it(`${row.keyword}: a declaration of the right JSON type is carried verbatim`, () => {
            for (const value of row.accepted) {
                const meta = leaf({ type: "string", [row.keyword]: value });
                assert.strictEqual(
                    meta[row.keyword as keyof IPropertyMetadata],
                    value,
                    `${row.keyword}: ${JSON.stringify(value)} did not survive normalization`
                );
            }
        });

        it(`${row.keyword}: an absent declaration leaves the descriptor undefined`, () => {
            const meta = leaf({ type: "string" });
            assert.strictEqual(meta[row.keyword as keyof IPropertyMetadata], undefined, row.keyword);
        });

        it(`${row.keyword}: a declaration of the wrong JSON type is dropped, never coerced`, () => {
            for (const value of row.rejected) {
                const meta = leaf({ type: "string", [row.keyword]: value });
                assert.strictEqual(
                    meta[row.keyword as keyof IPropertyMetadata],
                    undefined,
                    `${row.keyword}: ${JSON.stringify(value)} was accepted as a constraint`
                );
            }
        });
    }

    it("a boolean exclusive bound is preferred over a numeric reading of the same keyword", () => {
        // `exclusiveMinimum: true` is draft-04 for "the declared minimum is exclusive"; it must not
        // be read as the number 1.
        assert.strictEqual(leaf({ type: "number", minimum: 3, exclusiveMinimum: true }).exclusiveMinimum, true);
        assert.strictEqual(leaf({ type: "number", exclusiveMinimum: 3 }).exclusiveMinimum, 3);
        assert.strictEqual(leaf({ type: "number", exclusiveMinimum: 0 }).exclusiveMinimum, 0);
        assert.strictEqual(leaf({ type: "number", exclusiveMaximum: false }).exclusiveMaximum, false);
    });

    it("a falsy-but-declared numeric bound is kept, not treated as absent", () => {
        for (const keyword of NUMERIC_KEYWORDS) {
            const meta = leaf({ type: "string", [keyword]: 0 });
            assert.strictEqual(meta[keyword as keyof IPropertyMetadata], 0, keyword);
        }
    });

    it("a declared false flag is kept, not treated as absent", () => {
        for (const keyword of BOOLEAN_KEYWORDS) {
            const meta = leaf({ type: "string", [keyword]: false });
            assert.strictEqual(meta[keyword as keyof IPropertyMetadata], false, keyword);
        }
    });

    it("every numeric keyword survives at once, independently of the others", () => {
        fc.assert(
            fc.property(
                fc.uniqueArray(fc.constantFrom(...NUMERIC_KEYWORDS), { minLength: 1 }),
                fc.integer({ min: 0, max: 50 }),
                (keywords, value) => {
                    const declaration: Record<string, unknown> = { type: "string" };
                    for (const keyword of keywords) {
                        declaration[keyword] = value;
                    }
                    const meta = leaf(declaration);
                    for (const keyword of NUMERIC_KEYWORDS) {
                        assert.strictEqual(
                            meta[keyword as keyof IPropertyMetadata],
                            keywords.includes(keyword) ? value : undefined,
                            keyword
                        );
                    }
                }
            ),
            { numRuns: 300 }
        );
    });
});

describe("SchemaNormalizer — value keywords are deep-copied", () => {
    for (const keyword of ["const", "default", "example"]) {
        it(`${keyword}: a scalar is carried verbatim and an absent one stays undefined`, () => {
            assert.strictEqual(leaf({ type: "string", [keyword]: "x" })[keyword as keyof IPropertyMetadata], "x");
            assert.strictEqual(leaf({ type: "number", [keyword]: 0 })[keyword as keyof IPropertyMetadata], 0);
            assert.strictEqual(leaf({ type: "boolean", [keyword]: false })[keyword as keyof IPropertyMetadata], false);
            assert.strictEqual(leaf({ type: "null", [keyword]: null })[keyword as keyof IPropertyMetadata], null);
            assert.strictEqual(leaf({ type: "string" })[keyword as keyof IPropertyMetadata], undefined);
        });

        it(`${keyword}: a structured value is copied, not shared with the caller's schema`, () => {
            const declared = { nested: { list: [1, 2] } };
            const meta = leaf({ type: "object", [keyword]: declared });
            const carried = meta[keyword as keyof IPropertyMetadata];
            assert.deepStrictEqual(carried, declared);
            assert.notStrictEqual(carried, declared, `${keyword} shares a reference with the input schema`);
        });
    }
});

describe("SchemaNormalizer — required and nullability", () => {
    it("a key named in the parent required array is required, and no other key is", () => {
        const schema = SchemaNormalizer.normalize({
            type: "object",
            properties: { a: { type: "string" }, b: { type: "string" } },
            required: ["b"]
        });
        assert.strictEqual(schema.properties?.a.required, false);
        assert.strictEqual(schema.properties?.b.required, true);
        assert.deepStrictEqual(schema.required, ["b"]);
    });

    it("required: true on the property itself also marks it required", () => {
        assert.strictEqual(leaf({ type: "string", required: true }).required, true);
        assert.strictEqual(leaf({ type: "string", required: false }).required, false);
        assert.strictEqual(leaf({ type: "string", required: ["x"] }).required, false,
            "an array-valued required is a parent's list, not a leaf flag");
    });

    it("a non-string entry in the parent required array is discarded", () => {
        const schema = SchemaNormalizer.normalize({
            type: "object",
            properties: { a: { type: "string" } },
            required: ["a", 7, null]
        });
        assert.deepStrictEqual(schema.required, ["a"]);
    });

    it("a union type including null makes the property nullable and resolves to the other member", () => {
        const meta = leaf({ type: ["string", "null"], maxLength: 4 });
        assert.strictEqual(meta.type, "string");
        assert.strictEqual(meta.nullable, true);
        assert.strictEqual(meta.maxLength, 4);
    });

    it("an explicit nullable flag overrides what the union type implies", () => {
        assert.strictEqual(leaf({ type: ["string", "null"], nullable: false }).nullable, false);
        assert.strictEqual(leaf({ type: "string", nullable: true }).nullable, true);
        assert.strictEqual(leaf({ type: "string" }).nullable, undefined);
    });
});

describe("SchemaNormalizer — additionalProperties", () => {
    it("a boolean additionalProperties is carried through on a property", () => {
        assert.strictEqual(leaf({ type: "object", additionalProperties: true }).additionalProperties, true);
        assert.strictEqual(leaf({ type: "object", additionalProperties: false }).additionalProperties, false);
        assert.strictEqual(leaf({ type: "object" }).additionalProperties, undefined);
    });

    it("a schema-valued additionalProperties becomes a normalized value descriptor", () => {
        const meta = leaf({ type: "object", additionalProperties: { type: "integer", minimum: 2 } });
        const value = meta.additionalProperties as IPropertyMetadata;
        assert.strictEqual(value.type, "integer");
        assert.strictEqual(value.minimum, 2);
        assert.strictEqual(value.required, false);
        assert.strictEqual(value.ui?.label, "Value");
    });

    it("a boolean additionalProperties on the root is carried onto the ISchema", () => {
        assert.strictEqual(SchemaNormalizer.normalize({ type: "object", additionalProperties: false })
            .additionalProperties, false);
        assert.strictEqual(SchemaNormalizer.normalize({ type: "object", additionalProperties: true })
            .additionalProperties, true);
        assert.strictEqual(SchemaNormalizer.normalize({ type: "object" }).additionalProperties, undefined);
    });

    it("a schema-valued additionalProperties on the root becomes a value descriptor", () => {
        const schema = SchemaNormalizer.normalize({
            type: "object",
            additionalProperties: { type: "string", maxLength: 3 }
        });
        const value = schema.additionalProperties as IPropertyMetadata;
        assert.strictEqual(value.type, "string");
        assert.strictEqual(value.maxLength, 3);
        assert.strictEqual(value.ui?.label, "Value");
    });

    it("a non-boolean, non-object additionalProperties is ignored", () => {
        assert.strictEqual(SchemaNormalizer.normalize({ type: "object", additionalProperties: "yes" })
            .additionalProperties, undefined);
        assert.strictEqual(leaf({ type: "object", additionalProperties: 1 }).additionalProperties, undefined);
    });
});

describe("SchemaNormalizer — root-level keywords", () => {
    it("the root carries its own title, layout strategy and object-level constraints", () => {
        const schema = SchemaNormalizer.normalize({
            type: "object",
            title: "Order",
            layoutStrategy: "wizard",
            readOnly: true,
            maxProperties: 9,
            minProperties: 1,
            properties: { a: { type: "string" } }
        });
        assert.strictEqual(schema.title, "Order");
        assert.strictEqual(schema.layoutStrategy, "wizard");
        assert.strictEqual(schema.readOnly, true);
        assert.strictEqual(schema.maxProperties, 9);
        assert.strictEqual(schema.minProperties, 1);
    });

    it("root array constraints are carried onto the ISchema", () => {
        const schema = SchemaNormalizer.normalize({
            type: "array",
            items: { type: "object", properties: { a: { type: "string" } } },
            maxItems: 10,
            minItems: 2,
            uniqueItems: true
        });
        assert.strictEqual(schema.type, "array");
        assert.strictEqual(schema.maxItems, 10);
        assert.strictEqual(schema.minItems, 2);
        assert.strictEqual(schema.uniqueItems, true);
        assert.strictEqual(schema.items?.properties?.a.type, "string");
    });

    it("a root with items but no declared type is an array", () => {
        const schema = SchemaNormalizer.normalize({ items: { type: "string" } });
        assert.strictEqual(schema.type, "array");
        assert.strictEqual(schema.items?.type, "string");
    });

    it("a root array with no items block still publishes an object item descriptor", () => {
        const schema = SchemaNormalizer.normalize({ type: "array" });
        assert.strictEqual(schema.type, "array");
        assert.strictEqual(schema.items?.type, "object");
    });

    it("a root-level wrong-typed keyword is dropped rather than coerced", () => {
        const schema = SchemaNormalizer.normalize({
            type: "object",
            title: 7,
            readOnly: "yes",
            maxItems: "3",
            layoutStrategy: 1,
            properties: {}
        });
        assert.strictEqual(schema.title, undefined);
        assert.strictEqual(schema.readOnly, undefined);
        assert.strictEqual(schema.maxItems, undefined);
        assert.strictEqual(schema.layoutStrategy, undefined);
    });
});

describe("SchemaNormalizer — hybrid inference", () => {
    it("additionalProperties: true merges inferred keys into a declared object root", () => {
        const schema = SchemaNormalizer.normalize(
            { type: "object", additionalProperties: true, properties: { declared: { type: "string" } } },
            { declared: "x", extra: 42 }
        );
        const keys = Object.keys(schema.properties || {});
        assert.ok(keys.includes("declared"), "the declared property disappeared");
        assert.ok(keys.includes("extra"), "the inferred property was not merged in");
        assert.strictEqual(schema.properties?.declared.type, "string", "the declaration still wins");
    });

    it("a closed object does not absorb undeclared payload keys", () => {
        const schema = SchemaNormalizer.normalize(
            { type: "object", additionalProperties: false, properties: { declared: { type: "string" } } },
            { declared: "x", extra: 42 }
        );
        assert.deepStrictEqual(Object.keys(schema.properties || {}), ["declared"]);
    });

    it("without additionalProperties, payload keys are not inferred at all", () => {
        const schema = SchemaNormalizer.normalize(
            { type: "object", properties: { declared: { type: "string" } } },
            { declared: "x", extra: 42 }
        );
        assert.deepStrictEqual(Object.keys(schema.properties || {}), ["declared"]);
    });

    it("an open array root infers its row columns from the payload rows", () => {
        const schema = SchemaNormalizer.normalize(
            { type: "array", additionalProperties: true, items: { type: "object", properties: {} } },
            [{ id: 1, name: "a" }, { id: 2, name: "b" }]
        );
        const columns = Object.keys(schema.items?.properties || {});
        assert.ok(columns.includes("id"), `inferred columns were ${columns.join(", ")}`);
        assert.ok(columns.includes("name"), `inferred columns were ${columns.join(", ")}`);
    });

    it("an open nested object infers its child keys from the matching payload branch", () => {
        const meta = leaf({ type: "object", additionalProperties: true, properties: {} },
            { field: { nestedKey: "v" } });
        assert.ok(Object.keys(meta.properties || {}).includes("nestedKey"));
    });

    it("an open array property infers its row columns from the matching payload rows", () => {
        const meta = leaf(
            { type: "array", items: { type: "object", additionalProperties: true, properties: {} } },
            { field: [{ col: 1 }] }
        );
        assert.ok(Object.keys(meta.items?.properties || {}).includes("col"));
    });

    it("hybrid inference needs data: without it the declared shape is published unchanged", () => {
        const schema = SchemaNormalizer.normalize({
            type: "object",
            additionalProperties: true,
            properties: { declared: { type: "string" } }
        });
        assert.deepStrictEqual(Object.keys(schema.properties || {}), ["declared"]);
    });
});

describe("SchemaNormalizer — polymorphic branch lists", () => {
    it("oneOf and anyOf branches are normalized in order, keeping their constraints", () => {
        const meta = leaf({
            oneOf: [{ type: "string", maxLength: 3 }, { type: "integer", minimum: 1 }],
            anyOf: [{ type: "boolean" }]
        });
        assert.strictEqual(meta.oneOf?.length, 2);
        assert.strictEqual(meta.oneOf?.[0].type, "string");
        assert.strictEqual(meta.oneOf?.[0].maxLength, 3);
        assert.strictEqual(meta.oneOf?.[1].type, "integer");
        assert.strictEqual(meta.oneOf?.[1].minimum, 1);
        assert.strictEqual(meta.anyOf?.length, 1);
        assert.strictEqual(meta.anyOf?.[0].type, "boolean");
    });

    it("a branch list that is not an array yields no branches", () => {
        assert.strictEqual(leaf({ type: "string", oneOf: { type: "string" } }).oneOf, undefined);
        assert.strictEqual(leaf({ type: "string", anyOf: "nope" }).anyOf, undefined);
        assert.strictEqual(leaf({ type: "string" }).oneOf, undefined);
    });

    it("branch entries that are not schema objects are discarded, the rest kept", () => {
        const meta = leaf({ oneOf: [null, { type: "string" }, 7, { type: "integer" }] });
        assert.strictEqual(meta.oneOf?.length, 2);
        assert.strictEqual(meta.oneOf?.[0].type, "string");
        assert.strictEqual(meta.oneOf?.[1].type, "integer");
    });

    it("an empty branch list produces an empty array, not undefined", () => {
        assert.deepStrictEqual(leaf({ type: "string", oneOf: [] }).oneOf, []);
    });

    it("a $ref branch is resolved, titled after the definition and keeps its pointer", () => {
        const schema = SchemaNormalizer.normalize({
            type: "object",
            $defs: { Dog: { type: "object", properties: { bark: { type: "boolean" } }, required: ["bark"] } },
            properties: { pet: { oneOf: [{ $ref: "#/$defs/Dog" }] } }
        });
        const branch = schema.properties?.pet.oneOf?.[0];
        assert.strictEqual(branch?.$ref, "#/$defs/Dog");
        assert.strictEqual(branch?.title, "Dog", "a nameless definition is titled by its key");
        assert.deepStrictEqual(Object.keys(branch?.properties || {}), ["bark"]);
        assert.deepStrictEqual(branch?.required, ["bark"]);
    });

    it("a branch title at the use site wins over the definition's title", () => {
        const schema = SchemaNormalizer.normalize({
            type: "object",
            $defs: { Dog: { type: "object", title: "Canine" } },
            properties: { pet: { oneOf: [{ $ref: "#/$defs/Dog", title: "Good boy" }] } }
        });
        assert.strictEqual(schema.properties?.pet.oneOf?.[0].title, "Good boy");
    });

    it("a self-referential branch terminates as a reference stub", () => {
        const schema = SchemaNormalizer.normalize({
            type: "object",
            $defs: { Node: { type: "object", properties: { next: { oneOf: [{ $ref: "#/$defs/Node" }] } } } },
            properties: { tree: { oneOf: [{ $ref: "#/$defs/Node" }] } }
        });
        const inner = schema.properties?.tree.oneOf?.[0].properties?.next.oneOf?.[0];
        assert.strictEqual(inner?.$ref, "#/$defs/Node");
        assert.strictEqual(inner?.type, "object");
        assert.strictEqual(inner?.ui?.widget, "reference");
    });

    it("a root oneOf is merged into the root rather than being dropped", () => {
        const schema = SchemaNormalizer.normalize({
            type: "object",
            oneOf: [
                { type: "object", title: "Card", properties: { pan: { type: "string" } } },
                { type: "object", title: "Bank", properties: { iban: { type: "string" } } }
            ]
        });
        assert.ok(schema.oneOf || Object.keys(schema.properties || {}).length > 0,
            "a root oneOf produced neither branches nor properties");
    });

    it("a nested not schema is normalized with its constraints", () => {
        const meta = leaf({ type: "string", not: { type: "string", maxLength: 3, pattern: "^a" } });
        assert.strictEqual(meta.not?.maxLength, 3);
        assert.strictEqual(meta.not?.pattern, "^a");
        assert.strictEqual(meta.not?.required, false);
        assert.strictEqual(leaf({ type: "string", not: "nope" }).not, undefined);
    });
});

describe("SchemaNormalizer — recursion limits", () => {
    /** A chain of `depth` nested object properties around `innermost`. */
    const nest = (depth: number, innermost: Record<string, unknown>): Record<string, unknown> => {
        let node = innermost;
        for (let i = 0; i < depth; i++) {
            node = { type: "object", properties: { child: node } };
        }
        return node;
    };

    /** Walks `depth` levels of `properties.child`. */
    const descend = (meta: IPropertyMetadata | undefined, depth: number): IPropertyMetadata | undefined => {
        let node = meta;
        for (let i = 0; i < depth; i++) {
            node = node?.properties?.child;
        }
        return node;
    };

    it("a property chain at the documented limit keeps its leaf constraints", () => {
        const meta = leaf(nest(MAX_NORMALIZE_DEPTH, { type: "string", maxLength: 3 }));
        const bottom = descend(meta, MAX_NORMALIZE_DEPTH);
        assert.strictEqual(bottom?.type, "string");
        assert.strictEqual(bottom?.maxLength, 3);
    });

    it("a property chain past the limit is truncated and the truncation is reported", () => {
        const { value: meta, entries } = withLogCapture(() =>
            leaf(nest(MAX_NORMALIZE_DEPTH + 3, { type: "string", maxLength: 3 }))
        );
        const bottom = descend(meta, MAX_NORMALIZE_DEPTH + 3);
        assert.notStrictEqual(bottom?.maxLength, 3, "nothing was truncated");
        assert.ok(reported(entries, "MAX_SCHEMA_DEPTH"), "truncation happened without a diagnostic");
    });

    it("an array chain past the limit is truncated and reported", () => {
        let node: Record<string, unknown> = { type: "string", maxLength: 3 };
        for (let i = 0; i < MAX_NORMALIZE_DEPTH + 3; i++) {
            node = { type: "array", items: node };
        }
        const { entries } = withLogCapture(() => leaf(node));
        assert.ok(reported(entries, "MAX_SCHEMA_DEPTH"), "the array chain was not truncated");
    });

    it("a oneOf chain past the limit is truncated and reported", () => {
        let node: Record<string, unknown> = { type: "string", maxLength: 3 };
        for (let i = 0; i < MAX_NORMALIZE_DEPTH + 3; i++) {
            node = { oneOf: [node] };
        }
        const { entries } = withLogCapture(() => leaf(node));
        assert.ok(reported(entries, "MAX_SCHEMA_DEPTH"), "the branch chain was not truncated");
    });

    it("a not chain past the limit is truncated and reported", () => {
        let node: Record<string, unknown> = { type: "string", maxLength: 3 };
        for (let i = 0; i < MAX_NORMALIZE_DEPTH + 3; i++) {
            node = { type: "object", not: node };
        }
        const { entries } = withLogCapture(() => leaf(node));
        assert.ok(reported(entries, "MAX_SCHEMA_DEPTH"), "the not chain was not truncated");
    });

    it("a dictionary chain past the limit is truncated and reported", () => {
        let node: Record<string, unknown> = { type: "string", maxLength: 3 };
        for (let i = 0; i < MAX_NORMALIZE_DEPTH + 3; i++) {
            node = { type: "object", additionalProperties: node };
        }
        const { entries } = withLogCapture(() => leaf(node));
        assert.ok(reported(entries, "MAX_SCHEMA_DEPTH"), "the dictionary chain was not truncated");
    });
});

describe("SchemaNormalizer — a property that is not a schema object", () => {
    it("is published as a usable field and the substitution is reported", () => {
        const { value: schema, entries } = withLogCapture(() =>
            SchemaNormalizer.normalize({ type: "object", properties: { broken: "not a schema", n: 7 } })
        );
        assert.ok(schema.properties?.broken, "the property was dropped silently");
        assert.ok(schema.properties?.n, "the property was dropped silently");
        assert.ok(reported(entries, "broken"), "the substitution was not reported");
    });
});

describe("SchemaNormalizer — writeOnly stripping", () => {
    it("a writeOnly value supplied as input is removed from the payload", () => {
        const schema = SchemaNormalizer.normalize({
            type: "object",
            properties: { user: { type: "string" }, password: { type: "string", writeOnly: true } }
        });
        const payload: Record<string, unknown> = { user: "ada", password: "secret" };
        SchemaNormalizer.stripWriteOnlyValues(schema, payload);
        assert.deepStrictEqual(payload, { user: "ada" });
    });

    it("a writeOnly value nested in an object or an array row is removed too", () => {
        const schema = SchemaNormalizer.normalize({
            type: "object",
            properties: {
                account: { type: "object", properties: { pin: { type: "string", writeOnly: true } } },
                rows: {
                    type: "array",
                    items: { type: "object", properties: { secret: { type: "string", writeOnly: true } } }
                }
            }
        });
        const payload: Record<string, unknown> = {
            account: { pin: "1234" },
            rows: [{ secret: "a", keep: 1 }, { secret: "b" }]
        };
        SchemaNormalizer.stripWriteOnlyValues(schema, payload);
        assert.deepStrictEqual(payload, { account: {}, rows: [{ keep: 1 }, {}] });
    });

    it("a writeOnly dictionary value type removes every undeclared entry", () => {
        const schema = SchemaNormalizer.normalize({
            type: "object",
            properties: {
                bag: {
                    type: "object",
                    properties: { visible: { type: "string" } },
                    additionalProperties: { type: "string", writeOnly: true }
                }
            }
        });
        const payload: Record<string, unknown> = { bag: { visible: "v", hidden: "h" } };
        SchemaNormalizer.stripWriteOnlyValues(schema, payload);
        assert.deepStrictEqual(payload, { bag: { visible: "v" } });
    });

    it("a key the schema does not declare is left alone", () => {
        const schema = SchemaNormalizer.normalize({
            type: "object",
            properties: { password: { type: "string", writeOnly: true } }
        });
        const payload: Record<string, unknown> = { other: "x" };
        SchemaNormalizer.stripWriteOnlyValues(schema, payload);
        assert.deepStrictEqual(payload, { other: "x" });
    });

    it("no schema, or a non-object payload, is a no-op rather than a crash", () => {
        SchemaNormalizer.stripWriteOnlyValues(undefined, { a: 1 });
        const schema = SchemaNormalizer.normalize({ type: "object", properties: {} });
        for (const payload of [null, undefined, 7, "x", true]) {
            SchemaNormalizer.stripWriteOnlyValues(schema, payload);
        }
    });

    it("a writeOnly property behind a $ref definition is still stripped", () => {
        const schema = SchemaNormalizer.normalize({
            type: "object",
            $defs: { Credentials: { type: "object", properties: { token: { type: "string", writeOnly: true } } } },
            properties: { creds: { $ref: "#/$defs/Credentials" } }
        });
        const payload: Record<string, unknown> = { creds: { token: "t", keep: 1 } };
        SchemaNormalizer.stripWriteOnlyValues(schema, payload);
        assert.deepStrictEqual(payload, { creds: { keep: 1 } });
    });
});

describe("SchemaNormalizer — resolveScope", () => {
    const schema: ISchema = SchemaNormalizer.normalize({
        type: "object",
        properties: {
            header: { type: "object", properties: { id: { type: "string", maxLength: 4 } } },
            plain: { type: "string" }
        }
    });

    it("a one-level scope resolves to the property descriptor", () => {
        const result = SchemaNormalizer.resolveScope(schema, "#/properties/plain");
        assert.strictEqual(result.meta?.type, "string");
        assert.strictEqual(result.bindingPath, "plain");
        assert.strictEqual(result.propKey, "plain");
    });

    it("a nested scope resolves through properties and reports both path spellings", () => {
        const result = SchemaNormalizer.resolveScope(schema, "#/properties/header/properties/id");
        assert.strictEqual(result.meta?.maxLength, 4);
        assert.strictEqual(result.bindingPath, "header/id");
        assert.strictEqual(result.propKey, "header/properties/id");
    });

    it("a scope that is not a properties pointer is returned unresolved and unchanged", () => {
        const result = SchemaNormalizer.resolveScope(schema, "header/id");
        assert.strictEqual(result.meta, undefined);
        assert.strictEqual(result.bindingPath, "header/id");
        assert.strictEqual(result.propKey, "header/id");
        const empty = SchemaNormalizer.resolveScope(schema, "");
        assert.strictEqual(empty.meta, undefined);
        assert.strictEqual(empty.bindingPath, "");
    });

    it("a scope naming a property that does not exist resolves to nothing and is reported", () => {
        const { value: result, entries } = withLogCapture(() =>
            SchemaNormalizer.resolveScope(schema, "#/properties/missing")
        );
        assert.strictEqual(result.meta, undefined);
        assert.ok(reported(entries, "missing"), "an unresolvable scope was not reported");
    });

    it("a scope descending through a leaf resolves to nothing rather than throwing", () => {
        const result = SchemaNormalizer.resolveScope(schema, "#/properties/plain/properties/deeper");
        assert.strictEqual(result.meta, undefined);
        assert.strictEqual(result.bindingPath, "plain/deeper");
    });

    it("an escaped pointer segment is unescaped before the lookup", () => {
        const slashed = SchemaNormalizer.normalize({
            type: "object",
            properties: { "a/b": { type: "string", maxLength: 2 } }
        });
        assert.strictEqual(SchemaNormalizer.resolveScope(slashed, "#/properties/a~1b").meta?.maxLength, 2);
    });
});

describe("SchemaNormalizer — normalizeDefinition", () => {
    it("a definition entry keeps its type, constraints and required list", () => {
        const def = SchemaNormalizer.normalizeDefinition(
            { type: "object", properties: { a: { type: "string", maxLength: 3 } }, required: ["a"] },
            "Thing"
        );
        assert.strictEqual(def.type, "object");
        assert.strictEqual(def.properties?.a.maxLength, 3);
        assert.deepStrictEqual(def.required, ["a"]);
        assert.strictEqual(def.title, "Thing", "an untitled definition is titled by its key");
    });

    it("an array definition stays an array", () => {
        const def = SchemaNormalizer.normalizeDefinition({ type: "array", items: { type: "string" } }, "List");
        assert.strictEqual(def.type, "array");
        assert.strictEqual(def.items?.type, "string");
    });

    it("a primitive definition keeps its primitive type rather than becoming an object", () => {
        const def: Record<string, unknown> = SchemaNormalizer.normalizeDefinition(
            { type: "string", maxLength: 5 },
            "Code"
        ) as unknown as Record<string, unknown>;
        assert.strictEqual(def.type, "string");
        assert.strictEqual(def.maxLength, 5);
    });

    it("a definition that is not a schema object still yields a schema", () => {
        for (const raw of [null, 7, true, ["a"]]) {
            const def = SchemaNormalizer.normalizeDefinition(raw, "Broken");
            assert.strictEqual(typeof def.type, "string", JSON.stringify(raw));
        }
    });

    it("every definition in the document is normalized onto the root", () => {
        const schema = SchemaNormalizer.normalize({
            type: "object",
            definitions: { A: { type: "string" } },
            $defs: { B: { type: "integer" } },
            properties: {}
        });
        assert.deepStrictEqual(Object.keys(schema.definitions || {}).sort(), ["A", "B"]);
        assert.strictEqual(schema.definitions?.A.type, "string");
        assert.strictEqual(schema.definitions?.B.type, "integer");
    });

    it("a document with no definitions carries no definitions dictionary", () => {
        assert.strictEqual(SchemaNormalizer.normalize({ type: "object", properties: {} }).definitions, undefined);
    });
});
