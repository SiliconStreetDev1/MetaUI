/**
 * @file PolicyDelegate.ts
 * @description Host delegate responsible for managing the PolicyEngine lifecycle,
 * debouncing live field-change policy evaluations, and applying differential state
 * mutations (visibility, validity, required, editable) to active plugins and table row cells.
 */

import { IPolicy } from "../../../interfaces/ISchema";
import { PolicyEngine, IDeltaState } from "../../../core/PolicyEngine";
import { PluginRegistry } from "../../../core/PluginRegistry";
import { Engine } from "../../../core/Engine";
import { StateManager } from "../../../core/StateManager";
import { Logger } from "../../../utils/Logger";

/**
 * Delegate managing Policy-Based Rules Engine (PBRE) execution for `GeneratorHost`.
 *
 * @namespace nz.co.siliconst.ui5.metaui.controls.host.delegates
 * @internal
 */
export class PolicyDelegate {
    private policyEngine: PolicyEngine | null = null;
    private debounceTimer: ReturnType<typeof setTimeout> | null = null;
    private onEvaluationComplete?: (anyValuePruned?: boolean) => void;

    /**
     * Initializes a new `PolicyDelegate`.
     *
     * @param onEvaluationComplete Optional hook invoked after policy evaluation finishes to sync host `isValid`.
     */
    constructor(onEvaluationComplete?: (anyValuePruned?: boolean) => void) {
        this.onEvaluationComplete = onEvaluationComplete;
    }

    /**
     * Cancels any pending debounced policy evaluation timer without clearing the active `PolicyEngine`.
     */
    public cancelPendingEvaluation(): void {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
        }
    }

    /**
     * Initializes or clears the internal `PolicyEngine` instance based on the normalized schema's `uiPolicies`.
     *
     * @param policies Optional array of declarative policies from the normalized schema.
     * @param pluginRegistry Optional injected `PluginRegistry` instance.
     */
    public configure(policies?: IPolicy[], pluginRegistry?: PluginRegistry): void {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
        }
        this.policyEngine =
            policies && policies.length > 0 ? new PolicyEngine(policies, pluginRegistry) : null;
    }

    /**
     * Returns whether an active `PolicyEngine` is configured.
     *
     * @returns {boolean} True if policies are active.
     */
    public hasPolicies(): boolean {
        return this.policyEngine !== null;
    }

    /**
     * Resets the internal `PolicyEngine` differential state matrix so the next evaluation emits full deltas.
     */
    public reset(): void {
        this.policyEngine?.reset();
    }

    /**
     * Schedules a debounced policy evaluation pass after a user field change.
     *
     * @param stateManager The active `StateManager` instance.
     * @param engine The active `Engine` instance.
     * @param delayMs Debounce delay in milliseconds (default `200`).
     */
    public scheduleEvaluation(
        stateManager: StateManager | null,
        engine: Engine | null,
        delayMs: number = 200
    ): void {
        if (!this.policyEngine) {
            return;
        }
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }
        this.debounceTimer = setTimeout(() => {
            this.evaluateNow(stateManager, engine);
        }, delayMs);
    }

    /**
     * Applies a single policy delta to its target plugin or table row cell.
     *
     * A delta flagged `degraded` came from a policy whose condition the engine could not evaluate. It is a
     * statement about a broken rule, not about the data, so it must never hide a field or prune its value:
     * `StateManager.setProperty(target, undefined)` makes `extractPayload()` emit `undefined`, which
     * `JSON.stringify` then drops, silently deleting the user's input from the submitted payload.
     *
     * @param delta The differential state mutation to apply.
     * @param stateManager The active `StateManager` instance.
     * @param engine The active `Engine` instance.
     * @returns {boolean} True when the delta pruned a hidden field value out of the model.
     */
    private applyDelta(delta: IDeltaState, stateManager: StateManager, engine: Engine): boolean {
        let valuePruned = false;
        if (delta.property === "visibility" && delta.value === false) {
            if (delta.degraded) {
                Logger.error(
                    `Refusing to hide '${delta.target}' and prune its value: the policy governing it could not be ` +
                    `evaluated. Fix the policy condition; the field stays visible and its value is preserved.`,
                    undefined,
                    "PolicyDelegate"
                );
                return false;
            }
            stateManager.setProperty(delta.target, undefined);
            engine.reportSchemaError(delta.target, null);
            valuePruned = true;
        }

        const plugin = engine.getPluginByPath(delta.target);
        if (!plugin) {
            if (delta.property === "validity") {
                engine.reportPolicyError(
                    delta.target,
                    delta.value ? null : delta.errorMessage || "Validation failed by policy"
                );
            } else {
                engine.applyRowPolicyState(delta.target, delta.property, delta.value);
            }
            return valuePruned;
        }

        switch (delta.property) {
            case "visibility":
                if (plugin.applyVisibility) plugin.applyVisibility(delta.value);
                engine.refreshFieldValidationState(delta.target);
                break;
            case "validity":
                engine.reportPolicyError(
                    delta.target,
                    delta.value ? null : delta.errorMessage || "Validation failed by policy"
                );
                break;
            case "required":
                if (plugin.applyRequired) plugin.applyRequired(delta.value);
                if (!delta.value) {
                    const res = plugin.validate();
                    if (res.isValid) {
                        engine.reportSchemaError(delta.target, null);
                    }
                }
                break;
            case "editable":
                if (plugin.applyEditable) plugin.applyEditable(delta.value);
                break;
            case "enabled":
                if (plugin.applyEnabled) plugin.applyEnabled(delta.value);
                break;
        }
        return valuePruned;
    }

    /**
     * Immediately evaluates all active policies against the current payload and applies resulting deltas
     * to the corresponding plugins or table row cells. Prunes hidden field values from the model.
     *
     * Isolation holds at three levels, so one bad rule cannot take out the rest of the form:
     * `PolicyEngine.evaluate` wraps each individual policy, this method wraps the whole evaluation pass as a
     * backstop, and each delta is applied inside its own `try`. A policy the engine could not evaluate emits
     * `degraded` deltas, which {@link PolicyDelegate.applyDelta} refuses to let hide a field or prune its value.
     *
     * @param stateManager The active `StateManager` instance.
     * @param engine The active `Engine` instance.
     */
    public evaluateNow(stateManager: StateManager | null, engine: Engine | null): void {
        if (!this.policyEngine || !stateManager || !engine) {
            return;
        }
        const payload = stateManager.extractPayload();
        let deltas: IDeltaState[] = [];
        try {
            deltas = this.policyEngine.evaluate(payload);
        } catch (e) {
            Logger.error(
                `Policy evaluation pass failed and emitted no deltas: ${e instanceof Error ? e.message : String(e)}`,
                undefined,
                "PolicyDelegate"
            );
        }
        let anyValuePruned = false;

        for (const delta of deltas) {
            try {
                if (this.applyDelta(delta, stateManager, engine)) {
                    anyValuePruned = true;
                }
            } catch (e) {
                Logger.error(
                    `Failed to apply '${delta.property}' policy delta to '${delta.target}': ` +
                    (e instanceof Error ? e.message : String(e)),
                    undefined,
                    "PolicyDelegate"
                );
            }
        }

        if (this.onEvaluationComplete) {
            this.onEvaluationComplete(anyValuePruned);
        }
    }

    /**
     * Cleans up any pending debounce timers and releases the `PolicyEngine` reference.
     */
    public destroy(): void {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
        }
        this.policyEngine = null;
    }
}
