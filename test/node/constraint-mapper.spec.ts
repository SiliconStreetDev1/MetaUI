/**
 * @file constraint-mapper.spec.ts
 * @description What `OpenApiConstraintMapper` writes onto a descriptor, keyword by keyword.
 *
 * `allof-merge.spec.ts` covers {@link OpenApiConstraintMapper.deepMergeSchemas} and
 * {@link OpenApiConstraintMapper.resolveAllOf}. What it does not cover is the plain copy step:
 * `applyConstraints` and `applyStateModifiers`, which are what turn a raw OpenAPI schema object
 * into the descriptor the validators are assembled from.
 *
 * As in `normalizer-keywords.spec.ts`, the reference is JSON Schema's own type table: a keyword of
 * the right JSON type is carried verbatim, and a keyword of the wrong JSON type is dropped rather
 * than coerced. Two OpenAPI-specific rules are stated as well:
 *
 *  - the draft-4 boolean spelling of `exclusiveMinimum`/`exclusiveMaximum` is a *modifier* on the
 *    matching inclusive bound and means nothing without it, while the draft-6+ numeric spelling is
 *    a bound in its own right;
 *  - a `format` with no declared `pattern` is enriched with the RFC pattern for that format. That
 *    pattern is asserted by what it accepts and rejects — the RFC's own corpus — rather than by
 *    its source text, so the regexes stay free to be rewritten.
 */

import * as assert from "assert";
import { fc } from "./fc-config";
import { IPropertyMetadata } from "../../src/nz/co/siliconst/ui5/metaui/interfaces/ISchema";
import {
    OpenApiConstraintMapper
} from "../../src/nz/co/siliconst/ui5/metaui/openapi/parsers/OpenApiConstraintMapper";

/** Applies the constraint copy to a fresh descriptor and returns it. */
function constrain(declaration: Record<string, unknown>): IPropertyMetadata {
    const meta: IPropertyMetadata = { type: "string" };
    OpenApiConstraintMapper.applyConstraints(meta, declaration);
    return meta;
}

/** Applies the state-modifier copy to a fresh descriptor and returns it. */
function modify(declaration: Record<string, unknown>): IPropertyMetadata {
    const meta: IPropertyMetadata = { type: "string" };
    OpenApiConstraintMapper.applyStateModifiers(meta, declaration);
    return meta;
}

const NUMERIC_KEYWORDS: readonly string[] = [
    "maxLength",
    "minLength",
    "maximum",
    "minimum",
    "multipleOf",
    "maxItems",
    "minItems",
    "maxProperties",
    "minProperties"
];

/** Values of every JSON type other than `number`. */
const NOT_A_NUMBER: readonly unknown[] = ["5", true, false, null, [5], { value: 5 }];

describe("OpenApiConstraintMapper — applyConstraints copies the declared keywords", () => {
    for (const keyword of NUMERIC_KEYWORDS) {
        it(`${keyword}: a number is carried, anything else is dropped, absence stays absent`, () => {
            for (const value of [0, 1, 42, -3, 2.5]) {
                assert.strictEqual(
                    constrain({ [keyword]: value })[keyword as keyof IPropertyMetadata],
                    value,
                    `${keyword}=${value}`
                );
            }
            for (const value of [...NOT_A_NUMBER, Number.NaN, Number.POSITIVE_INFINITY]) {
                assert.strictEqual(
                    constrain({ [keyword]: value })[keyword as keyof IPropertyMetadata],
                    undefined,
                    `${keyword}=${JSON.stringify(value)} was accepted`
                );
            }
            assert.strictEqual(constrain({})[keyword as keyof IPropertyMetadata], undefined, keyword);
        });
    }

    it("pattern: a string is carried, anything else is dropped", () => {
        assert.strictEqual(constrain({ pattern: "^a$" }).pattern, "^a$");
        assert.strictEqual(constrain({ pattern: "" }).pattern, "");
        assert.strictEqual(constrain({ pattern: 7 }).pattern, undefined);
        assert.strictEqual(constrain({}).pattern, undefined);
    });

    it("uniqueItems: a boolean is carried either way, anything else is dropped", () => {
        assert.strictEqual(constrain({ uniqueItems: true }).uniqueItems, true);
        assert.strictEqual(constrain({ uniqueItems: false }).uniqueItems, false);
        assert.strictEqual(constrain({ uniqueItems: "true" }).uniqueItems, undefined);
        assert.strictEqual(constrain({}).uniqueItems, undefined);
    });

    it("a declaration carrying no constraints leaves the descriptor untouched", () => {
        const meta: IPropertyMetadata = { type: "string", title: "kept" };
        OpenApiConstraintMapper.applyConstraints(meta, {});
        assert.deepStrictEqual(meta, { type: "string", title: "kept" });
    });

    it("every numeric keyword is copied independently of the others", () => {
        fc.assert(
            fc.property(
                fc.uniqueArray(fc.constantFrom(...NUMERIC_KEYWORDS), { minLength: 1 }),
                fc.integer({ min: 0, max: 40 }),
                (keywords, value) => {
                    const declaration: Record<string, unknown> = {};
                    for (const keyword of keywords) {
                        declaration[keyword] = value;
                    }
                    const meta = constrain(declaration);
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

describe("OpenApiConstraintMapper — the two spellings of an exclusive bound", () => {
    it("the draft-6 numeric spelling is a bound in its own right", () => {
        assert.strictEqual(constrain({ exclusiveMinimum: 3 }).exclusiveMinimum, 3);
        assert.strictEqual(constrain({ exclusiveMaximum: 9 }).exclusiveMaximum, 9);
        assert.strictEqual(constrain({ exclusiveMinimum: 0 }).exclusiveMinimum, 0);
        assert.strictEqual(constrain({ exclusiveMaximum: -1.5 }).exclusiveMaximum, -1.5);
    });

    it("the draft-4 boolean spelling modifies the matching inclusive bound", () => {
        assert.strictEqual(constrain({ minimum: 3, exclusiveMinimum: true }).exclusiveMinimum, true);
        assert.strictEqual(constrain({ maximum: 9, exclusiveMaximum: true }).exclusiveMaximum, true);
    });

    it("the draft-4 boolean true means nothing without the bound it modifies", () => {
        // `{ "exclusiveMinimum": true }` with no `minimum` describes no interval at all. Carrying it
        // would hand RangeValidatorPlugin a modifier with nothing to modify.
        assert.strictEqual(constrain({ exclusiveMinimum: true }).exclusiveMinimum, undefined);
        assert.strictEqual(constrain({ exclusiveMaximum: true }).exclusiveMaximum, undefined);
    });

    it("the draft-4 boolean false is carried whether or not the bound is present", () => {
        assert.strictEqual(constrain({ exclusiveMinimum: false }).exclusiveMinimum, false);
        assert.strictEqual(constrain({ minimum: 3, exclusiveMinimum: false }).exclusiveMinimum, false);
        assert.strictEqual(constrain({ exclusiveMaximum: false }).exclusiveMaximum, false);
        assert.strictEqual(constrain({ maximum: 9, exclusiveMaximum: false }).exclusiveMaximum, false);
    });

    it("an exclusive bound of the wrong JSON type is dropped", () => {
        for (const value of ["3", null, [3], { value: 3 }]) {
            assert.strictEqual(constrain({ minimum: 1, exclusiveMinimum: value }).exclusiveMinimum, undefined,
                JSON.stringify(value));
            assert.strictEqual(constrain({ maximum: 1, exclusiveMaximum: value }).exclusiveMaximum, undefined,
                JSON.stringify(value));
        }
        assert.strictEqual(constrain({}).exclusiveMinimum, undefined);
        assert.strictEqual(constrain({}).exclusiveMaximum, undefined);
    });

    it("the minimum and maximum bounds themselves still reach the descriptor", () => {
        const meta = constrain({ minimum: 1, maximum: 9, exclusiveMinimum: true, exclusiveMaximum: true });
        assert.strictEqual(meta.minimum, 1);
        assert.strictEqual(meta.maximum, 9);
        assert.strictEqual(meta.exclusiveMinimum, true);
        assert.strictEqual(meta.exclusiveMaximum, true);
    });
});

describe("OpenApiConstraintMapper — RFC patterns for known formats", () => {
    /** The pattern the mapper substitutes for `format`, compiled. */
    const patternFor = (format: string): RegExp => {
        const pattern = constrain({ format }).pattern;
        assert.strictEqual(typeof pattern, "string", `no pattern was substituted for format '${format}'`);
        return new RegExp(pattern as string);
    };

    it("uuid accepts RFC 4122 forms and rejects near misses", () => {
        const uuid = patternFor("uuid");
        for (const accepted of [
            "123e4567-e89b-12d3-a456-426614174000",
            "00000000-0000-0000-0000-000000000000",
            "FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF",
            "f81d4fae-7dec-11d0-a765-00a0c91e6bf6"
        ]) {
            assert.ok(uuid.test(accepted), `uuid rejected ${accepted}`);
        }
        for (const rejected of [
            "123e4567e89b12d3a456426614174000",
            "123e4567-e89b-12d3-a456-42661417400",
            "123e4567-e89b-12d3-a456-4266141740000",
            "123e4567-e89b-12d3-a456-42661417400g",
            "",
            "not-a-uuid"
        ]) {
            assert.ok(!uuid.test(rejected), `uuid accepted ${rejected}`);
        }
    });

    it("ipv4 accepts dotted quads in range and rejects out-of-range or malformed ones", () => {
        const ipv4 = patternFor("ipv4");
        for (const accepted of ["0.0.0.0", "255.255.255.255", "192.168.1.1", "8.8.8.8", "10.0.0.255"]) {
            assert.ok(ipv4.test(accepted), `ipv4 rejected ${accepted}`);
        }
        for (const rejected of ["256.0.0.1", "1.2.3", "1.2.3.4.5", "1.2.3.a", "", "1.2.3.", "999.999.999.999"]) {
            assert.ok(!ipv4.test(rejected), `ipv4 accepted ${rejected}`);
        }
    });

    it("ipv6 accepts the fully written form and rejects truncated ones", () => {
        const ipv6 = patternFor("ipv6");
        for (const accepted of [
            "2001:0db8:85a3:0000:0000:8a2e:0370:7334",
            "0:0:0:0:0:0:0:1",
            "fe80:0:0:0:0:0:0:1"
        ]) {
            assert.ok(ipv6.test(accepted), `ipv6 rejected ${accepted}`);
        }
        for (const rejected of ["2001:db8::1", "1:2:3:4:5:6:7", "1:2:3:4:5:6:7:8:9", "", "12345:0:0:0:0:0:0:1"]) {
            assert.ok(!ipv6.test(rejected), `ipv6 accepted ${rejected}`);
        }
    });

    it("hostname accepts RFC 1123 labels and rejects malformed ones", () => {
        const hostname = patternFor("hostname");
        for (const accepted of ["example", "example.com", "a.b.c.d", "xn--bcher-kva.example", "a-1.b-2.co"]) {
            assert.ok(hostname.test(accepted), `hostname rejected ${accepted}`);
        }
        for (const rejected of ["-example.com", "example-.com", "exa mple.com", "", "exam_ple.com", "a..b"]) {
            assert.ok(!hostname.test(rejected), `hostname accepted ${rejected}`);
        }
    });

    it("a declared pattern is never replaced by the format's pattern", () => {
        assert.strictEqual(constrain({ format: "uuid", pattern: "^x$" }).pattern, "^x$");
        assert.strictEqual(constrain({ format: "ipv4", pattern: "" }).pattern, "");
    });

    it("a format with no RFC pattern leaves the descriptor patternless", () => {
        for (const format of ["email", "date", "date-time", "uri", "password", "byte", "binary", "unknown-format"]) {
            assert.strictEqual(constrain({ format }).pattern, undefined, format);
        }
    });

    it("a non-string format is ignored", () => {
        assert.strictEqual(constrain({ format: 7 }).pattern, undefined);
        assert.strictEqual(constrain({ format: ["uuid"] }).pattern, undefined);
    });
});

describe("OpenApiConstraintMapper — applyStateModifiers", () => {
    it("readOnly and writeOnly are set only by an explicit true", () => {
        assert.strictEqual(modify({ readOnly: true }).readOnly, true);
        assert.strictEqual(modify({ writeOnly: true }).writeOnly, true);
        for (const value of [false, "true", 1, null]) {
            assert.strictEqual(modify({ readOnly: value }).readOnly, undefined, JSON.stringify(value));
            assert.strictEqual(modify({ writeOnly: value }).writeOnly, undefined, JSON.stringify(value));
        }
        assert.strictEqual(modify({}).readOnly, undefined);
        assert.strictEqual(modify({}).writeOnly, undefined);
    });

    it("all three nullability spellings mean nullable", () => {
        assert.strictEqual(modify({ nullable: true }).nullable, true, "OpenAPI 3.0");
        assert.strictEqual(modify({ "x-nullable": true }).nullable, true, "OpenAPI 2.0 vendor extension");
        assert.strictEqual(modify({ type: ["string", "null"] }).nullable, true, "JSON Schema union type");
        assert.strictEqual(modify({ type: ["null"] }).nullable, true);
    });

    it("nothing else makes a property nullable", () => {
        assert.strictEqual(modify({ nullable: false }).nullable, undefined);
        assert.strictEqual(modify({ "x-nullable": false }).nullable, undefined);
        assert.strictEqual(modify({ nullable: "true" }).nullable, undefined);
        assert.strictEqual(modify({ type: ["string", "integer"] }).nullable, undefined);
        assert.strictEqual(modify({ type: "null" }).nullable, undefined, "a scalar type is not a union");
        assert.strictEqual(modify({}).nullable, undefined);
    });

    it("deprecated is deliberately not carried, since nothing consumes it", () => {
        const meta = modify({ deprecated: true });
        assert.strictEqual(Object.prototype.hasOwnProperty.call(meta, "deprecated"), false);
    });

    it("default, example and const are carried whenever present, including falsy values", () => {
        assert.strictEqual(modify({ default: 0 }).default, 0);
        assert.strictEqual(modify({ default: false }).default, false);
        assert.strictEqual(modify({ default: "" }).default, "");
        assert.strictEqual(modify({ default: null }).default, null);
        assert.strictEqual(modify({ example: 0 }).example, 0);
        assert.strictEqual(modify({ const: false }).const, false);
        assert.strictEqual(modify({}).default, undefined);
        assert.strictEqual(modify({}).example, undefined);
        assert.strictEqual(modify({}).const, undefined);
    });

    it("an explicit undefined is the same as absence", () => {
        assert.strictEqual(modify({ default: undefined }).default, undefined);
        assert.strictEqual(modify({ const: undefined }).const, undefined);
    });

    it("a structured default, example or const is copied rather than shared", () => {
        for (const keyword of ["default", "example", "const"] as const) {
            const declared = { nested: [1, 2] };
            const carried = modify({ [keyword]: declared })[keyword];
            assert.deepStrictEqual(carried, declared);
            assert.notStrictEqual(carried, declared, `${keyword} shares a reference with the source schema`);
        }
    });
});

describe("OpenApiConstraintMapper — applyDiscriminator", () => {
    /** Applies the discriminator copy to a fresh descriptor and returns it. */
    const discriminate = (declaration: Record<string, unknown>): IPropertyMetadata => {
        const meta: IPropertyMetadata = { type: "object" };
        OpenApiConstraintMapper.applyDiscriminator(meta, declaration);
        return meta;
    };

    it("the OpenAPI 2.0 string form names the property", () => {
        assert.strictEqual(discriminate({ discriminator: "kind" }).discriminator?.propertyName, "kind");
    });

    it("the OpenAPI 3.0 object form carries propertyName and mapping", () => {
        const meta = discriminate({
            discriminator: { propertyName: "kind", mapping: { dog: "#/components/schemas/Dog" } }
        });
        assert.strictEqual(meta.discriminator?.propertyName, "kind");
        assert.deepStrictEqual(meta.discriminator?.mapping, { dog: "#/components/schemas/Dog" });
    });

    it("a discriminator with no property name is not a discriminator", () => {
        for (const value of [undefined, "", {}, { mapping: {} }, { propertyName: "" }, 7, []]) {
            assert.strictEqual(discriminate({ discriminator: value }).discriminator, undefined,
                JSON.stringify(value));
        }
        assert.strictEqual(discriminate({}).discriminator, undefined);
    });
});
