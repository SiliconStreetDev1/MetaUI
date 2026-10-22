/**
 * @file PolicyEngine.ts
 * @description Evaluates declarative cross-field rules (`uiPolicies`) and emits differential UI state mutations.
 */

import { IPolicy, IPolicyCondition } from "../interfaces/ISchema";
import { PluginRegistry } from "./PluginRegistry";
import { Logger } from "../utils/Logger";
import { isRecord } from "../utils/TypeGuards";

export type PropertyName = "visibility" | "validity" | "required" | "editable";

/**
 * Represents a single differential UI state mutation emitted by {@link PolicyEngine} for a target JSON Pointer.
 */
export interface IDeltaState {
    /** The absolute JSON pointer path of the target property (e.g., `"/VisitorInfo/PassportNumber"`). */
    target: string;
    /** The UI5 visual or structural state to mutate. */
    property: PropertyName;
    /** The boolean value to apply to the state. */
    value: boolean;
    /** An optional custom error message to paint onto the field if validity is false. */
    errorMessage?: string;
}

interface ITargetState {
    visibility?: boolean;
    validity?: boolean;
    required?: boolean;
    editable?: boolean;
    errorMessage?: string;
}

interface IPropertyCounts {
    activeFalse: number;
    activeTrue: number;
    fallbackFalse: number;
    fallbackTrue: number;
    lastMessage?: string;
}

/**
 * The PolicyEngine is responsible for evaluating complex, cross-field conditional logic defined in the schema's `uiPolicies` array.
 * It operates strictly on the JSON payload structure and returns an array of `IDeltaState` mutations which the GeneratorHost
 * then applies to the individual active plugins or table row cells.
 *
 * @namespace nz.co.siliconst.ui5.metaui.core
 * @public
 */
export class PolicyEngine {
    private policies: IPolicy[];
    private readonly pluginRegistry: PluginRegistry;

    /** Caches the last computed state matrix for differential delta emission. */
    private lastStateMatrix: Map<string, ITargetState>;

    /**
     * Instantiates the PolicyEngine with an array of policies.
     *
     * @param policies Array of `uiPolicies` defined in the root schema.
     * @param pluginRegistry Optional injected `PluginRegistry` instance.
     */
    constructor(policies: IPolicy[], pluginRegistry: PluginRegistry = PluginRegistry.getInstance()) {
        this.policies = policies || [];
        this.pluginRegistry = pluginRegistry;
        this.lastStateMatrix = new Map();
    }

    /**
     * Safely traverses a JSON payload using a JSON pointer.
     * Handles UI5 model prefixes (like `metaui>`) and wrapped `{ items: [...] }` root arrays seamlessly.
     *
     * @param data The root JSON object or array representing the form payload.
     * @param pointer The JSON pointer to traverse (e.g., `"/Customer/Age"`).
     * @returns {unknown} The resolved value, or `undefined` if the path does not exist.
     */
    private resolvePointer(data: unknown, pointer: string): unknown {
        if (!data || pointer === undefined || pointer === null) {
            return undefined;
        }
        const cleanPointer = pointer.replace(/^\//, "").replace(/^metaui>\/?/, "");
        if (!cleanPointer) {
            if (Array.isArray(data)) {
                return data;
            }
            if (isRecord(data) && Array.isArray(data.items)) {
                return data.items;
            }
            return data;
        }

        const parts = cleanPointer.split("/");
        let current: unknown = data;
        for (let idx = 0; idx < parts.length; idx++) {
            if (current === undefined || current === null) {
                return undefined;
            }
            const part = parts[idx].replace(/~1/g, "/").replace(/~0/g, "~");
            if (
                idx === 0 &&
                !Array.isArray(current) &&
                isRecord(current) &&
                Array.isArray(current.items) &&
                /^\d+$/.test(part)
            ) {
                current = current.items[Number(part)];
                continue;
            }
            if (Array.isArray(current)) {
                const rowIdx = Number(part);
                current = Number.isInteger(rowIdx) ? current[rowIdx] : undefined;
            } else if (isRecord(current)) {
                current = current[part];
            } else {
                return undefined;
            }
        }
        return current;
    }

    /**
     * Resets the internal differential state matrix so the next {@link evaluate} call emits full deltas.
     */
    public reset(): void {
        this.lastStateMatrix.clear();
    }

    /**
     * Evaluates a complex condition tree against the live JSON payload.
     * Fails closed (`false`) if an unrecognized condition operator is encountered.
     *
     * @param condition The condition block to evaluate.
     * @param data The live JSON payload from the StateManager.
     * @returns {boolean} True if all condition parameters are met, otherwise false.
     */
    private evaluateCondition(condition: IPolicyCondition, data: unknown): boolean {
        if (!isRecord(condition) || Object.keys(condition).length === 0) {
            Logger.warn("[MetaUI PolicyEngine] Malformed or empty policy condition block. Failing closed (false).");
            return false;
        }
        let result = true;
        const registry = this.pluginRegistry;

        for (const [key, payload] of Object.entries(condition)) {
            const plugin = registry.getPolicyConditionPlugin(key);
            if (plugin) {
                if (!plugin.evaluate(payload, data, this.resolvePointer.bind(this))) {
                    result = false;
                }
            } else {
                Logger.warn(`[MetaUI PolicyEngine] Unrecognized condition operator: ${key}`);
                result = false;
            }
        }

        return result;
    }

    /**
     * Extracts the first `$row` array path from a policy's `targets` or `condition` pointers without scanning `policy.message`.
     *
     * @param policy The policy descriptor to inspect.
     * @returns {string | null} The array pointer prefix preceding the first `$row` token, or `null` if none exists.
     */
    private findFirstRowArrayPath(policy: IPolicy): string | null {
        const matchRow = (str: string): string | null => {
            const m = /^(.*?)\/?\$row(?=\/|$)/.exec(str);
            return m ? m[1] : null;
        };
        for (const t of policy.targets || []) {
            const found = matchRow(t);
            if (found !== null) return found;
        }
        const scanObj = (obj: unknown): string | null => {
            if (typeof obj === "string") return matchRow(obj);
            if (isRecord(obj)) {
                for (const [k, v] of Object.entries(obj)) {
                    const fromKey = matchRow(k);
                    if (fromKey !== null) return fromKey;
                    const fromVal = scanObj(v);
                    if (fromVal !== null) return fromVal;
                }
            }
            return null;
        };
        return scanObj(policy.condition);
    }

    /**
     * Replaces the first `$row` token in a string with the given numeric row index.
     */
    private replaceFirstRowToken(str: string, index: number): string {
        return str.replace(/\$row(?=\/|$)/, String(index));
    }

    /**
     * Clones a policy condition, replacing the first `$row` token in all pointer keys and string values.
     */
    private replaceFirstRowInCondition(node: unknown, index: number): unknown {
        if (typeof node === "string") {
            return this.replaceFirstRowToken(node, index);
        }
        if (Array.isArray(node)) {
            return node.map((item) => this.replaceFirstRowInCondition(item, index));
        }
        if (isRecord(node)) {
            const out: Record<string, unknown> = {};
            for (const [k, v] of Object.entries(node)) {
                out[this.replaceFirstRowToken(k, index)] = this.replaceFirstRowInCondition(v, index);
            }
            return out;
        }
        return node;
    }

    /**
     * Expands relative `$row` policies into absolute index policies for each physical row.
     * Supports nested arrays (`"/Items/$row/SubItems/$row/..."`) and root arrays (`"/$row/..."` or `"$row/..."`)
     * without touching `policy.message`.
     *
     * @param data The root JSON payload.
     * @param policies The declared schema policies.
     * @returns {IPolicy[]} The expanded policy list.
     */
    private expandRowPolicies(data: unknown, policies: IPolicy[]): IPolicy[] {
        const expanded: IPolicy[] = [];
        for (const policy of policies) {
            const arrayPath = this.findFirstRowArrayPath(policy);
            if (arrayPath !== null) {
                const arrayData = this.resolvePointer(data, arrayPath);
                if (Array.isArray(arrayData)) {
                    for (let i = 0; i < arrayData.length; i++) {
                        const rowPolicy: IPolicy = {
                            ...policy,
                            targets: policy.targets.map((t) => this.replaceFirstRowToken(t, i)),
                            condition: this.replaceFirstRowInCondition(policy.condition, i) as IPolicyCondition
                        };
                        expanded.push(...this.expandRowPolicies(data, [rowPolicy]));
                    }
                }
            } else {
                expanded.push(policy);
            }
        }
        return expanded;
    }

    /**
     * Evaluates policies against the given data payload using a State Resolution Matrix.
     * Distinguishes active rules (`isConditionMet === true`) from un-met fallback reversals so multiple
     * `Show`/`Enable`/`Require`/`Optional` policies compose without cancelling each other out.
     *
     * @param data The JSON data payload.
     * @returns {IDeltaState[]} Array of delta states to apply to the UI.
     */
    public evaluate(data: unknown): IDeltaState[] {
        if (!this.policies || this.policies.length === 0) {
            return [];
        }

        const expandedPolicies = this.expandRowPolicies(data, this.policies);
        const ledger = new Map<string, Record<PropertyName, IPropertyCounts>>();

        const createCounts = (): IPropertyCounts => ({
            activeFalse: 0,
            activeTrue: 0,
            fallbackFalse: 0,
            fallbackTrue: 0
        });

        const initTargetInLedger = (target: string): void => {
            if (!ledger.has(target)) {
                ledger.set(target, {
                    visibility: createCounts(),
                    validity: createCounts(),
                    required: createCounts(),
                    editable: createCounts()
                });
            }
        };

        for (const policy of expandedPolicies) {
            const isConditionMet = this.evaluateCondition(policy.condition, data);

            for (const target of policy.targets) {
                initTargetInLedger(target);
                const currentLedger = ledger.get(target)!;

                const effectPlugin = this.pluginRegistry.getPolicyEffectPlugin(policy.effect);
                if (!effectPlugin) {
                    Logger.error(`[MetaUI PolicyEngine] Unrecognized policy effect: ${policy.effect}`);
                    continue;
                }
                const mapped = effectPlugin.resolveState(isConditionMet, policy.effect);
                const bucket = currentLedger[mapped.property];
                const isActiveTrigger = isConditionMet || (policy.effect === "Validate" && !isConditionMet);

                if (isActiveTrigger) {
                    if (mapped.value) {
                        bucket.activeTrue++;
                    } else {
                        bucket.activeFalse++;
                    }
                } else {
                    if (mapped.value) {
                        bucket.fallbackTrue++;
                    } else {
                        bucket.fallbackFalse++;
                    }
                }

                if (mapped.property === "validity" && !mapped.value && policy.message) {
                    bucket.lastMessage = policy.message;
                }
            }
        }

        const newStateMatrix = new Map<string, ITargetState>();
        const resolveBucket = (counts: IPropertyCounts, preferTrueOnActiveConflict: boolean): boolean | undefined => {
            if (counts.activeFalse + counts.activeTrue > 0) {
                if (preferTrueOnActiveConflict) {
                    return counts.activeTrue > 0 ? true : false;
                }
                return counts.activeFalse > 0 ? false : true;
            }
            if (counts.fallbackFalse + counts.fallbackTrue > 0) {
                return counts.fallbackFalse > 0 ? false : true;
            }
            return undefined;
        };

        for (const [target, stateMap] of ledger.entries()) {
            const entry: ITargetState = {};
            const vis = resolveBucket(stateMap.visibility, false);
            if (vis !== undefined) entry.visibility = vis;

            const val = resolveBucket(stateMap.validity, false);
            if (val !== undefined) {
                entry.validity = val;
                entry.errorMessage = val ? undefined : stateMap.validity.lastMessage;
            }

            const req = resolveBucket(stateMap.required, true);
            if (req !== undefined) entry.required = req;

            const edit = resolveBucket(stateMap.editable, false);
            if (edit !== undefined) entry.editable = edit;

            newStateMatrix.set(target, entry);
        }

        const deltas: IDeltaState[] = [];

        for (const [target, newState] of newStateMatrix.entries()) {
            const lastState = this.lastStateMatrix.get(target) || {};

            if (newState.visibility !== undefined && newState.visibility !== lastState.visibility) {
                deltas.push({ target, property: "visibility", value: newState.visibility });
            }
            if (
                newState.validity !== undefined &&
                (newState.validity !== lastState.validity || newState.errorMessage !== lastState.errorMessage)
            ) {
                deltas.push({
                    target,
                    property: "validity",
                    value: newState.validity,
                    errorMessage: newState.errorMessage
                });
            }
            if (newState.required !== undefined && newState.required !== lastState.required) {
                deltas.push({ target, property: "required", value: newState.required });
            }
            if (newState.editable !== undefined && newState.editable !== lastState.editable) {
                deltas.push({ target, property: "editable", value: newState.editable });
            }
        }

        // Emit cleanup deltas for targets that disappeared (e.g. deleted table rows)
        for (const [prevTarget, lastState] of this.lastStateMatrix.entries()) {
            if (!newStateMatrix.has(prevTarget)) {
                if (lastState.validity === false) {
                    deltas.push({ target: prevTarget, property: "validity", value: true });
                }
                if (lastState.visibility === false) {
                    deltas.push({ target: prevTarget, property: "visibility", value: true });
                }
                if (lastState.required === true) {
                    deltas.push({ target: prevTarget, property: "required", value: false });
                }
                if (lastState.editable === false) {
                    deltas.push({ target: prevTarget, property: "editable", value: true });
                }
            }
        }

        this.lastStateMatrix = newStateMatrix;

        return deltas;
    }
}
