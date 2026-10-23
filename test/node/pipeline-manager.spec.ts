/**
 * @file pipeline-manager.spec.ts
 * @description The pipeline's registry, chaining and fail-closed contracts, stated absolutely.
 *
 * `pipeline.spec.ts` covers the individual plugins. This file covers the coordinator: which names
 * are registered, the order a formatter chain and its inverse parser chain run in, and the two
 * opposite error contracts the class documents —
 *
 *  - {@link PipelineManager.executeValidation} fails **closed**: an unregistered rule name and a
 *    validator that throws both produce `{ isValid: false }` with a diagnostic, because a
 *    misconfigured field must be reported, never waved through (engineering rule 2);
 *  - {@link PipelineManager.runFormatters} fails **soft**: a formatter runs inside a UI5 property
 *    binding, where a thrown error takes the whole render, so a crashing step degrades to the safe
 *    string form of its input and the chain still yields a display value.
 *
 * The registered names are contract, not an implementation detail: they are the strings a consuming
 * schema writes in `ui.validators` and `ui.formatters`, and `docs/wiki/AI_Schema_CheatSheet.md`
 * publishes them. The parity gate in `scripts/run-tests.js` checks the widget and layout keys the
 * same way.
 */

import * as assert from "assert";
import { fc, withLogCapture, reported } from "./fc-config";
import { IFormatter, IParser, IValidationResult, IValidator } from "../../src/nz/co/siliconst/ui5/metaui/interfaces/IPipeline";
import { IPropertyMetadata } from "../../src/nz/co/siliconst/ui5/metaui/interfaces/ISchema";
import { PipelineManager } from "../../src/nz/co/siliconst/ui5/metaui/core/PipelineManager";

/** A descriptor literal, typed as the metadata the pipeline receives. */
const asMeta = (literal: Record<string, unknown>): IPropertyMetadata =>
    literal as unknown as IPropertyMetadata;

/** Every validator name a schema may name in `ui.validators`. */
const REGISTERED_VALIDATORS: readonly string[] = [
    "required",
    "maxLength",
    "pattern",
    "minLength",
    "range",
    "multipleOf",
    "arrayItems",
    "url",
    "iban",
    "email",
    "enum",
    "const",
    "integer",
    "objectProperties"
];

/** Every formatter name a schema may name in `ui.formatters`. */
const REGISTERED_FORMATTERS: readonly string[] = ["date", "phone", "textCase", "currency"];

/** The formatters that are presentational, i.e. that can be inverted to recover the model value. */
const REGISTERED_PARSERS: readonly string[] = ["date", "phone", "currency"];

describe("PipelineManager — the registry is the public naming contract", () => {
    const pipeline = PipelineManager.getInstance();

    it("getInstance returns the one shared pipeline", () => {
        assert.strictEqual(PipelineManager.getInstance(), pipeline);
    });

    it("every documented validator name resolves to a validator", () => {
        for (const name of REGISTERED_VALIDATORS) {
            const validator = pipeline.validators.get(name);
            assert.ok(validator, `validator '${name}' is not registered`);
            assert.strictEqual(typeof validator?.validate, "function", name);
        }
    });

    it("every documented formatter name resolves to a formatter", () => {
        for (const name of REGISTERED_FORMATTERS) {
            const formatter = pipeline.formatters.get(name);
            assert.ok(formatter, `formatter '${name}' is not registered`);
            assert.strictEqual(typeof formatter?.format, "function", name);
        }
    });

    it("exactly the presentational formatters are registered as parsers", () => {
        for (const name of REGISTERED_PARSERS) {
            assert.ok(pipeline.parsers.get(name), `parser '${name}' is not registered`);
        }
        assert.strictEqual(pipeline.parsers.get("textCase"), undefined,
            "textCase is one-way; registering it as a parser would rewrite the model on every render");
    });

    it("a name that was never registered resolves to nothing", () => {
        for (const name of ["", "nope", "Required", "REQUIRED", "toString", "constructor", "__proto__"]) {
            assert.strictEqual(pipeline.validators.get(name), undefined, `validators leaked '${name}'`);
            assert.strictEqual(pipeline.formatters.get(name), undefined, `formatters leaked '${name}'`);
        }
    });

    it("the registry keys are exactly the documented set, with nothing extra", () => {
        assert.deepStrictEqual([...pipeline.validators.items.keys()].sort(), [...REGISTERED_VALIDATORS].sort());
        assert.deepStrictEqual([...pipeline.formatters.items.keys()].sort(), [...REGISTERED_FORMATTERS].sort());
        assert.deepStrictEqual([...pipeline.parsers.items.keys()].sort(), [...REGISTERED_PARSERS].sort());
    });
});

describe("PipelineManager — hasPresentationalParser", () => {
    const pipeline = PipelineManager.getInstance();

    it("is true for a presentational formatter and false for a one-way one", () => {
        for (const name of REGISTERED_PARSERS) {
            assert.strictEqual(pipeline.hasPresentationalParser(name), true, name);
        }
        assert.strictEqual(pipeline.hasPresentationalParser("textCase"), false);
        assert.strictEqual(pipeline.hasPresentationalParser("nope"), false);
    });

    it("a chain is presentational when any of its steps is", () => {
        assert.strictEqual(pipeline.hasPresentationalParser(["textCase", "currency"]), true);
        assert.strictEqual(pipeline.hasPresentationalParser(["currency", "textCase"]), true);
        assert.strictEqual(pipeline.hasPresentationalParser(["textCase", "nope"]), false);
        assert.strictEqual(pipeline.hasPresentationalParser([]), false);
    });

    it("a single name and a one-element array mean the same thing", () => {
        for (const name of [...REGISTERED_FORMATTERS, "nope"]) {
            assert.strictEqual(pipeline.hasPresentationalParser(name), pipeline.hasPresentationalParser([name]), name);
        }
    });
});

describe("PipelineManager — formatter and parser chains", () => {
    const pipeline = PipelineManager.getInstance();

    it("a single name and a one-element array format the same", () => {
        assert.strictEqual(pipeline.runFormatters("ab", "textCase"), pipeline.runFormatters("ab", ["textCase"]));
    });

    it("an unregistered name in a chain is skipped, leaving the value untouched", () => {
        assert.strictEqual(pipeline.runFormatters("ab", "nope"), "ab");
        assert.strictEqual(pipeline.runFormatters("ab", ["nope", "textCase"]), "AB");
        assert.strictEqual(pipeline.runParsers("ab", "nope"), "ab");
    });

    it("an empty chain is the identity", () => {
        const sentinel = { untouched: true };
        assert.strictEqual(pipeline.runFormatters(sentinel, []), sentinel);
        assert.strictEqual(pipeline.runParsers(sentinel, []), sentinel);
    });

    it("the parser chain runs in the reverse order of the formatter chain", () => {
        // Formatting applies left to right; recovering the model value has to undo the last step
        // first, or a two-step chain cannot be inverted at all.
        const order: string[] = [];
        const probe = (name: string): IFormatter & IParser => ({
            format: (value: unknown): string => {
                order.push(`format:${name}`);
                return `${value}`;
            },
            parse: (value: unknown): unknown => {
                order.push(`parse:${name}`);
                return value;
            }
        });
        const local = new PipelineManager();
        local.formatters.register("first", probe("first"));
        local.formatters.register("second", probe("second"));
        local.parsers.register("first", probe("first"));
        local.parsers.register("second", probe("second"));
        local.runFormatters("x", ["first", "second"]);
        local.runParsers("x", ["first", "second"]);
        assert.deepStrictEqual(order, ["format:first", "format:second", "parse:second", "parse:first"]);
    });

    it("a formatter with a parse method is usable as a parser even when not registered as one", () => {
        const local = new PipelineManager();
        local.formatters.register("twoWay", {
            format: (value: unknown): string => `<${value}>`,
            parse: (value: unknown): unknown => String(value).replace(/^<|>$/g, "")
        } as IFormatter);
        assert.strictEqual(local.hasPresentationalParser("twoWay"), true);
        assert.strictEqual(local.runParsers("<x>", "twoWay"), "x");
    });

    it("a formatter with no parse method is not usable as a parser", () => {
        const local = new PipelineManager();
        local.formatters.register("oneWay", { format: (value: unknown): string => `${value}!` } as IFormatter);
        assert.strictEqual(local.hasPresentationalParser("oneWay"), false);
        assert.strictEqual(local.runParsers("x!", "oneWay"), "x!");
    });

    it("a formatter with a non-function parse property is not usable as a parser", () => {
        const local = new PipelineManager();
        local.formatters.register("fake", {
            format: (value: unknown): string => `${value}`,
            parse: "not a function"
        } as unknown as IFormatter);
        assert.strictEqual(local.hasPresentationalParser("fake"), false);
    });

    it("a crashing formatter is reported and degrades to the string form of its input", () => {
        const local = new PipelineManager();
        local.formatters.register("boom", {
            format: (): string => {
                throw new Error("formatter exploded");
            }
        } as IFormatter);
        const { value, entries } = withLogCapture(() => local.runFormatters(42, "boom"));
        assert.strictEqual(value, "42", "the chain did not degrade to the safe string form");
        assert.ok(reported(entries, "boom"), "the crash was not reported");
    });

    it("a crash in one step does not abandon the rest of the chain", () => {
        const local = new PipelineManager();
        local.formatters.register("boom", {
            format: (): string => {
                throw new Error("formatter exploded");
            }
        } as IFormatter);
        local.formatters.register("shout", { format: (value: unknown): string => `${value}!` } as IFormatter);
        const { value } = withLogCapture(() => local.runFormatters("x", ["boom", "shout"]));
        assert.strictEqual(value, "x!");
    });

    it("a formatter chain never throws, whatever it is given", () => {
        fc.assert(
            fc.property(fc.anything(), fc.anything(), (value, args) => {
                withLogCapture(() => pipeline.runFormatters(value, [...REGISTERED_FORMATTERS], args));
            }),
            { numRuns: 200 }
        );
    });
});

describe("PipelineManager — executeValidation fails closed", () => {
    const pipeline = PipelineManager.getInstance();

    it("an unregistered rule name is a schema configuration error, not a pass", () => {
        const { value, entries } = withLogCapture(() => pipeline.executeValidation("x", ["noSuchRule"]));
        assert.strictEqual(value.isValid, false);
        assert.ok((value.errorMessage || "").startsWith("Schema configuration error"), value.errorMessage);
        assert.ok(reported(entries, "noSuchRule"), "the misconfiguration was not reported");
    });

    it("a crashing validator is a system error, not a pass", () => {
        const local = new PipelineManager();
        local.validators.register("boom", {
            validate: (): IValidationResult => {
                throw new Error("validator exploded");
            }
        } as IValidator);
        const { value, entries } = withLogCapture(() => local.executeValidation("x", ["boom"]));
        assert.strictEqual(value.isValid, false);
        assert.strictEqual(typeof value.errorMessage, "string");
        assert.ok(reported(entries, "boom"), "the crash was not reported");
    });

    it("validation stops at the first failing rule", () => {
        const seen: string[] = [];
        const local = new PipelineManager();
        const probe = (name: string, verdict: boolean): IValidator => ({
            validate: (): IValidationResult => {
                seen.push(name);
                return verdict ? { isValid: true } : { isValid: false, errorMessage: name };
            }
        });
        local.validators.register("a", probe("a", true));
        local.validators.register("b", probe("b", false));
        local.validators.register("c", probe("c", true));
        const result = local.executeValidation("x", ["a", "b", "c"]);
        assert.strictEqual(result.errorMessage, "b");
        assert.deepStrictEqual(seen, ["a", "b"], "a rule after the failure still ran");
    });

    it("an empty rule list accepts everything", () => {
        assert.strictEqual(pipeline.executeValidation("x", []).isValid, true);
        assert.strictEqual(pipeline.executeValidation(null, []).isValid, true);
    });

    it("each rule receives its own entry from the args map and nothing else", () => {
        const received: Record<string, unknown> = {};
        const local = new PipelineManager();
        for (const name of ["a", "b"]) {
            local.validators.register(name, {
                validate: (_value: unknown, args: unknown): IValidationResult => {
                    received[name] = args;
                    return { isValid: true };
                }
            } as IValidator);
        }
        local.executeValidation("x", ["a", "b"], { a: 1, b: 2, c: 3 });
        assert.deepStrictEqual(received, { a: 1, b: 2 });
    });
});

describe("PipelineManager — the empty-value short circuit", () => {
    const pipeline = PipelineManager.getInstance();
    const EMPTY: readonly unknown[] = [null, undefined, "", "   ", Number.NaN, []];

    it("an empty value skips every rule when the field is not required", () => {
        for (const value of EMPTY) {
            const result = pipeline.executeValidation(value, ["email", "pattern", "maxLength"], {
                pattern: "^zzz$",
                maxLength: 0
            });
            assert.strictEqual(result.isValid, true, `${JSON.stringify(value)} was validated anyway`);
        }
    });

    it("an empty value is still checked when the field is required", () => {
        for (const value of [null, undefined, "", "   "]) {
            const result = pipeline.executeValidation(value, ["required"], { required: { required: true } });
            assert.strictEqual(result.isValid, false, `${JSON.stringify(value)} passed a required field`);
        }
    });

    it("required: false in the args does not arm the required rule for an empty value", () => {
        const result = pipeline.executeValidation("", ["required", "email"], { required: { required: false } });
        assert.strictEqual(result.isValid, true);
    });

    it("a null value with nullable: false is still rejected, since the rule is about null itself", () => {
        const result = pipeline.executeValidation(null, ["required"], {
            required: { required: false, nullable: false }
        });
        assert.strictEqual(result.isValid, false);
    });

    it("an empty array is still checked when an array rule is present", () => {
        const result = pipeline.executeValidation([], ["arrayItems"], { arrayItems: { minItems: 1 } });
        assert.strictEqual(result.isValid, false, "minItems was skipped for the empty array it is about");
    });

    it("an empty object is still checked when an object rule is present", () => {
        const result = pipeline.executeValidation({}, ["objectProperties"], {
            objectProperties: { minProperties: 1 }
        });
        assert.strictEqual(result.isValid, false, "minProperties was skipped for the empty object it is about");
    });

    it("an array rule does not arm the check for a non-array value", () => {
        assert.strictEqual(pipeline.executeValidation("", ["arrayItems", "pattern"], { pattern: "^zzz$" }).isValid,
            true);
    });

    it("an object rule does not arm the check for an array or a null", () => {
        assert.strictEqual(
            pipeline.executeValidation([], ["objectProperties", "pattern"], { pattern: "^zzz$" }).isValid,
            true
        );
        assert.strictEqual(
            pipeline.executeValidation(null, ["objectProperties", "pattern"], { pattern: "^zzz$" }).isValid,
            true
        );
    });
});

describe("PipelineManager — assembleAndExecute", () => {
    const pipeline = PipelineManager.getInstance();

    it("a descriptor with no constraints at all accepts every value", () => {
        fc.assert(
            fc.property(fc.anything(), (value) => {
                assert.strictEqual(pipeline.assembleAndExecute(asMeta({ type: "string" }), value).isValid, true);
            }),
            { numRuns: 200 }
        );
    });

    it("each declared constraint arms exactly its own validator", () => {
        assert.strictEqual(pipeline.assembleAndExecute(asMeta({ type: "string", maxLength: 2 }), "abc").isValid,
            false);
        assert.strictEqual(pipeline.assembleAndExecute(asMeta({ type: "string", minLength: 4 }), "abc").isValid,
            false);
        assert.strictEqual(pipeline.assembleAndExecute(asMeta({ type: "string", format: "email" }), "nope").isValid,
            false);
        assert.strictEqual(pipeline.assembleAndExecute(asMeta({ type: "number", maximum: 1 }), 5).isValid, false);
        assert.strictEqual(pipeline.assembleAndExecute(asMeta({ type: "string", enum: ["a"] }), "b").isValid, false);
        assert.strictEqual(pipeline.assembleAndExecute(asMeta({ type: "string", const: "a" }), "b").isValid, false);
    });

    it("an explicit ui.validators name is run in addition to the extracted ones", () => {
        const meta = asMeta({ type: "string", ui: { validators: ["email"] } });
        assert.strictEqual(pipeline.assembleAndExecute(meta, "not an address").isValid, false);
        assert.strictEqual(pipeline.assembleAndExecute(meta, "a@b.co").isValid, true);
    });

    it("an explicit ui.validators entry may carry its own arguments", () => {
        const meta = asMeta({ type: "string", ui: { validators: [{ name: "maxLength", args: 2 }] } });
        assert.strictEqual(pipeline.assembleAndExecute(meta, "abc").isValid, false);
        assert.strictEqual(pipeline.assembleAndExecute(meta, "ab").isValid, true);
    });

    it("an explicit entry naming an already-armed validator does not run it twice", () => {
        const meta = asMeta({ type: "string", maxLength: 9, ui: { validators: ["maxLength", "maxLength"] } });
        assert.strictEqual(pipeline.assembleAndExecute(meta, "abc").isValid, true);
    });

    it("an unregistered name in ui.validators is reported rather than ignored", () => {
        const meta = asMeta({ type: "string", ui: { validators: ["maxLenght"] } });
        const { value } = withLogCapture(() => pipeline.assembleAndExecute(meta, "abc"));
        assert.strictEqual(value.isValid, false);
        assert.ok((value.errorMessage || "").startsWith("Schema configuration error"), value.errorMessage);
    });

    it("a malformed ui.validators entry is skipped without arming anything", () => {
        const meta = asMeta({ type: "string", ui: { validators: [null, 0, {}, { args: 1 }] } });
        assert.strictEqual(pipeline.assembleAndExecute(meta, "abc").isValid, true);
    });

    it("the dynamic required override arms the required rule even when the schema does not", () => {
        const meta = asMeta({ type: "string" });
        assert.strictEqual(pipeline.assembleAndExecute(meta, "", true).isValid, false);
        assert.strictEqual(pipeline.assembleAndExecute(meta, "").isValid, true);
    });

    it("runValidators is assembleAndExecute under another name", () => {
        fc.assert(
            fc.property(
                fc.constantFrom("", "abc", "a@b.co", "zzzz"),
                fc.constantFrom(
                    { type: "string" },
                    { type: "string", maxLength: 2 },
                    { type: "string", format: "email" },
                    { type: "string", required: true }
                ),
                (value, declaration) => {
                    const meta = asMeta(declaration);
                    assert.deepStrictEqual(pipeline.runValidators(value, meta), pipeline.assembleAndExecute(meta,
                        value));
                }
            ),
            { numRuns: 200 }
        );
    });
});
