/**
 * @file OpenApiExtractor.ts
 * @description Dynamically inspects OpenAPI 2.0 and 3.0 specifications to extract all selectable
 * root schema definitions and HTTP operation endpoints, ranking the primary aggregate root first.
 */

import UI5Object from "sap/ui/base/Object";
import { OPENAPI_PREFIX } from "../constants/MetaUIConstants";
import { OpenApiParserFactory } from "../openapi/OpenApiParserFactory";
import { OpenApiRefResolver } from "../openapi/OpenApiRefResolver";
import { JsonRecord, isRecord, readString, readRecord, readStringArray } from "../utils/TypeGuards";

/**
 * Represents a selectable OpenAPI schema or operation target in the UI.
 */
export interface OpenApiTarget {
    key: string;
    text: string;
}

const GENERIC_ROOT_KEYWORDS: readonly string[] = ["root", "main", "app", "application", "payload", "document"];
const HTTP_METHODS: ReadonlySet<string> = new Set([
    "get",
    "put",
    "post",
    "delete",
    "options",
    "head",
    "patch",
    "trace"
]);

/**
 * Dynamically crawls OpenAPI/Swagger JSON specifications to find all valid
 * root endpoints and schema definitions that can be used as a `schemaTarget`.
 *
 * @extends sap.ui.base.Object
 * @alias nz.co.siliconst.ui5.metaui.swagger.OpenApiExtractor
 * @public
 */
export default class OpenApiExtractor extends UI5Object {
    /**
     * Parses an OpenAPI document and extracts an ordered array of valid targets,
     * placing the highest-scoring aggregate root schema first as `(Recommended)`.
     *
     * @param rawSchema The parsed JSON schema object.
     * @returns {OpenApiTarget[]} Array of target descriptors.
     */
    public static extractTargets(rawSchema: unknown): OpenApiTarget[] {
        const targets: OpenApiTarget[] = [];
        if (!isRecord(rawSchema)) {
            return targets;
        }

        const specVersion = OpenApiParserFactory.detectSpecVersion(rawSchema);
        const components = readRecord(rawSchema, "components");
        const oa3Schemas = components ? readRecord(components, "schemas") : undefined;
        const oa2Defs = readRecord(rawSchema, "definitions");

        if (specVersion === "3.0" && oa3Schemas) {
            for (const key of Object.keys(oa3Schemas)) {
                targets.push({
                    key: `${OPENAPI_PREFIX.COMPONENTS_SCHEMAS}${key}`,
                    text: `Schema: ${key}`
                });
            }
        }

        if (specVersion === "2.0" && oa2Defs) {
            for (const key of Object.keys(oa2Defs)) {
                targets.push({
                    key: `${OPENAPI_PREFIX.DEFINITIONS}${key}`,
                    text: `Definition: ${key}`
                });
            }
        }

        const paths = readRecord(rawSchema, "paths");
        if (paths) {
            for (const [pathKey, methods] of Object.entries(paths)) {
                if (isRecord(methods)) {
                    const escapedPath = OpenApiRefResolver.escapePointerSegment(pathKey);
                    for (const methodKey of Object.keys(methods)) {
                        if (HTTP_METHODS.has(methodKey.toLowerCase()) && isRecord(methods[methodKey])) {
                            targets.push({
                                key: `#/paths/${escapedPath}/${methodKey}`,
                                text: `Operation: ${methodKey.toUpperCase()} ${pathKey}`
                            });
                        }
                    }
                }
            }
        }

        if (targets.length > 1) {
            this.promotePrimaryTarget(targets, rawSchema, oa3Schemas, oa2Defs);
        }

        return targets;
    }

    /**
     * Scores candidate schema targets by title affinity and structural complexity,
     * moving the highest-scoring aggregate root to index 0 with a `(Recommended)` prefix.
     */
    private static promotePrimaryTarget(
        targets: OpenApiTarget[],
        rawSchema: JsonRecord,
        oa3Schemas?: JsonRecord,
        oa2Defs?: JsonRecord
    ): void {
        const info = readRecord(rawSchema, "info");
        const rawTitle = info ? readString(info, "title") || "" : "";
        const titleClean = rawTitle.toLowerCase().replace(/[^a-z0-9]/g, "");
        const titleWords = rawTitle.toLowerCase().split(/[\s_-]+/);

        let bestScore = -1;
        let bestIndex = -1;

        targets.forEach((target, index) => {
            if (!target.key.includes("/schemas/") && !target.key.includes("/definitions/")) {
                return;
            }

            const name = target.key.split("/").pop() || "";
            const nameLower = name.toLowerCase();
            const nameClean = nameLower.replace(/[^a-z0-9]/g, "");
            let score = 0;

            if (titleClean && nameClean === titleClean) score += 30;
            else if (titleClean && (titleClean.includes(nameClean) || nameClean.includes(titleClean))) score += 15;

            for (const word of titleWords) {
                if (word.length > 3 && nameLower.includes(word)) {
                    score += 5;
                }
            }
            if (GENERIC_ROOT_KEYWORDS.some((kw) => nameLower.includes(kw))) {
                score += 5;
            }

            const schemaDef = target.key.startsWith(OPENAPI_PREFIX.COMPONENTS_SCHEMAS)
                ? readRecord(oa3Schemas || {}, name)
                : readRecord(oa2Defs || {}, name);

            if (schemaDef) {
                score += this.scoreSchemaComplexity(schemaDef);
            }

            if (score > bestScore) {
                bestScore = score;
                bestIndex = index;
            }
        });

        if (bestIndex !== -1 && bestScore > 0) {
            const primary = targets.splice(bestIndex, 1)[0];
            primary.text = `(Recommended) ${primary.text}`;
            targets.unshift(primary);
        }
    }

    /**
     * Calculates a structural complexity score for a schema node based on its properties, `$ref` links, and required constraints.
     */
    private static scoreSchemaComplexity(schemaDef: JsonRecord): number {
        let score = 0;
        const scoreNode = (node: unknown): void => {
            if (!isRecord(node)) return;
            if (readString(node, "$ref")) {
                score += 20;
            }
            const props = readRecord(node, "properties");
            if (props) {
                score += Object.keys(props).length * 2;
                for (const prop of Object.values(props)) {
                    if (isRecord(prop)) {
                        if (readString(prop, "$ref")) score += 20;
                        const items = readRecord(prop, "items");
                        if (items && readString(items, "$ref")) score += 20;
                    }
                }
            }
            const req = readStringArray(node, "required");
            if (req) {
                score += req.length * 5;
            }
        };

        scoreNode(schemaDef);
        for (const compKey of ["allOf", "anyOf", "oneOf"]) {
            const list = schemaDef[compKey];
            if (Array.isArray(list)) {
                list.forEach(scoreNode);
            }
        }
        return score;
    }
}
