"use strict";
/**
 * @file Logger.ts
 * @description Centralized logging utility for MetaUI.
 * Wraps sap/base/Log and provides a global toggle for debug mode.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.Logger = void 0;
var Logger = /** @class */ (function () {
    function Logger() {
    }
    /**
     * Toggles the global debug mode for MetaUI.
     * @param enabled Set to true to enable logging.
     */
    Logger.setDebugMode = function (enabled) {
        var _this = this;
        this.debugMode = enabled;
        if (enabled && !this.logInstance) {
            sap.ui.require(["sap/base/Log"], function (Log) {
                _this.logInstance = Log;
            });
        }
    };
    /**
     * Checks if debug mode is currently active.
     */
    Logger.isDebugMode = function () {
        return this.debugMode;
    };
    Logger.debug = function (message, details, component) {
        if (!this.debugMode)
            return;
        if (this.logInstance) {
            this.logInstance.debug(message, details, component || "MetaUI");
        }
        else {
            console.debug("[MetaUI] ".concat(message), details || "");
        }
    };
    Logger.info = function (message, details, component) {
        if (!this.debugMode)
            return;
        if (this.logInstance) {
            this.logInstance.info(message, details, component || "MetaUI");
        }
        else {
            console.info("[MetaUI] ".concat(message), details || "");
        }
    };
    Logger.warn = function (message, details, component) {
        if (!this.debugMode)
            return;
        if (this.logInstance) {
            this.logInstance.warning(message, details, component || "MetaUI");
        }
        else {
            console.warn("[MetaUI] ".concat(message), details || "");
        }
    };
    Logger.error = function (message, details, component) {
        if (this.logInstance) {
            this.logInstance.error(message, details, component || "MetaUI");
        }
        else {
            console.error("[MetaUI Error] ".concat(message), details || "");
        }
    };
    /**
     * Pops up a MessageBox UI alert if debug mode is active.
     */
    Logger.showErrorPopup = function (message, title) {
        if (!this.debugMode)
            return;
        sap.ui.require(["sap/m/MessageBox"], function (MessageBox) {
            MessageBox.error(message, { title: title || "MetaUI Error" });
        });
    };
    Logger.debugMode = false;
    Logger.logInstance = null;
    return Logger;
}());
exports.Logger = Logger;
