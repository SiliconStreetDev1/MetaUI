"use strict";
/**
 * @file ConditionEngine.ts
 * @description Evaluates dynamic rules to alter the schema in real-time.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConditionEngine = exports.OperatorRegistry = void 0;
var Registry_1 = require("./Registry");
exports.OperatorRegistry = new Registry_1.Registry("Operators");
// Register basic default operators
exports.OperatorRegistry.register("==", function (a, b) { return a == b; });
exports.OperatorRegistry.register("===", function (a, b) { return a === b; });
exports.OperatorRegistry.register("!=", function (a, b) { return a != b; });
exports.OperatorRegistry.register("!==", function (a, b) { return a !== b; });
exports.OperatorRegistry.register(">", function (a, b) { return a > b; });
exports.OperatorRegistry.register("<", function (a, b) { return a < b; });
exports.OperatorRegistry.register(">=", function (a, b) { return a >= b; });
exports.OperatorRegistry.register("<=", function (a, b) { return a <= b; });
/**
 * Engine that listens to the EventBus and evaluates cross-field dependencies (e.g. visibleOn, enabledOn).
 * It delegates actual evaluations to the configurable `OperatorRegistry`.
 *
 * @namespace nz.co.siliconst.ui5.metaui.core
 * @public
 */
var ConditionEngine = /** @class */ (function () {
    /**
     * Initializes the ConditionEngine with the active schema.
     * @param schema The current UI layout schema.
     */
    function ConditionEngine(schema) {
        /** Internal map tracking active plugins against their binding paths for real-time state updates. */
        this.plugins = new Map();
        this.schema = schema;
    }
    /**
     * Internal handler to evaluate business rules when a field is updated.
     * @param fieldKey The key of the field that was changed
     * @param isValid Whether the field is currently valid
     */
    ConditionEngine.prototype.handleEvent = function (fieldKey, isValid) {
        // Evaluate conditions via registered operators if a rule system is added later
    };
    /**
     * Registers a rendered plugin so the condition engine can push dynamic state updates to it.
     *
     * @param bindingPath The JSON path representing the field within the payload.
     * @param plugin The instantiated plugin handling the field.
     */
    ConditionEngine.prototype.registerPlugin = function (bindingPath, plugin) {
        this.plugins.set(bindingPath, plugin);
    };
    /**
     * Cleans up listeners to prevent memory leaks on destruction.
     */
    ConditionEngine.prototype.destroy = function () {
        this.plugins.clear();
    };
    return ConditionEngine;
}());
exports.ConditionEngine = ConditionEngine;
