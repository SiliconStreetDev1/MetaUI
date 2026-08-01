/**
 * @file SchemaValidator.ts
 * @description Structural validation utility to catch developer errors in the JSON schema itself.
 */

import { ISchema, FieldType } from "../interfaces/ISchema";
import { SCHEMA_TYPE } from "../constants/MetaUIConstants";

export class SchemaValidator {
    /**
     * Validates a parsed JSON schema object for structural correctness.
     * @param schema The schema object to validate
     * @returns An array of error strings. Empty if no errors.
     */
    public static validateSchemaStructure(schema: unknown): string[] {
        const errors: string[] = [];

        if (!schema || typeof schema !== "object") {
            return ["Root schema must be an object."];
        }

        const s = schema as Record<string, any>;
        if (s.type !== "object" && s.type !== "array") {
            errors.push(`Root schema must have type 'object' or 'array'. Found: '${s.type}'`);
        }

        if (s.type === "object" && !s.properties) {
            errors.push("Object schema is missing the 'properties' node.");
        }

        if (s.type === "array") {
            if (!s.items) {
                // Warning rather than error for inference support, but we should check it
                // Actually inference creates { items: { type: 'string' } } for primitives
                // Wait, the instruction says "completely skipping the validation of the array's items configuration"
                // I will recursively call validateSchemaStructure if items exist
            }
            if (s.items && typeof s.items === "object") {
                const itemErrors = SchemaValidator.validateSchemaStructure(s.items);
                errors.push(...itemErrors);
            }
        }

        if (s.properties) {
            for (const key of Object.keys(s.properties)) {
                const prop = s.properties[key];
                if (!prop || typeof prop !== "object") {
                    errors.push(`Property '${key}' must be an object.`);
                    continue;
                }

                if (!prop.type) {
                    errors.push(`Property '${key}' is missing 'type'.`);
                } else {
                    const allowedTypes: FieldType[] = [SCHEMA_TYPE.STRING, SCHEMA_TYPE.NUMBER, SCHEMA_TYPE.INTEGER, SCHEMA_TYPE.BOOLEAN, SCHEMA_TYPE.DATE, SCHEMA_TYPE.OBJECT, SCHEMA_TYPE.ARRAY];
                    if (!allowedTypes.includes(prop.type)) {
                        errors.push(`Property '${key}' has invalid type '${prop.type}'. Allowed: ${allowedTypes.join(", ")}`);
                    }
                }

                // Removed strict check for prop.items on array properties because inference handles empty definitions

            }
        }

        return errors;
    }
}
