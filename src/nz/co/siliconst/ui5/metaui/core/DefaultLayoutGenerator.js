"use strict";
/**
 * @file DefaultLayoutGenerator.ts
 * @description Automatically synthesizes a default UI layout for schemas that lack an explicit mapping.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DefaultLayoutGenerator = void 0;
var Logger_1 = require("../utils/Logger");
/**
 * Encapsulates the logic to dynamically build a safe, default layout orchestration
 * when the developer or backend fails to provide an explicit `uiLayout`.
 *
 * By elevating this into a dedicated utility, we avoid polluting layout engines
 * (like FormLayout or TableLayout) with structural inference responsibilities.
 *
 * @namespace nz.co.siliconst.ui5.metaui.core
 * @public
 */
var DefaultLayoutGenerator = /** @class */ (function () {
    function DefaultLayoutGenerator() {
    }
    /**
     * Inspects a schema. If it has properties but no `uiLayout`, it synthesizes a default.
     * @param schema The ISchema dictionary.
     * @returns boolean True if a layout was synthesized, false if it already existed or was empty.
     */
    DefaultLayoutGenerator.ensureLayout = function (schema) {
        var _a;
        // If it already has a valid array, do nothing
        if (schema.uiLayout && Array.isArray(schema.uiLayout) && schema.uiLayout.length > 0) {
            return false;
        }
        var isArray = schema.type === "array";
        var props = isArray ? (_a = schema.items) === null || _a === void 0 ? void 0 : _a.properties : schema.properties;
        if (!props || Object.keys(props).length === 0) {
            return false; // Nothing to map
        }
        var elements = this.generateElementsFromProperties(props, "#/properties");
        if (isArray) {
            // Table layouts expect an array of flat Controls at the root uiLayout
            // For tables, we flatten the deep elements or just render the root level
            // To keep it safe, we'll just use the flat elements for tables
            schema.uiLayout = elements.filter(function (e) { return e.type === "Control"; });
        }
        else {
            // Form layouts expect a grouped structure
            schema.uiLayout = [
                {
                    type: "Group",
                    label: schema.title,
                    elements: elements
                }
            ];
        }
        return true;
    };
    /**
     * Recursively traverses property metadata to synthesize generic Group and Control layout definitions.
     * @param props The properties object from the schema.
     * @param basePath The absolute JSON scope path to prefix bindings.
     * @returns An array of generated layout element descriptors.
     */
    DefaultLayoutGenerator.generateElementsFromProperties = function (props, basePath) {
        var elements = [];
        for (var _i = 0, _a = Object.keys(props); _i < _a.length; _i++) {
            var key = _a[_i];
            try {
                var prop = props[key];
                var currentPath = "".concat(basePath, "/").concat(key);
                // We do not recursively inline nested objects as Groups.
                // MetaUI handles nested objects dynamically via the ObjectPlugin drill-down dialog.
                // This prevents duplicate Tables and infinite recursion on circular $refs.
                elements.push({
                    type: "Control",
                    scope: currentPath
                });
            }
            catch (error) {
                // Do not swallow errors. A failure to synthesize a property is a critical failure.
                var msg = "[MetaUI] DefaultLayoutGenerator failed to synthesize property '".concat(key, "': ").concat(error.message);
                Logger_1.Logger.error(msg);
                throw new Error(msg);
            }
        }
        return elements;
    };
    return DefaultLayoutGenerator;
}());
exports.DefaultLayoutGenerator = DefaultLayoutGenerator;
