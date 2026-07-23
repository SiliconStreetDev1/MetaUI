/**
 * @file ISchemaBuilderPlugin.ts
 * @description Contract for all Schema Parsers (Native MetaUI, Swagger, etc).
 * Supports the Open-Closed principle for schema ingestion.
 */

import { ISchema } from "./ISchema";

export interface ISchemaBuilderPlugin {
    /**
     * Deterministically checks if this plugin can parse the given raw payload.
     * @param rawSchema The unparsed JSON object.
     * @returns True if this plugin can handle the schema format.
     */
    canHandle(rawSchema: any): boolean;

    /**
     * Converts the raw schema payload into a strict MetaUI ISchema.
     * @param rawSchema The raw schema JSON object.
     * @returns A strict MetaUI ISchema.
     */
    build(rawSchema: any): ISchema;
}
