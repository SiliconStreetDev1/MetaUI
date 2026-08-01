/**
 * @file OpenApiPropertyMapper.ts
 * @description Extracts and maps OpenAPI properties into MetaUI IPropertyMetadata.
 */

import { IPropertyMetadata } from "../../interfaces/ISchema";
import { OpenApiRefResolver } from "../OpenApiRefResolver";
import { OpenApiTypeMapper } from "../OpenApiTypeMapper";
import { OpenApiUIMapper } from "../OpenApiUIMapper";
import { FieldType } from "../../interfaces/ISchema";

/**
 * Utility class responsible for extracting and mapping OpenAPI properties into the native MetaUI IPropertyMetadata schema format.
 * 
 * @public
 */
export class OpenApiPropertyMapper {
    /**
     * Recursively traverses and translates an OpenAPI properties block into a MetaUI IPropertyMetadata dictionary.
     * 
     * @param {unknown} properties The OpenAPI properties block.
     * @param {string[]} requiredKeys Array of required property keys.
     * @param {unknown} openApiRoot The OpenAPI root document for resolving references.
     * @param {"2.0" | "3.0"} version The OpenAPI version.
     * @param {number} [depth=0] Recursion depth limiter to prevent stack overflows on circular refs.
     * @returns {Record<string, IPropertyMetadata>} The normalized MetaUI properties mapping.
     */
    public static mapProperties(
        properties: unknown, 
        requiredKeys: string[], 
        openApiRoot: unknown, 
        version: "2.0" | "3.0", 
        depth: number = 0
    ): Record<string, IPropertyMetadata> {
        const normalizedProps: Record<string, IPropertyMetadata> = {};
        
        if (depth > 8) return normalizedProps;
        const props = (properties || {}) as Record<string, unknown>;

        for (const key of Object.keys(props)) {
            const isRequired = requiredKeys.includes(key);
            let propDef = props[key] as Record<string, unknown>;

            if (propDef.$ref) {
                const resolved = OpenApiRefResolver.resolve(propDef.$ref as string, openApiRoot) as Record<string, unknown>;
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
     * @param {unknown} swaggerProp The specific OpenAPI property schema to map.
     * @param {string} keyName The key/name of this property.
     * @param {boolean} isRequired Whether this property is strictly required.
     * @param {unknown} openApiRoot The OpenAPI root document for resolving references.
     * @param {"2.0" | "3.0"} version The OpenAPI version.
     * @param {number} [depth=0] Recursion depth limiter.
     * @returns {IPropertyMetadata} The normalized MetaUI property metadata.
     */
    public static mapPropertyMetadata(
        swaggerProp: unknown, 
        keyName: string, 
        isRequired: boolean, 
        openApiRoot: unknown, 
        version: "2.0" | "3.0", 
        depth: number = 0
    ): IPropertyMetadata {
        let currentProp = swaggerProp as Record<string, unknown>;

        // 1. Resolve References
        const refResult = this._resolveReference(currentProp, keyName, isRequired, openApiRoot, version, depth);
        if (refResult) {
            return refResult;
        }

        // 2. Resolve Composition (allOf)
        currentProp = this._resolveAllOf(currentProp, openApiRoot) as Record<string, unknown>;

        // 3. Base Initialization
        const type = OpenApiTypeMapper.mapType(currentProp.type as string);
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

    private static _resolveReference(
        currentProp: Record<string, unknown>, 
        keyName: string, 
        isRequired: boolean, 
        openApiRoot: unknown, 
        version: "2.0" | "3.0", 
        depth: number
    ): IPropertyMetadata | null {
        if (!currentProp.$ref) {
            return null;
        }

        const resolved = OpenApiRefResolver.resolve(currentProp.$ref as string, openApiRoot) as Record<string, unknown>;
        const resolvedType = currentProp.type || (resolved && resolved.type);
        
        if (resolvedType && ["string", "number", "integer", "boolean"].includes(resolvedType as string)) {
            const inlineProp = { ...resolved, ...currentProp };
            delete inlineProp.$ref;
            return this.mapPropertyMetadata(inlineProp, keyName, isRequired, openApiRoot, version, depth + 1);
        }

        return {
            type: "object",
            $ref: currentProp.$ref as string,
            required: isRequired,
            ui: { widget: "reference" }
        };
    }

    private static _resolveAllOf(currentProp: Record<string, unknown>, openApiRoot: unknown): unknown {
        if (!Array.isArray(currentProp.allOf)) {
            return currentProp;
        }
        
        let merged = { ...currentProp };
        delete merged.allOf;
        for (const subSchema of currentProp.allOf) {
            let resolvedSub = subSchema as Record<string, unknown>;
            if (subSchema.$ref) {
                resolvedSub = (OpenApiRefResolver.resolve(subSchema.$ref as string, openApiRoot) as Record<string, unknown>) || {};
            }
            merged = this.deepMergeSchemas(merged, resolvedSub) as Record<string, unknown>;
        }
        return merged;
    }

    private static _applyConstraints(metaProp: IPropertyMetadata, currentProp: Record<string, unknown>, version: "2.0" | "3.0"): void {
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
                metaProp.exclusiveMaximum = currentProp.exclusiveMaximum as boolean;
            }
            if (typeof currentProp.exclusiveMinimum === "number" || typeof currentProp.exclusiveMinimum === "boolean") {
                metaProp.exclusiveMinimum = currentProp.exclusiveMinimum as boolean;
            }
        }
    }

    private static _applyStateModifiers(metaProp: IPropertyMetadata, currentProp: Record<string, unknown>): void {
        if (currentProp.readOnly === true) metaProp.readOnly = true;
        if (currentProp.writeOnly === true) metaProp.writeOnly = true;
        if (currentProp.nullable === true) metaProp.nullable = true;
        if (currentProp.deprecated === true) metaProp.deprecated = true;
    }

    private static _applyPolymorphism(
        metaProp: IPropertyMetadata, 
        currentProp: Record<string, unknown>, 
        openApiRoot: unknown, 
        version: "2.0" | "3.0", 
        depth: number
    ): void {
        if (currentProp.discriminator) {
            if (version === "2.0" && typeof currentProp.discriminator === "string") {
                metaProp.discriminator = { propertyName: currentProp.discriminator };
            } else if (version === "3.0" && typeof currentProp.discriminator === "object") {
                const disc = currentProp.discriminator as Record<string, unknown>;
                metaProp.discriminator = {
                    propertyName: disc.propertyName as string,
                    mapping: disc.mapping as Record<string, string>
                };
            }
        }

        if (Array.isArray(currentProp.oneOf)) {
            metaProp.oneOf = [];
            for (let i = 0; i < currentProp.oneOf.length; i++) {
                metaProp.oneOf.push(this.mapPropertyMetadata(currentProp.oneOf[i], `Variant${i}`, false, openApiRoot, version, depth + 1));
            }
            if (!metaProp.ui) metaProp.ui = {};
            metaProp.ui.widget = "polymorphic";
        }
        
        if (Array.isArray(currentProp.anyOf)) {
            metaProp.anyOf = [];
            for (let i = 0; i < currentProp.anyOf.length; i++) {
                metaProp.anyOf.push(this.mapPropertyMetadata(currentProp.anyOf[i], `AnyVariant${i}`, false, openApiRoot, version, depth + 1));
            }
        }

        if (currentProp.not) {
            metaProp.not = this.mapPropertyMetadata(currentProp.not, `NotVariant`, false, openApiRoot, version, depth + 1);
        }
    }

    private static _applyNestedTypes(
        metaProp: IPropertyMetadata, 
        currentProp: Record<string, unknown>, 
        openApiRoot: unknown, 
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

    public static deepMergeSchemas(target: unknown, source: unknown): unknown {
        const outTarget = (target || {}) as Record<string, unknown>;
        const output: Record<string, unknown> = Object.assign({}, outTarget);
        if (source === null || typeof source !== "object") return output;
        
        const srcObj = source as Record<string, unknown>;

        Object.keys(srcObj).forEach(key => {
            if (Array.isArray(srcObj[key])) {
                output[key] = Array.isArray(outTarget[key]) 
                    ? Array.from(new Set([...(outTarget[key] as unknown[]), ...(srcObj[key] as unknown[])])) 
                    : [...(srcObj[key] as unknown[])];
            } else if (typeof srcObj[key] === "object" && srcObj[key] !== null) {
                if (outTarget[key] && typeof outTarget[key] === "object") {
                    output[key] = this.deepMergeSchemas(outTarget[key], srcObj[key]);
                } else {
                    output[key] = Object.assign({}, srcObj[key]);
                }
            } else {
                output[key] = srcObj[key];
            }
        });
        return output;
    }
}
