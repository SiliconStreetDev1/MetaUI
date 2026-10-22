/**
 * @file DataInferenceBuilder.ts
 * @description Schema builder plugin that dynamically infers a strict v2 ISchema
 * from raw JavaScript object or array payloads (Full and Hybrid Inference Modes).
 */

import { ISchema, IPropertyMetadata, FieldType } from "../interfaces/ISchema";
import { ISchemaBuilderPlugin } from "../interfaces/ISchemaBuilderPlugin";
import { SCHEMA_TYPE, WIDGET_TYPE, LAYOUT_STRATEGY } from "../constants/MetaUIConstants";
import { JsonRecord, isRecord, readRecord } from "../utils/TypeGuards";
import { Logger } from "../utils/Logger";

/** Maximum number of array rows sampled when inferring a table schema. */
const INFERENCE_SAMPLE_LIMIT = 50;

/** Maximum object/array nesting depth traversed during data inference before truncating. */
const MAX_INFERENCE_DEPTH = 10;

/**
 * Schema builder plugin that infers a strict {@link ISchema} from raw data payloads.
 *
 * @namespace nz.co.siliconst.ui5.metaui.core
 * @public
 */
export class DataInferenceBuilder implements ISchemaBuilderPlugin {
    /**
     * Checks whether the input is a plain data object/array rather than an explicit schema.
     *
     * @param rawInput The candidate object or array.
     * @returns {boolean} True if the payload can be inferred.
     */
    public canHandle(rawInput: unknown): boolean {
        return Array.isArray(rawInput) || isRecord(rawInput);
    }

    /**
     * Infers a normalized `ISchema` from the provided data payload.
     *
     * @param rawData The raw data payload.
     * @returns {ISchema} The inferred schema.
     */
    public build(rawData: unknown): ISchema {
        return DataInferenceBuilder.inferSchemaFromData(rawData);
    }

    /**
     * Generates a Title Case label from camelCase or snake_case technical names.
     *
     * @param name The technical property key.
     * @returns {string} A human-readable label.
     */
    public static generateLabel(name: string): string {
        if (!name) return "";
        const spaced = name.replace(/([A-Z])/g, " $1").replace(/_/g, " ");
        return spaced
            .split(" ")
            .filter((w) => w.length > 0)
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(" ")
            .trim();
    }

    /**
     * Infers a v2 `ISchema` structure dynamically from a plain data payload (Full Inference Mode).
     *
     * @param data The raw payload (object or array).
     * @returns {ISchema} An inferred schema. Empty object schema if the payload is not structured.
     */
    public static inferSchemaFromData(data: unknown): ISchema {
        const schema: ISchema = {
            type: "object",
            properties: {},
            layoutStrategy: LAYOUT_STRATEGY.COMPACT,
            title: ""
        };

        if (Array.isArray(data)) {
            schema.type = "array";
            delete schema.properties;
            const firstNonNull: unknown = data.find((el) => el !== null && el !== undefined);
            if (data.length === 0 || firstNonNull === undefined) {
                schema.items = { type: SCHEMA_TYPE.STRING };
            } else if (!isRecord(firstNonNull)) {
                schema.items = { type: this.inferPrimitiveType(firstNonNull) };
            } else {
                schema.layoutStrategy = LAYOUT_STRATEGY.TABLE;
                const seen = new WeakSet<object>();
                seen.add(data);
                schema.items = { type: "object", properties: this.inferPropertiesFromRows(data, 0, seen) };
            }
        } else if (isRecord(data)) {
            const seen = new WeakSet<object>();
            seen.add(data);
            schema.properties = this.inferPropertiesFromObject(data, 0, seen);
        }

        return schema;
    }

    /**
     * Infers and merges column definitions from (up to {@link INFERENCE_SAMPLE_LIMIT}) array rows,
     * so sparse rows still contribute their keys.
     *
     * @param rows The array rows to sample.
     * @param depth Current recursion depth.
     * @param seen Set of visited ancestor objects to break reference cycles.
     * @returns {Record<string, IPropertyMetadata>} The merged column property map.
     */
    public static inferPropertiesFromRows(
        rows: unknown[],
        depth: number = 0,
        seen: WeakSet<object> = new WeakSet()
    ): Record<string, IPropertyMetadata> {
        if (depth >= MAX_INFERENCE_DEPTH) {
            Logger.warn(
                "[MetaUI DataInferenceBuilder]",
                `Maximum inference depth (${MAX_INFERENCE_DEPTH}) reached while sampling array rows; truncating nested inference.`,
                "DataInferenceBuilder"
            );
            return {};
        }
        let merged: Record<string, IPropertyMetadata> = {};
        const limit = Math.min(rows.length, INFERENCE_SAMPLE_LIMIT);
        for (let i = 0; i < limit; i++) {
            const row = rows[i];
            if (isRecord(row) && !seen.has(row)) {
                seen.add(row);
                merged = this.mergeInferredProperties(merged, this.inferPropertiesFromObject(row, depth, seen));
            }
        }
        return merged;
    }

    /**
     * Merges two inferred property maps. Existing definitions win, but their nested object/array
     * structures absorb keys that only appear in later samples.
     *
     * @param base The accumulated property map.
     * @param next The next sample's property map.
     * @returns {Record<string, IPropertyMetadata>} A new merged property map.
     */
    public static mergeInferredProperties(
        base: Record<string, IPropertyMetadata>,
        next: Record<string, IPropertyMetadata>
    ): Record<string, IPropertyMetadata> {
        const merged: Record<string, IPropertyMetadata> = { ...base };
        for (const key of Object.keys(next)) {
            const existing = merged[key];
            const incoming = next[key];
            if (!existing) {
                merged[key] = incoming;
                continue;
            }
            const combinedNullable = existing.nullable || incoming.nullable ? true : undefined;
            const isExistingNullPlaceholder =
                existing.type === SCHEMA_TYPE.STRING && !existing.properties && !existing.items && existing.nullable === true;
            if (isExistingNullPlaceholder && !incoming.nullable) {
                merged[key] = { ...incoming, nullable: true };
                continue;
            }
            if (
                existing.type === SCHEMA_TYPE.ARRAY &&
                existing.items?.type !== SCHEMA_TYPE.OBJECT &&
                incoming.items?.type === SCHEMA_TYPE.OBJECT &&
                incoming.items.properties &&
                Object.keys(incoming.items.properties).length > 0
            ) {
                merged[key] = { ...incoming, nullable: combinedNullable };
                continue;
            }
            if (
                existing.type === SCHEMA_TYPE.ARRAY &&
                existing.items?.type === SCHEMA_TYPE.STRING &&
                incoming.type === SCHEMA_TYPE.ARRAY &&
                incoming.items?.type &&
                incoming.items.type !== SCHEMA_TYPE.STRING &&
                incoming.items.type !== SCHEMA_TYPE.OBJECT
            ) {
                merged[key] = { ...incoming, nullable: combinedNullable };
                continue;
            }
            if (
                existing.type === SCHEMA_TYPE.DATE &&
                incoming.type === SCHEMA_TYPE.STRING &&
                !incoming.nullable
            ) {
                merged[key] = { ...existing, type: SCHEMA_TYPE.STRING, nullable: combinedNullable };
                continue;
            }
            if (existing.properties && incoming.properties) {
                merged[key] = {
                    ...existing,
                    nullable: combinedNullable,
                    properties: this.mergeInferredProperties(existing.properties, incoming.properties)
                };
            } else if (existing.items?.properties && incoming.items?.properties) {
                merged[key] = {
                    ...existing,
                    nullable: combinedNullable,
                    items: {
                        ...existing.items,
                        properties: this.mergeInferredProperties(existing.items.properties, incoming.items.properties)
                    }
                };
            } else if (combinedNullable !== existing.nullable) {
                merged[key] = { ...existing, nullable: combinedNullable };
            }
        }
        return merged;
    }

    private static inferPrimitiveType(value: unknown): FieldType {
        if (value instanceof Date) return SCHEMA_TYPE.DATE;
        if (typeof value === "number") return SCHEMA_TYPE.NUMBER;
        if (typeof value === "boolean") return SCHEMA_TYPE.BOOLEAN;
        if (typeof value === "string" && this.isValidIsoDateString(value)) return SCHEMA_TYPE.DATE;
        return SCHEMA_TYPE.STRING;
    }

    private static isValidIsoDateString(value: string): boolean {
        const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
        if (!match) {
            return false;
        }
        const year = Number(match[1]);
        const month = Number(match[2]);
        const day = Number(match[3]);
        if (month < 1 || month > 12 || day < 1 || day > 31) {
            return false;
        }
        const parsed = new Date(Date.UTC(year, month - 1, day));
        return (
            parsed.getUTCFullYear() === year &&
            parsed.getUTCMonth() === month - 1 &&
            parsed.getUTCDate() === day
        );
    }

    /**
     * Infers field metadata recursively from a raw data object.
     * `null`/`undefined` values are inferred as nullable string fields so the data stays visible and editable.
     *
     * @param obj The raw JavaScript object.
     * @param depth Current recursion depth.
     * @param seen Set of visited ancestor objects to break reference cycles.
     * @returns {Record<string, IPropertyMetadata>} A dictionary of inferred metadata.
     */
    public static inferPropertiesFromObject(
        obj: JsonRecord,
        depth: number = 0,
        seen: WeakSet<object> = new WeakSet()
    ): Record<string, IPropertyMetadata> {
        if (depth >= MAX_INFERENCE_DEPTH) {
            Logger.warn(
                "[MetaUI DataInferenceBuilder]",
                `Maximum inference depth (${MAX_INFERENCE_DEPTH}) reached; truncating nested inference.`,
                "DataInferenceBuilder"
            );
            return {};
        }
        seen.add(obj);
        const properties: Record<string, IPropertyMetadata> = {};

        for (const key of Object.keys(obj)) {
            const val = obj[key];
            let type: FieldType = SCHEMA_TYPE.STRING;
            let items: IPropertyMetadata | undefined;
            let nestedProps: Record<string, IPropertyMetadata> | undefined;

            if (Array.isArray(val)) {
                type = SCHEMA_TYPE.ARRAY;
                if (seen.has(val) || depth + 1 >= MAX_INFERENCE_DEPTH) {
                    if (depth + 1 >= MAX_INFERENCE_DEPTH) {
                        Logger.warn(
                            "[MetaUI DataInferenceBuilder]",
                            `Maximum inference depth (${MAX_INFERENCE_DEPTH}) reached on array '${key}'; truncating nested inference.`,
                            "DataInferenceBuilder"
                        );
                    }
                    items = { type: SCHEMA_TYPE.STRING };
                } else {
                    seen.add(val);
                    const firstNonNull: unknown = val.find((el) => el !== null && el !== undefined);
                    if (val.length === 0 || firstNonNull === undefined) {
                        items = { type: SCHEMA_TYPE.STRING };
                    } else if (!isRecord(firstNonNull)) {
                        items = { type: this.inferPrimitiveType(firstNonNull) };
                    } else {
                        items = {
                            type: SCHEMA_TYPE.OBJECT,
                            properties: this.inferPropertiesFromRows(val, depth + 1, seen)
                        };
                    }
                }
            } else if (isRecord(val)) {
                if (seen.has(val)) {
                    type = SCHEMA_TYPE.STRING;
                } else if (depth + 1 >= MAX_INFERENCE_DEPTH) {
                    Logger.warn(
                        "[MetaUI DataInferenceBuilder]",
                        `Maximum inference depth (${MAX_INFERENCE_DEPTH}) reached on object '${key}'; truncating nested inference.`,
                        "DataInferenceBuilder"
                    );
                    type = SCHEMA_TYPE.OBJECT;
                    nestedProps = {};
                } else {
                    type = SCHEMA_TYPE.OBJECT;
                    seen.add(val);
                    nestedProps = this.inferPropertiesFromObject(val, depth + 1, seen);
                }
            } else if (val !== null && val !== undefined) {
                type = this.inferPrimitiveType(val);
            }

            properties[key] = {
                type,
                items,
                properties: nestedProps,
                nullable: val === null || val === undefined ? true : undefined,
                ui: {
                    label: this.generateLabel(key),
                    isKey: false,
                    readOnly: false,
                    widget:
                        type === SCHEMA_TYPE.ARRAY && items?.type !== SCHEMA_TYPE.OBJECT
                            ? WIDGET_TYPE.MULTI_INPUT
                            : undefined
                }
            };
        }

        return properties;
    }

    /**
     * Merges inferred property metadata with explicit schema property overrides for Hybrid Inference,
     * ensuring default inferred `ui.label` / `ui.readOnly` values never clobber explicit `title` / `readOnly`.
     *
     * @param inferredProps Inferred property dictionary.
     * @param explicitProps Explicit schema property dictionary.
     * @returns {JsonRecord} Merged property dictionary.
     */
    public static mergeHybridProperties(inferredProps: JsonRecord, explicitProps: JsonRecord): JsonRecord {
        const cleanedBase: JsonRecord = {};
        for (const key of Object.keys(inferredProps)) {
            const infProp = inferredProps[key];
            const expProp = explicitProps[key];
            if (isRecord(infProp) && isRecord(expProp)) {
                const infClone: JsonRecord = { ...infProp };
                if (isRecord(infClone.ui)) {
                    const uiClone: JsonRecord = { ...infClone.ui };
                    const expUi = readRecord(expProp, "ui");
                    if (expProp.title !== undefined && !expUi?.label) delete uiClone.label;
                    if (expProp.readOnly !== undefined && expUi?.readOnly === undefined) delete uiClone.readOnly;
                    if (expProp.type !== undefined && expProp.type !== infClone.type && !expUi?.widget) delete uiClone.widget;
                    infClone.ui = uiClone;
                }
                if (isRecord(infClone.properties) && isRecord(expProp.properties)) {
                    let allowedInferredNested = infClone.properties;
                    if (expProp.additionalProperties === false) {
                        allowedInferredNested = {};
                        for (const nestedKey of Object.keys(expProp.properties)) {
                            if (nestedKey in infClone.properties) {
                                allowedInferredNested[nestedKey] = infClone.properties[nestedKey];
                            }
                        }
                    }
                    infClone.properties = this.mergeHybridProperties(allowedInferredNested, expProp.properties);
                }
                cleanedBase[key] = infClone;
            } else {
                cleanedBase[key] = infProp;
            }
        }
        return this.deepMergeRecords(cleanedBase, explicitProps);
    }

    private static deepMergeRecords(base: JsonRecord, override: JsonRecord): JsonRecord {
        const merged: JsonRecord = { ...base };
        for (const key of Object.keys(override)) {
            const overrideVal = override[key];
            const baseVal = merged[key];
            merged[key] = isRecord(baseVal) && isRecord(overrideVal) ? this.deepMergeRecords(baseVal, overrideVal) : overrideVal;
        }
        return merged;
    }
}
