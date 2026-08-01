import { IPolicyConditionPlugin } from "../../../interfaces/IPolicyPlugin";

/**
 * Evaluates whether a set of JSON pointers currently point to empty or undefined values.
 * Useful for conditionally hiding/disabling fields until prerequisites are filled out.
 */
export class IsNullConditionPlugin implements IPolicyConditionPlugin {
    /**
     * Determines if this plugin can handle the given schema condition block.
     * @param conditionKey The key found in the schema (e.g., "IsNull").
     * @returns True if the key is "IsNull".
     */
    public canHandle(conditionKey: string): boolean {
        return conditionKey === "IsNull";
    }

    /**
     * Evaluates whether the configured property paths are empty.
     * @param conditionPayload An array of JSON pointer strings.
     * @param data The live JSON model payload.
     * @param resolvePointer A function to resolve a JSON pointer against the data payload.
     * @returns True if all mapped properties evaluate to null, undefined, or empty string.
     */
    public evaluate(conditionPayload: unknown, data: unknown, resolvePointer: (d: unknown, p: string) => unknown): boolean {
        const payload = conditionPayload as string[];
        if (!payload || !Array.isArray(payload)) return true;

        for (const path of payload) {
            const val = resolvePointer(data, path);
            if (val !== undefined && val !== null && val !== "") return false;
        }
        return true;
    }
}
