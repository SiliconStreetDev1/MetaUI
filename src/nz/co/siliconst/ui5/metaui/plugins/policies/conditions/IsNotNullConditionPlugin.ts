/**
 * @file IsNotNullConditionPlugin.ts
 * @description Evaluates whether a set of JSON pointers currently point to valid, non-empty data.
 */

import { IPolicyConditionPlugin } from "../../../interfaces/IPolicyPlugin";
import { Logger } from "../../../utils/Logger";

/**
 * Evaluates whether a set of JSON pointers currently point to valid, non-empty data.
 * Used for triggering advanced sections once basic information is filled.
 */
export class IsNotNullConditionPlugin implements IPolicyConditionPlugin {
    /**
     * Evaluates whether the configured property paths contain data.
     * @param conditionPayload An array of JSON pointer strings or a single JSON pointer string.
     * @param data The live JSON model payload.
     * @param resolvePointer A function to resolve a JSON pointer against the data payload.
     * @returns True if all mapped properties have a value (not null, not undefined, not empty string).
     */
    public evaluate(conditionPayload: unknown, data: unknown, resolvePointer: (d: unknown, p: string) => unknown): boolean {
        const payload =
            typeof conditionPayload === "string" && conditionPayload.trim().length > 0
                ? [conditionPayload]
                : Array.isArray(conditionPayload) &&
                    conditionPayload.length > 0 &&
                    conditionPayload.every((p): p is string => typeof p === "string" && p.trim().length > 0)
                  ? conditionPayload
                  : null;
        if (!payload) {
            Logger.warn(
                `Malformed condition payload for operator 'IsNotNull': ` +
                `expected non-empty string or string[], got ${typeof conditionPayload}. Failing closed (false).`,
                undefined,
                "IsNotNullConditionPlugin"
            );
            return false;
        }

        for (const path of payload) {
            const val = resolvePointer(data, path);
            const isEmpty = val === undefined || val === null || val === "" || (Array.isArray(val) && val.length === 0);
            if (isEmpty) return false;
        }
        return true;
    }
}
