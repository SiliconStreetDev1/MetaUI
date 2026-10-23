/**
 * @file pattern-safety.spec.ts
 * @description Properties of `PatternValidatorPlugin`, including its static ReDoS screen.
 *
 * The screen is a two-sided contract and both sides matter. Refusing too little lets a hostile
 * schema hang the browser on every keystroke; refusing too much turns a legitimate field
 * permanently invalid. The properties below pin both directions, and the accept path is checked
 * differentially against the JavaScript regular-expression engine itself, which is the only
 * oracle for "does this pattern match this string" that is not the implementation under test.
 */

import * as assert from "assert";
import { fc, reported, withLogCapture } from "./fc-config";
import {
    PatternValidatorPlugin,
    resetPatternSafetyState
} from "../../src/nz/co/siliconst/ui5/metaui/plugins/validators/PatternValidatorPlugin";

const validator = new PatternValidatorPlugin();

/**
 * Root hook: clear the module-level analysis memo and the quarantine list before every test in
 * the whole suite.
 *
 * `PatternValidatorPlugin` keeps both at module scope, and Stryker reuses a worker process across
 * mutants. Without this hook a verdict computed under one mutant was served from the memo to the
 * next, so the module's survivors were a measurement artefact rather than a statement about the
 * tests. It is a root hook rather than a per-file one because the shared `PipelineManager`
 * singleton routes pattern checks here from several other spec files.
 */
beforeEach(() => {
    resetPatternSafetyState();
});

/** True when the verdict is a refusal of the pattern rather than a verdict on the value. */
function isConfigurationError(message?: string): boolean {
    return (message || "").startsWith("Schema configuration error");
}

const literalArb = fc.constantFrom("a", "b", "c", "x", "y", "z", "0", "1", "9", "_", "-", "@", " ");
const classArb = fc.constantFrom("[a-z]", "[A-Z0-9]", "[^0-9]", "[abc]", "[\\w.-]", "\\d", "\\w", "\\s", ".");

/** Quantifiers that offer the engine only a handful of lengths. */
const boundedQuantifierArb = fc.constantFrom("", "", "", "?", "{2}", "{1,3}");

/** Quantifiers that let a single atom absorb a whole value. */
const openQuantifierArb = fc.constantFrom("*", "+", "{2,}");

/**
 * How many open quantifiers one generated "safe" pattern may carry.
 *
 * Two unbounded quantifiers that compete for the same characters give the engine 257² ≈ 66k splits,
 * which the screen allows and which measures 0.09 ms at the input cap; a third gives 1.7e7, which
 * it refuses. Four parts carrying two open quantifiers and two bounded ones reach at most
 * 257² × 3 × 2 ≈ 4e5, so a pattern from this generator stays inside the limit however its atoms
 * overlap — without the generator having to reimplement the screen to know that.
 */
const MAX_GENERATED_OPEN_QUANTIFIERS = 2;

/** One element of a generated pattern, before the open-quantifier budget is applied. */
interface IGeneratedPart {
    /** The atom's source text. */
    readonly atom: string;
    /** The quantifier to use when the part does not receive an open one. */
    readonly bounded: string;
    /** The quantifier to use when it does. */
    readonly open: string;
    /** Whether this part asked for an open quantifier. */
    readonly wantsOpen: boolean;
}

const generatedPartArb: fc.Arbitrary<IGeneratedPart> = fc.oneof(
    fc.record({
        atom: fc.oneof(literalArb, classArb),
        bounded: boundedQuantifierArb,
        open: openQuantifierArb,
        wantsOpen: fc.boolean()
    }),
    // A group never receives an open quantifier here: repeating one is the screen's other refusal
    // rule, and whether a generated alternation is ambiguous is not something this generator can
    // promise. Repeated groups are covered by their own properties below.
    fc.record({
        atom: fc
            .array(fc.tuple(literalArb, classArb).map(([a, b]) => a + b), { minLength: 1, maxLength: 3 })
            .map((branches) => `(?:${branches.join("|")})`),
        bounded: fc.constantFrom("", "?"),
        open: fc.constant(""),
        wantsOpen: fc.constant(false)
    })
);

/**
 * Patterns the screen must accept: no repeating quantifier over a group, and no sequence of
 * quantifiers whose combined choices exceed what the screen is willing to evaluate.
 */
const safePatternArb: fc.Arbitrary<string> = fc
    .tuple(fc.boolean(), fc.array(generatedPartArb, { minLength: 1, maxLength: 4 }), fc.boolean())
    .map(([anchorStart, parts, anchorEnd]) => {
        let openBudget = MAX_GENERATED_OPEN_QUANTIFIERS;
        const body = parts
            .map((part) => {
                const takesOpen = part.wantsOpen && openBudget > 0;
                if (takesOpen) {
                    openBudget--;
                }
                return part.atom + (takesOpen ? part.open : part.bounded);
            })
            .join("");
        return `${anchorStart ? "^" : ""}${body}${anchorEnd ? "$" : ""}`;
    });

/** Shapes the screen must refuse: a repeating quantifier over an all-variable or ambiguous group. */
const CATASTROPHIC_PATTERNS: readonly string[] = [
    "(a+)+",
    "(a*)*",
    "([a-z]+)+",
    "(\\d+)*",
    "(\\w*)+$",
    "^(a|a)+$",
    "(a|)*",
    "(x+|y+)+",
    "((a|b)+)+",
    "(?:[a-z]+)+",
    "^([a-zA-Z0-9]+)*$",
    "(a+){2,}",
    // Formerly finding F12: one extra layer of grouping defeated the screen, so `((a+))+` was
    // accepted while the equivalent `(a+)+` was refused. The nested group's `allVariable` summary
    // is now propagated into its parent, so these are classified with the single-level shapes.
    "((a+))+",
    "(?:(a+))+",
    "(((a+)))+",
    "((a*))*"
];

/** The documented carve-out: a repeated group anchored by a fixed atom is allowed to run. */
const ANCHORED_REPEAT_PATTERNS: readonly string[] = ["([a-z]+\\.)+", "(a+b)+", "(\\d{4})+", "(ab)+"];

const probeArb: fc.Arbitrary<string> = fc.string({
    unit: fc.constantFrom("a", "b", "c", "x", "z", "0", "9", "_", "-", "@", " ", ".", "\n"),
    maxLength: 10
});

describe("PatternValidatorPlugin — accept path", () => {
    it("for an accepted pattern the verdict is exactly RegExp.test", () => {
        fc.assert(
            fc.property(safePatternArb, probeArb, (pattern, probe) => {
                const result = validator.validate(probe, pattern);
                assert.ok(
                    !isConfigurationError(result.errorMessage),
                    `a safe pattern was refused: /${pattern}/ — ${result.errorMessage}`
                );
                if (probe === "") {
                    assert.strictEqual(result.isValid, true, "JSON Schema 'pattern' does not constrain an empty string");
                    return;
                }
                assert.strictEqual(
                    result.isValid,
                    new RegExp(pattern).test(probe),
                    `/${pattern}/ against ${JSON.stringify(probe)}`
                );
            })
        );
    });

    it("a repeated group anchored by a fixed atom is allowed to run", () => {
        for (const pattern of ANCHORED_REPEAT_PATTERNS) {
            const result = validator.validate("ab.ab.", pattern);
            assert.ok(
                !isConfigurationError(result.errorMessage),
                `the documented carve-out no longer applies to /${pattern}/: ${result.errorMessage}`
            );
            assert.strictEqual(result.isValid, new RegExp(pattern).test("ab.ab."));
        }
    });

    it("a non-string value is not constrained by 'pattern'", () => {
        fc.assert(
            fc.property(
                fc.oneof(fc.integer(), fc.boolean(), fc.constant(null), fc.constant(undefined), fc.array(fc.integer())),
                safePatternArb,
                (value, pattern) => {
                    assert.strictEqual(validator.validate(value, pattern).isValid, true);
                }
            ),
            { numRuns: 300 }
        );
    });
});

describe("PatternValidatorPlugin — refusal path", () => {
    it("refuses every catastrophic shape, reports it, and says so in the verdict", () => {
        for (const pattern of CATASTROPHIC_PATTERNS) {
            const { value, entries } = withLogCapture(() => validator.validate("aaaaaaaaaaaaaaaaaaaaaa!", pattern));
            assert.strictEqual(value.isValid, false, `/${pattern}/ was not refused`);
            assert.ok(
                isConfigurationError(value.errorMessage),
                `/${pattern}/ was rejected as a value mismatch, not as an unsafe pattern`
            );
            assert.ok((value.errorMessage || "").includes("unsafe"), `/${pattern}/ verdict: ${value.errorMessage}`);
            // The first call analyses and logs; a later call is served from the memo, so the log is
            // only asserted when this process has not seen the pattern before.
            if (entries.length > 0) {
                assert.ok(reported(entries, "REFUSED"), `the refusal of /${pattern}/ was not reported`);
            }
        }
    });

    it("refuses a pattern longer than the 512-character cap", () => {
        fc.assert(
            fc.property(fc.integer({ min: 513, max: 900 }), (length) => {
                const result = validator.validate("a", "a".repeat(length));
                assert.strictEqual(result.isValid, false);
                assert.ok((result.errorMessage || "").includes("longer than 512"));
            }),
            { numRuns: 60 }
        );
    });

    it("accepts a pattern exactly at the cap", () => {
        const result = validator.validate("a", "a".repeat(512));
        assert.ok(!(result.errorMessage || "").includes("longer than"), result.errorMessage);
    });

    it("refuses a malformed regular expression instead of skipping the constraint", () => {
        for (const pattern of ["[a-", "(unclosed", "a{2,1}", "*leading", "\\"]) {
            const result = validator.validate("abc", pattern);
            assert.strictEqual(result.isValid, false, `/${pattern}/ was silently skipped`);
            assert.ok(isConfigurationError(result.errorMessage), result.errorMessage);
        }
    });

    it("refuses a non-string pattern argument", () => {
        fc.assert(
            fc.property(fc.oneof(fc.integer(), fc.boolean(), fc.constant(null), fc.object()), (args) => {
                const result = validator.validate("abc", args);
                assert.strictEqual(result.isValid, false);
                assert.ok((result.errorMessage || "").includes("must be a string"));
            }),
            { numRuns: 200 }
        );
    });

    it("an empty value is never rejected, however unsafe the pattern", () => {
        for (const pattern of [...CATASTROPHIC_PATTERNS, "[a-", "a".repeat(600)]) {
            assert.strictEqual(validator.validate("", pattern).isValid, true);
        }
    });
});

/**
 * Finding F12 was not "four patterns are misclassified", it was "the screen reads the syntax
 * tree's shape instead of its meaning". Pinning the four examples would leave `((((a+))))+` and
 * `((a|a))+` open, so what is pinned here is the invariant they violated: **wrapping a
 * sub-expression in redundant parentheses must not change any verdict**. One layer of grouping is
 * semantically inert to the regular-expression engine, so it has to be inert to the screen too.
 */
describe("PatternValidatorPlugin — redundant grouping is transparent (F12)", () => {
    /** Bodies spanning both sides of the contract: unanchored, anchored, ambiguous and fixed. */
    const bodyArb = fc.constantFrom(
        "a+",
        "a*",
        "a?",
        "[a-z]+",
        "\\d+",
        "\\w*",
        "a+b",
        "[a-z]+\\.",
        "\\d{4}",
        "ab",
        "a|a",
        "a|",
        "[a-z]|[0-9]",
        "abc|def",
        "x+|y+",
        "\\w+\\s?",
        "a+a",
        "a?b"
    );
    const repeatArb = fc.constantFrom("+", "*", "{2,}", "{3}", "{1,4}");
    const wrapArb = fc.constantFrom("(", "(?:");

    /**
     * Wraps `body` in `depth` redundant groups.
     *
     * @param body The sub-expression.
     * @param depth How many extra layers to add.
     * @param open The opening delimiter to use for the extra layers.
     * @returns {string} The wrapped sub-expression.
     */
    function wrap(body: string, depth: number, open: string): string {
        let wrapped = body;
        for (let i = 0; i < depth; i++) {
            wrapped = `${open}${wrapped})`;
        }
        return wrapped;
    }

    it("adding redundant layers of grouping never changes the verdict", () => {
        fc.assert(
            fc.property(
                bodyArb,
                repeatArb,
                wrapArb,
                fc.integer({ min: 1, max: 3 }),
                probeArb,
                (body, repeat, open, depth, probe) => {
                    const flat = `^(${body})${repeat}$`;
                    const nested = `^(${wrap(body, depth, open)})${repeat}$`;
                    const flatResult = validator.validate(probe || "aaaa!", flat);
                    const nestedResult = validator.validate(probe || "aaaa!", nested);
                    assert.strictEqual(
                        isConfigurationError(nestedResult.errorMessage),
                        isConfigurationError(flatResult.errorMessage),
                        `/${nested}/ is screened differently from /${flat}/: ` +
                            `${nestedResult.errorMessage} vs ${flatResult.errorMessage}`
                    );
                    assert.strictEqual(nestedResult.isValid, flatResult.isValid, `/${nested}/ vs /${flat}/`);
                }
            ),
            { numRuns: 600 }
        );
    });

    it("the verdict is transparent for a long value too, so the two land in the same cost tier", () => {
        const long = "ab.".repeat(120);
        fc.assert(
            fc.property(bodyArb, repeatArb, wrapArb, (body, repeat, open) => {
                const flat = `^(${body})${repeat}$`;
                const nested = `^(${wrap(body, 2, open)})${repeat}$`;
                assert.strictEqual(
                    validator.validate(long, nested).errorMessage,
                    validator.validate(long, flat).errorMessage,
                    `/${nested}/ and /${flat}/ disagree on a ${long.length}-character value`
                );
            }),
            { numRuns: 200 }
        );
    });

    it("a repeat whose only fixed element can be eaten by its variable one is refused", () => {
        // The carve-out's rationale is that the fixed element pins each iteration. `a` in `(a+a)+`
        // pins nothing, because `a+` consumes it, and the repeat is exponential after all.
        for (const pattern of ["^(a+a)+$", "^([a-z]+[a-z])+$", "^([\\w.]+\\.)+$", "^(.+,)+$", "^((a+a))+$"]) {
            const result = validator.validate("aaaaaaaa!", pattern);
            assert.ok(isConfigurationError(result.errorMessage), `/${pattern}/ was not refused`);
        }
    });

    it("a repeat pinned by a disjoint fixed element is still allowed to run", () => {
        // The other side of the same test: refusing these would brick ordinary domain, hostname,
        // reference-code and IPv6 fields, which is the over-rejection the screen was tuned against.
        const legitimate: ReadonlyArray<readonly [string, string]> = [
            ["^(?:[a-z]+\\.)+[a-z]{2,}$", "example.com"],
            ["^([A-Z]+-)+\\d+$", "AB-CD-12"],
            ["^([a-z]|[0-9])+$", "a1b2"],
            ["^(abc|def)+$", "abcdef"],
            ["^(a?b)+$", "abab"],
            ["^([^,]+,)+$", "ab,cd,"],
            ["^(\\w+\\.)+$", "ab.cd."],
            ["^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$", "2001:0db8:85a3:0000:0000:8a2e:0370:7334"],
            ["^([a-z0-9]([a-z0-9-]*[a-z0-9])?\\.)+[a-z]{2,}$", "my-host.example.com"]
        ];
        for (const [pattern, value] of legitimate) {
            const result = validator.validate(value, pattern);
            assert.ok(
                !isConfigurationError(result.errorMessage),
                `a legitimate pattern was refused: /${pattern}/ — ${result.errorMessage}`
            );
            assert.strictEqual(result.isValid, new RegExp(pattern).test(value), `/${pattern}/ against ${value}`);
        }
    });
});

/**
 * The screen's point is that the *first* evaluation never reaches the user's thread. A refusal
 * that arrives after the blow-up is not a refusal, which is what the 50 ms budget alone bought:
 * it is measured after `RegExp.test` returns. These properties bound the first call.
 */
describe("PatternValidatorPlugin — the first evaluation is bounded", () => {
    /** Values long enough that an unscreened exponential pattern takes minutes, not milliseconds. */
    const EXPLOSIVE_INPUT = "a".repeat(44) + "!";

    it("no refused shape is ever executed, however explosive the value", () => {
        for (const pattern of [...CATASTROPHIC_PATTERNS, "^(a+a)+$", "^((a+))+$", "^(?:(a+))+$"]) {
            const startedAt = Date.now();
            validator.validate(EXPLOSIVE_INPUT, pattern);
            const elapsed = Date.now() - startedAt;
            // Generous by three orders of magnitude: the refusal is static, and `((a+))+` on this
            // input took 53 s before the screen inherited variability through the nesting.
            assert.ok(elapsed < 1000, `/${pattern}/ was evaluated rather than refused (${elapsed}ms)`);
        }
    });

    it("a pattern that cannot be proven linear refuses a value past the 256-character cap", () => {
        const unproven = "^(?:[a-z]+\\.)+[a-z]{2,}$";
        assert.ok(!isConfigurationError(validator.validate("a".repeat(252) + ".com", unproven).errorMessage));
        const result = validator.validate("a".repeat(253) + ".com", unproven);
        assert.strictEqual(result.isValid, false);
        assert.ok((result.errorMessage || "").includes("unproven"), result.errorMessage);
    });

    it("a pattern the screen proved linear is not capped", () => {
        fc.assert(
            fc.property(fc.integer({ min: 257, max: 4000 }), (length) => {
                const result = validator.validate("a".repeat(length), "^[a-z]+$");
                assert.strictEqual(result.isValid, true, result.errorMessage);
            }),
            { numRuns: 40 }
        );
    });

    it("every accepted shape stays inside the budget at the cap length", () => {
        const atCap = "ab.".repeat(86).slice(0, 256);
        for (const pattern of [...ANCHORED_REPEAT_PATTERNS, "^(?:[a-z]+\\.)+[a-z]{2,}$", "^([A-Z]+-)+\\d+$"]) {
            const startedAt = Date.now();
            const result = validator.validate(atCap, pattern);
            const elapsed = Date.now() - startedAt;
            assert.ok(!isConfigurationError(result.errorMessage), `/${pattern}/: ${result.errorMessage}`);
            assert.ok(elapsed < 500, `/${pattern}/ took ${elapsed}ms on a ${atCap.length}-character value`);
        }
    });
});

/**
 * Finding M1. The memo and the quarantine are module-level and live for the whole process, which
 * made the analyser untestable from the inside: no case could re-observe an analysis, and a
 * mutation-testing worker carried verdicts from one mutant to the next.
 */
describe("PatternValidatorPlugin — the caches can be reset (M1)", () => {
    it("the analysis is memoised, and resetting makes it observable again", () => {
        const pattern = "^((((a+))))+$";
        resetPatternSafetyState();
        const first = withLogCapture(() => validator.validate("aaaa!", pattern));
        assert.ok(isConfigurationError(first.value.errorMessage));
        assert.ok(reported(first.entries, "REFUSED"), "the first analysis was not reported");

        const memoized = withLogCapture(() => validator.validate("aaaa!", pattern));
        assert.strictEqual(memoized.value.errorMessage, first.value.errorMessage);
        assert.ok(!reported(memoized.entries, "REFUSED"), "the verdict was re-analysed instead of memoised");

        resetPatternSafetyState();
        const reanalyzed = withLogCapture(() => validator.validate("aaaa!", pattern));
        assert.strictEqual(reanalyzed.value.errorMessage, first.value.errorMessage);
        assert.ok(reported(reanalyzed.entries, "REFUSED"), "the memo survived resetPatternSafetyState");
    });

    it("the budget is no longer load-bearing: a slow shape is refused or capped before it runs", () => {
        // This case used `^.*.*.*x$` to reach the quarantine, because that shape has no repeated
        // group and the post-hoc budget was the only thing that caught its polynomial cost. The
        // screen now refuses it outright and caps everything it cannot prove linear, so no pattern
        // it accepts can reach the budget at all. That is the stronger guarantee, and it is what is
        // asserted here; the quarantine stays as a backstop against a future error in the model.
        const slow: readonly string[] = [
            "^.*.*.*x$",
            "^.*.*.*.*.*x$",
            "^(?:a*)(?:a*)(?:a*)x$",
            "^a{0,9}a{0,9}a{0,9}a{0,9}a{0,9}a{0,9}a{0,9}b$",
            "^(a+a)+$",
            "^((a+))+$",
            "^([\\u0400-\\u0450a]+[\\u0440-\\u04ffb])+$",
            "^(?:[a-z]+\\.)+[a-z]{2,}$"
        ];
        for (const pattern of slow) {
            const startedAt = Date.now();
            const result = validator.validate("a".repeat(2000) + "!", pattern);
            const elapsed = Date.now() - startedAt;
            assert.strictEqual(result.isValid, false, `/${pattern}/ was accepted`);
            assert.ok(isConfigurationError(result.errorMessage), `/${pattern}/: ${result.errorMessage}`);
            assert.ok(
                !(result.errorMessage || "").includes("time budget"),
                `/${pattern}/ reached the budget after running for ${elapsed}ms instead of being refused or capped`
            );
            assert.ok(elapsed < 500, `/${pattern}/ took ${elapsed}ms`);
        }
    });

    it("resetting is idempotent and leaves verdicts unchanged", () => {
        fc.assert(
            fc.property(fc.oneof(safePatternArb, fc.constantFrom(...CATASTROPHIC_PATTERNS)), probeArb, (pattern, probe) => {
                const before = validator.validate(probe, pattern);
                resetPatternSafetyState();
                resetPatternSafetyState();
                const after = validator.validate(probe, pattern);
                assert.strictEqual(after.isValid, before.isValid);
                assert.strictEqual(after.errorMessage, before.errorMessage);
            }),
            { numRuns: 200 }
        );
    });
});

/**
 * Nesting is not the only way to make backtracking superlinear, and this is the sequential half of
 * the same contract. `^.*.*.*x$` has no repeated group at all, yet its three `.*` atoms redistribute
 * one run of characters between them: 13.9 s on a 200-character value, measured. The screen decides
 * it with the same disjointness probe it uses for repeats, so the properties below vary the number
 * of quantifiers, whether their token sets overlap, and how much redundant grouping is wrapped
 * around them — a future weakening of the probe fails here rather than in production.
 */
describe("PatternValidatorPlugin — consecutive quantifiers (F13)", () => {
    /** Atoms that pairwise overlap: every one of them matches `a`, so none pins another's split. */
    const OVERLAPPING: readonly string[] = ["a", "[a-c]", "[a-z]", "\\w", "."];

    /** Atoms that are pairwise disjoint, so each one ends the run before it. */
    const DISJOINT: readonly string[] = ["[a-c]", "[d-f]", "[0-9]", "[,;]"];

    /** The point at which the product of the choices exceeds what the screen will evaluate. */
    const REFUSED_FROM = 3;

    const openArb = fc.constantFrom("*", "+", "{2,}");

    /**
     * Wraps a sub-expression in redundant groups.
     *
     * @param body The sub-expression.
     * @param depth How many layers to add.
     * @param open The opening delimiter for those layers.
     * @returns {string} The wrapped sub-expression.
     */
    function nest(body: string, depth: number, open: string): string {
        let wrapped = body;
        for (let i = 0; i < depth; i++) {
            wrapped = `${open}${wrapped})`;
        }
        return wrapped;
    }

    it("a sequence of overlapping open quantifiers is refused from the third one on", () => {
        fc.assert(
            fc.property(
                fc.array(fc.tuple(fc.constantFrom(...OVERLAPPING), openArb), { minLength: 1, maxLength: 5 }),
                (atoms) => {
                    const pattern = `^${atoms.map(([atom, quantifier]) => atom + quantifier).join("")}!$`;
                    const refused = isConfigurationError(validator.validate("aaaa", pattern).errorMessage);
                    assert.strictEqual(
                        refused,
                        atoms.length >= REFUSED_FROM,
                        `/${pattern}/ carries ${atoms.length} overlapping quantifiers and was ` +
                            `${refused ? "refused" : "accepted"}`
                    );
                }
            ),
            { numRuns: 400 }
        );
    });

    it("a sequence of pairwise-disjoint open quantifiers is accepted however long it is", () => {
        fc.assert(
            fc.property(
                fc.uniqueArray(fc.constantFrom(...DISJOINT), { minLength: 1, maxLength: DISJOINT.length }),
                fc.array(openArb, { minLength: DISJOINT.length, maxLength: DISJOINT.length }),
                (atoms, quantifiers) => {
                    const pattern = `^${atoms.map((atom, i) => atom + quantifiers[i]).join("")}$`;
                    const result = validator.validate("abc", pattern);
                    assert.ok(
                        !isConfigurationError(result.errorMessage),
                        `each atom pins the one before it, yet /${pattern}/ was refused: ${result.errorMessage}`
                    );
                    assert.strictEqual(result.isValid, new RegExp(pattern).test("abc"), `/${pattern}/`);
                }
            ),
            { numRuns: 300 }
        );
    });

    it("redundant grouping around each element does not change the verdict", () => {
        fc.assert(
            fc.property(
                fc.array(fc.tuple(fc.constantFrom(...OVERLAPPING), openArb), { minLength: 1, maxLength: 4 }),
                fc.constantFrom("(", "(?:"),
                fc.integer({ min: 1, max: 2 }),
                (atoms, open, depth) => {
                    const flat = `^${atoms.map(([atom, q]) => atom + q).join("")}!$`;
                    const wrapped = `^${atoms.map(([atom, q]) => nest(atom + q, depth, open)).join("")}!$`;
                    assert.strictEqual(
                        isConfigurationError(validator.validate("aaaa", wrapped).errorMessage),
                        isConfigurationError(validator.validate("aaaa", flat).errorMessage),
                        `/${wrapped}/ is screened differently from /${flat}/`
                    );
                }
            ),
            { numRuns: 400 }
        );
    });

    it("the cost is the product of the choices, not the count of the quantifiers", () => {
        // Seven `{0,9}` spans are finite, so counting unbounded quantifiers would miss them, but
        // they offer 10^7 combinations between them. Three offer 1000, which is nothing.
        assert.ok(isConfigurationError(validator.validate("aaaa!", "^a{0,9}a{0,9}a{0,9}a{0,9}a{0,9}a{0,9}a{0,9}b$").errorMessage));
        assert.ok(!isConfigurationError(validator.validate("aaaa!", "^a{0,9}a{0,9}a{0,9}b$").errorMessage));
        assert.ok(isConfigurationError(validator.validate("aaaa!", "^.{0,100}.{0,100}.{0,100}x$").errorMessage));
        assert.ok(!isConfigurationError(validator.validate("aaaa!", "^.{0,4}.{0,4}.{0,4}x$").errorMessage));
    });

    it("a fixed element between the quantifiers keeps an ordinary pattern working", () => {
        const legitimate: ReadonlyArray<readonly [string, string]> = [
            ["^\\d+-\\d+$", "12-34"],
            ["^\\d+-\\d+-\\d+$", "1-2-3"],
            ["^[a-z]+[0-9]+[A-Z]+$", "ab12CD"],
            ["^[a-z]+_token_[0-9]+$", "abc_token_42"],
            ["^\\w+\\.\\w+\\.\\w+\\.\\w+$", "a.b.c.d"],
            ["^\\s*\\S+\\s*$", " ab "],
            ["^a*b*c*$", "abc"],
            ["^(?:a*b)(?:a*b)(?:a*b)x$", "abababx"],
            ["^[\\w.-]+@[\\w.-]+\\.[a-z]{2,}$", "dev@siliconst.com"],
            ["^.*foo.*$", "a foo b"]
        ];
        for (const [pattern, value] of legitimate) {
            const result = validator.validate(value, pattern);
            assert.ok(
                !isConfigurationError(result.errorMessage),
                `a legitimate pattern was refused: /${pattern}/ — ${result.errorMessage}`
            );
            assert.strictEqual(result.isValid, new RegExp(pattern).test(value), `/${pattern}/ against ${value}`);
        }
    });

    it("overlap outside ASCII is seen, because the probe alphabet carries the pattern's own characters", () => {
        // `[Ѐ-ѐa]` and `[р-ӿb]` share every character from U+0440 to U+0450,
        // while their ASCII members `a` and `b` are disjoint. An ASCII-only probe read the second
        // as pinning the first and let this through: 90 ms on a 31-character value, measured.
        for (const pattern of [
            "^([\\u0400-\\u0450a]+[\\u0440-\\u04ffb])+$",
            "^[\\u0400-\\u0450a]*[\\u0440-\\u04ffb]*[\\u0400-\\u04ffc]*x$",
            "^[а-я]+[а-п]+[о-я]+x$"
        ]) {
            const startedAt = Date.now();
            const result = validator.validate("х".repeat(30) + "!", pattern);
            assert.ok(isConfigurationError(result.errorMessage), `/${pattern}/ was accepted: ${result.errorMessage}`);
            assert.ok(Date.now() - startedAt < 500, `/${pattern}/ was evaluated rather than refused`);
        }
        // The same classes, genuinely disjoint, stay accepted.
        assert.ok(!isConfigurationError(validator.validate("ЁѠ", "^[\\u0400-\\u0410]+[\\u0450-\\u04ff]+$").errorMessage));
    });
});

/**
 * The accept path and the verdict path must agree. The property above this one is named "for an
 * accepted pattern the verdict is exactly `RegExp.test`", which only means anything if a refusal
 * and a value verdict can never be reported together.
 */
describe("PatternValidatorPlugin — a refusal is never also a value verdict", () => {
    const anyPatternArb = fc.oneof(
        safePatternArb,
        fc.constantFrom(...CATASTROPHIC_PATTERNS),
        fc.constantFrom(...ANCHORED_REPEAT_PATTERNS),
        fc.constantFrom("^.*.*.*x$", "^(a+a)+$", "^(?:a*)(?:a*)(?:a*)x$", "^\\d+-\\d+$", "^.*foo.*$"),
        fc.string({ maxLength: 12 })
    );

    it("a refused pattern always rejects, and an accepted one always matches RegExp.test", () => {
        fc.assert(
            fc.property(anyPatternArb, probeArb, (pattern, probe) => {
                const result = validator.validate(probe, pattern);
                if (isConfigurationError(result.errorMessage)) {
                    assert.strictEqual(result.isValid, false, `/${pattern}/ was refused and still reported valid`);
                    return;
                }
                if (probe === "") {
                    assert.strictEqual(result.isValid, true, "'pattern' does not constrain an empty string");
                    return;
                }
                let expected = false;
                try {
                    expected = new RegExp(pattern).test(probe);
                } catch (compileError) {
                    void compileError;
                    assert.fail(`/${pattern}/ does not compile and was not refused`);
                }
                assert.strictEqual(result.isValid, expected, `/${pattern}/ against ${JSON.stringify(probe)}`);
            }),
            { numRuns: 800 }
        );
    });
});

describe("PatternValidatorPlugin — determinism", () => {
    it("the verdict for a pattern does not change between calls", () => {
        fc.assert(
            fc.property(fc.oneof(safePatternArb, fc.constantFrom(...CATASTROPHIC_PATTERNS)), probeArb, (pattern, probe) => {
                const first = validator.validate(probe, pattern);
                const second = validator.validate(probe, pattern);
                assert.strictEqual(second.isValid, first.isValid);
                assert.strictEqual(second.errorMessage, first.errorMessage);
            }),
            { numRuns: 400 }
        );
    });

    it("extractRule activates exactly when a pattern is declared", () => {
        fc.assert(
            fc.property(fc.option(fc.string({ maxLength: 6 }), { nil: undefined }), (pattern) => {
                const extraction = validator.extractRule({ type: "string", pattern });
                assert.strictEqual(extraction.active, pattern !== undefined);
                assert.strictEqual(extraction.args, pattern);
            })
        );
    });
});
