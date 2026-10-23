/**
 * @file inference-merge.spec.ts
 * @description Properties of row reconciliation — `DataInferenceBuilder.mergeInferredProperties`
 * and the ISO-date detector that feeds it.
 *
 * When two rows of a table disagree about a column, this is the code that decides what the column
 * becomes. It is the part of inference most exposed to real data, because real rows disagree: a
 * value is null in row 1 and a number in row 7, a list is empty in row 1 and full of objects in
 * row 2, a column looks like a date until the row that holds `"n/a"`. Every branch below is
 * restated independently from the documented rules rather than read back out of the source.
 */

import * as assert from "assert";
import { fc } from "./fc-config";
import { JsonRecord, prune } from "./arbitraries";
import { DataInferenceBuilder } from "../../src/nz/co/siliconst/ui5/metaui/core/DataInferenceBuilder";
import { IPropertyMetadata } from "../../src/nz/co/siliconst/ui5/metaui/interfaces/ISchema";

// ---------------------------------------------------------------------------
// ISO date detection
// ---------------------------------------------------------------------------

/** Independent calendar check: is `y-m-d` a real date? */
function isRealDate(year: number, month: number, day: number): boolean {
    if (month < 1 || month > 12 || day < 1) return false;
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    const lengths = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return day <= lengths[month - 1];
}

/** The field type inference gives a bare string value. */
function inferredTypeOf(value: unknown): string | undefined {
    return DataInferenceBuilder.inferSchemaFromData({ field: value }).properties?.field.type;
}

describe("inference — ISO date detection", () => {
    it("a YYYY-MM-DD string is a date field exactly when it is a real calendar date", () => {
        fc.assert(
            fc.property(
                // Years below 100 are excluded: `Date.UTC` maps 0-99 into the 1900s, and the
                // detector's own round-trip guard then rejects them. See the F13 pin below.
                fc.integer({ min: 100, max: 9999 }),
                fc.integer({ min: 0, max: 19 }),
                fc.integer({ min: 0, max: 39 }),
                (year, month, day) => {
                    const text = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(
                        day
                    ).padStart(2, "0")}`;
                    const expected = isRealDate(year, month, day) ? "date" : "string";
                    assert.strictEqual(inferredTypeOf(text), expected, text);
                }
            )
        );
    });

    it("February 29 is a date only in a leap year", () => {
        for (const [text, expected] of [
            ["2024-02-29", "date"],
            ["2000-02-29", "date"],
            ["1900-02-29", "string"],
            ["2023-02-29", "string"],
            ["2024-02-30", "string"],
            ["2024-04-31", "string"]
        ] as const) {
            assert.strictEqual(inferredTypeOf(text), expected, text);
        }
    });

    it("anything that is not exactly YYYY-MM-DD stays a string", () => {
        fc.assert(
            fc.property(
                fc.constantFrom(
                    "2024-2-9",
                    "2024-02-9",
                    "24-02-09",
                    "2024/02/09",
                    "2024-02-09T00:00:00Z",
                    " 2024-02-09",
                    "2024-02-09 ",
                    "x2024-02-09",
                    "2024-02-090",
                    "+2024-02-09"
                ),
                (text) => {
                    assert.strictEqual(inferredTypeOf(text), "string", text);
                }
            ),
            { numRuns: 100 }
        );
    });

    it("a real Date instance is a date field", () => {
        assert.strictEqual(inferredTypeOf(new Date(2024, 1, 29)), "date");
    });

    it("F13 (known defect): a valid date in year 1-99 is not recognised as a date", () => {
        // `isValidIsoDateString` validates by round-tripping through `Date.UTC(year, …)`, which
        // maps years 0-99 into the 1900s, so the round-trip check that exists to reject
        // 2024-02-30 also rejects every real date before year 100. Low impact for business data,
        // but it is the detector's guard misfiring, not a deliberate cut-off.
        // Delete this test when the detector uses setUTCFullYear.
        for (const text of ["0001-01-01", "0050-06-15", "0099-12-31"]) {
            assert.strictEqual(inferredTypeOf(text), "string", `F13 appears fixed for ${text}`);
        }
        assert.strictEqual(inferredTypeOf("0100-01-01"), "date", "year 100 is the first recognised year");
    });
});

// ---------------------------------------------------------------------------
// Row reconciliation
// ---------------------------------------------------------------------------

/** Builds the metadata inference would produce for a single-key row. */
function metaFor(value: unknown): IPropertyMetadata {
    return DataInferenceBuilder.inferPropertiesFromObject({ field: value }).field;
}

/** Merges the metadata of two rows that both carry `field`. */
function mergeField(first: unknown, second: unknown): IPropertyMetadata {
    return DataInferenceBuilder.mergeInferredProperties(
        { field: metaFor(first) },
        { field: metaFor(second) }
    ).field;
}

/** The merged column type, inferred end to end from two rows of a table. */
function tableColumnType(first: unknown, second: unknown): IPropertyMetadata | undefined {
    const schema = DataInferenceBuilder.inferSchemaFromData([{ field: first }, { field: second }]);
    return schema.items?.properties?.field;
}

const primitiveArb: fc.Arbitrary<unknown> = fc.oneof(
    fc.string({ maxLength: 5 }),
    fc.integer({ min: -100, max: 100 }),
    fc.boolean(),
    fc.constantFrom("2024-02-29", "1999-12-31")
);

describe("inference — row reconciliation", () => {
    it("a key only the later row carries is added, not dropped", () => {
        fc.assert(
            fc.property(primitiveArb, (value) => {
                const merged = DataInferenceBuilder.mergeInferredProperties({}, { field: metaFor(value) });
                assert.deepStrictEqual(prune(merged.field), prune(metaFor(value)));
            })
        );
    });

    it("merging a row with itself is the identity", () => {
        fc.assert(
            fc.property(primitiveArb, (value) => {
                assert.deepStrictEqual(prune(mergeField(value, value)), prune(metaFor(value)));
            })
        );
    });

    it("a column that is null first and a value later takes the value's type and stays nullable", () => {
        fc.assert(
            fc.property(primitiveArb, (value) => {
                const merged = mergeField(null, value);
                assert.strictEqual(
                    merged.type,
                    metaFor(value).type,
                    "the null placeholder from the first row won over the real type"
                );
                assert.strictEqual(merged.nullable, true, "the column lost its nullability");
                assert.strictEqual(tableColumnType(null, value)?.type, metaFor(value).type);
            })
        );
    });

    it("a column that is a value first and null later keeps its type and becomes nullable", () => {
        fc.assert(
            fc.property(primitiveArb, (value) => {
                const merged = mergeField(value, null);
                assert.strictEqual(merged.type, metaFor(value).type);
                assert.strictEqual(merged.nullable, true);
            })
        );
    });

    it("an empty list followed by a list of objects becomes a table, not a text column", () => {
        fc.assert(
            fc.property(
                fc.dictionary(fc.constantFrom("a", "b", "c"), primitiveArb, { minKeys: 1, maxKeys: 3 }),
                (row) => {
                    const merged = mergeField([], [row]);
                    assert.strictEqual(merged.type, "array");
                    assert.strictEqual(merged.items?.type, "object", "the nested table stayed a text column");
                    assert.deepStrictEqual(
                        Object.keys(merged.items?.properties || {}).sort(),
                        Object.keys(row).sort()
                    );
                }
            )
        );
    });

    it("an empty list followed by a list of primitives takes the primitive's item type", () => {
        fc.assert(
            fc.property(
                fc.oneof(fc.integer({ min: -50, max: 50 }), fc.boolean(), fc.constant(new Date(2024, 0, 1))),
                (value) => {
                    const merged = mergeField([], [value]);
                    assert.strictEqual(merged.type, "array");
                    assert.strictEqual(merged.items?.type, metaFor(value).type);
                }
            )
        );
    });

    it("a list of objects is not downgraded by a later empty list", () => {
        const merged = mergeField([{ a: 1 }], []);
        assert.strictEqual(merged.items?.type, "object", "the table was downgraded by an empty row");
        assert.deepStrictEqual(Object.keys(merged.items?.properties || {}), ["a"]);
    });

    it("a date column widens to text as soon as a row holds a non-date string", () => {
        fc.assert(
            fc.property(fc.constantFrom("n/a", "unknown", "", "2024-13-01"), (text) => {
                const merged = mergeField("2024-02-29", text);
                assert.strictEqual(
                    merged.type,
                    "string",
                    "a date column kept its date type although a row holds a non-date string"
                );
                assert.strictEqual(tableColumnType("2024-02-29", text)?.type, "string");
            })
        );
    });

    it("a date column stays a date when every row holds a date", () => {
        assert.strictEqual(mergeField("2024-02-29", "1999-12-31").type, "date");
        assert.strictEqual(tableColumnType("2024-02-29", "1999-12-31")?.type, "date");
    });

    it("nested objects in two rows are merged key-wise rather than replaced", () => {
        fc.assert(
            fc.property(
                fc.dictionary(fc.constantFrom("a", "b"), primitiveArb, { minKeys: 1, maxKeys: 2 }),
                fc.dictionary(fc.constantFrom("c", "d"), primitiveArb, { minKeys: 1, maxKeys: 2 }),
                (left, right) => {
                    const merged = mergeField(left, right);
                    assert.strictEqual(merged.type, "object");
                    assert.deepStrictEqual(
                        Object.keys(merged.properties || {}).sort(),
                        [...new Set([...Object.keys(left), ...Object.keys(right)])].sort()
                    );
                }
            )
        );
    });

    it("nested tables in two rows have their columns unioned", () => {
        fc.assert(
            fc.property(
                fc.dictionary(fc.constantFrom("a", "b"), primitiveArb, { minKeys: 1, maxKeys: 2 }),
                fc.dictionary(fc.constantFrom("c", "d"), primitiveArb, { minKeys: 1, maxKeys: 2 }),
                (left, right) => {
                    const merged = mergeField([left], [right]);
                    assert.strictEqual(merged.items?.type, "object");
                    assert.deepStrictEqual(
                        Object.keys(merged.items?.properties || {}).sort(),
                        [...new Set([...Object.keys(left), ...Object.keys(right)])].sort()
                    );
                }
            )
        );
    });

    it("the first row wins for any disagreement the documented rules do not cover", () => {
        // Neither value is null, neither is an array, neither is a date/string pair: the merge
        // keeps the earlier definition. Pinned because it is what makes column types stable.
        fc.assert(
            fc.property(
                fc.constantFrom<unknown>(7, true, "text"),
                fc.constantFrom<unknown>(7, true, "text"),
                (first, second) => {
                    const firstType = metaFor(first).type;
                    const secondType = metaFor(second).type;
                    if (firstType === secondType) return;
                    assert.strictEqual(mergeField(first, second).type, firstType);
                }
            )
        );
    });

    it("merging never produces a column with no type", () => {
        fc.assert(
            fc.property(
                fc.oneof(primitiveArb, fc.constant(null), fc.array(primitiveArb, { maxLength: 2 }), fc.object()),
                fc.oneof(primitiveArb, fc.constant(null), fc.array(primitiveArb, { maxLength: 2 }), fc.object()),
                (first, second) => {
                    const merged = mergeField(first, second);
                    assert.ok(
                        typeof merged.type === "string" && merged.type.length > 0,
                        `merging ${JSON.stringify(first)} with ${JSON.stringify(second)} produced no type`
                    );
                }
            )
        );
    });

    it("merging is a pure function: neither input map is modified", () => {
        fc.assert(
            fc.property(primitiveArb, primitiveArb, (first, second) => {
                const base: Record<string, IPropertyMetadata> = { field: metaFor(first) };
                const next: Record<string, IPropertyMetadata> = { field: metaFor(second) };
                const baseBefore = JSON.stringify(base);
                const nextBefore = JSON.stringify(next);
                DataInferenceBuilder.mergeInferredProperties(base, next);
                assert.strictEqual(JSON.stringify(base), baseBefore, "the accumulated map was mutated");
                assert.strictEqual(JSON.stringify(next), nextBefore, "the incoming map was mutated");
            })
        );
    });

    it("a column is nullable exactly when some sampled row holds null", () => {
        fc.assert(
            fc.property(
                fc.array(fc.oneof(primitiveArb, fc.constant(null)), { minLength: 1, maxLength: 6 }),
                (values) => {
                    const rows: JsonRecord[] = values.map((value) => ({ field: value }));
                    const merged = DataInferenceBuilder.inferPropertiesFromRows(rows);
                    const anyNull = values.some((value) => value === null || value === undefined);
                    assert.strictEqual(
                        merged.field.nullable === true,
                        anyNull,
                        `nullable flag disagrees with the rows ${JSON.stringify(values)}`
                    );
                }
            )
        );
    });
});
