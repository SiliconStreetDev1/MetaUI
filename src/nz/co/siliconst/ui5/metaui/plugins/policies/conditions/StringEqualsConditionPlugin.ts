/**
 * @file StringEqualsConditionPlugin.ts
 * @description Policy condition plugin that evaluates whether target properties strictly equal configured string values.
 */

import { IPolicyConditionPlugin } from "../../../interfaces/IPolicyPlugin";
import { isRecord } from "../../../utils/TypeGuards";
import { Logger } from "../../../utils/Logger";
import { PolicyConditionUtil } from "../../../utils/PolicyConditionUtil";

/**
 * Evaluates whether a target property matches a specific string exactly.
 * Used for routing logic, like hiding fields based on a dropdown selection.
 */
export class StringEqualsConditionPlugin implements IPolicyConditionPlugin {
    /**
     * Evaluates the configured equality strings against the live state payload.
     * @param conditionPayload A record mapping JSON pointers to target string values.
     * @param data The live JSON model payload.
     * @param resolvePointer A function to resolve a JSON pointer against the data payload.
     * @returns True if all mapped properties strictly equal their targets, false otherwise.
     */
    public evaluate(conditionPayload: unknown, data: unknown, resolvePointer: (d: unknown, p: string) => unknown): boolean {
        if (!isRecord(conditionPayload) || Object.keys(conditionPayload).length === 0) {
            Logger.warn(
                `Malformed condition payload for operator 'StringEquals': ` +
                `expected non-empty object, got ${typeof conditionPayload}. Failing closed (false).`,
                undefined,
                "StringEqualsConditionPlugin"
            );
            return false;
        }

        for (const [path, targetStr] of Object.entries(conditionPayload)) {
            const val = resolvePointer(data, path);
            const resolvedTarget = PolicyConditionUtil.resolveThreshold(targetStr, data, resolvePointer);
            const actual = val === undefined || val === null ? "" : String(val);
            const expected = resolvedTarget === undefined || resolvedTarget === null ? "" : String(resolvedTarget);
            if (actual !== expected) return false;
        }
        return true;
    }
}
