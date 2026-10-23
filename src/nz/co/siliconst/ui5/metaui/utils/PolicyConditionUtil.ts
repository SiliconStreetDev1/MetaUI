/**
 * @file PolicyConditionUtil.ts
 * @description Shared coercion and pointer-or-literal threshold resolution helpers for PolicyEngine condition plugins.
 */

/**
 * Shared utility methods for policy condition plugins (`NumericGreaterThan`, `NumericLessThan`, `DateLessThan`).
 *
 * @namespace nz.co.siliconst.ui5.metaui.utils
 * @internal
 */
export class PolicyConditionUtil {
    /**
     * Safely coerces an arbitrary value into a finite number, returning `NaN` for empty or unparseable values.
     *
     * @param value The candidate value to coerce.
     * @returns {number} The numeric value, or `NaN` if empty/invalid.
     */
    public static coerceToNumber(value: unknown): number {
        if (value === undefined || value === null || value === "") {
            return NaN;
        }
        return Number(value);
    }

    /**
     * Resolves a condition threshold that may be either a literal value or a JSON pointer (`/...` or `$row/...`).
     *
     * @param rawThreshold The raw threshold value or pointer string.
     * @param data The live JSON model payload.
     * @param resolvePointer The pointer resolution callback injected by `PolicyEngine`.
     * @returns {unknown} The resolved comparison target value.
     */
    public static resolveThreshold(
        rawThreshold: unknown,
        data: unknown,
        resolvePointer: (d: unknown, p: string) => unknown
    ): unknown {
        if (typeof rawThreshold === "string" && (rawThreshold.startsWith("/") || rawThreshold.includes("$row"))) {
            return resolvePointer(data, rawThreshold);
        }
        return rawThreshold;
    }
}

