/**
 * @file SchemaProvider.ts
 * @description Service responsible for asynchronously fetching and resolving JSON Schemas from remote HTTP endpoints.
 */

import { Logger } from "../utils/Logger";
import { UrlValidator } from "../utils/UrlValidator";

/**
 * Service class responsible for resolving schemas from remote network locations.
 */
export class SchemaProvider {
    private static readonly DEFAULT_TIMEOUT_MS = 15000;

    /**
     * Fetches a schema remotely over HTTP with an AbortController timeout guard.
     *
     * @param url The target URL.
     * @param timeoutMs Optional request timeout in milliseconds (defaults to 15000).
     * @returns {Promise<Record<string, unknown>>} A promise resolving to the JSON schema object.
     */
    public static async resolve(
        url: string,
        timeoutMs: number = this.DEFAULT_TIMEOUT_MS
    ): Promise<Record<string, unknown>> {
        if (!UrlValidator.isSafeDataSourceUrl(url)) {
            const refusal = new Error(`Refused schema URL '${url}': blocked by the data source URL policy.`);
            Logger.warn("[MetaUI SchemaProvider]", refusal.message, "SchemaProvider");
            throw refusal;
        }
        const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
        const timerId = controller
            ? setTimeout(() => {
                  controller.abort();
              }, timeoutMs)
            : null;
        try {
            const response = await fetch(url, controller ? { signal: controller.signal } : undefined);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            return await response.json();
        } catch (e) {
            Logger.warn("[MetaUI SchemaProvider]", "Failed to fetch remote schema: " + e, "SchemaProvider");
            throw e;
        } finally {
            if (timerId !== null) {
                clearTimeout(timerId);
            }
        }
    }
}
