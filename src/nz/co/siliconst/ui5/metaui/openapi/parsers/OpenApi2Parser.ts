/**
 * @file OpenApi2Parser.ts
 * @description Native parser for OpenAPI 2.0 (Swagger) specifications.
 */

import { IOpenApiParserPlugin } from "../interfaces/IOpenApiParserPlugin";
import { ISchema } from "../../interfaces/ISchema";
import { OpenApiPropertyMapper } from "./OpenApiPropertyMapper";
import { OpenApiRefResolver } from "../OpenApiRefResolver";

/**
 * Parser plugin specifically designed for parsing OpenAPI 2.0 (Swagger) schemas.
 * Responsible for translating OpenAPI 2.0 specific constructs into the MetaUI normalized schema.
 * 
 * @public
 */
export class OpenApi2Parser implements IOpenApiParserPlugin {
    /**
     * Parses a raw OpenAPI 2.0 document into a normalized MetaUI ISchema tree.
     * Extracts definitions, normalizes properties, and recursively resolves composition (allOf).
     * 
     * @param {any} openApiRoot The root JSON document.
     * @param {string} [targetDefinition] Optional specific definition to extract. If omitted, uses the first definition available.
     * @returns {ISchema} The synthesized MetaUI schema structure.
     * @throws {Error} If the target definition cannot be found in the provided Swagger document.
     */
    public parse(openApiRoot: unknown, targetDefinition?: string): ISchema {
        let targetObject = openApiRoot;

        if (!targetDefinition) {
            if (openApiRoot.definitions) {
                const keys = Object.keys(openApiRoot.definitions);
                if (keys.length > 0) targetDefinition = keys[0];
            }
        }

        if (targetDefinition) {
            targetDefinition = targetDefinition.replace("#/components/schemas/", "").replace("#/definitions/", "");
            if (openApiRoot.definitions && openApiRoot.definitions[targetDefinition]) {
                targetObject = openApiRoot.definitions[targetDefinition];
            } else {
                throw new Error(`[MetaUI OpenApi2Parser] Could not find target definition '${targetDefinition}' in definitions.`);
            }
        }

        if (targetObject.$ref) {
            const resolved = OpenApiRefResolver.resolve(targetObject.$ref, openApiRoot);
            if (resolved) {
                targetObject = { ...resolved, ...targetObject };
            }
        }

        if (Array.isArray(targetObject.allOf)) {
            let merged = { ...targetObject };
            delete merged.allOf;
            for (const subSchema of targetObject.allOf) {
                let resolvedSub = subSchema;
                if (subSchema.$ref) {
                    resolvedSub = OpenApiRefResolver.resolve(subSchema.$ref, openApiRoot) || {};
                }
                merged = OpenApiPropertyMapper.deepMergeSchemas(merged, resolvedSub);
            }
            targetObject = merged;
        }

        const schema: ISchema = {
            title: targetObject.title || openApiRoot.info?.title || targetDefinition,
            type: targetObject.type === "array" ? "array" : "object",
            layoutStrategy: targetObject.type === "array" ? "table" : "form"
        };

        if (targetObject.additionalProperties) {
            if (targetObject.additionalProperties === true) {
                schema.additionalProperties = true;
            } else if (typeof targetObject.additionalProperties === "object") {
                schema.additionalProperties = OpenApiPropertyMapper.mapPropertyMetadata(targetObject.additionalProperties, "value", false, openApiRoot, "2.0");
            }
        }

        if (targetObject.properties) {
            const requiredFields = Array.isArray(targetObject.required) ? targetObject.required : [];
            schema.properties = OpenApiPropertyMapper.mapProperties(targetObject.properties, requiredFields, openApiRoot, "2.0");
        } else if (schema.type === "array" && targetObject.items) {
            schema.items = OpenApiPropertyMapper.mapPropertyMetadata(targetObject.items, "items", false, openApiRoot, "2.0");
        }

        if (openApiRoot.definitions) {
            schema.definitions = {};
            for (const key of Object.keys(openApiRoot.definitions)) {
                const mappedProp = OpenApiPropertyMapper.mapPropertyMetadata(openApiRoot.definitions[key], key, false, openApiRoot, "2.0");
                schema.definitions[key] = {
                    title: key,
                    type: mappedProp.type === "array" ? "array" : "object",
                    properties: mappedProp.properties,
                    items: mappedProp.items,
                    ui: mappedProp.ui,
                    layoutStrategy: mappedProp.type === "array" ? "table" : "form"
                };
            }
        }

        return schema;
    }
}
