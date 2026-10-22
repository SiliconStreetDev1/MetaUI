/**
 * @file LayoutScorer.ts
 * @description Core utility that calculates the nested footprint score of schemas
 * to determine if they should be rendered inline or overflowed into a dialog button.
 */

import { ISchema, IPropertyMetadata } from "../interfaces/ISchema";
import { PluginRegistry } from "./PluginRegistry";
import { OpenApiRefResolver } from "../openapi/OpenApiRefResolver";
import { Logger } from "../utils/Logger";
import { RENDER_MODE, SCHEMA_TYPE, WIDGET_TYPE } from "../constants/MetaUIConstants";
import { deepClone } from "../utils/TypeGuards";

/**
 * Computes the visual footprint score of nested object/array nodes against a layout budget
 * and annotates each node's `ui.renderMode` (`inline` or `dialog`).
 */
export class LayoutScorer {
    /**
     * Recursively computes scores and annotates the schema with `renderMode`.
     *
     * @param schema The normalized schema root.
     * @param budget The remaining layout budget (e.g., 50). 0 disables inline budget scoring unless `schema.ui.layoutBudget` is set.
     * @param schemaDefinitions Optional global `$ref` definitions dictionary.
     */
    public static apply(
        schema: ISchema | null,
        budget: number,
        schemaDefinitions?: Record<string, ISchema>,
        registry: PluginRegistry = PluginRegistry.getInstance()
    ): void {
        if (!schema) return;
        const effectiveBudget =
            budget > 0 ? budget : schema.ui?.layoutBudget && schema.ui.layoutBudget > 0 ? schema.ui.layoutBudget : 0;
        if (effectiveBudget <= 0) return;

        const visited = new WeakSet<object>();
        const activeRefs = new Set<string>();
        const refMemo = new Map<string, { score: number; scoredMeta: IPropertyMetadata }>();

        if (schema.properties) {
            for (const key of Object.keys(schema.properties)) {
                const prop = schema.properties[key];
                if (prop.type === SCHEMA_TYPE.OBJECT || prop.type === SCHEMA_TYPE.ARRAY || prop.$ref) {
                    this.scoreNode(prop, effectiveBudget, visited, activeRefs, key, schemaDefinitions, registry, refMemo);
                }
            }
        }
        if (schema.type === SCHEMA_TYPE.ARRAY && schema.items) {
            this.scoreNode(
                schema.items,
                effectiveBudget,
                visited,
                activeRefs,
                "items",
                schemaDefinitions,
                registry,
                refMemo
            );
        }
    }

    /**
     * Traverses a node, computing its total footprint.
     * If the score > budget, forces `renderMode = "dialog"`.
     * If the score <= budget, forces `renderMode = "inline"`.
     */
    private static scoreNode(
        node: IPropertyMetadata,
        budget: number,
        visited: WeakSet<object>,
        activeRefs: Set<string>,
        path: string,
        schemaDefinitions?: Record<string, ISchema>,
        registry: PluginRegistry = PluginRegistry.getInstance(),
        refMemo: Map<string, { score: number; scoredMeta: IPropertyMetadata }> = new Map()
    ): number {
        if (!node || typeof node !== "object") return 0;

        const effectiveBudget =
            node.ui?.layoutBudget && node.ui.layoutBudget > 0 ? node.ui.layoutBudget : budget;
        const explicitRenderMode = node.ui?.renderMode;

        if (visited.has(node)) {
            Logger.warn(
                `[MetaUI LayoutScorer] Circular reference detected at '${path}'. Forcing dialog mode to prevent crash.`,
                "",
                "LayoutScorer"
            );
            node.ui = node.ui || {};
            node.ui.renderMode = RENDER_MODE.DIALOG;
            node.ui.layoutBudget = effectiveBudget;
            return 1;
        }
        visited.add(node);

        if (node.$ref) {
            const key = OpenApiRefResolver.extractRefName(node.$ref);

            if (activeRefs.has(key)) {
                Logger.warn(
                    `[MetaUI LayoutScorer] Circular OpenAPI $ref detected at '${path}' for '${key}'. Forcing dialog mode to prevent crash.`,
                    "",
                    "LayoutScorer"
                );
                node.ui = node.ui || {};
                node.ui.renderMode = RENDER_MODE.DIALOG;
                visited.delete(node);
                return 1;
            }

            const resolvedOriginal = schemaDefinitions ? schemaDefinitions[key] : undefined;
            if (!resolvedOriginal) {
                node.ui = {
                    ...(node.ui || {}),
                    renderMode: RENDER_MODE.DIALOG,
                    widget: node.ui?.widget || WIDGET_TYPE.REFERENCE,
                    layoutBudget: effectiveBudget
                };
                visited.delete(node);
                return 1;
            }

            const memoKey = `${key}::${effectiveBudget}`;
            const cachedRef = refMemo.get(memoKey);
            let resolvedMeta: IPropertyMetadata;
            let resolvedScore: number;

            if (cachedRef) {
                resolvedMeta = deepClone(cachedRef.scoredMeta);
                resolvedScore = cachedRef.score;
            } else {
                activeRefs.add(key);

                const resolvedClone = deepClone(resolvedOriginal);
                resolvedMeta = {
                    ...resolvedClone,
                    type: resolvedClone.type || SCHEMA_TYPE.OBJECT
                };

                resolvedScore = this.scoreNode(
                    resolvedMeta,
                    effectiveBudget,
                    visited,
                    activeRefs,
                    path,
                    schemaDefinitions,
                    registry,
                    refMemo
                );
                activeRefs.delete(key);
                refMemo.set(memoKey, { score: resolvedScore, scoredMeta: deepClone(resolvedMeta) });
            }

            node.ui = node.ui || {};
            node.ui.layoutBudget = effectiveBudget;
            if (explicitRenderMode === RENDER_MODE.DIALOG) {
                node.ui.renderMode = RENDER_MODE.DIALOG;
                visited.delete(node);
                return 1;
            }
            const refFitInline =
                resolvedMeta.ui?.renderMode !== RENDER_MODE.DIALOG && resolvedScore <= effectiveBudget;
            if (refFitInline || explicitRenderMode === RENDER_MODE.INLINE) {
                const origLabel = node.ui.label;
                const origRequired = node.required;
                const origNullable = node.nullable;
                const origReadOnly = node.readOnly === true || node.ui.readOnly === true;

                Object.assign(node, resolvedMeta);
                delete node.$ref;
                node.required = origRequired;
                node.nullable = origNullable;
                node.ui = {
                    ...(resolvedMeta.ui || {}),
                    ...node.ui,
                    label: origLabel || resolvedMeta.ui?.label
                };
                if (node.ui.widget === WIDGET_TYPE.REFERENCE) {
                    if (resolvedMeta.ui?.widget && resolvedMeta.ui.widget !== WIDGET_TYPE.REFERENCE) {
                        node.ui.widget = resolvedMeta.ui.widget;
                    } else {
                        delete node.ui.widget;
                    }
                }
                if (origReadOnly && node.properties) {
                    node.readOnly = true;
                    node.ui.readOnly = true;
                    for (const child of Object.values(node.properties)) {
                        child.readOnly = true;
                        child.ui = { ...(child.ui || {}), readOnly: true };
                    }
                }

                node.ui.renderMode = RENDER_MODE.INLINE;
                visited.delete(node);
                return resolvedScore;
            } else {
                node.ui.renderMode = RENDER_MODE.DIALOG;
                visited.delete(node);
                return 1;
            }
        }

        if (node.type === SCHEMA_TYPE.ARRAY) {
            let arrayScore = registry.getPluginScore(SCHEMA_TYPE.ARRAY, node.ui?.widget);

            if (node.items) {
                const itemsMeta = node.items;
                if (itemsMeta.type === SCHEMA_TYPE.OBJECT || itemsMeta.type === SCHEMA_TYPE.ARRAY || itemsMeta.$ref) {
                    arrayScore += this.scoreNode(
                        itemsMeta,
                        effectiveBudget,
                        visited,
                        activeRefs,
                        `${path}/items`,
                        schemaDefinitions,
                        registry,
                        refMemo
                    );
                }
            }

            node.ui = node.ui || {};
            node.ui.layoutBudget = effectiveBudget;
            if (explicitRenderMode === RENDER_MODE.DIALOG || node.items?.ui?.renderMode === RENDER_MODE.DIALOG) {
                node.ui.renderMode = RENDER_MODE.DIALOG;
                visited.delete(node);
                return 1;
            }
            if (arrayScore <= effectiveBudget || explicitRenderMode === RENDER_MODE.INLINE) {
                node.ui.renderMode = RENDER_MODE.INLINE;
                visited.delete(node);
                return arrayScore;
            } else {
                node.ui.renderMode = RENDER_MODE.DIALOG;
                visited.delete(node);
                return 1;
            }
        }

        let totalScore = 0;

        if (node.properties) {
            const parentReadOnly = node.readOnly === true || node.ui?.readOnly === true;
            for (const key of Object.keys(node.properties)) {
                const child = node.properties[key];
                if (parentReadOnly) {
                    child.readOnly = true;
                    child.ui = { ...(child.ui || {}), readOnly: true };
                }
                if (child.type === SCHEMA_TYPE.OBJECT || child.type === SCHEMA_TYPE.ARRAY || child.$ref) {
                    totalScore += this.scoreNode(
                        child,
                        effectiveBudget,
                        visited,
                        activeRefs,
                        `${path}/${key}`,
                        schemaDefinitions,
                        registry,
                        refMemo
                    );
                } else {
                    totalScore += registry.getPluginScore(child.type || SCHEMA_TYPE.STRING, child.ui?.widget);
                }
            }
        } else {
            totalScore += registry.getPluginScore(SCHEMA_TYPE.OBJECT, node.ui?.widget);
        }

        node.ui = node.ui || {};
        node.ui.layoutBudget = effectiveBudget;

        visited.delete(node);

        if (explicitRenderMode === RENDER_MODE.DIALOG) {
            node.ui.renderMode = RENDER_MODE.DIALOG;
            return 1;
        }
        if (totalScore <= effectiveBudget || explicitRenderMode === RENDER_MODE.INLINE) {
            node.ui.renderMode = RENDER_MODE.INLINE;
            return totalScore;
        } else {
            node.ui.renderMode = RENDER_MODE.DIALOG;
            return 1;
        }
    }
}
