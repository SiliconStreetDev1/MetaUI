/**
 * @file PayloadValidator.ts
 * @description Headless recursive validator for nested object, array, reference, and dictionary payloads.
 */

import { IPropertyMetadata, ISchema } from "../interfaces/ISchema";
import { IPlugin, IPluginValidationResult } from "../interfaces/IPlugin";
import { PipelineManager } from "./PipelineManager";
import { isRecord } from "../utils/TypeGuards";

/**
 * Headless recursive validator for nested object, array, reference, and dictionary payloads.
 */
export class PayloadValidator {
    /**
     * Validates a value against a property's metadata and recursively validates any nested
     * object properties, dictionary entries, or array items.
     *
     * @param metadata The schema metadata for the property.
     * @param value The live value from the model.
     * @param resolveDefinition Optional resolver for `$ref` schema definitions.
     * @param depth Current recursion depth guard.
     * @returns Validation outcome with `isValid` and optional `errorMessage`.
     */
    public static validateTree(
        metadata: IPropertyMetadata,
        value: unknown,
        resolveDefinition?: (ref: string) => ISchema | null,
        depth: number = 0,
        isDynamicallyRequired?: boolean
    ): { isValid: boolean; errorMessage?: string } {
        if (depth > 16 || metadata.ui?.visible === false) {
            return { isValid: true };
        }

        let effectiveMeta: IPropertyMetadata = metadata;
        let resolvedRequiredList: string[] | undefined;
        if (metadata.$ref && resolveDefinition) {
            const resolved = resolveDefinition(metadata.$ref);
            if (resolved) {
                effectiveMeta = {
                    ...resolved,
                    ...metadata,
                    type: resolved.type || metadata.type || "object",
                    properties: resolved.properties || metadata.properties,
                    items: resolved.items || metadata.items
                };
                if (Array.isArray(resolved.required)) {
                    resolvedRequiredList = resolved.required;
                }
            }
        }

        // 1. Validate top-level constraints on this node (including required, const, enum, integer, min/maxProperties)
        const selfResult = PipelineManager.getInstance().runValidators(value, effectiveMeta, isDynamicallyRequired);
        if (!selfResult.isValid) {
            return selfResult;
        }

        if (value === undefined || value === null) {
            return { isValid: true };
        }

        // 2. Recursively validate object properties and dictionary entries
        if (effectiveMeta.type === "object" && isRecord(value)) {
            if (effectiveMeta.properties) {
                for (const [propKey, rawPropMeta] of Object.entries(effectiveMeta.properties)) {
                    if (rawPropMeta.ui?.visible === false) {
                        continue;
                    }
                    const propMeta: IPropertyMetadata =
                        resolvedRequiredList && resolvedRequiredList.includes(propKey) && rawPropMeta.required === undefined
                            ? { ...rawPropMeta, required: true }
                            : rawPropMeta;
                    const childResult = PayloadValidator.validateTree(
                        propMeta,
                        value[propKey],
                        resolveDefinition,
                        depth + 1
                    );
                    if (!childResult.isValid) {
                        const label = propMeta.ui?.label || propKey;
                        return {
                            isValid: false,
                            errorMessage: `${label}: ${childResult.errorMessage || "Invalid value"}`
                        };
                    }
                }
            }

            if (effectiveMeta.additionalProperties && typeof effectiveMeta.additionalProperties === "object") {
                const valueMeta = effectiveMeta.additionalProperties;
                for (const [entryKey, entryVal] of Object.entries(value)) {
                    if (effectiveMeta.properties && entryKey in effectiveMeta.properties) {
                        continue;
                    }
                    const entryResult = PayloadValidator.validateTree(
                        valueMeta,
                        entryVal,
                        resolveDefinition,
                        depth + 1
                    );
                    if (!entryResult.isValid) {
                        return {
                            isValid: false,
                            errorMessage: `${entryKey}: ${entryResult.errorMessage || "Invalid value"}`
                        };
                    }
                }
            }
        }

        // 3. Recursively validate array items
        if (effectiveMeta.type === "array" && Array.isArray(value) && effectiveMeta.items) {
            const itemMeta = effectiveMeta.items;
            for (let i = 0; i < value.length; i++) {
                const itemResult = PayloadValidator.validateTree(
                    itemMeta,
                    value[i],
                    resolveDefinition,
                    depth + 1
                );
                if (!itemResult.isValid) {
                    return {
                        isValid: false,
                        errorMessage: `Row ${i + 1}: ${itemResult.errorMessage || "Invalid item"}`
                    };
                }
            }
        }

        return { isValid: true };
    }

    /**
     * Recursively validates inline and root array/table payloads and missing object/array properties.
     *
     * @param schema The normalized schema node.
     * @param payload The current payload node.
     * @param currentPath The slash-separated property path.
     * @param getPluginByPath Lookup for active plugins registered in the Engine.
     * @param resolveDefinition Optional resolver for `$ref` definitions.
     * @param getDynamicRowRequired Optional lookup for dynamic `$row` policy `required` overrides.
     * @returns {IPluginValidationResult[]} Array of validation outcomes for array/table cells.
     */
    public static validatePayloadArrays(
        schema: ISchema,
        payload: unknown,
        currentPath: string,
        getPluginByPath: (path: string) => IPlugin | undefined,
        resolveDefinition?: (ref: string) => ISchema | null,
        getDynamicRowRequired?: (path: string) => boolean | undefined,
        isPathHidden?: (path: string) => boolean
    ): IPluginValidationResult[] {
        const errors: IPluginValidationResult[] = [];
        if (!schema || payload === null || payload === undefined || typeof payload !== "object") return errors;
        if (currentPath && (getPluginByPath(currentPath) || isPathHidden?.(currentPath))) return errors;
        if (schema.ui?.visible === false) return errors;

        const schemaRef = "$ref" in schema ? (schema as IPropertyMetadata).$ref : undefined;
        let effectiveSchema: ISchema = schema;
        if (schemaRef && resolveDefinition) {
            const resolved = resolveDefinition(schemaRef);
            if (resolved) {
                effectiveSchema = {
                    ...resolved,
                    ...schema,
                    type: resolved.type || schema.type || "object",
                    properties: resolved.properties || schema.properties,
                    items: resolved.items || schema.items
                };
            }
        }
        const parentRequiredList = Array.isArray(effectiveSchema.required) ? effectiveSchema.required : undefined;

        if (effectiveSchema.type === "object" && effectiveSchema.properties && isRecord(payload)) {
            for (const key of Object.keys(effectiveSchema.properties)) {
                const rawPropSchema = effectiveSchema.properties[key];
                const childPath = currentPath ? `${currentPath}/${key}` : key;
                if (rawPropSchema.ui?.visible === false || isPathHidden?.(childPath)) {
                    continue;
                }
                let propSchema: IPropertyMetadata = rawPropSchema;
                if (rawPropSchema.$ref && resolveDefinition) {
                    const resolvedProp = resolveDefinition(rawPropSchema.$ref);
                    if (resolvedProp) {
                        propSchema = {
                            ...resolvedProp,
                            ...rawPropSchema,
                            type: resolvedProp.type || rawPropSchema.type || "object",
                            properties: resolvedProp.properties || rawPropSchema.properties,
                            items: resolvedProp.items || rawPropSchema.items
                        };
                    }
                }
                const isPropRequired =
                    propSchema.required === true || Boolean(parentRequiredList && parentRequiredList.includes(key));
                if (isPropRequired && propSchema.required !== true) {
                    propSchema = { ...propSchema, required: true };
                }
                const childValue = payload[key];
                if (propSchema.type === "object" || propSchema.type === "array") {
                    if (childValue === undefined) {
                        if (!getPluginByPath(childPath)) {
                            const valToTest =
                                propSchema.type === "array" && (propSchema.minItems ?? 0) > 0 && !isPropRequired
                                    ? []
                                    : childValue;
                            const selfRes = PipelineManager.getInstance().assembleAndExecute(
                                propSchema,
                                valToTest,
                                isPropRequired
                            );
                            if (!selfRes.isValid) {
                                errors.push({
                                    isValid: false,
                                    errorMessage: selfRes.errorMessage,
                                    fieldKey: childPath,
                                    fieldLabel: propSchema.ui?.label || key
                                });
                            }
                        }
                    } else {
                        errors.push(
                            ...PayloadValidator.validatePayloadArrays(
                                propSchema as ISchema,
                                childValue,
                                childPath,
                                getPluginByPath,
                                resolveDefinition,
                                getDynamicRowRequired,
                                isPathHidden
                            )
                        );
                    }
                }
            }
        } else if (
            effectiveSchema.type === "array" &&
            (Array.isArray(payload) || (!currentPath && isRecord(payload) && Array.isArray(payload.items)))
        ) {
            const targetArray: unknown[] = Array.isArray(payload)
                ? payload
                : ((payload as Record<string, unknown>).items as unknown[]);
            const arrayPathPrefix = Array.isArray(payload) ? currentPath : "items";
            const constraintTargetPath = currentPath || "items";
            const arrayRes = PipelineManager.getInstance().assembleAndExecute(
                effectiveSchema as IPropertyMetadata,
                targetArray
            );
            if (!arrayRes.isValid) {
                const fieldLabel = effectiveSchema.ui?.label || effectiveSchema.title || constraintTargetPath;
                errors.push({ isValid: false, errorMessage: arrayRes.errorMessage, fieldKey: constraintTargetPath, fieldLabel });
            } else {
                errors.push({ isValid: true, fieldKey: constraintTargetPath });
            }
            if (effectiveSchema.items) {
                const rawItems = effectiveSchema.items;
                const resolvedItems = rawItems.$ref ? resolveDefinition?.(rawItems.$ref) || rawItems : rawItems;
                const reqArray = Array.isArray(resolvedItems?.required) ? resolvedItems.required : undefined;
                targetArray.forEach((item: unknown, index: number) => {
                    const itemPath = arrayPathPrefix ? `${arrayPathPrefix}/${index}` : `${index}`;
                    if (resolvedItems && resolvedItems.type === "object" && resolvedItems.properties) {
                        const rowRecord = isRecord(item) ? item : {};
                        for (const key of Object.keys(resolvedItems.properties)) {
                            const rawPropMeta = resolvedItems.properties[key];
                            const propPath = `${itemPath}/${key}`;
                            if (rawPropMeta.ui?.visible === false || isPathHidden?.(propPath)) {
                                errors.push({ isValid: true, fieldKey: propPath });
                                continue;
                            }
                            const dynReq = getDynamicRowRequired?.(propPath);
                            const isReq =
                                dynReq !== undefined
                                    ? dynReq
                                    : rawPropMeta.required === true || Boolean(reqArray && reqArray.includes(key));
                            const propMeta: IPropertyMetadata = { ...rawPropMeta, required: isReq };
                            const isComplexCell =
                                propMeta.type === "object" ||
                                propMeta.type === "array" ||
                                Boolean(propMeta.$ref) ||
                                isRecord(propMeta.additionalProperties);
                            const res = isComplexCell
                                ? PayloadValidator.validateTree(propMeta, rowRecord[key], resolveDefinition, 0, isReq)
                                : PipelineManager.getInstance().assembleAndExecute(propMeta, rowRecord[key], isReq);
                            const fieldLabel = propMeta.ui?.label || key;
                            errors.push(
                                res.isValid
                                    ? { isValid: true, fieldKey: propPath }
                                    : { isValid: false, errorMessage: res.errorMessage, fieldKey: propPath, fieldLabel }
                            );
                        }
                    } else if (resolvedItems) {
                        const itemMeta = resolvedItems as IPropertyMetadata;
                        if (itemMeta.ui?.visible === false || isPathHidden?.(itemPath)) {
                            errors.push({ isValid: true, fieldKey: itemPath });
                            return;
                        }
                        const res = PipelineManager.getInstance().assembleAndExecute(itemMeta, item);
                        const fieldLabel = itemMeta.ui?.label || itemPath;
                        errors.push(
                            res.isValid
                                ? { isValid: true, fieldKey: itemPath }
                                : { isValid: false, errorMessage: res.errorMessage, fieldKey: itemPath, fieldLabel }
                        );
                    }
                });
            }
        }
        return errors;
    }
}
