/**
 * @file SwaggerTypeMapper.ts
 * @description Utility class for mapping OpenAPI 3.0 primitive types to MetaUI FieldTypes.
 */
import { FieldType } from "../interfaces/ISchema";

export class SwaggerTypeMapper {
    /**
     * Maps an OpenAPI primitive type string to the closest MetaUI FieldType.
     * If the type is omitted (common for objects) or unknown, it defaults to "object".
     * 
     * @param {string} swaggerType The raw OpenAPI type (e.g., 'string', 'integer').
     * @returns {FieldType} The mapped MetaUI FieldType.
     */
    public static mapType(swaggerType: string): FieldType {
        const typeMap: Record<string, FieldType> = {
            "string": "string",
            "number": "number",
            "integer": "integer",
            "boolean": "boolean",
            "array": "array",
            "object": "object",
            "date": "date"
        };
        // Swagger often omits type if it's an object with properties
        return typeMap[swaggerType] || "object";
    }
}
