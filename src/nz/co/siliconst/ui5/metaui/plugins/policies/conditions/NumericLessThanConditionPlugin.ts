/**
 * @file NumericLessThanConditionPlugin.ts
 * @description Policy condition plugin that evaluates whether numeric model values are strictly below configured thresholds.
 */

import { IPolicyConditionPlugin } from "../../../interfaces/IPolicyPlugin";
import { isRecord } from "../../../utils/TypeGuards";
import { Logger } from "../../../utils/Logger";
import { PolicyConditionUtil } from "../../../utils/PolicyConditionUtil";

/**
 * Evaluates whether a numeric value is strictly less than a defined threshold.
 * Used for dynamic UI policies like maximum allowed quantities.
 */
export class NumericLessThanConditionPlugin implements IPolicyConditionPlugin {
    /**
     * Evaluates the configured thresholds against the live state payload.
     * @param conditionPayload A record mapping JSON pointers to numeric thresholds.
     * @param data The live JSON model payload.
     * @param resolvePointer A function to resolve a JSON pointer against the data payload.
     * @returns True if all mapped properties are below their numeric thresholds, false otherwise.
     */
    public evaluate(conditionPayload: unknown, data: unknown, resolvePointer: (d: unknown, p: string) => unknown): boolean {
        if (!isRecord(conditionPayload) || Object.keys(conditionPayload).length === 0) {
            Logger.warn(
                "[MetaUI PolicyEngine]",
                `Malformed condition payload for operator 'NumericLessThan': ` +
                    `expected non-empty object, got ${typeof conditionPayload}. Failing closed (false).`,
                "NumericLessThanConditionPlugin"
            );
            return false;
        }

        for (const [path, threshold] of Object.entries(conditionPayload)) {
            const val = resolvePointer(data, path);
            const resolvedThreshold = PolicyConditionUtil.resolveThreshold(threshold, data, resolvePointer);
            const num = PolicyConditionUtil.coerceToNumber(val);
            const threshNum = PolicyConditionUtil.coerceToNumber(resolvedThreshold);
            if (isNaN(num) || isNaN(threshNum) || num >= threshNum) return false;
        }
        return true;
    }
}
