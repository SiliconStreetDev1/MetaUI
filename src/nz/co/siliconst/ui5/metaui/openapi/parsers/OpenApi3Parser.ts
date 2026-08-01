/**
 * @file OpenApi3Parser.ts
 * @description Native parser for OpenAPI 3.0.x specifications.
 */

import { IOpenApiParserPlugin } from "../interfaces/IOpenApiParserPlugin";
import { ISchema } from "../../interfaces/ISchema";
import { OpenApiPropertyMapper } from "./OpenApiPropertyMapper";
import { OpenApiRefResolver } from "../OpenApiRefResolver";

/**
 * Parser plugin specifically designed for parsing OpenAPI 3.0.x schemas.
 * Responsible for translating OpenAPI 3.0 specific constructs into the MetaUI normalized schema.
 * 
 * @public
 */
export class OpenApi3Parser implements IOpenApiParserPlugin {
    /**
     * Parses a raw OpenAPI 3.0 document into a normalized MetaUI ISchema tree.
     * Extracts definitions from components.schemas, normalizes properties, and recursively resolves composition (allOf).
     * 
     * @param {unknown} openApiRoot The root JSON document.
     * @param {string} [targetDefinition] Optional specific schema to extract from components.schemas. If omitted, uses the first schema available.
     * @returns {ISchema} The synthesized MetaUI schema structure.
     * @throws {Error} If the target definition cannot be found in the provided Swagger document.
     */
    public parse(openApiRoot: unknown, targetDefinition?: string): ISchema {
        let targetObject = openApiRoot as Record<string, unknown>;
        const root = openApiRoot as Record<string, unknown>;

        if (!targetDefinition) {
            if (root.components && (root.components as Record<string, unknown>).schemas) {
                const schemas = (root.components as Record<string, unknown>).schemas as Record<string, unknown>;
                const keys = Object.keys(schemas);
                if (keys.length > 0) targetDefinition = keys[0];
            }
        }

        if (targetDefinition) {
            targetDefinition = targetDefinition.replace("#/components/schemas/", "").replace("#/definitions/", "");
            if (root.components && (root.components as Record<string, unknown>).schemas) {
                const schemas = (root.components as Record<string, unknown>).schemas as Record<string, unknown>;
                if (schemas[targetDefinition]) {
                    targetObject = schemas[targetDefinition] as Record<string, unknown>;
                } else {
                    throw new Error(`[MetaUI OpenApi3Parser] Could not find target definition '${targetDefinition}' in components.schemas.`);
                }
            } else {
                throw new Error(`[MetaUI OpenApi3Parser] Could not find target definition '${targetDefinition}' in components.schemas.`);
            }
        }

        if (targetObject.$ref) {
            const resolved = OpenApiRefResolver.resolve(targetObject.$ref as string, openApiRoot) as Record<string, unknown>;
            if (resolved) {
                targetObject = { ...resolved, ...targetObject };
            }
        }

        if (Array.isArray(targetObject.allOf)) {
            let merged = { ...targetObject };
            delete merged.allOf;
            for (const subSchema of targetObject.allOf) {
                let resolvedSub = subSchema as Record<string, unknown>;
                if (subSchema.$ref) {
                    resolvedSub = (OpenApiRefResolver.resolve(subSchema.$ref as string, openApiRoot) as Record<string, unknown>) || {};
                }
                merged = OpenApiPropertyMapper.deepMergeSchemas(merged, resolvedSub) as Record<string, unknown>;
            }
            targetObject = merged;
        }

        const schema: ISchema = {
            title: (targetObject.title as string) || ((root.info as Record<string, unknown>)?.title as string) || targetDefinition || "",
            type: targetObject.type === "array" ? "array" : "object",
            layoutStrategy: targetObject.type === "array" ? "table" : "form"
        };

        if (targetObject.additionalProperties) {
            if (targetObject.additionalProperties === true) {
                schema.additionalProperties = true;
            } else if (typeof targetObject.additionalProperties === "object") {
                schema.additionalProperties = OpenApiPropertyMapper.mapPropertyMetadata(targetObject.additionalProperties, "value", false, openApiRoot, "3.0");
            }
        }

        if (targetObject.properties) {
            const requiredFields = Array.isArray(targetObject.required) ? (targetObject.required as string[]) : [];
            schema.properties = OpenApiPropertyMapper.mapProperties(targetObject.properties, requiredFields, openApiRoot, "3.0");
        } else if (schema.type === "array" && targetObject.items) {
            schema.items = OpenApiPropertyMapper.mapPropertyMetadata(targetObject.items, "items", false, openApiRoot, "3.0");
        }

        if (root.components && (root.components as Record<string, unknown>).schemas) {
            schema.definitions = {};
            const schemas = (root.components as Record<string, unknown>).schemas as Record<string, unknown>;
            for (const key of Object.keys(schemas)) {
                const mappedProp = OpenApiPropertyMapper.mapPropertyMetadata(schemas[key], key, false, openApiRoot, "3.0");
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
