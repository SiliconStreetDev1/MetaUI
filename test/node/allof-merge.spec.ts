/**
 * @file allof-merge.spec.ts
 * @description Properties of `OpenApiConstraintMapper.resolveAllOf` / `deepMergeSchemas`.
 *
 * The governing invariant is intersection: `allOf` composition may only ever *narrow*. Every
 * property below is a different way of catching a merge that widens — the defect class that
 * produced "allOf loosening instead of intersecting" in the forensic audit.
 *
 * Widening is tolerated in exactly one circumstance: when a single schema object provably
 * cannot express the intersection (two branch lists, two patterns with capture groups,
 * contradictory `type`) *and* the engine says so. Rule 2 of AGENTS.md, encoded as a test.
 */

import * as assert from "assert";
import { fc, ILogEntry, reported, withLogCapture } from "./fc-config";
import {
    CAPTURING_PATTERNS,
    JsonRecord,
    SAFE_PATTERNS,
    admits,
    canonical,
    conformingValueArb,
    isPlainObject
} from "./arbitraries";
import { OpenApiConstraintMapper } from "../../src/nz/co/siliconst/ui5/metaui/openapi/parsers/OpenApiConstraintMapper";

/** Substrings the mapper uses when it admits a merge is lossy. */
const LOSS_MARKERS: readonly string[] = [
    "not enforced",
    "Cannot safely compose patterns",
    "Conflicting 'type'",
    "no value satisfies both branches"
];

/** True when the merge reported that it could not express the intersection. */
function declaredLoss(entries: readonly ILogEntry[]): boolean {
    return LOSS_MARKERS.some((marker) => reported(entries, marker));
}

/** Strings used to probe composed `pattern` constraints; `\n` is included deliberately. */
const patternProbeArb: fc.Arbitrary<string> = fc.string({
    unit: fc.constantFrom("a", "b", "c", "q", "x", "z", "A", "0", "9", "_", "\n", " "),
    maxLength: 8
});

const stringConstraintsArb: fc.Arbitrary<JsonRecord> = fc
    .record(
        {
            minLength: fc.integer({ min: 0, max: 4 }),
            maxLength: fc.integer({ min: 0, max: 8 }),
            pattern: fc.constantFrom(...SAFE_PATTERNS),
            enum: fc.uniqueArray(fc.constantFrom("a", "ab", "abc", "q", "xyz", "A0"), {
                minLength: 1,
                maxLength: 4
            })
        },
        { requiredKeys: [] }
    )
    .map((partial): JsonRecord => ({ type: "string", ...partial }));

const numericConstraintsArb = (type: "integer" | "number"): fc.Arbitrary<JsonRecord> =>
    fc
        .record(
            {
                minimum: fc.integer({ min: -30, max: 30 }),
                maximum: fc.integer({ min: -30, max: 30 }),
                multipleOf: fc.integer({ min: 1, max: 5 }),
                exclusiveMinimum: fc.oneof(fc.boolean(), fc.integer({ min: -30, max: 30 })),
                exclusiveMaximum: fc.oneof(fc.boolean(), fc.integer({ min: -30, max: 30 }))
            },
            { requiredKeys: [] }
        )
        .map((partial): JsonRecord => ({ type, ...partial }));

const arrayConstraintsArb: fc.Arbitrary<JsonRecord> = fc
    .record(
        {
            minItems: fc.integer({ min: 0, max: 3 }),
            maxItems: fc.integer({ min: 0, max: 5 }),
            uniqueItems: fc.boolean(),
            items: fc.constantFrom<JsonRecord>(
                { type: "string" },
                { type: "string", maxLength: 2 },
                { type: "integer", minimum: 0 }
            )
        },
        { requiredKeys: [] }
    )
    .map((partial): JsonRecord => ({ type: "array", ...partial }));

const objectConstraintsArb: fc.Arbitrary<JsonRecord> = fc
    .record(
        {
            minProperties: fc.integer({ min: 0, max: 3 }),
            maxProperties: fc.integer({ min: 0, max: 4 }),
            required: fc.uniqueArray(fc.constantFrom("alpha", "type", "enum"), { maxLength: 2 }),
            properties: fc.dictionary(
                fc.constantFrom("alpha", "type", "enum", "pattern"),
                fc.constantFrom<JsonRecord>(
                    { type: "string", maxLength: 4 },
                    { type: "string", minLength: 2 },
                    { type: "integer", minimum: 1 }
                ),
                { minKeys: 1, maxKeys: 3 }
            )
        },
        { requiredKeys: [] }
    )
    .map((partial): JsonRecord => ({ type: "object", ...partial }));

/** Two constraint sets over the same declared type, plus a value drawn from near their boundaries. */
const mergeCaseArb: fc.Arbitrary<[JsonRecord, JsonRecord, unknown]> = fc
    .constantFrom("string", "integer", "number", "array", "object")
    .chain((type) => {
        const branch =
            type === "string"
                ? stringConstraintsArb
                : type === "array"
                  ? arrayConstraintsArb
                  : type === "object"
                    ? objectConstraintsArb
                    : numericConstraintsArb(type as "integer" | "number");
        return fc.tuple(branch, branch);
    })
    .chain(([left, right]) =>
        fc.tuple(
            fc.constant(left),
            fc.constant(right),
            fc.oneof(conformingValueArb(left), conformingValueArb(right))
        )
    );

/** Merges two branches under log capture. */
function mergeBranches(left: JsonRecord, right: JsonRecord): { merged: JsonRecord; entries: ILogEntry[] } {
    const { value, entries } = withLogCapture(() =>
        OpenApiConstraintMapper.resolveAllOf({ allOf: [left, right] }, {})
    );
    return { merged: value, entries };
}

describe("allOf merge — never loosens", () => {
    it("a merged schema admits nothing that either branch rejects, unless the loss is reported", () => {
        fc.assert(
            fc.property(mergeCaseArb, ([left, right, value]) => {
                const { merged, entries } = mergeBranches(left, right);
                if (!admits(merged, value)) {
                    return;
                }
                const leftOk = admits(left, value);
                const rightOk = admits(right, value);
                if (leftOk && rightOk) {
                    return;
                }
                assert.ok(
                    declaredLoss(entries),
                    `merge widened silently.\n  left:   ${canonical(left)}\n  right:  ${canonical(right)}\n` +
                        `  merged: ${canonical(merged)}\n  value:  ${canonical(value)}\n` +
                        `  rejected by: ${leftOk ? "right" : "left"} branch`
                );
            })
        );
    });
});

describe("allOf merge — bounds combine exactly", () => {
    const BOUND_RULES: ReadonlyArray<[string, (a: number, b: number) => number]> = [
        ["minimum", Math.max],
        ["minLength", Math.max],
        ["minItems", Math.max],
        ["minProperties", Math.max],
        ["maximum", Math.min],
        ["maxLength", Math.min],
        ["maxItems", Math.min],
        ["maxProperties", Math.min]
    ];

    it("takes the tighter of two numeric bounds", () => {
        fc.assert(
            fc.property(mergeCaseArb, ([left, right]) => {
                const { merged } = mergeBranches(left, right);
                for (const [keyword, combine] of BOUND_RULES) {
                    const a = left[keyword];
                    const b = right[keyword];
                    if (typeof a === "number" && typeof b === "number") {
                        assert.strictEqual(merged[keyword], combine(a, b), `'${keyword}' did not tighten`);
                    } else if (typeof a === "number" || typeof b === "number") {
                        assert.strictEqual(
                            merged[keyword],
                            typeof a === "number" ? a : b,
                            `'${keyword}' declared on one branch was lost`
                        );
                    }
                }
            })
        );
    });

    it("intersects two enum lists", () => {
        fc.assert(
            fc.property(mergeCaseArb, ([left, right]) => {
                const { merged } = mergeBranches(left, right);
                const a = left.enum;
                const b = right.enum;
                if (!Array.isArray(a) || !Array.isArray(b)) {
                    return;
                }
                const expected = a.filter((entry) => b.some((other) => canonical(other) === canonical(entry)));
                assert.deepStrictEqual(merged.enum, expected);
            })
        );
    });

    it("keeps the union of both branches' required keys", () => {
        fc.assert(
            fc.property(mergeCaseArb, ([left, right]) => {
                const { merged } = mergeBranches(left, right);
                const a = Array.isArray(left.required) ? (left.required as string[]) : [];
                const b = Array.isArray(right.required) ? (right.required as string[]) : [];
                if (a.length === 0 && b.length === 0) {
                    return;
                }
                const actual = Array.isArray(merged.required) ? (merged.required as string[]) : [];
                for (const key of [...a, ...b]) {
                    assert.ok(actual.includes(key), `required key '${key}' was dropped by the merge`);
                }
            })
        );
    });
});

describe("allOf merge — pattern composition", () => {
    it("the composed pattern accepts exactly the strings both patterns accept", () => {
        fc.assert(
            fc.property(
                fc.constantFrom(...SAFE_PATTERNS),
                fc.constantFrom(...SAFE_PATTERNS),
                patternProbeArb,
                (left, right, probe) => {
                    const { merged } = mergeBranches(
                        { type: "string", pattern: left },
                        { type: "string", pattern: right }
                    );
                    const composed = merged.pattern;
                    assert.strictEqual(typeof composed, "string");
                    const both = new RegExp(left).test(probe) && new RegExp(right).test(probe);
                    assert.strictEqual(
                        new RegExp(composed as string).test(probe),
                        both,
                        `composed /${composed}/ disagrees with /${left}/ and /${right}/ on ${JSON.stringify(probe)}`
                    );
                }
            )
        );
    });

    it("refuses to compose a pattern carrying a capture group, and says so", () => {
        fc.assert(
            fc.property(
                fc.constantFrom(...CAPTURING_PATTERNS),
                fc.constantFrom(...SAFE_PATTERNS),
                (capturing, safe) => {
                    const { merged, entries } = mergeBranches(
                        { type: "string", pattern: capturing },
                        { type: "string", pattern: safe }
                    );
                    assert.strictEqual(merged.pattern, capturing, "a capture group was silently renumbered");
                    assert.ok(
                        reported(entries, "Cannot safely compose patterns"),
                        "the dropped pattern was not reported"
                    );
                }
            ),
            { numRuns: 200 }
        );
    });
});

describe("allOf merge — order independence", () => {
    it("commutative keywords do not depend on branch order", () => {
        fc.assert(
            fc.property(mergeCaseArb, ([left, right]) => {
                const forward = mergeBranches(left, right).merged;
                const backward = mergeBranches(right, left).merged;
                for (const keyword of [
                    "minimum",
                    "maximum",
                    "minLength",
                    "maxLength",
                    "minItems",
                    "maxItems",
                    "minProperties",
                    "maxProperties",
                    "multipleOf",
                    "uniqueItems",
                    "exclusiveMinimum",
                    "exclusiveMaximum",
                    "additionalProperties"
                ]) {
                    assert.strictEqual(
                        forward[keyword],
                        backward[keyword],
                        `'${keyword}' depends on branch order`
                    );
                }
                if (Array.isArray(forward.enum) && Array.isArray(backward.enum)) {
                    assert.deepStrictEqual(
                        [...(forward.enum as unknown[])].map(canonical).sort(),
                        [...(backward.enum as unknown[])].map(canonical).sort(),
                        "enum intersection depends on branch order"
                    );
                }
            })
        );
    });

    it("a composed pattern accepts the same strings in either branch order", () => {
        fc.assert(
            fc.property(
                fc.constantFrom(...SAFE_PATTERNS),
                fc.constantFrom(...SAFE_PATTERNS),
                patternProbeArb,
                (left, right, probe) => {
                    const forward = mergeBranches(
                        { type: "string", pattern: left },
                        { type: "string", pattern: right }
                    ).merged.pattern as string;
                    const backward = mergeBranches(
                        { type: "string", pattern: right },
                        { type: "string", pattern: left }
                    ).merged.pattern as string;
                    assert.strictEqual(new RegExp(forward).test(probe), new RegExp(backward).test(probe));
                }
            )
        );
    });
});

describe("allOf merge — keywords without a bound rule still intersect", () => {
    /**
     * `deepMergeSchemas` ends in `output[key] = srcVal`, which is override, not intersection. These
     * five keywords used to fall through to it and silently widen (findings F1-F5). Each is pinned by
     * a property rather than a single example, because the defect class is "the later branch wins",
     * which only shows up when the two branches disagree.
     */
    it("multipleOf intersects to a common multiple of both branches", () => {
        fc.assert(
            fc.property(fc.integer({ min: 1, max: 12 }), fc.integer({ min: 1, max: 12 }), (a, b) => {
                const { merged } = mergeBranches(
                    { type: "integer", multipleOf: a },
                    { type: "integer", multipleOf: b }
                );
                const result = merged.multipleOf as number;
                assert.strictEqual(result % a, 0, `${result} is not a multiple of ${a}`);
                assert.strictEqual(result % b, 0, `${result} is not a multiple of ${b}`);
            })
        );
    });

    it("a draft-4 boolean exclusive bound never destroys the other branch's numeric one", () => {
        fc.assert(
            fc.property(
                fc.constantFrom<"exclusiveMinimum" | "exclusiveMaximum">("exclusiveMinimum", "exclusiveMaximum"),
                fc.integer({ min: -20, max: 20 }),
                fc.boolean(),
                fc.boolean(),
                (keyword, bound, flag, numericFirst) => {
                    const numericBranch: JsonRecord = { type: "integer", [keyword]: bound };
                    const booleanBranch: JsonRecord = { type: "integer", [keyword]: flag };
                    const { merged } = numericFirst
                        ? mergeBranches(numericBranch, booleanBranch)
                        : mergeBranches(booleanBranch, numericBranch);
                    assert.strictEqual(
                        merged[keyword],
                        bound,
                        `the '${keyword}' bound ${bound} was replaced by the draft-4 boolean ${flag}`
                    );
                }
            )
        );
    });

    it("a draft-4 'true' is rewritten as its sibling bound rather than discarded", () => {
        const { merged } = mergeBranches(
            { type: "integer", exclusiveMaximum: 10 },
            { type: "integer", maximum: 3, exclusiveMaximum: true }
        );
        assert.strictEqual(merged.exclusiveMaximum, 3, "the tighter exclusive bound was lost");
        assert.ok(!admits(merged, 3), "3 is admitted although one branch requires x < 3");
    });

    it("uniqueItems: true survives a branch that declares it false", () => {
        fc.assert(
            fc.property(fc.boolean(), fc.boolean(), (a, b) => {
                const { merged } = mergeBranches(
                    { type: "array", uniqueItems: a },
                    { type: "array", uniqueItems: b }
                );
                assert.strictEqual(merged.uniqueItems, a || b);
                if (a || b) {
                    assert.ok(!admits(merged, ["x", "x"]), "duplicates are admitted although a branch forbids them");
                }
            })
        );
    });

    it("contradictory const values make the composition unsatisfiable, and say so", () => {
        fc.assert(
            fc.property(
                fc.constantFrom("a", "b", "c"),
                fc.constantFrom("a", "b", "c"),
                (a, b) => {
                    const { merged, entries } = mergeBranches(
                        { type: "string", const: a },
                        { type: "string", const: b }
                    );
                    if (a === b) {
                        assert.strictEqual(merged.const, a);
                        return;
                    }
                    assert.ok(declaredLoss(entries), "a contradictory const was resolved silently");
                    assert.deepStrictEqual(merged.enum, [], "no value satisfies both branches, so enum must be empty");
                    assert.ok(!admits(merged, a) && !admits(merged, b), "the merged schema still admits a value");
                }
            )
        );
    });

    it("additionalProperties: false closes the object whatever the other branch says", () => {
        const open: ReadonlyArray<unknown> = [true, { type: "string" }];
        for (const other of open) {
            assert.strictEqual(
                mergeBranches({ type: "object", additionalProperties: false }, { type: "object", additionalProperties: other })
                    .merged.additionalProperties,
                false
            );
            assert.strictEqual(
                mergeBranches({ type: "object", additionalProperties: other }, { type: "object", additionalProperties: false })
                    .merged.additionalProperties,
                false
            );
        }
        assert.strictEqual(
            mergeBranches({ type: "object", additionalProperties: true }, { type: "object", additionalProperties: true })
                .merged.additionalProperties,
            true
        );
    });

    it("a sub-schema for additionalProperties is narrower than a bare true", () => {
        const sub: JsonRecord = { type: "string", maxLength: 2 };
        assert.deepStrictEqual(
            mergeBranches({ type: "object", additionalProperties: true }, { type: "object", additionalProperties: sub })
                .merged.additionalProperties,
            sub
        );
        assert.deepStrictEqual(
            mergeBranches({ type: "object", additionalProperties: sub }, { type: "object", additionalProperties: true })
                .merged.additionalProperties,
            sub
        );
    });
});

describe("allOf merge — property maps are not keyword maps", () => {
    it("a property named after a JSON Schema keyword survives the merge as a sub-schema", () => {
        fc.assert(
            fc.property(mergeCaseArb, ([left, right]) => {
                if (!isPlainObject(left.properties) || !isPlainObject(right.properties)) {
                    return;
                }
                const { merged } = mergeBranches(left, right);
                const mergedProps = merged.properties;
                assert.ok(isPlainObject(mergedProps), "the properties map was destroyed by the merge");
                const expectedKeys = new Set([
                    ...Object.keys(left.properties),
                    ...Object.keys(right.properties)
                ]);
                assert.deepStrictEqual(
                    Object.keys(mergedProps).sort(),
                    [...expectedKeys].sort(),
                    "the merged properties map lost or invented a key"
                );
                for (const key of expectedKeys) {
                    assert.ok(
                        isPlainObject(mergedProps[key]) && "type" in (mergedProps[key] as JsonRecord),
                        `property '${key}' was merged by the keyword rules instead of as a sub-schema`
                    );
                }
            })
        );
    });
});

describe("allOf merge ? boundary, regex group, and LCM edge cases", () => {
    it("resolveAllOf handles non-array allOf, initial depth overflow, nested depth truncation, non-record branches, and cyclic activeRefs", () => {
        const plain = { type: "string" };
        assert.strictEqual(OpenApiConstraintMapper.resolveAllOf(plain, {}), plain);

        const overDepth = { allOf: [{ type: "string", minLength: 3 }] };
        const overRes = withLogCapture(() => OpenApiConstraintMapper.resolveAllOf(overDepth, {}, 31));
        assert.strictEqual(overRes.value, overDepth);
        assert.ok(overRes.entries.some((e) => e.level === "warning"));

        const nestedOver = { allOf: [{ allOf: [{ type: "string", minLength: 5 }] }] };
        const nestedRes = withLogCapture(() => OpenApiConstraintMapper.resolveAllOf(nestedOver, {}, 30));
        assert.ok(nestedRes.entries.some((e) => e.level === "warning"));

        const withNonRecordAndCycle = {
            allOf: [
                null as unknown as JsonRecord,
                "skip" as unknown as JsonRecord,
                { $ref: "#/definitions/Loop" },
                { type: "string", maxLength: 8 }
            ]
        };
        const cycleRes = OpenApiConstraintMapper.resolveAllOf(
            withNonRecordAndCycle,
            { definitions: { Loop: { type: "string", minLength: 2 } } },
            0,
            new Set(["#/definitions/Loop"])
        );
        assert.strictEqual(cycleRes.maxLength, 8);
        assert.strictEqual(cycleRes.minLength, undefined);
    });

    it("multipleOf falls back to Math.max and warns on non-positive, non-finite, exponential, or unsafe-integer LCMs", () => {
        assert.strictEqual(
            mergeBranches({ type: "number", multipleOf: 5 }, { type: "number", multipleOf: 5 }).merged.multipleOf,
            5
        );
        for (const [a, b, expected] of [
            [0, 5, 5],
            [5, 0, 5],
            [-2, 4, 4],
            [4, -2, 4],
            [Number.POSITIVE_INFINITY, 3, Number.POSITIVE_INFINITY],
            [3, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY],
            [1e-7, 2, 2],
            [2, 1e-7, 2],
            [Number.MAX_SAFE_INTEGER, 2, Number.MAX_SAFE_INTEGER],
            [Number.MAX_SAFE_INTEGER * 2, 2, Number.MAX_SAFE_INTEGER * 2]
        ] as Array<[number, number, number]>) {
            const res = withLogCapture(() =>
                OpenApiConstraintMapper.deepMergeSchemas({ type: "number", multipleOf: a }, { type: "number", multipleOf: b })
            );
            assert.strictEqual((res.value as JsonRecord).multipleOf, expected);
            assert.ok(res.entries.some((e) => e.level === "warning"));
        }
    });

    it("composePatterns composes escaped parens, char-class parens, non-capturing groups, and lookbehinds, while rejecting named capture groups", () => {
        // Safe patterns without capturing groups should compose
        for (const [p1, p2] of [
            ["^\\(a\\)$", "^\\(a\\)$"],
            ["^\\(a\\)", "b$"],
            ["^[a(b)z]+$", "^a"],
            ["^(?:abc)+$", "abc$"],
            ["^(?<=a)b$", "^ab$"],
            ["^(?<!x)b$", "^ab$"]
        ]) {
            const res = withLogCapture(() =>
                OpenApiConstraintMapper.deepMergeSchemas({ type: "string", pattern: p1 }, { type: "string", pattern: p2 })
            );
            if (p1 === p2) {
                assert.strictEqual((res.value as JsonRecord).pattern, p1);
            } else {
                assert.ok(String((res.value as JsonRecord).pattern).startsWith("^(?="));
            }
            assert.strictEqual(res.entries.length, 0, `unexpected warning for ${p1} + ${p2}`);
        }

        // Named capture group (?<name>...) must warn and keep targetVal
        const named = withLogCapture(() =>
            OpenApiConstraintMapper.deepMergeSchemas(
                { type: "string", pattern: "^(?<letters>[a-z]+)$" },
                { type: "string", pattern: "^abc$" }
            )
        );
        assert.strictEqual((named.value as JsonRecord).pattern, "^(?<letters>[a-z]+)$");
        assert.ok(named.entries.some((e) => e.level === "warning"));
        const afterClass = withLogCapture(() =>
            OpenApiConstraintMapper.deepMergeSchemas(
                { type: "string", pattern: "^\\d[a-z](foo)$" },
                { type: "string", pattern: "^afoo$" }
            )
        );
        assert.strictEqual((afterClass.value as JsonRecord).pattern, "^\\d[a-z](foo)$");
        assert.ok(afterClass.entries.some((e) => e.level === "warning"));
    });

    it("handles non-record source, conflicting types, composition keyword collisions, nested sub-schema additionalProperties, and structural const equality", () => {
        assert.deepStrictEqual(OpenApiConstraintMapper.deepMergeSchemas({ type: "string" }, null), { type: "string" });
        assert.deepStrictEqual(OpenApiConstraintMapper.deepMergeSchemas(null, { type: "string" }), { type: "string" });

        const typeConflict = withLogCapture(() =>
            OpenApiConstraintMapper.deepMergeSchemas({ type: "string" }, { type: "number" })
        );
        assert.strictEqual((typeConflict.value as JsonRecord).type, "string");
        assert.ok(typeConflict.entries.some((e) => e.level === "error"));

        const oneOfCollision = withLogCapture(() =>
            OpenApiConstraintMapper.deepMergeSchemas(
                { oneOf: [{ type: "string" }] },
                { oneOf: [{ type: "number" }] }
            )
        );
        assert.deepStrictEqual((oneOfCollision.value as JsonRecord).oneOf, [{ type: "string" }]);
        assert.ok(oneOfCollision.entries.some((e) => e.level === "warning"));
        for (const kw of ["allOf", "anyOf"] as const) {
            const col = withLogCapture(() =>
                OpenApiConstraintMapper.deepMergeSchemas({ [kw]: [{ type: "string" }] }, { [kw]: [{ type: "number" }] })
            );
            assert.deepStrictEqual((col.value as JsonRecord)[kw], [{ type: "string" }]);
            assert.ok(col.entries.some((e) => e.level === "warning"));
        }
        for (const mapKw of ["patternProperties", "definitions", "$defs", "dependentSchemas"] as const) {
            const mergedMap = withLogCapture(() =>
                OpenApiConstraintMapper.deepMergeSchemas(
                    { [mapKw]: { const: { type: "string", minLength: 2 }, keepLeft: { type: "boolean" } } },
                    { [mapKw]: { const: { type: "string", maxLength: 6 }, keepRight: { type: "integer" } } }
                )
            );
            assert.strictEqual(mergedMap.entries.length, 0);
            assert.deepStrictEqual(((mergedMap.value as JsonRecord)[mapKw] as JsonRecord).const, {
                type: "string",
                minLength: 2,
                maxLength: 6
            });
        }
        const enumEmpty = withLogCapture(() =>
            OpenApiConstraintMapper.deepMergeSchemas({ enum: ["a", "b"] }, { enum: ["c"] })
        );
        assert.deepStrictEqual((enumEmpty.value as JsonRecord).enum, []);
        assert.ok(enumEmpty.entries.some((e) => e.level === "error"));
        const enumNonEmpty = withLogCapture(() =>
            OpenApiConstraintMapper.deepMergeSchemas({ enum: ["a", "b"] }, { enum: ["b", "c"] })
        );
        assert.deepStrictEqual((enumNonEmpty.value as JsonRecord).enum, ["b"]);
        assert.strictEqual(enumNonEmpty.entries.length, 0);

        const mergedAddProps = OpenApiConstraintMapper.deepMergeSchemas(
            { type: "object", additionalProperties: { type: "string", minLength: 2 } },
            { type: "object", additionalProperties: { type: "string", maxLength: 5 } }
        ) as JsonRecord;
        assert.deepStrictEqual(mergedAddProps.additionalProperties, { type: "string", minLength: 2, maxLength: 5 });

        const bothTrueAddProps = OpenApiConstraintMapper.deepMergeSchemas(
            { type: "object", additionalProperties: true },
            { type: "object", additionalProperties: true }
        ) as JsonRecord;
        assert.strictEqual(bothTrueAddProps.additionalProperties, true);

        const sameConstObj = withLogCapture(() =>
            OpenApiConstraintMapper.deepMergeSchemas(
                { const: { b: [1, 2], a: "x" } },
                { const: { a: "x", b: [1, 2] } }
            )
        );
        assert.strictEqual(sameConstObj.entries.length, 0);
        assert.strictEqual((sameConstObj.value as JsonRecord).enum, undefined);
    });
});
