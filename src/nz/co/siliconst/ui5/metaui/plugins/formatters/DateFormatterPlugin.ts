/**
 * @file DateFormatterPlugin.ts
 * @description Standard data formatter for dates.
 */

import { IFormatter, IParser } from "../../interfaces/IPipeline";
import DateFormat from "sap/ui/core/format/DateFormat";

/**
 * Reversible presentational formatter and parser for ISO dates (`"YYYY-MM-DD"` <-> localized medium format, e.g. `"Oct 15, 2026"`).
 *
 * @namespace nz.co.siliconst.ui5.metaui.plugins.formatters
 * @public
 */
export class DateFormatterPlugin implements IFormatter, IParser {
    private dateFormat: DateFormat;

    constructor() {
        this.dateFormat = DateFormat.getDateInstance({ style: "medium" });
    }

    /**
     * Formats raw JSON model data into a medium-style date string.
     * @param rawValue The raw date string.
     * @param _args Optional unused formatter arguments.
     * @returns The formatted string for the UI control.
     */
    public format(rawValue: unknown, _args?: unknown): string {
        if (!rawValue) return "";
        try {
            if (rawValue instanceof Date) {
                return Number.isNaN(rawValue.getTime()) ? "" : this.dateFormat.format(rawValue);
            }
            const strVal = String(rawValue).trim();
            const isoDateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(strVal);
            if (isoDateMatch) {
                const year = Number(isoDateMatch[1]);
                const monthIdx = Number(isoDateMatch[2]) - 1;
                const day = Number(isoDateMatch[3]);
                const localDate = new Date(year, monthIdx, day);
                if (
                    Number.isNaN(localDate.getTime()) ||
                    localDate.getFullYear() !== year ||
                    localDate.getMonth() !== monthIdx ||
                    localDate.getDate() !== day
                ) {
                    return strVal;
                }
                return this.dateFormat.format(localDate);
            }
            const dateObj = new Date(strVal);
            if (Number.isNaN(dateObj.getTime())) {
                return strVal;
            }
            return this.dateFormat.format(dateObj);
        } catch (_e) {
            return String(rawValue); // Fallback to raw string if invalid date
        }
    }

    /**
     * Parses a medium-formatted date string (or ISO `YYYY-MM-DD` string) back into an ISO `YYYY-MM-DD` string.
     * Total function: returns the input unchanged when it cannot be parsed as a valid date.
     *
     * @param uiValue The value extracted from the UI control.
     * @param _args Optional unused parser arguments.
     * @returns {unknown} The ISO `YYYY-MM-DD` string, or the original input if unparseable.
     */
    public parse(uiValue: unknown, _args?: unknown): unknown {
        if (typeof uiValue !== "string") {
            return uiValue;
        }
        const trimmed = uiValue.trim();
        if (trimmed === "") {
            return "";
        }
        const isoDateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
        if (isoDateMatch) {
            const year = Number(isoDateMatch[1]);
            const monthIdx = Number(isoDateMatch[2]) - 1;
            const day = Number(isoDateMatch[3]);
            const localDate = new Date(year, monthIdx, day);
            if (
                !Number.isNaN(localDate.getTime()) &&
                localDate.getFullYear() === year &&
                localDate.getMonth() === monthIdx &&
                localDate.getDate() === day
            ) {
                return trimmed;
            }
            return uiValue;
        }
        try {
            const parsedDate = this.dateFormat.parse(trimmed) as Date | null;
            if (parsedDate instanceof Date && !Number.isNaN(parsedDate.getTime())) {
                const yyyy = String(parsedDate.getFullYear()).padStart(4, "0");
                const mm = String(parsedDate.getMonth() + 1).padStart(2, "0");
                const dd = String(parsedDate.getDate()).padStart(2, "0");
                return `${yyyy}-${mm}-${dd}`;
            }
        } catch (err) {
            void err;
        }
        return uiValue;
    }
}
