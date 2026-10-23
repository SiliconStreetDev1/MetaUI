/**
 * @file SafeConvert.ts
 * @description Total primitive conversions for values that arrive from outside the engine.
 *
 * `String(value)` and `Number(value)` are not total: both invoke `ToPrimitive`, which throws
 * `TypeError: Cannot convert object to primitive value` when the value's `toString` and `valueOf`
 * are not callable. `JSON.parse('{"toString":0}')` is valid JSON and produces exactly such a value,
 * so a server payload — hostile or merely odd — can reach a formatter or a validator message and
 * take the conversion with it. Formatters run inside UI5 property bindings, where a thrown error
 * takes the render, so every conversion of an untrusted value goes through this module.
 */

/**
 * Converts any value to a string without ever throwing.
 *
 * Behaviour is identical to `String(value)` for every value `String` can convert, so existing
 * formatting is unchanged; only the throwing case is given a defined result. The fallback prefers
 * the JSON form, which keeps the offending value legible in a message or a display field, and
 * drops to the object tag when even that is not available (a circular structure, a BigInt).
 *
 * @param value The value to convert.
 * @returns {string} The string form of the value.
 * @internal
 */
export function safeToString(value: unknown): string {
    try {
        return String(value);
    } catch (conversionError) {
        // CATCH_EXEMPT: being total is this function's entire contract, stated in the file header.
        // A ToPrimitive throw is the case it exists to absorb, and the JSON fallback below is the
        // answer. Logging would fire once per binding evaluation on every hostile payload.
        void conversionError;
    }
    try {
        const json = JSON.stringify(value);
        if (typeof json === "string") {
            return json;
        }
    } catch (serializationError) {
        // CATCH_EXEMPT: a circular structure or a BigInt makes JSON.stringify throw; the object tag
        // returned below is the defined fallback this function promises. The caller receives a
        // legible string either way, so nothing is degraded or hidden.
        void serializationError;
    }
    return Object.prototype.toString.call(value);
}

/**
 * Converts any value to a number without ever throwing.
 *
 * Behaviour is identical to `Number(value)` for every value `Number` can convert; a value whose
 * primitive conversion throws yields `NaN`, which callers already handle as "not a number".
 *
 * @param value The value to convert.
 * @returns {number} The numeric form of the value, or `NaN` when it has none.
 * @internal
 */
export function safeToNumber(value: unknown): number {
    try {
        return Number(value);
    } catch (conversionError) {
        // CATCH_EXEMPT: NaN is the documented result for a value with no numeric form, and every
        // caller already handles NaN as 'not a number'. The throw is the question, NaN is the
        // answer; there is no degradation for a log to describe.
        void conversionError;
        return NaN;
    }
}
