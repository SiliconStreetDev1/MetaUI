/**
 * @file Registry.ts
 * @description Universal generic registry pattern used across the MetaUI library 
 * for registering and resolving decoupled plugins (Layouts, Controls, Validators, etc).
 */

import { Logger } from "../utils/Logger";

/**
 * Universal generic registry pattern used across the MetaUI library 
 * for registering and resolving decoupled plugins (Layouts, Controls, Validators, etc).
 * 
 * @template T The type of item being stored in the registry.
 * @namespace nz.co.siliconst.ui5.metaui.core
 * @public
 */
export class Registry<T> {
    /** The internal map storing the registered items. */
    public readonly items = new Map<string, T>();

    constructor(public readonly registryName: string = "Registry") {}

    /**
     * Registers a new item (plugin/layout/validator) into the registry.
     *
     * Replacing an occupied key is permitted - it is how a consumer substitutes a built-in plugin, layout or
     * validator - but it is reported at **error** level, not warning. `Logger.warn` routes to `Log.warning`, which
     * UI5 discards at its default log level of `ERROR` before it even reaches the log buffer, so swapping out a
     * built-in for an entire application produced literally no observable output in a default-configured app.
     * There is no way to test a key for availability first either, so the log entry is the only signal there is.
     *
     * @param key The unique string identifier.
     * @param item The implementation class or instance.
     */
    public register(key: string, item: T): void {
        if (this.items.has(key)) {
            Logger.error(`[MetaUI] ${this.registryName}: Overwriting existing key '${key}'.`);
        }
        this.items.set(key, item);
    }

    /**
     * Retrieves an item by its key.
     * @param key The unique string identifier.
     * @returns The registered item, or undefined if not found.
     */
    public get(key: string): T | undefined {
        return this.items.get(key);
    }

    /**
     * Checks whether a key is registered in the registry.
     * @param key The unique string identifier.
     * @returns True if the key exists in the registry.
     */
    public has(key: string): boolean {
        return this.items.has(key);
    }

    /**
     * Retrieves an item by its key, throwing an error if it doesn't exist.
     * @param key The unique string identifier.
     * @returns The registered item.
     */
    public getStrict(key: string): T {
        const item = this.get(key);
        if (!item) {
            const msg = `[MetaUI] ${this.registryName}: Key '${key}' not found.`;
            Logger.error(msg);
            throw new Error(msg);
        }
        return item;
    }

    /**
     * Returns an array of all registered keys.
     */
    public getKeys(): string[] {
        return Array.from(this.items.keys());
    }

    /**
     * Clears the entire registry.
     */
    public clear(): void {
        this.items.clear();
    }
}
