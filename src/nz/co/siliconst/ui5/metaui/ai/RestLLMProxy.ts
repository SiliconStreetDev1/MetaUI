/**
 * @file RestLLMProxy.ts
 * @description Real HTTP REST client for communicating with an external LLM generation endpoint.
 */
import { BaseAIGenerator } from "./BaseAIGenerator";
import { ISchema } from "../interfaces/ISchema";
import { Logger } from "../utils/Logger";
import { AIConfig } from "./AIConfig";

export class RestLLMProxy extends BaseAIGenerator {

    protected async callLLM(dataSkeleton: Record<string, string>): Promise<ISchema> {
        const endpoint = AIConfig.getEndpointUrl();
        if (!endpoint) {
            throw new Error("[RestLLMProxy] No AI Endpoint configured in AIConfig.");
        }

        Logger.info("[RestLLMProxy]", `Sending skeleton to ${endpoint}...`);

        try {
            const response = await fetch(endpoint, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    skeleton: dataSkeleton
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const schema: ISchema = await response.json();
            Logger.info("[RestLLMProxy]", "Successfully received schema from backend.");
            return schema;
        } catch (e: unknown) {
            Logger.error("[RestLLMProxy]", `Failed to fetch LLM schema: ${(e as Error).message}`);
            // Fallback to empty schema on error so the app doesn't crash completely
            return { type: "object", properties: {} };
        }
    }
}
