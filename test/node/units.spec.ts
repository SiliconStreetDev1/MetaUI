/**
 * @file units.spec.ts
 * @description Absolute restatements for the small, self-contained units.
 *
 * `TypeGuards.deepClone`, `OpenApiTypeMapper`, `OpenApiParserFactory` and the four arithmetic /
 * structural validators are each small enough that a complete behavioural table fits in one
 * `describe`. They were reached only incidentally by the larger properties, which is why so much of
 * them survived mutation: being *executed* by a test that asserts something else is not coverage.
 *
 * Every expectation is written from the governing specification — JSON Schema draft 2020-12 for
 * `multipleOf`, `minItems`/`maxItems`/`uniqueItems`, `const` and `integer`; the OpenAPI 2.0 and 3.x
 * version-field definitions for the parser factory; structured-clone semantics for `deepClone`.
 */

import * as assert from "assert";
import { fc, withLogCapture, reported } from "./fc-config";
import { IValidationResult } from "../../src/nz/co/siliconst/ui5/metaui/interfaces/IPipeline";
import { IPropertyMetadata } from "../../src/nz/co/siliconst/ui5/metaui/interfaces/ISchema";
import { deepClone, readStringArray, readRecord } from "../../src/nz/co/siliconst/ui5/metaui/utils/TypeGuards";
import { MAX_CLONE_DEPTH } from "../../src/nz/co/siliconst/ui5/metaui/constants/MetaUIConstants";
import { OpenApiTypeMapper } from "../../src/nz/co/siliconst/ui5/metaui/openapi/OpenApiTypeMapper";
import { OpenApiParserFactory } from "../../src/nz/co/siliconst/ui5/metaui/openapi/OpenApiParserFactory";
import {
    ArrayItemsValidatorPlugin,
    canonicalSerialize
} from "../../src/nz/co/siliconst/ui5/metaui/plugins/validators/ArrayItemsValidatorPlugin";
import { ConstValidatorPlugin } from "../../src/nz/co/siliconst/ui5/metaui/plugins/validators/ConstValidatorPlugin";
import {
    MultipleOfValidatorPlugin
} from "../../src/nz/co/siliconst/ui5/metaui/plugins/validators/MultipleOfValidatorPlugin";
import { IntegerValidatorPlugin } from "../../src/nz/co/siliconst/ui5/metaui/plugins/validators/IntegerValidatorPlugin";
import { I18n, TEXT_KEY } from "../../src/nz/co/siliconst/ui5/metaui/utils/I18n";

/** A descriptor literal, typed as the metadata the validators receive. */
const asMeta = (literal: Record<string, unknown>): IPropertyMetadata =>
    literal as unknown as IPropertyMetadata;

/** Asserts a verdict is rejected and carries exactly the message `key` names. */
function expectRejectedWith(
    result: IValidationResult,
    key: (typeof TEXT_KEY)[keyof typeof TEXT_KEY],
    args: unknown[],
    context: string
): void {
    assert.strictEqual(result.isValid, false, `${context}: expected rejected`);
    assert.strictEqual(result.errorMessage, I18n.getText(key, args), `${context}: wrong message`);
}

describe("TypeGuards.deepClone", () => {
    it("a primitive is returned as it is", () => {
        for (const value of [undefined, null, 0, -1, "", "a", true, false, Number.NaN]) {
            assert.deepStrictEqual(deepClone(value), value, JSON.stringify(value));
        }
    });

    it("an object is copied structurally and shares no reference with its source", () => {
        const source = { a: 1, nested: { list: [1, { deep: true }] } };
        const copy = deepClone(source);
        assert.deepStrictEqual(copy, source);
        assert.notStrictEqual(copy, source);
        assert.notStrictEqual(copy.nested, source.nested);
        assert.notStrictEqual(copy.nested.list, source.nested.list);
        copy.nested.list.push(2);
        assert.strictEqual(source.nested.list.length, 2, "the source was mutated through the copy");
    });

    it("an array is cloned as an array, element by element", () => {
        const source = [1, [2, 3], { a: 4 }];
        const copy = deepClone(source);
        assert.ok(Array.isArray(copy));
        assert.deepStrictEqual(copy, source);
        assert.notStrictEqual(copy[1], source[1]);
    });

    it("a Date is cloned as an equal but distinct Date", () => {
        const source = new Date("2024-02-29T12:34:56.000Z");
        const copy = deepClone(source);
        assert.ok(copy instanceof Date);
        assert.strictEqual(copy.getTime(), source.getTime());
        assert.notStrictEqual(copy, source);
    });

    it("a nested Date keeps its type rather than becoming an empty object", () => {
        const source = { when: new Date(0), rows: [new Date(1000)] };
        const copy = deepClone(source);
        assert.ok(copy.when instanceof Date);
        assert.strictEqual(copy.when.getTime(), 0);
        assert.ok(copy.rows[0] instanceof Date);
        assert.strictEqual(copy.rows[0].getTime(), 1000);
    });

    it("a shared reference stays shared in the copy rather than being duplicated", () => {
        const shared = { s: 1 };
        const copy = deepClone({ left: shared, right: shared });
        assert.strictEqual(copy.left, copy.right, "a DAG was expanded into two separate objects");
        assert.notStrictEqual(copy.left, shared);
    });

    it("a cycle terminates and is preserved as a cycle", () => {
        const source: Record<string, unknown> = { name: "root" };
        source.self = source;
        const copy = deepClone(source);
        assert.strictEqual(copy.name, "root");
        assert.strictEqual(copy.self, copy);
        assert.notStrictEqual(copy, source);
    });

    it("a self-referential array terminates too", () => {
        const source: unknown[] = [1];
        source.push(source);
        const copy = deepClone(source);
        assert.strictEqual(copy[0], 1);
        assert.strictEqual(copy[1], copy);
    });

    it("a __proto__ key is copied as an own data property, never as a prototype write", () => {
        const source = JSON.parse('{"__proto__": {"polluted": true}, "safe": 1}') as Record<string, unknown>;
        const copy = deepClone(source);
        assert.strictEqual(copy.safe, 1);
        assert.strictEqual(
            Object.prototype.hasOwnProperty.call(copy, "__proto__"),
            true,
            "the key was dropped or written through the prototype"
        );
        assert.strictEqual(
            ({} as Record<string, unknown>).polluted,
            undefined,
            "Object.prototype was polluted by the clone"
        );
        const descriptor = Object.getOwnPropertyDescriptor(copy, "__proto__");
        assert.strictEqual(descriptor?.enumerable, true);
        assert.strictEqual(descriptor?.writable, true);
        assert.strictEqual(descriptor?.configurable, true);
    });

    it("a chain deeper than the clone limit terminates with an empty node of the right shape", () => {
        const LIMIT = MAX_CLONE_DEPTH;
        let node: Record<string, unknown> = { leaf: 1 };
        for (let i = 0; i < LIMIT + 5; i++) {
            node = { child: node };
        }
        const copy = deepClone(node);
        let cursor: Record<string, unknown> | undefined = copy;
        for (let i = 0; i < LIMIT; i++) {
            cursor = cursor?.child as Record<string, unknown> | undefined;
        }
        assert.deepStrictEqual(cursor, {}, "the clone did not stop at the documented depth");
    });

    it("cloning is a pure function of its input", () => {
        fc.assert(
            fc.property(fc.jsonValue(), (value) => {
                const before = JSON.stringify(value);
                const copy = deepClone(value);
                assert.strictEqual(JSON.stringify(value), before, "the source was modified");
                assert.deepStrictEqual(copy, value);
            }),
            { numRuns: 300 }
        );
    });
});

describe("TypeGuards — the remaining readers", () => {
    it("readStringArray keeps the string entries and discards the rest", () => {
        assert.deepStrictEqual(readStringArray({ k: ["a", 1, "b", null, {}] }, "k"), ["a", "b"]);
        assert.deepStrictEqual(readStringArray({ k: [] }, "k"), []);
        assert.deepStrictEqual(readStringArray({ k: [1, 2] }, "k"), []);
        assert.strictEqual(readStringArray({ k: "a" }, "k"), undefined, "a bare string is not an array");
        assert.strictEqual(readStringArray({}, "k"), undefined);
    });

    it("readRecord accepts a plain object and nothing else", () => {
        assert.deepStrictEqual(readRecord({ k: { a: 1 } }, "k"), { a: 1 });
        assert.strictEqual(readRecord({ k: [1] }, "k"), undefined, "an array is not a record");
        assert.strictEqual(readRecord({ k: new Date() }, "k"), undefined, "a Date is not a record");
        assert.strictEqual(readRecord({ k: null }, "k"), undefined);
        assert.strictEqual(readRecord({}, "k"), undefined);
    });
});

describe("OpenApiTypeMapper", () => {
    it("every OpenAPI primitive type maps to its MetaUI field type", () => {
        const table: ReadonlyArray<readonly [string, string]> = [
            ["string", "string"],
            ["number", "number"],
            ["integer", "integer"],
            ["boolean", "boolean"],
            ["array", "array"],
            ["object", "object"],
            ["date", "date"]
        ];
        for (const [openApiType, expected] of table) {
            assert.strictEqual(OpenApiTypeMapper.mapType(openApiType), expected, openApiType);
        }
    });

    it("the OpenAPI 2.0 'file' type is carried as a string, since the model holds its name", () => {
        assert.strictEqual(OpenApiTypeMapper.mapType("file"), "string");
    });

    it("an unknown or omitted type falls back to string, as SchemaNormalizer does", () => {
        for (const openApiType of ["", "null", "any", "Integer", "STRING", "widget"]) {
            assert.strictEqual(OpenApiTypeMapper.mapType(openApiType), "string", openApiType);
        }
    });

    it("the mapping is a total function: every input yields one of the declared field types", () => {
        const fieldTypes = ["string", "number", "integer", "boolean", "array", "object", "date"];
        fc.assert(
            fc.property(fc.string({ maxLength: 12 }), (raw) => {
                if (raw in Object.prototype) {
                    return; // finding F9, pinned in ref-resolver.spec.ts
                }
                assert.ok(fieldTypes.includes(OpenApiTypeMapper.mapType(raw)), `${raw} mapped outside the enum`);
            }),
            { numRuns: 300 }
        );
    });
});

describe("OpenApiParserFactory — version detection", () => {
    it("every spelling of a 2.0 version field is detected", () => {
        for (const swagger of ["2.0", "2", "2.0.0", 2, 2.0, " 2.0 ", "2.1"]) {
            assert.strictEqual(OpenApiParserFactory.detectSpecVersion({ swagger }), "2.0", JSON.stringify(swagger));
        }
    });

    it("every spelling of a 3.x version field is detected as the 3.0 family", () => {
        for (const openapi of ["3.0.0", "3.0", "3", "3.1.0", 3, " 3.0.3 "]) {
            assert.strictEqual(OpenApiParserFactory.detectSpecVersion({ openapi }), "3.0", JSON.stringify(openapi));
        }
    });

    it("a version field of another major is not recognised", () => {
        assert.strictEqual(OpenApiParserFactory.detectSpecVersion({ swagger: "1.2" }), undefined);
        assert.strictEqual(OpenApiParserFactory.detectSpecVersion({ openapi: "4.0.0" }), undefined);
        assert.strictEqual(OpenApiParserFactory.detectSpecVersion({ swagger: "20" }), undefined);
        assert.strictEqual(OpenApiParserFactory.detectSpecVersion({ openapi: "30" }), undefined);
    });

    it("an absent, null or non-document input is not recognised", () => {
        for (const raw of [undefined, null, 7, "3.0.0", ["3.0.0"], {}, { swagger: null }, { openapi: null }]) {
            assert.strictEqual(OpenApiParserFactory.detectSpecVersion(raw), undefined, JSON.stringify(raw));
        }
    });

    it("the swagger field wins when a document carries both", () => {
        assert.strictEqual(OpenApiParserFactory.detectSpecVersion({ swagger: "2.0", openapi: "3.0.0" }), "2.0");
    });

    it("a 3.x document with an unrecognised swagger field still falls through to the openapi field", () => {
        assert.strictEqual(OpenApiParserFactory.detectSpecVersion({ swagger: "1.0", openapi: "3.0.0" }), "3.0");
    });
});

describe("OpenApiParserFactory — parser selection", () => {
    it("a 2.0 document gets the 2.0 parser and a 3.x document the 3.0 parser", () => {
        assert.strictEqual(OpenApiParserFactory.getParser({ swagger: "2.0" }).constructor.name, "OpenApi2Parser");
        assert.strictEqual(OpenApiParserFactory.getParser({ openapi: "3.0.0" }).constructor.name, "OpenApi3Parser");
    });

    it("an undetectable document falls back to the 3.0 parser and says so", () => {
        const { value, entries } = withLogCapture(() => OpenApiParserFactory.getParser({ paths: {} }));
        assert.strictEqual(value.constructor.name, "OpenApi3Parser");
        assert.ok(reported(entries, "3.0"), "the fallback was not reported");
    });

    it("an input that is not a document at all is reported as invalid, not merely defaulted", () => {
        const { value, entries } = withLogCapture(() => OpenApiParserFactory.getParser("not a document"));
        assert.strictEqual(value.constructor.name, "OpenApi3Parser");
        assert.ok(reported(entries, "Invalid"), "an invalid document was accepted silently");
    });

    it("the selected parser always exposes the plugin contract", () => {
        for (const raw of [{ swagger: "2.0" }, { openapi: "3.1.0" }, {}, null]) {
            const parser = OpenApiParserFactory.getParser(raw);
            assert.strictEqual(typeof parser.parse, "function", JSON.stringify(raw));
        }
    });
});

describe("ArrayItemsValidatorPlugin — JSON Schema array assertions", () => {
    const arrayItems = new ArrayItemsValidatorPlugin();

    it("minItems is an inclusive lower bound and names itself when violated", () => {
        fc.assert(
            fc.property(fc.integer({ min: 0, max: 6 }), fc.integer({ min: 0, max: 8 }), (min, length) => {
                const value = Array.from({ length }, (_unused, index) => index);
                const result = arrayItems.validate(value, { minItems: min });
                assert.strictEqual(result.isValid, length >= min, `${length} items against minItems ${min}`);
                if (length < min) {
                    expectRejectedWith(result, TEXT_KEY.arrayMinItems, [min], `minItems ${min}`);
                }
            })
        );
    });

    it("maxItems is an inclusive upper bound and names itself when violated", () => {
        fc.assert(
            fc.property(fc.integer({ min: 0, max: 6 }), fc.integer({ min: 0, max: 8 }), (max, length) => {
                const value = Array.from({ length }, (_unused, index) => index);
                const result = arrayItems.validate(value, { maxItems: max });
                assert.strictEqual(result.isValid, length <= max, `${length} items against maxItems ${max}`);
                if (length > max) {
                    expectRejectedWith(result, TEXT_KEY.arrayMaxItems, [max], `maxItems ${max}`);
                }
            })
        );
    });

    it("uniqueItems rejects a structural duplicate and accepts a merely similar one", () => {
        assert.strictEqual(arrayItems.validate([1, 2, 3], { uniqueItems: true }).isValid, true);
        assert.strictEqual(arrayItems.validate([1, 2, 1], { uniqueItems: true }).isValid, false);
        assert.strictEqual(arrayItems.validate([{ a: 1 }, { a: 1 }], { uniqueItems: true }).isValid, false);
        assert.strictEqual(arrayItems.validate([{ a: 1 }, { a: 2 }], { uniqueItems: true }).isValid, true);
        assert.strictEqual(arrayItems.validate([[1, 2], [1, 2]], { uniqueItems: true }).isValid, false);
        assert.strictEqual(arrayItems.validate([1, "1"], { uniqueItems: true }).isValid, true,
            "1 and \"1\" are different JSON values");
    });

    it("a duplicate rejection carries the uniqueness message", () => {
        expectRejectedWith(arrayItems.validate([1, 1], { uniqueItems: true }), TEXT_KEY.arrayUniqueItems, [],
            "duplicate");
    });

    it("uniqueItems: false asserts nothing", () => {
        assert.strictEqual(arrayItems.validate([1, 1], { uniqueItems: false }).isValid, true);
        assert.strictEqual(arrayItems.validate([1, 1], {}).isValid, true);
    });

    it("the bounds are checked before uniqueness, so the cardinality message wins", () => {
        const result = arrayItems.validate([1, 1, 1], { maxItems: 2, uniqueItems: true });
        assert.strictEqual(result.errorMessage, I18n.getText(TEXT_KEY.arrayMaxItems, [2]));
    });

    it("a non-array value is not this validator's concern", () => {
        for (const value of ["abc", 7, true, null, undefined, { length: 5 }]) {
            assert.strictEqual(arrayItems.validate(value, { minItems: 3 }).isValid, true, String(value));
        }
    });

    it("an args payload that is not a constraints record fails closed", () => {
        // The documented contract: a constraint the engine cannot apply must never report the field
        // as valid, exactly as PatternValidatorPlugin does for a pattern it cannot compile.
        for (const args of [3, "minItems", null, undefined, [1]]) {
            const result = arrayItems.validate([1], args);
            assert.strictEqual(result.isValid, false, String(args));
            assert.ok((result.errorMessage || "").startsWith("Schema configuration error"), result.errorMessage);
        }
    });

    it("an empty constraints record asserts nothing", () => {
        assert.strictEqual(arrayItems.validate([1, 1, 1], {}).isValid, true);
    });

    it("a bound of the wrong JSON type is ignored rather than coerced", () => {
        assert.strictEqual(arrayItems.validate([], { minItems: "3" }).isValid, true);
        assert.strictEqual(arrayItems.validate([1, 2], { maxItems: true }).isValid, true);
        assert.strictEqual(arrayItems.validate([1, 1], { uniqueItems: "true" }).isValid, true);
    });

    it("extractRule activates on any one of the three keywords and forwards all three", () => {
        assert.strictEqual(arrayItems.extractRule(asMeta({ minItems: 0 })).active, true);
        assert.strictEqual(arrayItems.extractRule(asMeta({ maxItems: 0 })).active, true);
        assert.strictEqual(arrayItems.extractRule(asMeta({ uniqueItems: true })).active, true);
        assert.strictEqual(arrayItems.extractRule(asMeta({ uniqueItems: false })).active, false,
            "uniqueItems: false asserts nothing, so there is nothing to run");
        assert.strictEqual(arrayItems.extractRule(asMeta({})).active, false);
        assert.deepStrictEqual(arrayItems.extractRule(asMeta({ minItems: 1, maxItems: 2, uniqueItems: true })).args, {
            minItems: 1,
            maxItems: 2,
            uniqueItems: true
        });
    });

    it("what extractRule produces is what validate consumes", () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 0, max: 4 }),
                fc.integer({ min: 0, max: 4 }),
                fc.array(fc.integer({ min: 0, max: 2 }), { maxLength: 7 }),
                (min, span, value) => {
                    const max = min + span;
                    const rule = arrayItems.extractRule(asMeta({ minItems: min, maxItems: max }));
                    const expected = value.length >= min && value.length <= max;
                    assert.strictEqual(arrayItems.validate(value, rule.args).isValid, expected);
                }
            ),
            { numRuns: 300 }
        );
    });
});

describe("canonicalSerialize", () => {
    it("two structurally equal values serialize identically whatever their key order", () => {
        assert.strictEqual(canonicalSerialize({ a: 1, b: 2 }), canonicalSerialize({ b: 2, a: 1 }));
        assert.strictEqual(
            canonicalSerialize({ outer: { x: 1, y: 2 } }),
            canonicalSerialize({ outer: { y: 2, x: 1 } })
        );
    });

    it("array order is significant, object key order is not", () => {
        assert.notStrictEqual(canonicalSerialize([1, 2]), canonicalSerialize([2, 1]));
        assert.strictEqual(canonicalSerialize([{ a: 1, b: 2 }]), canonicalSerialize([{ b: 2, a: 1 }]));
    });

    it("values of different JSON types never collide", () => {
        const forms = [1, "1", true, "true", null, [], {}, [1], { a: 1 }];
        const serialized = forms.map(canonicalSerialize);
        assert.strictEqual(new Set(serialized).size, forms.length, `collision among ${serialized.join(" | ")}`);
    });

    it("an array and an object are never serialized the same way", () => {
        assert.notStrictEqual(canonicalSerialize([]), canonicalSerialize({}));
        assert.notStrictEqual(canonicalSerialize(["a"]), canonicalSerialize({ 0: "a" }));
    });

    it("serialization is deterministic across calls", () => {
        fc.assert(
            fc.property(fc.jsonValue(), (value) => {
                assert.strictEqual(canonicalSerialize(value), canonicalSerialize(value));
            }),
            { numRuns: 200 }
        );
    });
});

describe("ConstValidatorPlugin — JSON Schema const", () => {
    const constValidator = new ConstValidatorPlugin();

    it("the declared constant is the only accepted value", () => {
        for (const expected of ["a", 7, true, false, 0]) {
            assert.strictEqual(constValidator.validate(expected, expected).isValid, true, JSON.stringify(expected));
        }
        assert.strictEqual(constValidator.validate("b", "a").isValid, false);
        assert.strictEqual(constValidator.validate(8, 7).isValid, false);
        assert.strictEqual(constValidator.validate("7", 7).isValid, false, "const is compared without coercion");
        assert.strictEqual(constValidator.validate(true, 1).isValid, false);
    });

    it("the rejection message names the expected constant", () => {
        const result = constValidator.validate("b", "a");
        assert.strictEqual(result.errorMessage, I18n.getText(TEXT_KEY.constEquality, ["a"]));
    });

    it("values the required validator owns are deferred", () => {
        for (const value of [null, undefined, ""]) {
            assert.strictEqual(constValidator.validate(value, "a").isValid, true, JSON.stringify(value));
        }
    });

    it("no declared constant asserts nothing", () => {
        assert.strictEqual(constValidator.validate("anything", undefined).isValid, true);
    });

    it("extractRule activates exactly when const is declared, including for falsy constants", () => {
        assert.deepStrictEqual(constValidator.extractRule(asMeta({ const: "a" })), { active: true, args: "a" });
        assert.deepStrictEqual(constValidator.extractRule(asMeta({ const: 0 })), { active: true, args: 0 });
        assert.deepStrictEqual(constValidator.extractRule(asMeta({ const: false })), { active: true, args: false });
        assert.deepStrictEqual(constValidator.extractRule(asMeta({ const: null })), { active: true, args: null });
        assert.deepStrictEqual(constValidator.extractRule(asMeta({})), { active: false });
    });
});

describe("MultipleOfValidatorPlugin — JSON Schema multipleOf", () => {
    const multipleOf = new MultipleOfValidatorPlugin();

    it("a value divisible by the step is accepted and one that is not is rejected", () => {
        fc.assert(
            fc.property(fc.integer({ min: 1, max: 12 }), fc.integer({ min: -60, max: 60 }), (step, value) => {
                const expected = value % step === 0;
                const result = multipleOf.validate(value, step);
                assert.strictEqual(result.isValid, expected, `${value} against multipleOf ${step}`);
                if (!expected) {
                    expectRejectedWith(result, TEXT_KEY.multipleOf, [step], `${value} % ${step}`);
                }
            })
        );
    });

    it("zero is a multiple of every step", () => {
        for (const step of [1, 0.5, 3, 1e-6]) {
            assert.strictEqual(multipleOf.validate(0, step).isValid, true, String(step));
        }
    });

    it("a fractional step works despite binary floating point", () => {
        // 0.3 / 0.1 is 2.9999999999999996 in IEEE 754; a naive remainder test rejects it.
        assert.strictEqual(multipleOf.validate(0.3, 0.1).isValid, true);
        assert.strictEqual(multipleOf.validate(0.35, 0.05).isValid, true);
        assert.strictEqual(multipleOf.validate(1.05, 0.01).isValid, true);
        assert.strictEqual(multipleOf.validate(0.35, 0.1).isValid, false);
    });

    it("a non-finite value is rejected as not a finite number", () => {
        for (const value of [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
            expectRejectedWith(multipleOf.validate(value, 2), TEXT_KEY.finiteNumber, [], String(value));
        }
    });

    it("NaN and non-numeric values are left to the type validators", () => {
        for (const value of [Number.NaN, "6", true, null, undefined, [6], {}]) {
            assert.strictEqual(multipleOf.validate(value, 2).isValid, true, JSON.stringify(value));
        }
    });

    it("a step that is not a positive finite number is a schema configuration error", () => {
        for (const step of [0, -1, "2", null, undefined, Number.NaN, Number.POSITIVE_INFINITY, [2]]) {
            const result = multipleOf.validate(6, step);
            assert.strictEqual(result.isValid, false, JSON.stringify(step));
            assert.ok(
                (result.errorMessage || "").startsWith("Schema configuration error"),
                `${JSON.stringify(step)}: ${result.errorMessage}`
            );
        }
    });

    it("a step so small that the quotient overflows is reported, not accepted", () => {
        const result = multipleOf.validate(Number.MAX_VALUE, Number.MIN_VALUE);
        assert.strictEqual(result.isValid, false);
        assert.strictEqual(result.errorMessage, I18n.getText(TEXT_KEY.multipleOf, [Number.MIN_VALUE]));
    });

    it("extractRule activates exactly when multipleOf is declared", () => {
        assert.deepStrictEqual(multipleOf.extractRule(asMeta({ multipleOf: 3 })), { active: true, args: 3 });
        assert.deepStrictEqual(multipleOf.extractRule(asMeta({ multipleOf: 0 })), { active: true, args: 0 });
        assert.strictEqual(multipleOf.extractRule(asMeta({})).active, false);
    });
});

describe("IntegerValidatorPlugin", () => {
    const integer = new IntegerValidatorPlugin();

    it("a whole number is accepted and a fractional one is rejected", () => {
        fc.assert(
            fc.property(fc.integer({ min: -1000, max: 1000 }), fc.integer({ min: 0, max: 99 }), (whole, fraction) => {
                assert.strictEqual(integer.validate(whole).isValid, true, String(whole));
                if (fraction !== 0) {
                    assert.strictEqual(integer.validate(whole + fraction / 100).isValid, false);
                }
            })
        );
    });

    it("the boundary values are whole numbers", () => {
        for (const value of [0, -0, Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER, 1e21]) {
            assert.strictEqual(integer.validate(value).isValid, true, String(value));
        }
    });

    it("a non-finite number is rejected", () => {
        for (const value of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
            expectRejectedWith(integer.validate(value), TEXT_KEY.integer, [], String(value));
        }
    });

    it("a non-number is left to the type and parser layers", () => {
        for (const value of ["7", "", null, undefined, true, [7], {}]) {
            assert.strictEqual(integer.validate(value).isValid, true, JSON.stringify(value));
        }
    });

    it("extractRule activates on the integer type and on nothing else", () => {
        assert.strictEqual(integer.extractRule(asMeta({ type: "integer" })).active, true);
        for (const type of ["number", "string", "Integer", "", undefined]) {
            assert.strictEqual(integer.extractRule(asMeta({ type })).active, false, String(type));
        }
    });
});
