/**
 * @file OpenApiRefResolver.ts
 * @description Pure utility class for resolving RFC 6901 local $ref pointers within an OpenAPI document.
 */

import { OPENAPI_PREFIX, MAX_SCHEMA_DEPTH } from "../constants/MetaUIConstants";
import { Logger } from "../utils/Logger";
import { isRecord, readRecord, readString } from "../utils/TypeGuards";

/**
 * Resolves local JSON Pointer `$ref` paths (e.g., `'#/components/schemas/Pet'` or `'#/paths/~1v1~1orders/post'`)
 * against an OpenAPI root document with circular-reference protection and RFC 6901 unescaping.
 *
 * @namespace nz.co.siliconst.ui5.metaui.openapi
 * @internal
 */
export class OpenApiRefResolver {

    /**
     * Unescapes a single RFC 6901 JSON Pointer reference token (`decodeURIComponent`, then `~1` -> `/`, then `~0` -> `~`).
     *
     * @param segment The raw pointer reference token.
     * @returns {string} The unescaped token string.
     */
    public static unescapePointerSegment(segment: string): string {
        const decoded =
            segment.includes("%") && !/%(?![0-9A-Fa-f]{2})/.test(segment)
                ? decodeURIComponent(segment)
                : segment;
        return decoded.replace(/~1/g, "/").replace(/~0/g, "~");
    }

    /**
     * Escapes a single string segment for inclusion in an RFC 6901 JSON Pointer (`~` -> `~0`, `/` -> `~1`,
     * then `%` -> `%25`).
     *
     * The exact inverse of {@link OpenApiRefResolver.unescapePointerSegment}. That method percent-decodes
     * first (RFC 6901 §6 URI-fragment form), so a literal `%` in a key — an OpenAPI path such as
     * `/a%20b/{id}` is the common case — must be percent-encoded here or the round trip silently yields a
     * different key, and the pointer resolves to an unrelated schema.
     *
     * @param segment The unescaped key or path string.
     * @returns {string} The RFC 6901 escaped pointer token.
     */
    public static escapePointerSegment(segment: string): string {
        return segment.replace(/~/g, "~0").replace(/\//g, "~1").replace(/%/g, "%25");
    }

    /**
     * Extracts the clean definition name from a local `$ref` pointer (`#/components/schemas/...`,
     * `#/definitions/...`, or `#/$defs/...`) and unescapes RFC 6901 tokens (`~1` -> `/`, `~0` -> `~`).
     *
     * @param refPath The raw `$ref` pointer string.
     * @returns {string} The unescaped definition name.
     */
    public static extractRefName(refPath: string): string {
        if (!refPath) return "";
        let key = refPath;
        if (key.startsWith(OPENAPI_PREFIX.COMPONENTS_SCHEMAS)) {
            key = key.substring(OPENAPI_PREFIX.COMPONENTS_SCHEMAS.length);
        } else if (key.startsWith(OPENAPI_PREFIX.DEFINITIONS)) {
            key = key.substring(OPENAPI_PREFIX.DEFINITIONS.length);
        } else if (key.startsWith(OPENAPI_PREFIX.DEFS)) {
            key = key.substring(OPENAPI_PREFIX.DEFS.length);
        } else if (key.startsWith("#/")) {
            const parts = key.substring(2).split("/");
            key = parts[parts.length - 1] || key;
        }
        return this.unescapePointerSegment(key);
    }

    /**
     * Iteratively traverses a local JSON Pointer `$ref` path (and any chained `$ref` targets) and extracts the target node.
     * External URLs or invalid references are safely ignored and return `null`.
     *
     * @param refUrl The `$ref` string path starting with `'#/'`.
     * @param openApiRoot The root OpenAPI or normalized ISchema document to query against.
     * @param depth Starting hop count, capped by `MAX_SCHEMA_DEPTH` to prevent circular reference loops.
     * @param activeRefs Set of currently active `$ref` pointers on the call chain.
     * @returns {unknown} The resolved schema or operation object, or `null` if unresolvable.
     */
    public static resolve(
        refUrl: string,
        openApiRoot: unknown,
        depth: number = 0,
        activeRefs: Set<string> = new Set()
    ): unknown {
        let currentRefUrl = refUrl;
        let currentDepth = depth;
        const seenRefs = new Set(activeRefs);

        while (true) {
            if (!currentRefUrl || !currentRefUrl.startsWith("#/")) {
                Logger.debug(`[MetaUI OpenApiBuilder] Ignoring non-local or empty $ref: ${currentRefUrl}`, "OpenApiBuilder");
                return null;
            }

            if (currentDepth > MAX_SCHEMA_DEPTH || seenRefs.has(currentRefUrl)) {
                Logger.error(
                    `[MetaUI OpenApiBuilder] Circular or overly deep $ref detected: ${currentRefUrl}`,
                    undefined,
                    "OpenApiBuilder"
                );
                return null;
            }

            const pathSegments = currentRefUrl
                .substring(2)
                .split("/")
                .map((segment) => this.unescapePointerSegment(segment));

            let current: unknown = openApiRoot;
            let found = true;
            for (const segment of pathSegments) {
                if (Array.isArray(current)) {
                    const idx = Number(segment);
                    if (segment !== "" && Number.isInteger(idx) && idx >= 0 && idx < current.length) {
                        current = current[idx];
                    } else {
                        found = false;
                        break;
                    }
                } else if (isRecord(current) && segment in current) {
                    current = current[segment];
                } else {
                    found = false;
                    break;
                }
            }

            if (!found && isRecord(openApiRoot)) {
                const refName = this.extractRefName(currentRefUrl);
                const fallbackDefs = readRecord(openApiRoot, "definitions") || readRecord(openApiRoot, "$defs");
                if (fallbackDefs && refName in fallbackDefs) {
                    current = fallbackDefs[refName];
                    found = true;
                }
            }

            if (!found) {
                Logger.error(
                    `[MetaUI OpenApiBuilder] Failed to resolve local $ref: ${currentRefUrl}`,
                    undefined,
                    "OpenApiBuilder"
                );
                return null;
            }

            const nestedRef = isRecord(current) ? readString(current, "$ref") : undefined;
            if (!nestedRef) {
                return current;
            }
            seenRefs.add(currentRefUrl);
            currentRefUrl = nestedRef;
            currentDepth++;
        }
    }
}
