"use strict";
/**
 * @file Engine.ts
 * @description The central orchestrator that routes data between the Layout Factory and Plugin Registry (v2).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.Engine = void 0;
var ConditionEngine_1 = require("./ConditionEngine");
var PluginRegistry_1 = require("./PluginRegistry");
var Text_1 = require("sap/m/Text");
var Logger_1 = require("../utils/Logger");
var DefaultLayoutGenerator_1 = require("./DefaultLayoutGenerator");
var Messaging_1 = require("sap/ui/core/Messaging");
/**
 * The Engine is responsible for translating a normalized schema into a physical UI5 layout.
 * It delegates layout generation to the configured `LayoutManager` and field generation to the `PluginRegistry`.
 * It strictly routes execution flow and tracks active plugins for validation.
 * It embodies the "Plugin-First Philosophy" by routing all complex field and layout rendering
 * through discrete, decoupled plugins rather than handling native overrides.
 *
 * @namespace nz.co.siliconst.ui5.metaui.core
 * @public
 */
var Engine = /** @class */ (function () {
    /**
     * Initializes a new Engine instance.
     * @param editable Whether the engine should render form fields as editable or read-only.
     * @param useMessageManager Whether to delegate visual state to UI5 MessageManager.
     * @param pluginRegistry Optional injected plugin registry. Defaults to singleton.
     */
    function Engine(editable, useMessageManager, pluginRegistry) {
        if (editable === void 0) { editable = true; }
        if (useMessageManager === void 0) { useMessageManager = false; }
        /** Handles dynamic conditional logic across the active form. */
        this.conditionEngine = null;
        /** Array of all instantiated plugins generated during the current build. */
        this.activePlugins = [];
        /** Tracks whether the entire engine is running in Editable mode. */
        this.isEditable = true;
        /** Tracks if any fields or sub-layouts failed to render, requiring a warning strip. */
        this.hasPartialRenderingErrors = false;
        /** Tracks whether the engine should delegate visual state to the global MessageManager. */
        this.useMessageManager = false;
        this.isEditable = editable;
        this.useMessageManager = useMessageManager;
        this.pluginRegistry = pluginRegistry || PluginRegistry_1.PluginRegistry.getInstance();
    }
    /**
     * Bootstraps the layout generation process by resolving the correct layout strategy.
     *
     * @param schema The normalized JSON schema representing the view.
     * @param model The active StateManager JSONModel instance.
     * @param modelName The UI5 model alias used for isolation.
     * @param onSubmit Callback fired when form is submitted.
     * @param engineScopeId Deterministic scope ID for this engine instance.
     * @param onChange Callback fired when field values change.
     * @returns The generated root UI5 Control container.
     */
    Engine.prototype.build = function (schema, model, modelName, onSubmit, engineScopeId, onChange) {
        var _this = this;
        if (modelName === void 0) { modelName = "meta"; }
        this.conditionEngine = new ConditionEngine_1.ConditionEngine(schema);
        this.activePlugins = [];
        this.activeModel = model;
        this.engineScopeId = engineScopeId;
        this.onChange = function (isValid, fieldKey, errorMessage, controlId) {
            if (_this.conditionEngine && fieldKey) {
                _this.conditionEngine.handleEvent(fieldKey, isValid);
            }
            if (onChange) {
                onChange(isValid, fieldKey, errorMessage, controlId);
            }
        };
        try {
            var layoutStrategy = schema.layoutStrategy || (schema.type === "array" ? "table" : "form");
            var layoutManager = this.pluginRegistry.getLayout(layoutStrategy);
            return layoutManager.render(schema, modelName, this, onSubmit);
        }
        catch (error) {
            this.hasPartialRenderingErrors = true;
            var msg = error.message;
            Logger_1.Logger.error("[MetaUI Engine] Critical error during layout generation", msg);
            Logger_1.Logger.showErrorPopup("Engine failed to generate the layout.\n\nDetails: ".concat(msg));
            return new Text_1.default({ text: "Critical Layout Error" });
        }
    };
    /**
     * Instantiates the correct plugin for a specific field based on type and widget hints,
     * and tracks the plugin for global validation.
     *
     * @param fieldMeta The metadata schema specific to the field.
     * @param bindingPath The JSON path representing the field within the payload.
     * @param modelName The UI5 JSONModel name used for data binding.
     * @returns The generated UI5 Control for the field.
     */
    Engine.prototype.generateField = function (fieldMeta, bindingPath, modelName, isTemplate) {
        var _a;
        if (isTemplate === void 0) { isTemplate = false; }
        try {
            var plugin = this.pluginRegistry.getPlugin(fieldMeta.type || "string", (_a = fieldMeta.ui) === null || _a === void 0 ? void 0 : _a.widget);
            if (typeof plugin.setEditable === "function") {
                plugin.setEditable(this.isEditable);
            }
            if (typeof plugin.setUseMessageManager === "function") {
                plugin.setUseMessageManager(this.useMessageManager);
            }
            if (!isTemplate) {
                this.activePlugins.push({ plugin: plugin, path: bindingPath });
            }
            var scopeId = isTemplate ? undefined : this.engineScopeId;
            var control = plugin.render(fieldMeta, bindingPath, modelName, scopeId, this.onChange, this.activeModel);
            if (this.conditionEngine) {
                this.conditionEngine.registerPlugin(bindingPath, plugin);
            }
            return control;
        }
        catch (error) {
            this.hasPartialRenderingErrors = true;
            var msg = error.message;
            Logger_1.Logger.error("[MetaUI Engine] Failed to generate field at ".concat(bindingPath), msg);
            Logger_1.Logger.showErrorPopup("Failed to generate field '".concat(bindingPath, "'.\n\nDetails: ").concat(msg));
            return new Text_1.default({ text: "[Error generating field ".concat(bindingPath, "]") });
        }
    };
    /**
     * Generates a sub-layout (like an embedded table or nested form) without
     * destroying the current Engine state or Condition tracking.
     *
     * @param schema The normalized JSON schema representing the view.
     * @param modelName The UI5 JSONModel name used for data binding (defaults to "meta").
     * @param bindingPath Optional path to bind the sub-layout to a specific array/object property.
     * @returns The generated root UI5 Control container.
     */
    Engine.prototype.generateLayout = function (schema, modelName, bindingPath) {
        try {
            if (DefaultLayoutGenerator_1.DefaultLayoutGenerator.ensureLayout(schema)) {
                Logger_1.Logger.warn("[MetaUI Engine] Missing 'uiLayout' array in sub-schema for ".concat(bindingPath, ". Synthesized a default layout mapping."));
            }
            var layoutStrategy = schema.layoutStrategy || (schema.type === "array" ? "table" : "form");
            var layoutManager = this.pluginRegistry.getLayout(layoutStrategy);
            return layoutManager.render(schema, modelName, this, undefined, bindingPath);
        }
        catch (error) {
            this.hasPartialRenderingErrors = true;
            var msg = error.message;
            Logger_1.Logger.error("[MetaUI Engine] Critical error generating sub-layout for ".concat(bindingPath), msg);
            Logger_1.Logger.showErrorPopup("Engine failed to generate a sub-layout.\n\nDetails: ".concat(msg));
            return new Text_1.default({ text: "Critical Sub-Layout Error" });
        }
    };
    /**
     * Iterates through all active plugins and triggers their internal validation pipelines.
     *
     * @param applyVisualState If true, explicitly instructs the plugin to natively paint its own ValueState.
     * @returns {IPluginValidationResult[]} Array of validation error objects. Empty array if valid.
     */
    Engine.prototype.validateAll = function (applyVisualState) {
        if (applyVisualState === void 0) { applyVisualState = false; }
        var errors = [];
        for (var _i = 0, _a = this.activePlugins; _i < _a.length; _i++) {
            var item = _a[_i];
            try {
                var result = item.plugin.validate();
                if (applyVisualState && typeof item.plugin.setVisualValidationState === "function") {
                    item.plugin.setVisualValidationState(result.isValid, result.errorMessage);
                }
                if (!result.isValid) {
                    // Ensure the path is bound to the error so GeneratorHost knows where to target it
                    result.fieldKey = result.fieldKey || item.path.replace(/^\//, "");
                    errors.push(result);
                    // Add console log to find which plugin fails silently
                    Logger_1.Logger.error("[MetaUI Validation] Plugin failed validation silently:", item.path || item.plugin.constructor.name);
                }
            }
            catch (error) {
                Logger_1.Logger.error("[MetaUI Engine] Error validating plugin at ".concat(item.path), error.message);
            }
        }
        return errors;
    };
    /**
     * Retrieves an active plugin instance by its absolute binding path.
     * Useful for programmatic field manipulation (e.g., custom error injection).
     *
     * @param path The binding path (e.g. "/General/CustomerName").
     * @returns {IPlugin | undefined} The plugin instance, or undefined if not found.
     */
    Engine.prototype.getPluginByPath = function (path) {
        var cleanPath = path.startsWith("/") ? path : "/".concat(path);
        var match = this.activePlugins.find(function (p) { return p.path === cleanPath || p.path === "/".concat(cleanPath); });
        return match ? match.plugin : undefined;
    };
    /**
     * Cleans up internal state and destroys the condition engine to prevent memory leaks.
     */
    Engine.prototype.destroy = function () {
        var _this = this;
        if (this.conditionEngine) {
            this.conditionEngine.destroy();
            this.conditionEngine = null;
        }
        // ------------------------------------------------------------------------
        // Ghost Error Prevention
        // Flush MessageManager for active plugins before destroying their controls
        // ------------------------------------------------------------------------
        var messageManager = Messaging_1.default;
        var existingMessages = messageManager.getMessageModel().getData();
        var messagesToRemove = [];
        var _loop_1 = function (item) {
            if (this_1.activeModel) {
                var targetPath_1 = "/".concat(item.path.replace(/^\//, ""));
                var matched = existingMessages.filter(function (msg) {
                    return msg.getTarget() === targetPath_1 && msg.getMessageProcessor() && msg.getMessageProcessor().getId() === _this.activeModel.getId();
                });
                messagesToRemove.push.apply(messagesToRemove, matched);
            }
            if (typeof item.plugin.destroy === "function") {
                item.plugin.destroy();
            }
        };
        var this_1 = this;
        for (var _i = 0, _a = this.activePlugins; _i < _a.length; _i++) {
            var item = _a[_i];
            _loop_1(item);
        }
        if (messagesToRemove.length > 0) {
            messageManager.removeMessages(messagesToRemove);
        }
        this.activePlugins = [];
    };
    return Engine;
}());
exports.Engine = Engine;
