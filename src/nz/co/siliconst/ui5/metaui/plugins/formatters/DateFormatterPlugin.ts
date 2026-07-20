/**
 * @file DateFormatterPlugin.ts
 * @description Standard data formatter for dates.
 */

import { IFormatter } from "../../interfaces/IPipeline";
import DateFormat from "sap/ui/core/format/DateFormat";

/**
 * Formats ISO date strings to localized Medium formats (e.g., "Oct 15, 2026").
 * 
 * @namespace nz.co.siliconst.ui5.metaui.plugins.formatters
 * @public
 */
export class DateFormatterPlugin implements IFormatter {
    private dateFormat: DateFormat;

    constructor() {
        this.dateFormat = DateFormat.getDateInstance({ style: "medium" });
    }

    /**
     * Formats raw JSON model data into a medium-style date string.
     * @param rawValue The raw date string.
     * @returns The formatted string for the UI control.
     */
    public format(rawValue: string | number, args?: Record<string, string>): string {
        if (!rawValue) return "";
        try {
            const dateObj = new Date(rawValue as string);
            return this.dateFormat.format(dateObj);
        } catch (e) {
            return rawValue as string; // Fallback to raw string if invalid date
        }
    }
}
