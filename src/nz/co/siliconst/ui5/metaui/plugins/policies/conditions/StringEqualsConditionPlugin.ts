import { IPolicyConditionPlugin } from "../../../interfaces/IPolicyPlugin";

/**
 * Evaluates whether a target property matches a specific string exactly.
 * Used for routing logic, like hiding fields based on a dropdown selection.
 */
export class StringEqualsConditionPlugin implements IPolicyConditionPlugin {
    /**
     * Determines if this plugin can handle the given schema condition block.
     * @param conditionKey The key found in the schema (e.g., "StringEquals").
     * @returns True if the key is "StringEquals".
     */
    public canHandle(conditionKey: string): boolean {
        return conditionKey === "StringEquals";
    }

    /**
     * Evaluates the configured equality strings against the live state payload.
     * @param conditionPayload A record mapping JSON pointers to target string values.
     * @param data The live JSON model payload.
     * @param resolvePointer A function to resolve a JSON pointer against the data payload.
     * @returns True if all mapped properties strictly equal their targets, false otherwise.
     */
    public evaluate(conditionPayload: unknown, data: unknown, resolvePointer: (d: unknown, p: string) => unknown): boolean {
        const payload = conditionPayload as Record<string, string>;
        if (!payload) return true;

        for (const [path, targetStr] of Object.entries(payload)) {
            const val = resolvePointer(data, path);
            if (String(val) !== String(targetStr)) return false;
        }
        return true;
    }
}
