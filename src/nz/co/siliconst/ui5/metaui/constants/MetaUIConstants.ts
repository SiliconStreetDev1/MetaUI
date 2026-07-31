/**
 * @file MetaUIConstants.ts
 * @description Centralized registry of all core architectural string constants to prevent magic strings.
 */

/**
 * Defines the physical layout rendering mode of a schema node.
 */
export const RENDER_MODE = {
    INLINE: "inline",
    DIALOG: "dialog"
} as const;

export type RenderModeType = typeof RENDER_MODE[keyof typeof RENDER_MODE];

/**
 * Standard JSON schema and MetaUI extended types.
 */
export const SCHEMA_TYPE = {
    OBJECT: "object",
    ARRAY: "array",
    STRING: "string",
    NUMBER: "number",
    INTEGER: "integer",
    BOOLEAN: "boolean"
} as const;

export type SchemaTypeType = typeof SCHEMA_TYPE[keyof typeof SCHEMA_TYPE];

/**
 * Common widget types injected into schema metadata.
 */
export const WIDGET_TYPE = {
    REFERENCE: "reference",
    DICTIONARY_MAP: "dictionaryMap"
} as const;

/**
 * Prefix strings for OpenAPI schema references.
 */
export const OPENAPI_PREFIX = {
    DEFINITIONS: "#/definitions/",
    COMPONENTS_SCHEMAS: "#/components/schemas/"
} as const;
