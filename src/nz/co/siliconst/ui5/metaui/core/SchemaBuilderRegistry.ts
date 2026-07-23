/**
 * @file SchemaBuilderRegistry.ts
 * @description Singleton registry for Schema Builder plugins.
 * Routes unknown JSON payloads to the appropriate parser plugin.
 */

import { ISchemaBuilderPlugin } from "../interfaces/ISchemaBuilderPlugin";
import { SchemaNormalizer } from "./SchemaNormalizer";
import { SwaggerBuilder } from "../swagger/SwaggerBuilder";
import { Logger } from "../utils/Logger";

export class SchemaBuilderRegistry {
    private static _plugins: ISchemaBuilderPlugin[] = [
        new SwaggerBuilder(),
        new SchemaNormalizer()
    ];

    /**
     * Registers a new schema builder plugin into the engine.
     * @param plugin An instance of ISchemaBuilderPlugin
     */
    public static register(plugin: ISchemaBuilderPlugin): void {
        this._plugins.push(plugin);
    }

    /**
     * Finds the first registered plugin that claims it can handle the payload.
     * @param rawSchema The raw JSON schema object to inspect.
     * @returns The matching plugin instance, or null if none match.
     */
    public static getBuilderFor(rawSchema: any): ISchemaBuilderPlugin | null {
        if (!rawSchema || typeof rawSchema !== "object") {
            return null;
        }

        for (const plugin of this._plugins) {
            if (plugin.canHandle(rawSchema)) {
                return plugin;
            }
        }
        
        Logger.warn("[SchemaBuilderRegistry]", "No suitable Schema Builder plugin found for the provided payload.");
        return null;
    }
}
