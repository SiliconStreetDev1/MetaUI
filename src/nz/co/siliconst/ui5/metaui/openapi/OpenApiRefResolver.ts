/**
 * @file OpenApiRefResolver.ts
 * @description Utility class for resolving local $ref pointers within an OpenAPI document.
 */
import { Logger } from "../utils/Logger";

/**
 * Utility class for resolving local $ref pointers within an OpenAPI document.
 * 
 * @public
 */
export class OpenApiRefResolver {
    /**
     * Recursively traverses a local JSON Pointer $ref path (e.g., '#/components/schemas/Pet')
     * and extracts the target object from the Swagger root document.
     * External URLs or invalid references are safely ignored.
     * 
     * @param {string} refUrl The $ref string path.
     * @param {any} openApiRoot The root OpenAPI document to query against.
     * @param {number} depth The current recursive depth count, used to prevent infinite loops.
     * @returns {any} The resolved schema object, or null if unresolvable.
     */
    public static resolve(refUrl: string, openApiRoot: unknown, depth: number = 0): unknown {
        if (!refUrl || !refUrl.startsWith("#/")) {
            Logger.debug(`[MetaUI OpenApiBuilder] Ignoring non-local or empty $ref: ${refUrl}`, "OpenApiBuilder");
            return null; // Ignore external URLs per architectural rules
        }

        // Circular Reference Limit:
        // A hard limit is enforced to prevent stack overflow exceptions caused by infinitely 
        // recursive structures (e.g., a Tree node that references another Tree node).
        if (depth > 10) {
            Logger.error(`[MetaUI OpenApiBuilder] Circular or overly deep $ref detected: ${refUrl}`, null, "OpenApiBuilder");
            return null;
        }

        // Path Segment Parsing:
        // The '#/' prefix is stripped, and the remaining path is split by '/'.
        // We incrementally descend into the swagger root using these segments.
        const pathSegments = refUrl.substring(2).split("/");
        let current = openApiRoot;

        for (const segment of pathSegments) {
            if (current && typeof current === "object" && segment in current) {
                current = (current as Record<string, unknown>)[segment];
            } else {
                Logger.error(`[MetaUI OpenApiBuilder] Failed to resolve local $ref: ${refUrl}`, null, "OpenApiBuilder");
                return null;
            }
        }

        // Deep Resolution Recursion:
        // If the resolved target is itself a reference pointer, recursively resolve again
        // until we reach a terminal structure or hit the recursion depth limit.
        if (current && typeof current === "object" && (current as Record<string, unknown>).$ref) {
            return this.resolve((current as Record<string, unknown>).$ref as string, openApiRoot, depth + 1);
        }

        return current;
    }
}
