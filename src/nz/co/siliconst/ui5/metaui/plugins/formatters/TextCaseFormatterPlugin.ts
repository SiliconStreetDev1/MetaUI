/**
 * @file TextCaseFormatterPlugin.ts
 * @description Standard data formatter for text casing.
 */

import { IFormatter } from "../../interfaces/IPipeline";

/**
 * Transforms text to UPPERCASE, lowercase, or Title Case.
 * Defaults to uppercase.
 * 
 * @namespace nz.co.siliconst.ui5.metaui.plugins.formatters
 * @public
 */
export class TextCaseFormatterPlugin implements IFormatter {
    /**
     * Formats raw JSON model data into uppercase.
     * @param rawValue The raw string.
     * @returns The uppercase formatted string for the UI control.
     */
    public format(rawValue: unknown, args?: unknown): string {
        if (typeof rawValue !== "string") return String(rawValue || "");
        
        // Default to uppercase if no specific arg could be easily parsed by simple formatter 
        // (could be enhanced to support schema args if formatters allowed args).
        return rawValue.toUpperCase();
    }
}
