/**
 * @file CurrencyFormatterPlugin.ts
 * @description Standard data formatter for currency values.
 */

import { IFormatter, IParser } from "../../interfaces/IPipeline";
import { safeToNumber, safeToString } from "../../core/SafeConvert";
import NumberFormat from "sap/ui/core/format/NumberFormat";

/**
 * Reversible presentational formatter and parser for currency values.
 * Uses `sap.ui.core.format.NumberFormat` to format raw numbers into localized currency strings
 * and parse formatted currency strings back into JavaScript numbers.
 *
 * @namespace nz.co.siliconst.ui5.metaui.plugins.formatters
 * @public
 */
export class CurrencyFormatterPlugin implements IFormatter, IParser {
    private currencyFormat: NumberFormat;

    constructor() {
        this.currencyFormat = NumberFormat.getCurrencyInstance({
            showMeasure: false
        });
    }

    /**
     * Formats raw JSON model data into a UI-friendly currency string.
     * @param rawValue The raw numeric value from the JSON payload.
     * @param args Optional currency symbol prefix (defaults to `"$"`).
     * @returns The formatted string for the UI control.
     */
    public format(rawValue: unknown, args?: unknown): string {
        if (rawValue === null || rawValue === undefined || rawValue === "") {
            return "";
        }
        if (typeof rawValue === "boolean") {
            return safeToString(rawValue);
        }
        if (typeof rawValue === "string" && rawValue.trim() === "") {
            return "";
        }
        const num = typeof rawValue === "number" ? rawValue : safeToNumber(rawValue);
        if (!Number.isFinite(num)) {
            return safeToString(rawValue);
        }
        const symbol = typeof args === "string" && args.trim().length > 0 ? args.trim() : "$";
        if (num < 0) {
            return "-" + symbol + this.currencyFormat.format(Math.abs(num));
        }
        return symbol + this.currencyFormat.format(num);
    }

    /**
     * Parses a formatted currency display string back into a raw JavaScript `number`.
     * Total function: returns the input unchanged when it cannot be interpreted as a finite number.
     *
     * @param uiValue The value extracted from the UI control.
     * @param args Optional currency symbol prefix (defaults to `"$"`).
     * @returns {unknown} The parsed numeric value, or the original input if unparseable.
     */
    public parse(uiValue: unknown, args?: unknown): unknown {
        if (typeof uiValue === "number") {
            return uiValue;
        }
        if (typeof uiValue !== "string") {
            return uiValue;
        }
        const trimmed = uiValue.trim();
        if (trimmed === "") {
            return "";
        }
        const directNum = Number(trimmed);
        if (Number.isFinite(directNum)) {
            return directNum;
        }
        const symbol = typeof args === "string" && args.trim().length > 0 ? args.trim() : "$";
        let candidate = trimmed;
        let isNegative = false;
        if (candidate.startsWith("-")) {
            isNegative = true;
            candidate = candidate.slice(1).trim();
        } else if (candidate.startsWith("+")) {
            candidate = candidate.slice(1).trim();
        }
        if (candidate.startsWith(symbol)) {
            candidate = candidate.slice(symbol.length).trim();
        }
        if (!isNegative && candidate.startsWith("-")) {
            isNegative = true;
            candidate = candidate.slice(1).trim();
        }
        const normalized = candidate.replace(/,/g, "");
        if (/^\d+(\.\d+)?$/.test(normalized)) {
            const parsed = Number(normalized);
            if (Number.isFinite(parsed)) {
                return isNegative ? -parsed : parsed;
            }
        }
        const ui5Parsed = this.currencyFormat.parse(candidate);
        if (typeof ui5Parsed === "number" && Number.isFinite(ui5Parsed)) {
            return isNegative ? -ui5Parsed : ui5Parsed;
        }
        return uiValue;
    }
}
