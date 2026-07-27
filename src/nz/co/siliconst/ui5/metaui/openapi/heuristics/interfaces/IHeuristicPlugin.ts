/**
 * @file IHeuristicPlugin.ts
 * @description Contract for plugins that inspect and mutate the raw OpenAPI AST before translation.
 */

/**
 * Interface defining the operational boundaries for structural heuristic plugins.
 * Implementations are executed synchronously during the pre-processing phase to normalize
 * non-standard schema constructs (like generic object unions) before translation occurs.
 * 
 * @public
 */
export interface IHeuristicPlugin {
    /**
     * Evaluates and mutates the provided OpenAPI AST in-place.
     * Heuristics are expected to strictly scope their mutations to patterns they explicitly recognize.
     * 
     * @param {any} openApiRoot The mutable OpenAPI root document block.
     */
    apply(openApiRoot: unknown): void;
}
