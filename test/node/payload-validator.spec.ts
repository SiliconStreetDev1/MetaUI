/**
 * @file payload-validator.spec.ts
 * @description Properties of `PayloadValidator`, the headless recursive validator the host runs
 * over a whole payload.
 *
 * `mergeResolvedDefinition` carries an audit fix with a long comment explaining it: because
 * `SchemaNormalizer` emits every JSON Schema keyword as an own property, an absent `maxLength` is
 * present with the value `undefined`, and a plain `{ ...resolved, ...local }` used to overwrite
 * every constraint of a referenced definition with `undefined` — silently disabling validation for
 * the whole subtree. That is precisely the shape of bug a property catches and an example misses,
 * so the first group below states it as one.
 */

import * as assert from "assert";
import { fc, reported, withLogCapture } from "./fc-config";
import { admits, conformingValueArb, primitiveSchemaArb } from "./arbitraries";
import { PayloadValidator } from "../../src/nz/co/siliconst/ui5/metaui/core/PayloadValidator";
import { SchemaNormalizer } from "../../src/nz/co/siliconst/ui5/metaui/core/SchemaNormalizer";
import { LayoutElementWalker } from "../../src/nz/co/siliconst/ui5/metaui/layouts/LayoutElementWalker";
import { Engine } from "../../src/nz/co/siliconst/ui5/metaui/core/Engine";
import { MAX_SCHEMA_DEPTH } from "../../src/nz/co/siliconst/ui5/metaui/constants/MetaUIConstants";
import { ILayoutElement, IPropertyMetadata, ISchema } from "../../src/nz/co/siliconst/ui5/metaui/interfaces/ISchema";

/** Values of the declared type that MetaUI does not treat as empty, so validators actually run. */
function enforceableValueArb(leaf: Record<string, unknown>): fc.Arbitrary<unknown> {
    if (leaf.type === "integer") return fc.integer({ min: -80, max: 80 });
    if (leaf.type === "number") return fc.integer({ min: -160, max: 160 }).map((n) => n / 2);
    if (leaf.type === "boolean") return fc.boolean();
    return fc.string({ minLength: 1, maxLength: 10 }).filter((s) => s.trim() !== "");
}

describe("PayloadValidator — $ref resolution keeps the definition's constraints", () => {
    it("a bare $ref node enforces everything the definition declares", () => {
        fc.assert(
            fc.property(
                primitiveSchemaArb
                    .filter((leaf) => leaf.format === undefined && leaf.enum === undefined)
                    .chain((leaf) => fc.tuple(fc.constant(leaf), enforceableValueArb(leaf))),
                ([leaf, value]) => {
                    const document = {
                        type: "object",
                        properties: { field: { $ref: "#/$defs/Target" } },
                        $defs: { Target: leaf }
                    };
                    const schema: ISchema = SchemaNormalizer.normalize(document);
                    const resolve = (ref: string): ISchema | null =>
                        schema.definitions?.[ref.split("/").pop() || ""] || null;
                    const result = PayloadValidator.validateTree(
                        { type: "object", properties: schema.properties },
                        { field: value },
                        resolve
                    );
                    assert.strictEqual(
                        result.isValid,
                        admits(leaf, value),
                        `a $ref field ${result.isValid ? "accepted" : "rejected"} ` +
                            `${JSON.stringify(value)} against ${JSON.stringify(leaf)}`
                    );
                }
            )
        );
    });

    it("a sibling override on the $ref node wins, but absent keywords do not blank the definition", () => {
        // The definition is a string: `mergeResolvedDefinition` takes the definition's `type`, and since
        // the structural check landed, an object-typed definition carrying `maxLength` would (correctly)
        // reject a string value before `maxLength` was ever reached.
        const definition: ISchema = { type: "string", title: "D", maxLength: 3 } as unknown as ISchema;
        const local: IPropertyMetadata = {
            type: "string",
            $ref: "#/$defs/D",
            maxLength: undefined,
            minLength: 2
        };
        const resolve = (): ISchema => definition;
        // maxLength comes from the definition (the local node has it as `undefined`), minLength
        // from the local node. A value of length 1 violates minLength; length 4 violates maxLength.
        assert.strictEqual(PayloadValidator.validateTree(local, "abc", resolve).isValid, true);
        assert.strictEqual(PayloadValidator.validateTree(local, "a", resolve).isValid, false);
        assert.strictEqual(
            PayloadValidator.validateTree(local, "abcd", resolve).isValid,
            false,
            "the definition's maxLength was blanked by the local node's undefined"
        );
    });

    it("a required list on the definition applies to the properties of the referencing node", () => {
        const definition: ISchema = {
            type: "object",
            required: ["needed"],
            properties: { needed: { type: "string" } }
        };
        const resolve = (): ISchema => definition;
        const node: IPropertyMetadata = { type: "object", $ref: "#/$defs/D" };
        assert.strictEqual(PayloadValidator.validateTree(node, { needed: "x" }, resolve).isValid, true);
        assert.strictEqual(PayloadValidator.validateTree(node, {}, resolve).isValid, false);
    });

    it("an unresolvable $ref leaves the node's own constraints in force", () => {
        const node: IPropertyMetadata = { type: "string", $ref: "#/$defs/Missing", maxLength: 2 };
        assert.strictEqual(PayloadValidator.validateTree(node, "ab", () => null).isValid, true);
        assert.strictEqual(PayloadValidator.validateTree(node, "abc", () => null).isValid, false);
    });
});

describe("PayloadValidator — recursion", () => {
    it("a violation at any nesting depth is reported, labelled by its path", () => {
        fc.assert(
            fc.property(fc.integer({ min: 1, max: 8 }), fc.boolean(), (depth, violate) => {
                let meta: IPropertyMetadata = { type: "string", maxLength: 2 };
                let value: unknown = violate ? "toolong" : "ok";
                for (let i = 0; i < depth; i++) {
                    meta = { type: "object", properties: { child: meta } };
                    value = { child: value };
                }
                const result = PayloadValidator.validateTree(meta, value);
                assert.strictEqual(
                    result.isValid,
                    !violate,
                    `a leaf violation ${depth} levels down was not reported`
                );
                if (violate) {
                    // The label falls back to the property key when the child declares no ui.label.
                    assert.ok(
                        (result.errorMessage || "").includes("child"),
                        `the error does not name the offending field: ${result.errorMessage}`
                    );
                }
            })
        );
    });

    it("a value whose shape contradicts the schema is rejected rather than skipped (F14)", () => {
        const objectMeta: IPropertyMetadata = {
            type: "object",
            properties: { inner: { type: "string", maxLength: 1 } }
        };
        assert.strictEqual(PayloadValidator.validateTree(objectMeta, "a plain string").isValid, false);
        assert.strictEqual(PayloadValidator.validateTree(objectMeta, 42).isValid, false);

        const arrayMeta: IPropertyMetadata = { type: "array", items: { type: "string", maxLength: 1 } };
        assert.strictEqual(PayloadValidator.validateTree(arrayMeta, "not an array").isValid, false);

        const stringMeta: IPropertyMetadata = { type: "string", maxLength: 1 };
        assert.strictEqual(PayloadValidator.validateTree(stringMeta, { an: "object" }).isValid, false);
        assert.strictEqual(PayloadValidator.validateTree(stringMeta, ["an", "array"]).isValid, false);
    });

    it("a constraint-free node tolerates any shape, so inference is never invalid against its own data", () => {
        // The contract is "no declared constraint is skipped", not "the value matches the declared
        // type". A node that asserts nothing loses no enforcement when the shape disagrees, and
        // `DataInferenceBuilder` types a column from its first row — see the inference round-trip
        // properties, which this clause is what keeps green.
        const bareObject: IPropertyMetadata = { type: "object", properties: {} };
        assert.strictEqual(PayloadValidator.validateTree(bareObject, "a plain string").isValid, true);

        const structuralOnly: IPropertyMetadata = {
            type: "object",
            properties: { alpha: { type: "string" } }
        };
        assert.strictEqual(PayloadValidator.validateTree(structuralOnly, "a plain string").isValid, true);

        const bareString: IPropertyMetadata = { type: "string" };
        assert.strictEqual(PayloadValidator.validateTree(bareString, { an: "object" }).isValid, true);
    });

    it("a shape mismatch is rejected exactly when the subtree declares something to enforce", () => {
        fc.assert(
            fc.property(
                fc.boolean(),
                fc.constantFrom<unknown>("a plain string", 42, true),
                (constrained, scalar) => {
                    const leaf: IPropertyMetadata = constrained
                        ? { type: "string", maxLength: 1 }
                        : { type: "string" };
                    const meta: IPropertyMetadata = { type: "object", properties: { inner: leaf } };
                    assert.strictEqual(
                        PayloadValidator.validateTree(meta, scalar).isValid,
                        !constrained,
                        `a scalar against an object schema whose leaf ${constrained ? "does" : "does not"} ` +
                            `constrain was handled wrongly`
                    );
                }
            ),
            { numRuns: 60 }
        );
    });

    it("every entry of a dictionary is validated against additionalProperties", () => {
        fc.assert(
            fc.property(
                fc.dictionary(fc.constantFrom("a", "b", "c"), fc.string({ maxLength: 6 }), {
                    minKeys: 1,
                    maxKeys: 3
                }),
                (entries) => {
                    const meta: IPropertyMetadata = {
                        type: "object",
                        additionalProperties: { type: "string", maxLength: 3 }
                    };
                    const anyTooLong = Object.values(entries).some((entry) => entry.length > 3);
                    assert.strictEqual(PayloadValidator.validateTree(meta, entries).isValid, !anyTooLong);
                }
            )
        );
    });

    it("a declared property is not re-validated as a dictionary entry", () => {
        const meta: IPropertyMetadata = {
            type: "object",
            properties: { known: { type: "string" } },
            additionalProperties: { type: "integer" }
        };
        assert.strictEqual(PayloadValidator.validateTree(meta, { known: "text", extra: 7 }).isValid, true);
        assert.strictEqual(PayloadValidator.validateTree(meta, { known: "text", extra: "x" }).isValid, true);
    });

    it("every array item is validated and the failing row is named", () => {
        fc.assert(
            fc.property(fc.array(fc.string({ maxLength: 5 }), { minLength: 1, maxLength: 5 }), (items) => {
                const meta: IPropertyMetadata = { type: "array", items: { type: "string", maxLength: 3 } };
                const firstBad = items.findIndex((item) => item.length > 3);
                const result = PayloadValidator.validateTree(meta, items);
                assert.strictEqual(result.isValid, firstBad === -1);
                if (firstBad !== -1) {
                    assert.ok(
                        (result.errorMessage || "").includes(`Row ${firstBad + 1}`),
                        `the wrong row was named: ${result.errorMessage}`
                    );
                }
            })
        );
    });

    it("a hidden field is not validated, at any level", () => {
        const hidden: IPropertyMetadata = { type: "string", maxLength: 1, ui: { visible: false } };
        assert.strictEqual(PayloadValidator.validateTree(hidden, "far too long").isValid, true);
        const parent: IPropertyMetadata = { type: "object", properties: { child: hidden } };
        assert.strictEqual(PayloadValidator.validateTree(parent, { child: "far too long" }).isValid, true);
    });

    it("null and undefined short-circuit the recursion rather than crashing it", () => {
        fc.assert(
            fc.property(fc.constantFrom<unknown>(null, undefined), (value) => {
                const meta: IPropertyMetadata = {
                    type: "object",
                    properties: { a: { type: "string", maxLength: 1 } }
                };
                assert.strictEqual(PayloadValidator.validateTree(meta, value).isValid, true);
            }),
            { numRuns: 20 }
        );
    });

    it("recursion stops at the documented depth cap instead of overflowing the stack", () => {
        let meta: IPropertyMetadata = { type: "string", maxLength: 1 };
        let value: unknown = "too long";
        for (let i = 0; i < 40; i++) {
            meta = { type: "object", properties: { child: meta } };
            value = { child: value };
        }
        // Beyond depth 16 the validator returns valid by contract; the point of the property is
        // that it terminates and returns a verdict rather than throwing.
        const result = PayloadValidator.validateTree(meta, value);
        assert.strictEqual(typeof result.isValid, "boolean");
    });

    it("a conforming payload is accepted through the whole tree", () => {
        fc.assert(
            fc.property(
                primitiveSchemaArb
                    .filter((leaf) => leaf.format === undefined)
                    .chain((leaf) =>
                        fc.tuple(fc.constant(leaf), fc.array(conformingValueArb(leaf), { minLength: 1, maxLength: 4 }))
                    ),
                ([leaf, values]) => {
                    const schema: ISchema = SchemaNormalizer.normalize({
                        type: "object",
                        properties: { rows: { type: "array", items: leaf } }
                    });
                    const result = PayloadValidator.validateTree(
                        { type: "object", properties: schema.properties },
                        { rows: values }
                    );
                    assert.ok(result.isValid, `a conforming array was rejected: ${result.errorMessage}`);
                }
            )
        );
    });
});

describe("PayloadValidator — the 'not' keyword is enforced", () => {
    /** Normalizes a one-property document and returns that property's metadata. */
    function normalizeField(raw: Record<string, unknown>): IPropertyMetadata {
        const schema: ISchema = SchemaNormalizer.normalize({ type: "object", properties: { field: raw } });
        return (schema.properties || {}).field;
    }

    it("a value matching the 'not' sub-schema is rejected and anything else is accepted", () => {
        fc.assert(
            fc.property(fc.string({ maxLength: 8 }).filter((s) => s.trim() !== ""), (candidate) => {
                const meta = normalizeField({ type: "string", not: { const: "FORBIDDEN" } });
                assert.strictEqual(
                    PayloadValidator.validateTree(meta, candidate).isValid,
                    candidate !== "FORBIDDEN",
                    `'not: { const: "FORBIDDEN" }' gave the wrong verdict for ${JSON.stringify(candidate)}`
                );
            })
        );
    });

    it("'not' inverts every constraint the pipeline can evaluate", () => {
        const cases: ReadonlyArray<[Record<string, unknown>, unknown, boolean]> = [
            [{ type: "string", not: { maxLength: 3 } }, "ab", false],
            [{ type: "string", not: { maxLength: 3 } }, "abcdef", true],
            [{ type: "string", not: { pattern: "^A" } }, "Alpha", false],
            [{ type: "string", not: { pattern: "^A" } }, "beta", true],
            [{ type: "string", not: { enum: ["x", "y"] } }, "x", false],
            [{ type: "string", not: { enum: ["x", "y"] } }, "z", true],
            [{ type: "integer", not: { multipleOf: 5 } }, 10, false],
            [{ type: "integer", not: { multipleOf: 5 } }, 11, true],
            [{ type: "integer", not: { minimum: 0, maximum: 9 } }, 5, false],
            [{ type: "integer", not: { minimum: 0, maximum: 9 } }, 50, true]
        ];
        for (const [raw, value, expected] of cases) {
            assert.strictEqual(
                PayloadValidator.validateTree(normalizeField(raw), value).isValid,
                expected,
                `${JSON.stringify(raw.not)} against ${JSON.stringify(value)}`
            );
        }
    });

    it("a 'not' nested inside a 'not' cancels out", () => {
        const meta = normalizeField({ type: "string", not: { not: { const: "KEEP" } } });
        assert.strictEqual(PayloadValidator.validateTree(meta, "KEEP").isValid, true);
        assert.strictEqual(PayloadValidator.validateTree(meta, "other").isValid, false);
    });

    it("'not' is enforced on nested properties and on array items", () => {
        const nested: ISchema = SchemaNormalizer.normalize({
            type: "object",
            properties: {
                child: { type: "object", properties: { code: { type: "string", not: { const: "BAD" } } } },
                rows: { type: "array", items: { type: "string", not: { const: "BAD" } } }
            }
        });
        const rootMeta: IPropertyMetadata = { type: "object", properties: nested.properties };
        assert.strictEqual(
            PayloadValidator.validateTree(rootMeta, { child: { code: "BAD" }, rows: [] }).isValid,
            false
        );
        assert.strictEqual(
            PayloadValidator.validateTree(rootMeta, { child: { code: "ok" }, rows: ["ok", "BAD"] }).isValid,
            false
        );
        assert.strictEqual(
            PayloadValidator.validateTree(rootMeta, { child: { code: "ok" }, rows: ["ok"] }).isValid,
            true
        );
    });

    it("a 'not' the engine cannot evaluate accepts the value instead of rejecting everything", () => {
        const meta = normalizeField({ type: "string", not: { title: "nothing testable" } });
        assert.strictEqual(PayloadValidator.isEvaluableNot(meta.not), false);
        assert.strictEqual(PayloadValidator.validateTree(meta, "anything").isValid, true);
    });
});

describe("PayloadValidator — array payload walk", () => {
    it("every cell of a conforming table reports valid", () => {
        fc.assert(
            fc.property(
                fc.array(
                    fc.record({ name: fc.string({ minLength: 1, maxLength: 3 }), qty: fc.integer({ min: 0, max: 9 }) }),
                    { minLength: 1, maxLength: 5 }
                ),
                (rows) => {
                    const schema: ISchema = SchemaNormalizer.normalize({
                        type: "array",
                        items: {
                            type: "object",
                            properties: { name: { type: "string", maxLength: 3 }, qty: { type: "integer" } }
                        }
                    });
                    const results = PayloadValidator.validatePayloadArrays(schema, rows, "", () => undefined);
                    const failures = results.filter((entry) => !entry.isValid);
                    assert.deepStrictEqual(failures.map((entry) => entry.fieldKey), []);
                    assert.ok(results.length > 0, "the table walk produced no cell results at all");
                }
            )
        );
    });

    it("an over-long cell is reported against its own row and column path", () => {
        const schema: ISchema = SchemaNormalizer.normalize({
            type: "array",
            items: { type: "object", properties: { name: { type: "string", maxLength: 2 } } }
        });
        const results = PayloadValidator.validatePayloadArrays(
            schema,
            [{ name: "ok" }, { name: "far too long" }],
            "",
            () => undefined
        );
        const failures = results.filter((entry) => !entry.isValid);
        assert.strictEqual(failures.length, 1);
        assert.strictEqual(failures[0].fieldKey, "1/name");
    });

    it("a row missing a required column is reported", () => {
        const schema: ISchema = SchemaNormalizer.normalize({
            type: "array",
            items: { type: "object", required: ["name"], properties: { name: { type: "string" } } }
        });
        const results = PayloadValidator.validatePayloadArrays(schema, [{}], "", () => undefined);
        assert.ok(results.some((entry) => !entry.isValid && entry.fieldKey === "0/name"));
    });

    it("a path already owned by a live plugin is skipped", () => {
        const schema: ISchema = SchemaNormalizer.normalize({
            type: "array",
            items: { type: "object", properties: { name: { type: "string", maxLength: 1 } } }
        });
        const results = PayloadValidator.validatePayloadArrays(
            schema,
            [{ name: "too long" }],
            "rows",
            (path) => (path === "rows" ? ({} as never) : undefined)
        );
        assert.deepStrictEqual(results, []);
    });
});

describe("Stage 1 — cycle detection vs diamond preservation (PayloadValidator & LayoutElementWalker)", () => {
    it("PayloadValidator.validateTree cuts an in-memory object cycle at its first repetition and logs a cycle warning", () => {
        const node: IPropertyMetadata = {
            type: "object",
            properties: {
                name: { type: "string", maxLength: 3 }
            }
        };
        node.properties!.self = node;

        const cyclicVal: Record<string, unknown> = { name: "ok" };
        cyclicVal.self = cyclicVal;

        const { value: result, entries } = withLogCapture(() => PayloadValidator.validateTree(node, cyclicVal));
        assert.strictEqual(result.isValid, true);
        assert.strictEqual(
            reported(entries, "Circular"),
            true,
            `Expected a cycle warning, got logs: ${entries.map((e) => `${e.message} ${e.details}`).join(" | ")}`
        );
        assert.strictEqual(
            reported(entries, "MAX_SCHEMA_DEPTH"),
            false,
            "Cycle was expanded 30 levels to MAX_SCHEMA_DEPTH instead of being cut at its first repetition"
        );
    });

    it("PayloadValidator.validateTree cuts a $ref cycle (A -> B -> A) at its first repetition and logs a cycle warning", () => {
        const definitions: Record<string, ISchema> = {
            A: {
                type: "object",
                properties: {
                    b: { type: "object", $ref: "#/$defs/B" }
                }
            },
            B: {
                type: "object",
                properties: {
                    a: { type: "object", $ref: "#/$defs/A" }
                }
            }
        };
        let resolveCount = 0;
        const resolve = (ref: string): ISchema | null => {
            resolveCount++;
            const key = ref.split("/").pop() || "";
            return definitions[key] || null;
        };
        const rootMeta: IPropertyMetadata = { type: "object", $ref: "#/$defs/A" };
        const cyclicPayload: Record<string, unknown> = {};
        cyclicPayload.b = { a: cyclicPayload };

        const { value: result, entries } = withLogCapture(() =>
            PayloadValidator.validateTree(rootMeta, cyclicPayload, resolve)
        );
        assert.strictEqual(result.isValid, true);
        assert.ok(
            resolveCount <= 3,
            `Expected $ref cycle to be cut at its first repetition (<=3 resolves), but resolved ${resolveCount} times`
        );
        assert.strictEqual(
            reported(entries, "Circular"),
            true,
            `Expected a cycle warning, got logs: ${entries.map((e) => `${e.message} ${e.details}`).join(" | ")}`
        );
        assert.strictEqual(
            reported(entries, "MAX_SCHEMA_DEPTH"),
            false,
            "$ref cycle was expanded 30 levels to MAX_SCHEMA_DEPTH instead of being cut at its first repetition"
        );
    });

    it("PayloadValidator.validateTree preserves diamond $ref and diamond in-memory nodes across sibling branches", () => {
        const definitions: Record<string, ISchema> = {
            Address: {
                type: "object",
                properties: {
                    zip: { type: "string", maxLength: 3 }
                }
            }
        };
        const resolve = (ref: string): ISchema | null => definitions[ref.split("/").pop() || ""] || null;
        const diamondRefRoot: IPropertyMetadata = {
            type: "object",
            properties: {
                billing: { type: "object", $ref: "#/$defs/Address" },
                shipping: { type: "object", $ref: "#/$defs/Address" }
            }
        };

        const { value: refRes, entries: refEntries } = withLogCapture(() =>
            PayloadValidator.validateTree(
                diamondRefRoot,
                { billing: { zip: "123" }, shipping: { zip: "TOOLONG" } },
                resolve
            )
        );
        assert.strictEqual(refRes.isValid, false, "Second sibling branch of a diamond $ref was skipped as a cycle");
        assert.strictEqual(reported(refEntries, "Circular"), false, "Diamond $ref was misclassified as a cycle");

        const sharedNode: IPropertyMetadata = {
            type: "object",
            properties: {
                zip: { type: "string", maxLength: 3 }
            }
        };
        const diamondObjRoot: IPropertyMetadata = {
            type: "object",
            properties: {
                billing: sharedNode,
                shipping: sharedNode
            }
        };
        const { value: objRes, entries: objEntries } = withLogCapture(() =>
            PayloadValidator.validateTree(diamondObjRoot, { billing: { zip: "123" }, shipping: { zip: "TOOLONG" } })
        );
        assert.strictEqual(objRes.isValid, false, "Second sibling branch of a diamond node was skipped as a cycle");
        assert.strictEqual(reported(objEntries, "Circular"), false, "Diamond node was misclassified as a cycle");
    });

    it("LayoutElementWalker.walk cuts an in-memory layout cycle and a schema cycle at their first repetition", () => {
        const schema: ISchema = {
            type: "object",
            properties: {
                name: { type: "string" }
            }
        };
        const groupA: ILayoutElement = {
            type: "Group",
            label: "Group A",
            elements: [{ type: "Control", scope: "#/properties/name" }]
        };
        const groupB: ILayoutElement = {
            type: "Group",
            label: "Group B",
            elements: [groupA]
        };
        groupA.elements!.push(groupB);

        const dummyEngine = {
            hasPartialRenderingErrors: false,
            resolveDefinition: () => null
        } as unknown as Engine;

        let scalarCalls = 0;
        const { value: count, entries: layoutEntries } = withLogCapture(() =>
            LayoutElementWalker.walk(
                [groupA],
                schema,
                dummyEngine,
                {
                    onScalarField: () => {
                        scalarCalls++;
                    }
                },
                "FormLayout"
            )
        );
        assert.strictEqual(count, 1, `Expected 1 control before cycle cut, got ${count}`);
        assert.strictEqual(scalarCalls, 1, `Expected 1 scalar field callback, got ${scalarCalls}`);
        assert.strictEqual(
            reported(layoutEntries, "Circular"),
            true,
            `Expected a cycle warning from LayoutElementWalker, got: ${layoutEntries.map((e) => `${e.message} ${e.details}`).join(" | ")}`
        );
        assert.strictEqual(
            reported(layoutEntries, "Max layout nesting depth"),
            false,
            "Layout cycle was expanded 30 levels to MAX_LAYOUT_DEPTH instead of being cut at its first repetition"
        );

        // In-memory schema property cycle (`node.properties.self = node`)
        const cyclicNode: IPropertyMetadata = {
            type: "object",
            properties: {
                title: { type: "string" }
            }
        };
        cyclicNode.properties!.self = cyclicNode;
        const cyclicSchema: ISchema = {
            type: "object",
            properties: { node: cyclicNode }
        };
        const { value: selfCount, entries: selfEntries } = withLogCapture(() =>
            LayoutElementWalker.walk(
                [{ type: "Control", scope: "#/properties/node/properties/self" }],
                cyclicSchema,
                dummyEngine,
                { onScalarField: () => undefined },
                "FormLayout"
            )
        );
        assert.strictEqual(selfCount, 0, "Cyclic schema scope should be rejected by LayoutElementWalker");
        assert.strictEqual(
            reported(selfEntries, "Circular"),
            true,
            `Expected Circular schema warning, got: ${selfEntries.map((e) => `${e.message} ${e.details}`).join(" | ")}`
        );

        // $ref cycle (A -> B -> A) in schema scope
        const refDefs: Record<string, ISchema> = {
            A: {
                type: "object",
                properties: {
                    b: { type: "object", $ref: "#/definitions/B" }
                }
            },
            B: {
                type: "object",
                properties: {
                    a: { type: "object", $ref: "#/definitions/A" }
                }
            }
        };
        const refSchema: ISchema = {
            type: "object",
            definitions: refDefs,
            properties: {
                a: { type: "object", $ref: "#/definitions/A" }
            }
        };
        const refEngine = {
            hasPartialRenderingErrors: false,
            resolveDefinition: (ref: string) => refDefs[ref.split("/").pop() || ""] || null
        } as unknown as Engine;
        const { value: refCount, entries: refCycleEntries } = withLogCapture(() =>
            LayoutElementWalker.walk(
                [{ type: "Control", scope: "#/properties/a/properties/b/properties/a" }],
                refSchema,
                refEngine,
                { onScalarField: () => undefined },
                "FormLayout"
            )
        );
        assert.strictEqual(refCount, 0, "Cyclic $ref scope should be rejected by LayoutElementWalker");
        assert.strictEqual(
            reported(refCycleEntries, "Circular"),
            true,
            `Expected Circular $ref warning, got: ${refCycleEntries.map((e) => `${e.message} ${e.details}`).join(" | ")}`
        );
    });

    it("LayoutElementWalker.walk preserves diamond $ref and diamond layout elements across sibling branches", () => {
        const refDefs: Record<string, ISchema> = {
            Address: {
                type: "object",
                properties: {
                    street: { type: "string" }
                }
            }
        };
        const diamondSchema: ISchema = {
            type: "object",
            definitions: refDefs,
            properties: {
                billing: { type: "object", $ref: "#/definitions/Address" },
                shipping: { type: "object", $ref: "#/definitions/Address" }
            }
        };
        const engine = {
            hasPartialRenderingErrors: false,
            resolveDefinition: (ref: string) => refDefs[ref.split("/").pop() || ""] || null
        } as unknown as Engine;
        const sharedLeafGroup: ILayoutElement = {
            type: "Group",
            label: "Shared",
            elements: [{ type: "Control", scope: "#/properties/billing/properties/street" }]
        };
        const layout: ILayoutElement[] = [
            { type: "Group", label: "First", elements: [sharedLeafGroup] },
            { type: "Group", label: "Second", elements: [sharedLeafGroup] },
            { type: "Control", scope: "#/properties/shipping/properties/street" }
        ];
        const visitedPaths: string[] = [];
        const { value: count, entries } = withLogCapture(() =>
            LayoutElementWalker.walk(
                layout,
                diamondSchema,
                engine,
                {
                    onScalarField: (_el, path) => {
                        visitedPaths.push(path);
                    }
                },
                "FormLayout"
            )
        );
        assert.strictEqual(count, 3, "All 3 controls across diamond layout and diamond $ref must resolve");
        assert.deepStrictEqual(visitedPaths, ["billing/street", "billing/street", "shipping/street"]);
        assert.strictEqual(reported(entries, "Circular"), false, "Diamond was misclassified as a cycle");
    });
});

describe("Stage C — PayloadValidator behavioural coverage of array payload walk and structural constraints", () => {
    it("enforces isDynamicallyRequired, ui.label and dictionary entryKey error prefixes, and mergeResolvedDefinition fallbacks", () => {
        // 1. isDynamicallyRequired override on an otherwise optional field
        const optField: IPropertyMetadata = { type: "string" };
        assert.strictEqual(PayloadValidator.validateTree(optField, "").isValid, true);
        assert.strictEqual(
            PayloadValidator.validateTree(optField, "", undefined, 0, true).isValid,
            false,
            "isDynamicallyRequired=true must reject an empty string"
        );

        // 2. ui.label vs propKey in object child error message, and entryKey in dictionary error message
        const labelledParent: IPropertyMetadata = {
            type: "object",
            properties: {
                code: { type: "string", maxLength: 2, ui: { label: "Custom Code Label" } }
            },
            additionalProperties: { type: "string", maxLength: 2 }
        };
        const labelErr = PayloadValidator.validateTree(labelledParent, { code: "TOOLONG" });
        assert.strictEqual(labelErr.isValid, false);
        assert.ok((labelErr.errorMessage || "").includes("Custom Code Label"));

        const dictErr = PayloadValidator.validateTree(labelledParent, { code: "ok", dynKey99: "TOOLONG" });
        assert.strictEqual(dictErr.isValid, false);
        assert.ok((dictErr.errorMessage || "").includes("dynKey99"));

        // 3. mergeResolvedDefinition fallbacks when resolved omits type/properties/items
        const localWithProps: IPropertyMetadata = {
            $ref: "#/definitions/EmptyDef",
            properties: { inner: { type: "string", maxLength: 2 } }
        };
        const resFromLocalProps = PayloadValidator.validateTree(
            localWithProps,
            { inner: "TOOLONG" },
            () => ({}) as ISchema
        );
        assert.strictEqual(resFromLocalProps.isValid, false);

        const localWithItems: IPropertyMetadata = {
            type: "array",
            $ref: "#/definitions/EmptyArrDef",
            items: { type: "string", maxLength: 2 }
        };
        const resFromLocalItems = PayloadValidator.validateTree(
            localWithItems,
            ["TOOLONG"],
            () => ({ type: undefined as unknown as "array" }) as ISchema
        );
        assert.strictEqual(resFromLocalItems.isValid, false);

        // 4. $ref resolving to an already-active object node in activeNodes
        const rootDef: ISchema = {
            type: "object",
            properties: {
                backRef: { type: "object", $ref: "#/definitions/RootTarget" }
            }
        };
        const { value: cycRefRes, entries: cycRefLogs } = withLogCapture(() =>
            PayloadValidator.validateTree(
                rootDef as unknown as IPropertyMetadata,
                { backRef: {} },
                () => rootDef
            )
        );
        assert.strictEqual(cycRefRes.isValid, true);
        assert.strictEqual(reported(cycRefLogs, "Circular"), true);
    });

    it("evaluates every container constraint keyword and Date/depth edge cases in matchesStructuralType", () => {
        // Date instance is treated as scalar even when maxLength is present
        assert.strictEqual(
            PayloadValidator.matchesStructuralType({ type: "string", maxLength: 1 }, new Date()),
            true
        );

        // Individual container constraint keywords must each reject a scalar value
        const containerCases: ReadonlyArray<[IPropertyMetadata, boolean]> = [
            [{ type: "object", $ref: "#/definitions/SomeDef" }, false],
            [{ type: "object", required: true }, false],
            [{ type: "object", required: ["a"] as unknown as boolean }, false],
            [{ type: "object", required: [] as unknown as boolean }, true],
            [{ type: "object", minProperties: 1 }, false],
            [{ type: "object", maxProperties: 2 }, false],
            [{ type: "array", minItems: 1 }, false],
            [{ type: "array", maxItems: 5 }, false],
            [{ type: "array", uniqueItems: true }, false],
            [{ type: "array", uniqueItems: false }, true]
        ];
        for (const [meta, expected] of containerCases) {
            assert.strictEqual(
                PayloadValidator.matchesStructuralType(meta, "scalar-value"),
                expected,
                `Expected matchesStructuralType(${JSON.stringify(meta)}, "scalar-value") to be ${expected}`
            );
        }

        // Every scalar assertion keyword must cause matchesStructuralType to reject a container value
        const scalarKeywords: ReadonlyArray<[keyof IPropertyMetadata, unknown]> = [
            ["const", "X"],
            ["enum", ["A"]],
            ["pattern", "^A"],
            ["format", "email"],
            ["maxLength", 3],
            ["minLength", 1],
            ["minimum", 0],
            ["maximum", 10],
            ["exclusiveMinimum", 0],
            ["exclusiveMaximum", 10],
            ["multipleOf", 2]
        ];
        for (const [kw, val] of scalarKeywords) {
            assert.strictEqual(
                PayloadValidator.matchesStructuralType({ type: "string", [kw]: val }, { an: "object" }),
                false,
                `Scalar keyword '${kw}' was bypassed when given an object value`
            );
        }

        // Every evaluable 'not' keyword must be recognised by isEvaluableNot
        const evaluableNotKeywords: ReadonlyArray<[keyof IPropertyMetadata, unknown]> = [
            ...scalarKeywords,
            ["maxItems", 2],
            ["minItems", 1],
            ["uniqueItems", true],
            ["maxProperties", 2],
            ["minProperties", 1],
            ["properties", { a: { type: "string" } }],
            ["items", { type: "string" }],
            ["not", { const: "X" }]
        ];
        for (const [kw, val] of evaluableNotKeywords) {
            assert.strictEqual(
                PayloadValidator.isEvaluableNot({ [kw]: val }),
                true,
                `Keyword '${kw}' must be recognised by isEvaluableNot`
            );
        }

        // Depth truncation inside assertsContainerConstraint logs MAX_SCHEMA_DEPTH and returns true
        let deepContainer: IPropertyMetadata = { type: "string", maxLength: 1 };
        for (let i = 0; i <= MAX_SCHEMA_DEPTH + 2; i++) {
            deepContainer = { type: "object", properties: { child: deepContainer } };
        }
        const { value: deepMatch, entries: deepLogs } = withLogCapture(() =>
            PayloadValidator.matchesStructuralType(deepContainer, "scalar-value")
        );
        assert.strictEqual(deepMatch, true);
        assert.strictEqual(reported(deepLogs, "MAX_SCHEMA_DEPTH"), true);
    });

    it("validatePayloadArrays handles early exits, cycles, $ref resolution, and missing required/minItems children", () => {
        const noPlugin = () => undefined;

        // 1. Depth cap exceeded
        const simpleSchema: ISchema = { type: "object", properties: { a: { type: "string" } } };
        const { value: depthErrors, entries: depthLogs } = withLogCapture(() =>
            PayloadValidator.validatePayloadArrays(simpleSchema, { a: "x" }, "root", noPlugin, undefined, undefined, undefined, MAX_SCHEMA_DEPTH + 1)
        );
        assert.deepStrictEqual(depthErrors, []);
        assert.strictEqual(reported(depthLogs, "MAX_SCHEMA_DEPTH"), true);

        // 2. Null / primitive payload, hidden path, invisible schema
        assert.deepStrictEqual(PayloadValidator.validatePayloadArrays(simpleSchema, null, "", noPlugin), []);
        assert.deepStrictEqual(PayloadValidator.validatePayloadArrays(simpleSchema, "primitive", "", noPlugin), []);
        assert.deepStrictEqual(
            PayloadValidator.validatePayloadArrays(
                simpleSchema,
                { a: "x" },
                "hiddenPath",
                noPlugin,
                undefined,
                undefined,
                (p) => p === "hiddenPath"
            ),
            []
        );
        assert.deepStrictEqual(
            PayloadValidator.validatePayloadArrays(
                { type: "object", ui: { visible: false }, properties: { a: { type: "string" } } },
                { a: "x" },
                "",
                noPlugin
            ),
            []
        );

        // 3. In-memory cycle and $ref cycle in validatePayloadArrays
        const cycSchema: ISchema = { type: "object", properties: {} };
        cycSchema.properties!.self = cycSchema as unknown as IPropertyMetadata;
        const cycData: Record<string, unknown> = {};
        cycData.self = cycData;
        const { value: cycErrs, entries: cycLogs } = withLogCapture(() =>
            PayloadValidator.validatePayloadArrays(cycSchema, cycData, "", noPlugin)
        );
        assert.deepStrictEqual(cycErrs, []);
        assert.strictEqual(reported(cycLogs, "Circular"), true);

        // Property-level $ref cycle and activeNodes.has(resolvedProp)
        const refTargetSchema: ISchema = {
            type: "object",
            required: ["reqArr"],
            properties: {
                loopRef: { type: "object", $ref: "#/definitions/LoopDef" },
                rootRef: { type: "object", $ref: "#/definitions/RootSchema" },
                hiddenChild: { type: "array", ui: { visible: false }, minItems: 2, items: { type: "string" } },
                pathHiddenChild: { type: "array", minItems: 2, items: { type: "string" } },
                reqArr: { type: "array", ui: { label: "Required Array" }, items: { type: "string" } },
                optMinItemsArr: { type: "array", minItems: 2, items: { type: "string" } },
                optZeroMinArr: { type: "array", minItems: 0, items: { type: "string" } },
                pluginOwnedArr: { type: "array", required: true, items: { type: "string" } }
            }
        };
        const rootWithRef = {
            type: "object",
            $ref: "#/definitions/LoopDef"
        } as unknown as ISchema;

        const { value: propErrs, entries: propLogs } = withLogCapture(() =>
            PayloadValidator.validatePayloadArrays(
                rootWithRef,
                {
                    loopRef: {},
                    rootRef: {}
                },
                "",
                (p) => (p === "pluginOwnedArr" ? ({} as never) : undefined),
                (ref) => (ref.endsWith("LoopDef") ? refTargetSchema : rootWithRef),
                undefined,
                (p) => p === "pathHiddenChild"
            )
        );
        assert.strictEqual(reported(propLogs, "Circular"), true);
        assert.deepStrictEqual(
            propErrs.map((e) => ({ fieldKey: e.fieldKey, isValid: e.isValid, fieldLabel: e.fieldLabel })),
            [
                { fieldKey: "reqArr", isValid: false, fieldLabel: "Required Array" },
                { fieldKey: "optMinItemsArr", isValid: false, fieldLabel: "optMinItemsArr" }
            ]
        );
    });

    it("validatePayloadArrays validates root { items } wrapper, array constraints, $ref items, dynamic row required, and primitive items", () => {
        const noPlugin = () => undefined;

        // 1. Root array with { items: [...] } wrapper, array-level minItems failure, and $ref object items
        const itemDef: ISchema = {
            type: "object",
            required: ["staticReq"],
            properties: {
                staticReq: { type: "string" },
                dynCol: { type: "string", ui: { label: "Dynamic Column" } },
                hiddenCol: { type: "string", ui: { visible: false }, maxLength: 1 },
                callbackHiddenCol: { type: "string", maxLength: 1 }
            }
        };
        const rootArraySchema: ISchema = {
            type: "array",
            title: "Line Items Title",
            minItems: 2,
            items: { type: "object", $ref: "#/definitions/LineItem" }
        };
        const results = PayloadValidator.validatePayloadArrays(
            rootArraySchema,
            { items: [null] },
            "",
            noPlugin,
            () => itemDef,
            (path) => (path === "items/0/dynCol" ? true : path === "items/0/staticReq" ? false : undefined),
            (path) => path === "items/0/callbackHiddenCol"
        );
        const byKey = new Map(results.map((r) => [r.fieldKey, r]));
        assert.strictEqual(byKey.get("items")?.isValid, false, "minItems: 2 must fail on 1 item");
        assert.strictEqual(byKey.get("items")?.fieldLabel, "Line Items Title");
        assert.strictEqual(
            byKey.get("items/0/staticReq")?.isValid,
            true,
            "getDynamicRowRequired returning false must override static required"
        );
        assert.strictEqual(
            byKey.get("items/0/dynCol")?.isValid,
            false,
            "getDynamicRowRequired returning true must enforce required on empty cell"
        );
        assert.strictEqual(byKey.get("items/0/dynCol")?.fieldLabel, "Dynamic Column");
        assert.strictEqual(byKey.get("items/0/hiddenCol")?.isValid, true);
        assert.strictEqual(byKey.get("items/0/callbackHiddenCol")?.isValid, true);

        // 2. Primitive array items (valid, invalid, and hidden item path)
        const primArraySchema: ISchema = {
            type: "array",
            items: { type: "string", maxLength: 2, ui: { label: "Tag Item" } }
        };
        const primResults = PayloadValidator.validatePayloadArrays(
            primArraySchema,
            ["ok", "TOOLONG", "ALSO_LONG"],
            "tags",
            noPlugin,
            undefined,
            undefined,
            (path) => path === "tags/2"
        );
        assert.deepStrictEqual(
            primResults.map((r) => ({ fieldKey: r.fieldKey, isValid: r.isValid, fieldLabel: r.fieldLabel })),
            [
                { fieldKey: "tags", isValid: true, fieldLabel: undefined },
                { fieldKey: "tags/0", isValid: true, fieldLabel: undefined },
                { fieldKey: "tags/1", isValid: false, fieldLabel: "Tag Item" },
                { fieldKey: "tags/2", isValid: true, fieldLabel: undefined }
            ]
        );
    });
});
