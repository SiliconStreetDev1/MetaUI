/**
 * @file IPolicyPlugin.ts
 * @description Contracts for extending the PolicyEngine with custom evaluation and effect logic.
 * Enforces the Plugin-First architecture to prevent hardcoding rule sets.
 */

import { PolicyEffectType } from "./ISchema";
import { PropertyName } from "../core/PolicyEngine";

/**
 * Resolves whether a specific schema condition passes or fails against the live UI data payload.
 */
export interface IPolicyConditionPlugin {
    /**
     * Identifies if this plugin handles a specific condition key (e.g., "NumericGreaterThan", "StringEquals").
     * @param conditionKey The key extracted from the IPolicyCondition block.
     * @returns True if this plugin should evaluate the block, false otherwise.
     */
    canHandle(conditionKey: string): boolean;

    /**
     * Evaluates the condition payload against the live data.
     * @param conditionPayload The arbitrary payload attached to the condition key (e.g., { "/Age": 18 }).
     * @param data The live JSON model payload.
     * @param resolvePointer A utility function injected by the orchestrator to safely resolve JSON paths against the data.
     * @returns True if the condition is satisfied, false otherwise.
     */
    evaluate(conditionPayload: unknown, data: unknown, resolvePointer: (d: unknown, p: string) => unknown): boolean;
}

/**
 * Translates a semantic policy effect (e.g., "Hide", "Invalidate") into a strict binary structural property state.
 */
export interface IPolicyEffectPlugin {
    /**
     * Identifies if this plugin translates a specific semantic effect string.
     * @param effect The semantic string defined in the schema (e.g., "Hide", "Require").
     * @returns True if this plugin owns the translation, false otherwise.
     */
    canHandle(effect: PolicyEffectType | string): boolean;

    /**
     * Resolves the effect into a concrete structural delta for the UI components.
     * Automatically handles the symmetrical reversal if the condition is false.
     * @param isConditionMet Whether the governing policy condition passed or failed.
     * @returns An object containing the exact property to alter (e.g., "visibility") and its new boolean state.
     */
    resolveState(isConditionMet: boolean, originalEffect: PolicyEffectType | string): { property: PropertyName, value: boolean };
}
