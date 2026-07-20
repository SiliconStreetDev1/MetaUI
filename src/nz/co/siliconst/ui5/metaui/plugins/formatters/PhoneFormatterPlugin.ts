/**
 * @file PhoneFormatterPlugin.ts
 * @description Standard data formatter for phone numbers.
 */

import { IFormatter } from "../../interfaces/IPipeline";

/**
 * Simple mask for 10-digit phone numbers (e.g. 5551234567 -> (555) 123-4567).
 * 
 * @namespace nz.co.siliconst.ui5.metaui.plugins.formatters
 * @public
 */
export class PhoneFormatterPlugin implements IFormatter {
    public format(rawValue: unknown, args?: unknown): string {
        if (!rawValue || typeof rawValue !== "string") return rawValue || "";
        
        const cleaned = ('' + rawValue).replace(/\D/g, '');
        const match = cleaned.match(/^(\d{3})(\d{3})(\d{4})$/);
        
        if (match) {
            return '(' + match[1] + ') ' + match[2] + '-' + match[3];
        }
        
        return rawValue as string;
    }
}
