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
     * @param key The unique string identifier.
     * @param item The implementation class or instance.
     */
    public register(key: string, item: T): void {
        if (this.items.has(key)) {
            Logger.warn(`[MetaUI] ${this.registryName}: Overwriting existing key '${key}'.`);
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
     * Retrieves an item by its key, throwing an error if it doesn't exist.
     * @param key The unique string identifier.
     * @returns The registered item.
     */
    public getStrict(key: string): T {
        const item = this.get(key);
        if (!item) {
            throw new Error(`[MetaUI] ${this.registryName}: Key '${key}' not found.`);
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
