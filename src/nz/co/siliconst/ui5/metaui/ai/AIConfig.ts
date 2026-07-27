/**
 * @file AIConfig.ts
 * @description Global configuration singleton for AI Inference integrations.
 */
import { BaseAIGenerator } from "./BaseAIGenerator";
import { MockLLMProxy } from "./MockLLMProxy";

export class AIConfig {
    private static activeProxy: BaseAIGenerator = new MockLLMProxy();
    private static endpointUrl: string = "/api/mock/ai";

    /**
     * Sets the active proxy instance (e.g. Mock vs Rest).
     */
    public static setProxy(proxy: BaseAIGenerator): void {
        this.activeProxy = proxy;
    }

    /**
     * Gets the current active proxy.
     */
    public static getProxy(): BaseAIGenerator {
        return this.activeProxy;
    }

    /**
     * Configures the remote URL for the REST LLM Proxy to hit.
     */
    public static setEndpointUrl(url: string): void {
        this.endpointUrl = url;
    }

    /**
     * Gets the configured remote URL.
     */
    public static getEndpointUrl(): string {
        return this.endpointUrl;
    }
}
