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
    BOOLEAN: "boolean",
    DATE: "date"
} as const;

export type SchemaTypeType = typeof SCHEMA_TYPE[keyof typeof SCHEMA_TYPE];

/**
 * Common widget types injected into schema metadata.
 */
export const WIDGET_TYPE = {
    REFERENCE: "reference",
    DICTIONARY_MAP: "dictionaryMap",
    TIME: "time",
    DATETIME: "datetime",
    SWITCH: "switch",
    STEP: "step",
    SELECT: "select",
    TEXT_AREA: "textArea",
    CODE_EDITOR: "codeEditor",
    LINK: "link",
    PASSWORD: "password",
    EMAIL: "email",
    FILE_UPLOADER: "fileUploader",
    MULTI_SELECT: "multiSelect",
    MULTI_INPUT: "multiInput",
    SLIDER: "slider",
    RATING: "rating",
    MESSAGE_STRIP: "messageStrip",
    CAMERA: "camera",
    SIGNATURE: "signature",
    LOCATION: "location",
    SCANNER: "scanner",
    VOICE_INPUT: "voiceInput",
    RICH_TEXT: "richText",
    URL_BUTTON: "urlButton",
    SUBMIT_BUTTON: "submitButton",
    ODATA_SELECT: "odataSelect",
    REMOTE_DROPDOWN: "remoteDropdown",
    LIVE_SEARCH: "liveSearch",
    REMOTE_VALUE_HELP: "remoteValueHelp"
} as const;

/**
 * Layout strategies for the core engine.
 */
export const LAYOUT_STRATEGY = {
    FORM: "form",
    TABLE: "table",
    WIZARD: "wizard",
    COMPACT: "compact"
} as const;

/**
 * Standard UI5 Event names used by the framework.
 */
export const UI5_EVENT = {
    SUBMIT: "submit",
    CHANGE: "change",
    PRESS: "press",
    LIVE_CHANGE: "liveChange"
} as const;

/**
 * Standard UI5 Aggregation names used by the framework.
 */
export const UI5_AGGREGATION = {
    TOKENS: "tokens",
    ITEMS: "items"
} as const;

/**
 * Prefix strings for OpenAPI schema references.
 */
export const OPENAPI_PREFIX = {
    DEFINITIONS: "#/definitions/",
    COMPONENTS_SCHEMAS: "#/components/schemas/"
} as const;
