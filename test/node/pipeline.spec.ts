/**
 * @file pipeline.spec.ts
 * @description Properties of the formatter/parser/validator pipeline.
 *
 * Two contracts are under test:
 *  - a presentational formatter is reversible, so rendering a value and reading it back does not
 *    rewrite the model;
 *  - a validator is total — it returns a verdict for every input and never throws, because it runs
 *    synchronously inside a UI5 property binding on every keystroke.
 *
 * `CurrencyFormatterPlugin` and `DateFormatterPlugin` call `sap.ui.core.format.*`, which is stubbed
 * for Node by `test/node/ui5-stub.js`. The stub's `format`/`parse` are exact inverses over the
 * generated domain (en-US grouping, two fraction digits, `MMM d, yyyy`), so any round-trip failure
 * is attributable to the plugin's own pre/post-processing. Locale behaviour itself remains the
 * browser QUnit suite's responsibility.
 */

import * as assert from "assert";
import { fc } from "./fc-config";
import { JsonRecord, admits, isPlainObject, primitiveSchemaArb } from "./arbitraries";
import { IValidationResult, IValidator } from "../../src/nz/co/siliconst/ui5/metaui/interfaces/IPipeline";
import { PhoneFormatterPlugin } from "../../src/nz/co/siliconst/ui5/metaui/plugins/formatters/PhoneFormatterPlugin";
import { CurrencyFormatterPlugin } from "../../src/nz/co/siliconst/ui5/metaui/plugins/formatters/CurrencyFormatterPlugin";
import { DateFormatterPlugin } from "../../src/nz/co/siliconst/ui5/metaui/plugins/formatters/DateFormatterPlugin";
import { TextCaseFormatterPlugin } from "../../src/nz/co/siliconst/ui5/metaui/plugins/formatters/TextCaseFormatterPlugin";
import { ArrayItemsValidatorPlugin } from "../../src/nz/co/siliconst/ui5/metaui/plugins/validators/ArrayItemsValidatorPlugin";
import { ConstValidatorPlugin } from "../../src/nz/co/siliconst/ui5/metaui/plugins/validators/ConstValidatorPlugin";
import { EmailValidatorPlugin } from "../../src/nz/co/siliconst/ui5/metaui/plugins/validators/EmailValidatorPlugin";
import { EnumValidatorPlugin } from "../../src/nz/co/siliconst/ui5/metaui/plugins/validators/EnumValidatorPlugin";
import { IbanValidatorPlugin } from "../../src/nz/co/siliconst/ui5/metaui/plugins/validators/IbanValidatorPlugin";
import { IntegerValidatorPlugin } from "../../src/nz/co/siliconst/ui5/metaui/plugins/validators/IntegerValidatorPlugin";
import { MaxLengthValidatorPlugin } from "../../src/nz/co/siliconst/ui5/metaui/plugins/validators/MaxLengthValidatorPlugin";
import { MinLengthValidatorPlugin } from "../../src/nz/co/siliconst/ui5/metaui/plugins/validators/MinLengthValidatorPlugin";
import { MultipleOfValidatorPlugin } from "../../src/nz/co/siliconst/ui5/metaui/plugins/validators/MultipleOfValidatorPlugin";
import { ObjectPropertiesValidatorPlugin } from "../../src/nz/co/siliconst/ui5/metaui/plugins/validators/ObjectPropertiesValidatorPlugin";
import { PatternValidatorPlugin } from "../../src/nz/co/siliconst/ui5/metaui/plugins/validators/PatternValidatorPlugin";
import { RangeValidatorPlugin } from "../../src/nz/co/siliconst/ui5/metaui/plugins/validators/RangeValidatorPlugin";
import { RequiredValidatorPlugin } from "../../src/nz/co/siliconst/ui5/metaui/plugins/validators/RequiredValidatorPlugin";
import { UrlValidatorPlugin } from "../../src/nz/co/siliconst/ui5/metaui/plugins/validators/UrlValidatorPlugin";
import { OpenApiConstraintMapper } from "../../src/nz/co/siliconst/ui5/metaui/openapi/parsers/OpenApiConstraintMapper";
import { PipelineManager } from "../../src/nz/co/siliconst/ui5/metaui/core/PipelineManager";
import { SchemaNormalizer } from "../../src/nz/co/siliconst/ui5/metaui/core/SchemaNormalizer";
import { IPropertyMetadata } from "../../src/nz/co/siliconst/ui5/metaui/interfaces/ISchema";

/**
 * A value whose primitive conversion throws. `JSON.parse('{"toString":0}')` is valid JSON and
 * produces exactly this shape, so it can arrive from a server payload. It was finding F8: every
 * formatter and `ConstValidatorPlugin` reached an unguarded `String(...)` and propagated the
 * TypeError out of a UI5 property binding. They now convert through `SafeConvert`, so the
 * totality properties below carry no exemption for it and the fixture is asserted directly.
 */
const PRIMITIVE_HOSTILE: unknown = JSON.parse('{"toString":0}');

/** True for values MetaUI's pipeline treats as empty and therefore skips validation for. */
function metaUiEmpty(value: unknown): boolean {
    return (
        value === null ||
        value === undefined ||
        (typeof value === "string" && value.trim() === "") ||
        (typeof value === "number" && Number.isNaN(value)) ||
        (Array.isArray(value) && value.length === 0)
    );
}

const digits = (count: number): fc.Arbitrary<string> =>
    fc.array(fc.constantFrom("0", "1", "2", "3", "4", "5", "6", "7", "8", "9"), {
        minLength: count,
        maxLength: count
    }).map((parts) => parts.join(""));

const digitsBetween = (min: number, max: number): fc.Arbitrary<string> =>
    fc.integer({ min, max }).chain((count) => digits(count));

/** Raw phone values the formatter documents as reversible. */
const phoneArb: fc.Arbitrary<string> = fc.oneof(
    digits(10),
    digits(10).map((rest) => `+1${rest}`),
    fc.tuple(digits(2), digitsBetween(7, 10)).map(([cc, rest]) => `+${cc}${rest}`),
    fc.tuple(digits(3), digitsBetween(6, 10)).map(([cc, rest]) => `+${cc}${rest}`)
);

describe("formatters — presentational round-trip", () => {
    const phone = new PhoneFormatterPlugin();
    const currency = new CurrencyFormatterPlugin();
    const date = new DateFormatterPlugin();
    const textCase = new TextCaseFormatterPlugin();

    it("phone: parse(format(v)) === v for every documented raw form", () => {
        fc.assert(
            fc.property(phoneArb, (raw) => {
                assert.strictEqual(phone.parse(phone.format(raw)), raw);
            })
        );
    });

    it("phone: formatting is stable under a second round-trip", () => {
        fc.assert(
            fc.property(fc.string({ maxLength: 20 }), (raw) => {
                const once = phone.format(raw);
                const twice = phone.format(phone.parse(once));
                assert.strictEqual(twice, once, "a second render changed the display value");
            })
        );
    });

    it("F7 (known defect): an 11-digit national number is rewritten to E.164 by one round-trip", () => {
        // `format` maps both "15551234567" and "+15551234567" to "+1 (555) 123-4567", so no parse
        // can invert both. With two-way binding the stored value gains a "+" without any user edit.
        // Delete this test when `format` stops promoting the unprefixed 11-digit form.
        assert.strictEqual(phone.format("15551234567"), "+1 (555) 123-4567");
        assert.strictEqual(phone.parse(phone.format("15551234567")), "+15551234567");
    });

    it("currency: parse(format(v)) === v for two-decimal amounts", () => {
        fc.assert(
            fc.property(
                fc.integer({ min: -100_000_000_000, max: 100_000_000_000 }),
                fc.constantFrom("$", "€", "£", "USD"),
                (cents, symbol) => {
                    const value = Number((cents / 100).toFixed(2));
                    assert.strictEqual(currency.parse(currency.format(value, symbol), symbol), value);
                }
            )
        );
    });

    it("date: parse(format(iso)) === iso", () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 1000, max: 9999 }),
                fc.integer({ min: 1, max: 12 }),
                fc.integer({ min: 1, max: 28 }),
                (year, month, day) => {
                    const iso = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(
                        day
                    ).padStart(2, "0")}`;
                    assert.strictEqual(date.parse(date.format(iso)), iso);
                }
            )
        );
    });

    it("date: a 29 February in a leap year survives the round-trip", () => {
        for (const iso of ["2024-02-29", "2000-02-29", "1996-02-29"]) {
            assert.strictEqual(date.parse(date.format(iso)), iso);
        }
    });

    it("text case: formatting is total and idempotent", () => {
        fc.assert(
            fc.property(fc.anything(), fc.constantFrom("upper", "lower", "title"), (value, mode) => {
                const once = textCase.format(value, mode);
                assert.strictEqual(typeof once, "string");
                if (mode !== "title") {
                    assert.strictEqual(textCase.format(once, mode), once);
                }
            })
        );
    });
});

describe("formatters and parsers — totality", () => {
    const reversible = [
        ["phone", new PhoneFormatterPlugin()],
        ["currency", new CurrencyFormatterPlugin()],
        ["date", new DateFormatterPlugin()]
    ] as const;

    for (const [name, plugin] of reversible) {
        it(`${name}: format returns a string and parse never throws, for any input`, () => {
            fc.assert(
                fc.property(fc.anything(), fc.anything(), (value, args) => {
                    const formatted = plugin.format(value, args);
                    assert.strictEqual(typeof formatted, "string", "format returned a non-string");
                    plugin.parse(value, args);
                    plugin.parse(formatted, args);
                })
            );
        });
    }
});

describe("formatters and validators — a value with no primitive conversion", () => {
    /**
     * `JSON.parse('{"toString":0}')` yields an object whose `String(...)` conversion throws
     * `TypeError: Cannot convert object to primitive value`. A formatter runs inside a UI5
     * property binding, where a thrown error takes the render with it, so the conversion has to
     * be total. This was finding F8; `SafeConvert.safeToString` is the fix.
     */
    it("String() on a server-supplied {\"toString\": 0} still throws, so the hazard is real", () => {
        assert.throws(() => String(PRIMITIVE_HOSTILE), TypeError);
    });

    it("every formatter renders it as a string instead of throwing", () => {
        for (const plugin of [
            new PhoneFormatterPlugin(),
            new CurrencyFormatterPlugin(),
            new DateFormatterPlugin(),
            new TextCaseFormatterPlugin()
        ]) {
            const rendered = plugin.format(PRIMITIVE_HOSTILE);
            assert.strictEqual(typeof rendered, "string", `${plugin.constructor.name} did not return a string`);
        }
    });

    it("ConstValidatorPlugin builds its rejection message instead of throwing", () => {
        const result = new ConstValidatorPlugin().validate({}, PRIMITIVE_HOSTILE);
        assert.strictEqual(result.isValid, false);
        assert.strictEqual(typeof result.errorMessage, "string");
    });

    it("the value survives the whole pipeline as an ordinary rejection", () => {
        const result = PipelineManager.getInstance().executeValidation({ a: 1 }, ["const"], {
            const: PRIMITIVE_HOSTILE
        });
        assert.strictEqual(result.isValid, false);
        assert.ok(
            !(result.errorMessage || "").startsWith("System validation error"),
            "the validator still crashed and was caught by the pipeline's guard"
        );
    });
});

describe("validators — totality", () => {
    const validators: ReadonlyArray<readonly [string, IValidator]> = [
        ["arrayItems", new ArrayItemsValidatorPlugin()],
        ["const", new ConstValidatorPlugin()],
        ["email", new EmailValidatorPlugin()],
        ["enum", new EnumValidatorPlugin()],
        ["iban", new IbanValidatorPlugin()],
        ["integer", new IntegerValidatorPlugin()],
        ["maxLength", new MaxLengthValidatorPlugin()],
        ["minLength", new MinLengthValidatorPlugin()],
        ["multipleOf", new MultipleOfValidatorPlugin()],
        ["objectProperties", new ObjectPropertiesValidatorPlugin()],
        ["pattern", new PatternValidatorPlugin()],
        ["range", new RangeValidatorPlugin()],
        ["required", new RequiredValidatorPlugin()],
        ["url", new UrlValidatorPlugin()]
    ];

    for (const [name, validator] of validators) {
        it(`${name}: returns a verdict and never throws, for any value and any args`, () => {
            fc.assert(
                fc.property(fc.anything(), fc.anything(), (value, args) => {
                    const result: IValidationResult = validator.validate(value, args);
                    assert.ok(isPlainObject(result), "validate did not return a result object");
                    assert.strictEqual(typeof result.isValid, "boolean");
                    if (!result.isValid) {
                        assert.strictEqual(typeof result.errorMessage, "string", "a rejection carried no message");
                    }
                }),
                { numRuns: 400 }
            );
        });

        it(`${name}: extractRule never throws on an arbitrary descriptor`, () => {
            if (!validator.extractRule) {
                return;
            }
            fc.assert(
                fc.property(
                    fc.dictionary(
                        fc.constantFrom(
                            "type",
                            "required",
                            "minLength",
                            "maxLength",
                            "pattern",
                            "enum",
                            "const",
                            "minimum",
                            "maximum",
                            "exclusiveMinimum",
                            "exclusiveMaximum",
                            "multipleOf",
                            "minItems",
                            "maxItems",
                            "uniqueItems",
                            "minProperties",
                            "maxProperties",
                            "format",
                            "nullable",
                            "items"
                        ),
                        fc.anything(),
                        { maxKeys: 6 }
                    ),
                    fc.option(fc.boolean(), { nil: undefined }),
                    (descriptor, dynamicRequired) => {
                        const extraction = validator.extractRule!(
                            descriptor as unknown as IPropertyMetadata,
                            dynamicRequired
                        );
                        assert.strictEqual(typeof extraction.active, "boolean");
                    }
                ),
                { numRuns: 300 }
            );
        });
    }
});

/**
 * Differential check between the assembled validator battery and the hand-written reference
 * evaluator. Restricted to well-typed, non-empty values: MetaUI's validators deliberately ignore
 * values of the wrong type (coercion is the binding type's job) and defer empty values to
 * `RequiredValidatorPlugin`, so a disagreement there would be about documented policy, not about
 * whether a constraint is enforced.
 */
describe("validators — agreement with the reference evaluator", () => {
    const enforceable = primitiveSchemaArb.filter((leaf) => leaf.format === undefined);

    const typedValueArb = (leaf: JsonRecord): fc.Arbitrary<unknown> => {
        if (leaf.type === "boolean") return fc.boolean();
        if (leaf.type === "integer") return fc.integer({ min: -60, max: 60 });
        if (leaf.type === "number") return fc.integer({ min: -120, max: 120 }).map((n) => n / 2);
        return fc.oneof(
            fc.string({ minLength: 1, maxLength: 10 }),
            fc.constantFrom("a", "ab", "abc", "A0", "zzz", "12", "1234", "q", "a\nb")
        );
    };

    it("the pipeline accepts exactly the well-typed non-empty values the reference admits", () => {
        fc.assert(
            fc.property(
                enforceable.chain((leaf) => fc.tuple(fc.constant(leaf), typedValueArb(leaf))),
                ([leaf, value]) => {
                    if (metaUiEmpty(value)) {
                        // MetaUI skips every validator for an "empty" value unless the field is
                        // required — including whitespace-only strings. Divergence D2.
                        return;
                    }
                    const schema = SchemaNormalizer.normalize({
                        type: "object",
                        properties: { field: leaf }
                    });
                    const meta = schema.properties?.field as IPropertyMetadata;
                    const actual = PipelineManager.getInstance().assembleAndExecute(meta, value).isValid;
                    assert.strictEqual(
                        actual,
                        admits(leaf, value),
                        `pipeline says ${actual} for ${JSON.stringify(value)} against ${JSON.stringify(leaf)}`
                    );
                }
            )
        );
    });
});

describe("validators — composed allOf patterns stay executable", () => {
    it("a pattern produced by allOf composition is accepted by the pattern validator", () => {
        const patternValidator = new PatternValidatorPlugin();
        fc.assert(
            fc.property(
                fc.constantFrom("^[a-z]+$", "[0-9]{2,4}", "^A", "b$", "(?:ab)+", "[a-z]*q"),
                fc.constantFrom("^[a-z]+$", "[0-9]{2,4}", "^A", "b$", "(?:ab)+", "[a-z]*q"),
                fc.string({ minLength: 1, maxLength: 8 }),
                (left, right, probe) => {
                    const merged = OpenApiConstraintMapper.resolveAllOf(
                        { allOf: [{ pattern: left }, { pattern: right }] },
                        {}
                    );
                    const result = patternValidator.validate(probe, merged.pattern);
                    assert.ok(
                        !(result.errorMessage || "").startsWith("Schema configuration error"),
                        `the mapper produced a pattern its own validator refuses: ${result.errorMessage}`
                    );
                }
            ),
            { numRuns: 500 }
        );
    });
});
