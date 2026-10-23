/**
 * @file SchemaDirectiveNormalizer.ts
 * @description Pure normalization helpers for MetaUI `ui` directives, `uiLayout` trees,
 * `uiPolicies` rules, `valueHelp`, `enum`, and `discriminator` blocks.
 */

import {
    FieldType, IUIDirective, IValidationRule, IValueHelp, IRemoteValueHelpConfig,
    IDataSourceConfig, ILayoutElement, IPolicy, IPolicyCondition, PolicyEffectType, IPropertyMetadata
} from "../interfaces/ISchema";
import {
    SCHEMA_TYPE,
    WIDGET_TYPE,
    RENDER_MODE,
    RenderModeType,
    MAX_LAYOUT_DEPTH
} from "../constants/MetaUIConstants";
import { DataInferenceBuilder } from "./DataInferenceBuilder";
import { SchemaWalker, LayoutElementShape } from "./SchemaWalker";
import { OpenApiRefResolver } from "../openapi/OpenApiRefResolver";
import { Logger } from "../utils/Logger";
import {
    JsonRecord, isRecord, readString, readNumber, readBoolean, readRecord, readStringArray, deepClone
} from "../utils/TypeGuards";

/** Structural element types allowed inside `uiLayout`. */
const LAYOUT_ELEMENT_TYPES: readonly ILayoutElement["type"][] = [
    "Group", "Control", "HorizontalLayout", "VerticalLayout", "WizardStep"
];

/** Effects understood by the PolicyEngine. */
const POLICY_EFFECTS: readonly PolicyEffectType[] = [
    "Require", "Hide", "Disable", "Invalidate", "Show", "Enable", "Validate", "Optional"
];

/** Render modes understood by the LayoutMutator. */
const RENDER_MODES: readonly string[] = Object.values(RENDER_MODE);
const FIELD_TYPES: readonly string[] = Object.values(SCHEMA_TYPE);

/**
 * Union of every property key in {@link IPropertyMetadata} and `ui.`-prefixed key in {@link IUIDirective}.
 * Used to type each producer's `DECLINED_SCHEMA_FIELDS` record so any unknown member key fails compilation.
 */
export type PropertySchemaMemberKey = keyof IPropertyMetadata | `ui.${keyof IUIDirective}`;

/**
 * Compile-time checked map of declined `IPropertyMetadata` / `IUIDirective` members to their justification strings.
 */
export type DeclinedSchemaFieldsMap = Partial<Readonly<Record<PropertySchemaMemberKey, string>>>;

/**
 * Shared contract implemented by the three `IPropertyMetadata` producer front-ends
 * (`SchemaNormalizer`, `OpenApiPropertyMapper`, and `DataInferenceBuilder`), modelled on
 * `PipelineManager`'s `extractRule` contract.
 */
export interface IPropertyProducerContract<TInput = unknown, TContext = unknown> {
    /** Canonical producer identifier. */
    readonly name: string;
    /** Explicit map of `IPropertyMetadata` and `IUIDirective` fields declined by this producer. */
    readonly declinedFields: DeclinedSchemaFieldsMap;
    /** Extracts a normalized `IPropertyMetadata` descriptor from a single raw property or value input. */
    extractPropertyMetadata(
        input: TInput,
        keyName: string,
        isRequired: boolean,
        context?: TContext
    ): IPropertyMetadata;
}

function isFieldType(value: unknown): value is FieldType {
    return typeof value === "string" && FIELD_TYPES.includes(value);
}

function isLayoutElementType(value: unknown): value is ILayoutElement["type"] {
    return typeof value === "string" && (LAYOUT_ELEMENT_TYPES as readonly string[]).includes(value);
}

function isPolicyEffect(value: unknown): value is PolicyEffectType {
    return typeof value === "string" && (POLICY_EFFECTS as readonly string[]).includes(value);
}

function isRenderMode(value: unknown): value is RenderModeType {
    return typeof value === "string" && RENDER_MODES.includes(value);
}

/**
 * Pure normalization methods for UI directives, layouts, policies, and value-help blocks.
 *
 * @namespace nz.co.siliconst.ui5.metaui.core
 * @public
 */
export class SchemaDirectiveNormalizer {
    /**
     * Resolves the canonical `FieldType`, raw type token, and nullability union flag from a raw property schema record.
     *
     * @param prop The raw property schema record.
     * @param keyName Optional property key for diagnostic logging.
     * @returns {{ type: FieldType; rawType: unknown; hasNullType: boolean }} Resolved schema type tuple.
     */
    public static resolveSchemaType(
        prop: JsonRecord,
        keyName?: string
    ): { type: FieldType; rawType: unknown; hasNullType: boolean } {
        const hasNullType = Array.isArray(prop.type) && prop.type.includes("null");
        const rawType = Array.isArray(prop.type) ? prop.type.find((t) => t !== "null") : prop.type;
        const mappedRawType = rawType === "file" ? SCHEMA_TYPE.STRING : rawType;
        if (mappedRawType !== undefined && !isFieldType(mappedRawType) && keyName) {
            Logger.warn(
                "[MetaUI SchemaNormalizer]",
                `Unsupported type '${String(rawType)}' on '${keyName}'; falling back to 'string'.`
            );
        }
        const inferredFallbackType: FieldType = isRecord(prop.items)
            ? SCHEMA_TYPE.ARRAY
            : isRecord(prop.properties) ||
              prop.additionalProperties !== undefined ||
              Array.isArray(prop.oneOf) ||
              Array.isArray(prop.anyOf) ||
              typeof prop.$ref === "string"
              ? SCHEMA_TYPE.OBJECT
              : SCHEMA_TYPE.STRING;
        const type: FieldType = isFieldType(mappedRawType) ? mappedRawType : inferredFallbackType;
        return { type, rawType, hasNullType };
    }

    /**
     * Maps a JSON Schema / OpenAPI `format` string to its canonical MetaUI `widget` and `ui.format`.
     *
     * @param formatStr The raw `format` string.
     * @returns {{ widget?: string; uiFormat?: string }} Mapped widget and normalized format string.
     */
    public static formatToWidget(formatStr?: string): { widget?: string; uiFormat?: string } {
        if (!formatStr) return {};
        switch (formatStr) {
            case "date":
                return { widget: WIDGET_TYPE.DATE, uiFormat: "date" };
            case "date-time":
            case "datetime":
                return { widget: WIDGET_TYPE.DATETIME, uiFormat: "date-time" };
            case "time":
                return { widget: WIDGET_TYPE.TIME, uiFormat: "time" };
            case "email":
                return { widget: WIDGET_TYPE.EMAIL, uiFormat: "email" };
            case "password":
                return { widget: WIDGET_TYPE.PASSWORD, uiFormat: "password" };
            case "uri":
            case "url":
                return { widget: WIDGET_TYPE.LINK, uiFormat: "url" };
            case "iban":
                return { uiFormat: "iban" };
            case "binary":
            case "byte":
                return { widget: WIDGET_TYPE.FILE_UPLOADER, uiFormat: formatStr };
            default:
                return { uiFormat: formatStr };
        }
    }

    /**
     * Normalizes the proprietary `ui` directive block.
     *
     * @param ui The raw `ui` block.
     * @param prop The owning raw property (used for `title`/`readOnly` fallbacks).
     * @param keyName The property key (used for the generated label).
     * @param type The resolved field type.
     * @param hasChoices True if the property declares `enum` or `valueHelp`.
     * @returns {IUIDirective} The normalized directive block.
     */
    public static normalizeUI(
        ui: JsonRecord,
        prop: JsonRecord,
        keyName: string,
        type: FieldType,
        hasChoices: boolean
    ): IUIDirective {
        const isPrimitive = type !== SCHEMA_TYPE.OBJECT && type !== SCHEMA_TYPE.ARRAY;
        const renderMode = ui.renderMode;
        const formatStr = readString(ui, "format") || readString(prop, "format");
        const explicitWidget = readString(ui, "widget");
        const isPolymorphic =
            Array.isArray(prop.oneOf) ||
            Array.isArray(prop.anyOf) ||
            isRecord(prop.discriminator) ||
            typeof prop.discriminator === "string";
        const formatMapping = this.formatToWidget(formatStr);

        let inferredWidget: string | undefined = explicitWidget;
        if (!inferredWidget) {
            if (isPolymorphic) inferredWidget = WIDGET_TYPE.POLYMORPHIC;
            else if (typeof prop.$ref === "string" && !isRecord(prop.properties)) inferredWidget = WIDGET_TYPE.REFERENCE;
            else if (isRecord(prop.additionalProperties)) inferredWidget = WIDGET_TYPE.DICTIONARY_MAP;
            else if (hasChoices && isPrimitive) inferredWidget = WIDGET_TYPE.SELECT;
            else if (hasChoices && type === SCHEMA_TYPE.ARRAY) inferredWidget = WIDGET_TYPE.MULTI_SELECT;
            else if (formatMapping.widget) inferredWidget = formatMapping.widget;
        }

        const rawValueHelp = ui.valueHelp ?? prop.valueHelp;
        const normalizedVh = this.normalizeValueHelp(rawValueHelp);
        const staticValueHelp = Array.isArray(normalizedVh) ? normalizedVh : undefined;
        const dataSource = this.normalizeDataSource(ui.dataSource, rawValueHelp);

        return {
            label:
                readString(ui, "label") ||
                readString(prop, "title") ||
                (keyName ? DataInferenceBuilder.generateLabel(keyName) : undefined),
            placeholder: readString(ui, "placeholder") ?? this.exampleAsPlaceholder(prop.example),
            isKey: readBoolean(ui, "isKey") ?? false,
            readOnly: readBoolean(ui, "readOnly") ?? readBoolean(prop, "readOnly") ?? false,
            widget: inferredWidget,
            visible: readBoolean(ui, "visible"),
            enabled: readBoolean(ui, "enabled"),
            visibleOn: readString(ui, "visibleOn"),
            enabledOn: readString(ui, "enabledOn"),
            format: formatStr,
            valueState: readString(ui, "valueState"),
            rows: readNumber(ui, "rows"),
            expandable: readBoolean(ui, "expandable"),
            fullWidth: readBoolean(ui, "fullWidth"),
            controlProps: isRecord(ui.controlProps) ? deepClone(ui.controlProps) : undefined,
            options: isRecord(ui.options) ? deepClone(ui.options) : undefined,
            valueHelp: staticValueHelp,
            dataSource,
            validators: this.normalizeValidators(ui.validators),
            formatter: readString(ui, "formatter"),
            formatters: readStringArray(ui, "formatters"),
            args: ui.args === undefined ? undefined : deepClone(ui.args),
            dialogButtonText: readString(ui, "dialogButtonText"),
            layoutBudget: readNumber(ui, "layoutBudget"),
            renderMode: isRenderMode(renderMode) ? renderMode : undefined,
            labelSpan: readNumber(ui, "labelSpan")
        };
    }

    /**
     * Renders a JSON Schema / OpenAPI `example` as the field's placeholder text.
     *
     * An `example` is the schema author's own illustration of a well-formed value, which is exactly what a
     * placeholder is for, so it fills in when no explicit `ui.placeholder` is given. Only scalars qualify:
     * an object or array example stringifies into noise, and `null` illustrates nothing.
     *
     * @param example The raw `example` value.
     * @returns {string | undefined} The placeholder text, or undefined when the example is not a scalar.
     */
    public static exampleAsPlaceholder(example: unknown): string | undefined {
        if (typeof example === "string") {
            return example || undefined;
        }
        if (typeof example === "number" || typeof example === "boolean") {
            return String(example);
        }
        return undefined;
    }

    /**
     * Normalizes an `IDataSourceConfig` block from either `ui.dataSource` or a remote `valueHelp` object.
     *
     * @param rawDataSource The raw `ui.dataSource` block.
     * @param rawValueHelp The fallback `valueHelp` block.
     * @returns {IDataSourceConfig | undefined} Normalized data source configuration.
     */
    public static normalizeDataSource(rawDataSource: unknown, rawValueHelp?: unknown): IDataSourceConfig | undefined {
        const src = isRecord(rawDataSource)
            ? rawDataSource
            : isRecord(rawValueHelp) && !Array.isArray(rawValueHelp)
              ? rawValueHelp
              : undefined;
        const url = src ? readString(src, "url") : undefined;
        if (!src || !url) return undefined;
        return {
            url,
            keyField: readString(src, "keyField") || readString(src, "keyPath") || "key",
            textField: readString(src, "textField") || readString(src, "textPath") || "text",
            dataPath: readString(src, "dataPath"),
            modelName: readString(src, "modelName")
        };
    }

    /**
     * Normalizes an array of validator rule declarations.
     *
     * @param raw The raw `ui.validators` value.
     * @returns {(string | IValidationRule)[] | undefined} Normalized validator list or undefined.
     */
    public static normalizeValidators(raw: unknown): (string | IValidationRule)[] | undefined {
        if (!Array.isArray(raw)) return undefined;
        const rules: (string | IValidationRule)[] = [];
        for (const entry of raw) {
            if (typeof entry === "string") {
                rules.push(entry);
            } else if (isRecord(entry) && typeof entry.name === "string") {
                rules.push({ name: entry.name, args: entry.args === undefined ? undefined : deepClone(entry.args) });
            } else {
                Logger.warn("[MetaUI SchemaNormalizer]", `Ignoring malformed validator entry: ${JSON.stringify(entry)}`);
            }
        }
        return rules;
    }

    /**
     * Normalizes a `valueHelp` static array or remote endpoint configuration.
     *
     * @param raw The raw `valueHelp` block.
     * @returns {IValueHelp[] | IRemoteValueHelpConfig | undefined} Normalized value help configuration.
     */
    public static normalizeValueHelp(raw: unknown): IValueHelp[] | IRemoteValueHelpConfig | undefined {
        if (Array.isArray(raw)) {
            return raw.filter(isRecord).map(
                (entry): IValueHelp => ({
                    key: String(entry.key ?? ""),
                    text: String(entry.text ?? entry.key ?? "")
                })
            );
        }
        if (isRecord(raw)) {
            const url = readString(raw, "url");
            if (url) {
                return {
                    url,
                    keyPath: readString(raw, "keyPath") || "key",
                    textPath: readString(raw, "textPath") || "text"
                };
            }
        }
        return undefined;
    }

    /**
     * Normalizes an `enum` array while preserving member primitive types (`string`, `number`, `boolean`, `null`)
     * and treating an empty `[]` array as absent (`undefined`).
     *
     * @param raw The raw `enum` array.
     * @returns {(string | number | boolean | null)[] | undefined} Normalized enum array.
     */
    public static normalizeEnum(raw: unknown): (string | number | boolean | null)[] | undefined {
        if (!Array.isArray(raw) || raw.length === 0) return undefined;
        const result: (string | number | boolean | null)[] = [];
        for (const item of raw) {
            if (typeof item === "string" || typeof item === "number" || typeof item === "boolean" || item === null) {
                result.push(item);
            } else if (item !== undefined) {
                result.push(String(item));
            }
        }
        return result.length > 0 ? result : undefined;
    }

    /**
     * Normalizes an OpenAPI 2.0 string or OpenAPI 3.0 object `discriminator` block.
     *
     * @param raw The raw `discriminator` string or object.
     * @returns {IPropertyMetadata["discriminator"]} Normalized discriminator descriptor.
     */
    public static normalizeDiscriminator(raw: unknown): IPropertyMetadata["discriminator"] {
        if (typeof raw === "string" && raw) {
            return { propertyName: raw };
        }
        if (!isRecord(raw)) return undefined;
        const propertyName = readString(raw, "propertyName");
        if (!propertyName) return undefined;
        const mappingRaw = readRecord(raw, "mapping");
        let mapping: Record<string, string> | undefined;
        if (mappingRaw) {
            mapping = {};
            for (const key of Object.keys(mappingRaw)) {
                const target = mappingRaw[key];
                if (typeof target === "string") mapping[key] = target;
            }
        }
        return { propertyName, mapping };
    }

    /**
     * Resolves and merges a `$ref` on a polymorphic (`oneOf`/`anyOf`/`allOf`) branch entry against `rootSchema`.
     *
     * @param entry The raw branch entry containing a `$ref`.
     * @param refPath The `$ref` pointer string.
     * @param rootSchema The root schema or OpenAPI document.
     * @returns {{ inlined: JsonRecord; refName: string } | null} The merged branch record and extracted ref name, or `null` if unresolvable.
     */
    public static inlinePolymorphicBranchRef(
        entry: JsonRecord,
        refPath: string,
        rootSchema: unknown
    ): { inlined: JsonRecord; refName: string } | null {
        const refName = OpenApiRefResolver.extractRefName(refPath);
        const resolved = OpenApiRefResolver.resolve(refPath, rootSchema);
        if (!isRecord(resolved)) {
            return null;
        }
        const inlined: JsonRecord = {
            ...resolved,
            ...entry,
            title: readString(entry, "title") || readString(resolved, "title") || refName
        };
        delete inlined.$ref;
        return { inlined, refName };
    }

    /**
     * Validates and clones a `uiLayout` tree. Unknown element types fail loudly because a silently
     * dropped layout node would make fields vanish from the screen.
     *
     * @param raw The raw layout array.
     * @returns {ILayoutElement[] | undefined} A validated deep copy, or undefined if absent.
     * @throws {Error} If an element declares an unsupported type.
     */
    public static normalizeLayout(raw: unknown): ILayoutElement[] | undefined {
        if (!Array.isArray(raw)) return undefined;
        const childrenStack: ILayoutElement[][] = [[]];
        SchemaWalker.walk<ILayoutElement>(
            raw,
            (ctx) => {
                const entry: JsonRecord = isRecord(ctx.node) ? ctx.node : {};
                if (!isLayoutElementType(entry.type)) {
                    const msg =
                        `uiLayout element #${ctx.key} has unsupported type '${String(entry.type)}'. ` +
                        `Allowed: ${LAYOUT_ELEMENT_TYPES.join(", ")}.`;
                    Logger.error("[MetaUI SchemaNormalizer]", msg);
                    throw new Error(msg);
                }
                if (Array.isArray(entry.elements)) {
                    childrenStack.push([]);
                    if (ctx.depth >= MAX_LAYOUT_DEPTH) {
                        Logger.warn(
                            "[MetaUI SchemaNormalizer]",
                            `uiLayout nesting exceeded MAX_LAYOUT_DEPTH (${MAX_LAYOUT_DEPTH}); truncating deeper layout elements.`
                        );
                        return "skip-subtree";
                    }
                    return undefined;
                }
                return "skip-subtree";
            },
            {
                shape: LayoutElementShape,
                silentTruncationLog: true,
                onLeave: (ctx) => {
                    const entry: JsonRecord = isRecord(ctx.node) ? ctx.node : {};
                    const childElements = Array.isArray(entry.elements) ? childrenStack.pop() : undefined;
                    if (isLayoutElementType(entry.type)) {
                        childrenStack[childrenStack.length - 1].push({
                            type: entry.type,
                            label: readString(entry, "label"),
                            scope: readString(entry, "scope"),
                            widget: readString(entry, "widget"),
                            elements: childElements
                        });
                    }
                },
                onInvalidProperty: (key, rawValue) => {
                    const msg =
                        `uiLayout element #${key} has unsupported type '${typeof rawValue}'. ` +
                        `Allowed: ${LAYOUT_ELEMENT_TYPES.join(", ")}.`;
                    Logger.error("[MetaUI SchemaNormalizer]", msg);
                    throw new Error(msg);
                },
                onTruncate: (scope, reason) => {
                    if (reason === "cycle") {
                        const index = scope.split("/").pop() ?? "0";
                        Logger.warn(
                            "[MetaUI SchemaNormalizer]",
                            `Circular uiLayout element reference detected at index #${index}; stopping recursion.`
                        );
                    }
                }
            }
        );
        return childrenStack[0];
    }

    /**
     * Validates and clones the `uiPolicies` array.
     *
     * @param raw The raw policy array.
     * @returns {IPolicy[] | undefined} A validated deep copy, or undefined if absent.
     * @throws {Error} If a policy declares an unsupported effect.
     */
    public static normalizePolicies(raw: unknown): IPolicy[] | undefined {
        if (!Array.isArray(raw)) return undefined;
        return raw.map((entry, index): IPolicy => {
            if (!isRecord(entry) || !isPolicyEffect(entry.effect)) {
                const effectDesc = isRecord(entry) ? String(entry.effect) : typeof entry;
                const msg =
                    `uiPolicies[${index}] has unsupported effect '${effectDesc}'. ` +
                    `Allowed: ${POLICY_EFFECTS.join(", ")}.`;
                Logger.error("[MetaUI SchemaNormalizer]", msg);
                throw new Error(msg);
            }
            const condition: IPolicyCondition = {};
            const rawCondition = readRecord(entry, "condition") || {};
            for (const operator of Object.keys(rawCondition)) {
                condition[operator] = deepClone(rawCondition[operator]);
            }
            return {
                effect: entry.effect,
                targets: readStringArray(entry, "targets") || [],
                condition,
                message: readString(entry, "message")
            };
        });
    }
}
