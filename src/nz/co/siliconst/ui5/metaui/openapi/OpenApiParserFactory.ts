/**
 * @file OpenApiParserFactory.ts
 * @description Factory class to determine and instantiate the correct Swagger parser version.
 */

import { IOpenApiParserPlugin } from "./interfaces/IOpenApiParserPlugin";
import { OpenApi2Parser } from "./parsers/OpenApi2Parser";
import { OpenApi3Parser } from "./parsers/OpenApi3Parser";
import { Logger } from "../utils/Logger";
import { isRecord } from "../utils/TypeGuards";

/**
 * Factory class responsible for analyzing a raw OpenAPI document's metadata to dynamically
 * instantiate the correct, version-specific parser plugin. This isolates structural version
 * differences from the primary Engine orchestration layer.
 *
 * @public
 */
export class OpenApiParserFactory {
    /**
     * Detects the canonical OpenAPI specification family (`"2.0"` or `"3.0"`) from a raw root document,
     * tolerating `"2.0"`, `"2.0.0"`, numeric `2.0` (`2`), `"3.0.x"`, and `"3.1.x"`.
     *
     * @param rawSchema The raw OpenAPI root document.
     * @returns {"2.0" | "3.0" | undefined} The detected specification family, or `undefined` if unrecognized.
     */
    public static detectSpecVersion(rawSchema: unknown): "2.0" | "3.0" | undefined {
        if (!isRecord(rawSchema)) {
            return undefined;
        }
        if (rawSchema.swagger !== undefined && rawSchema.swagger !== null) {
            const swaggerStr = String(rawSchema.swagger).trim();
            if (swaggerStr === "2" || swaggerStr.startsWith("2.")) {
                return "2.0";
            }
        }
        if (rawSchema.openapi !== undefined && rawSchema.openapi !== null) {
            const openapiStr = String(rawSchema.openapi).trim();
            if (openapiStr === "3" || openapiStr.startsWith("3.")) {
                return "3.0";
            }
        }
        return undefined;
    }

    /**
     * Inspects the root level structural signatures of an OpenAPI document (e.g., `swagger: "2.0"`
     * vs `openapi: "3.x"`) to instantiate the appropriate parsing engine.
     *
     * @param rawSchema The raw, unparsed OpenAPI root JSON structure.
     * @returns {IOpenApiParserPlugin} An initialized instance of the correct concrete parser plugin.
     */
    public static getParser(rawSchema: unknown): IOpenApiParserPlugin {
        if (!isRecord(rawSchema)) {
            Logger.error("[MetaUI OpenApiParserFactory] Invalid OpenAPI document provided.");
            return new OpenApi3Parser();
        }

        const version = this.detectSpecVersion(rawSchema);
        if (version === "2.0") {
            return new OpenApi2Parser();
        }
        if (version === "3.0") {
            return new OpenApi3Parser();
        }

        Logger.warn("[MetaUI OpenApiParserFactory] Unable to strictly determine OpenAPI version. Defaulting to OpenAPI 3.0 Parser.");
        return new OpenApi3Parser();
    }
}
