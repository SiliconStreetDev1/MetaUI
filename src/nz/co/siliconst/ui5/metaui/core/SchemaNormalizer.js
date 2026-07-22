"use strict";
/**
 * @file SchemaNormalizer.ts
 * @description Transforms and validates incoming JSON payloads into the strict v2 ISchema dictionary matrix.
 */
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SchemaNormalizer = void 0;
var Logger_1 = require("../utils/Logger");
var SchemaNormalizer = /** @class */ (function () {
    function SchemaNormalizer() {
    }
    /**
     * Validates that the provided raw payload conforms to the required ISchema structures.
     */
    SchemaNormalizer.normalize = function (rawSchema, data) {
        var schemaObj = rawSchema;
        if (typeof schemaObj === "string") {
            try {
                schemaObj = JSON.parse(schemaObj);
            }
            catch (e) {
                var msg = "Failed to parse schema string: " + e.message;
                Logger_1.Logger.error("[MetaUI SchemaNormalizer]", msg);
                throw new Error(msg);
            }
        }
        if (!schemaObj || typeof schemaObj !== 'object' || Array.isArray(schemaObj)) {
            return this.inferSchemaFromData(data);
        }
        try {
            // It is an object. Ensure it conforms to v2 structure.
            var normalized = {
                title: schemaObj.title,
                type: schemaObj.type || (schemaObj.items ? "array" : "object"),
                layoutStrategy: schemaObj.layoutStrategy,
                uiLayout: schemaObj.uiLayout,
                additionalProperties: schemaObj.additionalProperties
            };
            var targetProperties = schemaObj.properties || {};
            if (schemaObj.additionalProperties === true && data) {
                var inferred = this.inferSchemaFromData(data);
                if (inferred.type === "object" && inferred.properties) {
                    targetProperties = this.deepMergeProperties(inferred.properties, targetProperties);
                }
                else if (inferred.type === "array" && inferred.items && inferred.items.properties) {
                    // Array schema merging could be added here if we want full support.
                }
            }
            if (normalized.type === "object") {
                normalized.properties = this.normalizeProperties(targetProperties);
            }
            else if (normalized.type === "array") {
                // Future expansion: array deep merge
                normalized.items = this.normalizePropertyMetadata(schemaObj.items || { type: "object", properties: {} }, "items");
            }
            return normalized;
        }
        catch (error) {
            var msg = "Critical error normalizing schema object: " + error.message;
            Logger_1.Logger.error("[MetaUI SchemaNormalizer]", msg);
            throw new Error(msg);
        }
    };
    /**
     * Recursively deep merges an inferred schema over a base schema.
     * @param base The base property dictionary.
     * @param override The overriding inferred dictionary.
     * @returns A new deeply merged property dictionary.
     */
    SchemaNormalizer.deepMergeProperties = function (base, override) {
        var merged = __assign({}, base);
        for (var _i = 0, _a = Object.keys(override); _i < _a.length; _i++) {
            var key = _a[_i];
            var overrideVal = override[key];
            var baseVal = merged[key];
            if (baseVal && typeof baseVal === "object" && !Array.isArray(baseVal) &&
                overrideVal && typeof overrideVal === "object" && !Array.isArray(overrideVal)) {
                merged[key] = this.deepMergeProperties(baseVal, overrideVal);
            }
            else {
                merged[key] = overrideVal;
            }
        }
        return merged;
    };
    /**
     * Normalizes a collection of properties.
     * @param properties The raw properties map.
     * @returns A map of strict IPropertyMetadata objects.
     */
    SchemaNormalizer.normalizeProperties = function (properties) {
        var normalizedProps = {};
        for (var _i = 0, _a = Object.keys(properties); _i < _a.length; _i++) {
            var key = _a[_i];
            normalizedProps[key] = this.normalizePropertyMetadata(properties[key], key);
        }
        return normalizedProps;
    };
    /**
     * Normalizes a single property against the ISchema specification.
     * @param prop The raw property definition.
     * @param keyName The string key name for generating default labels.
     * @returns A strict IPropertyMetadata instance.
     */
    SchemaNormalizer.normalizePropertyMetadata = function (prop, keyName) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
        var normalized = {
            type: prop.type || "string",
            ui: {
                label: ((_a = prop.ui) === null || _a === void 0 ? void 0 : _a.label) || this.generateLabel(keyName),
                isKey: !!((_b = prop.ui) === null || _b === void 0 ? void 0 : _b.isKey),
                readOnly: !!((_c = prop.ui) === null || _c === void 0 ? void 0 : _c.readOnly),
                widget: ((_d = prop.ui) === null || _d === void 0 ? void 0 : _d.widget) || (prop.valueHelp || prop.enum ? "select" : undefined),
                visibleOn: (_e = prop.ui) === null || _e === void 0 ? void 0 : _e.visibleOn,
                enabledOn: (_f = prop.ui) === null || _f === void 0 ? void 0 : _f.enabledOn,
                format: (_g = prop.ui) === null || _g === void 0 ? void 0 : _g.format,
                validators: (_h = prop.ui) === null || _h === void 0 ? void 0 : _h.validators,
                formatter: (_j = prop.ui) === null || _j === void 0 ? void 0 : _j.formatter,
                args: (_k = prop.ui) === null || _k === void 0 ? void 0 : _k.args,
                rows: (_l = prop.ui) === null || _l === void 0 ? void 0 : _l.rows,
                fullWidth: (_m = prop.ui) === null || _m === void 0 ? void 0 : _m.fullWidth
            },
            required: !!prop.required,
            maxLength: prop.maxLength,
            minimum: prop.minimum,
            maximum: prop.maximum,
            pattern: prop.pattern,
            precision: prop.precision,
            scale: prop.scale,
            valueHelp: prop.valueHelp,
            enum: prop.enum
        };
        if (normalized.type === "object" && prop.properties) {
            normalized.properties = this.normalizeProperties(prop.properties);
            normalized.uiLayout = prop.uiLayout;
        }
        else if (normalized.type === "array" && prop.items) {
            normalized.items = this.normalizePropertyMetadata(prop.items, "items");
            normalized.uiLayout = prop.uiLayout;
        }
        return normalized;
    };
    /**
     * Generates a Title Case label from camelCase or snake_case technical names.
     */
    SchemaNormalizer.generateLabel = function (name) {
        if (!name)
            return "";
        var spaced = name.replace(/([A-Z])/g, " $1").replace(/_/g, " ");
        return spaced.split(' ')
            .filter(function (w) { return w.length > 0; })
            .map(function (word) { return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(); })
            .join(' ')
            .trim();
    };
    /**
     * Infers a v2 ISchema structure dynamically from a plain data payload.
     */
    SchemaNormalizer.inferSchemaFromData = function (data) {
        var schema = { type: "object", properties: {}, layoutStrategy: "compact", title: "" };
        if (!data || typeof data !== "object") {
            return schema;
        }
        if (Array.isArray(data)) {
            schema.type = "array";
            if (data.length > 0 && typeof data[0] !== "object") {
                schema.layoutStrategy = "compact";
                schema.items = { type: typeof data[0] };
            }
            else {
                schema.layoutStrategy = "table";
                schema.items = {
                    type: "object",
                    layoutStrategy: "compact",
                    properties: data.length > 0 ? this.inferPropertiesFromObject(data[0]) : {}
                };
            }
        }
        else {
            schema.type = "object";
            schema.properties = this.inferPropertiesFromObject(data);
        }
        return schema;
    };
    /**
     * Infers field metadata recursively from a raw data object.
     * @param obj The raw JavaScript object.
     * @returns A dictionary of inferred IPropertyMetadata.
     */
    SchemaNormalizer.inferPropertiesFromObject = function (obj) {
        var properties = {};
        if (!obj || typeof obj !== "object")
            return properties;
        for (var _i = 0, _a = Object.keys(obj); _i < _a.length; _i++) {
            var key = _a[_i];
            var val = obj[key];
            if (val === null || val === undefined)
                continue;
            var type = "string";
            var items = void 0;
            var nestedProps = void 0;
            if (typeof val === "number")
                type = "number";
            else if (typeof val === "boolean")
                type = "boolean";
            else if (Array.isArray(val)) {
                type = "array";
                if (val.length > 0 && typeof val[0] !== "object") {
                    items = {
                        type: typeof val[0]
                    };
                }
                else {
                    items = {
                        type: "object",
                        properties: val.length > 0 ? this.inferPropertiesFromObject(val[0]) : {}
                    };
                }
            }
            else if (typeof val === "object") {
                type = "object";
                nestedProps = this.inferPropertiesFromObject(val);
            }
            properties[key] = {
                type: type,
                items: items,
                properties: nestedProps,
                ui: {
                    label: this.generateLabel(key),
                    isKey: false,
                    readOnly: false,
                    widget: type === "array" && (items === null || items === void 0 ? void 0 : items.type) !== "object" ? "multiInput" : undefined
                }
            };
        }
        return properties;
    };
    /**
     * Resolves a JSON Schema scope (e.g. '#/properties/header/properties/id')
     * against the ISchema, returning the PropertyMetadata and the UI5 binding path.
     */
    SchemaNormalizer.resolveScope = function (schema, scope) {
        if (!scope || !scope.startsWith("#/properties/")) {
            return { meta: undefined, bindingPath: scope || "", propKey: scope || "" };
        }
        var pathSegments = scope.replace("#/properties/", "").split("/properties/");
        var current = schema.properties;
        var meta;
        Logger_1.Logger.debug("[MetaUI SchemaNormalizer]", "Resolving scope '".concat(scope, "' with segments: ").concat(JSON.stringify(pathSegments)), "SchemaNormalizer");
        Logger_1.Logger.debug("[MetaUI SchemaNormalizer]", "Root schema keys: ".concat(Object.keys(schema.properties || {})), "SchemaNormalizer");
        for (var i = 0; i < pathSegments.length; i++) {
            var segment = pathSegments[i];
            if (!current) {
                Logger_1.Logger.debug("[MetaUI SchemaNormalizer]", "current is undefined at segment '".concat(segment, "'"), "SchemaNormalizer");
                meta = undefined;
                break;
            }
            meta = current[segment];
            Logger_1.Logger.debug("[MetaUI SchemaNormalizer]", "Segment '".concat(segment, "' resolved to meta: ").concat(!!meta, ". Available keys in current: ").concat(Object.keys(current)), "SchemaNormalizer");
            if (i < pathSegments.length - 1) {
                current = meta === null || meta === void 0 ? void 0 : meta.properties;
            }
        }
        var bindingPath = pathSegments.join("/");
        var propKey = scope.replace("#/properties/", ""); // The original raw string for logging
        return {
            meta: meta,
            bindingPath: bindingPath,
            propKey: propKey
        };
    };
    return SchemaNormalizer;
}());
exports.SchemaNormalizer = SchemaNormalizer;
