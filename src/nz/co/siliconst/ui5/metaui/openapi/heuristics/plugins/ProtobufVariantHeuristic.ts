/**
 * @file ProtobufVariantHeuristic.ts
 * @description Scans OpenAPI 2.0 schemas for implicitly polymorphic Protobuf variant structures
 * (objects containing purely optional `*_value` fields) and mutates them into `oneOf` unions.
 */

import { IHeuristicPlugin } from "../interfaces/IHeuristicPlugin";
import { OpenApiParserFactory } from "../../OpenApiParserFactory";
import { JsonRecord, isRecord, readString, readRecord, readStringArray } from "../../../utils/TypeGuards";

/**
 * Heuristic plugin that detects Protobuf-style Variant representations (objects with exclusively optional `*_value` fields)
 * and transforms the AST into a standard `oneOf` polymorphic array before it reaches the OpenAPI parsers.
 *
 * @namespace nz.co.siliconst.ui5.metaui.openapi.heuristics.plugins
 * @public
 */
export class ProtobufVariantHeuristic implements IHeuristicPlugin {
    /**
     * Executes the heuristic scan against the OpenAPI 2.0 `definitions` dictionary.
     *
     * @param openApiRoot The OpenAPI root document.
     */
    public apply(openApiRoot: unknown): void {
        if (!isRecord(openApiRoot)) {
            return;
        }
        const definitions = readRecord(openApiRoot, "definitions");
        if (OpenApiParserFactory.detectSpecVersion(openApiRoot) === "2.0" && definitions) {
            this.scanDefinitions(definitions);
        }
    }

    /**
     * Iterates over all root-level definitions to detect and mutate variant structures.
     *
     * @param definitions The raw OpenAPI 2.0 `definitions` dictionary.
     */
    private scanDefinitions(definitions: JsonRecord): void {
        for (const [key, definition] of Object.entries(definitions)) {
            if (isRecord(definition) && this.isProtobufVariant(key, definition)) {
                this.mutateToOneOf(definition);
            }
        }
    }

    /**
     * Evaluates a schema block against the heuristic signature of a Protobuf Variant.
     *
     * @param key The schema definition name.
     * @param definition The structural definition block.
     * @returns {boolean} True if the structure matches a Protobuf variant pattern.
     */
    private isProtobufVariant(key: string, definition: JsonRecord): boolean {
        if (Array.isArray(definition.oneOf)) {
            return false;
        }
        const properties = readRecord(definition, "properties");
        if (readString(definition, "type") !== "object" || !properties) {
            return false;
        }

        const requiredFields = readStringArray(definition, "required");
        if (requiredFields && requiredFields.length > 0) {
            return false;
        }

        const propKeys = Object.keys(properties);
        if (propKeys.length < 2) {
            return false;
        }

        const allEndWithValue = propKeys.every((k) => k.endsWith("_value"));
        return allEndWithValue && (key.endsWith("Value") || key.endsWith("Variant"));
    }

    /**
     * Mutates the definition in-place by synthesizing a `oneOf` array from its optional `*_value` properties
     * and removing the flat `properties` map so polymorphic rendering takes precedence.
     *
     * @param definition The target variant object schema.
     */
    private mutateToOneOf(definition: JsonRecord): void {
        const properties = readRecord(definition, "properties") || {};
        const oneOfArray: JsonRecord[] = [];

        for (const propKey of Object.keys(properties)) {
            const variantSchema = readRecord(properties, propKey) || {};
            oneOfArray.push({
                type: "object",
                properties: {
                    [propKey]: variantSchema
                },
                required: [propKey],
                title: readString(variantSchema, "title") || readString(variantSchema, "description") || propKey
            });
        }

        definition.oneOf = oneOfArray;
        delete definition.properties;
    }
}
