import { IPolicy, IPolicyCondition, PolicyEffectType } from "../interfaces/ISchema";
import { PluginRegistry } from "./PluginRegistry";
import { Logger } from "../utils/Logger";

export type PropertyName = "visibility" | "validity" | "required" | "editable";

export interface IDeltaState {
    /** The absolute JSON pointer path of the target property (e.g., "/VisitorInfo/PassportNumber") */
    target: string;
    /** The UI5 visual or structural state to mutate */
    property: PropertyName;
    /** The boolean value to apply to the state */
    value: boolean;
    /** An optional custom error message to paint onto the field if validity is false */
    errorMessage?: string;
}

interface ITargetState {
    visibility?: boolean;
    validity?: boolean;
    required?: boolean;
    editable?: boolean;
    errorMessage?: string;
}

/**
 * The PolicyEngine is responsible for evaluating complex, cross-field conditional logic defined in the schema's `uiPolicies` array.
 * It operates strictly on the JSON payload structure and returns an array of `IDeltaState` mutations which the GeneratorHost
 * then applies to the individual active plugins.
 * 
 * It ensures the orchestration of conditional rendering, requiring, and invalidating of fields without the plugins
 * needing to be aware of each other.
 * 
 * @namespace nz.co.siliconst.ui5.metaui.core
 */
export class PolicyEngine {
    private policies: IPolicy[];
    
    /** Caches the last computed state matrix for differential delta emission */
    private lastStateMatrix: Map<string, ITargetState>;

    /**
     * Instantiates the PolicyEngine with an array of policies.
     * @param policies Array of uiPolicies defined in the root schema.
     */
    constructor(policies: IPolicy[]) {
        this.policies = policies || [];
        this.lastStateMatrix = new Map();
        this.detectCycles();
    }

    /**
     * Builds a directed dependency graph and detects cycles to prevent infinite event loops.
     */
    private detectCycles(): void {
        const graph = new Map<string, Set<string>>();

        for (const policy of this.policies) {
            const sources = new Set<string>();
            if (policy.condition) {
                const addPaths = (obj: Record<string, unknown> | undefined) => {
                    if (obj) Object.keys(obj).forEach(k => sources.add(k.split("/$row")[0]));
                };
                addPaths(policy.condition.NumericGreaterThan);
                addPaths(policy.condition.NumericLessThan);
                addPaths(policy.condition.StringEquals);
                if (policy.condition.IsNull) policy.condition.IsNull.forEach(p => sources.add(p.split("/$row")[0]));
                if (policy.condition.IsNotNull) policy.condition.IsNotNull.forEach(p => sources.add(p.split("/$row")[0]));
            }

            for (const target of policy.targets) {
                const cleanTarget = target.split("/$row")[0];
                if (!graph.has(cleanTarget)) {
                    graph.set(cleanTarget, new Set());
                }
                sources.forEach(s => graph.get(cleanTarget)!.add(s));
            }
        }

        const visited = new Set<string>();
        const recursionStack = new Set<string>();

        const isCyclic = (node: string): boolean => {
            if (!visited.has(node)) {
                visited.add(node);
                recursionStack.add(node);

                const neighbors = graph.get(node);
                if (neighbors) {
                    for (const neighbor of neighbors) {
                        if (!visited.has(neighbor) && isCyclic(neighbor)) {
                            return true;
                        } else if (recursionStack.has(neighbor)) {
                            return true;
                        }
                    }
                }
            }
            recursionStack.delete(node);
            return false;
        };

        for (const node of graph.keys()) {
            if (isCyclic(node)) {
                throw new Error(`[MetaUI PolicyEngine] FATAL: Cyclic dependency detected involving policy target '${node}'. This will cause an infinite rendering loop.`);
            }
        }
    }

    /**
     * Safely traverses a JSON payload using a JSON pointer.
     * Handles UI5 model prefixes (like metaui>) seamlessly.
     * 
     * @param data The root JSON object representing the form payload.
     * @param pointer The JSON pointer to traverse (e.g., "/Customer/Age").
     * @returns The resolved value, or undefined if the path does not exist.
     */
    private resolvePointer(data: unknown, pointer: string): unknown {
        if (!data || !pointer) return undefined;
        // Strip leading slash and any UI5 prefixes
        const cleanPointer = pointer.replace(/^\//, "").replace(/^metaui>\/?/, "");
        if (!cleanPointer) return data;
        
        const parts = cleanPointer.split("/");
        let current = data as Record<string, unknown>;
        for (const part of parts) {
            if (current === undefined || current === null) return undefined;
            current = current[part] as Record<string, unknown>;
        }
        return current;
    }

    /**
     * Evaluates a complex condition tree against the live JSON payload.
     * 
     * @param condition The condition block to evaluate.
     * @param data The live JSON payload from the StateManager.
     * @returns True if all condition parameters are met, otherwise false.
     */
    private evaluateCondition(condition: IPolicyCondition, data: unknown): boolean {
        // If there are multiple operators, we treat them as AND for now
        let result = true;
        const registry = PluginRegistry.getInstance();

        for (const [key, payload] of Object.entries(condition)) {
            const plugin = registry.getPolicyConditionPlugin(key);
            if (plugin) {
                if (!plugin.evaluate(payload, data, this.resolvePointer.bind(this))) {
                    result = false;
                }
            } else {
                Logger.warn(`[MetaUI PolicyEngine] Unrecognized condition operator: ${key}`);
            }
        }

        return result;
    }

    /**
     * Expands relative $row policies into absolute index policies for each physical row.
     */
    private expandRowPolicies(data: unknown, policies: IPolicy[]): IPolicy[] {
        const expanded: IPolicy[] = [];
        for (const policy of policies) {
            let hasRow = false;
            let arrayPath = "";
            
            for (const target of policy.targets) {
                if (target.includes("$row")) {
                    hasRow = true;
                    arrayPath = target.split("/$row")[0];
                    break;
                }
            }
            if (!hasRow && policy.condition) {
                const checkPaths = (obj: any) => {
                    if (!obj) return;
                    for (const key of Object.keys(obj)) {
                        if (key.includes("$row")) {
                            hasRow = true;
                            arrayPath = key.split("/$row")[0];
                            break;
                        }
                    }
                };
                checkPaths(policy.condition.NumericGreaterThan);
                checkPaths(policy.condition.NumericLessThan);
                checkPaths(policy.condition.StringEquals);
                
                if (policy.condition.IsNull) policy.condition.IsNull.forEach(p => { if (p.includes("$row")) { hasRow = true; arrayPath = p.split("/$row")[0]; } });
                if (policy.condition.IsNotNull) policy.condition.IsNotNull.forEach(p => { if (p.includes("$row")) { hasRow = true; arrayPath = p.split("/$row")[0]; } });
            }

            if (hasRow && arrayPath) {
                const arrayData = this.resolvePointer(data, arrayPath);
                if (Array.isArray(arrayData)) {
                    for (let i = 0; i < arrayData.length; i++) {
                        const cloneStr = JSON.stringify(policy).replace(/\$row/g, String(i));
                        expanded.push(JSON.parse(cloneStr));
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
     * @param data The JSON data payload.
     * @returns Array of delta states to apply to the UI.
     */
    public evaluate(data: unknown): IDeltaState[] {
        if (!this.policies || this.policies.length === 0) {
            return [];
        }

        const expandedPolicies = this.expandRowPolicies(data, this.policies);

        // Ledger: target -> property -> { forcedFalse: number, forcedTrue: number, lastMessage?: string }
        const ledger = new Map<string, Record<PropertyName, { forcedFalse: number, forcedTrue: number, lastMessage?: string }>>();

        const initTargetInLedger = (target: string) => {
            if (!ledger.has(target)) {
                ledger.set(target, {
                    visibility: { forcedFalse: 0, forcedTrue: 0 },
                    validity: { forcedFalse: 0, forcedTrue: 0 },
                    required: { forcedFalse: 0, forcedTrue: 0 },
                    editable: { forcedFalse: 0, forcedTrue: 0 }
                });
            }
        };

        // 1. Build the Composite State Ledger Matrix
        for (const policy of expandedPolicies) {
            const isConditionMet = this.evaluateCondition(policy.condition, data);
            
            for (const target of policy.targets) {
                initTargetInLedger(target);
                const currentLedger = ledger.get(target)!;
                
                const effectPlugin = PluginRegistry.getInstance().getPolicyEffectPlugin(policy.effect);
                if (!effectPlugin) {
                    Logger.error(`[MetaUI PolicyEngine] Unrecognized policy effect: ${policy.effect}`);
                    continue;
                }
                const mapped = effectPlugin.resolveState(isConditionMet, policy.effect);
                
                // Track forces. For restrictable properties (visibility, validity, editable), forcedFalse acts as a lock.
                // For required, forcedTrue acts as a lock.
                if (mapped.value) {
                    currentLedger[mapped.property].forcedTrue++;
                } else {
                    currentLedger[mapped.property].forcedFalse++;
                    if (mapped.property === "validity" && isConditionMet && policy.message) {
                        currentLedger.validity.lastMessage = policy.message;
                    }
                }
            }
        }

        const newStateMatrix = new Map<string, ITargetState>();

        // 2. Resolve the Ledger into a concrete State Matrix
        for (const [target, stateMap] of ledger.entries()) {
            newStateMatrix.set(target, {
                // False (Hidden) wins if ANY policy forced it false
                visibility: stateMap.visibility.forcedFalse > 0 ? false : true,
                // False (Invalid) wins if ANY policy forced it false
                validity: stateMap.validity.forcedFalse > 0 ? false : true,
                // True (Required) wins if ANY policy forced it true
                required: stateMap.required.forcedTrue > 0 ? true : false,
                // False (Disabled) wins if ANY policy forced it false
                editable: stateMap.editable.forcedFalse > 0 ? false : true,
                errorMessage: stateMap.validity.lastMessage
            });
        }

        const deltas: IDeltaState[] = [];

        // 3. Differential Emission
        for (const [target, newState] of newStateMatrix.entries()) {
            const lastState = this.lastStateMatrix.get(target) || {};

            if (newState.visibility !== undefined && newState.visibility !== lastState.visibility) {
                deltas.push({ target, property: "visibility", value: newState.visibility });
            }
            if (newState.validity !== undefined && newState.validity !== lastState.validity) {
                if (newState.validity !== lastState.validity || newState.errorMessage !== lastState.errorMessage) {
                    deltas.push({ target, property: "validity", value: newState.validity, errorMessage: newState.errorMessage });
                }
            }
            if (newState.required !== undefined && newState.required !== lastState.required) {
                deltas.push({ target, property: "required", value: newState.required });
            }
            if (newState.editable !== undefined && newState.editable !== lastState.editable) {
                deltas.push({ target, property: "editable", value: newState.editable });
            }
        }

        // Cache for next evaluation sweep
        this.lastStateMatrix = newStateMatrix;

        return deltas;
    }
}
