/**
 * @file TextCaseFormatterPlugin.ts
 * @description Standard data formatter for text casing.
 */

import { IFormatter } from "../../interfaces/IPipeline";
import { isRecord, readString } from "../../utils/TypeGuards";

/**
 * Transforms text to UPPERCASE, lowercase, or Title Case.
 * Defaults to uppercase.
 *
 * @namespace nz.co.siliconst.ui5.metaui.plugins.formatters
 * @public
 */
export class TextCaseFormatterPlugin implements IFormatter {
    /**
     * Formats raw JSON model data into the requested text case.
     * @param rawValue The raw string.
     * @param args Optional case mode (`"lower"`, `"lowercase"`, `"title"`, `"upper"`, or `{ case: "lower" | "title" | "upper" }`).
     * @returns The formatted string for the UI control.
     */
    public format(rawValue: unknown, args?: unknown): string {
        if (rawValue === undefined || rawValue === null) return "";
        const str = typeof rawValue === "string" ? rawValue : String(rawValue);
        const rawMode =
            typeof args === "string"
                ? args
                : isRecord(args)
                  ? readString(args, "case") || readString(args, "mode") || readString(args, "format")
                  : undefined;
        const mode = rawMode ? rawMode.toLowerCase() : "upper";
        if (mode === "lower" || mode === "lowercase") {
            return str.toLowerCase();
        }
        if (mode === "title" || mode === "titlecase") {
            return str.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
        }
        return str.toUpperCase();
    }
}
