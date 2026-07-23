/**
 * @file SwaggerRefResolver.ts
 * @description Utility class for resolving local $ref pointers within an OpenAPI document.
 */
import { Logger } from "../utils/Logger";

export class SwaggerRefResolver {
    /**
     * Recursively traverses a local JSON Pointer $ref path (e.g., '#/components/schemas/Pet')
     * and extracts the target object from the Swagger root document.
     * External URLs or invalid references are safely ignored.
     * 
     * @param {string} refUrl The $ref string path.
     * @param {any} swaggerRoot The root OpenAPI document to query against.
     * @returns {any} The resolved schema object, or null if unresolvable.
     */
    public static resolve(refUrl: string, swaggerRoot: any): any {
        if (!refUrl || !refUrl.startsWith("#/")) {
            Logger.debug(`[MetaUI SwaggerBuilder] Ignoring non-local or empty $ref: ${refUrl}`, "SwaggerBuilder");
            return null; // Ignore external URLs per architectural rules
        }

        const pathSegments = refUrl.substring(2).split("/");
        let current = swaggerRoot;

        for (const segment of pathSegments) {
            if (current && typeof current === "object" && segment in current) {
                current = current[segment];
            } else {
                Logger.error(`[MetaUI SwaggerBuilder] Failed to resolve local $ref: ${refUrl}`, null, "SwaggerBuilder");
                return null;
            }
        }

        return current;
    }
}
