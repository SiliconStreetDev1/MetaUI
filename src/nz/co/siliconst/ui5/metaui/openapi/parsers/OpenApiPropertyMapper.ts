/**
 * @file OpenApiPropertyMapper.ts
 * @description Extracts and maps OpenAPI properties into MetaUI IPropertyMetadata.
 */

import { IPropertyMetadata } from "../../interfaces/ISchema";
import { OpenApiRefResolver } from "../OpenApiRefResolver";
import { OpenApiTypeMapper } from "../OpenApiTypeMapper";
import { OpenApiUIMapper } from "../OpenApiUIMapper";

/**
 * Utility class responsible for extracting and mapping OpenAPI properties into the native MetaUI IPropertyMetadata schema format.
 * 
 * @public
 */
export class OpenApiPropertyMapper {
    /**
     * Recursively traverses and translates an OpenAPI properties block into a MetaUI IPropertyMetadata dictionary.
     * 
     * @param {any} properties The OpenAPI properties block.
     * @param {string[]} requiredKeys Array of required property keys.
     * @param {any} openApiRoot The OpenAPI root document for resolving references.
     * @param {"2.0" | "3.0"} version The OpenAPI version.
     * @param {number} [depth=0] Recursion depth limiter to prevent stack overflows on circular refs.
     * @returns {Record<string, IPropertyMetadata>} The normalized MetaUI properties mapping.
     */
    public static mapProperties(
        properties: any, 
        requiredKeys: string[], 
        openApiRoot: any, 
        version: "2.0" | "3.0", 
        depth: number = 0
    ): Record<string, IPropertyMetadata> {
        const normalizedProps: Record<string, IPropertyMetadata> = {};
        
        if (depth > 8) return normalizedProps;

        for (const key of Object.keys(properties)) {
            const isRequired = requiredKeys.includes(key);
            let propDef = properties[key];

            if (propDef.$ref) {
                const resolved = OpenApiRefResolver.resolve(propDef.$ref, openApiRoot);
                if (resolved) {
                    propDef = { ...resolved, ...propDef };
                }
            }

            normalizedProps[key] = this.mapPropertyMetadata(propDef, key, isRequired, openApiRoot, version, depth + 1);
        }
        
        return normalizedProps;
    }

    /**
     * Translates a single OpenAPI property schema block into a MetaUI IPropertyMetadata block.
     * Delegates specific mapping tasks to focused private methods to adhere to SRP.
     * 
     * @param {any} swaggerProp The specific OpenAPI property schema to map.
     * @param {string} keyName The key/name of this property.
     * @param {boolean} isRequired Whether this property is strictly required.
     * @param {any} openApiRoot The OpenAPI root document for resolving references.
     * @param {"2.0" | "3.0"} version The OpenAPI version.
     * @param {number} [depth=0] Recursion depth limiter.
     * @returns {IPropertyMetadata} The normalized MetaUI property metadata.
     */
    public static mapPropertyMetadata(
        swaggerProp: any, 
        keyName: string, 
        isRequired: boolean, 
        openApiRoot: any, 
        version: "2.0" | "3.0", 
        depth: number = 0
    ): IPropertyMetadata {
        let currentProp = swaggerProp as any;

        // 1. Resolve References
        const refResult = this._resolveReference(currentProp, keyName, isRequired, openApiRoot, version, depth);
        if (refResult) {
            return refResult;
        }

        // 2. Resolve Composition (allOf)
        currentProp = this._resolveAllOf(currentProp, openApiRoot);

        // 3. Base Initialization
        const type = OpenApiTypeMapper.mapType(currentProp.type);
        const metaProp: IPropertyMetadata = {
            type: type,
            required: isRequired
        };

        // 4. UI Directive Binding
        const uiDirective = OpenApiUIMapper.build(currentProp, keyName);
        if (Object.keys(uiDirective).length > 0) {
            metaProp.ui = uiDirective;
        }

        // 5. Constraints & State Modifiers
        this._applyConstraints(metaProp, currentProp, version);
        this._applyStateModifiers(metaProp, currentProp);

        if (currentProp.default !== undefined) {
            metaProp.default = currentProp.default;
        }

        if (Array.isArray(currentProp.enum)) {
            metaProp.enum = currentProp.enum;
            if (!metaProp.ui) metaProp.ui = {};
            metaProp.ui.widget = "dropdown";
        }

        // 6. Polymorphism & Nesting
        this._applyPolymorphism(metaProp, currentProp, openApiRoot, version, depth);
        this._applyNestedTypes(metaProp, currentProp, openApiRoot, version, depth, type);

        return metaProp;
    }

    /**
     * Attempts to resolve a $ref block. If it resolves to a primitive, it inlines it.
     * Otherwise, it returns a reference widget payload.
     * 
     * @param {any} currentProp The current schema property definition.
     * @param {string} keyName The structural key name.
     * @param {boolean} isRequired Whether the property is strictly required.
     * @param {any} openApiRoot The root API definition for relative resolution.
     * @param {"2.0" | "3.0"} version The structural version context.
     * @param {number} depth The recursive resolution depth.
     * @returns {IPropertyMetadata | null} Resolved metadata, or null if no reference exists.
     * @private
     */
    private static _resolveReference(
        currentProp: any, 
        keyName: string, 
        isRequired: boolean, 
        openApiRoot: any, 
        version: "2.0" | "3.0", 
        depth: number
    ): IPropertyMetadata | null {
        if (!currentProp.$ref) {
            return null;
        }

        const resolved = OpenApiRefResolver.resolve(currentProp.$ref, openApiRoot);
        const resolvedType = currentProp.type || (resolved && (resolved as any).type);
        
        if (resolvedType && ["string", "number", "integer", "boolean"].includes(resolvedType)) {
            const inlineProp = { ...(resolved as any), ...currentProp };
            delete inlineProp.$ref;
            return this.mapPropertyMetadata(inlineProp, keyName, isRequired, openApiRoot, version, depth + 1);
        }

        return {
            type: "object",
            $ref: currentProp.$ref,
            required: isRequired,
            ui: { widget: "reference" }
        };
    }

    /**
     * Evaluates and merges 'allOf' arrays into a unified schema definition.
     * 
     * @param {any} currentProp The structural property definition containing potential aggregations.
     * @param {any} openApiRoot The base schema for deep resolution.
     * @returns {any} A flattened and merged schema entity.
     * @private
     */
    private static _resolveAllOf(currentProp: any, openApiRoot: any): unknown {
        if (!Array.isArray(currentProp.allOf)) {
            return currentProp;
        }
        
        let merged = { ...currentProp };
        delete merged.allOf;
        for (const subSchema of currentProp.allOf) {
            let resolvedSub = subSchema;
            if (subSchema.$ref) {
                resolvedSub = OpenApiRefResolver.resolve(subSchema.$ref, openApiRoot) || {};
            }
            merged = this.deepMergeSchemas(merged, resolvedSub);
        }
        return merged;
    }

    /**
     * Extracts structural constraints (min/max, regex, etc.) and maps them natively to the output metadata.
     * 
     * @param {IPropertyMetadata} metaProp The target metadata definition block.
     * @param {any} currentProp The source OpenAPI schema chunk.
     * @param {"2.0" | "3.0"} version The version, utilized for nuanced boundary matching.
     * @private
     */
    private static _applyConstraints(metaProp: IPropertyMetadata, currentProp: any, version: "2.0" | "3.0"): void {
        // String Constraints
        if (typeof currentProp.maxLength === "number") metaProp.maxLength = currentProp.maxLength;
        if (typeof currentProp.minLength === "number") metaProp.minLength = currentProp.minLength;
        if (typeof currentProp.pattern === "string") metaProp.pattern = currentProp.pattern;

        // Numeric Constraints
        if (typeof currentProp.maximum === "number") metaProp.maximum = currentProp.maximum;
        if (typeof currentProp.minimum === "number") metaProp.minimum = currentProp.minimum;
        if (typeof currentProp.multipleOf === "number") metaProp.multipleOf = currentProp.multipleOf;
        
        // Array Constraints
        if (typeof currentProp.maxItems === "number") metaProp.maxItems = currentProp.maxItems;
        if (typeof currentProp.minItems === "number") metaProp.minItems = currentProp.minItems;
        if (typeof currentProp.uniqueItems === "boolean") metaProp.uniqueItems = currentProp.uniqueItems;

        // Object Constraints
        if (typeof currentProp.maxProperties === "number") metaProp.maxProperties = currentProp.maxProperties;
        if (typeof currentProp.minProperties === "number") metaProp.minProperties = currentProp.minProperties;

        // Exclusive Min/Max version-specific logic
        if (version === "2.0") {
            if (currentProp.exclusiveMaximum === true && typeof currentProp.maximum === "number") {
                metaProp.exclusiveMaximum = true;
            }
            if (currentProp.exclusiveMinimum === true && typeof currentProp.minimum === "number") {
                metaProp.exclusiveMinimum = true;
            }
        } else if (version === "3.0") {
            if (typeof currentProp.exclusiveMaximum === "number" || typeof currentProp.exclusiveMaximum === "boolean") {
                metaProp.exclusiveMaximum = currentProp.exclusiveMaximum;
            }
            if (typeof currentProp.exclusiveMinimum === "number" || typeof currentProp.exclusiveMinimum === "boolean") {
                metaProp.exclusiveMinimum = currentProp.exclusiveMinimum;
            }
        }
    }

    /**
     * Extracts operational state flags like readOnly or nullable mapping them onto the internal specification.
     * 
     * @param {IPropertyMetadata} metaProp Target native specification.
     * @param {any} currentProp Source raw schema payload.
     * @private
     */
    private static _applyStateModifiers(metaProp: IPropertyMetadata, currentProp: any): void {
        if (currentProp.readOnly === true) metaProp.readOnly = true;
        if (currentProp.writeOnly === true) metaProp.writeOnly = true;
        if (currentProp.nullable === true) metaProp.nullable = true;
        if (currentProp.deprecated === true) metaProp.deprecated = true;
    }

    /**
     * Extracts and maps polymorphic discriminator and union types (oneOf/anyOf) to MetaUI structural directives.
     * 
     * @param {IPropertyMetadata} metaProp Native MetaUI definition tree.
     * @param {any} currentProp Raw schema block.
     * @param {any} openApiRoot Master OpenAPI root.
     * @param {"2.0" | "3.0"} version Protocol version identifier.
     * @param {number} depth Internal depth tracker.
     * @private
     */
    private static _applyPolymorphism(
        metaProp: IPropertyMetadata, 
        currentProp: any, 
        openApiRoot: any, 
        version: "2.0" | "3.0", 
        depth: number
    ): void {
        // Discriminator handling
        if (currentProp.discriminator) {
            if (version === "2.0" && typeof currentProp.discriminator === "string") {
                metaProp.discriminator = { propertyName: currentProp.discriminator };
            } else if (version === "3.0" && typeof currentProp.discriminator === "object") {
                metaProp.discriminator = {
                    propertyName: currentProp.discriminator.propertyName,
                    mapping: currentProp.discriminator.mapping
                };
            }
        }

        // Handle oneOf polymorphic mapping
        if (Array.isArray(currentProp.oneOf)) {
            metaProp.oneOf = [];
            for (let i = 0; i < currentProp.oneOf.length; i++) {
                metaProp.oneOf.push(this.mapPropertyMetadata(currentProp.oneOf[i], `Variant${i}`, false, openApiRoot, version, depth + 1));
            }
            if (!metaProp.ui) metaProp.ui = {};
            metaProp.ui.widget = "polymorphic";
        }
        
        // Handle anyOf mapping
        if (Array.isArray(currentProp.anyOf)) {
            metaProp.anyOf = [];
            for (let i = 0; i < currentProp.anyOf.length; i++) {
                metaProp.anyOf.push(this.mapPropertyMetadata(currentProp.anyOf[i], `AnyVariant${i}`, false, openApiRoot, version, depth + 1));
            }
        }

        // Handle not mapping
        if (currentProp.not) {
            metaProp.not = this.mapPropertyMetadata(currentProp.not, `NotVariant`, false, openApiRoot, version, depth + 1);
        }
    }

    /**
     * Recursively traverses into nested objects and arrays constructing the structural node trees.
     * 
     * @param {IPropertyMetadata} metaProp The localized destination structure.
     * @param {any} currentProp The source chunk representing a complex element.
     * @param {any} openApiRoot The OpenAPI dictionary context.
     * @param {"2.0" | "3.0"} version System schema version.
     * @param {number} depth Invocation stack depth.
     * @param {string} type Normalized atomic structure type.
     * @private
     */
    private static _applyNestedTypes(
        metaProp: IPropertyMetadata, 
        currentProp: any, 
        openApiRoot: any, 
        version: "2.0" | "3.0", 
        depth: number,
        type: string
    ): void {
        if (type === "object") {
            if (currentProp.properties) {
                const childRequired = Array.isArray(currentProp.required) ? currentProp.required : [];
                metaProp.properties = this.mapProperties(currentProp.properties, childRequired, openApiRoot, version, depth + 1);
            }
            
            if (currentProp.additionalProperties) {
                if (currentProp.additionalProperties === true) {
                    metaProp.additionalProperties = true;
                } else if (typeof currentProp.additionalProperties === "object") {
                    metaProp.additionalProperties = this.mapPropertyMetadata(currentProp.additionalProperties, "value", false, openApiRoot, version, depth + 1);
                    if (!metaProp.ui) metaProp.ui = {};
                    metaProp.ui.widget = "dictionary";
                }
            }
            
            // Opaque JSON object definition mapping
            if (!currentProp.properties && !currentProp.additionalProperties) {
                if (!metaProp.ui) metaProp.ui = {};
                metaProp.ui.widget = "codeEditor";
            }
        } else if (type === "array" && currentProp.items) {
            metaProp.items = this.mapPropertyMetadata(currentProp.items, "items", false, openApiRoot, version, depth + 1);
            if (metaProp.items.type !== "object") {
                if (!metaProp.ui) metaProp.ui = {};
                metaProp.ui.widget = "multiInput";
            }
        }
    }

    /**
     * Recursively deep-merges two OpenAPI objects, ensuring array boundaries and nested structures are preserved.
     * 
     * @param {any} target The target base object.
     * @param {any} source The source object providing override details.
     * @returns {any} The synthesized output object.
     */
    public static deepMergeSchemas(target: any, source: any): any {
        const output: any = Object.assign({}, target);
        if (source === null || typeof source !== "object") return output;

        Object.keys(source).forEach(key => {
            if (Array.isArray(source[key])) {
                output[key] = Array.isArray(target[key]) 
                    ? Array.from(new Set([...target[key], ...source[key]])) 
                    : [...source[key]];
            } else if (typeof source[key] === "object" && source[key] !== null) {
                if (target[key] && typeof target[key] === "object") {
                    output[key] = this.deepMergeSchemas(target[key], source[key]);
                } else {
                    output[key] = Object.assign({}, source[key]);
                }
            } else {
                output[key] = source[key];
            }
        });
        return output;
    }
}
