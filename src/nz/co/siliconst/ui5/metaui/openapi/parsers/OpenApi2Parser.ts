/**
 * @file OpenApi2Parser.ts
 * @description Native parser for OpenAPI 2.0 (Swagger) specifications.
 */

import { BaseOpenApiParser } from "./BaseOpenApiParser";
import { JsonRecord, readRecord } from "../../utils/TypeGuards";

/**
 * Parser plugin designed for OpenAPI 2.0 (Swagger) specifications.
 * Resolves definitions from the root `definitions` block and applies OpenAPI 2.0 constraint semantics.
 *
 * @namespace nz.co.siliconst.ui5.metaui.openapi.parsers
 * @public
 */
export class OpenApi2Parser extends BaseOpenApiParser {
    /**
     * Extracts the root `definitions` dictionary from an OpenAPI 2.0 document.
     *
     * @param root The OpenAPI 2.0 root document record.
     * @returns {JsonRecord | undefined} The `definitions` dictionary if present.
     */
    protected getDefinitionsMap(root: JsonRecord): JsonRecord | undefined {
        return readRecord(root, "definitions");
    }
}
