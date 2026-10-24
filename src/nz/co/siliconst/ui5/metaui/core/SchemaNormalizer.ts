/**
 * @file SchemaNormalizer.ts
 * @description Transforms and validates incoming JSON payloads into the strict v2 ISchema dictionary matrix.
 * Pure, idempotent, and lossless across all IPropertyMetadata and ISchema keywords.
 */

import { ISchema, IPropertyMetadata, FieldType } from "../interfaces/ISchema";
import { SCHEMA_TYPE, WIDGET_TYPE, MAX_SCHEMA_DEPTH } from "../constants/MetaUIConstants";
import { ISchemaBuilderPlugin } from "../interfaces/ISchemaBuilderPlugin";
import { DataInferenceBuilder } from "./DataInferenceBuilder";
import {
    DeclinedSchemaFieldsMap,
    IPropertyProducerContract,
    SchemaDirectiveNormalizer
} from "./SchemaDirectiveNormalizer";
import { ITreeChild, ITreeShape, RawRecordShape, SchemaShape, SchemaWalker } from "./SchemaWalker";
import { OpenApiConstraintMapper } from "../openapi/parsers/OpenApiConstraintMapper";
import { OpenApiRefResolver } from "../openapi/OpenApiRefResolver";
import { PolymorphicUtil } from "../utils/PolymorphicUtil";
import { Logger } from "../utils/Logger";
import {
    JsonRecord, isRecord, readString, readNumber, readBoolean, readRecord, readStringArray, deepClone
} from "../utils/TypeGuards";

/** Internal task node for walking `ISchema` root and nested `definitions` / `$defs` blocks via `SchemaWalker`. */
interface ISchemaDefinitionTask {
    rawSchema: unknown;
    key?: string;
    isDefinition: boolean;
    data?: unknown;
    rootSource?: JsonRecord;
    trackedRawRecord?: JsonRecord;
    schemaObj?: JsonRecord;
    ownRootSource?: JsonRecord;
    isArray?: boolean;
    rawType?: string;
    additionalBool?: boolean;
    requiredKeys?: string[];
    normalized?: ISchema;
    defTasks?: ISchemaDefinitionTask[];
    result?: ISchema;
}

/** Tree shape yielding nested `definitions` / `$defs` tasks for `SchemaNormalizer.normalize`. */
const SchemaDefinitionTaskShape: ITreeShape<ISchemaDefinitionTask> = {
    defaultMaxDepth: MAX_SCHEMA_DEPTH,
    *children(node: ISchemaDefinitionTask): Iterable<ITreeChild<ISchemaDefinitionTask>> {
        if (!node.defTasks) {
            return;
        }
        for (const child of node.defTasks) {
            const key = child.key || "def";
            yield {
                key,
                node: child,
                kind: "property",
                scopeSegment: `definitions/${key}`,
                bindingSegment: key
            };
        }
    }
};

/** Internal descriptor for a polymorphic (`oneOf` / `anyOf` / `allOf`) branch task in `SchemaNormalizer`. */
interface ISchemaNormBranchTask {
    sourceEntry: JsonRecord;
    fallbackKey: string;
    refPath?: string;
    isCycleStub: boolean;
    node?: ISchemaNormPropNode;
}

/** Internal mutable frame walked by `SchemaWalker` during `SchemaNormalizer.normalizePropertyMetadata`. */
interface ISchemaNormPropNode {
    rawProp: JsonRecord;
    keyName: string;
    isRequired: boolean;
    data?: unknown;
    activeRefs: Set<string>;
    result?: IPropertyMetadata;
    normalized?: IPropertyMetadata;
    prop?: JsonRecord;
    resolvedType?: string;
    oneOfTasks?: ISchemaNormBranchTask[];
    anyOfTasks?: ISchemaNormBranchTask[];
    allOfTasks?: ISchemaNormBranchTask[];
    notChild?: ISchemaNormPropNode;
    additionalPropChild?: ISchemaNormPropNode;
    hasRawProperties?: boolean;
    propChildren?: ISchemaNormPropNode[];
    itemsChild?: ISchemaNormPropNode;
}

/** Tree shape yielding child property tasks of an `ISchemaNormPropNode` in pre-order sequence. */
const SchemaNormPropShape: ITreeShape<ISchemaNormPropNode> = {
    defaultMaxDepth: MAX_SCHEMA_DEPTH,
    *children(node: ISchemaNormPropNode): Iterable<ITreeChild<ISchemaNormPropNode>> {
        const branchLists: Array<{ tasks?: ISchemaNormBranchTask[]; keyword: "oneOf" | "anyOf" | "allOf" }> = [
            { tasks: node.oneOfTasks, keyword: "oneOf" },
            { tasks: node.anyOfTasks, keyword: "anyOf" },
            { tasks: node.allOfTasks, keyword: "allOf" }
        ];
        for (const { tasks, keyword } of branchLists) {
            if (!tasks) {
                continue;
            }
            for (let i = 0; i < tasks.length; i++) {
                const child = tasks[i].node;
                if (!child) {
                    continue;
                }
                const idxKey = String(i);
                yield {
                    key: idxKey,
                    node: child,
                    kind: "branch",
                    branchKeyword: keyword,
                    scopeSegment: `${keyword}/${idxKey}`,
                    bindingSegment: `${keyword}/${idxKey}`
                };
            }
        }
        if (node.notChild) {
            yield {
                key: "not",
                node: node.notChild,
                kind: "branch",
                branchKeyword: "not",
                scopeSegment: "not",
                bindingSegment: "not"
            };
        }
        if (node.additionalPropChild) {
            yield {
                key: "additionalProperties",
                node: node.additionalPropChild,
                kind: "additional",
                branchKeyword: "additionalProperties",
                scopeSegment: "additionalProperties",
                bindingSegment: "additionalProperties"
            };
        }
        if (node.propChildren) {
            for (const child of node.propChildren) {
                yield {
                    key: child.keyName,
                    node: child,
                    kind: "property",
                    scopeSegment: `properties/${child.keyName}`,
                    bindingSegment: child.keyName
                };
            }
        }
        if (node.itemsChild) {
            yield {
                key: "items",
                node: node.itemsChild,
                kind: "item",
                scopeSegment: "items",
                bindingSegment: "items"
            };
        }
    }
};



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
export const DECLINED_SCHEMA_FIELDS: DeclinedSchemaFieldsMap = {};

/**
 * Normalizes raw JSON schemas (or raw data, via {@link DataInferenceBuilder}) into the strict {@link ISchema} contract.
 * Acts as the final fallback {@link ISchemaBuilderPlugin} in the `SchemaBuilderRegistry`.
 *
 * @namespace nz.co.siliconst.ui5.metaui.core
 * @internal
 */
export class SchemaNormalizer implements ISchemaBuilderPlugin {
    /** Shared producer contract descriptor for JSON Schema property metadata normalization. */
    public static readonly PRODUCER_CONTRACT: IPropertyProducerContract<JsonRecord, JsonRecord> = {
        name: "SchemaNormalizer",
        declinedFields: DECLINED_SCHEMA_FIELDS,
        extractPropertyMetadata: (
            input: JsonRecord,
            keyName: string,
            isRequired: boolean,
            rootSchema?: JsonRecord
        ): IPropertyMetadata => SchemaNormalizer.normalizePropertyMetadata(input, keyName, isRequired, rootSchema)
    };

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
        return this.runDefinitionTraversal(
            {
                rawSchema: rawDef,
                key,
                isDefinition: true,
                rootSource
            },
            1
        );
    }

    /**
     * Normalizes a raw schema. Falls back to full data inference when no usable schema is supplied,
     * and merges inferred properties when the schema opts into hybrid inference (`additionalProperties: true`).
     */
    public static normalize(rawSchema?: unknown, data?: unknown): ISchema {
        return this.runDefinitionTraversal(
            {
                rawSchema,
                data,
                isDefinition: false
            },
            0
        );
    }

    private static runDefinitionTraversal(rootTask: ISchemaDefinitionTask, baseDepth: number): ISchema {
        const activeDefs = new WeakSet<object>();
        const maxDepth = MAX_SCHEMA_DEPTH - baseDepth;

        SchemaWalker.walk(
            rootTask,
            (ctx) => {
                const task = ctx.node;
                let schemaObj: unknown = task.rawSchema;

                if (typeof schemaObj === "string") {
                    if (!schemaObj.trim()) {
                        schemaObj = null;
                    } else {
                        try {
                            schemaObj = JSON.parse(schemaObj);
                        } catch (e) {
                            const msg = "Failed to parse schema string: " + (e as Error).message;
                            Logger.error(msg, undefined, "SchemaNormalizer");
                            throw new Error(msg);
                        }
                    }
                }
                if (!isRecord(schemaObj)) {
                    task.result = DataInferenceBuilder.inferSchemaFromData(task.data);
                    return "skip-subtree";
                }
                if (activeDefs.has(schemaObj)) {
                    Logger.warn(
                        "Circular schema definition reference detected during normalization; stopping recursion.",
                        undefined,
                        "SchemaNormalizer"
                    );
                    task.result = { type: "object", properties: {} };
                    return "skip-subtree";
                }
                activeDefs.add(schemaObj);
                task.trackedRawRecord = isRecord(task.rawSchema) ? task.rawSchema : undefined;

                const ownRootSource: JsonRecord = schemaObj;
                const rootRef = readString(schemaObj, "$ref");
                if (rootRef) {
                    const resolvedRoot = OpenApiRefResolver.resolve(rootRef, ownRootSource);
                    if (isRecord(resolvedRoot)) {
                        schemaObj = { ...resolvedRoot, ...schemaObj };
                        delete (schemaObj as JsonRecord).$ref;
                    }
                }
                if (isRecord(schemaObj) && Array.isArray(schemaObj.allOf)) {
                    schemaObj = OpenApiConstraintMapper.resolveAllOf(schemaObj, ownRootSource);
                }
                if (!isRecord(schemaObj)) {
                    if (task.trackedRawRecord) {
                        activeDefs.delete(task.trackedRawRecord);
                    }
                    task.result = DataInferenceBuilder.inferSchemaFromData(task.data);
                    return "skip-subtree";
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
                          ? this.normalizePropertyMetadata(schemaObj.additionalProperties, "value", false, ownRootSource)
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

                const defsA = readRecord(ownRootSource, "definitions");
                const defsB = readRecord(ownRootSource, "$defs");
                const definitions: JsonRecord | undefined =
                    defsA || defsB ? { ...(defsA || {}), ...(defsB || {}) } : undefined;
                if (definitions) {
                    normalized.definitions = {};
                    task.defTasks = Object.keys(definitions).map((defKey) => ({
                        rawSchema: definitions[defKey],
                        key: defKey,
                        isDefinition: true,
                        rootSource: ownRootSource
                    }));
                }

                task.schemaObj = schemaObj;
                task.ownRootSource = ownRootSource;
                task.isArray = isArray;
                task.rawType = rawType;
                task.additionalBool = additionalBool;
                task.requiredKeys = requiredKeys;
                task.normalized = normalized;
                return;
            },
            {
                shape: SchemaDefinitionTaskShape,
                visitRoot: true,
                maxDepth,
                silentTruncationLog: true,
                onTruncate: (_scope, _reason, rawNode) => {
                    if (!rawNode) {
                        return;
                    }
                    Logger.warn(
                        `Definition nesting exceeded MAX_SCHEMA_DEPTH (${MAX_SCHEMA_DEPTH}); ` +
                        `truncating nested definition normalization.`,
                        undefined,
                        "SchemaNormalizer"
                    );
                    rawNode.result = { type: "object", properties: {} };
                    this.finalizeDefinitionMetadata(rawNode, MAX_SCHEMA_DEPTH + 1);
                },
                onLeave: (ctx) => {
                    const task = ctx.node;
                    const normDepth = baseDepth + ctx.depth;
                    if (task.normalized && task.schemaObj && task.ownRootSource) {
                        const normalized = task.normalized;
                        const schemaObj = task.schemaObj;
                        const ownRootSource = task.ownRootSource;
                        if (task.defTasks && normalized.definitions) {
                            for (const defTask of task.defTasks) {
                                if (defTask.key !== undefined && defTask.result) {
                                    normalized.definitions[defTask.key] = defTask.result;
                                }
                            }
                        }

                        const inferred =
                            task.additionalBool === true && task.data
                                ? DataInferenceBuilder.inferSchemaFromData(task.data)
                                : undefined;
                        if (task.isArray) {
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
                            const sampleRow = Array.isArray(task.data) ? task.data.find(isRecord) : undefined;
                            normalized.items = this.normalizePropertyMetadata(
                                rawItems,
                                "items",
                                false,
                                ownRootSource,
                                sampleRow
                            );
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
                                task.requiredKeys || [],
                                ownRootSource,
                                task.data
                            );

                            if (Array.isArray(schemaObj.oneOf) || Array.isArray(schemaObj.anyOf)) {
                                this.mergeRootPolymorphicBranches(normalized, schemaObj, ownRootSource);
                            } else if (
                                Object.keys(normalized.properties).length === 0 &&
                                ((task.rawType && task.rawType !== SCHEMA_TYPE.OBJECT) ||
                                    Array.isArray(schemaObj.enum))
                            ) {
                                const valueKey = readString(schemaObj, "title") || "value";
                                normalized.properties[valueKey] = this.normalizePropertyMetadata(
                                    schemaObj,
                                    valueKey,
                                    false,
                                    ownRootSource
                                );
                            }
                        }
                        task.result = normalized;
                    }
                    if (task.trackedRawRecord) {
                        activeDefs.delete(task.trackedRawRecord);
                    }
                    this.finalizeDefinitionMetadata(task, normDepth);
                }
            }
        );

        return rootTask.result || { type: "object", properties: {} };
    }

    private static finalizeDefinitionMetadata(task: ISchemaDefinitionTask, normDepth: number): void {
        if (!task.isDefinition || !isRecord(task.rawSchema) || task.key === undefined || !task.result) {
            return;
        }
        const defMeta = this.normalizePropertyMetadata(
            task.rawSchema,
            task.key,
            false,
            task.rootSource || task.rawSchema,
            undefined,
            normDepth
        );
        Object.assign(task.result, {
            ...defMeta,
            title: task.result.title || defMeta.title || task.key,
            type: defMeta.type === "array" ? "array" : (defMeta.type || task.result.type),
            required: readStringArray(task.rawSchema, "required")
        });
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
        this.stripWriteOnlyNode(schema, data, schema.definitions);
    }

    /** Paired-walk implementation of {@link SchemaNormalizer.stripWriteOnlyValues}. */
    private static stripWriteOnlyNode(
        meta: IWriteOnlyNode | undefined,
        data: unknown,
        definitions: Record<string, ISchema> | undefined
    ): void {
        if (!meta || data === null || typeof data !== "object") {
            return;
        }
        const dynamicEdges = new Map<IPropertyMetadata, ITreeChild<IPropertyMetadata>[]>();
        const childOthers = new Map<IPropertyMetadata, object>();
        const missingMetaNodes = new WeakSet<object>();

        SchemaWalker.walkPaired(
            { ...(meta as IPropertyMetadata) },
            data,
            {
                stepProperty: (_other, _key, childNode) => childOthers.get(childNode)
            },
            (ctx) => {
                if (missingMetaNodes.has(ctx.node) || ctx.other === null || typeof ctx.other !== "object") {
                    return "skip-subtree";
                }
                const node = this.resolveWriteOnlyNode(ctx.node, definitions);
                const edges: ITreeChild<IPropertyMetadata>[] = [];
                if (Array.isArray(ctx.other)) {
                    for (let i = 0; i < ctx.other.length; i++) {
                        const entryVal: unknown = ctx.other[i];
                        const childNode: IPropertyMetadata = {
                            ...(node.items || ({ type: "object" } as IPropertyMetadata))
                        };
                        if (!node.items || entryVal === null || typeof entryVal !== "object") {
                            missingMetaNodes.add(childNode);
                        } else {
                            childOthers.set(childNode, entryVal);
                        }
                        const idxKey = String(i);
                        edges.push({
                            key: idxKey,
                            node: childNode,
                            kind: "property",
                            scopeSegment: `items/${idxKey}`,
                            bindingSegment: idxKey
                        });
                    }
                    dynamicEdges.set(ctx.node, edges);
                    return edges.length > 0 ? undefined : "skip-subtree";
                }

                const record = ctx.other as JsonRecord;
                const declared = node.properties;
                if (declared) {
                    for (const key of Object.keys(declared)) {
                        if (!(key in record)) {
                            continue;
                        }
                        if (declared[key].writeOnly === true) {
                            delete record[key];
                        } else {
                            const val: unknown = record[key];
                            const childNode: IPropertyMetadata = { ...declared[key] };
                            if (val === null || typeof val !== "object") {
                                missingMetaNodes.add(childNode);
                            } else {
                                childOthers.set(childNode, val);
                            }
                            edges.push({
                                key,
                                node: childNode,
                                kind: "property",
                                scopeSegment: `properties/${key}`,
                                bindingSegment: key
                            });
                        }
                    }
                }
                const additional = node.additionalProperties;
                if (typeof additional === "object" && additional !== null) {
                    for (const key of Object.keys(record)) {
                        if (declared && key in declared) {
                            continue;
                        }
                        if (additional.writeOnly === true) {
                            delete record[key];
                        } else {
                            const val: unknown = record[key];
                            const childNode: IPropertyMetadata = { ...additional };
                            if (val === null || typeof val !== "object") {
                                missingMetaNodes.add(childNode);
                            } else {
                                childOthers.set(childNode, val);
                            }
                            edges.push({
                                key,
                                node: childNode,
                                kind: "property",
                                scopeSegment: `additionalProperties/${key}`,
                                bindingSegment: key
                            });
                        }
                    }
                }
                dynamicEdges.set(ctx.node, edges);
                return edges.length > 0 ? undefined : "skip-subtree";
            },
            {
                shape: SchemaShape,
                visitRoot: true,
                resolveRefs: false,
                silentTruncationLog: true,
                resolveDynamicChildren: (node) => dynamicEdges.get(node) ?? [],
                onLeave: (ctx) => {
                    dynamicEdges.delete(ctx.node);
                    childOthers.delete(ctx.node);
                },
                onTruncate: (_scope, reason) => {
                    if (reason === "depth") {
                        Logger.warn(
                            `Payload nesting exceeded MAX_SCHEMA_DEPTH (${MAX_SCHEMA_DEPTH}) ` +
                            `while stripping writeOnly values; any writeOnly field below ` +
                            `this level was left in the outbound payload.`,
                            undefined,
                            "SchemaNormalizer"
                        );
                    }
                }
            }
        );
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
        const rootMeta = this.normalizePropertyMetadata(
            {
                oneOf: schemaObj.oneOf,
                anyOf: schemaObj.anyOf,
                discriminator: schemaObj.discriminator
            },
            normalized.title || "Root",
            false,
            rootSource
        );
        PolymorphicUtil.mergePolymorphicRootBranches(normalized, rootMeta);
    }

    /** Normalizes a dictionary of raw property definitions. */
    private static normalizeProperties(
        properties: JsonRecord, requiredKeys: string[], rootSchema?: JsonRecord,
        data?: unknown, depth: number = 0, activeRefs: Set<string> = new Set()
    ): Record<string, IPropertyMetadata> {
        const normalizedProps: Record<string, IPropertyMetadata> = {};
        if (depth > MAX_SCHEMA_DEPTH) {
            Logger.warn(
                `Nested schema exceeded MAX_SCHEMA_DEPTH (${MAX_SCHEMA_DEPTH}); ` +
                `${Object.keys(properties).length} propert(ies) were dropped.`,
                undefined,
                "SchemaNormalizer"
            );
            return normalizedProps;
        }
        const rootContainer: JsonRecord = { properties };
        SchemaWalker.walk(
            rootContainer,
            (ctx) => {
                const childData = isRecord(data) ? data[ctx.key] : undefined;
                // Not depth + 1: normalizeProperties and normalizePropertyMetadata are the two halves of a
                // single nesting level (normalizeProperties -> normalizePropertyMetadata -> normalizeProperties).
                // Incrementing in both halves charged two units per level and made MAX_SCHEMA_DEPTH bite
                // at half its stated value, silently stripping every constraint below level 5.
                normalizedProps[ctx.key] = this.normalizePropertyMetadata(
                    ctx.node,
                    ctx.key,
                    requiredKeys.includes(ctx.key),
                    rootSchema,
                    childData,
                    depth,
                    activeRefs
                );
                return "skip-subtree";
            },
            {
                shape: RawRecordShape,
                maxDepth: 0,
                silentTruncationLog: true,
                onInvalidProperty: (propKey) => {
                    Logger.warn(
                        `Property '${propKey}' is not a schema object; treating it as a plain string field.`,
                        undefined,
                        "SchemaNormalizer"
                    );
                    const childData = isRecord(data) ? data[propKey] : undefined;
                    normalizedProps[propKey] = this.normalizePropertyMetadata(
                        {},
                        propKey,
                        requiredKeys.includes(propKey),
                        rootSchema,
                        childData,
                        depth,
                        activeRefs
                    );
                }
            }
        );
        return normalizedProps;
    }

    /** Normalizes a single raw property definition. */
    private static normalizePropertyMetadata(
        rawProp: JsonRecord, keyName: string, isRequired: boolean, rootSchema?: JsonRecord,
        data?: unknown, depth: number = 0, activeRefs: Set<string> = new Set()
    ): IPropertyMetadata {
        const buildBaseMetadata = (
            prop: JsonRecord,
            resolvedKey: string,
            reqFlag: boolean,
            type: FieldType,
            hasNullType: boolean,
            rawUi: JsonRecord,
            valueHelp: IPropertyMetadata["valueHelp"],
            enumValues: IPropertyMetadata["enum"],
            hasChoices: boolean
        ): IPropertyMetadata => {
            return {
            type,
            $ref: readString(prop, "$ref"),
            title: readString(prop, "title"),
            description: readString(prop, "description"),
            format: readString(prop, "format"),
            const: prop.const === undefined ? undefined : deepClone(prop.const),
            ui: SchemaDirectiveNormalizer.normalizeUI(rawUi, prop, resolvedKey, type, hasChoices),
            required: reqFlag || prop.required === true,
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
            discriminator: SchemaDirectiveNormalizer.normalizeDiscriminator(prop.discriminator),
            uiLayout: SchemaDirectiveNormalizer.normalizeLayout(prop.uiLayout)
            };
        };

        const rootTask: ISchemaNormPropNode = {
            rawProp,
            keyName,
            isRequired,
            data,
            activeRefs
        };
        const maxDepth = MAX_SCHEMA_DEPTH - depth;

        SchemaWalker.walk(
            rootTask,
            (ctx) => {
                const task = ctx.node;
                const rawAllOf = task.rawProp.allOf;
                const prop: JsonRecord = Array.isArray(rawAllOf)
                    ? OpenApiConstraintMapper.resolveAllOf(task.rawProp, rootSchema, 0, task.activeRefs)
                    : task.rawProp;
                const { type, hasNullType } = SchemaDirectiveNormalizer.resolveSchemaType(prop, task.keyName);
                const rawUi = readRecord(prop, "ui") || {};
                const valueHelp = SchemaDirectiveNormalizer.normalizeValueHelp(prop.valueHelp ?? rawUi.valueHelp);
                const enumValues = SchemaDirectiveNormalizer.normalizeEnum(prop.enum);
                const itemsRecord = readRecord(prop, "items");
                const itemsEnum = itemsRecord ? SchemaDirectiveNormalizer.normalizeEnum(itemsRecord.enum) : undefined;
                const hasChoices = Array.isArray(valueHelp) || !!enumValues || !!itemsEnum;

                const normalized: IPropertyMetadata = buildBaseMetadata(
                    prop,
                    task.keyName,
                    task.isRequired,
                    type,
                    hasNullType,
                    rawUi,
                    valueHelp,
                    enumValues,
                    hasChoices
                );

                const nextLevelExceedsDepth = ctx.depth + 1 > maxDepth;
                task.oneOfTasks = this.prepareSchemaListTasks(
                    prop.oneOf,
                    rootSchema,
                    task.activeRefs,
                    nextLevelExceedsDepth
                );
                task.anyOfTasks = this.prepareSchemaListTasks(
                    prop.anyOf,
                    rootSchema,
                    task.activeRefs,
                    nextLevelExceedsDepth
                );
                task.allOfTasks = this.prepareSchemaListTasks(
                    rawAllOf,
                    rootSchema,
                    task.activeRefs,
                    nextLevelExceedsDepth
                );

                if (isRecord(prop.not)) {
                    task.notChild = {
                        rawProp: prop.not,
                        keyName: task.keyName,
                        isRequired: false,
                        data: undefined,
                        activeRefs: task.activeRefs
                    };
                }

                const additional = prop.additionalProperties;
                if (typeof additional === "boolean") {
                    normalized.additionalProperties = additional;
                } else if (isRecord(additional)) {
                    task.additionalPropChild = {
                        rawProp: additional,
                        keyName: "value",
                        isRequired: false,
                        data: undefined,
                        activeRefs: task.activeRefs
                    };
                }

                let rawProperties = readRecord(prop, "properties");
                const rawItems = readRecord(prop, "items");

                if (type === SCHEMA_TYPE.OBJECT) {
                    if (additional === true && isRecord(task.data)) {
                        const inferredChild = DataInferenceBuilder.inferPropertiesFromObject(task.data);
                        rawProperties = DataInferenceBuilder.mergeHybridProperties(inferredChild, rawProperties || {});
                    }
                    if (rawProperties) {
                        task.hasRawProperties = true;
                        if (nextLevelExceedsDepth) {
                            Logger.warn(
                                `Nested schema exceeded MAX_SCHEMA_DEPTH (${MAX_SCHEMA_DEPTH}); ` +
                                `${Object.keys(rawProperties).length} propert(ies) were dropped.`,
                                undefined,
                                "SchemaNormalizer"
                            );
                            task.propChildren = [];
                        } else {
                            const reqKeys = readStringArray(prop, "required") || [];
                            const propsDict = rawProperties;
                            task.propChildren = Object.keys(propsDict).map((key) => {
                                const raw = propsDict[key];
                                if (!isRecord(raw)) {
                                    Logger.warn(
                                        `Property '${key}' is not a schema object; treating it as a plain string field.`,
                                        undefined,
                                        "SchemaNormalizer"
                                    );
                                }
                                const childData = isRecord(task.data) ? task.data[key] : undefined;
                                return {
                                    rawProp: isRecord(raw) ? raw : {},
                                    keyName: key,
                                    isRequired: reqKeys.includes(key),
                                    data: childData,
                                    activeRefs: task.activeRefs
                                };
                            });
                        }
                    }
                } else if (type === SCHEMA_TYPE.ARRAY) {
                    let itemsSource: JsonRecord | undefined =
                        rawItems ||
                        (rawProperties
                            ? { type: SCHEMA_TYPE.OBJECT, properties: rawProperties, required: prop.required }
                            : undefined);
                    if (itemsSource) {
                        if (itemsSource.additionalProperties === true && Array.isArray(task.data)) {
                            const inferredItemProps = DataInferenceBuilder.inferPropertiesFromRows(task.data);
                            itemsSource = {
                                ...itemsSource,
                                properties: DataInferenceBuilder.mergeHybridProperties(
                                    inferredItemProps,
                                    readRecord(itemsSource, "properties") || {}
                                )
                            };
                        }
                        const sampleRow = Array.isArray(task.data) ? task.data.find(isRecord) : undefined;
                        task.itemsChild = {
                            rawProp: itemsSource,
                            keyName: "items",
                            isRequired: false,
                            data: sampleRow,
                            activeRefs: task.activeRefs
                        };
                    }
                }

                task.normalized = normalized;
                task.prop = prop;
                task.resolvedType = type;
                return;
            },
            {
                shape: SchemaNormPropShape,
                visitRoot: true,
                maxDepth,
                silentTruncationLog: true,
                onTruncate: (_scope, _reason, rawNode) => {
                    if (!rawNode) {
                        return;
                    }
                    // The descriptor below is a placeholder, not a normalization: the declared type and every
                    // constraint on this property are discarded. Say so rather than letting the field silently
                    // degrade into an empty object.
                    Logger.warn(
                        `Property '${rawNode.keyName}' exceeded MAX_SCHEMA_DEPTH (${MAX_SCHEMA_DEPTH}); ` +
                        `its type and constraints were not normalized.`,
                        undefined,
                        "SchemaNormalizer"
                    );
                    rawNode.result = {
                        type: SCHEMA_TYPE.OBJECT,
                        ui: { label: DataInferenceBuilder.generateLabel(rawNode.keyName) }
                    };
                },
                onLeave: (ctx) => {
                    const task = ctx.node;
                    const normalized = task.normalized;
                    if (!normalized) {
                        return;
                    }
                    normalized.oneOf = this.normalizeSchemaList(task.oneOfTasks);
                    normalized.anyOf = this.normalizeSchemaList(task.anyOfTasks);
                    normalized.allOf = this.normalizeSchemaList(task.allOfTasks);
                    normalized.not = task.notChild?.result;
                    if (task.additionalPropChild?.result) {
                        normalized.additionalProperties = task.additionalPropChild.result;
                    }
                    if (task.resolvedType === SCHEMA_TYPE.OBJECT && task.hasRawProperties) {
                        const mappedProps: Record<string, IPropertyMetadata> = {};
                        if (task.propChildren) {
                            for (const child of task.propChildren) {
                                if (child.result) {
                                    mappedProps[child.keyName] = child.result;
                                }
                            }
                        }
                        normalized.properties = mappedProps;
                    } else if (task.resolvedType === SCHEMA_TYPE.ARRAY && task.itemsChild?.result) {
                        normalized.items = task.itemsChild.result;
                    }
                    task.result = normalized;
                }
            }
        );

        return rootTask.result || {
            type: SCHEMA_TYPE.OBJECT,
            ui: { label: DataInferenceBuilder.generateLabel(keyName) }
        };
    }

    private static prepareSchemaListTasks(
        raw: unknown,
        rootSchema: JsonRecord | undefined,
        activeRefs: Set<string>,
        nextLevelExceedsDepth: boolean
    ): ISchemaNormBranchTask[] | undefined {
        if (!Array.isArray(raw)) {
            return undefined;
        }
        if (nextLevelExceedsDepth) {
            Logger.warn(
                `A polymorphic branch list exceeded MAX_SCHEMA_DEPTH (${MAX_SCHEMA_DEPTH}); ` +
                `${raw.length} branch(es) were dropped.`,
                undefined,
                "SchemaNormalizer"
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
                        sourceEntry,
                        fallbackKey,
                        refPath,
                        isCycleStub: true
                    };
                }
                nextRefs.add(refPath);
                const resolvedBranch = SchemaDirectiveNormalizer.inlinePolymorphicBranchRef(entry, refPath, rootSchema);
                if (resolvedBranch) {
                    sourceEntry = resolvedBranch.inlined;
                }
            }
            return {
                sourceEntry,
                fallbackKey,
                refPath,
                isCycleStub: false,
                node: {
                    rawProp: sourceEntry,
                    keyName: fallbackKey,
                    isRequired: false,
                    data: undefined,
                    activeRefs: nextRefs
                }
            };
        });
    }

    private static normalizeSchemaList(
        tasks: ISchemaNormBranchTask[] | undefined
    ): IPropertyMetadata[] | undefined {
        if (!tasks) {
            return undefined;
        }
        return tasks.map((branch) => {
            if (branch.isCycleStub && branch.refPath) {
                return {
                    type: SCHEMA_TYPE.OBJECT,
                    $ref: branch.refPath,
                    title: branch.fallbackKey,
                    ui: { label: branch.fallbackKey, widget: WIDGET_TYPE.REFERENCE }
                };
            }
            const normalizedBranch: IPropertyMetadata = branch.node?.result || { type: SCHEMA_TYPE.OBJECT };
            if (branch.refPath) {
                normalizedBranch.$ref = branch.refPath;
            }
            const branchReq = readStringArray(branch.sourceEntry, "required");
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