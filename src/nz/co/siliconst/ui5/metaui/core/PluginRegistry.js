"use strict";
/**
 * @file PluginRegistry.ts
 * @description Centralized hub for mapping UI5 controls to SAP schema data types.
 * Enforces the Registry Pattern to decouple the core engine from specific UI5 control implementations.
 * NOW WITH UNIVERSAL LAZY LOADING.
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PluginRegistry = void 0;
var Logger_1 = require("../utils/Logger");
var PluginRegistry = /** @class */ (function () {
    function PluginRegistry() {
        this.fieldIndex = {};
        this.actionIndex = {};
        this.layoutIndex = {};
        this.activePromises = {};
        // Core Mappings
        this.registerPluginPath("string", undefined, "nz/co/siliconst/ui5/metaui/plugins/controls/StringPlugin");
        this.registerPluginPath("number", undefined, "nz/co/siliconst/ui5/metaui/plugins/controls/NumberPlugin");
        this.registerPluginPath("integer", undefined, "nz/co/siliconst/ui5/metaui/plugins/controls/NumberPlugin");
        this.registerPluginPath("date", undefined, "nz/co/siliconst/ui5/metaui/plugins/controls/DatePlugin");
        this.registerPluginPath("boolean", undefined, "nz/co/siliconst/ui5/metaui/plugins/controls/BooleanPlugin");
        this.registerPluginPath("array", undefined, "nz/co/siliconst/ui5/metaui/plugins/controls/ArrayPlugin");
        this.registerPluginPath("object", undefined, "nz/co/siliconst/ui5/metaui/plugins/controls/ObjectPlugin");
        this.registerPluginPath("string", "default", "nz/co/siliconst/ui5/metaui/plugins/controls/StringPlugin");
        this.registerPluginPath("object", "dictionary", "nz/co/siliconst/ui5/metaui/plugins/controls/DictionaryMapPlugin");
        this.registerPluginPath("object", "reference", "nz/co/siliconst/ui5/metaui/plugins/controls/ReferencePlugin");
        // Widget Overrides
        this.registerPluginPath("string", "time", "nz/co/siliconst/ui5/metaui/plugins/controls/TimePlugin");
        this.registerPluginPath("string", "datetime", "nz/co/siliconst/ui5/metaui/plugins/controls/DateTimePlugin");
        this.registerPluginPath("boolean", "switch", "nz/co/siliconst/ui5/metaui/plugins/controls/SwitchPlugin");
        this.registerPluginPath("number", "step", "nz/co/siliconst/ui5/metaui/plugins/controls/StepInputPlugin");
        this.registerPluginPath("string", "select", "nz/co/siliconst/ui5/metaui/plugins/controls/DropdownPlugin");
        this.registerPluginPath("string", "textArea", "nz/co/siliconst/ui5/metaui/plugins/controls/TextAreaPlugin");
        this.registerPluginPath("string", "codeEditor", "nz/co/siliconst/ui5/metaui/plugins/controls/CodeEditorPlugin");
        this.registerPluginPath("string", "link", "nz/co/siliconst/ui5/metaui/plugins/controls/LinkPlugin");
        this.registerPluginPath("string", "password", "nz/co/siliconst/ui5/metaui/plugins/controls/PasswordPlugin");
        this.registerPluginPath("string", "email", "nz/co/siliconst/ui5/metaui/plugins/controls/EmailPlugin");
        // Phase 1 Mappings
        this.registerPluginPath("string", "fileUploader", "nz/co/siliconst/ui5/metaui/plugins/controls/FileUploaderPlugin");
        this.registerPluginPath("array", "multiSelect", "nz/co/siliconst/ui5/metaui/plugins/controls/MultiSelectPlugin");
        this.registerPluginPath("array", "multiInput", "nz/co/siliconst/ui5/metaui/plugins/controls/MultiInputPlugin");
        this.registerPluginPath("number", "slider", "nz/co/siliconst/ui5/metaui/plugins/controls/SliderPlugin");
        this.registerPluginPath("number", "rating", "nz/co/siliconst/ui5/metaui/plugins/controls/RatingIndicatorPlugin");
        this.registerPluginPath("string", "messageStrip", "nz/co/siliconst/ui5/metaui/plugins/controls/MessageStripPlugin");
        // Phase 5 Mappings (Hardware)
        this.registerPluginPath("string", "camera", "nz/co/siliconst/ui5/metaui/plugins/controls/CameraPlugin");
        this.registerPluginPath("string", "signature", "nz/co/siliconst/ui5/metaui/plugins/controls/SignaturePlugin");
        this.registerPluginPath("object", "location", "nz/co/siliconst/ui5/metaui/plugins/controls/GeolocationPlugin");
        this.registerPluginPath("string", "scanner", "nz/co/siliconst/ui5/metaui/plugins/controls/BarcodeScannerPlugin");
        this.registerPluginPath("string", "voiceInput", "nz/co/siliconst/ui5/metaui/plugins/controls/VoiceInputPlugin");
        this.registerPluginPath("string", "richText", "nz/co/siliconst/ui5/metaui/plugins/controls/RichTextPlugin");
        // Actions & Datasources
        this.registerPluginPath("string", "urlButton", "nz/co/siliconst/ui5/metaui/plugins/actions/UrlNavigationActionPlugin");
        this.registerPluginPath("string", "submitButton", "nz/co/siliconst/ui5/metaui/plugins/actions/SubmitFormActionPlugin");
        this.registerPluginPath("string", "odataSelect", "nz/co/siliconst/ui5/metaui/plugins/datasources/ODataListBindingPlugin");
        this.registerPluginPath("string", "remoteDropdown", "nz/co/siliconst/ui5/metaui/plugins/datasources/RemoteDropdownPlugin");
        this.registerPluginPath("string", "liveSearch", "nz/co/siliconst/ui5/metaui/plugins/datasources/LiveSearchPlugin");
        this.registerPluginPath("string", "remoteValueHelp", "nz/co/siliconst/ui5/metaui/plugins/datasources/RemoteValueHelpPlugin");
        // Layouts
        this.registerLayoutPath("form", "nz/co/siliconst/ui5/metaui/layouts/FormLayout");
        this.registerLayoutPath("table", "nz/co/siliconst/ui5/metaui/layouts/TableLayout");
        this.registerLayoutPath("wizard", "nz/co/siliconst/ui5/metaui/layouts/WizardLayout");
        this.registerLayoutPath("compact", "nz/co/siliconst/ui5/metaui/layouts/CompactLayout");
    }
    PluginRegistry.getInstance = function () {
        if (!PluginRegistry.instance) {
            PluginRegistry.instance = new PluginRegistry();
        }
        return PluginRegistry.instance;
    };
    PluginRegistry.prototype.registerPluginPath = function (type, widgetName, path) {
        var key = widgetName ? "".concat(type, ":").concat(widgetName) : type;
        this.fieldIndex[key] = path;
    };
    PluginRegistry.prototype.registerActionPath = function (actionName, path) {
        this.actionIndex[actionName] = path;
    };
    PluginRegistry.prototype.registerLayoutPath = function (strategy, path) {
        this.layoutIndex[strategy] = path;
    };
    PluginRegistry.prototype.getFieldPath = function (type, widgetName) {
        var path;
        if (widgetName) {
            path = this.fieldIndex["".concat(type, ":").concat(widgetName)];
        }
        if (!path) {
            path = this.fieldIndex[type];
        }
        if (!path) {
            throw new Error("No plugin path mapped for FieldType: ".concat(type, " (widget: ").concat(widgetName, ")"));
        }
        return path;
    };
    PluginRegistry.prototype.getLayoutPath = function (strategy) {
        var path = this.layoutIndex[strategy];
        if (!path) {
            throw new Error("No layout path mapped for strategy: ".concat(strategy));
        }
        return path;
    };
    /**
     * Statically traverses the schema structure to identify all required plugins
     * and layouts without actually instantiating them.
     *
     * @param {ISchema} schema The root JSON schema payload to traverse
     * @returns {Set<string>} A distinct set of UI5 module paths required to render the schema
     */
    PluginRegistry.prototype.getPathsToLoad = function (schema) {
        var _this = this;
        var pathsToLoad = new Set();
        // 1. Gather layout strategy
        var strategy = schema.layoutStrategy || (schema.type === "array" ? "table" : "form");
        pathsToLoad.add(this.getLayoutPath(strategy));
        // 2. Recursively gather field plugins
        var scanProperties = function (props) {
            var _a, _b;
            for (var key in props) {
                var prop = props[key];
                try {
                    pathsToLoad.add(_this.getFieldPath(prop.type || "string", (_a = prop.ui) === null || _a === void 0 ? void 0 : _a.widget));
                }
                catch (e) {
                    var msg = "[MetaUI LazyLoad] Could not find mapped plugin for field ".concat(key, ": ").concat(e.message);
                    Logger_1.Logger.error(msg);
                    throw new Error(msg);
                }
                if (prop.properties)
                    scanProperties(prop.properties);
                if (prop.items && prop.items.properties)
                    scanProperties(prop.items.properties);
                if (prop.items && prop.items.type) {
                    try {
                        pathsToLoad.add(_this.getFieldPath(prop.items.type, (_b = prop.items.ui) === null || _b === void 0 ? void 0 : _b.widget));
                    }
                    catch (e) {
                        var msg = "[MetaUI LazyLoad] Could not find mapped plugin for array item type ".concat(prop.items.type, ": ").concat(e.message);
                        Logger_1.Logger.error(msg);
                        throw new Error(msg);
                    }
                }
            }
        };
        if (schema.properties) {
            scanProperties(schema.properties);
        }
        else if (schema.items && schema.items.properties) {
            scanProperties(schema.items.properties);
        }
        return pathsToLoad;
    };
    /**
     * Defers the generation of the UI until all required UI5 modules have been
     * downloaded asynchronously. Maintains a cache of active promises to prevent
     * redundant network requests for the same module.
     *
     * @param {ISchema} schema The root JSON schema payload to parse
     * @returns {Promise<void>} Resolves when all dependencies are securely in the UI5 require cache
     */
    PluginRegistry.prototype.preloadDependencies = function (schema) {
        return __awaiter(this, void 0, void 0, function () {
            var pathsToLoad, promises;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        pathsToLoad = this.getPathsToLoad(schema);
                        promises = Array.from(pathsToLoad).map(function (path) {
                            if (!_this.activePromises[path]) {
                                _this.activePromises[path] = new Promise(function (resolve, reject) {
                                    sap.ui.require([path], function (Module) { return resolve(Module); }, function (err) {
                                        Logger_1.Logger.error("Failed to lazy load module: ".concat(path));
                                        // CRITICAL: Delete from cache so future attempts can retry the network request
                                        delete _this.activePromises[path];
                                        reject(err);
                                    });
                                });
                            }
                            return _this.activePromises[path];
                        });
                        return [4 /*yield*/, Promise.all(promises)];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Extracts a valid constructor from a dynamically required module.
     */
    PluginRegistry.prototype.extractConstructor = function (Module) {
        if (!Module)
            return null;
        if (typeof Module === "function")
            return Module;
        if (Module.default && typeof Module.default === "function")
            return Module.default;
        // Handle namespace exports (e.g. { FormLayout: class... })
        var keys = Object.keys(Module);
        for (var _i = 0, keys_1 = keys; _i < keys_1.length; _i++) {
            var key = keys_1[_i];
            if (typeof Module[key] === "function") {
                return Module[key];
            }
        }
        return null;
    };
    PluginRegistry.prototype.getPluginScore = function (type, widgetName) {
        try {
            var path = this.getFieldPath(type, widgetName);
            var Module = sap.ui.require(path);
            var Constructor = this.extractConstructor(Module);
            if (Constructor && typeof Constructor.layoutScore === "number") {
                return Constructor.layoutScore;
            }
        }
        catch (e) {
            // Ignore if module not loaded or mapping missing, fallback to 1
        }
        return 1;
    };
    PluginRegistry.prototype.isPluginNativelyWide = function (type, widgetName) {
        try {
            var path = this.getFieldPath(type, widgetName);
            var Module = sap.ui.require(path);
            var Constructor = this.extractConstructor(Module);
            if (Constructor && typeof Constructor.isNativelyWide === "boolean") {
                return Constructor.isNativelyWide;
            }
        }
        catch (e) {
            // Ignore errors, default false
        }
        return false;
    };
    /**
     * Instantiates the requested plugin for the given field type.
     */
    PluginRegistry.prototype.getPlugin = function (type, widgetName) {
        var path = this.getFieldPath(type, widgetName);
        var Module = sap.ui.require(path);
        var PluginClass = this.extractConstructor(Module);
        if (!PluginClass) {
            throw new Error("[MetaUI Plugin Instantiation] Plugin ".concat(path, " was not preloaded or has no constructor!"));
        }
        return new PluginClass();
    };
    /**
     * Instantiates the requested layout manager for the given strategy.
     */
    PluginRegistry.prototype.getLayout = function (strategy) {
        var path = this.getLayoutPath(strategy);
        var Module = sap.ui.require(path);
        var LayoutClass = this.extractConstructor(Module);
        if (!LayoutClass) {
            throw new Error("[MetaUI Layout Instantiation] Layout ".concat(path, " was not preloaded or has no constructor!"));
        }
        return new LayoutClass();
    };
    return PluginRegistry;
}());
exports.PluginRegistry = PluginRegistry;
