/**
 * @file OpenApiTypeMapper.ts
 * @description Utility class for mapping OpenAPI primitive types to MetaUI FieldTypes.
 */
import { FieldType } from "../interfaces/ISchema";

/**
 * Acts as the translation boundary between raw OpenAPI types and the internal MetaUI FieldType enumerations.
 * This ensures that the core layout engine never has to parse or understand Swagger-specific semantics.
 *
 * @internal
 */
export class OpenApiTypeMapper {
    /**
     * Maps an OpenAPI primitive type string to the closest MetaUI FieldType.
     * If the type is omitted or unknown, it defaults to `"string"` (aligned with
     * `SchemaNormalizer` / `SchemaDirectiveNormalizer.resolveSchemaType`, which handles
     * structural object/array inference from `properties`/`items` before falling back to `"string"`).
     *
     * @param {string} openApiType The raw OpenAPI type (e.g., 'string', 'integer').
     * @returns {FieldType} The mapped MetaUI FieldType strictly understood by the core engine.
     */
    public static mapType(openApiType: string): FieldType {
        const typeMap: Record<string, FieldType> = {
            string: "string",
            file: "string",
            number: "number",
            integer: "integer",
            boolean: "boolean",
            array: "array",
            object: "object",
            date: "date"
        };

        // Default to "string" if the type is unknown or omitted by the API specification (aligned with SchemaNormalizer).
        return typeMap[openApiType] || "string";
    }
}
