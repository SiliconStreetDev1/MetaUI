/**
 * @file OpenApiParserFactory.ts
 * @description Factory class to determine and instantiate the correct Swagger parser version.
 */

import { IOpenApiParserPlugin } from "./interfaces/IOpenApiParserPlugin";
import { OpenApi2Parser } from "./parsers/OpenApi2Parser";
import { OpenApi3Parser } from "./parsers/OpenApi3Parser";
import { Logger } from "../utils/Logger";

/**
 * Factory class responsible for analyzing a raw OpenAPI document's metadata to dynamically 
 * instantiate the correct, version-specific parser plugin. This isolates structural version 
 * differences from the primary Engine orchestration layer.
 * 
 * @public
 */
export class OpenApiParserFactory {
    /**
     * Inspects the root level structural signatures of an OpenAPI document (e.g., `swagger: "2.0"` 
     * vs `openapi: "3.x"`) to instantiate the appropriate parsing engine.
     * 
     * @param {any} rawSchema The raw, unparsed OpenAPI root JSON structure.
     * @returns {IOpenApiParserPlugin} An initialized instance of the correct concrete parser plugin.
     */
    public static getParser(rawSchema: any): IOpenApiParserPlugin {
        if (!rawSchema || typeof rawSchema !== "object") {
            Logger.error("[MetaUI OpenApiParserFactory] Invalid OpenAPI document provided.");
            return new OpenApi3Parser(); // Fallback
        }

        if (rawSchema.swagger === "2.0") {
            return new OpenApi2Parser();
        }

        if (rawSchema.openapi && typeof rawSchema.openapi === "string" && rawSchema.openapi.startsWith("3")) {
            return new OpenApi3Parser();
        }

        Logger.warn("[MetaUI OpenApiParserFactory] Unable to strictly determine OpenAPI version. Defaulting to OpenAPI 3.0 Parser.");
        return new OpenApi3Parser();
    }
}
