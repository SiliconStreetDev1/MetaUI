/**
 * @file PatternValidatorPlugin.ts
 * @description Validates string values against a JSON-Schema `pattern` regular expression, refusing
 * schema-supplied patterns whose shape admits catastrophic backtracking before they are ever executed.
 */

import { IValidator, IValidationResult, IValidatorRuleExtraction } from "../../interfaces/IPipeline";
import { IPropertyMetadata } from "../../interfaces/ISchema";
import { Logger } from "../../utils/Logger";
import { I18n, TEXT_KEY } from "../../utils/I18n";

/** Longest `pattern` source accepted from a schema. */
const MAX_PATTERN_LENGTH = 512;

/** Wall-clock budget for evaluating one pattern against one value before it is quarantined. */
const EVALUATION_BUDGET_MS = 50;

/**
 * Longest value a pattern the screen could not prove linear is allowed to be run against.
 *
 * The screen refuses every shape whose cost is exponential, so what reaches this cap is a repeat
 * whose iterations are pinned by a disjoint fixed element — polynomial, and measured at well under
 * the budget for a 256-character value. The cap bounds the *first* evaluation, which the
 * post-hoc {@link EVALUATION_BUDGET_MS} check by construction cannot.
 */
const MAX_UNPROVEN_INPUT_LENGTH = 256;

/**
 * How many ways consecutive quantifiers may redistribute one run of characters between them.
 *
 * Nesting is not the only route to superlinear backtracking. `^.*.*.*x$` contains no repeated
 * group at all, yet its three `.*` atoms compete for the same characters and the engine tries
 * every split. Each quantifier contributes `max - min + 1` choices (an unbounded one contributes
 * as many as the value may be long), and the run's cost is their product. Measured on `^.*…x$`
 * against `n` characters of `a`:
 *
 * | quantifiers | n=100   | n=256    |
 * |-------------|---------|----------|
 * | 1           | 0.01 ms | 0.06 ms  |
 * | 2           | 0.05 ms | 0.09 ms  |
 * | 3           | 0.98 ms | 4.99 ms  |
 * | 4           | 22.6 ms | 278 ms   |
 * | 5           | 477 ms  | 12998 ms |
 *
 * Two unbounded quantifiers give a product of 257² ≈ 66k, which measures 0.09 ms at the cap and is
 * what ordinary patterns such as `^[\w.-]+@[\w.-]+\.[a-z]{2,}$` produce, so that is allowed and
 * capped. Three give 1.7e7, which is tolerable only *because* of
 * {@link MAX_UNPROVEN_INPUT_LENGTH} — uncapped it reaches ~19 s at 4000 characters — and `.*.*.*`
 * is redundant in any pattern a human meant to write, so the limit sits between the two. Counting
 * the product rather than the quantifiers also catches `^a{0,9}a{0,9}a{0,9}a{0,9}a{0,9}a{0,9}a{0,9}b$`,
 * whose spans are finite but whose 10⁷ combinations are not.
 */
const MAX_SEQUENTIAL_SEARCH_SPACE = 1_000_000;

/** Upper bound on the memoisation maps so a hostile schema cannot grow them without limit. */
const MAX_CACHE_ENTRIES = 256;

/** Placeholder first-character token for a group with more than one alternation branch. */
const MULTI_BRANCH_TOKEN = "<multi-branch>";

/** Ceiling on a pattern's probe alphabet, so an exotic source cannot make the analysis expensive. */
const MAX_PROBE_ALPHABET = 320;

/**
 * Characters every pattern's matchers are probed with: the whole of ASCII plus representatives of
 * the ranges beyond it.
 *
 * @returns {string} The base probe alphabet.
 */
function buildBaseProbeAlphabet(): string {
    let probes = "";
    for (let code = 0; code < 128; code++) {
        probes += String.fromCharCode(code);
    }
    return probes + " é€あ";
}

/** The base probe alphabet, built once. */
const BASE_PROBE_ALPHABET = buildBaseProbeAlphabet();

/**
 * Builds the alphabet one pattern's matchers are probed with.
 *
 * ASCII alone decides `[a-z]` against `\.` correctly but is blind to two classes that meet only
 * outside it: `[Ѐ-ѐa]` and `[р-ӿb]` share every character from U+0440 to
 * U+0450 while their ASCII members `a` and `b` are disjoint, so the screen read the second as
 * pinning the first and let an exponential pattern through — measured at 90 ms on a 31-character
 * value. Adding the pattern's own characters, and those its `\uXXXX` and `\xXX` escapes denote,
 * puts every range endpoint the author wrote into the alphabet; two ranges that overlap always
 * place an endpoint of one inside the other, so the simple cases become exact rather than sampled.
 *
 * @param source The regular expression source.
 * @returns {string} The probe alphabet for this pattern.
 */
function createProbeAlphabet(source: string): string {
    const seen = new Set<string>();
    let alphabet = "";
    const add = (ch: string): void => {
        if (!seen.has(ch) && alphabet.length < MAX_PROBE_ALPHABET) {
            seen.add(ch);
            alphabet += ch;
        }
    };
    for (const ch of BASE_PROBE_ALPHABET) {
        add(ch);
    }
    for (const ch of source) {
        add(ch);
    }
    const escapes = /\\u\{([0-9a-fA-F]{1,6})\}|\\u([0-9a-fA-F]{4})|\\x([0-9a-fA-F]{2})/g;
    let match = escapes.exec(source);
    while (match !== null) {
        const code = Number.parseInt(match[1] || match[2] || match[3], 16);
        if (code <= 0x10ffff) {
            add(String.fromCodePoint(code));
        }
        match = escapes.exec(source);
    }
    return alphabet;
}

/** Outcome of the static screen for one pattern source. */
interface IPatternVerdict {
    /** The refusal reason, or an empty string when the pattern is accepted. */
    readonly reason: string;
    /** True when the pattern is accepted but its running time could not be proven linear. */
    readonly unproven: boolean;
}

/** Memoised screen verdicts keyed by pattern source. */
const analysisCache = new Map<string, IPatternVerdict>();

/** Pattern sources that exceeded {@link EVALUATION_BUDGET_MS} once and are refused from then on. */
const quarantinedPatterns = new Set<string>();

/**
 * Clears the module-level memoisation and quarantine maps.
 *
 * Test-only. Both maps are process-global and live for the whole session by design, which makes
 * them invisible state across test cases: a mutation-testing worker is reused between mutants, so a
 * verdict analysed under one mutant can be served from the memo to the next and report it as
 * survived, and no test can re-evaluate a pattern it has already quarantined. Production code must
 * not call this — the caches exist precisely so a hostile pattern is screened once per session.
 *
 * @returns {void}
 * @internal
 */
export function resetPatternSafetyState(): void {
    analysisCache.clear();
    quarantinedPatterns.clear();
}

/**
 * What one parsed atom contributes to the group that contains it.
 */
interface IAtomSummary {
    /** First-character token, used to detect alternation branches that start alike. */
    readonly first: string;
    /** False for zero-width atoms (`\b`, lookarounds), which anchor nothing. */
    readonly consumes: boolean;
    /** True when the atom was a parenthesised sub-expression. */
    readonly isGroup: boolean;
    /** The probe characters this atom can consume; for a group, the union over its contents. */
    readonly chars: string;
    /**
     * True when the atom can absorb a variable amount of input: a quantified atom (`a+`), or a
     * group whose own contents are unanchored. A group contributes exactly the verdict its contents
     * produce, which is what makes an extra layer of parentheses transparent to the screen.
     */
    variable: boolean;
    /**
     * Ways this atom can redistribute input with whatever follows it: its own quantifier's choices,
     * or, for an unquantified group, the choices its own trailing sequence offers. The second case
     * is what keeps `(?:a*)(?:a*)(?:a*)x` from reading as three fixed atoms.
     */
    space: number;
    /** The probe characters that redistribution competes for. */
    spaceChars: string;
    /** True when the atom's sub-expression contains at least one variable-length element. */
    readonly containsVariable: boolean;
    /** True when the atom's sub-expression admits more than one parse of the same text. */
    readonly ambiguous: boolean;
}

/**
 * Mutable analysis state for one regex group (or for the pattern's implicit outermost group).
 */
interface IGroupFrame {
    /** True for `(?=…)`, `(?!…)`, `(?<=…)` and `(?<!…)`, which consume no input. */
    readonly lookaround: boolean;
    /** First-character token of each completed alternation branch; empty when the branch matches nothing. */
    readonly branchFirsts: string[];
    /** Whether each completed branch is unanchored, and so free to redistribute input under a repeat. */
    readonly branchUnanchored: boolean[];
    /** The redistribution each completed branch still offers at its right edge. */
    readonly branchSpaces: number[];
    /** The probe characters each of those trailing runs competes for. */
    readonly branchSpaceChars: string[];
    /** The atoms of the branch currently being parsed. */
    currentAtoms: IAtomSummary[];
    /** Sticky across branches: some atom in this group is, or contains, a variable-length element. */
    containsVariable: boolean;
    /** Sticky across branches: some atom in this group is, or contains, an ambiguous alternation. */
    containsAmbiguity: boolean;
    /** Sticky across branches: the union of every probe character this group can consume. */
    chars: string;
    /** Ways the quantifiers of the current sequence can redistribute input between them; 1 when none. */
    runSpace: number;
    /** The union of the probe characters those quantified atoms can consume. */
    runChars: string;
    /** The most recent atom, so a following quantifier knows what it repeats. */
    lastAtom: IAtomSummary | undefined;
}

/** Mutable state threaded through one whole-pattern analysis. */
interface IAnalysisState {
    /** Set when a repeating quantifier is applied to a group the screen cannot prove linear. */
    unproven: boolean;
    /** Probe characters per atom token, so a token repeated in one pattern is probed once. */
    readonly charsByToken: Map<string, string>;
    /** The probe alphabet for this pattern, from {@link createProbeAlphabet}. */
    readonly alphabet: string;
}

/**
 * Reports which probe characters a single-character matcher token can consume.
 *
 * The regular-expression engine itself is the oracle, so class semantics (`[^0-9]`, `\w`, `.`,
 * negation, ranges) need no re-implementation. A token that cannot be compiled in isolation, or
 * that matches nothing probed, is treated as matching everything: for an anchoring test, assuming
 * overlap is the conservative direction.
 *
 * @param token The atom's source text.
 * @param state The whole-pattern analysis state, holding the per-token memo.
 * @returns {string} The probe characters the token matches.
 */
function matchableCharacters(token: string, state: IAnalysisState): string {
    const memoized = state.charsByToken.get(token);
    if (memoized !== undefined) {
        return memoized;
    }
    let matched = "";
    try {
        const probe = new RegExp(`^(?:${token})$`);
        for (const ch of state.alphabet) {
            if (probe.test(ch)) {
                matched += ch;
            }
        }
    } catch (e) {
        // CATCH_EXEMPT: this is a probe that asks which alphabet characters a regex token accepts.
        // A token the engine rejects yields no information, and falling back to the full alphabet
        // below is the conservative answer. The real pattern error is reported by validate().
        void e;
        matched = "";
    }
    const chars = matched === "" ? state.alphabet : matched;
    state.charsByToken.set(token, chars);
    return chars;
}

/**
 * Reports how many lengths a quantifier lets its atom match.
 *
 * An unbounded quantifier can take as many as the longest value it will ever be run against, which
 * {@link MAX_UNPROVEN_INPUT_LENGTH} bounds; a finite one is bounded by its own span.
 *
 * @param min The quantifier's lower bound.
 * @param max The quantifier's upper bound, `Infinity` when unbounded.
 * @returns {number} The number of choices the quantifier offers the engine.
 */
function quantifierChoices(min: number, max: number): number {
    const ceiling = MAX_UNPROVEN_INPUT_LENGTH + 1;
    if (max === Infinity) {
        return ceiling;
    }
    return Math.min(max - min + 1, ceiling);
}

/**
 * Reports whether two probe-character sets have no character in common.
 *
 * @param left The first set.
 * @param right The second set.
 * @returns {boolean} True when the two matchers can never consume the same character.
 */
function disjoint(left: string, right: string): boolean {
    const shorter = left.length <= right.length ? left : right;
    const longer = shorter === left ? right : left;
    for (const ch of shorter) {
        if (longer.indexOf(ch) >= 0) {
            return false;
        }
    }
    return true;
}

/**
 * Creates an empty analysis frame.
 *
 * @param lookaround True when the frame describes a zero-width assertion group.
 * @returns {IGroupFrame} The initialised frame.
 */
function createFrame(lookaround: boolean): IGroupFrame {
    return {
        lookaround,
        branchFirsts: [],
        branchUnanchored: [],
        branchSpaces: [],
        branchSpaceChars: [],
        currentAtoms: [],
        containsVariable: false,
        containsAmbiguity: false,
        chars: "",
        runSpace: 1,
        runChars: "",
        lastAtom: undefined
    };
}

/**
 * Creates the summary of a plain, non-group atom (a literal, an escape or a character class).
 *
 * @param token The atom's source text.
 * @param consumes False for the zero-width escapes `\b` and `\B`.
 * @param state The whole-pattern analysis state.
 * @returns {IAtomSummary} The atom summary.
 */
function createLeafAtom(token: string, consumes: boolean, state: IAnalysisState): IAtomSummary {
    return {
        first: token,
        consumes,
        isGroup: false,
        chars: consumes ? matchableCharacters(token, state) : "",
        variable: false,
        space: 1,
        spaceChars: "",
        containsVariable: false,
        ambiguous: false
    };
}

/**
 * Folds one atom's redistribution into the frame's current sequence and reports the refusal.
 *
 * This is the sequential counterpart of {@link isBranchUnanchored}, and it uses the same
 * disjointness test. An atom that offers no choices (`space` of 1) can only *end* a sequence, and
 * does so when the preceding run cannot consume it — the `-` in `^\d+-\d+$` pins the split, so the
 * two `\d+` never compete. An atom that offers choices either extends the run it overlaps or
 * starts a new one, and the run's cost is the product of the choices along it.
 *
 * @param frame The active group frame.
 * @param space The number of choices the atom offers.
 * @param chars The probe characters those choices compete for.
 * @param state The whole-pattern analysis state.
 * @returns {string} The refusal reason, or an empty string when the sequence is acceptable.
 */
function extendRun(frame: IGroupFrame, space: number, chars: string, state: IAnalysisState): string {
    if (space <= 1) {
        if (frame.runSpace > 1 && disjoint(chars, frame.runChars)) {
            frame.runSpace = 1;
            frame.runChars = "";
        }
        return "";
    }
    const extendsRun = frame.runSpace > 1 && !disjoint(chars, frame.runChars);
    frame.runSpace = (extendsRun ? frame.runSpace : 1) * space;
    frame.runChars = extendsRun ? frame.runChars + chars : chars;
    if (frame.runSpace > MAX_SEQUENTIAL_SEARCH_SPACE) {
        return (
            "consecutive quantifiers compete for the same characters, with nothing between them to " +
            "pin the split, in more combinations than can be evaluated safely"
        );
    }
    if (frame.runSpace > space) {
        state.unproven = true;
    }
    return "";
}

/**
 * Records an atom on the active frame, inheriting the atom's reach, variability and ambiguity.
 *
 * Inheritance is the whole point: without it a group that carries no quantifier of its own
 * contributes nothing, so `((a+))+` reads as a quantifier over a fixed element while `(a+)+`
 * reads as a quantifier over a variable one, and one extra layer of parentheses defeats the screen.
 * The same applies in sequence: `(?:a*)(?:a*)(?:a*)x` must read as `a*a*a*x`, so a group carries its
 * own trailing redistribution into its parent through {@link extendRun}.
 *
 * @param frame The active group frame.
 * @param atom The atom to record.
 * @param state The whole-pattern analysis state.
 * @returns {string} The refusal reason, or an empty string when the atom is acceptable.
 */
function pushAtom(frame: IGroupFrame, atom: IAtomSummary, state: IAnalysisState): string {
    let reason = "";
    if (atom.consumes) {
        frame.currentAtoms.push(atom);
        frame.chars += atom.chars;
        // The atom arrives before its own quantifier is read, so a leaf offers no choices yet and
        // can only end a run. A group already knows what its own trailing sequence offers.
        reason = extendRun(frame, atom.space, atom.space > 1 ? atom.spaceChars : atom.chars, state);
        if (atom.variable || atom.containsVariable) {
            frame.containsVariable = true;
        }
        if (atom.ambiguous) {
            frame.containsAmbiguity = true;
        }
    }
    frame.lastAtom = atom;
    return reason;
}

/**
 * Reports whether a repeat of this branch could redistribute the same input between its iterations.
 *
 * A branch is *anchored* when it contains a fixed-length element that no variable-length element of
 * the same branch can consume: `[a-z]+\.` is pinned by the `.`, so each iteration of `([a-z]+\.)+`
 * ends at the next dot and there is nothing to redistribute. It is *unanchored* when every element
 * is variable-length (`(a+)+`, `(\w+\s?)*`) or when every fixed element overlaps a variable one
 * (`(a+a)+`, `([\w.]+\.)+`) — the fixed element then pins nothing and the repeat is exponential.
 *
 * @param atoms The consuming atoms of one completed branch.
 * @returns {boolean} True when a repeat of the branch is free to redistribute input.
 */
function isBranchUnanchored(atoms: readonly IAtomSummary[]): boolean {
    if (atoms.length === 0) {
        return false;
    }
    let variableChars = "";
    let hasVariable = false;
    for (const atom of atoms) {
        if (atom.variable) {
            hasVariable = true;
            variableChars += atom.chars;
        }
    }
    if (!hasVariable) {
        return false;
    }
    return !atoms.some((atom) => !atom.variable && disjoint(atom.chars, variableChars));
}

/**
 * Closes the alternation branch currently being parsed and resets per-branch state.
 *
 * `containsVariable`, `containsAmbiguity` and `chars` are deliberately not reset: they describe the
 * group as a whole, and a repeating quantifier over the group repeats every branch of it.
 *
 * @param frame The active group frame.
 */
function closeBranch(frame: IGroupFrame): void {
    const consuming = frame.currentAtoms;
    frame.branchFirsts.push(consuming.length > 0 ? consuming[0].first : "");
    frame.branchUnanchored.push(isBranchUnanchored(consuming));
    frame.branchSpaces.push(frame.runSpace);
    frame.branchSpaceChars.push(frame.runChars);
    frame.currentAtoms = [];
    frame.runSpace = 1;
    frame.runChars = "";
    frame.lastAtom = undefined;
}

/**
 * Collapses a closed frame into the atom description its parent frame needs.
 *
 * @param frame The closed group frame.
 * @returns {IAtomSummary} The atom summary of the group.
 */
function summarizeFrame(frame: IGroupFrame): IAtomSummary {
    if (frame.lookaround) {
        return {
            first: "",
            consumes: false,
            isGroup: true,
            chars: "",
            variable: false,
            space: 1,
            spaceChars: "",
            containsVariable: false,
            ambiguous: false
        };
    }
    const firsts = frame.branchFirsts;
    let overlapping = false;
    for (let i = 0; i < firsts.length && !overlapping; i++) {
        for (let j = i + 1; j < firsts.length && !overlapping; j++) {
            overlapping = firsts[i] === firsts[j] || firsts[i] === "" || firsts[j] === "";
        }
    }
    let widest = 0;
    for (let i = 1; i < frame.branchSpaces.length; i++) {
        if (frame.branchSpaces[i] > frame.branchSpaces[widest]) {
            widest = i;
        }
    }
    return {
        first: firsts.length === 1 ? firsts[0] : MULTI_BRANCH_TOKEN,
        consumes: true,
        isGroup: true,
        chars: frame.chars,
        variable: frame.branchUnanchored.some(Boolean),
        space: frame.branchSpaces.length > 0 ? frame.branchSpaces[widest] : 1,
        spaceChars: frame.branchSpaceChars.length > 0 ? frame.branchSpaceChars[widest] : "",
        containsVariable: frame.containsVariable,
        ambiguous: overlapping || frame.containsAmbiguity
    };
}

/**
 * Applies a parsed quantifier to the most recent atom and reports the refusal reason, if any.
 *
 * Only shapes whose repetitions are *provably* ambiguous are refused:
 *
 * - the repeated sub-expression is unanchored (`(a+)+`, `(a?)*`, `(\w+\s?)*`, `(a+a)+`, and — once
 *   variability is inherited through the nesting — `((a+))+`, `(?:(a+))+` and `(((a+)))+` too), so
 *   the engine can redistribute the same characters between the inner and outer loops in
 *   exponentially many ways; or
 * - two of its alternation branches start with the identical token (`(a|a)+`, `(a|)+`), at any depth
 *   inside the repeated sub-expression (`((a|a))+`, `(x(a|a))+`).
 *
 * A repeated sub-expression pinned by a fixed atom disjoint from its variable ones (`([a-z]+\.)+`,
 * `(a+b)+`, `(\d{4})+`) is left to run rather than refused: the analysis cannot prove it linear, but
 * refusing it would brick a legitimate form field. Those are flagged `unproven`, which caps the
 * length of value they may be run against.
 *
 * The same disjointness test also governs quantifiers *in sequence*. Nesting is not the only way to
 * make backtracking superlinear: `^.*.*.*x$` has no repeated group at all, yet the three `.*` atoms
 * redistribute one run of characters between them and cost `O(n^3)`. A run of overlapping unbounded
 * quantifiers is therefore counted, and {@link MAX_OVERLAPPING_UNBOUNDED} of them is refused.
 * `^\d+-\d+$` is unaffected: the `-` is disjoint from `\d`, so it pins the split and ends the run.
 *
 * @param frame The active group frame.
 * @param min The quantifier's lower bound.
 * @param max The quantifier's upper bound, `Infinity` when unbounded.
 * @param state The whole-pattern analysis state.
 * @returns {string} The refusal reason, or an empty string when the quantifier is accepted.
 */
function applyQuantifier(frame: IGroupFrame, min: number, max: number, state: IAnalysisState): string {
    const atom = frame.lastAtom;
    if (atom && atom.isGroup && max > 1) {
        if (atom.variable) {
            return "a repeating quantifier is applied to a group whose iterations are not pinned by any fixed element";
        }
        if (atom.ambiguous) {
            return "a repeating quantifier is applied to an ambiguous alternation";
        }
        if (atom.containsVariable) {
            state.unproven = true;
        }
    }
    if (atom && atom.consumes && max > min && !atom.variable) {
        atom.variable = true;
        frame.containsVariable = true;
    }
    const choices = quantifierChoices(min, max);
    if (atom && atom.consumes && choices > 1) {
        // The atom already ended any run it could not join when it was pushed; now that its own
        // quantifier is known, it either extends the surviving run or opens one of its own.
        atom.space = Math.max(atom.space, choices);
        atom.spaceChars = atom.chars;
        const reason = extendRun(frame, choices, atom.chars, state);
        if (reason) {
            return reason;
        }
    }
    frame.lastAtom = undefined;
    return "";
}

/**
 * Scans a character class starting at `start` and returns the index just past its closing bracket.
 *
 * @param source The pattern source.
 * @param start The index of the opening `[`.
 * @returns {number} The index after the class.
 */
function scanCharacterClass(source: string, start: number): number {
    let i = start + 1;
    if (source[i] === "^") i++;
    if (source[i] === "]") i++;
    while (i < source.length && source[i] !== "]") {
        i += source[i] === "\\" ? 2 : 1;
    }
    return i + 1;
}

/**
 * Reads the quantifier at `index`, if any.
 *
 * @param source The pattern source.
 * @param index The candidate quantifier position.
 * @returns {{ min: number; max: number; next: number } | undefined} The bounds and the index after it.
 */
function readQuantifier(source: string, index: number): { min: number; max: number; next: number } | undefined {
    const ch = source[index];
    let bounds: { min: number; max: number; next: number } | undefined;
    if (ch === "*") bounds = { min: 0, max: Infinity, next: index + 1 };
    else if (ch === "+") bounds = { min: 1, max: Infinity, next: index + 1 };
    else if (ch === "?") bounds = { min: 0, max: 1, next: index + 1 };
    else if (ch === "{") {
        const match = /^\{(\d+)(?:,(\d*))?\}/.exec(source.slice(index));
        if (match) {
            const min = Number(match[1]);
            const max = match[2] === undefined ? min : match[2] === "" ? Infinity : Number(match[2]);
            bounds = { min, max, next: index + match[0].length };
        }
    }
    if (bounds && (source[bounds.next] === "?" || source[bounds.next] === "+")) {
        bounds.next++;
    }
    return bounds;
}

/**
 * Advances past a group's opening delimiter and reports whether it introduces a zero-width assertion.
 *
 * @param source The pattern source.
 * @param index The index of the opening `(`.
 * @returns {{ next: number; lookaround: boolean }} The index after the delimiter and the group kind.
 */
function readGroupOpening(source: string, index: number): { next: number; lookaround: boolean } {
    let i = index + 1;
    if (source[i] !== "?") {
        return { next: i, lookaround: false };
    }
    const modifier = source[i + 1];
    if (modifier === "=" || modifier === "!") {
        return { next: i + 2, lookaround: true };
    }
    if (modifier === "<" && (source[i + 2] === "=" || source[i + 2] === "!")) {
        return { next: i + 3, lookaround: true };
    }
    if (modifier === "<") {
        const close = source.indexOf(">", i);
        return { next: close < 0 ? i + 2 : close + 1, lookaround: false };
    }
    return { next: i + 2, lookaround: false };
}

/**
 * Statically analyses a compiled pattern for the shapes that cause catastrophic backtracking.
 *
 * @param source The regular expression source.
 * @returns {IPatternVerdict} The refusal reason, if any, and whether the accepted pattern is linear.
 */
function analyzeBacktracking(source: string): IPatternVerdict {
    const stack: IGroupFrame[] = [createFrame(false)];
    const state: IAnalysisState = {
        unproven: false,
        charsByToken: new Map<string, string>(),
        alphabet: createProbeAlphabet(source)
    };
    let i = 0;
    while (i < source.length) {
        const frame = stack[stack.length - 1];
        const ch = source[i];
        if (ch === "\\") {
            const escape = source.slice(i, i + 2);
            const reason = pushAtom(frame, createLeafAtom(escape, escape !== "\\b" && escape !== "\\B", state), state);
            if (reason) {
                return { reason, unproven: state.unproven };
            }
            i += 2;
        } else if (ch === "[") {
            const next = scanCharacterClass(source, i);
            const reason = pushAtom(frame, createLeafAtom(source.slice(i, next), true, state), state);
            if (reason) {
                return { reason, unproven: state.unproven };
            }
            i = next;
        } else if (ch === "(") {
            const opening = readGroupOpening(source, i);
            stack.push(createFrame(opening.lookaround));
            i = opening.next;
        } else if (ch === ")") {
            if (stack.length < 2) {
                return { reason: "", unproven: state.unproven };
            }
            const closed = stack[stack.length - 1];
            stack.pop();
            closeBranch(closed);
            const reason = pushAtom(stack[stack.length - 1], summarizeFrame(closed), state);
            if (reason) {
                return { reason, unproven: state.unproven };
            }
            i++;
        } else if (ch === "|") {
            closeBranch(frame);
            i++;
        } else if (ch === "^" || ch === "$") {
            i++;
        } else {
            const quantifier = readQuantifier(source, i);
            if (quantifier) {
                const reason = applyQuantifier(frame, quantifier.min, quantifier.max, state);
                if (reason) {
                    return { reason, unproven: state.unproven };
                }
                i = quantifier.next;
            } else {
                const reason = pushAtom(frame, createLeafAtom(ch, true, state), state);
                if (reason) {
                    return { reason, unproven: state.unproven };
                }
                i++;
            }
        }
    }
    return { reason: "", unproven: state.unproven };
}

/**
 * Returns the memoised screen verdict for a pattern source, analysing it on first use.
 *
 * @param source The regular expression source.
 * @returns {IPatternVerdict} The verdict for the pattern.
 */
function resolveVerdict(source: string): IPatternVerdict {
    const cached = analysisCache.get(source);
    if (cached !== undefined) {
        return cached;
    }
    const verdict = analyzeBacktracking(source);
    if (verdict.reason) {
        Logger.warn(`REFUSED 'pattern' as a denial-of-service risk (${verdict.reason}): '${source}'.`, undefined, "PatternValidatorPlugin");
    }
    if (analysisCache.size >= MAX_CACHE_ENTRIES) {
        analysisCache.clear();
    }
    analysisCache.set(source, verdict);
    return verdict;
}

/**
 * Enforces the JSON-Schema `pattern` keyword. Per JSON-Schema semantics the keyword only constrains
 * strings; other value types are ignored. An invalid regex is a schema authoring error and is reported
 * as a failed validation rather than silently skipped.
 *
 * Because the pattern may be attacker-supplied and is executed synchronously on every keystroke, the
 * source is length-capped and statically screened for catastrophic-backtracking shapes before it runs.
 * A pattern the screen cannot prove linear is additionally refused for values longer than
 * {@link MAX_UNPROVEN_INPUT_LENGTH}, so the *first* evaluation is bounded and not merely measured,
 * and any pattern that overruns {@link EVALUATION_BUDGET_MS} is quarantined for the session.
 */
export class PatternValidatorPlugin implements IValidator {
    /**
     * Extracts the `pattern` regular expression from a schema property descriptor.
     *
     * @param propMeta The schema property descriptor.
     * @returns {IValidatorRuleExtraction} Activation status and regex string.
     */
    public extractRule(propMeta: IPropertyMetadata): IValidatorRuleExtraction {
        return {
            active: propMeta.pattern !== undefined,
            args: propMeta.pattern
        };
    }

    /**
     * @param parsedValue The value to test.
     * @param args The regular expression source string.
     * @returns {IValidationResult} Invalid if the string does not match, or if the pattern itself is
     * malformed, over-long, or refused as a denial-of-service risk.
     */
    public validate(parsedValue: unknown, args?: unknown): IValidationResult {
        if (typeof parsedValue !== "string" || parsedValue === "") return { isValid: true };
        if (typeof args !== "string") {
            return {
                isValid: false,
                errorMessage: I18n.getText(TEXT_KEY.schemaConfigMustBeString, ["pattern"])
            };
        }
        if (args.length > MAX_PATTERN_LENGTH) {
            return {
                isValid: false,
                errorMessage: I18n.getText(TEXT_KEY.schemaConfigPatternTooLong, [MAX_PATTERN_LENGTH])
            };
        }
        if (quarantinedPatterns.has(args)) {
            return { isValid: false, errorMessage: I18n.getText(TEXT_KEY.schemaConfigPatternTimeout) };
        }

        let regex: RegExp;
        try {
            regex = new RegExp(args);
        } catch (e) {
            // CATCH_EXEMPT: the returned invalid result IS the observable signal -- it paints the
            // field red and surfaces the malformed pattern in the message and the MessagePopover.
            // validate() runs on every keystroke, so a Logger call here would be per-keystroke noise.
            void e;
            return { isValid: false, errorMessage: I18n.getText(TEXT_KEY.schemaConfigInvalidRegex, [args]) };
        }

        const verdict = resolveVerdict(args);
        if (verdict.reason) {
            return {
                isValid: false,
                errorMessage: I18n.getText(TEXT_KEY.schemaConfigPatternUnsafe, [verdict.reason])
            };
        }
        if (verdict.unproven && parsedValue.length > MAX_UNPROVEN_INPUT_LENGTH) {
            return {
                isValid: false,
                errorMessage: I18n.getText(TEXT_KEY.schemaConfigPatternUnproven, [MAX_UNPROVEN_INPUT_LENGTH])
            };
        }

        const startedAt = performance.now();
        const matched = regex.test(parsedValue);
        const elapsed = performance.now() - startedAt;
        if (elapsed > EVALUATION_BUDGET_MS) {
            if (quarantinedPatterns.size >= MAX_CACHE_ENTRIES) {
                quarantinedPatterns.clear();
            }
            quarantinedPatterns.add(args);
            Logger.warn(
                `Quarantined 'pattern' after a ${Math.round(elapsed)}ms evaluation: '${args}'.`,
                undefined,
                "PatternValidatorPlugin"
            );
            return { isValid: false, errorMessage: I18n.getText(TEXT_KEY.schemaConfigPatternTimeout) };
        }

        if (!matched) {
            return { isValid: false, errorMessage: I18n.getText(TEXT_KEY.pattern) };
        }
        return { isValid: true };
    }
}
