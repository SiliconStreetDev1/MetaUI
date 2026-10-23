/**
 * @file DataInferenceBuilder.ts
 * @description Schema builder plugin that dynamically infers a strict v2 ISchema
 * from raw JavaScript object or array payloads (Full and Hybrid Inference Modes).
 */

import { ISchema, IPropertyMetadata, FieldType } from "../interfaces/ISchema";
import { ISchemaBuilderPlugin } from "../interfaces/ISchemaBuilderPlugin";
import { SCHEMA_TYPE, WIDGET_TYPE, LAYOUT_STRATEGY, MAX_SCHEMA_DEPTH } from "../constants/MetaUIConstants";
import { JsonRecord, isRecord, readRecord } from "../utils/TypeGuards";
import { Logger } from "../utils/Logger";

/** Maximum number of array rows sampled when inferring a table schema. */
const INFERENCE_SAMPLE_LIMIT = 50;


/**
 * Members of `IPropertyMetadata` and `IUIDirective` that this producer deliberately does not write.
 *
 * Bare keys name `IPropertyMetadata` members; `ui.`-prefixed keys name `IUIDirective` members.
 * Every member must either be written by `DataInferenceBuilder.inferPropertiesFromObject` or appear
 * here with a reason, or the `[PRODUCER_COMPLETENESS]` gate in `scripts/run-tests.js` fails the build.
 *
 * This set is large because inference reads values, not a contract. The distinction every entry draws
 * is between a fact the payload states (a type, a null, an array of records) and a rule somebody has
 * to declare (a bound, an enum, a validator, a layout). Guessing the second kind from a 50-row sample
 * produces a schema that rejects valid data on row 51, which is worse than omitting it.
 */
export const DECLINED_SCHEMA_FIELDS: Readonly<Record<string, string>> = {
    $ref: "Inference always emits inline structure; a payload contains no pointers to name.",
    title: "A payload has no schema title; the human-readable name is synthesized into ui.label instead.",
    description: "A payload carries no prose; there is nothing to put in a tooltip.",
    required: "Presence in one sample is not a requirement; inferring it would reject valid sparse rows.",
    format:
        "A raw data payload carries values, not a contract: nothing in it declares this. ISO date strings are promoted to type " +
            "'date', which is what the plugins key off.",
    const: "A raw data payload carries values, not a contract: nothing in it declares this. One observed value is not a constant.",
    maxLength: "A raw data payload carries values, not a contract: nothing in it declares this. The longest sampled string is not a limit.",
    minLength:
        "A raw data payload carries values, not a contract: nothing in it declares this. The shortest sampled string is not a " +
            "floor.",
    minimum: "A raw data payload carries values, not a contract: nothing in it declares this. The smallest sampled number is not a bound.",
    maximum: "A raw data payload carries values, not a contract: nothing in it declares this. The largest sampled number is not a bound.",
    pattern:
        "A raw data payload carries values, not a contract: nothing in it declares this. Guessing a regex from samples would reject " +
            "valid input.",
    multipleOf:
        "A raw data payload carries values, not a contract: nothing in it declares this. A common divisor across a sample is a " +
            "coincidence, not a rule.",
    valueHelp:
        "A raw data payload carries values, not a contract: nothing in it declares this. Distinct sampled values are not an " +
            "authoritative key/text list.",
    enum:
        "A raw data payload carries values, not a contract: nothing in it declares this. The distinct values in a sample are not the " +
            "permitted set; row 51 could add one.",
    default:
        "A raw data payload carries values, not a contract: nothing in it declares this. The first sampled value is data, not a " +
            "default for new rows.",
    writeOnly:
        "A raw data payload carries values, not a contract: nothing in it declares this. Whether a field is write-only is a server " +
            "contract, not an observable property.",
    readOnly: "Declined on the metadata node; inference writes ui.readOnly: false so hybrid merge can detect and drop it.",
    example:
        "A raw data payload carries values, not a contract: nothing in it declares this. Every sampled value would qualify, which " +
            "makes the field meaningless.",
    exclusiveMinimum:
        "A raw data payload carries values, not a contract: nothing in it declares this. Exclusivity is a declared property of a " +
            "bound inference does not emit.",
    exclusiveMaximum:
        "A raw data payload carries values, not a contract: nothing in it declares this. Exclusivity is a declared property of a " +
            "bound inference does not emit.",
    maxItems: "A raw data payload carries values, not a contract: nothing in it declares this. The sampled array length is not a limit.",
    minItems: "A raw data payload carries values, not a contract: nothing in it declares this. The sampled array length is not a floor.",
    uniqueItems:
        "A raw data payload carries values, not a contract: nothing in it declares this. Uniqueness in a 50-row sample does not " +
            "generalize.",
    maxProperties:
        "A raw data payload carries values, not a contract: nothing in it declares this. The observed key count is not a cap on " +
            "future payloads.",
    minProperties:
        "A raw data payload carries values, not a contract: nothing in it declares this. The observed key count is not a floor on " +
            "future payloads.",
    oneOf: "Polymorphism is a declaration. Rows that disagree are reconciled by mergeInferredProperties into one widened field.",
    anyOf: "Polymorphism is a declaration. Rows that disagree are reconciled by mergeInferredProperties into one widened field.",
    allOf: "Composition is a declaration; an inferred schema is already flat, so there is nothing to compose.",
    not: "A negative constraint cannot be observed from values that satisfy it.",
    discriminator: "Requires a declared variant mapping; a key that happens to hold a type name is not one.",
    uiLayout: "Inference emits no layout. DefaultLayoutGenerator.ensureLayout synthesizes one from the inferred properties later.",
    additionalProperties:
        "Inference produces the closed set it observed. Setting true here would re-enter hybrid inference on its own " +
            "output.",

    "ui.placeholder": "An authoring directive with no counterpart in a payload.",
    "ui.visible": "An authoring directive with no counterpart in a payload; hiding an inferred field would hide the data it came from.",
    "ui.enabled": "An authoring directive with no counterpart in a payload.",
    "ui.visibleOn": "A cross-field rule must be declared; it cannot be observed from one snapshot of the data.",
    "ui.enabledOn": "A cross-field rule must be declared; it cannot be observed from one snapshot of the data.",
    "ui.format": "No declared format exists; ISO date strings are promoted to type 'date', which is what the plugins key off.",
    "ui.valueState": "A runtime validation state, not a property of the data; ValidationLedger owns it.",
    "ui.rows": "A control sizing hint with no counterpart in a payload.",
    "ui.expandable": "A control presentation hint with no counterpart in a payload.",
    "ui.fullWidth": "A control presentation hint with no counterpart in a payload.",
    "ui.controlProps": "Raw UI5 control settings must be authored; they cannot be derived from data.",
    "ui.options": "Plugin-specific options must be authored; they cannot be derived from data.",
    "ui.valueHelp": "Distinct sampled values are not an authoritative key/text list, so none is emitted.",
    "ui.dataSource": "A remote endpoint must be declared; a payload contains no URL contract.",
    "ui.validators": "Validators are declared rules; inferring them from samples would reject valid future input.",
    "ui.formatter": "A formatter is a declared display rule, not an observable property of a value.",
    "ui.formatters": "A formatter chain is a declared display rule, not an observable property of a value.",
    "ui.args": "Arguments belong to a declared validator or formatter, neither of which inference emits.",
    "ui.dialogButtonText": "Dialog chrome text must be authored; a payload says nothing about dialog buttons.",
    "ui.layoutBudget": "LayoutScorer assigns the budget from the measured footprint after inference, not from the data.",
    "ui.renderMode": "LayoutScorer decides inline vs dialog from the measured footprint after inference, not from the data.",
    "ui.labelSpan": "A ResponsiveGridLayout sizing override must be authored.",
};

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
     * @param seen Set of objects on the current ancestor chain, used to break reference cycles.
     * @returns {Record<string, IPropertyMetadata>} The merged column property map.
     */
    public static inferPropertiesFromRows(
        rows: unknown[],
        depth: number = 0,
        seen: WeakSet<object> = new WeakSet()
    ): Record<string, IPropertyMetadata> {
        // WALKER_EXEMPT: DataInferenceBuilder.inferPropertiesFromRows walks raw JavaScript array payloads (sampling up to INFERENCE_SAMPLE_LIMIT rows) to synthesize an ISchema when no schema exists.
        if (depth >= MAX_SCHEMA_DEPTH) {
            Logger.warn(
                "[MetaUI DataInferenceBuilder]",
                `Maximum inference depth (${MAX_SCHEMA_DEPTH}) reached while sampling array rows; truncating nested inference.`,
                "DataInferenceBuilder"
            );
            return {};
        }
        let merged: Record<string, IPropertyMetadata> = {};
        const limit = Math.min(rows.length, INFERENCE_SAMPLE_LIMIT);
        for (let i = 0; i < limit; i++) {
            const row = rows[i];
            // `inferPropertiesFromObject` pushes and pops `row` itself, so two sibling rows that are the
            // same object are both inferred; only a row that is its own ancestor is a cycle.
            if (isRecord(row) && !seen.has(row)) {
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
        return this.mergeInferredPropertiesInternal(base, next, 0, new WeakSet<object>());
    }

    private static mergeInferredPropertiesInternal(
        base: Record<string, IPropertyMetadata>,
        next: Record<string, IPropertyMetadata>,
        depth: number,
        activeMaps: WeakSet<object>
    ): Record<string, IPropertyMetadata> {
        // WALKER_EXEMPT: DataInferenceBuilder.mergeInferredPropertiesInternal performs a binary zip-merge of two inferred Record<string, IPropertyMetadata> property maps across multi-row samples, not a single-schema walk.
        if (depth > MAX_SCHEMA_DEPTH) {
            Logger.warn(
                "[MetaUI DataInferenceBuilder]",
                `Maximum schema depth (${MAX_SCHEMA_DEPTH}) reached in mergeInferredProperties; truncating recursive merge.`,
                "DataInferenceBuilder"
            );
            return { ...base };
        }
        if (activeMaps.has(base) || activeMaps.has(next)) {
            Logger.warn(
                "[MetaUI DataInferenceBuilder]",
                "Circular property map detected in mergeInferredProperties; truncating recursive merge.",
                "DataInferenceBuilder"
            );
            return { ...base };
        }
        activeMaps.add(base);
        activeMaps.add(next);
        try {
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
                    existing.type === SCHEMA_TYPE.STRING &&
                    !existing.properties &&
                    !existing.items &&
                    existing.nullable === true;
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
                        properties: this.mergeInferredPropertiesInternal(
                            existing.properties,
                            incoming.properties,
                            depth + 1,
                            activeMaps
                        )
                    };
                } else if (existing.items?.properties && incoming.items?.properties) {
                    merged[key] = {
                        ...existing,
                        nullable: combinedNullable,
                        items: {
                            ...existing.items,
                            properties: this.mergeInferredPropertiesInternal(
                                existing.items.properties,
                                incoming.items.properties,
                                depth + 1,
                                activeMaps
                            )
                        }
                    };
                } else if (combinedNullable !== existing.nullable) {
                    merged[key] = { ...existing, nullable: combinedNullable };
                }
            }
            return merged;
        } finally {
            activeMaps.delete(base);
            activeMaps.delete(next);
        }
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
     * `seen` is an **ancestor stack**, not a visited-set: every object is removed again once its own
     * subtree is finished. Leaving entries behind made a plain DAG - the same object referenced from two
     * siblings - look like a cycle, and the second reference silently degraded to `{ type: "string" }`.
     *
     * @param obj The raw JavaScript object.
     * @param depth Current recursion depth.
     * @param seen Set of objects on the current ancestor chain, used to break reference cycles.
     * @returns {Record<string, IPropertyMetadata>} A dictionary of inferred metadata.
     */
    public static inferPropertiesFromObject(
        obj: JsonRecord,
        depth: number = 0,
        seen: WeakSet<object> = new WeakSet()
    ): Record<string, IPropertyMetadata> {
        // WALKER_EXEMPT: DataInferenceBuilder.inferPropertiesFromObject walks raw JavaScript data objects to synthesize IPropertyMetadata and is audited directly by [PRODUCER_COMPLETENESS].
        if (depth >= MAX_SCHEMA_DEPTH) {
            Logger.warn(
                "[MetaUI DataInferenceBuilder]",
                `Maximum inference depth (${MAX_SCHEMA_DEPTH}) reached; truncating nested inference.`,
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
                if (seen.has(val) || depth + 1 >= MAX_SCHEMA_DEPTH) {
                    if (depth + 1 >= MAX_SCHEMA_DEPTH) {
                        Logger.warn(
                            "[MetaUI DataInferenceBuilder]",
                            `Maximum inference depth (${MAX_SCHEMA_DEPTH}) reached on array '${key}'; truncating nested inference.`,
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
                    seen.delete(val);
                }
            } else if (isRecord(val)) {
                if (seen.has(val)) {
                    type = SCHEMA_TYPE.STRING;
                } else if (depth + 1 >= MAX_SCHEMA_DEPTH) {
                    Logger.warn(
                        "[MetaUI DataInferenceBuilder]",
                        `Maximum inference depth (${MAX_SCHEMA_DEPTH}) reached on object '${key}'; truncating nested inference.`,
                        "DataInferenceBuilder"
                    );
                    type = SCHEMA_TYPE.OBJECT;
                    nestedProps = {};
                } else {
                    type = SCHEMA_TYPE.OBJECT;
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

        seen.delete(obj);
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
    public static mergeHybridProperties(
        inferredProps: JsonRecord,
        explicitProps: JsonRecord
    ): JsonRecord {
        return this.mergeHybridPropertiesInternal(inferredProps, explicitProps, 0, new WeakSet<object>());
    }

    private static mergeHybridPropertiesInternal(
        inferredProps: JsonRecord,
        explicitProps: JsonRecord,
        depth: number,
        activeMaps: WeakSet<object>
    ): JsonRecord {
        // WALKER_EXEMPT: DataInferenceBuilder.mergeHybridPropertiesInternal performs a binary zip-merge of inferred and explicit JsonRecord property maps for hybrid inference, not a single-schema walk.
        if (depth > MAX_SCHEMA_DEPTH) {
            Logger.warn(
                "[MetaUI DataInferenceBuilder]",
                `Maximum schema depth (${MAX_SCHEMA_DEPTH}) reached in mergeHybridProperties; truncating recursive merge.`,
                "DataInferenceBuilder"
            );
            return { ...inferredProps, ...explicitProps };
        }
        if (activeMaps.has(inferredProps) || activeMaps.has(explicitProps)) {
            Logger.warn(
                "[MetaUI DataInferenceBuilder]",
                "Circular property map detected in mergeHybridProperties; truncating recursive merge.",
                "DataInferenceBuilder"
            );
            return { ...inferredProps, ...explicitProps };
        }
        activeMaps.add(inferredProps);
        activeMaps.add(explicitProps);
        try {
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
                        if (expProp.type !== undefined && expProp.type !== infClone.type && !expUi?.widget) {
                            delete uiClone.widget;
                        }
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
                        infClone.properties = this.mergeHybridPropertiesInternal(
                            allowedInferredNested,
                            expProp.properties,
                            depth + 1,
                            activeMaps
                        );
                    }
                    cleanedBase[key] = infClone;
                } else {
                    cleanedBase[key] = infProp;
                }
            }
            return this.deepMergeRecords(cleanedBase, explicitProps, depth);
        } finally {
            activeMaps.delete(inferredProps);
            activeMaps.delete(explicitProps);
        }
    }

    private static deepMergeRecords(
        base: JsonRecord,
        override: JsonRecord,
        depth: number = 0,
        activeRecords: WeakSet<object> = new WeakSet<object>()
    ): JsonRecord {
        // WALKER_EXEMPT: Mutually-recursive helper of DataInferenceBuilder.mergeHybridProperties for binary zip-merge of two JsonRecord dictionaries.
        if (depth > MAX_SCHEMA_DEPTH) {
            Logger.warn(
                "[MetaUI DataInferenceBuilder]",
                `Maximum schema depth (${MAX_SCHEMA_DEPTH}) reached in deepMergeRecords; truncating recursive merge.`,
                "DataInferenceBuilder"
            );
            return { ...base, ...override };
        }
        if (activeRecords.has(base) || activeRecords.has(override)) {
            return { ...base, ...override };
        }
        activeRecords.add(base);
        activeRecords.add(override);
        try {
            const merged: JsonRecord = { ...base };
            for (const key of Object.keys(override)) {
                const overrideVal = override[key];
                const baseVal = merged[key];
                merged[key] =
                    isRecord(baseVal) && isRecord(overrideVal)
                        ? this.deepMergeRecords(baseVal, overrideVal, depth + 1, activeRecords)
                        : overrideVal;
            }
            return merged;
        } finally {
            activeRecords.delete(base);
            activeRecords.delete(override);
        }
    }
}
