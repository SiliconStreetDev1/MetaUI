/**
 * @file SandboxJSONModel.ts
 * @description The isolated JSONModel used by the MetaUI sandbox (StateManager).
 */

import JSONModel from "sap/ui/model/json/JSONModel";
import Context from "sap/ui/model/Context";

/** Callback invoked after every successful property write with the resolved absolute path. */
export type PropertyChangeHook = (absolutePath: string, value: unknown) => void;

/**
 * A JSONModel that notifies a single observer after every successful `setProperty`, whether the write
 * comes from a two-way binding (relative paths inside table rows) or from programmatic code.
 * Relative paths are resolved against their binding context so observers always receive absolute paths.
 *
 * Subclassing (rather than monkey-patching the instance) keeps the override visible to the type system
 * and to UI5's own class introspection.
 *
 * @namespace nz.co.siliconst.ui5.metaui.core
 */
export default class SandboxJSONModel extends JSONModel {
    private propertyChangeHook: PropertyChangeHook | null = null;

    /**
     * Registers (or clears, when null) the observer for property writes.
     * @param hook The observer callback.
     */
    public setPropertyChangeHook(hook: PropertyChangeHook | null): void {
        this.propertyChangeHook = hook;
    }

    /**
     * Writes a property and notifies the observer when the write succeeded.
     *
     * @param path Absolute path, or a path relative to `context`.
     * @param value The value to store.
     * @param context Optional binding context for relative paths.
     * @param asyncUpdate Whether bindings update asynchronously.
     * @returns {boolean} True if the value was written.
     */
    public setProperty(path: string, value: unknown, context?: Context, asyncUpdate?: boolean): boolean {
        const written = super.setProperty(path, value, context, asyncUpdate);
        if (written && this.propertyChangeHook) {
            this.propertyChangeHook(SandboxJSONModel.resolveAbsolutePath(path, context), value);
        }
        return written;
    }

    /**
     * Resolves a potentially relative binding path against its binding context.
     *
     * @param path The path passed to `setProperty`.
     * @param context Optional binding context.
     * @returns {string} The canonical absolute path starting with `/`.
     */
    private static resolveAbsolutePath(path: string, context?: Context): string {
        if (path.startsWith("/")) {
            return path;
        }
        if (context) {
            const basePath = context.getPath().replace(/\/$/, "");
            return `${basePath}/${path}`;
        }
        return `/${path}`;
    }

    /**
     * Releases the observer before destroying the model.
     */
    public destroy(): void {
        this.propertyChangeHook = null;
        super.destroy();
    }
}
