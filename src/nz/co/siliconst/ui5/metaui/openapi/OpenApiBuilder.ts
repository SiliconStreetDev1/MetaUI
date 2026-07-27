/**
 * @file OpenApiBuilder.ts
 * @description Facade orchestration for translating Swagger/OpenAPI JSON into native MetaUI ISchema.
 * Strict Single Responsibility architecture delegates mapping logic to dedicated utilities and factories.
 */

import { ISchema } from "../interfaces/ISchema";
import { ISchemaBuilderPlugin } from "../interfaces/ISchemaBuilderPlugin";
import { Logger } from "../utils/Logger";
import { OpenApiParserFactory } from "./OpenApiParserFactory";
import { OpenApiHeuristicEngine } from "./heuristics/OpenApiHeuristicEngine";

/**
 * Facade orchestration for translating Swagger/OpenAPI JSON into native MetaUI ISchema.
 * Strict Single Responsibility architecture delegates mapping logic to dedicated utilities and factories.
 * 
 * @public
 */
export class OpenApiBuilder implements ISchemaBuilderPlugin {

    /**
     * Determines if the provided JSON payload is a Swagger or OpenAPI document.
     * 
     * @param {unknown} rawSchema The raw JSON schema to test.
     * @returns {boolean} True if the document contains 'openapi' or 'swagger' root keys.
     */
    public canHandle(rawSchema: unknown): boolean {
        const schema = rawSchema as Record<string, unknown>;
        return !!(schema && (schema.openapi || schema.swagger));
    }

    /**
     * Builds a strict MetaUI ISchema from the provided OpenAPI payload.
     * 
     * @param {unknown} rawSchema The OpenAPI root document.
     * @param {string} [targetDefinition] Optional target root definition.
     * @returns {ISchema} The translated MetaUI schema.
     */
    public build(rawSchema: unknown, targetDefinition?: string): ISchema {
        return OpenApiBuilder.build(rawSchema, targetDefinition);
    }

    /**
     * Asynchronously fetches a remote OpenAPI document and compiles it into a MetaUI ISchema.
     * 
     * @param {string} url The URL to fetch the JSON payload from.
     * @param {string} [targetDefinition] Optional. The specific entity schema to extract.
     * @returns {Promise<ISchema>} A Promise resolving to the compiled ISchema.
     */
    public static async fetchAndBuild(url: string, targetDefinition?: string): Promise<ISchema> {
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const openApiRoot = await response.json();
            return this.build(openApiRoot, targetDefinition);
        } catch (error) {
            const msg = "Failed to fetch Swagger JSON from URL: " + (error as Error).message;
            Logger.error("[MetaUI OpenApiBuilder]", msg);
            throw new Error(msg);
        }
    }

    /**
     * Synchronously builds a MetaUI ISchema from a provided OpenAPI root document.
     * Delegates to HeuristicEngine and OpenApiParserFactory.
     * 
     * @public
     * @param {unknown} openApiRoot The raw OpenAPI root JSON document.
     * @param {string} [targetDefinition] Optional target definition key to extract.
     * @returns {ISchema} The synthesized MetaUI schema.
     * @throws {Error} If the root object is invalid.
     */
    public static build(openApiRoot: unknown, targetDefinition?: string): ISchema {
        if (!openApiRoot || typeof openApiRoot !== "object") {
            throw new Error("[MetaUI OpenApiBuilder] Invalid Swagger root object provided.");
        }

        // 1. Run Heuristics to mutate AST (e.g., simulating oneOf)
        const heuristicEngine = new OpenApiHeuristicEngine();
        heuristicEngine.run(openApiRoot);

        // 2. Delegate to correct parser version
        const parser = OpenApiParserFactory.getParser(openApiRoot);
        return parser.parse(openApiRoot, targetDefinition);
    }
}
