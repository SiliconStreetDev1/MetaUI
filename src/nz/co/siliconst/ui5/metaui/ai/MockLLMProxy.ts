/**
 * @file MockLLMProxy.ts
 * @description Simulates an LLM backend call with a timeout.
 */
import { BaseAIGenerator } from "./BaseAIGenerator";
import { ISchema, IPropertyMetadata } from "../interfaces/ISchema";
import { Logger } from "../utils/Logger";

export class MockLLMProxy extends BaseAIGenerator {
    
    protected callLLM(dataSkeleton: Record<string, string>): Promise<ISchema> {
        return new Promise((resolve) => {
            Logger.info("[MockLLMProxy]", "Simulating AI Schema generation for keys:", Object.keys(dataSkeleton));
            
            setTimeout(() => {
                const schema: ISchema = {
                    type: "object",
                    properties: {}
                };

                // Naive mocked mapping for demo purposes.
                // In reality, the LLM provides this enriched schema.
                for (const key of Object.keys(dataSkeleton)) {
                    const metadata: IPropertyMetadata = {
                        type: dataSkeleton[key].includes("number") ? "number" : "string",
                        ui: {
                            label: this.camelCaseToTitle(key)
                        }
                    };

                    if (key.toLowerCase().includes("email")) {
                        metadata.ui!.widget = "email";
                        metadata.ui!.format = "email";
                    } else if (key.toLowerCase().includes("phone")) {
                        metadata.ui!.widget = "phone";
                        metadata.ui!.format = "phone";
                    } else if (key.toLowerCase().includes("date")) {
                        metadata.ui!.widget = "date";
                    } else if (key.toLowerCase().includes("active") || key.toLowerCase().includes("is")) {
                        metadata.type = "boolean";
                        metadata.ui!.widget = "switch";
                    } else if (key.toLowerCase().includes("limit") || key.toLowerCase().includes("amount") || key.toLowerCase().includes("salary")) {
                        metadata.type = "number";
                        metadata.ui!.widget = "currency";
                    }

                    schema.properties![key] = metadata;
                }

                Logger.info("[MockLLMProxy]", "Schema generation complete.");
                resolve(schema);
            }, 1500); // Emulate 1.5s network/LLM latency
        });
    }

    private camelCaseToTitle(str: string): string {
        return str.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase());
    }
}
