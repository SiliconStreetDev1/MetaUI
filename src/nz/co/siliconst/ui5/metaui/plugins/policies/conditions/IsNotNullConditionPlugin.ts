import { IPolicyConditionPlugin } from "../../../interfaces/IPolicyPlugin";

/**
 * Evaluates whether a set of JSON pointers currently point to valid, non-empty data.
 * Used for triggering advanced sections once basic information is filled.
 */
export class IsNotNullConditionPlugin implements IPolicyConditionPlugin {
    /**
     * Determines if this plugin can handle the given schema condition block.
     * @param conditionKey The key found in the schema (e.g., "IsNotNull").
     * @returns True if the key is "IsNotNull".
     */
    public canHandle(conditionKey: string): boolean {
        return conditionKey === "IsNotNull";
    }

    /**
     * Evaluates whether the configured property paths contain data.
     * @param conditionPayload An array of JSON pointer strings.
     * @param data The live JSON model payload.
     * @param resolvePointer A function to resolve a JSON pointer against the data payload.
     * @returns True if all mapped properties have a value (not null, not undefined, not empty string).
     */
    public evaluate(conditionPayload: unknown, data: unknown, resolvePointer: (d: unknown, p: string) => unknown): boolean {
        const payload = conditionPayload as string[];
        if (!payload || !Array.isArray(payload)) return true;

        for (const path of payload) {
            const val = resolvePointer(data, path);
            if (val === undefined || val === null || val === "") return false;
        }
        return true;
    }
}
