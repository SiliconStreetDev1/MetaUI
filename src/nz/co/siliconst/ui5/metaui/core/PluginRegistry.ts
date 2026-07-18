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
    private plugins: Map<string, new () => IPlugin> = new Map();

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
     * Registers a new UI control plugin against a specific schema primitive type (and optional widget).
     * @param type The primitive FieldType (e.g., 'string', 'date').
     * @param pluginConstructor The class constructor for the plugin.
     * @param widgetName Optional widget specific override (e.g., 'textArea').
     */
    public register(type: FieldType, pluginConstructor: new () => IPlugin, widgetName?: string): void {
        const key = widgetName ? `${type}:${widgetName}` : type;
        this.plugins.set(key, pluginConstructor);
    }

    /**
     * Instantiates and returns a new plugin based on the requested primitive type and widget.
     * @param type The primitive FieldType to look up.
     * @param widgetName Optional widget specific override.
     * @throws Error if no plugin has been registered for the provided type.
     * @returns A newly instantiated plugin ready for rendering.
     */
    public getPlugin(type: FieldType, widgetName?: string): IPlugin {
        let PluginClass;
        
        // 1. Attempt specific widget lookup
        if (widgetName) {
            PluginClass = this.plugins.get(`${type}:${widgetName}`);
        }
        
        // 2. Fallback to primitive type
        if (!PluginClass) {
            PluginClass = this.plugins.get(type);
        }

        if (!PluginClass) {
            throw new Error(`[MetaUI] No plugin registered for FieldType: ${type}`);
        }
        
        return new PluginClass();
    }
}
