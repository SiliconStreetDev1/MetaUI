/**
 * @file schema-normalizer.spec.ts
 * @description Properties of `SchemaNormalizer.normalize`: purity, idempotency, constraint
 * preservation at depth, depth honesty, and `$ref` equivalence.
 */

import * as assert from "assert";
import { fc, reported, withLogCapture } from "./fc-config";
import {
    JsonRecord,
    canonical,
    conformingValueArb,
    constraintsOf,
    deepFreeze,
    descend,
    nestSchema,
    primitiveSchemaArb,
    prune,
    rootSchemaArb,
    schemaDocumentArb,
    toJsonSchema
} from "./arbitraries";
import { SchemaNormalizer } from "../../src/nz/co/siliconst/ui5/metaui/core/SchemaNormalizer";
import { ISchema } from "../../src/nz/co/siliconst/ui5/metaui/interfaces/ISchema";
import { MAX_SCHEMA_DEPTH } from "../../src/nz/co/siliconst/ui5/metaui/constants/MetaUIConstants";

/**
 * Deepest `properties` nesting level whose constraints survive normalization.
 * The engine publishes one nesting cap, `MAX_SCHEMA_DEPTH`, and the `[DEPTH_CONSTANT]` gate in
 * `scripts/run-tests.js` forbids a second copy of it, so this is derived rather than restated.
 * The depth counter starts at 0 for the root's own properties, so the last normalized level is
 * one past the cap. The "depth honesty" property below pins the first truncated level from the
 * other side.
 */
const LAST_PRESERVED_LEVEL = MAX_SCHEMA_DEPTH + 1;

describe("SchemaNormalizer — purity", () => {
    it("never mutates the schema it is given", () => {
        fc.assert(
            fc.property(schemaDocumentArb(3), (doc) => {
                const raw = toJsonSchema(doc);
                const before = canonical(raw);
                deepFreeze(raw);
                SchemaNormalizer.normalize(raw);
                assert.strictEqual(canonical(raw), before, "normalize wrote into its input schema");
            })
        );
    });

    it("never mutates the data payload it is given", () => {
        fc.assert(
            fc.property(
                schemaDocumentArb(2).chain((doc) =>
                    fc.tuple(fc.constant(doc), conformingValueArb(doc.root))
                ),
                ([doc, payload]) => {
                    const raw = { ...toJsonSchema(doc), additionalProperties: true };
                    const before = canonical(payload);
                    deepFreeze(raw);
                    deepFreeze(payload);
                    SchemaNormalizer.normalize(raw, payload);
                    assert.strictEqual(canonical(payload), before, "normalize wrote into its input payload");
                }
            )
        );
    });
});

describe("SchemaNormalizer — idempotency", () => {
    it("normalize(normalize(x)) equals normalize(x)", () => {
        fc.assert(
            fc.property(schemaDocumentArb(3), (doc) => {
                const once = SchemaNormalizer.normalize(toJsonSchema(doc));
                const snapshot = canonical(prune(once));
                const twice = SchemaNormalizer.normalize(JSON.parse(JSON.stringify(once)) as JsonRecord);
                assert.strictEqual(canonical(prune(twice)), snapshot);
            })
        );
    });
});

describe("SchemaNormalizer — constraint preservation at depth", () => {
    it("keeps every declared constraint on a leaf at any supported nesting level", () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 1, max: LAST_PRESERVED_LEVEL }),
                primitiveSchemaArb,
                (level, leaf) => {
                    const doc = nestSchema(level, leaf);
                    const normalized = SchemaNormalizer.normalize(doc);
                    const node = descend(normalized as never, level);
                    assert.ok(node, `property at level ${level} was dropped`);
                    const actual = constraintsOf(node);
                    for (const [keyword, expected] of Object.entries(leaf)) {
                        assert.deepStrictEqual(
                            actual[keyword],
                            expected,
                            `level ${level}: '${keyword}' became ${JSON.stringify(actual[keyword])}`
                        );
                    }
                }
            )
        );
    });

    it("keeps array item constraints at any supported nesting level", () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 1, max: LAST_PRESERVED_LEVEL - 1 }),
                primitiveSchemaArb,
                (level, leaf) => {
                    const doc = nestSchema(level, { type: "array", items: leaf, minItems: 1 });
                    const normalized = SchemaNormalizer.normalize(doc);
                    const node = descend(normalized as never, level) as { items?: unknown } | undefined;
                    assert.ok(node?.items, `array items at level ${level} were dropped`);
                    const actual = constraintsOf(node.items);
                    for (const [keyword, expected] of Object.entries(leaf)) {
                        assert.deepStrictEqual(actual[keyword], expected, `level ${level} items: '${keyword}'`);
                    }
                }
            )
        );
    });
});

describe("SchemaNormalizer — depth honesty", () => {
    it("reports truncation instead of silently dropping a property beyond the depth limit", () => {
        fc.assert(
            fc.property(
                fc.integer({ min: LAST_PRESERVED_LEVEL + 1, max: LAST_PRESERVED_LEVEL + 4 }),
                primitiveSchemaArb,
                (level, leaf) => {
                    const doc = nestSchema(level, leaf);
                    const { value, entries } = withLogCapture(() => SchemaNormalizer.normalize(doc));
                    const node = descend(value as never, level);
                    assert.strictEqual(node, undefined, `level ${level} was normalized after all`);
                    assert.ok(
                        reported(entries, "MAX_SCHEMA_DEPTH"),
                        `truncation at level ${level} was silent`
                    );
                }
            ),
            { numRuns: 200 }
        );
    });

    it("the deepest supported leaf keeps its declared type", () => {
        fc.assert(
            fc.property(primitiveSchemaArb, (leaf) => {
                const normalized = SchemaNormalizer.normalize(nestSchema(LAST_PRESERVED_LEVEL, leaf));
                const node = descend(normalized as never, LAST_PRESERVED_LEVEL) as { type?: string } | undefined;
                assert.strictEqual(node?.type, leaf.type);
            }),
            { numRuns: 200 }
        );
    });
});

describe("SchemaNormalizer — $ref equivalence", () => {
    it("a single-branch allOf $ref yields the same constraints as inlining the definition", () => {
        fc.assert(
            fc.property(primitiveSchemaArb, (definition) => {
                const viaRef = SchemaNormalizer.normalize({
                    type: "object",
                    properties: { field: { allOf: [{ $ref: "#/$defs/Target" }] } },
                    $defs: { Target: definition }
                });
                const inline = SchemaNormalizer.normalize({
                    type: "object",
                    properties: { field: { ...definition } },
                    $defs: { Target: definition }
                });
                assert.deepStrictEqual(
                    constraintsOf(viaRef.properties?.field),
                    constraintsOf(inline.properties?.field)
                );
            })
        );
    });

    it("a definition entry exposes the same constraints as the same schema inlined", () => {
        fc.assert(
            fc.property(primitiveSchemaArb, (definition) => {
                const withDef = SchemaNormalizer.normalize({
                    type: "object",
                    properties: { other: { type: "string" } },
                    $defs: { Target: definition }
                });
                const inline = SchemaNormalizer.normalize({
                    type: "object",
                    properties: { field: { ...definition } }
                });
                const defConstraints = constraintsOf(withDef.definitions?.Target);
                const inlineConstraints = constraintsOf(inline.properties?.field);
                for (const keyword of Object.keys(definition)) {
                    assert.deepStrictEqual(
                        defConstraints[keyword],
                        inlineConstraints[keyword],
                        `definition lost '${keyword}'`
                    );
                }
            })
        );
    });
});

describe("SchemaNormalizer — entry points and root handling", () => {
    it("the ISchemaBuilderPlugin contract delegates to normalize and always claims the input", () => {
        fc.assert(
            fc.property(schemaDocumentArb(2), (doc) => {
                const builder = new SchemaNormalizer();
                const raw = toJsonSchema(doc);
                assert.strictEqual(builder.canHandle(), true, "the terminal fallback builder refused an input");
                assert.deepStrictEqual(
                    prune(builder.build(raw)),
                    prune(SchemaNormalizer.normalize(raw)),
                    "build() and normalize() disagree"
                );
            }),
            { numRuns: 300 }
        );
    });

    it("a JSON string schema normalizes to the same thing as the parsed object", () => {
        fc.assert(
            fc.property(schemaDocumentArb(2), (doc) => {
                const raw = toJsonSchema(doc);
                assert.deepStrictEqual(
                    prune(SchemaNormalizer.normalize(JSON.stringify(raw))),
                    prune(SchemaNormalizer.normalize(raw))
                );
            }),
            { numRuns: 300 }
        );
    });

    it("a blank string schema falls back to data inference rather than throwing", () => {
        fc.assert(
            fc.property(fc.constantFrom("", "   ", "\n\t"), (blank) => {
                const schema = SchemaNormalizer.normalize(blank, { inferred: 1 });
                assert.deepStrictEqual(Object.keys(schema.properties || {}), ["inferred"]);
            }),
            { numRuns: 20 }
        );
    });

    it("a malformed string schema throws and is reported, rather than rendering an empty form", () => {
        fc.assert(
            fc.property(fc.constantFrom("{", "{not json}", "[1,", "undefined"), (broken) => {
                const { entries } = withLogCapture(() => {
                    assert.throws(() => SchemaNormalizer.normalize(broken), /Failed to parse schema string/);
                    return undefined;
                });
                assert.ok(reported(entries, "Failed to parse schema string"), "the parse failure was silent");
            }),
            { numRuns: 20 }
        );
    });

    it("a root $ref is resolved, and sibling keys on the root override the definition", () => {
        fc.assert(
            fc.property(fc.constantFrom("Target", "Other"), fc.option(fc.constantFrom("Local"), { nil: undefined }), (name, title) => {
                const document: JsonRecord = {
                    $ref: `#/$defs/${name}`,
                    ...(title ? { title } : {}),
                    $defs: {
                        [name]: { type: "object", title: "FromDefinition", properties: { a: { type: "string" } } }
                    }
                };
                const schema = SchemaNormalizer.normalize(document);
                assert.deepStrictEqual(Object.keys(schema.properties || {}), ["a"]);
                assert.strictEqual(schema.title, title ?? "FromDefinition");
            }),
            { numRuns: 100 }
        );
    });

    it("a root allOf is intersected before the root is normalized", () => {
        const schema = SchemaNormalizer.normalize({
            allOf: [
                { type: "object", properties: { a: { type: "string", maxLength: 9 } } },
                { type: "object", properties: { a: { type: "string", maxLength: 3 }, b: { type: "integer" } } }
            ]
        });
        assert.deepStrictEqual(Object.keys(schema.properties || {}).sort(), ["a", "b"]);
        assert.strictEqual(schema.properties?.a.maxLength, 3, "the root allOf did not tighten");
    });

    it("a union type array resolves to its non-null member at the root", () => {
        fc.assert(
            fc.property(fc.constantFrom<unknown>(["array", "null"], ["null", "array"], "array"), (type) => {
                const schema = SchemaNormalizer.normalize({ type, items: { type: "string" } });
                assert.strictEqual(schema.type, "array");
                assert.strictEqual(schema.items?.type, "string");
            }),
            { numRuns: 50 }
        );
    });

    it("a scalar root is published as one named field instead of a blank form", () => {
        fc.assert(
            fc.property(fc.constantFrom("string", "integer", "boolean"), fc.option(fc.constantFrom("Token"), { nil: undefined }), (type, title) => {
                const schema = SchemaNormalizer.normalize({ type, maxLength: 5, ...(title ? { title } : {}) });
                const key = title ?? "value";
                assert.deepStrictEqual(Object.keys(schema.properties || {}), [key]);
                assert.strictEqual(schema.properties?.[key].type, type);
                assert.strictEqual(schema.properties?.[key].maxLength, 5);
            }),
            { numRuns: 100 }
        );
    });

    it("an input that is not a schema at all falls back to inferring from the data", () => {
        fc.assert(
            fc.property(fc.constantFrom<unknown>(null, undefined, 42, true, [1, 2]), (nonSchema) => {
                const schema = SchemaNormalizer.normalize(nonSchema, { fromData: "x" });
                assert.deepStrictEqual(Object.keys(schema.properties || {}), ["fromData"]);
            }),
            { numRuns: 50 }
        );
    });
});

describe("SchemaNormalizer — required propagation", () => {
    it("marks exactly the keys listed in the parent 'required' array", () => {
        fc.assert(
            fc.property(rootSchemaArb(1), (root) => {
                const normalized: ISchema = SchemaNormalizer.normalize(root);
                const required = Array.isArray(root.required) ? (root.required as string[]) : [];
                for (const [key, meta] of Object.entries(normalized.properties || {})) {
                    assert.strictEqual(
                        meta.required === true,
                        required.includes(key),
                        `'${key}' required flag disagrees with the parent required array`
                    );
                }
            })
        );
    });
});
