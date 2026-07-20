/**
 * @file SchemaValidator.ts
 * @description Structural validation utility to catch developer errors in the JSON schema itself.
 */

import { ISchema, FieldType } from "../interfaces/ISchema";

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

        if (schema.type !== "object" && schema.type !== "array") {
            errors.push(`Root schema must have type 'object' or 'array'. Found: '${schema.type}'`);
        }

        if (schema.type === "object" && !schema.properties) {
            errors.push("Object schema is missing the 'properties' node.");
        }

        if (schema.properties) {
            for (const key of Object.keys(schema.properties)) {
                const prop = schema.properties[key];
                if (!prop || typeof prop !== "object") {
                    errors.push(`Property '${key}' must be an object.`);
                    continue;
                }

                if (!prop.type) {
                    errors.push(`Property '${key}' is missing 'type'.`);
                } else {
                    const allowedTypes: FieldType[] = ["string", "number", "boolean", "date", "object", "array"];
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
