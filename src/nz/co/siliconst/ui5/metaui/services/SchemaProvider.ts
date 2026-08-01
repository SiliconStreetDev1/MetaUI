import { Logger } from "../utils/Logger";

/**
 * Service class responsible for resolving schemas from remote network locations.
 */
export class SchemaProvider {
    /**
     * Fetches a schema remotely over HTTP.
     * @param url The target URL.
     * @returns A promise resolving to the JSON schema object.
     */
    public static async resolve(url: string): Promise<Record<string, unknown>> {
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            return await response.json();
        } catch (e) {
            Logger.warn("[MetaUI SchemaProvider]", "Failed to fetch remote schema: " + e, "SchemaProvider");
            throw e;
        }
    }
}
