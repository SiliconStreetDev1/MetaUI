/**
 * @file OpenApiPropertyMapper.ts
 * @description Extracts and maps OpenAPI properties into MetaUI IPropertyMetadata using strict type guards.
 */

import { IPropertyMetadata } from "../../interfaces/ISchema";
import { OpenApiRefResolver } from "../OpenApiRefResolver";
import { OpenApiUIMapper } from "../OpenApiUIMapper";
import { OpenApiConstraintMapper } from "./OpenApiConstraintMapper";
import { DataInferenceBuilder } from "../../core/DataInferenceBuilder";
import { SchemaDirectiveNormalizer } from "../../core/SchemaDirectiveNormalizer";
import { WIDGET_TYPE, MAX_SCHEMA_DEPTH } from "../../constants/MetaUIConstants";
import { Logger } from "../../utils/Logger";
import {
    JsonRecord,
    isRecord,
    readString,
    readBoolean,
    readRecord,
    readStringArray
} from "../../utils/TypeGuards";

/**
 * Members of `IPropertyMetadata` and `IUIDirective` that the OpenAPI producer
 * (`OpenApiPropertyMapper` + `OpenApiConstraintMapper` + `OpenApiUIMapper`) deliberately does not write.
 *
 * Bare keys name `IPropertyMetadata` members; `ui.`-prefixed keys name `IUIDirective` members.
 * Every member must either be written by one of those three classes or appear here with a reason,
 * or the `[PRODUCER_COMPLETENESS]` gate in `scripts/run-tests.js` fails the build.
 *
 * OpenApiUIMapper.build writes exactly the subset an OpenAPI document expresses by itself: label
 * (from title), readOnly, widget and format. Every other `ui` directive is author-supplied and is
 * carried verbatim by the `Object.assign(ui, swaggerProp.ui)` pass-through, then normalized by
 * `SchemaDirectiveNormalizer.normalizeUI` -- every OpenAPI result is re-normalized, because
 * `GenerationDelegate.prepareSchemaAndData` feeds the builder output into `SchemaNormalizer.normalize`.
 * Normalizing them twice here would duplicate that logic, which is the divergence this gate prevents.
 * The gate separately asserts the Object.assign pass-through still exists, because these declines
 * depend on it.
 */
export const DECLINED_SCHEMA_FIELDS: Readonly<Record<string, string>> = {
    allOf:
        "OpenApiConstraintMapper.resolveAllOf merges every branch into the parent before mapping, so each " +
            "branch's properties and constraints already appear on the parent; the unmerged branches have no " +
            "remaining consumer (PluginRegistry.getPathsToLoad reaches the same plugin set through the merged properties).",

    "ui.isKey":
        "Author-supplied directive: OpenApiUIMapper carries it verbatim via Object.assign(ui, swaggerProp.ui), and " +
            "SchemaDirectiveNormalizer.normalizeUI normalizes it downstream.",
    "ui.visible":
        "Author-supplied directive: OpenApiUIMapper carries it verbatim via Object.assign(ui, swaggerProp.ui), and " +
            "SchemaDirectiveNormalizer.normalizeUI normalizes it downstream.",
    "ui.enabled":
        "Author-supplied directive: OpenApiUIMapper carries it verbatim via Object.assign(ui, swaggerProp.ui), and " +
            "SchemaDirectiveNormalizer.normalizeUI normalizes it downstream.",
    "ui.visibleOn":
        "Author-supplied directive: OpenApiUIMapper carries it verbatim via Object.assign(ui, swaggerProp.ui), and " +
            "SchemaDirectiveNormalizer.normalizeUI normalizes it downstream.",
    "ui.enabledOn":
        "Author-supplied directive: OpenApiUIMapper carries it verbatim via Object.assign(ui, swaggerProp.ui), and " +
            "SchemaDirectiveNormalizer.normalizeUI normalizes it downstream.",
    "ui.valueState":
        "Author-supplied directive: OpenApiUIMapper carries it verbatim via Object.assign(ui, swaggerProp.ui), and " +
            "SchemaDirectiveNormalizer.normalizeUI normalizes it downstream.",
    "ui.rows":
        "Author-supplied directive: OpenApiUIMapper carries it verbatim via Object.assign(ui, swaggerProp.ui), and " +
            "SchemaDirectiveNormalizer.normalizeUI normalizes it downstream.",
    "ui.expandable":
        "Author-supplied directive: OpenApiUIMapper carries it verbatim via Object.assign(ui, swaggerProp.ui), and " +
            "SchemaDirectiveNormalizer.normalizeUI normalizes it downstream.",
    "ui.fullWidth":
        "Author-supplied directive: OpenApiUIMapper carries it verbatim via Object.assign(ui, swaggerProp.ui), and " +
            "SchemaDirectiveNormalizer.normalizeUI normalizes it downstream.",
    "ui.controlProps":
        "Author-supplied directive: OpenApiUIMapper carries it verbatim via Object.assign(ui, swaggerProp.ui), and " +
            "SchemaDirectiveNormalizer.normalizeUI normalizes it downstream.",
    "ui.options":
        "Author-supplied directive: OpenApiUIMapper carries it verbatim via Object.assign(ui, swaggerProp.ui), and " +
            "SchemaDirectiveNormalizer.normalizeUI normalizes it downstream.",
    "ui.dataSource":
        "Author-supplied directive: OpenApiUIMapper carries it verbatim via Object.assign(ui, swaggerProp.ui), and " +
            "SchemaDirectiveNormalizer.normalizeUI normalizes it downstream.",
    "ui.validators":
        "Author-supplied directive: OpenApiUIMapper carries it verbatim via Object.assign(ui, swaggerProp.ui), and " +
            "SchemaDirectiveNormalizer.normalizeUI normalizes it downstream.",
    "ui.formatter":
        "Author-supplied directive: OpenApiUIMapper carries it verbatim via Object.assign(ui, swaggerProp.ui), and " +
            "SchemaDirectiveNormalizer.normalizeUI normalizes it downstream.",
    "ui.formatters":
        "Author-supplied directive: OpenApiUIMapper carries it verbatim via Object.assign(ui, swaggerProp.ui), and " +
            "SchemaDirectiveNormalizer.normalizeUI normalizes it downstream.",
    "ui.args":
        "Author-supplied directive: OpenApiUIMapper carries it verbatim via Object.assign(ui, swaggerProp.ui), and " +
            "SchemaDirectiveNormalizer.normalizeUI normalizes it downstream.",
    "ui.dialogButtonText":
        "Author-supplied directive: OpenApiUIMapper carries it verbatim via Object.assign(ui, swaggerProp.ui), and " +
            "SchemaDirectiveNormalizer.normalizeUI normalizes it downstream.",
    "ui.layoutBudget":
        "Author-supplied directive carried verbatim by OpenApiUIMapper's Object.assign; LayoutScorer also sets it from the measured " +
            "footprint after normalization, so this producer must not guess at one.",
    "ui.renderMode":
        "Author-supplied directive carried verbatim by OpenApiUIMapper's Object.assign; LayoutScorer decides inline vs dialog from " +
            "the measured footprint after normalization, so a value written here would be overwritten or would pre-empt the scorer.",
    "ui.labelSpan":
        "Author-supplied directive: OpenApiUIMapper carries it verbatim via Object.assign(ui, swaggerProp.ui), and " +
            "SchemaDirectiveNormalizer.normalizeUI normalizes it downstream.",
};

/**
 * Translates OpenAPI 2.0 and 3.0 property definitions into normalized MetaUI `IPropertyMetadata` descriptors.
 *
 * @namespace nz.co.siliconst.ui5.metaui.openapi.parsers
 * @public
 */
export class OpenApiPropertyMapper {

    /**
     * Recursively translates an OpenAPI `properties` block into a MetaUI `IPropertyMetadata` dictionary.
     *
     * @param properties The OpenAPI `properties` record.
     * @param requiredKeys Array of required property keys from the parent object.
     * @param openApiRoot The OpenAPI root document for resolving `$ref` pointers.
     * @param depth Current recursion depth to prevent stack overflows on circular references.
     * @param activeRefs Set of active `$ref` strings on the recursion stack.
     * @returns {Record<string, IPropertyMetadata>} The normalized MetaUI property dictionary.
     */
    public static mapProperties(
        properties: unknown,
        requiredKeys: string[],
        openApiRoot: unknown,
        depth: number = 0,
        activeRefs: Set<string> = new Set()
    ): Record<string, IPropertyMetadata> {
        // WALKER_EXEMPT: OpenApiPropertyMapper.mapProperties is the bottom-up OpenAPI IPropertyMetadata producer dictionary loop audited by [PRODUCER_COMPLETENESS].
        const normalizedProps: Record<string, IPropertyMetadata> = {};
        if (depth > MAX_SCHEMA_DEPTH) {
            Logger.warn(
                `Nested schema exceeded MAX_SCHEMA_DEPTH (${MAX_SCHEMA_DEPTH}); ` +
                `${isRecord(properties) ? Object.keys(properties).length : 0} propert(ies) were dropped.`,
                undefined,
                "OpenApiPropertyMapper"
            );
            return normalizedProps;
        }
        if (!isRecord(properties)) {
            return normalizedProps;
        }

        for (const key of Object.keys(properties)) {
            const isRequired = requiredKeys.includes(key);
            const rawProp = properties[key];
            const propDef: JsonRecord = isRecord(rawProp) ? rawProp : {};

            // Not depth + 1: mapProperties and mapPropertyMetadata are the two halves of a
            // single nesting level (mapProperties -> mapPropertyMetadata -> applyNestedTypes
            // -> mapProperties). Incrementing in both halves charged two units per level and
            // made MAX_SCHEMA_DEPTH bite at half its stated value.
            normalizedProps[key] = this.mapPropertyMetadata(
                propDef,
                key,
                isRequired,
                openApiRoot,
                depth,
                activeRefs
            );
        }

        return normalizedProps;
    }

    /**
     * Translates a single OpenAPI property schema block into a MetaUI `IPropertyMetadata` descriptor.
     *
     * @param swaggerProp The raw OpenAPI property schema to map.
     * @param keyName The property key name.
     * @param isRequired Whether this property is mandatory on its parent object.
     * @param openApiRoot The OpenAPI root document for resolving `$ref` pointers.
     * @param depth Current recursion depth.
     * @param activeRefs Set of active `$ref` strings on the recursion stack.
     * @returns {IPropertyMetadata} The normalized MetaUI property metadata.
     */
    public static mapPropertyMetadata(
        swaggerProp: unknown,
        keyName: string,
        isRequired: boolean,
        openApiRoot: unknown,
        depth: number = 0,
        activeRefs: Set<string> = new Set()
    ): IPropertyMetadata {
        // WALKER_EXEMPT: OpenApiPropertyMapper.mapPropertyMetadata is the bottom-up OpenAPI IPropertyMetadata producer audited directly by [PRODUCER_COMPLETENESS].
        if (depth > MAX_SCHEMA_DEPTH) {
            // The descriptor below is a placeholder, not a mapping: the real type and every
            // constraint on this property are discarded. Say so rather than letting a field
            // silently render as an empty object.
            Logger.warn(
                `Property '${keyName}' exceeded MAX_SCHEMA_DEPTH (${MAX_SCHEMA_DEPTH}); ` +
                `its type and constraints were not mapped.`,
                undefined,
                "OpenApiPropertyMapper"
            );
            return {
                type: "object",
                ui: { label: DataInferenceBuilder.generateLabel(keyName) }
            };
        }
        let currentProp: JsonRecord = isRecord(swaggerProp) ? swaggerProp : {};

        const refResult = this.resolveReference(currentProp, keyName, isRequired, openApiRoot, depth, activeRefs);
        if (refResult) {
            return refResult;
        }

        currentProp = OpenApiConstraintMapper.resolveAllOf(currentProp, openApiRoot, 0, activeRefs);

        const { type } = SchemaDirectiveNormalizer.resolveSchemaType(currentProp);
        const metaProp: IPropertyMetadata = {
            type,
            title: readString(currentProp, "title"),
            description: readString(currentProp, "description"),
            format: readString(currentProp, "format"),
            required: isRequired
        };

        const uiDirective = OpenApiUIMapper.build(currentProp, keyName);
        if (Object.keys(uiDirective).length > 0) {
            metaProp.ui = uiDirective;
        }

        OpenApiConstraintMapper.applyConstraints(metaProp, currentProp);
        OpenApiConstraintMapper.applyStateModifiers(metaProp, currentProp);

        // A MetaUI 'uiLayout' block authored inside an OpenAPI property schema was dropped here,
        // so the layout silently vanished for OpenAPI sources while surviving for JSON Schema.
        // Found by [PRODUCER_COMPLETENESS]. Validation is shared with SchemaNormalizer and is
        // deliberately loud: an unknown element type throws rather than hiding a field.
        const mappedLayout = SchemaDirectiveNormalizer.normalizeLayout(currentProp.uiLayout);
        if (mappedLayout) {
            metaProp.uiLayout = mappedLayout;
        }

        const enumValues = SchemaDirectiveNormalizer.normalizeEnum(currentProp.enum);
        if (enumValues) {
            metaProp.enum = enumValues;
            metaProp.valueHelp = enumValues.map((val) => ({ key: String(val), text: String(val) }));
            metaProp.ui = { ...(metaProp.ui || {}), widget: WIDGET_TYPE.SELECT, valueHelp: metaProp.valueHelp };
        } else if (Array.isArray(currentProp.enum)) {
            this.applyUnsatisfiableEnum(metaProp, keyName);
        }

        this.applyPolymorphism(metaProp, currentProp, openApiRoot, depth, activeRefs);
        this.applyNestedTypes(metaProp, currentProp, openApiRoot, depth, type, activeRefs);

        return metaProp;
    }

    /**
     * Renders a property whose `enum` admits no value at all — normally the result of an `allOf` composition
     * whose branches declare disjoint enums. Dropping the empty list would turn an unsatisfiable field into a
     * free-text input, so the field is published as an empty, disabled select and the contradiction is logged.
     */
    private static applyUnsatisfiableEnum(metaProp: IPropertyMetadata, keyName: string): void {
        Logger.error(
            `Property '${keyName}' has an empty 'enum': no value satisfies it. ` +
            `Rendering it as a disabled, empty selection rather than as unconstrained free text.`,
            undefined,
            "OpenApiPropertyMapper"
        );
        metaProp.enum = [];
        metaProp.valueHelp = [];
        metaProp.ui = { ...(metaProp.ui || {}), widget: WIDGET_TYPE.SELECT, valueHelp: [], enabled: false };
    }

    private static resolveReference(
        currentProp: JsonRecord,
        keyName: string,
        isRequired: boolean,
        openApiRoot: unknown,
        depth: number,
        activeRefs: Set<string>
    ): IPropertyMetadata | null {
        // WALKER_EXEMPT: Mutually-recursive helper of OpenApiPropertyMapper.mapPropertyMetadata for raw OpenAPI $ref ingestion audited by [PRODUCER_COMPLETENESS].
        const refPath = readString(currentProp, "$ref");
        if (!refPath) {
            return null;
        }

        const uiDirective = OpenApiUIMapper.build(currentProp, keyName);
        if (activeRefs.has(refPath)) {
            return {
                type: "object",
                $ref: refPath,
                title: readString(currentProp, "title"),
                description: readString(currentProp, "description"),
                required: isRequired,
                nullable: readBoolean(currentProp, "nullable"),
                readOnly: readBoolean(currentProp, "readOnly"),
                ui: { ...uiDirective, widget: WIDGET_TYPE.REFERENCE }
            };
        }

        const resolvedRaw = OpenApiRefResolver.resolve(refPath, openApiRoot);
        const resolved = isRecord(resolvedRaw) ? resolvedRaw : undefined;
        const resolvedType = readString(currentProp, "type") || (resolved ? readString(resolved, "type") : undefined);
        const isPolymorphicRef =
            resolved !== undefined &&
            (Array.isArray(resolved.oneOf) || Array.isArray(resolved.anyOf) || resolved.discriminator !== undefined);

        if (
            (resolvedType && ["string", "number", "integer", "boolean"].includes(resolvedType)) ||
            isPolymorphicRef ||
            keyName === "items"
        ) {
            const inlineProp: JsonRecord = { ...(resolved || {}), ...currentProp };
            delete inlineProp.$ref;
            const nextRefs = new Set(activeRefs);
            nextRefs.add(refPath);
            const mapped = this.mapPropertyMetadata(inlineProp, keyName, isRequired, openApiRoot, depth + 1, nextRefs);
            if (keyName === "items") {
                mapped.$ref = refPath;
            }
            return mapped;
        }

        return {
            type: "object",
            $ref: refPath,
            title: readString(currentProp, "title") || (resolved ? readString(resolved, "title") : undefined),
            description: readString(currentProp, "description") || (resolved ? readString(resolved, "description") : undefined),
            required: isRequired,
            nullable: readBoolean(currentProp, "nullable"),
            readOnly: readBoolean(currentProp, "readOnly"),
            ui: { ...uiDirective, widget: WIDGET_TYPE.REFERENCE }
        };
    }

    private static applyPolymorphism(
        metaProp: IPropertyMetadata,
        currentProp: JsonRecord,
        openApiRoot: unknown,
        depth: number,
        activeRefs: Set<string>
    ): void {
        // WALKER_EXEMPT: Mutually-recursive helper of OpenApiPropertyMapper.mapPropertyMetadata for raw OpenAPI oneOf/anyOf/not ingestion audited by [PRODUCER_COMPLETENESS].
        OpenApiConstraintMapper.applyDiscriminator(metaProp, currentProp);

        if (Array.isArray(currentProp.oneOf)) {
            metaProp.oneOf = currentProp.oneOf.map((item, i) =>
                this.mapPolymorphicBranch(item, `Variant${i}`, openApiRoot, depth + 1, activeRefs)
            );
        }

        if (Array.isArray(currentProp.anyOf)) {
            metaProp.anyOf = currentProp.anyOf.map((item, i) =>
                this.mapPolymorphicBranch(item, `AnyVariant${i}`, openApiRoot, depth + 1, activeRefs)
            );
        }

        if (isRecord(currentProp.not)) {
            metaProp.not = this.mapPropertyMetadata(currentProp.not, "NotVariant", false, openApiRoot, depth + 1, activeRefs);
        }

        if (metaProp.oneOf || metaProp.anyOf || metaProp.discriminator) {
            metaProp.ui = { ...(metaProp.ui || {}), widget: WIDGET_TYPE.POLYMORPHIC };
        }
    }

    private static mapPolymorphicBranch(
        rawItem: unknown,
        fallbackName: string,
        openApiRoot: unknown,
        depth: number,
        activeRefs: Set<string>
    ): IPropertyMetadata {
        // WALKER_EXEMPT: Mutually-recursive helper of OpenApiPropertyMapper.mapPropertyMetadata for raw OpenAPI polymorphic branch ingestion audited by [PRODUCER_COMPLETENESS].
        if (!isRecord(rawItem)) {
            return this.mapPropertyMetadata({}, fallbackName, false, openApiRoot, depth, activeRefs);
        }
        const refPath = readString(rawItem, "$ref");
        if (refPath && !activeRefs.has(refPath)) {
            const resolvedBranch = SchemaDirectiveNormalizer.inlinePolymorphicBranchRef(rawItem, refPath, openApiRoot);
            if (resolvedBranch) {
                const { inlined, refName } = resolvedBranch;
                const nextRefs = new Set(activeRefs);
                nextRefs.add(refPath);
                const mapped = this.mapPropertyMetadata(inlined, refName, false, openApiRoot, depth, nextRefs);
                mapped.$ref = refPath;
                mapped.title = readString(inlined, "title") || refName;
                const resolvedReq = readStringArray(inlined, "required");
                if (resolvedReq) {
                    mapped.required = resolvedReq;
                }
                return mapped;
            }
        }
        const explicitTitle = readString(rawItem, "title");
        const mapped = this.mapPropertyMetadata(rawItem, explicitTitle || "", false, openApiRoot, depth, activeRefs);
        if (!explicitTitle && mapped.ui && !mapped.ui.label) {
            delete mapped.ui.label;
        }
        const branchReq = readStringArray(rawItem, "required");
        if (branchReq) {
            mapped.required = branchReq;
        }
        return mapped;
    }

    private static applyNestedTypes(
        metaProp: IPropertyMetadata,
        currentProp: JsonRecord,
        openApiRoot: unknown,
        depth: number,
        type: string,
        activeRefs: Set<string>
    ): void {
        // WALKER_EXEMPT: Mutually-recursive helper of OpenApiPropertyMapper.mapPropertyMetadata for raw OpenAPI nested object/array/dictionary ingestion audited by [PRODUCER_COMPLETENESS].
        if (type === "object") {
            const rawProps = readRecord(currentProp, "properties");
            if (rawProps) {
                const childRequired = readStringArray(currentProp, "required") || [];
                metaProp.properties = this.mapProperties(rawProps, childRequired, openApiRoot, depth + 1, activeRefs);
            }

            if (currentProp.additionalProperties === true) {
                metaProp.additionalProperties = true;
            } else if (currentProp.additionalProperties === false) {
                // A closed object. Carried through verbatim: DataInferenceBuilder.mergeHybridProperties
                // keys off `=== false` to stop inferred keys leaking into it.
                metaProp.additionalProperties = false;
            } else if (isRecord(currentProp.additionalProperties)) {
                metaProp.additionalProperties = this.mapPropertyMetadata(
                    currentProp.additionalProperties,
                    "value",
                    false,
                    openApiRoot,
                    depth + 1,
                    activeRefs
                );
                metaProp.ui = { ...(metaProp.ui || {}), widget: WIDGET_TYPE.DICTIONARY_MAP };
            }

            if (
                !rawProps &&
                !currentProp.additionalProperties &&
                !metaProp.oneOf &&
                !metaProp.anyOf &&
                !metaProp.enum &&
                !metaProp.format &&
                !metaProp.ui?.widget
            ) {
                metaProp.ui = { ...(metaProp.ui || {}), widget: WIDGET_TYPE.CODE_EDITOR };
            }
        } else if (type === "array" && isRecord(currentProp.items)) {
            metaProp.items = this.mapPropertyMetadata(currentProp.items, "items", false, openApiRoot, depth + 1, activeRefs);
            if (metaProp.items.type !== "object") {
                const itemEnum = metaProp.items.enum;
                metaProp.ui = {
                    ...(metaProp.ui || {}),
                    widget: itemEnum && itemEnum.length > 0 ? WIDGET_TYPE.MULTI_SELECT : WIDGET_TYPE.MULTI_INPUT
                };
            }
        }
    }
}
