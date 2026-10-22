/**
 * @file IsNullConditionPlugin.ts
 * @description Evaluates whether a set of JSON pointers currently point to empty or undefined values.
 */

import { IPolicyConditionPlugin } from "../../../interfaces/IPolicyPlugin";
import { Logger } from "../../../utils/Logger";

/**
 * Evaluates whether a set of JSON pointers currently point to empty or undefined values.
 * Useful for conditionally hiding/disabling fields until prerequisites are filled out.
 */
export class IsNullConditionPlugin implements IPolicyConditionPlugin {
    /**
     * Evaluates whether the configured property paths are empty.
     * @param conditionPayload An array of JSON pointer strings or a single JSON pointer string.
     * @param data The live JSON model payload.
     * @param resolvePointer A function to resolve a JSON pointer against the data payload.
     * @returns True if all mapped properties evaluate to null, undefined, or empty string.
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
                "[MetaUI PolicyEngine]",
                `Malformed condition payload for operator 'IsNull': ` +
                    `expected non-empty string or string[], got ${typeof conditionPayload}. Failing closed (false).`,
                "IsNullConditionPlugin"
            );
            return false;
        }

        for (const path of payload) {
            const val = resolvePointer(data, path);
            const isEmpty = val === undefined || val === null || val === "" || (Array.isArray(val) && val.length === 0);
            if (!isEmpty) return false;
        }
        return true;
    }
}
