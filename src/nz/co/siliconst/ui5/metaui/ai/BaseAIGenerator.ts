/**
 * @file BaseAIGenerator.ts
 * @description Abstract base class defining the contract for AI Schema Generation Proxies.
 */
import { ISchema } from "../interfaces/ISchema";

export abstract class BaseAIGenerator {

    /**
     * Generates a schema dynamically for the provided data payload.
     * @param data The raw data to infer from.
     * @param partialSchema The manual overrides provided by the developer.
     * @returns A promise resolving to the final merged schema.
     */
    public async generateSchema(data: object, partialSchema?: ISchema): Promise<ISchema> {
        // 1. Build a structural skeleton of the data (no real values).
        const dataSkeleton = this.buildDataSkeleton(data, partialSchema);

        if (Object.keys(dataSkeleton).length === 0) {
            // Nothing to infer, the partial schema covered everything.
            return partialSchema || { type: "object", properties: {} };
        }

        // 2. Delegate to the subclass to get the schema from the LLM.
        const llmGeneratedSchema = await this.callLLM(dataSkeleton);

        // 3. Deep merge the partial schema over the LLM schema.
        return this.deepMergeSchemas(llmGeneratedSchema, partialSchema) as ISchema;
    }

    /**
     * Abstract method implemented by proxies to handle network/mock calls.
     * @param dataSkeleton The structure of unknown fields.
     */
    protected abstract callLLM(dataSkeleton: Record<string, string>): Promise<ISchema>;

    /**
     * Strips actual values and ignores fields already defined in the partial schema.
     */
    private buildDataSkeleton(data: unknown, partialSchema?: ISchema): Record<string, string> {
        const skeleton: Record<string, string> = {};
        if (!data || typeof data !== "object") return skeleton;

        const definedKeys = partialSchema?.properties ? Object.keys(partialSchema.properties) : [];
        const dataObj = data as Record<string, unknown>;

        for (const key of Object.keys(dataObj)) {
            if (!definedKeys.includes(key)) {
                skeleton[key] = `type: ${typeof dataObj[key]}`;
            }
        }
        return skeleton;
    }

    /**
     * Merges a manual partial schema over the LLM generated schema.
     */
    private deepMergeSchemas(base: unknown, override?: unknown): unknown {
        const outTarget = (base || {}) as Record<string, unknown>;
        const output: Record<string, unknown> = Object.assign({}, outTarget);
        if (override === null || typeof override !== "object") return output;
        
        const srcObj = override as Record<string, unknown>;

        Object.keys(srcObj).forEach(key => {
            if (Array.isArray(srcObj[key])) {
                output[key] = Array.isArray(outTarget[key]) 
                    ? Array.from(new Set([...(outTarget[key] as unknown[]), ...(srcObj[key] as unknown[])])) 
                    : [...(srcObj[key] as unknown[])];
            } else if (typeof srcObj[key] === "object" && srcObj[key] !== null) {
                if (outTarget[key] && typeof outTarget[key] === "object") {
                    output[key] = this.deepMergeSchemas(outTarget[key], srcObj[key]);
                } else {
                    output[key] = Object.assign({}, srcObj[key]);
                }
            } else {
                output[key] = srcObj[key];
            }
        });
        return output;
    }
}
