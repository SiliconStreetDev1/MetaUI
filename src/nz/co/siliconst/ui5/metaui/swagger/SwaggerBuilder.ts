/**
 * @file SwaggerBuilder.ts
 * @description Facade orchestration for translating Swagger/OpenAPI JSON into native MetaUI ISchema.
 * Strict Single Responsibility architecture delegates mapping logic to dedicated utilities.
 */

import { ISchema, IPropertyMetadata } from "../interfaces/ISchema";
import { ISchemaBuilderPlugin } from "../interfaces/ISchemaBuilderPlugin";
import { Logger } from "../utils/Logger";
import { SwaggerTypeMapper } from "./SwaggerTypeMapper";
import { SwaggerUIMapper } from "./SwaggerUIMapper";
import { SwaggerRefResolver } from "./SwaggerRefResolver";

export class SwaggerBuilder implements ISchemaBuilderPlugin {

    /**
     * Determines if the provided JSON payload is a Swagger or OpenAPI document.
     * 
     * @param {any} rawSchema The raw JSON schema to test.
     * @returns {boolean} True if the document contains 'openapi' or 'swagger' root keys.
     */
    public canHandle(rawSchema: any): boolean {
        return !!(rawSchema && (rawSchema.openapi || rawSchema.swagger));
    }

    /**
     * Builds a strict MetaUI ISchema from the provided OpenAPI payload.
     * 
     * @param {any} rawSchema The OpenAPI root document.
     * @returns {ISchema} The translated MetaUI schema.
     */
    public build(rawSchema: any): ISchema {
        return SwaggerBuilder.build(rawSchema);
    }

    /**
     * Asynchronously fetches a remote OpenAPI document and compiles it into a MetaUI ISchema.
     * 
     * @param {string} url The URL to fetch the JSON payload from.
     * @param {string} [targetDefinition] Optional. The specific entity schema to extract.
     * @returns {Promise<ISchema>} A Promise resolving to the compiled ISchema.
     */
    public static async fetchAndBuild(url: string, targetDefinition?: string): Promise<ISchema> {
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const swaggerRoot = await response.json();
            return this.build(swaggerRoot, targetDefinition);
        } catch (error) {
            const msg = "Failed to fetch Swagger JSON from URL: " + (error as Error).message;
            Logger.error("[MetaUI SwaggerBuilder]", msg);
            throw new Error(msg);
        }
    }

    /**
     * Synchronously builds a MetaUI ISchema from a provided OpenAPI root document.
     * Automatically extracts the requested definition from `components.schemas` or falls back to the first available.
     * 
     * @param {any} swaggerRoot The OpenAPI root document.
     * @param {string} [targetDefinition] Optional. The specific entity schema to extract.
     * @returns {ISchema} The translated MetaUI schema.
     */
    public static build(swaggerRoot: any, targetDefinition?: string): ISchema {
        if (!swaggerRoot || typeof swaggerRoot !== "object") {
            throw new Error("[MetaUI SwaggerBuilder] Invalid Swagger root object provided.");
        }

        let targetObject = swaggerRoot;

        if (!targetDefinition) {
            if (swaggerRoot.components && swaggerRoot.components.schemas) {
                const keys = Object.keys(swaggerRoot.components.schemas);
                if (keys.length > 0) targetDefinition = keys[0];
            } else if (swaggerRoot.definitions) {
                const keys = Object.keys(swaggerRoot.definitions);
                if (keys.length > 0) targetDefinition = keys[0];
            }
        }

        if (targetDefinition) {
            let found = false;
            if (swaggerRoot.components && swaggerRoot.components.schemas && swaggerRoot.components.schemas[targetDefinition]) {
                targetObject = swaggerRoot.components.schemas[targetDefinition];
                found = true;
            } else if (swaggerRoot.definitions && swaggerRoot.definitions[targetDefinition]) {
                targetObject = swaggerRoot.definitions[targetDefinition];
                found = true;
            }

            if (!found) {
                throw new Error(`[MetaUI SwaggerBuilder] Could not find target definition '${targetDefinition}' in components/schemas or definitions.`);
            }
        }

        const schema: ISchema = {
            title: targetObject.title || swaggerRoot.info?.title || targetDefinition,
            type: targetObject.type === "array" ? "array" : "object",
            layoutStrategy: targetObject.type === "array" ? "table" : "form"
        };

        if (targetObject.additionalProperties === true) {
            schema.additionalProperties = true;
        }

        if (schema.type === "object") {
            const requiredKeys = Array.isArray(targetObject.required) ? targetObject.required : [];
            schema.properties = this.mapProperties(targetObject.properties || {}, requiredKeys, swaggerRoot);
        } else if (schema.type === "array" && targetObject.items) {
            schema.items = this.mapPropertyMetadata(targetObject.items, "items", false, swaggerRoot);
        }

        return schema;
    }

    /**
     * Recursively traverses and translates an OpenAPI properties block into MetaUI IPropertyMetadata.
     * 
     * @param {Record<string, any>} properties The OpenAPI properties object.
     * @param {string[]} requiredKeys An array of keys marked as required in the parent schema.
     * @param {any} swaggerRoot The root document (used for $ref resolution).
     * @returns {Record<string, IPropertyMetadata>} The mapped MetaUI properties object.
     */
    private static mapProperties(properties: Record<string, any>, requiredKeys: string[], swaggerRoot: any): Record<string, IPropertyMetadata> {
        const normalizedProps: Record<string, IPropertyMetadata> = {};
        
        for (const key of Object.keys(properties)) {
            const isRequired = requiredKeys.includes(key);
            let propDef = properties[key];

            if (propDef.$ref) {
                const resolved = SwaggerRefResolver.resolve(propDef.$ref, swaggerRoot);
                if (resolved) {
                    propDef = { ...resolved, ...propDef };
                }
            }

            normalizedProps[key] = this.mapPropertyMetadata(propDef, key, isRequired, swaggerRoot);
        }
        
        return normalizedProps;
    }

    /**
     * Translates a single OpenAPI property schema into a MetaUI IPropertyMetadata block.
     * Handles local $ref resolution, allOf merging, type mapping, and UI directive injection.
     * 
     * @param {any} swaggerProp The OpenAPI property definition.
     * @param {string} keyName The technical key of the property.
     * @param {boolean} isRequired Whether this property is strictly required.
     * @param {any} swaggerRoot The root document (used for $ref resolution).
     * @returns {IPropertyMetadata} The compiled MetaUI property metadata.
     */
    private static mapPropertyMetadata(swaggerProp: any, keyName: string, isRequired: boolean, swaggerRoot: any): IPropertyMetadata {
        let currentProp = swaggerProp;

        if (currentProp.$ref) {
            const resolved = SwaggerRefResolver.resolve(currentProp.$ref, swaggerRoot);
            if (resolved) {
                currentProp = { ...resolved, ...currentProp };
            }
        }

        if (Array.isArray(currentProp.allOf)) {
            let merged = { ...currentProp };
            delete merged.allOf;
            for (const subSchema of currentProp.allOf) {
                let resolvedSub = subSchema;
                if (subSchema.$ref) {
                    resolvedSub = SwaggerRefResolver.resolve(subSchema.$ref, swaggerRoot) || {};
                }
                merged = { ...merged, ...resolvedSub };
            }
            currentProp = merged;
        }

        const type = SwaggerTypeMapper.mapType(currentProp.type);

        const metaProp: IPropertyMetadata = {
            type: type,
            required: isRequired
        };

        const uiDirective = SwaggerUIMapper.build(currentProp, keyName);
        if (Object.keys(uiDirective).length > 0) {
            metaProp.ui = uiDirective;
        }

        if (typeof currentProp.maxLength === "number") metaProp.maxLength = currentProp.maxLength;
        if (typeof currentProp.minLength === "number") metaProp.minLength = currentProp.minLength;
        if (typeof currentProp.maximum === "number") metaProp.maximum = currentProp.maximum;
        if (typeof currentProp.minimum === "number") metaProp.minimum = currentProp.minimum;
        if (typeof currentProp.pattern === "string") metaProp.pattern = currentProp.pattern;

        if (typeof currentProp.multipleOf === "number") metaProp.multipleOf = currentProp.multipleOf;
        
        if (currentProp.default !== undefined) metaProp.default = currentProp.default;
        if (typeof currentProp.nullable === "boolean") metaProp.nullable = currentProp.nullable;
        if (typeof currentProp.writeOnly === "boolean") metaProp.writeOnly = currentProp.writeOnly;
        if (currentProp.example !== undefined) metaProp.example = currentProp.example;
        if (typeof currentProp.deprecated === "boolean") metaProp.deprecated = currentProp.deprecated;
        if (currentProp.exclusiveMinimum !== undefined) metaProp.exclusiveMinimum = currentProp.exclusiveMinimum;
        if (currentProp.exclusiveMaximum !== undefined) metaProp.exclusiveMaximum = currentProp.exclusiveMaximum;

        if (Array.isArray(currentProp.enum)) {
            metaProp.enum = currentProp.enum;
            if (!metaProp.ui) metaProp.ui = {};
            if (!metaProp.ui.widget) {
                if (type === "array") {
                    metaProp.ui.widget = "multiSelect";
                } else {
                    metaProp.ui.widget = "select";
                }
            }
        }

        if (type === "object") {
            if (currentProp.properties) {
                const childRequired = Array.isArray(currentProp.required) ? currentProp.required : [];
                metaProp.properties = this.mapProperties(currentProp.properties, childRequired, swaggerRoot);
            }
            if (currentProp.additionalProperties === true) {
                metaProp.additionalProperties = true;
            }
        } else if (type === "array" && currentProp.items) {
            metaProp.items = this.mapPropertyMetadata(currentProp.items, "items", false, swaggerRoot);
        }

        return metaProp;
    }
}
