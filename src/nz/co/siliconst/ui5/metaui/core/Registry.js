"use strict";
/**
 * @file Registry.ts
 * @description Universal generic registry pattern used across the MetaUI library
 * for registering and resolving decoupled plugins (Layouts, Controls, Validators, etc).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.Registry = void 0;
var Logger_1 = require("../utils/Logger");
/**
 * Universal generic registry pattern used across the MetaUI library
 * for registering and resolving decoupled plugins (Layouts, Controls, Validators, etc).
 *
 * @template T The type of item being stored in the registry.
 * @namespace nz.co.siliconst.ui5.metaui.core
 * @public
 */
var Registry = /** @class */ (function () {
    function Registry(registryName) {
        if (registryName === void 0) { registryName = "Registry"; }
        this.registryName = registryName;
        /** The internal map storing the registered items. */
        this.items = new Map();
    }
    /**
     * Registers a new item (plugin/layout/validator) into the registry.
     * @param key The unique string identifier.
     * @param item The implementation class or instance.
     */
    Registry.prototype.register = function (key, item) {
        if (this.items.has(key)) {
            Logger_1.Logger.warn("[MetaUI] ".concat(this.registryName, ": Overwriting existing key '").concat(key, "'."));
        }
        this.items.set(key, item);
    };
    /**
     * Retrieves an item by its key.
     * @param key The unique string identifier.
     * @returns The registered item, or undefined if not found.
     */
    Registry.prototype.get = function (key) {
        return this.items.get(key);
    };
    /**
     * Retrieves an item by its key, throwing an error if it doesn't exist.
     * @param key The unique string identifier.
     * @returns The registered item.
     */
    Registry.prototype.getStrict = function (key) {
        var item = this.get(key);
        if (!item) {
            var msg = "[MetaUI] ".concat(this.registryName, ": Key '").concat(key, "' not found.");
            Logger_1.Logger.error(msg);
            throw new Error(msg);
        }
        return item;
    };
    /**
     * Returns an array of all registered keys.
     */
    Registry.prototype.getKeys = function () {
        return Array.from(this.items.keys());
    };
    /**
     * Clears the entire registry.
     */
    Registry.prototype.clear = function () {
        this.items.clear();
    };
    return Registry;
}());
exports.Registry = Registry;
