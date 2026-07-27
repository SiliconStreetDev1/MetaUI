/**
 * @file IOpenApiParserPlugin.ts
 * @description Contract for OpenAPI schema translation implementations.
 */

import { ISchema } from "../../interfaces/ISchema";

/**
 * Interface defining the boundary for dynamic OpenAPI schema parsing.
 * Any parser plugin must implement this contract to ensure the orchestration engine
 * can seamlessly synthesize MetaUI layouts regardless of the underlying OpenAPI version.
 * 
 * @public
 */
export interface IOpenApiParserPlugin {
    /**
     * Converts a raw OpenAPI schema document into a strictly-typed MetaUI ISchema tree.
     * Implementations must handle protocol-specific mapping internally.
     * 
     * @param {any} rawSchema The raw, unparsed OpenAPI document structure.
     * @param {string} [targetDefinition] Optional name of a specific definition root to target.
     * @returns {ISchema} A completely normalized and decoupled MetaUI layout definition.
     */
    parse(rawSchema: unknown, targetDefinition?: string): ISchema;
}
