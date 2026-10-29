/**
 * @file MetaUIConstants.ts
 * @description Centralized registry of all core architectural string constants to prevent magic strings.
 */

/**
 * Maximum nesting depth any schema walker follows before it stops and reports.
 * Cycle guards (`visited` sets, active `$ref` stacks) catch self-reference but not
 * breadth-induced depth, so every recursive schema traversal compares against this
 * constant rather than against a literal of its own.
 *
 * Set to match {@link MAX_LAYOUT_DEPTH}: a schema nested deeper than the layout tree that
 * renders it cannot be drawn anyway. It is deliberately well above any individual walker's
 * former cap, so a legitimate chain of `$ref` definitions - each shallow, but linked one into
 * the next - is still walked in full.
 *
 * This constant previously existed but only one walker (LayoutScorer) used it. Twelve others kept private
 * caps for the same concept (`8, 8, 8, 8, 8, 10, 10, 10, 10, 10, 16, 16`), so a
 * producer could emit a property the validator then refused to descend into. Unifying at 30 is
 * monotone against every one of them: nothing that was walked before is truncated now.
 *
 * Enforced by the `[DEPTH_CONSTANT]` gate in `scripts/run-tests.js`, which forbids both a
 * numeric literal in a `depth` comparison and a `MAX_*_DEPTH` constant declared elsewhere,
 * and by `[DEPTH_SIGNAL]`, which forbids truncating here without saying what was lost.
 */
export const MAX_SCHEMA_DEPTH = 30;

/**
 * Maximum nesting depth of a hand-authored `uiLayout` presentation tree.
 *
 * Tracked separately from {@link MAX_SCHEMA_DEPTH} even though the two values agree today:
 * `uiLayout` nests structural containers (`Group` > `HorizontalLayout` > `VerticalLayout` > ...)
 * whose depth is a visual-grouping decision, not a property of the data. They are equal because
 * the schema cap is derived from this one, not because they are the same limit.
 */
export const MAX_LAYOUT_DEPTH = 30;

/**
 * Maximum recursion depth of `deepClone` over consumer-owned payloads.
 *
 * Deliberately distinct from {@link MAX_SCHEMA_DEPTH}, and deliberately far above it:
 * `deepClone` copies arbitrary user data rather than schema, and truncating a payload the
 * consumer owns is data loss. It exists only as a stack-overflow backstop.
 */
export const MAX_CLONE_DEPTH = 200;

/**
 * Defines the physical layout rendering mode of a schema node.
 * @public
 */
export const RENDER_MODE = {
    INLINE: "inline",
    DIALOG: "dialog"
} as const;

/**
 * One of the `RENDER_MODE` values: how a nested object or array is presented.
 * @public
 */
export type RenderModeType = typeof RENDER_MODE[keyof typeof RENDER_MODE];

/**
 * Standard JSON schema and MetaUI extended types.
 * @public
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

/**
 * One of the `SCHEMA_TYPE` values: a JSON Schema `type` MetaUI renders.
 * @public
 */
export type SchemaTypeType = typeof SCHEMA_TYPE[keyof typeof SCHEMA_TYPE];

/**
 * Common widget types injected into schema metadata.
 */
export const WIDGET_TYPE = {
    REFERENCE: "reference",
    DICTIONARY_MAP: "dictionaryMap",
    POLYMORPHIC: "polymorphic",
    DATE: "date",
    DATE_PICKER: "datePicker",
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
    VOICE_INPUT: "voiceInput",
    RICH_TEXT: "richText",
    URL_BUTTON: "urlButton",
    SUBMIT_BUTTON: "submitButton",
    CLEAR_BUTTON: "clearButton",
    ODATA_SELECT: "odataSelect",
    REMOTE_DROPDOWN: "remoteDropdown",
    REMOTE_SELECT: "remoteSelect",
    COMBOBOX: "combobox",
    LIVE_SEARCH: "liveSearch",
    REMOTE_VALUE_HELP: "remoteValueHelp",
    VALUE_HELP: "valueHelp"
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
    COMPONENTS_SCHEMAS: "#/components/schemas/",
    DEFS: "#/$defs/"
} as const;
