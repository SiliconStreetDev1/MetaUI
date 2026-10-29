/**
 * @file IEngineHost.ts
 * @description Contract defining what the Engine requires from its hosting container.
 */

import Control from "sap/ui/core/Control";
import { StateManager } from "../core/StateManager";
import { ISchema } from "./ISchema";

/**
 * Contract defining what the Engine requires from its hosting container (GeneratorHost).
 * @public
 */
export interface IEngineHost {
    /** Retrieves the central StateManager managing the active data models. */
    getStateManager(): StateManager | null;

    /** Retrieves the current active schema for the host. */
    getParsedSchema?(): ISchema | null;

    /** Resolves a `$ref` pointer against the host's normalized schemaDefinitions dictionary. */
    getSchemaDefinition?(refPath: string): ISchema | undefined;

    /** Returns the full normalized schemaDefinitions dictionary. */
    getSchemaDefinitions?(): Record<string, ISchema> | undefined;

    /**
     * Returns the layout budget in force on the host, so a nested modal host inherits it explicitly.
     * Before this existed the budget reached a nested host only because `LayoutScorer` wrote
     * `ui.layoutBudget` onto the schema node and `NestedDialogPlugin` copied the node's `ui` block
     * onto the modal sub-schema - layout state travelling through the consumer's schema.
     */
    getLayoutBudget?(): number;

    /** Fires a UI5 event on the host control. */
    fireEvent?(eventName: string, parameters?: Record<string, unknown>): unknown;

    /** Immediately flushes any pending debounced policy evaluation. */
    evaluatePoliciesNow?(): void;

    /** Resets the policy differential matrix and immediately re-evaluates all policies. */
    resetAndEvaluatePoliciesNow?(): void;

    /** The active JSONModel name where data is bound. */
    activeModelName: string;

    /** The root generated layout control. */
    generatedContent: Control | null;
}
