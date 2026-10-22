/**
 * @file PolymorphicUtil.ts
 * @description Pure specification-driven utilities for resolving JSON Schema and OpenAPI 2.0/3.0
 * polymorphic variants (`oneOf`, `anyOf`, `discriminator`, and `$ref` branches) and detecting
 * the active variant from a runtime data object.
 */

import { IPropertyMetadata, ISchema } from "../interfaces/ISchema";
import { WIDGET_TYPE } from "../constants/MetaUIConstants";
import { OpenApiRefResolver } from "../openapi/OpenApiRefResolver";
import { deepClone, isRecord, readString } from "./TypeGuards";
import JSONModel from "sap/ui/model/json/JSONModel";

/**
 * Resolved descriptor for a single `oneOf` or `anyOf` polymorphic branch.
 *
 * @namespace nz.co.siliconst.ui5.metaui.utils
 * @public
 */
export interface IPolymorphicVariant {
    /** Unique variant key (discriminator value, `$ref` schema name, or branch key). */
    readonly key: string;
    /** Human-readable title displayed in the variant selector dropdown. */
    readonly title: string;
    /** Merged map of child property metadata for this variant branch. */
    readonly properties: Record<string, IPropertyMetadata>;
}

/**
 * Stateless helper methods for `PolymorphicPlugin`.
 *
 * @namespace nz.co.siliconst.ui5.metaui.utils
 * @public
 */
export class PolymorphicUtil {
    /**
     * Extracts normalized variant descriptors from `metadata.oneOf` or `metadata.anyOf`,
     * resolving `$ref` pointers against `definitions` and propagating branch-level `required` arrays.
     * Falls back to synthesizing a variant from `metadata.properties` when `oneOf`/`anyOf` are absent.
     *
     * @param metadata The polymorphic property metadata.
     * @param definitions Optional global `$ref` definitions dictionary.
     * @returns {IPolymorphicVariant[]} Array of resolved variants.
     */
    public static extractVariants(
        metadata: IPropertyMetadata,
        definitions?: Record<string, ISchema>
    ): IPolymorphicVariant[] {
        const rawList = metadata.oneOf || metadata.anyOf || [];
        const discProp = metadata.discriminator?.propertyName;
        const discMapping = metadata.discriminator?.mapping;
        const baseProps = metadata.properties || {};
        const result: IPolymorphicVariant[] = [];

        const usedKeys = new Set<string>();

        rawList.forEach((branch, idx) => {
            let resolvedBranch: IPropertyMetadata = deepClone(branch);
            let refName: string | undefined;

            if (branch.$ref) {
                refName = OpenApiRefResolver.extractRefName(branch.$ref);
                const defSchema = definitions?.[refName];
                if (defSchema) {
                    resolvedBranch = {
                        ...resolvedBranch,
                        title: branch.title || defSchema.title || refName,
                        required: Array.isArray(defSchema.required) ? defSchema.required : resolvedBranch.required,
                        properties: {
                            ...(defSchema.properties ? deepClone(defSchema.properties) : {}),
                            ...(resolvedBranch.properties || {})
                        }
                    };
                }
            }

            const mergedProps: Record<string, IPropertyMetadata> = {
                ...deepClone(baseProps),
                ...(resolvedBranch.properties || {})
            };

            if (Array.isArray(resolvedBranch.required)) {
                for (const reqKey of resolvedBranch.required) {
                    if (mergedProps[reqKey]) {
                        mergedProps[reqKey] = { ...mergedProps[reqKey], required: true };
                    }
                }
            }

            let key = this.resolveDiscriminatorKey(discProp, discMapping, branch.$ref, refName, resolvedBranch, mergedProps, idx);
            if (usedKeys.has(key)) {
                key = `${key}_${idx + 1}`;
            }
            usedKeys.add(key);
            const title = resolvedBranch.title || resolvedBranch.ui?.label || refName || `Variant ${idx + 1}`;
            result.push({ key, title, properties: mergedProps });
        });

        if (result.length === 0 && Object.keys(baseProps).length > 0) {
            result.push({
                key: "default",
                title: metadata.ui?.label || metadata.title || "Default",
                properties: deepClone(baseProps)
            });
        }

        return result;
    }

    /**
     * Determines the canonical variant key from discriminator mappings, `const`/`enum` constraints, or property names.
     *
     * @param discProp Optional discriminator property name.
     * @param discMapping Optional OpenAPI discriminator mapping dictionary.
     * @param rawRef Optional raw `$ref` string on the branch.
     * @param refName Optional short `$ref` target name.
     * @param resolvedBranch The resolved branch metadata.
     * @param mergedProps Merged properties for the branch.
     * @param idx Fallback 0-based branch index.
     * @returns {string} The canonical variant key.
     */
    private static resolveDiscriminatorKey(
        discProp: string | undefined,
        discMapping: Record<string, string> | undefined,
        rawRef: string | undefined,
        refName: string | undefined,
        resolvedBranch: IPropertyMetadata,
        mergedProps: Record<string, IPropertyMetadata>,
        idx: number
    ): string {
        if (discMapping && rawRef) {
            for (const [mapKey, mapTarget] of Object.entries(discMapping)) {
                if (mapTarget === rawRef || mapTarget === refName) {
                    return mapKey;
                }
            }
        }
        if (discProp && mergedProps[discProp]) {
            const discMeta = mergedProps[discProp];
            if (typeof discMeta.const === "string" && discMeta.const) {
                return discMeta.const;
            }
            if (Array.isArray(discMeta.enum) && discMeta.enum.length > 0) {
                return String(discMeta.enum[0]);
            }
        } else if (!discProp) {
            const propKeys = Object.keys(resolvedBranch.properties || {});
            if (propKeys.length === 1) {
                return propKeys[0];
            }
        }
        return refName || resolvedBranch.title || `Variant_${idx}`;
    }

    /**
     * Detects which variant key matches a runtime data object.
     *
     * @param variants Available polymorphic variants.
     * @param currentObj The current bound object from the model.
     * @param discProp Optional discriminator property name.
     * @returns {string} The active variant key.
     */
    public static detectActiveVariantKey(
        variants: IPolymorphicVariant[],
        currentObj: unknown,
        discProp?: string
    ): string {
        if (variants.length === 0) {
            return "";
        }
        if (isRecord(currentObj)) {
            if (discProp) {
                const discVal = readString(currentObj, discProp);
                if (discVal && variants.some((v) => v.key === discVal)) {
                    return discVal;
                }
            }
            for (const variant of variants) {
                const uniqueKeys = Object.keys(variant.properties).filter((k) => k !== discProp);
                if (uniqueKeys.some((k) => currentObj[k] !== undefined)) {
                    return variant.key;
                }
            }
        }
        return variants[0].key;
    }

    /**
     * Merges polymorphic `oneOf` or `anyOf` root branch properties into a root or definition `ISchema`,
     * populating discriminator enum/valueHelp options when a discriminator property is present.
     *
     * @param schema The target `ISchema` to enrich.
     * @param rootMeta The normalized root property metadata holding `oneOf`/`anyOf`/`discriminator`.
     */
    public static mergePolymorphicRootBranches(schema: ISchema, rootMeta: IPropertyMetadata): void {
        const branches = rootMeta.oneOf || rootMeta.anyOf;
        if (!branches || branches.length === 0) return;
        schema.properties = schema.properties || {};
        const discProp = rootMeta.discriminator?.propertyName;
        const variantKeys: string[] = [];
        for (const branch of branches) {
            if (branch.title) variantKeys.push(branch.title);
            if (branch.properties) {
                for (const [propKey, propMeta] of Object.entries(branch.properties)) {
                    if (!schema.properties[propKey]) {
                        schema.properties[propKey] = { ...propMeta, required: false };
                    }
                }
            }
        }
        if (discProp && schema.properties[discProp] && variantKeys.length > 0 && !schema.properties[discProp].enum) {
            schema.properties[discProp].enum = variantKeys;
            schema.properties[discProp].valueHelp = variantKeys.map((k) => ({ key: k, text: k }));
            schema.properties[discProp].ui = {
                ...(schema.properties[discProp].ui || {}),
                widget: WIDGET_TYPE.SELECT,
                valueHelp: schema.properties[discProp].valueHelp
            };
        }
    }

    /**
     * Ensures the bound model object at `targetPath` has the active variant's discriminator, `const`, and `default` values initialized.
     *
     * @param model Optional `JSONModel` instance.
     * @param targetPath Resolved absolute model path.
     * @param variants Available polymorphic variants.
     * @param variantKey The active variant key.
     * @param discProp Optional discriminator property name.
     */
    public static ensureVariantDefaults(
        model: JSONModel | undefined,
        targetPath: string,
        variants: IPolymorphicVariant[],
        variantKey: string,
        discProp?: string
    ): void {
        if (!model || !variantKey) return;
        const currentObj = model.getProperty(targetPath);
        if (!isRecord(currentObj)) return;
        const selectedVariant = variants.find((v) => v.key === variantKey);
        if (!selectedVariant) return;
        let mutated = false;
        const nextObj: Record<string, unknown> = { ...currentObj };
        if (discProp && nextObj[discProp] === undefined) {
            nextObj[discProp] = variantKey;
            mutated = true;
        }
        for (const [propKey, propMeta] of Object.entries(selectedVariant.properties)) {
            if (propMeta.const !== undefined && nextObj[propKey] !== propMeta.const) {
                nextObj[propKey] = propMeta.const;
                mutated = true;
            } else if (nextObj[propKey] === undefined && propMeta.default !== undefined) {
                nextObj[propKey] = propMeta.default;
                mutated = true;
            }
        }
        if (mutated) {
            model.setProperty(targetPath, nextObj);
        }
    }

    /**
     * Prunes stale variant keys and injects `const`/`default`/discriminator values on the bound model when switching variants.
     *
     * @param model Optional `JSONModel` instance.
     * @param targetPath Resolved absolute model path.
     * @param variants Available polymorphic variants.
     * @param newKey Newly selected variant key.
     * @param discProp Optional discriminator property name.
     */
    public static applyVariantSwitch(
        model: JSONModel | undefined,
        targetPath: string,
        variants: IPolymorphicVariant[],
        newKey: string,
        discProp?: string
    ): void {
        if (!model) return;
        const currentObj = model.getProperty(targetPath);
        const nextObj: Record<string, unknown> = isRecord(currentObj) ? { ...currentObj } : {};
        const selectedVariant = variants.find((v) => v.key === newKey);
        if (selectedVariant) {
            const allowedKeys = new Set<string>(Object.keys(selectedVariant.properties));
            if (discProp) allowedKeys.add(discProp);
            for (const otherVariant of variants) {
                if (otherVariant.key === newKey) continue;
                for (const staleKey of Object.keys(otherVariant.properties)) {
                    if (!allowedKeys.has(staleKey)) delete nextObj[staleKey];
                }
            }
            for (const [propKey, propMeta] of Object.entries(selectedVariant.properties)) {
                if (propMeta.const !== undefined) nextObj[propKey] = propMeta.const;
                else if (nextObj[propKey] === undefined && propMeta.default !== undefined) nextObj[propKey] = propMeta.default;
            }
        }
        if (discProp) nextObj[discProp] = newKey;
        model.setProperty(targetPath, nextObj);
    }
}

