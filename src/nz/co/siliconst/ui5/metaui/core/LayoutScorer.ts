/**
 * @file LayoutScorer.ts
 * @description Core utility that calculates the nested footprint score of schemas 
 * to determine if they should be rendered inline or overflowed into a dialog button.
 */

import { ISchema, IPropertyMetadata } from "../interfaces/ISchema";
import { PluginRegistry } from "./PluginRegistry";
import { Logger } from "../utils/Logger";
import { RENDER_MODE, SCHEMA_TYPE, OPENAPI_PREFIX, WIDGET_TYPE } from "../constants/MetaUIConstants";

export class LayoutScorer {
    /**
     * Recursively computes scores and annotates the schema with `renderMode`.
     * 
     * @param schema The normalized schema root.
     * @param budget The remaining layout budget (e.g., 50).
     */
    public static apply(schema: ISchema | null, budget: number, schemaDefinitions?: Record<string, ISchema>): void {
        if (!schema || budget <= 0) return; // 0 budget means default fallback (no inline budget logic).

        const visited = new WeakSet<object>();
        const activeRefs = new Set<string>();

        // We only score the root properties (not the root object itself).
        if (schema.properties) {
            for (const key in schema.properties) {
                const prop = schema.properties[key];
                if (prop.type === SCHEMA_TYPE.OBJECT || prop.type === SCHEMA_TYPE.ARRAY || prop.$ref) {
                    this._scoreNode(prop, budget, visited, activeRefs, key, schemaDefinitions);
                }
            }
        }
    }

    /**
     * Traverses a node, computing its total footprint.
     * If the score > budget, forces `renderMode = "dialog"`.
     * If the score <= budget, forces `renderMode = "inline"`.
     */
    private static _scoreNode(node: IPropertyMetadata, budget: number, visited: WeakSet<object>, activeRefs: Set<string>, path: string, schemaDefinitions?: Record<string, ISchema>): number {
        if (!node || typeof node !== SCHEMA_TYPE.OBJECT) return 0;

        if (visited.has(node)) {
            Logger.warn(`[MetaUI LayoutScorer] Circular reference detected at '${path}'. Forcing dialog mode to prevent crash.`, "", "LayoutScorer");
            node.ui = node.ui || {};
            node.ui.renderMode = RENDER_MODE.DIALOG;
            node.ui.layoutBudget = budget;
            return 1; // A dialog button is just 1 unit
        }
        visited.add(node);

        if (node.$ref && schemaDefinitions) {
            let key = node.$ref;
            if (key.startsWith(OPENAPI_PREFIX.DEFINITIONS)) key = key.substring(OPENAPI_PREFIX.DEFINITIONS.length);
            else if (key.startsWith(OPENAPI_PREFIX.COMPONENTS_SCHEMAS)) key = key.substring(OPENAPI_PREFIX.COMPONENTS_SCHEMAS.length);

            if (activeRefs.has(key)) {
                Logger.warn(`[MetaUI LayoutScorer] Circular OpenAPI $ref detected at '${path}' for '${key}'. Forcing dialog mode to prevent crash.`, "", "LayoutScorer");
                node.ui = node.ui || {};
                node.ui.renderMode = RENDER_MODE.DIALOG;
                return 1;
            }

            const resolvedOriginal = schemaDefinitions[key];
            if (resolvedOriginal) {
                activeRefs.add(key);
                
                // Deep clone it BEFORE scoring so we don't mutate the global dictionary
                const resolved = JSON.parse(JSON.stringify(resolvedOriginal));
                
                const resolvedScore = this._scoreNode(resolved, budget, visited, activeRefs, path, schemaDefinitions);
                activeRefs.delete(key);
                
                node.ui = node.ui || {};
                node.ui.layoutBudget = budget;
                if (resolvedScore <= budget) {
                    // Merge it permanently in the layout!
                    Object.assign(node, resolved);
                    delete node.$ref;
                    if (node.ui?.widget === WIDGET_TYPE.REFERENCE) delete node.ui.widget;
                    
                    node.ui.renderMode = RENDER_MODE.INLINE;
                    return resolvedScore;
                } else {
                    node.ui.renderMode = RENDER_MODE.DIALOG;
                    return 1;
                }
            }
        }

        if (node.type === SCHEMA_TYPE.ARRAY) {
            let arrayScore = PluginRegistry.getInstance().getPluginScore(SCHEMA_TYPE.ARRAY, node.ui?.widget);
            
            // Traverse array items!
            if (node.items) {
                const itemsSchema = node.items as ISchema;
                if (itemsSchema.type === SCHEMA_TYPE.OBJECT || itemsSchema.type === SCHEMA_TYPE.ARRAY || itemsSchema.$ref) {
                    arrayScore += this._scoreNode(itemsSchema, budget, visited, activeRefs, `${path}/items`, schemaDefinitions);
                }
            }

            node.ui = node.ui || {};
            node.ui.layoutBudget = budget;
            if (arrayScore <= budget) {
                node.ui.renderMode = RENDER_MODE.INLINE;
                return arrayScore;
            } else {
                node.ui.renderMode = RENDER_MODE.DIALOG;
                return 1;
            }
        }

        let totalScore = 0;

        if (node.properties) {
            for (const key in node.properties) {
                const child = node.properties[key] as IPropertyMetadata;
                if (child.type === SCHEMA_TYPE.OBJECT || child.type === SCHEMA_TYPE.ARRAY || child.$ref) {
                    totalScore += this._scoreNode(child, budget, visited, activeRefs, `${path}/${key}`, schemaDefinitions);
                } else {
                    totalScore += PluginRegistry.getInstance().getPluginScore(child.type || SCHEMA_TYPE.STRING, child.ui?.widget);
                }
            }
        } else {
            // An open dictionary (additionalProperties) is scored as a single table
            totalScore += PluginRegistry.getInstance().getPluginScore(SCHEMA_TYPE.OBJECT, node.ui?.widget); // e.g. dictionaryMap
        }

        node.ui = node.ui || {};
        node.ui.layoutBudget = budget;
        
        if (totalScore <= budget) {
            node.ui.renderMode = RENDER_MODE.INLINE;
            return totalScore;
        } else {
            node.ui.renderMode = RENDER_MODE.DIALOG;
            return 1; // It collapsed into an "Edit Details" button
        }
    }
}
