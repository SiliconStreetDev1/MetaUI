/**
 * @file SchemaNormalizer.ts
 * @description Transforms and validates incoming JSON payloads into the strict v2 ISchema dictionary matrix.
 * Pure, idempotent, and lossless across all IPropertyMetadata and ISchema keywords.
 */

import { ISchema, IPropertyMetadata } from "../interfaces/ISchema";
import { SCHEMA_TYPE, WIDGET_TYPE, MAX_SCHEMA_DEPTH } from "../constants/MetaUIConstants";
import { ISchemaBuilderPlugin } from "../interfaces/ISchemaBuilderPlugin";
import { DataInferenceBuilder } from "./DataInferenceBuilder";
import { SchemaDirectiveNormalizer } from "./SchemaDirectiveNormalizer";
import { SchemaWalker } from "./SchemaWalker";
import { OpenApiConstraintMapper } from "../openapi/parsers/OpenApiConstraintMapper";
import { OpenApiRefResolver } from "../openapi/OpenApiRefResolver";
import { PolymorphicUtil } from "../utils/PolymorphicUtil";
import { Logger } from "../utils/Logger";
import {
    JsonRecord, isRecord, readString, readNumber, readBoolean, readRecord, readStringArray, deepClone
} from "../utils/TypeGuards";



/**
 * The subset of a schema node the `writeOnly` payload walk reads.
 *
 * Both {@link ISchema} and {@link IPropertyMetadata} satisfy it structurally, which is the point: the
 * walk descends from a root `ISchema` into `IPropertyMetadata` children and through `$ref` back into
 * `ISchema` definitions, and this is the only shape it needs at every one of those steps. Declaring it
 * is what keeps the walk free of casts across the `ISchema` / `IPropertyMetadata` boundary.
 */
interface IWriteOnlyNode {
    /** Reference pointer to a `definitions` entry, present on `IPropertyMetadata` only. */
    $ref?: string;
    /** Accepted on a write, never returned on a read; present on `IPropertyMetadata` only. */
    writeOnly?: boolean;
    /** Declared child properties. */
    properties?: Record<string, IPropertyMetadata>;
    /** Declared array item schema. */
    items?: IPropertyMetadata;
    /** Declared dictionary value schema, or the open/closed flag. */
    additionalProperties?: boolean | IPropertyMetadata;
}

/**
 * Members of `IPropertyMetadata` and `IUIDirective` that this producer deliberately does not write.
 *
 * Bare keys name `IPropertyMetadata` members; `ui.`-prefixed keys name `IUIDirective` members.
 * Every member must either be written by `SchemaNormalizer.normalizePropertyMetadata` /
 * `SchemaDirectiveNormalizer.normalizeUI` or appear here with a reason, or the
 * `[PRODUCER_COMPLETENESS]` gate in `scripts/run-tests.js` fails the build.
 *
 * This set is empty on purpose. `SchemaNormalizer` is the terminal `ISchemaBuilderPlugin` and every
 * other builder's output is re-normalized through it, so a field it drops is dropped for the whole
 * pipeline. It is the one producer with no downstream to defer to.
 */
export const DECLINED_SCHEMA_FIELDS: Readonly<Record<string, string>> = {};

/**
 * Normalizes raw JSON schemas (or raw data, via {@link DataInferenceBuilder}) into the strict {@link ISchema} contract.
 * Acts as the final fallback {@link ISchemaBuilderPlugin} in the `SchemaBuilderRegistry`.
 *
 * @namespace nz.co.siliconst.ui5.metaui.core
 * @public
 */
export class SchemaNormalizer implements ISchemaBuilderPlugin {
    /** ISchemaBuilderPlugin contract. Always true because this is the terminal fallback builder. */
    public canHandle(): boolean {
        return true;
    }

    /** ISchemaBuilderPlugin contract. Delegates to {@link SchemaNormalizer.normalize}. */
    public build(rawSchema: unknown): ISchema {
        return SchemaNormalizer.normalize(rawSchema);
    }

    /**
     * Normalizes a single `$ref` definition entry, preserving all `IPropertyMetadata` and `ISchema` fields
     * (including `oneOf`, `anyOf`, `discriminator`, `enum`, constraints, and primitive types).
     *
     * @param rawDef The raw definition object.
     * @param key The definition key name.
     * @param rootSource Optional root schema document for resolving inner `$ref` pointers.
     * @returns {ISchema} The normalized definition schema.
     */
    public static normalizeDefinition(rawDef: unknown, key: string, rootSource?: JsonRecord): ISchema {
        return this.normalizeDefinitionInternal(rawDef, key, rootSource, 0, new WeakSet<object>());
    }

    private static normalizeDefinitionInternal(
        rawDef: unknown,
        key: string,
        rootSource: JsonRecord | undefined,
        depth: number,
        activeDefs: WeakSet<object>
    ): ISchema {
        // WALKER_EXEMPT: SchemaNormalizer.normalizeDefinitionInternal is the raw-input ingestion normalizer audited by [PRODUCER_COMPLETENESS] that constructs normalized ISchema definitions before SchemaWalker runs.
        const defSchema = this.normalizeInternal(rawDef, undefined, depth + 1, activeDefs);
        if (isRecord(rawDef)) {
            const defMeta = this.normalizePropertyMetadata(rawDef, key, false, rootSource || rawDef, undefined, depth + 1);
            Object.assign(defSchema, {
                ...defMeta,
                title: defSchema.title || defMeta.title || key,
                type: defMeta.type === "array" ? "array" : (defMeta.type || defSchema.type),
                required: readStringArray(rawDef, "required")
            });
        }
        return defSchema;
    }

    /**
     * Normalizes a raw schema. Falls back to full data inference when no usable schema is supplied,
     * and merges inferred properties when the schema opts into hybrid inference (`additionalProperties: true`).
     */
    public static normalize(rawSchema?: unknown, data?: unknown): ISchema {
        return this.normalizeInternal(rawSchema, data, 0, new WeakSet<object>());
    }

    private static normalizeInternal(
        rawSchema: unknown,
        data: unknown,
        depth: number,
        activeDefs: WeakSet<object>
    ): ISchema {
        // WALKER_EXEMPT: SchemaNormalizer.normalizeInternal is the raw-input ingestion normalizer audited by [PRODUCER_COMPLETENESS] that constructs the normalized ISchema and definitions map before SchemaWalker runs.
        if (depth > MAX_SCHEMA_DEPTH) {
            Logger.warn(
                "[MetaUI SchemaNormalizer]",
                `Definition nesting exceeded MAX_SCHEMA_DEPTH (${MAX_SCHEMA_DEPTH}); truncating nested definition normalization.`
            );
            return { type: "object", properties: {} };
        }
        let schemaObj: unknown = rawSchema;

        if (typeof schemaObj === "string") {
            if (!schemaObj.trim()) {
                schemaObj = null;
            } else {
                try {
                    schemaObj = JSON.parse(schemaObj);
                } catch (e) {
                    const msg = "Failed to parse schema string: " + (e as Error).message;
                    Logger.error("[MetaUI SchemaNormalizer]", msg);
                    throw new Error(msg);
                }
            }
        }
        if (!isRecord(schemaObj)) {
            return DataInferenceBuilder.inferSchemaFromData(data);
        }
        if (activeDefs.has(schemaObj)) {
            Logger.warn(
                "[MetaUI SchemaNormalizer]",
                "Circular schema definition reference detected during normalization; stopping recursion."
            );
            return { type: "object", properties: {} };
        }
        activeDefs.add(schemaObj);

        try {
            const rootSource: JsonRecord = schemaObj;
            const rootRef = readString(schemaObj, "$ref");
            if (rootRef) {
                const resolvedRoot = OpenApiRefResolver.resolve(rootRef, rootSource);
                if (isRecord(resolvedRoot)) {
                    schemaObj = { ...resolvedRoot, ...schemaObj };
                    delete (schemaObj as JsonRecord).$ref;
                }
            }
            if (isRecord(schemaObj) && Array.isArray(schemaObj.allOf)) {
                schemaObj = OpenApiConstraintMapper.resolveAllOf(schemaObj, rootSource);
            }
            if (!isRecord(schemaObj)) {
                return DataInferenceBuilder.inferSchemaFromData(data);
            }

            const rawType = Array.isArray(schemaObj.type)
                ? schemaObj.type.find((t): t is string => typeof t === "string" && t !== "null")
                : readString(schemaObj, "type");
            const isArray = rawType === SCHEMA_TYPE.ARRAY || (!rawType && isRecord(schemaObj.items));
            const additionalBool = readBoolean(schemaObj, "additionalProperties");
            const additionalProperties: boolean | IPropertyMetadata | undefined =
                additionalBool !== undefined
                    ? additionalBool
                    : isRecord(schemaObj.additionalProperties)
                      ? this.normalizePropertyMetadata(schemaObj.additionalProperties, "value", false, rootSource)
                      : undefined;
            const requiredKeys = readStringArray(schemaObj, "required");

            const normalized: ISchema = {
                title: readString(schemaObj, "title"),
                type: isArray ? "array" : "object",
                ui: isRecord(schemaObj.ui)
                    ? SchemaDirectiveNormalizer.normalizeUI(
                          schemaObj.ui,
                          schemaObj,
                          "root",
                          isArray ? "array" : "object",
                          false
                      )
                    : undefined,
                layoutStrategy: readString(schemaObj, "layoutStrategy"),
                uiLayout: SchemaDirectiveNormalizer.normalizeLayout(schemaObj.uiLayout),
                additionalProperties,
                required: requiredKeys,
                readOnly: readBoolean(schemaObj, "readOnly"),
                maxItems: readNumber(schemaObj, "maxItems"),
                minItems: readNumber(schemaObj, "minItems"),
                uniqueItems: readBoolean(schemaObj, "uniqueItems"),
                maxProperties: readNumber(schemaObj, "maxProperties"),
                minProperties: readNumber(schemaObj, "minProperties"),
                uiPolicies: SchemaDirectiveNormalizer.normalizePolicies(schemaObj.uiPolicies)
            };

            const defsA = readRecord(rootSource, "definitions");
            const defsB = readRecord(rootSource, "$defs");
            const definitions: JsonRecord | undefined =
                defsA || defsB ? { ...(defsA || {}), ...(defsB || {}) } : undefined;
            if (definitions) {
                normalized.definitions = {};
                for (const key of Object.keys(definitions)) {
                    normalized.definitions[key] = this.normalizeDefinitionInternal(
                        definitions[key],
                        key,
                        rootSource,
                        depth,
                        activeDefs
                    );
                }
            }

            const inferred =
                additionalBool === true && data ? DataInferenceBuilder.inferSchemaFromData(data) : undefined;
            if (isArray) {
                let rawItems: JsonRecord = readRecord(schemaObj, "items") || {
                    type: SCHEMA_TYPE.OBJECT,
                    properties: {}
                };
                const inferredItemProps = inferred?.items?.properties;
                if (inferredItemProps) {
                    rawItems = {
                        ...rawItems,
                        properties: DataInferenceBuilder.mergeHybridProperties(
                            inferredItemProps,
                            readRecord(rawItems, "properties") || {}
                        )
                    };
                }
                const sampleRow = Array.isArray(data) ? data.find(isRecord) : undefined;
                normalized.items = this.normalizePropertyMetadata(rawItems, "items", false, rootSource, sampleRow);
            } else {
                let targetProperties: JsonRecord = readRecord(schemaObj, "properties") || {};
                if (inferred?.properties) {
                    targetProperties = DataInferenceBuilder.mergeHybridProperties(
                        inferred.properties,
                        targetProperties
                    );
                }
                normalized.properties = this.normalizeProperties(
                    targetProperties,
                    requiredKeys || [],
                    rootSource,
                    data
                );

                if (Array.isArray(schemaObj.oneOf) || Array.isArray(schemaObj.anyOf)) {
                    this.mergeRootPolymorphicBranches(normalized, schemaObj, rootSource);
                } else if (
                    Object.keys(normalized.properties).length === 0 &&
                    ((rawType && rawType !== SCHEMA_TYPE.OBJECT) || Array.isArray(schemaObj.enum))
                ) {
                    const valueKey = readString(schemaObj, "title") || "value";
                    normalized.properties[valueKey] = this.normalizePropertyMetadata(
                        schemaObj,
                        valueKey,
                        false,
                        rootSource
                    );
                }
            }
            return normalized;
        } finally {
            if (isRecord(rawSchema)) {
                activeDefs.delete(rawSchema);
            }
        }
    }

    /** Infers a v2 `ISchema` structure dynamically from a plain data payload (Full Inference Mode). */
    public static inferSchemaFromData(data: unknown): ISchema {
        return DataInferenceBuilder.inferSchemaFromData(data);
    }

    /**
     * Removes the values of every `writeOnly` property from an inbound payload, in place.
     *
     * JSON Schema and OpenAPI define `writeOnly` as "may be sent to the owning authority, is never
     * returned by it". A generated form is on both sides of that contract: the payload it is seeded
     * with is a *read*, and the payload it emits is a *write*. So a `writeOnly` value supplied as
     * input is dropped — it is never rendered and never echoed back — while a value the user types
     * is kept and submitted, which is the whole point of the keyword on a password field.
     *
     * Stripping at ingestion rather than at extraction is what preserves that asymmetry; filtering
     * `extractPayload()` instead would make it impossible to set a `writeOnly` field at all.
     *
     * The payload is mutated rather than copied because the only caller has already deep-cloned the
     * consumer's data into the sandbox, and a second clone of every payload would be wasted work.
     *
     * @param schema The normalized schema describing the payload.
     * @param data The payload to strip, mutated in place.
     */
    public static stripWriteOnlyValues(schema: ISchema | undefined, data: unknown): void {
        if (!schema) {
            return;
        }
        this.stripWriteOnlyNode(schema, data, schema.definitions, 0);
    }

    /** Recursive half of {@link SchemaNormalizer.stripWriteOnlyValues}. */
    private static stripWriteOnlyNode(
        meta: IWriteOnlyNode | undefined,
        data: unknown,
        definitions: Record<string, ISchema> | undefined,
        depth: number
    ): void {
        // WALKER_EXEMPT: SchemaNormalizer.stripWriteOnlyNode co-inductively mutates (meta, data) across runtime array rows and dictionary entries to delete writeOnly keys in place.
        if (depth > MAX_SCHEMA_DEPTH) {
            Logger.warn(
                "[MetaUI SchemaNormalizer]",
                `Payload nesting exceeded MAX_SCHEMA_DEPTH (${MAX_SCHEMA_DEPTH}) while stripping writeOnly values; ` +
                    `any writeOnly field below this level was left in the outbound payload.`
            );
            return;
        }
        if (!meta || data === null || typeof data !== "object") {
            return;
        }
        const node = this.resolveWriteOnlyNode(meta, definitions);
        if (Array.isArray(data)) {
            for (const entry of data) {
                this.stripWriteOnlyNode(node.items, entry, definitions, depth + 1);
            }
            return;
        }
        const record = data as JsonRecord;
        const declared = node.properties;
        if (declared) {
            for (const key of Object.keys(declared)) {
                if (!(key in record)) {
                    continue;
                }
                if (declared[key].writeOnly === true) {
                    delete record[key];
                } else {
                    this.stripWriteOnlyNode(declared[key], record[key], definitions, depth + 1);
                }
            }
        }
        const additional = node.additionalProperties;
        if (typeof additional !== "object" || additional === null) {
            return;
        }
        for (const key of Object.keys(record)) {
            if (declared && key in declared) {
                continue;
            }
            if (additional.writeOnly === true) {
                delete record[key];
            } else {
                this.stripWriteOnlyNode(additional, record[key], definitions, depth + 1);
            }
        }
    }

    /** Resolves a `$ref` node against the normalized `definitions` dictionary for the `writeOnly` walk. */
    private static resolveWriteOnlyNode(
        meta: IWriteOnlyNode,
        definitions: Record<string, ISchema> | undefined
    ): IWriteOnlyNode {
        if (!meta.$ref || !definitions) {
            return meta;
        }
        return definitions[OpenApiRefResolver.extractRefName(meta.$ref)] || meta;
    }

    private static mergeRootPolymorphicBranches(normalized: ISchema, schemaObj: JsonRecord, rootSource: JsonRecord): void {
        const rootMeta = this.normalizePropertyMetadata(schemaObj, normalized.title || "Root", false, rootSource);
        PolymorphicUtil.mergePolymorphicRootBranches(normalized, rootMeta);
    }

    /** Normalizes a dictionary of raw property definitions. */
    private static normalizeProperties(
        properties: JsonRecord, requiredKeys: string[], rootSchema?: JsonRecord,
        data?: unknown, depth: number = 0, activeRefs: Set<string> = new Set()
    ): Record<string, IPropertyMetadata> {
        // WALKER_EXEMPT: SchemaNormalizer.normalizeProperties is the bottom-up JSON Schema IPropertyMetadata producer dictionary loop audited by [PRODUCER_COMPLETENESS].
        const normalizedProps: Record<string, IPropertyMetadata> = {};
        if (depth > MAX_SCHEMA_DEPTH) {
            Logger.warn(
                "[MetaUI SchemaNormalizer]",
                `Nested schema exceeded MAX_SCHEMA_DEPTH (${MAX_SCHEMA_DEPTH}); ` +
                    `${Object.keys(properties).length} propert(ies) were dropped.`
            );
            return normalizedProps;
        }
        for (const key of Object.keys(properties)) {
            const raw = properties[key];
            if (!isRecord(raw)) {
                Logger.warn("[MetaUI SchemaNormalizer]", `Property '${key}' is not a schema object; treating it as a plain string field.`);
            }
            const childData = isRecord(data) ? data[key] : undefined;
            // Not depth + 1: normalizeProperties and normalizePropertyMetadata are the two halves of a
            // single nesting level (normalizeProperties -> normalizePropertyMetadata -> normalizeProperties).
            // Incrementing in both halves charged two units per level and made MAX_SCHEMA_DEPTH bite
            // at half its stated value, silently stripping every constraint below level 5.
            normalizedProps[key] = this.normalizePropertyMetadata(
                isRecord(raw) ? raw : {}, key, requiredKeys.includes(key), rootSchema, childData, depth, activeRefs
            );
        }
        return normalizedProps;
    }

    /** Normalizes a single raw property definition. */
    private static normalizePropertyMetadata(
        rawProp: JsonRecord, keyName: string, isRequired: boolean, rootSchema?: JsonRecord,
        data?: unknown, depth: number = 0, activeRefs: Set<string> = new Set()
    ): IPropertyMetadata {
        // WALKER_EXEMPT: SchemaNormalizer.normalizePropertyMetadata is the bottom-up JSON Schema IPropertyMetadata producer with hybrid data inference audited directly by [PRODUCER_COMPLETENESS].
        if (depth > MAX_SCHEMA_DEPTH) {
            // The descriptor below is a placeholder, not a normalization: the declared type and every
            // constraint on this property are discarded. Say so rather than letting the field silently
            // degrade into an empty object.
            Logger.warn(
                "[MetaUI SchemaNormalizer]",
                `Property '${keyName}' exceeded MAX_SCHEMA_DEPTH (${MAX_SCHEMA_DEPTH}); ` +
                    `its type and constraints were not normalized.`
            );
            return { type: SCHEMA_TYPE.OBJECT, ui: { label: DataInferenceBuilder.generateLabel(keyName) } };
        }
        const rawAllOf = rawProp.allOf;
        const prop: JsonRecord = Array.isArray(rawAllOf)
            ? OpenApiConstraintMapper.resolveAllOf(rawProp, rootSchema, 0, activeRefs)
            : rawProp;
        const { type, hasNullType } = SchemaDirectiveNormalizer.resolveSchemaType(prop, keyName);
        const rawUi = readRecord(prop, "ui") || {};
        const valueHelp = SchemaDirectiveNormalizer.normalizeValueHelp(prop.valueHelp ?? rawUi.valueHelp);
        const enumValues = SchemaDirectiveNormalizer.normalizeEnum(prop.enum);
        const itemsRecord = readRecord(prop, "items");
        const itemsEnum = itemsRecord ? SchemaDirectiveNormalizer.normalizeEnum(itemsRecord.enum) : undefined;
        const hasChoices = Array.isArray(valueHelp) || !!enumValues || !!itemsEnum;

        const normalized: IPropertyMetadata = {
            type,
            $ref: readString(prop, "$ref"),
            title: readString(prop, "title"),
            description: readString(prop, "description"),
            format: readString(prop, "format"),
            const: prop.const === undefined ? undefined : deepClone(prop.const),
            ui: SchemaDirectiveNormalizer.normalizeUI(rawUi, prop, keyName, type, hasChoices),
            required: isRequired || prop.required === true,
            maxLength: readNumber(prop, "maxLength"),
            minLength: readNumber(prop, "minLength"),
            minimum: readNumber(prop, "minimum"),
            maximum: readNumber(prop, "maximum"),
            pattern: readString(prop, "pattern"),
            multipleOf: readNumber(prop, "multipleOf"),
            valueHelp,
            enum: enumValues,
            default: prop.default === undefined ? undefined : deepClone(prop.default),
            nullable: readBoolean(prop, "nullable") ?? (hasNullType ? true : undefined),
            writeOnly: readBoolean(prop, "writeOnly"),
            readOnly: readBoolean(prop, "readOnly"),
            example: prop.example === undefined ? undefined : deepClone(prop.example),
            exclusiveMinimum: readBoolean(prop, "exclusiveMinimum") ?? readNumber(prop, "exclusiveMinimum"),
            exclusiveMaximum: readBoolean(prop, "exclusiveMaximum") ?? readNumber(prop, "exclusiveMaximum"),
            maxItems: readNumber(prop, "maxItems"),
            minItems: readNumber(prop, "minItems"),
            uniqueItems: readBoolean(prop, "uniqueItems"),
            maxProperties: readNumber(prop, "maxProperties"),
            minProperties: readNumber(prop, "minProperties"),
            oneOf: this.normalizeSchemaList(prop.oneOf, rootSchema, depth + 1, activeRefs),
            anyOf: this.normalizeSchemaList(prop.anyOf, rootSchema, depth + 1, activeRefs),
            allOf: this.normalizeSchemaList(rawAllOf, rootSchema, depth + 1, activeRefs),
            not: isRecord(prop.not)
                ? this.normalizePropertyMetadata(
                      prop.not,
                      keyName,
                      false,
                      rootSchema,
                      undefined,
                      depth + 1,
                      activeRefs
                  )
                : undefined,
            discriminator: SchemaDirectiveNormalizer.normalizeDiscriminator(prop.discriminator),
            uiLayout: SchemaDirectiveNormalizer.normalizeLayout(prop.uiLayout)
        };

        const additional = prop.additionalProperties;
        if (typeof additional === "boolean") {
            normalized.additionalProperties = additional;
        } else if (isRecord(additional)) {
            normalized.additionalProperties = this.normalizePropertyMetadata(
                additional,
                "value",
                false,
                rootSchema,
                undefined,
                depth + 1,
                activeRefs
            );
        }

        let rawProperties = readRecord(prop, "properties");
        const rawItems = readRecord(prop, "items");

        if (type === SCHEMA_TYPE.OBJECT) {
            if (additional === true && isRecord(data)) {
                const inferredChild = DataInferenceBuilder.inferPropertiesFromObject(data);
                rawProperties = DataInferenceBuilder.mergeHybridProperties(inferredChild, rawProperties || {});
            }
            if (rawProperties) {
                normalized.properties = this.normalizeProperties(
                    rawProperties,
                    readStringArray(prop, "required") || [],
                    rootSchema,
                    data,
                    depth + 1,
                    activeRefs
                );
            }
        } else if (type === SCHEMA_TYPE.ARRAY) {
            let itemsSource: JsonRecord | undefined =
                rawItems ||
                (rawProperties
                    ? { type: SCHEMA_TYPE.OBJECT, properties: rawProperties, required: prop.required }
                    : undefined);
            if (itemsSource) {
                if (itemsSource.additionalProperties === true && Array.isArray(data)) {
                    const inferredItemProps = DataInferenceBuilder.inferPropertiesFromRows(data);
                    itemsSource = {
                        ...itemsSource,
                        properties: DataInferenceBuilder.mergeHybridProperties(
                            inferredItemProps,
                            readRecord(itemsSource, "properties") || {}
                        )
                    };
                }
                const sampleRow = Array.isArray(data) ? data.find(isRecord) : undefined;
                normalized.items = this.normalizePropertyMetadata(
                    itemsSource,
                    "items",
                    false,
                    rootSchema,
                    sampleRow,
                    depth + 1,
                    activeRefs
                );
            }
        }

        return normalized;
    }

    private static normalizeSchemaList(
        raw: unknown,
        rootSchema?: JsonRecord,
        depth: number = 0,
        activeRefs: Set<string> = new Set()
    ): IPropertyMetadata[] | undefined {
        // WALKER_EXEMPT: SchemaNormalizer.normalizeSchemaList normalizes polymorphic oneOf/anyOf/allOf branch arrays and is audited directly by [PRODUCER_COMPLETENESS].
        if (!Array.isArray(raw)) {
            return undefined;
        }
        if (depth > MAX_SCHEMA_DEPTH) {
            Logger.warn(
                "[MetaUI SchemaNormalizer]",
                `A polymorphic branch list exceeded MAX_SCHEMA_DEPTH (${MAX_SCHEMA_DEPTH}); ` +
                    `${raw.length} branch(es) were dropped.`
            );
            return undefined;
        }
        return raw.filter(isRecord).map((entry) => {
            let sourceEntry: JsonRecord = entry;
            const refPath = readString(entry, "$ref");
            let fallbackKey = readString(entry, "title") || "";
            const nextRefs = new Set(activeRefs);
            if (refPath && rootSchema) {
                const refName = OpenApiRefResolver.extractRefName(refPath);
                fallbackKey = fallbackKey || refName;
                if (nextRefs.has(refPath)) {
                    return {
                        type: SCHEMA_TYPE.OBJECT,
                        $ref: refPath,
                        title: fallbackKey,
                        ui: { label: fallbackKey, widget: WIDGET_TYPE.REFERENCE }
                    };
                }
                nextRefs.add(refPath);
                const resolvedBranch = SchemaDirectiveNormalizer.inlinePolymorphicBranchRef(entry, refPath, rootSchema);
                if (resolvedBranch) {
                    sourceEntry = resolvedBranch.inlined;
                }
            }
            // Not depth + 1: the caller already charged one unit for descending into this branch list.
            // Charging again here halved the usable depth for every oneOf/anyOf/allOf subtree.
            const normalizedBranch = this.normalizePropertyMetadata(
                sourceEntry,
                fallbackKey,
                false,
                rootSchema,
                undefined,
                depth,
                nextRefs
            );
            if (refPath) {
                normalizedBranch.$ref = refPath;
            }
            const branchReq = readStringArray(sourceEntry, "required");
            if (branchReq) {
                normalizedBranch.required = branchReq;
            }
            return normalizedBranch;
        });
    }

    /**
     * Resolves a JSON Schema scope (e.g. `'#/properties/header/properties/id'`) against the `ISchema`,
     * detecting path-scoped object and `$ref` cycles.
     *
     * @param schema The root or item `ISchema`.
     * @param scope The JSON Schema scope pointer.
     * @param resolveDefinition Optional resolver for `$ref` definitions.
     * @param activeNodes Optional path-scoped set of active schema objects.
     * @param activeRefs Optional path-scoped set of active `$ref` pointers.
     * @returns {{ meta: IPropertyMetadata | undefined; bindingPath: string; propKey: string }} Resolved scope tuple.
     */
    public static resolveScope(
        schema: ISchema,
        scope: string,
        resolveDefinition?: (ref: string) => ISchema | null,
        activeNodes?: WeakSet<object>,
        activeRefs?: Set<string>
    ): { meta: IPropertyMetadata | undefined; bindingPath: string; propKey: string } {
        return SchemaWalker.resolveScope(schema, scope, resolveDefinition, activeNodes, activeRefs);
    }
}