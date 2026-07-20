/**
 * @file SchemaNormalizer.ts
 * @description Transforms and validates incoming JSON payloads into the strict v2 ISchema dictionary matrix.
 */

import { ISchema, IPropertyMetadata, FieldType } from "../interfaces/ISchema";
import { Logger } from "../utils/Logger";

export class SchemaNormalizer {

    /**
     * Validates that the provided raw payload conforms to the required ISchema structures.
     */
    public static normalize(rawSchema?: any, data?: any): ISchema {
        let schemaObj = rawSchema;

        if (typeof schemaObj === "string") {
            try {
                schemaObj = JSON.parse(schemaObj);
            } catch (e) {
                const msg = (e as Error).message;
                Logger.error("[MetaUI SchemaNormalizer] Failed to parse schema string.", msg);
                Logger.showErrorPopup(`Failed to parse the provided JSON schema.\n\nDetails: ${msg}`);
                schemaObj = null;
            }
        }

        if (!schemaObj || typeof schemaObj !== 'object' || Array.isArray(schemaObj)) {
            return this.inferSchemaFromData(data);
        }

        try {
            // It is an object. Ensure it conforms to v2 structure.
            const normalized: ISchema = {
                title: schemaObj.title,
                type: schemaObj.type || (schemaObj.items ? "array" : "object"),
                layoutStrategy: schemaObj.layoutStrategy,
                uiLayout: schemaObj.uiLayout,
                additionalProperties: schemaObj.additionalProperties
            };

            let targetProperties = schemaObj.properties || {};

            if (schemaObj.additionalProperties === true && data) {
                const inferred = this.inferSchemaFromData(data);
                if (inferred.type === "object" && inferred.properties) {
                    targetProperties = this.deepMergeProperties(inferred.properties, targetProperties);
                } else if (inferred.type === "array" && inferred.items && inferred.items.properties) {
                    // Array schema merging could be added here if we want full support.
                }
            }

            if (normalized.type === "object") {
                normalized.properties = this.normalizeProperties(targetProperties);
            } else if (normalized.type === "array") {
                // Future expansion: array deep merge
                normalized.items = this.normalizePropertyMetadata(schemaObj.items || { type: "object", properties: {} }, "items");
            }

            return normalized;
        } catch (error) {
            const msg = (error as Error).message;
            Logger.error("[MetaUI SchemaNormalizer] Critical error normalizing schema object.", msg);
            Logger.showErrorPopup(`Schema Normalization failed.\n\nDetails: ${msg}`);
            // Fallback to empty object to prevent hard crash downstream
            return { type: "object", properties: {} };
        }
    }

    /**
     * Recursively deep merges an inferred schema over a base schema.
     * @param base The base property dictionary.
     * @param override The overriding inferred dictionary.
     * @returns A new deeply merged property dictionary.
     */
    private static deepMergeProperties(base: any, override: any): any {
        const merged = { ...base };
        for (const key of Object.keys(override)) {
            const overrideVal = override[key];
            const baseVal = merged[key];

            if (baseVal && typeof baseVal === "object" && !Array.isArray(baseVal) &&
                overrideVal && typeof overrideVal === "object" && !Array.isArray(overrideVal)) {
                merged[key] = this.deepMergeProperties(baseVal, overrideVal);
            } else {
                merged[key] = overrideVal;
            }
        }
        return merged;
    }

    /**
     * Normalizes a collection of properties.
     * @param properties The raw properties map.
     * @returns A map of strict IPropertyMetadata objects.
     */
    private static normalizeProperties(properties: any): Record<string, IPropertyMetadata> {
        const normalizedProps: Record<string, IPropertyMetadata> = {};
        for (const key of Object.keys(properties)) {
            normalizedProps[key] = this.normalizePropertyMetadata(properties[key], key);
        }
        return normalizedProps;
    }

    /**
     * Normalizes a single property against the ISchema specification.
     * @param prop The raw property definition.
     * @param keyName The string key name for generating default labels.
     * @returns A strict IPropertyMetadata instance.
     */
    private static normalizePropertyMetadata(prop: any, keyName: string): IPropertyMetadata {
        const normalized: IPropertyMetadata = {
            type: prop.type || "string",
            ui: {
                label: prop.ui?.label || this.generateLabel(keyName),
                isKey: !!prop.ui?.isKey,
                readOnly: !!prop.ui?.readOnly,
                widget: prop.ui?.widget || (prop.valueHelp || prop.enum ? "select" : undefined),
                visibleOn: prop.ui?.visibleOn,
                enabledOn: prop.ui?.enabledOn,
                format: prop.ui?.format,
                validators: prop.ui?.validators,
                formatter: prop.ui?.formatter,
                args: prop.ui?.args,
                rows: prop.ui?.rows,
                fullWidth: prop.ui?.fullWidth
            },
            required: !!prop.required,
            maxLength: prop.maxLength,
            minimum: prop.minimum,
            maximum: prop.maximum,
            pattern: prop.pattern,
            precision: prop.precision,
            scale: prop.scale,
            valueHelp: prop.valueHelp,
            enum: prop.enum
        };

        if (normalized.type === "object" && prop.properties) {
            normalized.properties = this.normalizeProperties(prop.properties);
            normalized.uiLayout = prop.uiLayout;
        } else if (normalized.type === "array" && prop.items) {
            normalized.items = this.normalizePropertyMetadata(prop.items, "items");
            normalized.uiLayout = prop.uiLayout;
        }

        return normalized;
    }

    /**
     * Generates a Title Case label from camelCase or snake_case technical names.
     */
    private static generateLabel(name: string): string {
        if (!name) return "";
        let spaced = name.replace(/([A-Z])/g, " $1").replace(/_/g, " ");
        return spaced.split(' ')
            .filter(w => w.length > 0)
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ')
            .trim();
    }

    /**
     * Infers a v2 ISchema structure dynamically from a plain data payload.
     */
    private static inferSchemaFromData(data: any): ISchema {
        const schema: ISchema = { type: "object", properties: {}, layoutStrategy: "compact", title: "" };

        if (!data || typeof data !== "object") {
            return schema;
        }

        if (Array.isArray(data)) {
            schema.type = "array";
            schema.layoutStrategy = "table";
            schema.items = {
                type: "object",
                layoutStrategy: "compact",
                properties: data.length > 0 ? this.inferPropertiesFromObject(data[0]) : {}
            };
        } else {
            schema.type = "object";
            schema.properties = this.inferPropertiesFromObject(data);
        }

        return schema;
    }

    /**
     * Infers field metadata recursively from a raw data object.
     * @param obj The raw JavaScript object.
     * @returns A dictionary of inferred IPropertyMetadata.
     */
    private static inferPropertiesFromObject(obj: any): Record<string, IPropertyMetadata> {
        const properties: Record<string, IPropertyMetadata> = {};
        if (!obj || typeof obj !== "object") return properties;

        for (const key of Object.keys(obj)) {
            const val = obj[key];
            if (val === null || val === undefined) continue;

            let type: FieldType = "string";
            let items: IPropertyMetadata | undefined;
            let nestedProps: Record<string, IPropertyMetadata> | undefined;

            if (typeof val === "number") type = "number";
            else if (typeof val === "boolean") type = "boolean";
            else if (Array.isArray(val)) {
                type = "array";
                items = {
                    type: "object",
                    properties: val.length > 0 ? this.inferPropertiesFromObject(val[0]) : {}
                };
            } else if (typeof val === "object") {
                type = "object";
                nestedProps = this.inferPropertiesFromObject(val);
            }

            properties[key] = {
                type,
                items,
                properties: nestedProps,
                ui: {
                    label: this.generateLabel(key),
                    isKey: false,
                    readOnly: false
                }
            };
        }

        return properties;
    }

    /**
     * Resolves a JSON Schema scope (e.g. '#/properties/header/properties/id')
     * against the ISchema, returning the PropertyMetadata and the UI5 binding path.
     */
    public static resolveScope(schema: ISchema, scope: string): { meta: IPropertyMetadata | undefined, bindingPath: string, propKey: string } {
        if (!scope || !scope.startsWith("#/properties/")) {
            return { meta: undefined, bindingPath: scope || "", propKey: scope || "" };
        }
        
        const pathSegments = scope.replace("#/properties/", "").split("/properties/");
        let current: any = schema.properties;
        let meta: IPropertyMetadata | undefined;
        
        Logger.debug("[MetaUI SchemaNormalizer]", `Resolving scope '${scope}' with segments: ${JSON.stringify(pathSegments)}`, "SchemaNormalizer");
        Logger.debug("[MetaUI SchemaNormalizer]", `Root schema keys: ${Object.keys(schema.properties || {})}`, "SchemaNormalizer");

        for (let i = 0; i < pathSegments.length; i++) {
            const segment = pathSegments[i];
            if (!current) {
                Logger.debug("[MetaUI SchemaNormalizer]", `current is undefined at segment '${segment}'`, "SchemaNormalizer");
                meta = undefined;
                break;
            }
            meta = current[segment];
            Logger.debug("[MetaUI SchemaNormalizer]", `Segment '${segment}' resolved to meta: ${!!meta}. Available keys in current: ${Object.keys(current)}`, "SchemaNormalizer");
            if (i < pathSegments.length - 1) {
                current = meta?.properties;
            }
        }
        
        const bindingPath = pathSegments.join("/");
        const propKey = scope.replace("#/properties/", ""); // The original raw string for logging
        
        return {
            meta,
            bindingPath,
            propKey
        };
    }
}
