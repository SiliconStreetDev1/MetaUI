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
                title: schemaObj.title || "MetaUI Generated Form",
                type: schemaObj.type || (schemaObj.items ? "array" : "object"),
                layoutStrategy: schemaObj.layoutStrategy,
                uiLayout: schemaObj.uiLayout
            };

            if (normalized.type === "object") {
                normalized.properties = this.normalizeProperties(schemaObj.properties || {});
            } else if (normalized.type === "array") {
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

    private static normalizeProperties(properties: any): Record<string, IPropertyMetadata> {
        const normalizedProps: Record<string, IPropertyMetadata> = {};
        for (const key of Object.keys(properties)) {
            normalizedProps[key] = this.normalizePropertyMetadata(properties[key], key);
        }
        return normalizedProps;
    }

    private static normalizePropertyMetadata(prop: any, keyName: string): IPropertyMetadata {
        const normalized: IPropertyMetadata = {
            type: prop.type || "string",
            ui: {
                label: prop.ui?.label || this.generateLabel(keyName),
                isKey: !!prop.ui?.isKey,
                readOnly: !!prop.ui?.readOnly,
                widget: prop.ui?.widget,
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
            valueHelp: prop.valueHelp
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
        const schema: ISchema = { type: "object", properties: {} };
        
        if (!data || typeof data !== "object") {
            return schema;
        }

        if (Array.isArray(data)) {
            schema.type = "array";
            schema.items = {
                type: "object",
                properties: data.length > 0 ? this.inferPropertiesFromObject(data[0]) : {}
            };
        } else {
            schema.type = "object";
            schema.properties = this.inferPropertiesFromObject(data);
        }

        return schema;
    }

    private static inferPropertiesFromObject(obj: any): Record<string, IPropertyMetadata> {
        const properties: Record<string, IPropertyMetadata> = {};
        if (!obj || typeof obj !== "object") return properties;

        for (const key of Object.keys(obj)) {
            const val = obj[key];
            if (val === null || val === undefined) continue;
            
            if (typeof val === "object" && !Array.isArray(val)) continue;

            let type: FieldType = "string";
            let items: IPropertyMetadata | undefined;

            if (typeof val === "number") type = "number";
            else if (typeof val === "boolean") type = "boolean";
            else if (Array.isArray(val)) {
                type = "array";
                items = {
                    type: "object",
                    properties: val.length > 0 ? this.inferPropertiesFromObject(val[0]) : {}
                };
            }
            
            properties[key] = {
                type,
                items,
                ui: {
                    label: this.generateLabel(key),
                    isKey: false,
                    readOnly: false
                }
            };
        }

        return properties;
    }
}
