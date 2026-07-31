"use strict";
/**
 * @file LayoutMutator.ts
 * @description Intercepts the generated schema before rendering to dynamically mutate the UI layout based on inline rendering rules.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.LayoutMutator = void 0;
var SchemaNormalizer_1 = require("./SchemaNormalizer");
var LayoutMutator = /** @class */ (function () {
    function LayoutMutator() {
    }
    /**
     * Mutates the `uiLayout` array to expand nested inline objects into native Groups.
     * @param schema The normalized root schema.
     */
    LayoutMutator.apply = function (schema) {
        if (!schema || !schema.uiLayout || !Array.isArray(schema.uiLayout)) {
            return; // No layout to mutate
        }
        schema.uiLayout = this.expandElements(schema.uiLayout, schema);
    };
    LayoutMutator.expandElements = function (elements, rootSchema) {
        var _a, _b, _c;
        var expanded = [];
        for (var _i = 0, elements_1 = elements; _i < elements_1.length; _i++) {
            var element = elements_1[_i];
            if (element.type === "Group") {
                // Recursively expand group elements
                if (element.elements) {
                    element.elements = this.expandElements(element.elements, rootSchema);
                }
                expanded.push(element);
            }
            else if (element.type === "Control") {
                if (!element.scope) {
                    expanded.push(element);
                    continue;
                }
                // Resolve the schema to see if this control points to an inline object
                try {
                    var _d = SchemaNormalizer_1.SchemaNormalizer.resolveScope(rootSchema, element.scope), meta = _d.meta, bindingPath = _d.bindingPath;
                    var hasExplicitWidget = !!((_a = meta === null || meta === void 0 ? void 0 : meta.ui) === null || _a === void 0 ? void 0 : _a.widget);
                    var isInlineObject = (meta === null || meta === void 0 ? void 0 : meta.type) === "object" && ((_b = meta.ui) === null || _b === void 0 ? void 0 : _b.renderMode) === "inline" && !hasExplicitWidget;
                    if (isInlineObject && meta.properties) {
                        // Transform this Control into a Group containing its properties
                        var newGroup = {
                            type: "Group",
                            label: ((_c = meta.ui) === null || _c === void 0 ? void 0 : _c.label) || bindingPath.split("/").pop(),
                            elements: []
                        };
                        // Add all child properties as controls
                        for (var _e = 0, _f = Object.keys(meta.properties); _e < _f.length; _e++) {
                            var childKey = _f[_e];
                            newGroup.elements.push({
                                type: "Control",
                                scope: "".concat(element.scope, "/properties/").concat(childKey)
                            });
                        }
                        // Recursively expand this new group in case it contains further inline objects
                        newGroup.elements = this.expandElements(newGroup.elements, rootSchema);
                        expanded.push(newGroup);
                    }
                    else {
                        // Scalar control, keep as is
                        expanded.push(element);
                    }
                }
                catch (e) {
                    // Scope not found, keep element to let normal error handling report it
                    expanded.push(element);
                }
            }
            else {
                expanded.push(element);
            }
        }
        return expanded;
    };
    return LayoutMutator;
}());
exports.LayoutMutator = LayoutMutator;
