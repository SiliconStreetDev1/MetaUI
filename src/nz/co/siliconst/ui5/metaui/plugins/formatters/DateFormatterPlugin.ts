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
    private dateFormat: any;

    constructor() {
        this.dateFormat = DateFormat.getDateInstance({ style: "medium" });
    }

    public format(rawValue: unknown, args?: unknown): string {
        if (!rawValue) return "";
        try {
            const dateObj = new Date(rawValue as string);
            return this.dateFormat.format(dateObj);
        } catch (e) {
            return rawValue as string; // Fallback to raw string if invalid date
        }
    }
}
