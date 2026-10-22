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
import { WIDGET_TYPE } from "../../constants/MetaUIConstants";
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
 * Translates OpenAPI 2.0 and 3.0 property definitions into normalized MetaUI `IPropertyMetadata` descriptors.
 *
 * @namespace nz.co.siliconst.ui5.metaui.openapi.parsers
 * @public
 */
export class OpenApiPropertyMapper {
    private static readonly MAX_MAPPING_DEPTH = 8;

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
        const normalizedProps: Record<string, IPropertyMetadata> = {};
        if (depth > this.MAX_MAPPING_DEPTH) {
            Logger.warn(
                `Nested schema exceeded MAX_MAPPING_DEPTH (${this.MAX_MAPPING_DEPTH}); ` +
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
            // made MAX_MAPPING_DEPTH bite at half its stated value.
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
        if (depth > this.MAX_MAPPING_DEPTH) {
            // The descriptor below is a placeholder, not a mapping: the real type and every
            // constraint on this property are discarded. Say so rather than letting a field
            // silently render as an empty object.
            Logger.warn(
                `Property '${keyName}' exceeded MAX_MAPPING_DEPTH (${this.MAX_MAPPING_DEPTH}); ` +
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

        const enumValues = SchemaDirectiveNormalizer.normalizeEnum(currentProp.enum);
        if (enumValues) {
            metaProp.enum = enumValues;
            metaProp.valueHelp = enumValues.map((val) => ({ key: String(val), text: String(val) }));
            metaProp.ui = { ...(metaProp.ui || {}), widget: WIDGET_TYPE.SELECT, valueHelp: metaProp.valueHelp };
        }

        this.applyPolymorphism(metaProp, currentProp, openApiRoot, depth, activeRefs);
        this.applyNestedTypes(metaProp, currentProp, openApiRoot, depth, type, activeRefs);

        return metaProp;
    }

    private static resolveReference(
        currentProp: JsonRecord,
        keyName: string,
        isRequired: boolean,
        openApiRoot: unknown,
        depth: number,
        activeRefs: Set<string>
    ): IPropertyMetadata | null {
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
        if (!isRecord(rawItem)) {
            return this.mapPropertyMetadata({}, fallbackName, false, openApiRoot, depth, activeRefs);
        }
        const refPath = readString(rawItem, "$ref");
        if (refPath && !activeRefs.has(refPath)) {
            const refName = OpenApiRefResolver.extractRefName(refPath);
            const resolved = OpenApiRefResolver.resolve(refPath, openApiRoot);
            if (isRecord(resolved)) {
                const inlined: JsonRecord = {
                    ...resolved,
                    ...rawItem,
                    title: readString(rawItem, "title") || readString(resolved, "title") || refName
                };
                delete inlined.$ref;
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
        if (type === "object") {
            const rawProps = readRecord(currentProp, "properties");
            if (rawProps) {
                const childRequired = readStringArray(currentProp, "required") || [];
                metaProp.properties = this.mapProperties(rawProps, childRequired, openApiRoot, depth + 1, activeRefs);
            }

            if (currentProp.additionalProperties === true) {
                metaProp.additionalProperties = true;
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
