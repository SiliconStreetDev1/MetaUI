/**
 * @file Logger.ts
 * @description Centralized logging utility for MetaUI.
 * Wraps sap/base/Log and provides a global toggle for debug mode.
 */

export class Logger {
    private static debugMode: boolean = false;
    private static logInstance: any = null;

    /**
     * Toggles the global debug mode for MetaUI.
     * @param enabled Set to true to enable logging.
     */
    public static setDebugMode(enabled: boolean): void {
        this.debugMode = enabled;
        if (enabled && !this.logInstance) {
            sap.ui.require(["sap/base/Log"], (Log: any) => {
                this.logInstance = Log;
            });
        }
    }

    /**
     * Checks if debug mode is currently active.
     */
    public static isDebugMode(): boolean {
        return this.debugMode;
    }

    public static debug(message: string, details?: string, component?: string): void {
        if (!this.debugMode) return;
        if (this.logInstance) {
            this.logInstance.debug(message, details, component || "MetaUI");
        } else {
            console.debug(`[MetaUI] ${message}`, details || "");
        }
    }

    public static info(message: string, details?: string, component?: string): void {
        if (!this.debugMode) return;
        if (this.logInstance) {
            this.logInstance.info(message, details, component || "MetaUI");
        } else {
            console.info(`[MetaUI] ${message}`, details || "");
        }
    }

    public static warn(message: string, details?: string, component?: string): void {
        if (!this.debugMode) return;
        if (this.logInstance) {
            this.logInstance.warning(message, details, component || "MetaUI");
        } else {
            console.warn(`[MetaUI] ${message}`, details || "");
        }
    }

    public static error(message: string, details?: string, component?: string): void {
        if (!this.debugMode) return;
        if (this.logInstance) {
            this.logInstance.error(message, details, component || "MetaUI");
        } else {
            console.error(`[MetaUI Error] ${message}`, details || "");
        }
    }

    /**
     * Pops up a MessageBox UI alert if debug mode is active.
     */
    public static showErrorPopup(message: string, title?: string): void {
        if (!this.debugMode) return;
        sap.ui.require(["sap/m/MessageBox"], (MessageBox: any) => {
            MessageBox.error(message, { title: title || "MetaUI Error" });
        });
    }
}
