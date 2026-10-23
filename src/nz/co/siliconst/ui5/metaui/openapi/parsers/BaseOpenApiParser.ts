/**
 * @file BaseOpenApiParser.ts
 * @description Shared template-method base parser for OpenAPI 2.0 and OpenAPI 3.0 specifications.
 * Eliminates duplication between OpenApi2Parser and OpenApi3Parser and supports schema, definition,
 * and operation (#/paths/...) targets as well as polymorphic root definitions.
 */

import { IOpenApiParserPlugin } from "../interfaces/IOpenApiParserPlugin";
import { ISchema } from "../../interfaces/ISchema";
import { OpenApiPropertyMapper } from "./OpenApiPropertyMapper";
import { OpenApiConstraintMapper } from "./OpenApiConstraintMapper";
import { OpenApiRefResolver } from "../OpenApiRefResolver";
import { LAYOUT_STRATEGY } from "../../constants/MetaUIConstants";
import { PolymorphicUtil } from "../../utils/PolymorphicUtil";
import { Logger } from "../../utils/Logger";
import { JsonRecord, isRecord, readString, readBoolean, readRecord, readStringArray } from "../../utils/TypeGuards";

/**
 * Validation keywords an OpenAPI 2.0 non-body parameter declares inline, alongside `type`.
 * This is the complete JSON Schema subset the 2.0 Parameter Object permits; the 3.0 branch obtains
 * the same set for free by spreading `param.schema`.
 */
const OA2_PARAMETER_SCHEMA_KEYWORDS: readonly string[] = [
    "format",
    "items",
    "default",
    "enum",
    "multipleOf",
    "maximum",
    "exclusiveMaximum",
    "minimum",
    "exclusiveMinimum",
    "maxLength",
    "minLength",
    "pattern",
    "maxItems",
    "minItems",
    "uniqueItems"
];

/**
 * Abstract base parser implementing the shared OpenAPI 2.0 / 3.0 AST translation pipeline.
 *
 * @namespace nz.co.siliconst.ui5.metaui.openapi.parsers
 * @public
 */
export abstract class BaseOpenApiParser implements IOpenApiParserPlugin {
    /**
     * Extracts the root schema definitions dictionary (`definitions` in 2.0, `components.schemas` in 3.0).
     *
     * @param root The OpenAPI root document record.
     * @returns {JsonRecord | undefined} The definitions dictionary if present.
     */
    protected abstract getDefinitionsMap(root: JsonRecord): JsonRecord | undefined;

    /**
     * Parses a raw OpenAPI document into a normalized MetaUI `ISchema` tree.
     *
     * @param openApiRoot The root OpenAPI JSON document.
     * @param targetDefinition Optional target schema, definition, or `#/paths/...` operation pointer.
     * @returns {ISchema} The synthesized MetaUI schema structure.
     */
    public parse(openApiRoot: unknown, targetDefinition?: string): ISchema {
        const root: JsonRecord = isRecord(openApiRoot) ? openApiRoot : {};
        const defsMap = this.getDefinitionsMap(root);

        let resolvedTargetKey = targetDefinition;
        if (!resolvedTargetKey && defsMap) {
            const keys = Object.keys(defsMap);
            if (keys.length > 0) {
                resolvedTargetKey = keys[0];
            }
        }

        const fallbackWarnings: string[] = [];
        let targetObject: JsonRecord = this.resolveTargetObject(root, defsMap, resolvedTargetKey, fallbackWarnings);

        const targetRef = readString(targetObject, "$ref");
        if (targetRef) {
            const resolved = OpenApiRefResolver.resolve(targetRef, root);
            if (isRecord(resolved)) {
                targetObject = { ...resolved, ...targetObject };
                delete targetObject.$ref;
            }
        }

        targetObject = OpenApiConstraintMapper.resolveAllOf(targetObject, root);

        const info = readRecord(root, "info");
        // A JSON Schema `type` may be a union array (`["array", "null"]`). Resolve it the same way the
        // fallback below and SchemaNormalizer do, so both halves of this method agree on the root type.
        const rootType = this.resolveDeclaredType(targetObject);
        const isArray = rootType === "array";
        const schema: ISchema = {
            title: readString(targetObject, "title") || (info ? readString(info, "title") : undefined) || resolvedTargetKey || "",
            type: isArray ? "array" : "object",
            layoutStrategy: isArray ? LAYOUT_STRATEGY.TABLE : LAYOUT_STRATEGY.FORM
        };
        if (fallbackWarnings.length > 0) {
            schema.ui = {
                options: {
                    targetFallbackWarning: fallbackWarnings[0]
                }
            };
        }

        if (targetObject.additionalProperties === true) {
            schema.additionalProperties = true;
        } else if (targetObject.additionalProperties === false) {
            // A closed object. Carried through verbatim: DataInferenceBuilder.mergeHybridProperties
            // keys off `=== false` to stop inferred keys leaking into it.
            schema.additionalProperties = false;
        } else if (isRecord(targetObject.additionalProperties)) {
            schema.additionalProperties = OpenApiPropertyMapper.mapPropertyMetadata(
                targetObject.additionalProperties,
                "value",
                false,
                root
            );
        }

        const requiredFields = readStringArray(targetObject, "required") || [];
        const rawProperties = readRecord(targetObject, "properties");
        if (rawProperties) {
            schema.properties = OpenApiPropertyMapper.mapProperties(rawProperties, requiredFields, root);
            schema.required = requiredFields;
        } else if (isArray && isRecord(targetObject.items)) {
            schema.items = OpenApiPropertyMapper.mapPropertyMetadata(targetObject.items, "items", false, root);
        }

        this.mergePolymorphicRootProperties(schema, targetObject, root);

        if (!isArray && (!schema.properties || Object.keys(schema.properties).length === 0) && !schema.additionalProperties) {
            if ((rootType && rootType !== "object") || Array.isArray(targetObject.enum)) {
                const cleanKey = OpenApiRefResolver.extractRefName(resolvedTargetKey || "") || "value";
                schema.properties = {
                    [cleanKey]: OpenApiPropertyMapper.mapPropertyMetadata(targetObject, cleanKey, false, root)
                };
            }
        }

        if (defsMap) {
            schema.definitions = this.buildDefinitionsDictionary(defsMap, root);
        }

        return schema;
    }

    /**
     * Resolves a schema's declared `type`, accepting both the scalar form (`"array"`) and the JSON Schema
     * union form (`["array", "null"]`), from which the `"null"` member is dropped.
     */
    private resolveDeclaredType(targetObject: JsonRecord): string | undefined {
        return Array.isArray(targetObject.type)
            ? targetObject.type.find((t): t is string => typeof t === "string" && t !== "null")
            : readString(targetObject, "type");
    }

    /**
     * Resolves the target OpenAPI schema object from a definition key or `#/paths/...` operation pointer.
     */
    private resolveTargetObject(
        root: JsonRecord,
        defsMap: JsonRecord | undefined,
        targetDefinition?: string,
        fallbackWarnings?: string[]
    ): JsonRecord {
        if (!targetDefinition) {
            return root;
        }

        if (targetDefinition.startsWith("#/paths/")) {
            const opNode = OpenApiRefResolver.resolve(targetDefinition, root);
            if (isRecord(opNode)) {
                const pathParts = targetDefinition.split("/");
                const pathItemPointer = pathParts.length >= 3 ? pathParts.slice(0, 3).join("/") : undefined;
                const rawPathItem = pathItemPointer ? OpenApiRefResolver.resolve(pathItemPointer, root) : undefined;
                const extracted = this.extractOperationSchema(
                    opNode,
                    root,
                    isRecord(rawPathItem) ? rawPathItem : undefined
                );
                if (extracted) {
                    return extracted;
                }
            }
        }

        const cleanName = OpenApiRefResolver.extractRefName(targetDefinition);

        if (defsMap && isRecord(defsMap[cleanName])) {
            return defsMap[cleanName] as JsonRecord;
        }

        if (defsMap) {
            const fallbackKeys = Object.keys(defsMap);
            if (fallbackKeys.length > 0 && isRecord(defsMap[fallbackKeys[0]])) {
                const warnMsg = `Target definition '${cleanName}' not found; falling back to '${fallbackKeys[0]}'.`;
                Logger.warn(`[MetaUI OpenApiParser] ${warnMsg}`);
                if (fallbackWarnings) {
                    fallbackWarnings.push(warnMsg);
                }
                return defsMap[fallbackKeys[0]] as JsonRecord;
            }
        }

        throw new Error(`[MetaUI OpenApiParser] Could not find target definition '${cleanName}'.`);
    }

    /**
     * Extracts a requestBody, body parameter, response schema, or synthesized parameter schema
     * from an OpenAPI 2.0/3.0 operation node.
     */
    private extractOperationSchema(opNode: JsonRecord, root: JsonRecord, pathItem?: JsonRecord): JsonRecord | null {
        // OpenAPI 3.0 requestBody.content["application/json"].schema (including $ref requestBodies)
        let requestBody = readRecord(opNode, "requestBody");
        const rbRef = requestBody ? readString(requestBody, "$ref") : undefined;
        if (rbRef) {
            const resolvedRb = OpenApiRefResolver.resolve(rbRef, root);
            if (isRecord(resolvedRb)) {
                requestBody = resolvedRb;
            }
        }
        const content = requestBody ? readRecord(requestBody, "content") : undefined;
        if (content) {
            for (const mediaType of Object.values(content)) {
                if (isRecord(mediaType) && isRecord(mediaType.schema)) {
                    return mediaType.schema;
                }
            }
        }

        const allParameters = this.collectOperationParameters(opNode, root, pathItem);

        // OpenAPI 2.0 parameters with in === "body"
        for (const param of allParameters) {
            if (readString(param, "in") === "body" && isRecord(param.schema)) {
                return param.schema;
            }
        }

        const responseSchema = this.extract2xxResponseSchema(opNode, root);
        const synthesizedParamSchema = this.synthesizeNonBodyParametersSchema(allParameters);

        if (responseSchema && this.isStructuredResponseSchema(responseSchema, root)) {
            return responseSchema;
        }
        if (synthesizedParamSchema) {
            return synthesizedParamSchema;
        }
        if (responseSchema) {
            return responseSchema;
        }

        return { type: "object", properties: {} };
    }

    private collectOperationParameters(opNode: JsonRecord, root: JsonRecord, pathItem?: JsonRecord): JsonRecord[] {
        const mergedMap = new Map<string, JsonRecord>();
        const appendList = (rawList: unknown): void => {
            if (!Array.isArray(rawList)) return;
            for (const rawParam of rawList) {
                let param = isRecord(rawParam) ? rawParam : undefined;
                const paramRef = param ? readString(param, "$ref") : undefined;
                if (paramRef) {
                    const resolvedParam = OpenApiRefResolver.resolve(paramRef, root);
                    if (isRecord(resolvedParam)) {
                        param = resolvedParam;
                    }
                }
                if (!param) continue;
                const key = `${readString(param, "in") || "query"}:${readString(param, "name") || mergedMap.size}`;
                mergedMap.set(key, param);
            }
        };
        if (pathItem) {
            appendList(pathItem.parameters);
        }
        appendList(opNode.parameters);
        return Array.from(mergedMap.values());
    }

    private extract2xxResponseSchema(opNode: JsonRecord, root: JsonRecord): JsonRecord | null {
        const responses = readRecord(opNode, "responses");
        if (!responses) return null;
        for (const [code, rawResp] of Object.entries(responses)) {
            if (code.startsWith("2") && isRecord(rawResp)) {
                let resp: JsonRecord = rawResp;
                const respRef = readString(resp, "$ref");
                if (respRef) {
                    const resolvedResp = OpenApiRefResolver.resolve(respRef, root);
                    if (isRecord(resolvedResp)) {
                        resp = resolvedResp;
                    }
                }
                if (isRecord(resp.schema)) {
                    return resp.schema;
                }
                const respContent = readRecord(resp, "content");
                if (respContent) {
                    for (const mediaType of Object.values(respContent)) {
                        if (isRecord(mediaType) && isRecord(mediaType.schema)) {
                            return mediaType.schema;
                        }
                    }
                }
            }
        }
        return null;
    }

    private isStructuredResponseSchema(respSchema: JsonRecord, root: JsonRecord): boolean {
        let target: JsonRecord = respSchema;
        const refPath = readString(target, "$ref");
        if (refPath) {
            const resolved = OpenApiRefResolver.resolve(refPath, root);
            if (isRecord(resolved)) {
                target = resolved;
            }
        }
        if (Array.isArray(target.allOf)) {
            target = OpenApiConstraintMapper.resolveAllOf(target, root);
        }
        return Boolean(
            isRecord(target.properties) ||
                isRecord(target.items) ||
                target.additionalProperties !== undefined ||
                Array.isArray(target.oneOf) ||
                Array.isArray(target.anyOf)
        );
    }

    private synthesizeNonBodyParametersSchema(allParameters: JsonRecord[]): JsonRecord | null {
        const paramProps: JsonRecord = {};
        const paramRequired: string[] = [];
        for (const param of allParameters) {
            if (readString(param, "in") === "body") continue;
            const paramName = readString(param, "name");
            if (!paramName) continue;

            let contentSchema: JsonRecord | undefined;
            const paramContent = readRecord(param, "content");
            if (paramContent) {
                for (const mediaType of Object.values(paramContent)) {
                    if (isRecord(mediaType) && isRecord(mediaType.schema)) {
                        contentSchema = mediaType.schema;
                        break;
                    }
                }
            }

            const paramSchema: JsonRecord = isRecord(param.schema)
                ? { ...param.schema }
                : contentSchema
                  ? { ...contentSchema }
                  : this.inlineParameterSchema(param);
            if (readString(param, "description") && !paramSchema.description) {
                paramSchema.description = readString(param, "description");
            }
            paramProps[paramName] = paramSchema;
            if (readBoolean(param, "required") === true) paramRequired.push(paramName);
        }
        if (Object.keys(paramProps).length === 0) return null;
        return { type: "object", properties: paramProps, required: paramRequired.length > 0 ? paramRequired : undefined };
    }

    /**
     * Builds the schema for an OpenAPI 2.0 non-body parameter, which declares its validation keywords
     * directly on the Parameter Object instead of under `schema`. Every keyword the 3.0 branch would pick
     * up by spreading `param.schema` is copied, so the same logical API yields the same metadata in both
     * dialects. Absent keywords are left off entirely rather than written as `undefined`, which would
     * overwrite a real constraint during a later `$ref` or `allOf` merge.
     *
     * @param param The raw OpenAPI 2.0 Parameter Object.
     * @returns {JsonRecord} The equivalent inline schema record.
     */
    private inlineParameterSchema(param: JsonRecord): JsonRecord {
        const inlineSchema: JsonRecord = { type: readString(param, "type") || "string" };
        for (const keyword of OA2_PARAMETER_SCHEMA_KEYWORDS) {
            if (param[keyword] !== undefined) {
                inlineSchema[keyword] = param[keyword];
            }
        }
        return inlineSchema;
    }

    /**
     * Synthesizes root properties when a target schema uses `oneOf` or `anyOf` (e.g., `AttributeValue` or `PaymentInstrument`),
     * ensuring the root schema is never blank when selected directly as `schemaTarget`.
     */
    private mergePolymorphicRootProperties(schema: ISchema, targetObject: JsonRecord, root: JsonRecord): void {
        const mappedRoot = OpenApiPropertyMapper.mapPropertyMetadata(targetObject, schema.title || "Root", false, root);
        PolymorphicUtil.mergePolymorphicRootBranches(schema, mappedRoot);
    }

    /**
     * Translates all entries in the root definitions dictionary into normalized `ISchema` objects.
     */
    private buildDefinitionsDictionary(defsMap: JsonRecord, root: JsonRecord): Record<string, ISchema> {
        const definitions: Record<string, ISchema> = {};
        for (const key of Object.keys(defsMap)) {
            const rawDef = isRecord(defsMap[key]) ? (defsMap[key] as JsonRecord) : {};
            const mappedProp = OpenApiPropertyMapper.mapPropertyMetadata(rawDef, key, false, root);
            const defSchema: ISchema = {
                title: mappedProp.title || key,
                type: mappedProp.type === "array" ? "array" : "object",
                properties: mappedProp.properties,
                items: mappedProp.items,
                additionalProperties: mappedProp.additionalProperties,
                required: readStringArray(rawDef, "required"),
                ui: mappedProp.ui,
                layoutStrategy: mappedProp.type === "array" ? LAYOUT_STRATEGY.TABLE : LAYOUT_STRATEGY.FORM
            };
            Object.assign(defSchema, {
                ...mappedProp,
                title: defSchema.title,
                type: mappedProp.type === "array" ? "array" : (mappedProp.type || defSchema.type),
                required: defSchema.required,
                layoutStrategy: defSchema.layoutStrategy
            });
            this.mergePolymorphicRootProperties(defSchema, rawDef, root);
            definitions[key] = defSchema;
        }
        return definitions;
    }
}
