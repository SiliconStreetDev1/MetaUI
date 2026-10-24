/**
 * @file DateLessThanConditionPlugin.ts
 * @description Policy condition plugin that evaluates whether date model values are strictly earlier than configured date thresholds or sibling date fields.
 */

import { IPolicyConditionPlugin } from "../../../interfaces/IPolicyPlugin";
import { isRecord } from "../../../utils/TypeGuards";
import { Logger } from "../../../utils/Logger";
import { PolicyConditionUtil } from "../../../utils/PolicyConditionUtil";

/**
 * Evaluates whether a date value is strictly earlier than a defined date threshold or target date pointer.
 *
 * @namespace nz.co.siliconst.ui5.metaui.plugins.policies.conditions
 * @internal
 */
export class DateLessThanConditionPlugin implements IPolicyConditionPlugin {
    /**
     * Evaluates the configured date thresholds against the live state payload.
     *
     * @param conditionPayload A record mapping JSON pointers to ISO date strings or comparison JSON pointers.
     * @param data The live JSON model payload.
     * @param resolvePointer A function to resolve a JSON pointer against the data payload.
     * @returns {boolean} True if all mapped properties precede their date thresholds, false otherwise.
     */
    public evaluate(
        conditionPayload: unknown,
        data: unknown,
        resolvePointer: (d: unknown, p: string) => unknown
    ): boolean {
        if (!isRecord(conditionPayload) || Object.keys(conditionPayload).length === 0) {
            Logger.warn(
                `Malformed condition payload for operator 'DateLessThan': ` +
                `expected non-empty object, got ${typeof conditionPayload}. Failing closed (false).`,
                undefined,
                "DateLessThanConditionPlugin"
            );
            return false;
        }

        for (const [path, rawThreshold] of Object.entries(conditionPayload)) {
            const val = resolvePointer(data, path);
            const comparisonTarget = PolicyConditionUtil.resolveThreshold(rawThreshold, data, resolvePointer);
            const valTime = this.coerceToTimestamp(val);
            const threshTime = this.coerceToTimestamp(comparisonTarget);
            if (Number.isNaN(valTime) || Number.isNaN(threshTime) || valTime >= threshTime) {
                return false;
            }
        }
        return true;
    }

    /**
     * Safely coerces a Date instance, ISO date string, or numeric timestamp into epoch milliseconds.
     *
     * @param value The candidate date value.
     * @returns {number} Epoch milliseconds, or `NaN` if invalid/empty.
     */
    private coerceToTimestamp(value: unknown): number {
        if (value === undefined || value === null || value === "") {
            return NaN;
        }
        if (value instanceof Date) {
            return value.getTime();
        }
        if (typeof value === "number") {
            return value;
        }
        if (typeof value === "string") {
            const trimmed = value.trim();
            const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
            if (isoMatch) {
                return Date.UTC(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
            }
            return Date.parse(trimmed);
        }
        return NaN;
    }
}
