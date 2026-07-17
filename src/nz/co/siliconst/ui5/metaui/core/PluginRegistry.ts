/**
 * @file PluginRegistry.ts
 * @description Centralized hub for mapping UI5 controls to SAP schema data types.
 * Enforces the Registry Pattern to decouple the core engine from specific UI5 control implementations.
 */

import { IPlugin } from "../interfaces/IPlugin";
import { FieldType } from "../interfaces/ISchema";

/**
 * Singleton registry that manages the lifecycle and lookup of UI5 plugin constructors.
 */
export class PluginRegistry {
    private static instance: PluginRegistry;
    
    /** Internal map linking string types to their respective constructor functions. */
    private plugins: Map<FieldType, new () => IPlugin> = new Map();

    private constructor() {
        // Enforce singleton
    }

    /**
     * Retrieves the singular instance of the PluginRegistry.
     * @returns The PluginRegistry singleton.
     */
    public static getInstance(): PluginRegistry {
        if (!PluginRegistry.instance) {
            PluginRegistry.instance = new PluginRegistry();
        }
        return PluginRegistry.instance;
    }

    /**
     * Registers a new UI control plugin against a specific schema primitive type.
     * @param type The primitive FieldType (e.g., 'string', 'date').
     * @param pluginConstructor The class constructor for the plugin.
     */
    public register(type: FieldType, pluginConstructor: new () => IPlugin): void {
        this.plugins.set(type, pluginConstructor);
    }

    /**
     * Instantiates and returns a new plugin based on the requested primitive type.
     * @param type The primitive FieldType to look up.
     * @throws Error if no plugin has been registered for the provided type.
     * @returns A newly instantiated plugin ready for rendering.
     */
    public getPlugin(type: FieldType): IPlugin {
        const PluginClass = this.plugins.get(type);
        if (!PluginClass) {
            throw new Error(`[MetaUI] No plugin registered for FieldType: ${type}`);
        }
        return new PluginClass();
    }
}
