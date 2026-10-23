/**
 * @file OpenApi3Parser.ts
 * @description Native parser for OpenAPI 3.0.x specifications.
 */

import { BaseOpenApiParser } from "./BaseOpenApiParser";
import { JsonRecord, readRecord } from "../../utils/TypeGuards";

/**
 * Parser plugin designed for OpenAPI 3.0.x specifications.
 * Resolves schemas from `components.schemas` and applies OpenAPI 3.0 constraint semantics.
 *
 * @namespace nz.co.siliconst.ui5.metaui.openapi.parsers
 * @internal
 */
export class OpenApi3Parser extends BaseOpenApiParser {
    /**
     * Extracts the `components.schemas` dictionary from an OpenAPI 3.0 document.
     *
     * @param root The OpenAPI 3.0 root document record.
     * @returns {JsonRecord | undefined} The `components.schemas` dictionary if present.
     */
    protected getDefinitionsMap(root: JsonRecord): JsonRecord | undefined {
        const components = readRecord(root, "components");
        return components ? readRecord(components, "schemas") : undefined;
    }
}
