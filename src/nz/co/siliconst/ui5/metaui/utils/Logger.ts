/**
 * @file Logger.ts
 * @description Centralized logging utility for MetaUI.
 * Wraps sap/base/Log and provides a global toggle for debug mode.
 */

import Log from "sap/base/Log";

const DEFAULT_COMPONENT = "MetaUI";

/**
 * Centralized logging facade for the MetaUI library.
 *
 * - `debug` and `info` are gated behind {@link Logger.setDebugMode} to keep production consoles clean.
 * - `warn` and `error` are **always** emitted so schema misconfigurations, unregistered widgets and
 *   runtime failures never fail silently.
 */
export class Logger {
    private static debugMode: boolean = false;

    /**
     * Toggles the global debug mode for MetaUI.
     * @param enabled Set to true to enable debug/info logging and diagnostic error popups.
     */
    public static setDebugMode(enabled: boolean): void {
        this.debugMode = enabled;
    }

    /**
     * Checks if debug mode is currently active.
     * @returns {boolean} True when debug logging is enabled.
     */
    public static isDebugMode(): boolean {
        return this.debugMode;
    }

    /**
     * Emits a debug entry when debug mode is active.
     * @param message Primary log message.
     * @param details Optional supplementary details.
     * @param component Optional UI5 log component name.
     */
    public static debug(message: string, details?: string, component?: string): void {
        if (!this.debugMode) return;
        Log.debug(message, details, component || DEFAULT_COMPONENT);
    }

    /**
     * Emits an informational entry when debug mode is active.
     * @param message Primary log message.
     * @param details Optional supplementary details.
     * @param component Optional UI5 log component name.
     */
    public static info(message: string, details?: string, component?: string): void {
        if (!this.debugMode) return;
        Log.info(message, details, component || DEFAULT_COMPONENT);
    }

    /**
     * Emits a warning entry unconditionally (warnings must never be suppressed).
     * @param message Primary warning message.
     * @param details Optional supplementary details.
     * @param component Optional UI5 log component name.
     */
    public static warn(message: string, details?: string, component?: string): void {
        Log.warning(message, details, component || DEFAULT_COMPONENT);
    }

    /**
     * Emits an error entry unconditionally.
     * @param message Primary error message.
     * @param details Optional supplementary details.
     * @param component Optional UI5 log component name.
     */
    public static error(message: string, details?: string, component?: string): void {
        Log.error(message, details, component || DEFAULT_COMPONENT);
    }

    /**
     * Pops up a MessageBox UI alert if debug mode is active.
     * @param message Error message to display.
     * @param title Optional dialog title.
     */
    public static showErrorPopup(message: string, title?: string): void {
        if (!this.debugMode) return;
        sap.ui.require(["sap/m/MessageBox"], (MessageBox: { error: (msg: string, opts?: { title?: string }) => void }) => {
            MessageBox.error(message, { title: title || "MetaUI Error" });
        });
    }
}
