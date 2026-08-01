import { IPolicyConditionPlugin } from "../../../interfaces/IPolicyPlugin";

/**
 * Evaluates whether a numeric value is strictly greater than a defined threshold.
 * Used for dynamic UI policies like age restrictions or minimum order quantities.
 */
export class NumericGreaterThanConditionPlugin implements IPolicyConditionPlugin {
    /**
     * Determines if this plugin can handle the given schema condition block.
     * @param conditionKey The key found in the schema (e.g., "NumericGreaterThan").
     * @returns True if the key is "NumericGreaterThan".
     */
    public canHandle(conditionKey: string): boolean {
        return conditionKey === "NumericGreaterThan";
    }

    /**
     * Evaluates the configured thresholds against the live state payload.
     * @param conditionPayload A record mapping JSON pointers to numeric thresholds.
     * @param data The live JSON model payload.
     * @param resolvePointer A function to resolve a JSON pointer against the data payload.
     * @returns True if all mapped properties exceed their numeric thresholds, false otherwise.
     */
    public evaluate(conditionPayload: unknown, data: unknown, resolvePointer: (d: unknown, p: string) => unknown): boolean {
        const payload = conditionPayload as Record<string, number>;
        if (!payload) return true;

        for (const [path, threshold] of Object.entries(payload)) {
            const val = resolvePointer(data, path);
            const num = this.coerceToNumber(val);
            if (isNaN(num) || num <= threshold) return false;
        }
        return true;
    }

    /**
     * Safely coerces an arbitrary value into a number.
     * @param value The value to coerce.
     * @returns The parsed number, or NaN if the value is empty/invalid.
     */
    private coerceToNumber(value: unknown): number {
        if (value === undefined || value === null || value === "") return NaN;
        return Number(value);
    }
}
