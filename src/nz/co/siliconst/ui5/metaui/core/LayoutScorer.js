"use strict";
/**
 * @file LayoutScorer.ts
 * @description Core utility that calculates the nested footprint score of schemas
 * to determine if they should be rendered inline or overflowed into a dialog button.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.LayoutScorer = void 0;
var PluginRegistry_1 = require("./PluginRegistry");
var Logger_1 = require("../utils/Logger");
var LayoutScorer = /** @class */ (function () {
    function LayoutScorer() {
    }
    /**
     * Recursively computes scores and annotates the schema with `renderMode`.
     *
     * @param schema The normalized schema root.
     * @param budget The remaining layout budget (e.g., 50).
     */
    LayoutScorer.apply = function (schema, budget, schemaDefinitions) {
        if (!schema || budget <= 0)
            return; // 0 budget means default fallback (no inline budget logic).
        var visited = new WeakSet();
        var activeRefs = new Set();
        // We only score the root properties (not the root object itself).
        if (schema.properties) {
            for (var key in schema.properties) {
                var prop = schema.properties[key];
                if (prop.type === "object" || prop.type === "array" || prop.$ref) {
                    this._scoreNode(prop, budget, visited, activeRefs, key, schemaDefinitions);
                }
            }
        }
    };
    /**
     * Traverses a node, computing its total footprint.
     * If the score > budget, forces `renderMode = "dialog"`.
     * If the score <= budget, forces `renderMode = "inline"`.
     */
    LayoutScorer._scoreNode = function (node, budget, visited, activeRefs, path, schemaDefinitions) {
        var _a, _b, _c, _d;
        if (!node || typeof node !== "object")
            return 0;
        if (visited.has(node)) {
            Logger_1.Logger.warn("[MetaUI LayoutScorer] Circular reference detected at '".concat(path, "'. Forcing dialog mode to prevent crash."), "", "LayoutScorer");
            node.ui = node.ui || {};
            node.ui.renderMode = "dialog";
            return 1; // A dialog button is just 1 unit
        }
        visited.add(node);
        if (node.$ref && schemaDefinitions) {
            var key = node.$ref;
            if (key.startsWith("#/definitions/"))
                key = key.substring(14);
            else if (key.startsWith("#/components/schemas/"))
                key = key.substring(21);
            if (activeRefs.has(key)) {
                Logger_1.Logger.warn("[MetaUI LayoutScorer] Circular OpenAPI $ref detected at '".concat(path, "' for '").concat(key, "'. Forcing dialog mode to prevent crash."), "", "LayoutScorer");
                node.ui = node.ui || {};
                node.ui.renderMode = "dialog";
                return 1;
            }
            var resolvedOriginal = schemaDefinitions[key];
            if (resolvedOriginal) {
                activeRefs.add(key);
                // Deep clone it BEFORE scoring so we don't mutate the global dictionary
                var resolved = JSON.parse(JSON.stringify(resolvedOriginal));
                var resolvedScore = this._scoreNode(resolved, budget, visited, activeRefs, path, schemaDefinitions);
                activeRefs.delete(key);
                node.ui = node.ui || {};
                if (resolvedScore <= budget) {
                    // Merge it permanently in the layout!
                    Object.assign(node, resolved);
                    delete node.$ref;
                    if (((_a = node.ui) === null || _a === void 0 ? void 0 : _a.widget) === "reference")
                        delete node.ui.widget;
                    node.ui.renderMode = "inline";
                    return resolvedScore;
                }
                else {
                    node.ui.renderMode = "dialog";
                    return 1;
                }
            }
        }
        if (node.type === "array") {
            var arrayScore = PluginRegistry_1.PluginRegistry.getInstance().getPluginScore("array", (_b = node.ui) === null || _b === void 0 ? void 0 : _b.widget);
            // Traverse array items!
            if (node.items) {
                var itemsSchema = node.items;
                if (itemsSchema.type === "object" || itemsSchema.type === "array" || itemsSchema.$ref) {
                    arrayScore += this._scoreNode(itemsSchema, budget, visited, activeRefs, "".concat(path, "/items"), schemaDefinitions);
                }
            }
            node.ui = node.ui || {};
            if (arrayScore <= budget) {
                node.ui.renderMode = "inline";
                return arrayScore;
            }
            else {
                node.ui.renderMode = "dialog";
                return 1;
            }
        }
        var totalScore = 0;
        if (node.properties) {
            for (var key in node.properties) {
                var child = node.properties[key];
                if (child.type === "object" || child.type === "array" || child.$ref) {
                    totalScore += this._scoreNode(child, budget, visited, activeRefs, "".concat(path, "/").concat(key), schemaDefinitions);
                }
                else {
                    totalScore += PluginRegistry_1.PluginRegistry.getInstance().getPluginScore(child.type || "string", (_c = child.ui) === null || _c === void 0 ? void 0 : _c.widget);
                }
            }
        }
        else {
            // An open dictionary (additionalProperties) is scored as a single table
            totalScore += PluginRegistry_1.PluginRegistry.getInstance().getPluginScore("object", (_d = node.ui) === null || _d === void 0 ? void 0 : _d.widget); // e.g. dictionaryMap
        }
        node.ui = node.ui || {};
        if (totalScore <= budget) {
            node.ui.renderMode = "inline";
            return totalScore;
        }
        else {
            node.ui.renderMode = "dialog";
            return 1; // It collapsed into an "Edit Details" button
        }
    };
    return LayoutScorer;
}());
exports.LayoutScorer = LayoutScorer;
