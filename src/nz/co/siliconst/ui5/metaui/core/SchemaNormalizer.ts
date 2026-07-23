/**
 * @file SchemaNormalizer.ts
 * @description Transforms and validates incoming JSON payloads into the strict v2 ISchema dictionary matrix.
 */

import { ISchema, IPropertyMetadata, FieldType } from "../interfaces/ISchema";
import { ISchemaBuilderPlugin } from "../interfaces/ISchemaBuilderPlugin";
import { Logger } from "../utils/Logger";

export class SchemaNormalizer implements ISchemaBuilderPlugin {

    /**
     * ISchemaBuilderPlugin Contract
     */
    public canHandle(rawSchema: any): boolean {
        // MetaUI native schemas almost always have properties, items, or a layoutStrategy
        // This acts as a fallback for native schemas.
        if (rawSchema.openapi || rawSchema.swagger) return false; 
        return true;
    }

    /**
     * ISchemaBuilderPlugin Contract
     */
    public build(rawSchema: any): ISchema {
        return SchemaNormalizer.normalize(rawSchema);
    }

    /**
     * Validates that the provided raw payload conforms to the required ISchema structures.
     */
    public static normalize(rawSchema?: unknown, data?: unknown): ISchema {
        let schemaObj = rawSchema;

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
                const requiredKeys = Array.isArray(schemaObj.required) ? schemaObj.required : [];
                normalized.properties = this.normalizeProperties(targetProperties, requiredKeys);
            } else if (normalized.type === "array") {
                // Future expansion: array deep merge
                normalized.items = this.normalizePropertyMetadata(schemaObj.items || { type: "object", properties: {} }, "items", false);
            }

            return normalized;
        } catch (error) {
            const msg = "Critical error normalizing schema object: " + (error as Error).message;
            Logger.error("[MetaUI SchemaNormalizer]", msg);
            throw new Error(msg);
        }
    }

    /**
     * Recursively deep merges an inferred schema over a base schema.
     * @param base The base property dictionary.
     * @param override The overriding inferred dictionary.
     * @returns A new deeply merged property dictionary.
     */
    private static deepMergeProperties(base: Record<string, unknown>, override: Record<string, unknown>): Record<string, unknown> {
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
     * @param requiredKeys An optional array of keys that are required by the parent object.
     * @returns A map of strict IPropertyMetadata objects.
     */
    private static normalizeProperties(properties: Record<string, unknown>, requiredKeys: string[] = []): Record<string, IPropertyMetadata> {
        const normalizedProps: Record<string, IPropertyMetadata> = {};
        for (const key of Object.keys(properties)) {
            const isRequired = requiredKeys.includes(key);
            normalizedProps[key] = this.normalizePropertyMetadata(properties[key], key, isRequired);
        }
        return normalizedProps;
    }

    /**
     * Normalizes a single property against the ISchema specification.
     * @param prop The raw property definition.
     * @param keyName The string key name for generating default labels.
     * @param isRequired Indicates if the parent object mandated this property as required.
     * @returns A strict IPropertyMetadata instance.
     */
    private static normalizePropertyMetadata(prop: Record<string, unknown>, keyName: string, isRequired: boolean = false): IPropertyMetadata {
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
                fullWidth: prop.ui?.fullWidth,
                dialogButtonText: prop.ui?.dialogButtonText
            },
            required: isRequired || !!prop.required,
            maxLength: prop.maxLength as number,
            minLength: prop.minLength as number,
            minimum: prop.minimum,
            maximum: prop.maximum,
            pattern: prop.pattern,
            precision: prop.precision,
            scale: prop.scale,
            multipleOf: prop.multipleOf as number,
            valueHelp: prop.valueHelp,
            enum: prop.enum
        };

        if (normalized.type === "object" && prop.properties) {
            const requiredKeys = Array.isArray(prop.required) ? prop.required : [];
            normalized.properties = this.normalizeProperties(prop.properties as Record<string, unknown>, requiredKeys);
            normalized.uiLayout = prop.uiLayout;
        } else if (normalized.type === "array" && prop.items) {
            normalized.items = this.normalizePropertyMetadata(prop.items as Record<string, unknown>, "items", false);
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
    public static inferSchemaFromData(data: unknown): ISchema {
        const schema: ISchema = { type: "object", properties: {}, layoutStrategy: "compact", title: "" };

        if (!data || typeof data !== "object") {
            return schema;
        }

        if (Array.isArray(data)) {
            schema.type = "array";
            if (data.length > 0 && typeof data[0] !== "object") {
                schema.layoutStrategy = "compact";
                schema.items = { type: typeof data[0] as FieldType };
            } else {
                schema.layoutStrategy = "table";
                schema.items = {
                    type: "object",
                    layoutStrategy: "compact",
                    properties: data.length > 0 ? this.inferPropertiesFromObject(data[0] as Record<string, unknown>) : {}
                };
            }
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
    private static inferPropertiesFromObject(obj: Record<string, unknown>): Record<string, IPropertyMetadata> {
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
                if (val.length > 0 && typeof val[0] !== "object") {
                    items = {
                        type: typeof val[0] as FieldType
                    };
                } else {
                    items = {
                        type: "object",
                        properties: val.length > 0 ? this.inferPropertiesFromObject(val[0] as Record<string, unknown>) : {}
                    };
                }
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
                    readOnly: false,
                    widget: type === "array" && items?.type !== "object" ? "multiInput" : undefined
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
        let current: Record<string, IPropertyMetadata> | undefined = schema.properties;
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
