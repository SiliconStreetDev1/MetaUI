/**
 * @file SchemaNormalizer.ts
 * @description Transforms and validates incoming JSON payloads into the strict v2 ISchema dictionary matrix.
 * Pure, idempotent, and lossless across all IPropertyMetadata and ISchema keywords.
 */

import { ISchema, IPropertyMetadata } from "../interfaces/ISchema";
import { SCHEMA_TYPE, WIDGET_TYPE } from "../constants/MetaUIConstants";
import { ISchemaBuilderPlugin } from "../interfaces/ISchemaBuilderPlugin";
import { DataInferenceBuilder } from "./DataInferenceBuilder";
import { SchemaDirectiveNormalizer } from "./SchemaDirectiveNormalizer";
import { OpenApiConstraintMapper } from "../openapi/parsers/OpenApiConstraintMapper";
import { OpenApiRefResolver } from "../openapi/OpenApiRefResolver";
import { PolymorphicUtil } from "../utils/PolymorphicUtil";
import { Logger } from "../utils/Logger";
import {
    JsonRecord, isRecord, readString, readNumber, readBoolean, readRecord, readStringArray, deepClone
} from "../utils/TypeGuards";

const MAX_NORMALIZE_DEPTH = 10;

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
        const defSchema = this.normalize(rawDef);
        if (isRecord(rawDef)) {
            const defMeta = this.normalizePropertyMetadata(rawDef, key, false, rootSource || rawDef);
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
        const definitions: JsonRecord | undefined = defsA || defsB ? { ...(defsA || {}), ...(defsB || {}) } : undefined;
        if (definitions) {
            normalized.definitions = {};
            for (const key of Object.keys(definitions)) {
                normalized.definitions[key] = this.normalizeDefinition(definitions[key], key, rootSource);
            }
        }

        const inferred = additionalBool === true && data ? DataInferenceBuilder.inferSchemaFromData(data) : undefined;
        if (isArray) {
            let rawItems: JsonRecord = readRecord(schemaObj, "items") || { type: SCHEMA_TYPE.OBJECT, properties: {} };
            const inferredItemProps = inferred?.items?.properties;
            if (inferredItemProps) {
                rawItems = {
                    ...rawItems,
                    properties: DataInferenceBuilder.mergeHybridProperties(inferredItemProps, readRecord(rawItems, "properties") || {})
                };
            }
            const sampleRow = Array.isArray(data) ? data.find(isRecord) : undefined;
            normalized.items = this.normalizePropertyMetadata(rawItems, "items", false, rootSource, sampleRow);
        } else {
            let targetProperties: JsonRecord = readRecord(schemaObj, "properties") || {};
            if (inferred?.properties) {
                targetProperties = DataInferenceBuilder.mergeHybridProperties(inferred.properties, targetProperties);
            }
            normalized.properties = this.normalizeProperties(targetProperties, requiredKeys || [], rootSource, data);

            if (Array.isArray(schemaObj.oneOf) || Array.isArray(schemaObj.anyOf)) {
                this.mergeRootPolymorphicBranches(normalized, schemaObj, rootSource);
            } else if (
                Object.keys(normalized.properties).length === 0 &&
                ((rawType && rawType !== SCHEMA_TYPE.OBJECT) || Array.isArray(schemaObj.enum))
            ) {
                const valueKey = readString(schemaObj, "title") || "value";
                normalized.properties[valueKey] = this.normalizePropertyMetadata(schemaObj, valueKey, false, rootSource);
            }
        }
        return normalized;
    }

    /** Infers a v2 `ISchema` structure dynamically from a plain data payload (Full Inference Mode). */
    public static inferSchemaFromData(data: unknown): ISchema {
        return DataInferenceBuilder.inferSchemaFromData(data);
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
        const normalizedProps: Record<string, IPropertyMetadata> = {};
        if (depth > MAX_NORMALIZE_DEPTH) return normalizedProps;
        for (const key of Object.keys(properties)) {
            const raw = properties[key];
            if (!isRecord(raw)) {
                Logger.warn("[MetaUI SchemaNormalizer]", `Property '${key}' is not a schema object; treating it as a plain string field.`);
            }
            const childData = isRecord(data) ? data[key] : undefined;
            normalizedProps[key] = this.normalizePropertyMetadata(
                isRecord(raw) ? raw : {}, key, requiredKeys.includes(key), rootSchema, childData, depth + 1, activeRefs
            );
        }
        return normalizedProps;
    }

    /** Normalizes a single raw property definition. */
    private static normalizePropertyMetadata(
        rawProp: JsonRecord, keyName: string, isRequired: boolean, rootSchema?: JsonRecord,
        data?: unknown, depth: number = 0, activeRefs: Set<string> = new Set()
    ): IPropertyMetadata {
        if (depth > MAX_NORMALIZE_DEPTH) {
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
            precision: readNumber(prop, "precision"),
            scale: readNumber(prop, "scale"),
            multipleOf: readNumber(prop, "multipleOf"),
            valueHelp,
            enum: enumValues,
            default: prop.default === undefined ? undefined : deepClone(prop.default),
            nullable: readBoolean(prop, "nullable") ?? (hasNullType ? true : undefined),
            writeOnly: readBoolean(prop, "writeOnly"),
            readOnly: readBoolean(prop, "readOnly"),
            example: prop.example === undefined ? undefined : deepClone(prop.example),
            deprecated: readBoolean(prop, "deprecated"),
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
        if (!Array.isArray(raw) || depth > MAX_NORMALIZE_DEPTH) {
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
                const resolved = OpenApiRefResolver.resolve(refPath, rootSchema);
                if (isRecord(resolved)) {
                    sourceEntry = {
                        ...resolved,
                        ...entry,
                        title: readString(entry, "title") || readString(resolved, "title") || refName
                    };
                    delete sourceEntry.$ref;
                }
            }
            const normalizedBranch = this.normalizePropertyMetadata(
                sourceEntry,
                fallbackKey,
                false,
                rootSchema,
                undefined,
                depth + 1,
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

    /** Resolves a JSON Schema scope (e.g. `'#/properties/header/properties/id'`) against the `ISchema`. */
    public static resolveScope(
        schema: ISchema,
        scope: string
    ): { meta: IPropertyMetadata | undefined; bindingPath: string; propKey: string } {
        if (!scope || !scope.startsWith("#/properties/")) {
            return { meta: undefined, bindingPath: scope || "", propKey: scope || "" };
        }
        const pathSegments = scope
            .replace("#/properties/", "")
            .split("/properties/")
            .map((segment) => OpenApiRefResolver.unescapePointerSegment(segment));
        let current: Record<string, IPropertyMetadata> | undefined = schema.properties;
        let meta: IPropertyMetadata | undefined;
        for (let i = 0; i < pathSegments.length; i++) {
            const segment = pathSegments[i];
            if (!current) {
                meta = undefined;
                break;
            }
            meta = current[segment];
            if (i < pathSegments.length - 1) {
                current = meta?.properties;
            }
        }
        if (!meta) {
            Logger.warn("[MetaUI SchemaNormalizer]", `Scope '${scope}' does not resolve to a schema property.`);
        }
        return { meta, bindingPath: pathSegments.join("/"), propKey: pathSegments.join("/properties/") };
    }
}