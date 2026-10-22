/**
 * @file PhoneFormatterPlugin.ts
 * @description Standard data formatter for phone numbers.
 */

import { IFormatter, IParser } from "../../interfaces/IPipeline";

/**
 * Reversible presentational formatter and parser for phone numbers
 * (e.g. `"5551234567"` <-> `"(555) 123-4567"`, `"+15551234567"` <-> `"+1 (555) 123-4567"`).
 *
 * @namespace nz.co.siliconst.ui5.metaui.plugins.formatters
 * @public
 */
export class PhoneFormatterPlugin implements IFormatter, IParser {
    /**
     * Formats raw JSON model data into a masked phone number.
     *
     * @param rawValue The raw phone string or number.
     * @param _args Optional unused formatter arguments.
     * @returns {string} The formatted string for the UI control.
     */
    public format(rawValue: unknown, _args?: unknown): string {
        if (rawValue === null || rawValue === undefined || rawValue === "") {
            return "";
        }
        if (typeof rawValue !== "string" && typeof rawValue !== "number") {
            return String(rawValue);
        }
        const strVal = String(rawValue).trim();
        if (strVal.startsWith("+")) {
            const intlDigits = strVal.slice(1).replace(/\D/g, "");
            const usIntl = intlDigits.match(/^1(\d{3})(\d{3})(\d{4})$/);
            if (usIntl) {
                return `+1 (${usIntl[1]}) ${usIntl[2]}-${usIntl[3]}`;
            }
            const cc2 = intlDigits.match(/^(\d{2})(\d{7,10})$/);
            if (cc2) {
                return `+${cc2[1]} ${cc2[2]}`;
            }
            const cc3 = intlDigits.match(/^(\d{3})(\d{6,10})$/);
            if (cc3) {
                return `+${cc3[1]} ${cc3[2]}`;
            }
            return strVal;
        }
        const cleaned = strVal.replace(/\D/g, "");
        const match11 = cleaned.match(/^1(\d{3})(\d{3})(\d{4})$/);
        if (match11) {
            return `+1 (${match11[1]}) ${match11[2]}-${match11[3]}`;
        }
        const match = cleaned.match(/^(\d{3})(\d{3})(\d{4})$/);
        if (match) {
            return "(" + match[1] + ") " + match[2] + "-" + match[3];
        }
        return strVal;
    }

    /**
     * Parses a formatted phone display string back into its raw digit/E.164 representation.
     * Total function: returns the input unchanged when it does not match a supported phone shape.
     *
     * @param uiValue The value extracted from the UI control.
     * @param _args Optional unused parser arguments.
     * @returns {unknown} The raw phone string (preserving any leading `+`) or the original input if unparseable.
     */
    public parse(uiValue: unknown, _args?: unknown): unknown {
        if (typeof uiValue !== "string") {
            return uiValue;
        }
        const trimmed = uiValue.trim();
        if (trimmed === "") {
            return "";
        }
        if (!/^[\d+\s().-]+$/.test(trimmed)) {
            return uiValue;
        }
        if (trimmed.startsWith("+")) {
            const intlDigits = trimmed.slice(1).replace(/\D/g, "");
            if (
                /^1\d{10}$/.test(intlDigits) ||
                /^\d{2}\d{7,10}$/.test(intlDigits) ||
                /^\d{3}\d{6,10}$/.test(intlDigits)
            ) {
                return `+${intlDigits}`;
            }
            return uiValue;
        }
        const digits = trimmed.replace(/\D/g, "");
        if (/^\d{10}$/.test(digits) || /^1\d{10}$/.test(digits)) {
            return digits;
        }
        return uiValue;
    }
}
