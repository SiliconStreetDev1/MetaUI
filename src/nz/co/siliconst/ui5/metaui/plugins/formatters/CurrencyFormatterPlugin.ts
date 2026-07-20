/**
 * @file CurrencyFormatterPlugin.ts
 * @description Standard data formatter for currency values.
 */

import { IFormatter } from "../../interfaces/IPipeline";
import NumberFormat from "sap/ui/core/format/NumberFormat";

/**
 * Standard data formatter for currency values.
 * Uses sap.ui.core.format.NumberFormat to format raw numbers into localized currency strings.
 * 
 * @namespace nz.co.siliconst.ui5.metaui.plugins.formatters
 * @public
 */
export class CurrencyFormatterPlugin implements IFormatter {
    private currencyFormat: any;

    constructor() {
        this.currencyFormat = NumberFormat.getCurrencyInstance({
            showMeasure: false
        });
    }

    /**
     * Formats raw JSON model data into a UI-friendly currency string.
     * @param rawValue The raw numeric value from the JSON payload.
     * @returns The formatted string for the UI control.
     */
    public format(rawValue: unknown, args?: unknown): string {
        if (rawValue === null || rawValue === undefined) {
            return "";
        }
        return "$" + this.currencyFormat.format(rawValue);
    }
}
