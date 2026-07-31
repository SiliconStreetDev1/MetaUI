/**
 * @file OpenApiHeuristicEngine.ts
 * @description Orchestrator that registers and executes all IHeuristicPlugin implementations against the raw schema.
 */

import { IHeuristicPlugin } from "./interfaces/IHeuristicPlugin";
import { ProtobufVariantHeuristic } from "./plugins/ProtobufVariantHeuristic";

/**
 * Orchestration engine that initializes and executes heuristic plugins sequentially.
 * This pipeline mutates the raw OpenAPI document in-place to normalize non-standard constructs
 * (like Protobuf unions) before the primary parsing phase occurs.
 * 
 * @public
 */
export class OpenApiHeuristicEngine {
    private plugins: IHeuristicPlugin[] = [];

    /**
     * Initializes a new instance of the HeuristicEngine and registers default heuristics.
     */
    constructor() {
        // Register default heuristics
        this.plugins.push(new ProtobufVariantHeuristic());
    }

    /**
     * Runs all registered heuristic plugins sequentially against the raw OpenAPI document.
     * Captures and bubbles plugin-specific execution failures to prevent silent pipeline corruption.
     * 
     * @param {any} openApiRoot The entire OpenAPI root document, to be mutated in-place.
     * @throws {Error} If any heuristic plugin crashes during execution.
     */
    public run(openApiRoot: unknown): void {
        for (const plugin of this.plugins) {
            try {
                plugin.apply(openApiRoot);
            } catch (e: any) {
                throw new Error(`[MetaUI HeuristicEngine] Plugin execution failed: ${e.message}`);
            }
        }
    }
}
