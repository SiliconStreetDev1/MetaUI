/**
 * @file ExpressionBuilder.ts
 * @description Safely parses and builds UI5 expression bindings from JSON Schema condition rules.
 */

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
     * @param rule The raw schema condition rule (e.g., "$root.Category === 'A' || SubCategory === 'B'").
     * @param bindingPath The absolute binding path of the current field (e.g., "/Items/0/Category").
     * @param modelName The UI5 JSONModel name (default "meta").
     * @returns {string} The fully formed UI5 expression binding (e.g., "{= ${meta>/Status} === 'NEW' }").
     */
    public static build(rule: string, bindingPath: string, modelName: string = "meta"): string {
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
        masked = masked.replace(/\$?\{([^{}]+)\}/g, (_match, rawInner: string) => {
            const inner = rawInner.trim();
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
        masked = masked.replace(/__METAUI_STR_(\d+)__/g, (_m, idxStr: string) => {
            return stringLiterals[Number(idxStr)] ?? "";
        });

        return `{= ${masked} }`;
    }
}
