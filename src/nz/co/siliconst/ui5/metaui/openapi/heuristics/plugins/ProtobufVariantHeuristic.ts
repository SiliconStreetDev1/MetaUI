/**
 * @file ProtobufVariantHeuristic.ts
 * @description Scans OpenAPI 2.0 schemas for implicitly polymorphic structures (e.g., objects containing purely optional, mutually exclusive fields) and explicitly mutates them into `oneOf` structures.
 */

import { IHeuristicPlugin } from "../interfaces/IHeuristicPlugin";

/**
 * Heuristic plugin that detects Protobuf-style Variant representations (objects with exclusively optional *_value fields)
 * and mutates the AST to a proper oneOf polymorphic array before it reaches the parsers.
 * 
 * @public
 */
export class ProtobufVariantHeuristic implements IHeuristicPlugin {
    /**
     * Executes the heuristic logic against the OpenAPI AST.
     * Initiates a scan of the global definitions block if the document matches the OpenAPI 2.0 specification.
     * 
     * @param {any} openApiRoot The entire OpenAPI root document.
     */
    public apply(openApiRoot: unknown): void {
        if (!openApiRoot) return;

        // In OpenAPI 2.0, scan definitions
        if (openApiRoot.swagger === "2.0" && openApiRoot.definitions) {
            this._scanDefinitions(openApiRoot.definitions);
        }
    }

    /**
     * Iterates over all root-level definitions to detect and mutate variant structures.
     * 
     * @param {Record<string, any>} definitions The raw OpenAPI 2.0 definitions dictionary.
     * @private
     */
    private _scanDefinitions(definitions: Record<string, any>): void {
        for (const [key, definition] of Object.entries(definitions)) {
            // Heuristic 1: If the object name ends with "Value" and has multiple optional properties 
            // that end with "_value" (common Protobuf JSON representation for variants)
            if (this._isProtobufVariant(key, definition)) {
                this._mutateToOneOf(definition);
            }
        }
    }

    /**
     * Evaluates a schema block against the heuristic signature of a Protobuf Variant.
     * 
     * @param {string} key The schema definition name.
     * @param {any} definition The structural definition block.
     * @returns {boolean} True if the structure matches a Protobuf variant pattern.
     * @private
     */
    private _isProtobufVariant(key: string, definition: unknown): boolean {
        if (definition.type !== "object" || !definition.properties) {
            return false;
        }

        // Must not have required fields if it's a pure union
        if (definition.required && definition.required.length > 0) {
            return false;
        }

        const propKeys = Object.keys(definition.properties);
        if (propKeys.length < 2) {
            return false;
        }

        // Check if all properties end with "_value" (e.g. bool_value, list_value)
        const allEndWithValue = propKeys.every(k => k.endsWith("_value"));
        if (allEndWithValue && (key.endsWith("Value") || key.endsWith("Variant"))) {
            return true;
        }

        return false;
    }

    /**
     * Mutates the AST in-place by synthesizing a `oneOf` array from the optional properties
     * and strictly purging the original object layout to force polymorphic evaluation.
     * 
     * @param {any} definition The target variant object schema.
     * @private
     */
    private _mutateToOneOf(definition: unknown): void {
        const propKeys = Object.keys(definition.properties);
        const oneOfArray: unknown[] = [];

        for (const propKey of propKeys) {
            const variantSchema = definition.properties[propKey];
            
            // Reconstruct a sub-object for each variant, enforcing strict requirement of the single variant property
            const syntheticVariant = {
                type: "object",
                properties: {
                    [propKey]: variantSchema
                },
                required: [propKey],
                title: variantSchema.description || propKey
            };
            
            oneOfArray.push(syntheticVariant);
        }

        // Mutate the original definition to become a oneOf root
        definition.oneOf = oneOfArray;
        
        // CRITICAL DESTRUCTIVE MUTATION:
        // We delete the original properties block. If this is not done, the core engine's layout
        // orchestrator will attempt to render both a standard static form AND the polymorphic switcher simultaneously.
        delete definition.properties;
    }
}
