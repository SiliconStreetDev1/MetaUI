/**
 * @file SchemaValidator.ts
 * @description Structural validation utility to catch developer errors in the JSON schema itself.
 */

import { FieldType } from "../interfaces/ISchema";
import { SCHEMA_TYPE } from "../constants/MetaUIConstants";
import { isRecord, readString, readRecord } from "../utils/TypeGuards";

const ALLOWED_TYPES: readonly FieldType[] = [
    SCHEMA_TYPE.STRING,
    SCHEMA_TYPE.NUMBER,
    SCHEMA_TYPE.INTEGER,
    SCHEMA_TYPE.BOOLEAN,
    SCHEMA_TYPE.DATE,
    SCHEMA_TYPE.OBJECT,
    SCHEMA_TYPE.ARRAY
];

/**
 * Validates a normalized or raw JSON schema object for structural soundness before rendering.
 */
export class SchemaValidator {
    /**
     * Validates a parsed JSON schema object for structural correctness.
     * @param schema The schema object to validate.
     * @returns {string[]} An array of error strings. Empty if no errors.
     */
    public static validateSchemaStructure(schema: unknown, depth: number = 0): string[] {
        const errors: string[] = [];

        if (!isRecord(schema)) {
            return ["Root schema must be an object."];
        }
        if (depth > 8) {
            return errors;
        }

        const rootType = readString(schema, "type");
        if (rootType !== SCHEMA_TYPE.OBJECT && rootType !== SCHEMA_TYPE.ARRAY) {
            errors.push(`Root schema must have type 'object' or 'array'. Found: '${String(schema.type)}'`);
        }

        const properties = readRecord(schema, "properties");
        const hasAlternativeObjectStructure =
            schema.additionalProperties !== undefined ||
            Array.isArray(schema.oneOf) ||
            Array.isArray(schema.anyOf) ||
            Array.isArray(schema.allOf) ||
            typeof schema.$ref === "string";
        if (rootType === SCHEMA_TYPE.OBJECT && !properties && !hasAlternativeObjectStructure) {
            errors.push("Object schema is missing the 'properties' node.");
        }

        if (rootType === SCHEMA_TYPE.ARRAY) {
            const items = readRecord(schema, "items");
            if (!items && typeof schema.$ref !== "string") {
                errors.push("Array schema is missing the 'items' node.");
            } else if (items) {
                const itemsType = readString(items, "type");
                if (itemsType === SCHEMA_TYPE.OBJECT || itemsType === SCHEMA_TYPE.ARRAY) {
                    errors.push(...SchemaValidator.validateSchemaStructure(items, depth + 1));
                } else if (itemsType && !(ALLOWED_TYPES as readonly string[]).includes(itemsType)) {
                    errors.push(`Array items has invalid type '${itemsType}'. Allowed: ${ALLOWED_TYPES.join(", ")}`);
                }
            }
        }

        if (properties) {
            for (const key of Object.keys(properties)) {
                const prop = properties[key];
                if (!isRecord(prop)) {
                    errors.push(`Property '${key}' must be an object.`);
                    continue;
                }

                const propType = readString(prop, "type");
                if (!propType) {
                    errors.push(`Property '${key}' is missing 'type'.`);
                } else if (!(ALLOWED_TYPES as readonly string[]).includes(propType)) {
                    errors.push(`Property '${key}' has invalid type '${propType}'. Allowed: ${ALLOWED_TYPES.join(", ")}`);
                } else if (
                    propType === SCHEMA_TYPE.ARRAY &&
                    !isRecord(prop.items) &&
                    typeof prop.$ref !== "string" &&
                    !Array.isArray(prop.enum) &&
                    prop.valueHelp === undefined &&
                    !(isRecord(prop.ui) && prop.ui.valueHelp !== undefined)
                ) {
                    errors.push(`Array property '${key}' is missing 'items'.`);
                } else if (propType === SCHEMA_TYPE.OBJECT && isRecord(prop.properties)) {
                    errors.push(...SchemaValidator.validateSchemaStructure(prop, depth + 1));
                }
            }
        }

        return errors;
    }
}
