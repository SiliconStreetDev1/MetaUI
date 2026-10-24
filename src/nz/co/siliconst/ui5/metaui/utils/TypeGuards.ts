/**
 * @file TypeGuards.ts
 * @description Shared runtime type guards for narrowing untrusted input (raw JSON schemas,
 * consumer payloads, OpenAPI documents) without resorting to unchecked casts.
 *
 * Every MetaUI module that ingests external JSON must narrow it through these guards so the
 * compiler can prove property access is safe.
 */

import { MAX_CLONE_DEPTH } from "../constants/MetaUIConstants";
import { Logger } from "./Logger";

/** A plain JSON object (not null, not an array). */
export type JsonRecord = Record<string, unknown>;

/**
 * Checks whether a value is a plain, non-null, non-array object.
 *
 * @param value The value to inspect.
 * @returns True if the value can be safely indexed by string keys.
 */
export function isRecord(value: unknown): value is JsonRecord {
    return typeof value === "object" && value !== null && !Array.isArray(value) && !(value instanceof Date);
}

/**
 * Reads a string property from a record.
 *
 * @param record The source record.
 * @param key The property name.
 * @returns The string value, or undefined if missing or not a string.
 */
export function readString(record: JsonRecord, key: string): string | undefined {
    const value = record[key];
    return typeof value === "string" ? value : undefined;
}

/**
 * Reads a finite numeric property from a record.
 *
 * @param record The source record.
 * @param key The property name.
 * @returns The number, or undefined if missing or not a finite number.
 */
export function readNumber(record: JsonRecord, key: string): number | undefined {
    const value = record[key];
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/**
 * Reads a boolean property from a record.
 *
 * @param record The source record.
 * @param key The property name.
 * @returns The boolean, or undefined if missing or not a boolean.
 */
export function readBoolean(record: JsonRecord, key: string): boolean | undefined {
    const value = record[key];
    return typeof value === "boolean" ? value : undefined;
}

/**
 * Reads a nested object property from a record.
 *
 * @param record The source record.
 * @param key The property name.
 * @returns The nested record, or undefined if missing or not a plain object.
 */
export function readRecord(record: JsonRecord, key: string): JsonRecord | undefined {
    const value = record[key];
    return isRecord(value) ? value : undefined;
}

/**
 * Reads an array of strings from a record, discarding non-string entries.
 *
 * @param record The source record.
 * @param key The property name.
 * @returns The string array, or undefined if the property is not an array.
 */
export function readStringArray(record: JsonRecord, key: string): string[] | undefined {
    const value = record[key];
    if (!Array.isArray(value)) return undefined;
    return value.filter((entry): entry is string => typeof entry === "string");
}

/**
 * Produces a deep, cycle-safe clone of a value while preserving `Date` instances.
 * Used to enforce the MetaUI sandbox: consumer-owned objects must never be mutated by the engine.
 *
 * @param value The value to clone.
 * @param seen Internal WeakMap tracking visited object references to guard against circular graphs.
 * @returns A structurally identical copy that shares no references with the input.
 */
export function deepClone<T>(value: T, seen: WeakMap<object, unknown> = new WeakMap()): T {
    return cloneInternal(value, seen, 0) as T;
}


function cloneInternal(value: unknown, seen: WeakMap<object, unknown>, depth: number): unknown {
    if (value === undefined || value === null || typeof value !== "object") {
        return value;
    }
    if (value instanceof Date) {
        return new Date(value.getTime());
    }
    if (seen.has(value)) {
        return seen.get(value);
    }
    // WALKER_EXEMPT: cloneInternal copies arbitrary untyped JavaScript graphs (Dates, arrays, plain objects, __proto__
    // own-properties) capped at MAX_CLONE_DEPTH rather than MAX_SCHEMA_DEPTH, and must register the newly allocated copy
    // in seen: WeakMap<object, unknown> (seen.set(value, copy)) before descending so cycle back-edges return that exact
    // allocated reference via seen.get(value), whereas SchemaWalker truncates cycles without returning a synthesized value
    // and itself depends on deepClone from this module.
    if (depth >= MAX_CLONE_DEPTH) {
        // Returning {} or [] here replaces the consumer's own data with nothing. That is the
        // most expensive silent truncation in the library, so it must never be silent.
        Logger.warn(
            `deepClone exceeded MAX_CLONE_DEPTH (${MAX_CLONE_DEPTH}); the payload below this level was ` +
            `replaced with an empty ${Array.isArray(value) ? "array" : "object"} and its data is lost.`,
            undefined,
            "TypeGuards"
        );
        return Array.isArray(value) ? [] : {};
    }
    if (Array.isArray(value)) {
        const copy: unknown[] = [];
        seen.set(value, copy);
        for (let i = 0; i < value.length; i++) {
            copy[i] = cloneInternal(value[i], seen, depth + 1);
        }
        return copy;
    }
    const source = value as Record<string, unknown>;
    const copy: Record<string, unknown> = {};
    seen.set(value, copy);
    for (const key of Object.keys(source)) {
        const clonedVal = cloneInternal(source[key], seen, depth + 1);
        if (key === "__proto__") {
            Object.defineProperty(copy, key, {
                value: clonedVal,
                writable: true,
                enumerable: true,
                configurable: true
            });
        } else {
            copy[key] = clonedVal;
        }
    }
    return copy;
}
