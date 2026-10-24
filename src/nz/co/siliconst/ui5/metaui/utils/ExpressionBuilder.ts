/**
 * @file ExpressionBuilder.ts
 * @description Safely parses and builds UI5 expression bindings from JSON Schema condition rules.
 */

import { Logger } from "./Logger";

/**
 * Characters a `{...}` token may contain. The alphabet is deliberately wide enough for an OData key
 * predicate — `odata>/Employees('E100')/Active`, `odata>/Items(ID=1,Name='x')/Qty` — because those are
 * ordinary model paths on the backend this library targets. Structure, not alphabet, is what separates
 * a path from a complex binding; see {@link ExpressionBuilder.hasNoTopLevelObjectSyntax}.
 */
const SAFE_TOKEN_BODY = /^[A-Za-z0-9_$./>#@[\]'"()=,:% -]+$/;

/** Placeholder prefix emitted while masking; a model token that contains one is smuggling a string literal. */
const MASK_PREFIX = "__METAUI_";

/**
 * Expression substituted by the total {@link ExpressionBuilder.build} entry point when a rule is refused.
 *
 * Condition rules gate visibility and enablement, so the safe direction for a rule that could not be
 * honoured is "hidden / disabled". Returning `{= true }` here would mean a refused — that is, hostile —
 * rule resolves to a *shown and enabled* field, which is a fail-open default on the most reachable
 * public method of this class.
 */
const REFUSED_EXPRESSION = "{= false }";

const RESERVED_IDENTIFIERS = new Set([
    "true",
    "false",
    "null",
    "undefined",
    "NaN",
    "Infinity",
    "Math",
    "String",
    "Number",
    "Array",
    "Object",
    "Boolean",
    "RegExp",
    "Date",
    "JSON",
    "parseInt",
    "parseFloat",
    "isNaN",
    "isFinite"
]);

/**
 * Safely parses and builds UI5 expression bindings from declarative JSON Schema condition rules.
 */
export class ExpressionBuilder {
    /**
     * Safely converts a raw condition rule (e.g. "$root.Status === 'NEW'") into a valid UI5
     * expression binding string, preserving relative vs absolute paths and protecting
     * string literals and numeric decimals from substitution.
     *
     * This is the total entry point, retained for callers that need a string back unconditionally. A rule
     * it cannot honour collapses to `{= false }`, never `{= true }`, so a refused rule hides and disables
     * the field rather than revealing it. Prefer {@link ExpressionBuilder.buildChecked}, which reports the
     * refusal instead of substituting for it, so the caller can skip the directive entirely.
     *
     * @param rule The raw schema condition rule (e.g., "$root.Category === 'A' || SubCategory === 'B'").
     * @param bindingPath The absolute binding path of the current field (e.g., "/Items/0/Category").
     * @param modelName The UI5 JSONModel name (default "meta").
     * @returns {string} The fully formed UI5 expression binding, or `{= false }` when the rule is refused.
     */
    public static build(rule: string, bindingPath: string, modelName: string = "meta"): string {
        return this.buildChecked(rule, bindingPath, modelName) ?? REFUSED_EXPRESSION;
    }

    /**
     * Checks whether a `{...}` token body is a plain model reference or property path.
     *
     * A token is either `model>path` or a bare path. What makes a token dangerous is not any single
     * character but the UI5 complex-binding *object* form — `{path:'…', formatter:'…'}` — which
     * `BindingParser` resolves against the global scope and invokes with the live field value. That form
     * is identified by a `:` separating a key from its value and a `,` separating entries, at the top
     * level of the token. A path never has either there, however baroque it gets: an OData key predicate
     * keeps its commas and colons inside `(…)` or inside a quoted literal.
     *
     * @param inner The token body, with the surrounding braces already stripped.
     * @param literals String literals masked out of the surrounding expression, if any.
     * @returns {boolean} True when the token is a plain model reference.
     */
    private static isPlainModelToken(inner: string, literals: readonly string[] = []): boolean {
        const restored = this.restorePredicateLiterals(inner, literals);
        if (!restored || restored.includes(MASK_PREFIX) || !SAFE_TOKEN_BODY.test(restored)) {
            return false;
        }
        return this.hasNoTopLevelObjectSyntax(restored);
    }

    /**
     * Puts masked string literals back into a token, but only where they sit inside a key predicate.
     *
     * An OData path carries its quoted key inside `(…)` — `odata>/Employees('E100')/Active` — and that
     * literal has to be restored before the token can be judged, or the expression form of an ordinary
     * OData condition would be refused. A literal is always restored complete with its delimiters, so
     * the scan that follows treats its contents as quoted and no `:` or `,` inside it can be mistaken
     * for complex-binding structure.
     *
     * A placeholder at the token's *top level* is deliberately left in place and rejected by the caller:
     * a model path never has a quoted segment there, and restoring one would let `', formatter:'` back
     * into the token. A placeholder whose literal cannot be resolved is likewise left in place.
     *
     * @param inner The masked token body.
     * @param literals The masked string literals, indexed by placeholder number.
     * @returns {string} The token body with predicate literals restored.
     */
    private static restorePredicateLiterals(inner: string, literals: readonly string[]): string {
        return inner.replace(/__METAUI_STR_(\d+)__/g, (match: string, idxStr: string, offset: number) => {
            const literal = literals[Number(idxStr)];
            return literal !== undefined && this.isInsidePredicate(inner, offset) ? literal : match;
        });
    }

    /**
     * Reports whether an offset in a masked token body lies inside a `(…)` key predicate.
     *
     * @param inner The masked token body.
     * @param offset The offset to test.
     * @returns {boolean} True when the offset is nested inside at least one unclosed parenthesis.
     */
    private static isInsidePredicate(inner: string, offset: number): boolean {
        let depth = 0;
        for (let i = 0; i < offset; i++) {
            if (inner[i] === "(") {
                depth++;
            } else if (inner[i] === ")" && depth > 0) {
                depth--;
            }
        }
        return depth > 0;
    }

    /**
     * Scans a token body outside quoted literals and key predicates, refusing the structure that turns
     * it into a UI5 complex binding (`:` between key and value, `,` between entries) and refusing a
     * second model separator.
     *
     * @param inner The token body.
     * @returns {boolean} True when no complex-binding structure appears at the token's top level.
     */
    private static hasNoTopLevelObjectSyntax(inner: string): boolean {
        let quote = "";
        let depth = 0;
        let separators = 0;
        for (const ch of inner) {
            if (quote) {
                if (ch === quote) {
                    quote = "";
                }
            } else if (ch === "'" || ch === '"') {
                quote = ch;
            } else if (ch === "(") {
                depth++;
            } else if (ch === ")") {
                depth = depth > 0 ? depth - 1 : 0;
            } else if (depth === 0) {
                if (ch === ":" || ch === ",") {
                    return false;
                }
                if (ch === ">" && ++separators > 1) {
                    return false;
                }
            }
        }
        return true;
    }

    /**
     * Builds the UI5 expression binding for a condition rule, or refuses the rule outright.
     *
     * Behaves exactly like {@link ExpressionBuilder.build} for every legitimate rule, but returns
     * `undefined` — instead of a binding string — when the rule embeds raw UI5 complex-binding syntax.
     * Callers skip the directive entirely rather than binding attacker-authored syntax.
     *
     * @param rule The raw schema condition rule.
     * @param bindingPath The absolute binding path of the current field.
     * @param modelName The UI5 JSONModel name (default "meta").
     * @returns {string | undefined} The expression binding, or `undefined` when the rule is refused.
     */
    public static buildChecked(rule: string, bindingPath: string, modelName: string = "meta"): string | undefined {
        const trimmed = rule ? rule.trim() : "";
        if (!trimmed) {
            return "{= true }";
        }

        // Compute parent context prefix from bindingPath, preserving whether the binding context is relative or absolute
        const isAbsoluteContext = !bindingPath || bindingPath.startsWith("/");
        const contextRootSlash = isAbsoluteContext ? "/" : "";
        const cleanBasePath = bindingPath.startsWith("/") ? bindingPath.substring(1) : bindingPath;
        const segments = cleanBasePath ? cleanBasePath.split("/") : [];
        segments.pop();
        const contextPrefix = segments.length > 0 ? segments.join("/") + "/" : "";

        // Handle simple UI5 property bindings (e.g. "{/DynamicPh}", "{metaui>/AgreeTerms}", "{settings>/liveUpdate}")
        if (!trimmed.startsWith("{=") && /^\{[^{}]+\}$/.test(trimmed)) {
            const inner = trimmed.slice(1, -1).trim();
            if (!this.isPlainModelToken(inner)) {
                this.reportRefusedRule(rule);
                return undefined;
            }
            if (inner.startsWith("/")) {
                return `{${modelName}>${inner}}`;
            }
            if (inner.startsWith("metaui>")) {
                return `{${modelName}>${inner.slice("metaui>".length)}}`;
            }
            if (inner.includes(">")) {
                return `{${inner}}`;
            }
            return `{${modelName}>${contextRootSlash}${contextPrefix}${inner.replace(/\./g, "/")}}`;
        }

        const exprSource =
            trimmed.startsWith("{=") && trimmed.endsWith("}") ? trimmed.slice(2, -1).trim() : trimmed;

        // 1. Mask string literals ('...' and "...") so identifiers inside strings are never rewritten
        const stringLiterals: string[] = [];
        let masked = exprSource.replace(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"/g, (literal) => {
            const idx = stringLiterals.length;
            stringLiterals.push(literal);
            return `__METAUI_STR_${idx}__`;
        });

        // 2a. Mask and normalize existing UI5 binding tokens (${...} or {/Path})
        const bindingTokens: string[] = [];
        let refused = false;
        masked = masked.replace(/\$?\{([^{}]+)\}/g, (match, rawInner: string) => {
            const inner = rawInner.trim();
            if (!this.isPlainModelToken(inner, stringLiterals)) {
                refused = true;
                return match;
            }
            let normalizedToken: string;
            if (inner.startsWith("/")) {
                normalizedToken = `\${${modelName}>${inner}}`;
            } else if (inner.startsWith("$root.")) {
                normalizedToken = `\${${modelName}>/${inner.slice("$root.".length).replace(/\./g, "/")}}`;
            } else if (inner.startsWith("$row.")) {
                normalizedToken = `\${${modelName}>${contextRootSlash}${contextPrefix}${inner.slice("$row.".length).replace(/\./g, "/")}}`;
            } else if (inner.startsWith("metaui>")) {
                normalizedToken = `\${${modelName}>${inner.slice("metaui>".length)}}`;
            } else if (inner.includes(">")) {
                normalizedToken = `\${${inner}}`;
            } else {
                normalizedToken = `\${${modelName}>${contextRootSlash}${contextPrefix}${inner.replace(/\./g, "/")}}`;
            }
            const idx = bindingTokens.length;
            bindingTokens.push(normalizedToken);
            return `__METAUI_BIND_${idx}__`;
        });
        if (refused) {
            this.reportRefusedRule(rule);
            return undefined;
        }

        // 2b. Replace absolute $root.<path> tokens and mask resulting binding expressions
        masked = masked.replace(
            /\$root\.([a-zA-Z_][a-zA-Z0-9_.]*?)(?=\.[a-zA-Z_][a-zA-Z0-9_]*\s*\(|[^a-zA-Z0-9_.]|$)/g,
            (_match, path: string) => {
                const idx = bindingTokens.length;
                bindingTokens.push(`\${${modelName}>/${path.replace(/\./g, "/")}}`);
                return `__METAUI_BIND_${idx}__`;
            }
        );

        // 2c. Replace row-relative $row.<path> tokens and mask resulting binding expressions
        masked = masked.replace(
            /\$row\.([a-zA-Z_][a-zA-Z0-9_.]*?)(?=\.[a-zA-Z_][a-zA-Z0-9_]*\s*\(|[^a-zA-Z0-9_.]|$)/g,
            (_match, path: string) => {
                const idx = bindingTokens.length;
                bindingTokens.push(`\${${modelName}>${contextRootSlash}${contextPrefix}${path.replace(/\./g, "/")}}`);
                return `__METAUI_BIND_${idx}__`;
            }
        );

        // 3. Replace relative identifier paths (ignoring masked placeholders, numeric literals, member access, and function calls)
        masked = masked.replace(
            /(?<![a-zA-Z0-9_$.])([a-zA-Z_][a-zA-Z0-9_.]*?)(?=\.[a-zA-Z_][a-zA-Z0-9_]*\s*\(|(?![a-zA-Z0-9_$.(]))/g,
            (match, identifierPath: string) => {
                if (
                    identifierPath.startsWith("__METAUI_STR_") ||
                    identifierPath.startsWith("__METAUI_BIND_")
                ) {
                    return match;
                }
                const rootIdentifier = identifierPath.split(".")[0];
                if (RESERVED_IDENTIFIERS.has(rootIdentifier) || RESERVED_IDENTIFIERS.has(identifierPath)) {
                    return match;
                }
                return `\${${modelName}>${contextRootSlash}${contextPrefix}${identifierPath.replace(/\./g, "/")}}`;
            }
        );

        // 4. Restore binding tokens and string literals
        masked = masked.replace(/__METAUI_BIND_(\d+)__/g, (_m, idxStr: string) => {
            return bindingTokens[Number(idxStr)] ?? "";
        });

        // 4b. With string literals still masked, every brace left in the expression is structural and must
        //     belong to a `${...}` token this builder emitted. A stray brace would close the `{= … }` wrapper
        //     early and let the remainder of an attacker-authored rule be parsed as a separate UI5 binding.
        if (!this.hasOnlyGeneratedBraces(masked)) {
            this.reportRefusedRule(rule);
            return undefined;
        }

        masked = masked.replace(/__METAUI_STR_(\d+)__/g, (_m, idxStr: string) => {
            return stringLiterals[Number(idxStr)] ?? "";
        });

        return `{= ${masked} }`;
    }

    /**
     * Verifies that every brace in a masked expression body belongs to a `${…}` token emitted by this builder.
     *
     * @param masked The expression body with string literals still masked.
     * @returns {boolean} True when no stray opening or closing brace remains.
     */
    private static hasOnlyGeneratedBraces(masked: string): boolean {
        const generated = (masked.match(/\$\{/g) || []).length;
        const opening = (masked.match(/\{/g) || []).length;
        const closing = (masked.match(/\}/g) || []).length;
        return opening === generated && closing === generated;
    }

    /**
     * Emits the refusal warning for a condition rule that embeds raw UI5 complex-binding syntax.
     *
     * @param rule The original schema rule that was refused.
     */
    private static reportRefusedRule(rule: string): void {
        Logger.warn(
            `REFUSED condition rule: raw UI5 binding syntax is not accepted from a schema ('${rule}').`,
            undefined,
            "ExpressionBuilder"
        );
    }
}
