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
import { SchemaWalker, ITreeChild, RawRecordShape, JsonPayloadShape } from "./SchemaWalker";
import { DeclinedSchemaFieldsMap, IPropertyProducerContract } from "./SchemaDirectiveNormalizer";

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
export const DECLINED_SCHEMA_FIELDS: DeclinedSchemaFieldsMap = {
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
 * @internal
 */
export class DataInferenceBuilder implements ISchemaBuilderPlugin {
    /** Shared producer contract descriptor for data-driven property metadata inference. */
    public static readonly PRODUCER_CONTRACT: IPropertyProducerContract<unknown, number> = {
        name: "DataInferenceBuilder",
        declinedFields: DECLINED_SCHEMA_FIELDS,
        extractPropertyMetadata: (input: unknown, keyName: string, _isRequired: boolean, depth: number = 0): IPropertyMetadata => {
            const inferred = DataInferenceBuilder.inferPropertiesFromObject({ [keyName]: input }, depth);
            return (
                inferred[keyName] || {
                    type: SCHEMA_TYPE.STRING,
                    ui: { label: DataInferenceBuilder.generateLabel(keyName), readOnly: false }
                }
            );
        }
    };

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
        if (depth >= MAX_SCHEMA_DEPTH) {
            Logger.warn(
                `Maximum inference depth (${MAX_SCHEMA_DEPTH}) reached while sampling array rows; truncating nested inference.`,
                undefined,
                "DataInferenceBuilder"
            );
            return {};
        }
        let merged: Record<string, IPropertyMetadata> = {};
        const hadRows = seen.has(rows);
        if (hadRows) {
            seen.delete(rows);
        }
        SchemaWalker.walk(
            rows,
            (ctx) => {
                if (isRecord(ctx.node)) {
                    seen.delete(ctx.node);
                    merged = this.mergeInferredProperties(
                        merged,
                        this.inferPropertiesFromObject(ctx.node, depth, seen)
                    );
                }
                return "skip-subtree";
            },
            {
                shape: JsonPayloadShape,
                maxArrayItems: INFERENCE_SAMPLE_LIMIT,
                initialDepth: depth,
                activeNodes: seen,
                resolveRefs: false,
                silentTruncationLog: true
            }
        );
        if (hadRows) {
            seen.add(rows);
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
        type PropMap = Record<string, IPropertyMetadata>;
        const activeMaps = new WeakSet<object>();
        const mergedByScope = new Map<string, PropMap>();

        const isDirectOverride = (existing: IPropertyMetadata, incoming: IPropertyMetadata): boolean => {
            const isNullPlaceholder =
                existing.type === SCHEMA_TYPE.STRING &&
                !existing.properties &&
                !existing.items &&
                existing.nullable === true;
            if (isNullPlaceholder && !incoming.nullable) {
                return true;
            }
            if (
                existing.type === SCHEMA_TYPE.ARRAY &&
                existing.items?.type !== SCHEMA_TYPE.OBJECT &&
                incoming.items?.type === SCHEMA_TYPE.OBJECT &&
                incoming.items.properties &&
                Object.keys(incoming.items.properties).length > 0
            ) {
                return true;
            }
            if (
                existing.type === SCHEMA_TYPE.ARRAY &&
                existing.items?.type === SCHEMA_TYPE.STRING &&
                incoming.type === SCHEMA_TYPE.ARRAY &&
                incoming.items?.type &&
                incoming.items.type !== SCHEMA_TYPE.STRING &&
                incoming.items.type !== SCHEMA_TYPE.OBJECT
            ) {
                return true;
            }
            return (
                existing.type === SCHEMA_TYPE.DATE &&
                incoming.type === SCHEMA_TYPE.STRING &&
                !incoming.nullable
            );
        };

        SchemaWalker.walkPaired<PropMap, PropMap>(
            next,
            base,
            {
                stepProperty: (baseMap, key) => baseMap[key]?.properties,
                stepBranch: (baseMap, _kw, key) => baseMap[key]?.items?.properties
            },
            () => undefined,
            {
                shape: {
                    defaultMaxDepth: MAX_SCHEMA_DEPTH,
                    children: () => []
                },
                visitRoot: true,
                resolveRefs: false,
                detectOtherCycles: true,
                activeNodes: activeMaps,
                activeOthers: activeMaps,
                silentTruncationLog: true,
                onTruncate: (scope, reason, _rawNode, otherMap) => {
                    if (reason === "depth") {
                        Logger.warn(
                            `Maximum schema depth (${MAX_SCHEMA_DEPTH}) reached in mergeInferredProperties; ` +
                            "truncating recursive merge.",
                            undefined,
                            "DataInferenceBuilder"
                        );
                    } else if (reason === "cycle") {
                        Logger.warn(
                            "Circular property map detected in mergeInferredProperties; truncating recursive merge.",
                            undefined,
                            "DataInferenceBuilder"
                        );
                    }
                    mergedByScope.set(scope, { ...(otherMap ?? {}) });
                },
                resolveDynamicChildren: (nextMap, ctx) => {
                    const baseMap = ctx.other;
                    if (!baseMap) {
                        return [];
                    }
                    const children: Array<ITreeChild<PropMap>> = [];
                    for (const key of Object.keys(nextMap)) {
                        const existing = baseMap[key];
                        const incoming = nextMap[key];
                        if (!existing || isDirectOverride(existing, incoming)) {
                            continue;
                        }
                        if (existing.properties && incoming.properties) {
                            children.push({
                                key,
                                node: incoming.properties,
                                kind: "property",
                                scopeSegment: key,
                                bindingSegment: key
                            });
                        } else if (existing.items?.properties && incoming.items?.properties) {
                            children.push({
                                key,
                                node: incoming.items.properties,
                                kind: "branch",
                                branchKeyword: "items",
                                scopeSegment: key,
                                bindingSegment: key
                            });
                        }
                    }
                    return children;
                },
                onLeave: (ctx) => {
                    const baseMap = ctx.other ?? {};
                    const nextMap = ctx.node;
                    const merged: PropMap = { ...baseMap };
                    for (const key of Object.keys(nextMap)) {
                        const existing = merged[key];
                        const incoming = nextMap[key];
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
                                properties:
                                    mergedByScope.get(`${ctx.scope}/${key}`) ?? { ...existing.properties }
                            };
                        } else if (existing.items?.properties && incoming.items?.properties) {
                            merged[key] = {
                                ...existing,
                                nullable: combinedNullable,
                                items: {
                                    ...existing.items,
                                    properties:
                                        mergedByScope.get(`${ctx.scope}/${key}`) ?? { ...existing.items.properties }
                                }
                            };
                        } else if (combinedNullable !== existing.nullable) {
                            merged[key] = { ...existing, nullable: combinedNullable };
                        }
                    }
                    mergedByScope.set(ctx.scope, merged);
                }
            }
        );

        return mergedByScope.get("#") ?? { ...base };
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
        if (depth >= MAX_SCHEMA_DEPTH) {
            Logger.warn(
                `Maximum inference depth (${MAX_SCHEMA_DEPTH}) reached; truncating nested inference.`,
                undefined,
                "DataInferenceBuilder"
            );
            return {};
        }
        if (seen.has(obj)) {
            seen.delete(obj);
        }
        const propsByScope = new Map<string, Record<string, IPropertyMetadata>>();
        SchemaWalker.walk(
            obj,
            () => undefined,
            {
                shape: JsonPayloadShape,
                visitRoot: true,
                initialDepth: depth,
                activeNodes: seen,
                resolveRefs: false,
                silentTruncationLog: true,
                resolveDynamicChildren: function* (curNode, ctx) {
                    if (!isRecord(curNode)) {
                        return;
                    }
                    const properties: Record<string, IPropertyMetadata> = {};
                    for (const key of Object.keys(curNode)) {
                        const val = curNode[key];
                        let type: FieldType = SCHEMA_TYPE.STRING;
                        let items: IPropertyMetadata | undefined;
                        let nestedProps: Record<string, IPropertyMetadata> | undefined;

                        if (Array.isArray(val)) {
                            type = SCHEMA_TYPE.ARRAY;
                            if (seen.has(val) || ctx.depth + 1 >= MAX_SCHEMA_DEPTH) {
                                if (ctx.depth + 1 >= MAX_SCHEMA_DEPTH) {
                                    Logger.warn(
                                        `Maximum inference depth (${MAX_SCHEMA_DEPTH}) reached on array '${key}'; ` +
                                        "truncating nested inference.",
                                        undefined,
                                        "DataInferenceBuilder"
                                    );
                                }
                                items = { type: SCHEMA_TYPE.STRING };
                            } else {
                                seen.add(val);
                                try {
                                    const firstNonNull: unknown = val.find((el) => el !== null && el !== undefined);
                                    if (val.length === 0 || firstNonNull === undefined) {
                                        items = { type: SCHEMA_TYPE.STRING };
                                    } else if (!isRecord(firstNonNull)) {
                                        items = { type: DataInferenceBuilder.inferPrimitiveType(firstNonNull) };
                                    } else {
                                        let merged: Record<string, IPropertyMetadata> = {};
                                        const limit = Math.min(val.length, INFERENCE_SAMPLE_LIMIT);
                                        for (let i = 0; i < limit; i++) {
                                            const row = val[i];
                                            // `SchemaWalker` pushes and pops `row` itself, so two sibling rows that are the
                                            // same object are both inferred; only a row that is its own ancestor is a cycle.
                                            if (isRecord(row) && !seen.has(row)) {
                                                const rowScopeSeg = `properties/${key}/items/${i}`;
                                                const rowScope = `${ctx.scope}/${rowScopeSeg}`;
                                                yield {
                                                    key: String(i),
                                                    node: row,
                                                    kind: "item",
                                                    scopeSegment: rowScopeSeg,
                                                    bindingSegment: `${key}/${i}`
                                                };
                                                merged = DataInferenceBuilder.mergeInferredProperties(
                                                    merged,
                                                    propsByScope.get(rowScope) ?? {}
                                                );
                                            }
                                        }
                                        items = {
                                            type: SCHEMA_TYPE.OBJECT,
                                            properties: merged
                                        };
                                    }
                                } finally {
                                    seen.delete(val);
                                }
                            }
                        } else if (isRecord(val)) {
                            if (seen.has(val)) {
                                type = SCHEMA_TYPE.STRING;
                            } else if (ctx.depth + 1 >= MAX_SCHEMA_DEPTH) {
                                Logger.warn(
                                    `Maximum inference depth (${MAX_SCHEMA_DEPTH}) reached on object '${key}'; ` +
                                    "truncating nested inference.",
                                    undefined,
                                    "DataInferenceBuilder"
                                );
                                type = SCHEMA_TYPE.OBJECT;
                                nestedProps = {};
                            } else {
                                type = SCHEMA_TYPE.OBJECT;
                                const childScopeSeg = `properties/${key}`;
                                const childScope = `${ctx.scope}/${childScopeSeg}`;
                                yield {
                                    key,
                                    node: val,
                                    kind: "property",
                                    scopeSegment: childScopeSeg,
                                    bindingSegment: key
                                };
                                nestedProps = propsByScope.get(childScope) ?? {};
                            }
                        } else if (val !== null && val !== undefined) {
                            type = DataInferenceBuilder.inferPrimitiveType(val);
                        }

                        properties[key] = {
                            type,
                            items,
                            properties: nestedProps,
                            nullable: val === null || val === undefined ? true : undefined,
                            ui: {
                                label: DataInferenceBuilder.generateLabel(key),
                                isKey: false,
                                readOnly: false,
                                widget:
                                    type === SCHEMA_TYPE.ARRAY && items?.type !== SCHEMA_TYPE.OBJECT
                                        ? WIDGET_TYPE.MULTI_INPUT
                                        : undefined
                            }
                        };
                    }
                    propsByScope.set(ctx.scope, properties);
                }
            }
        );
        return propsByScope.get("#") ?? {};
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
        const activeMaps = new WeakSet<object>();
        const mergedByScope = new Map<string, JsonRecord>();

        SchemaWalker.walkPaired(
            inferredProps,
            explicitProps,
            {
                stepProperty: (expProps, key) => {
                    const expProp = expProps[key];
                    return isRecord(expProp) && isRecord(expProp.properties) ? expProp.properties : undefined;
                }
            },
            () => undefined,
            {
                shape: RawRecordShape,
                visitRoot: true,
                resolveRefs: false,
                detectOtherCycles: true,
                activeNodes: activeMaps,
                activeOthers: activeMaps,
                silentTruncationLog: true,
                onTruncate: (scope, reason, rawNode, otherMap) => {
                    if (reason === "depth") {
                        Logger.warn(
                            `Maximum schema depth (${MAX_SCHEMA_DEPTH}) reached in mergeHybridProperties; ` +
                            "truncating recursive merge.",
                            undefined,
                            "DataInferenceBuilder"
                        );
                    } else if (reason === "cycle") {
                        Logger.warn(
                            "Circular property map detected in mergeHybridProperties; truncating recursive merge.",
                            undefined,
                            "DataInferenceBuilder"
                        );
                    }
                    mergedByScope.set(scope, { ...(rawNode ?? {}), ...(otherMap ?? {}) });
                },
                resolveDynamicChildren: (infProps, ctx) => {
                    const expProps = ctx.other;
                    if (!expProps) {
                        return [];
                    }
                    const children: Array<ITreeChild<JsonRecord>> = [];
                    for (const key of Object.keys(infProps)) {
                        const infProp = infProps[key];
                        const expProp = expProps[key];
                        if (
                            isRecord(infProp) &&
                            isRecord(expProp) &&
                            isRecord(infProp.properties) &&
                            isRecord(expProp.properties)
                        ) {
                            let allowedInferredNested: JsonRecord = infProp.properties;
                            if (expProp.additionalProperties === false) {
                                allowedInferredNested = {};
                                for (const nestedKey of Object.keys(expProp.properties)) {
                                    if (nestedKey in infProp.properties) {
                                        allowedInferredNested[nestedKey] = infProp.properties[nestedKey];
                                    }
                                }
                            }
                            children.push({
                                key,
                                node: allowedInferredNested,
                                kind: "property",
                                scopeSegment: key,
                                bindingSegment: key
                            });
                        }
                    }
                    return children;
                },
                onLeave: (ctx) => {
                    const infProps = ctx.node;
                    const expProps = ctx.other ?? {};
                    const cleanedBase: JsonRecord = {};
                    for (const key of Object.keys(infProps)) {
                        const infProp = infProps[key];
                        const expProp = expProps[key];
                        if (isRecord(infProp) && isRecord(expProp)) {
                            const infClone: JsonRecord = { ...infProp };
                            if (isRecord(infClone.ui)) {
                                const uiClone: JsonRecord = { ...infClone.ui };
                                const expUi = readRecord(expProp, "ui");
                                if (expProp.title !== undefined && !expUi?.label) delete uiClone.label;
                                if (expProp.readOnly !== undefined && expUi?.readOnly === undefined) {
                                    delete uiClone.readOnly;
                                }
                                if (expProp.type !== undefined && expProp.type !== infClone.type && !expUi?.widget) {
                                    delete uiClone.widget;
                                }
                                infClone.ui = uiClone;
                            }
                            if (isRecord(infClone.properties) && isRecord(expProp.properties)) {
                                infClone.properties =
                                    mergedByScope.get(`${ctx.scope}/${key}`) ??
                                    { ...infClone.properties, ...expProp.properties };
                            }
                            cleanedBase[key] = infClone;
                        } else {
                            cleanedBase[key] = infProp;
                        }
                    }
                    mergedByScope.set(ctx.scope, this.deepMergeRecords(cleanedBase, expProps, ctx.depth));
                }
            }
        );

        return mergedByScope.get("#") ?? { ...inferredProps, ...explicitProps };
    }

    private static deepMergeRecords(
        base: JsonRecord,
        override: JsonRecord,
        initialDepth: number = 0
    ): JsonRecord {
        const activeRecords = new WeakSet<object>();
        const mergedByScope = new Map<string, JsonRecord>();

        SchemaWalker.walkPaired(
            override,
            base,
            {
                stepProperty: (baseRec, key) => {
                    const val = baseRec[key];
                    return isRecord(val) ? val : undefined;
                }
            },
            () => undefined,
            {
                shape: RawRecordShape,
                visitRoot: true,
                resolveRefs: false,
                initialDepth,
                detectOtherCycles: true,
                activeNodes: activeRecords,
                activeOthers: activeRecords,
                silentTruncationLog: true,
                onTruncate: (scope, reason, rawNode, otherRec) => {
                    if (reason === "depth") {
                        Logger.warn(
                            `Maximum schema depth (${MAX_SCHEMA_DEPTH}) reached in deepMergeRecords; ` +
                            "truncating recursive merge.",
                            undefined,
                            "DataInferenceBuilder"
                        );
                    }
                    mergedByScope.set(scope, { ...(otherRec ?? {}), ...(rawNode ?? {}) });
                },
                resolveDynamicChildren: (overrideRec, ctx) => {
                    const baseRec = ctx.other;
                    if (!baseRec) {
                        return [];
                    }
                    const children: Array<ITreeChild<JsonRecord>> = [];
                    for (const key of Object.keys(overrideRec)) {
                        const overrideVal = overrideRec[key];
                        const baseVal = baseRec[key];
                        if (isRecord(baseVal) && isRecord(overrideVal)) {
                            children.push({
                                key,
                                node: overrideVal,
                                kind: "property",
                                scopeSegment: key,
                                bindingSegment: key
                            });
                        }
                    }
                    return children;
                },
                onLeave: (ctx) => {
                    const baseRec = ctx.other ?? {};
                    const overrideRec = ctx.node;
                    const merged: JsonRecord = { ...baseRec };
                    for (const key of Object.keys(overrideRec)) {
                        const overrideVal = overrideRec[key];
                        const baseVal = merged[key];
                        merged[key] =
                            isRecord(baseVal) && isRecord(overrideVal)
                                ? (mergedByScope.get(`${ctx.scope}/${key}`) ?? { ...baseVal, ...overrideVal })
                                : overrideVal;
                    }
                    mergedByScope.set(ctx.scope, merged);
                }
            }
        );

        return mergedByScope.get("#") ?? { ...base, ...override };
    }
}
