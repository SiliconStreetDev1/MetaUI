/**
 * @file DataSyncDelegate.ts
 * @description Handles two-way data sync, JSON parsing, loop-breaking, and inference structural diffs.
 */

import { Logger } from "../../../utils/Logger";
import { SchemaNormalizer } from "../../../core/SchemaNormalizer";
import { StateManager } from "../../../core/StateManager";
import { ISchema, IPropertyMetadata } from "../../../interfaces/ISchema";
import { isRecord, deepClone } from "../../../utils/TypeGuards";

/**
 * Host contract required by {@link DataSyncDelegate} to synchronize bound properties and trigger re-renders.
 */
export interface IHostDataSync {
    getProperty(name: string): unknown;
    getBaseProperty?(name: string): unknown;
    setProperty(name: string, value: unknown, suppressInvalidate?: boolean): this;
    setBaseProperty(name: string, value: unknown, suppressInvalidate?: boolean): this;
    getBinding(name: string): unknown;
    invalidate(): void;
    getStateManager(): StateManager | null;
    getParsedSchema?(): ISchema | null;
    getInferredSchemaBaseline?(): ISchema | null;
    getSchemaDefinitions?(): Record<string, ISchema> | undefined;
    onDataHotSwapped?(): void;
    notifyAsyncDataArrived?(): void;
    tearDownGeneratedLayout(): void;
}

/**
 * Handles two-way data sync, JSON parsing, loop-breaking, and inference structural diffs.
 */
export class DataSyncDelegate {
    private host: IHostDataSync;
    private _isSyncing: boolean = false;

    /**
     * Initializes a new DataSyncDelegate to handle data payload binding extraction.
     * @param host The parent host interface containing properties.
     */
    constructor(host: IHostDataSync) {
        this.host = host;
    }

    /**
     * Resolves the current `outputData` payload on demand from the live `StateManager` sandbox
     * or falls back to a cloned copy of the committed `data` property prior to initialization.
     *
     * @param committedData The current `data` property value on the host.
     * @returns {unknown} The resolved output payload.
     */
    public resolveOutputData(committedData: unknown): unknown {
        const stateManager = this.host.getStateManager();
        if (stateManager) {
            return stateManager.extractPayload();
        }
        return committedData !== undefined && committedData !== null ? deepClone(committedData) : undefined;
    }

    /**
     * Executes a synchronous callback while holding the `_isSyncing` re-entrancy lock.
     * Prevents synchronous two-way binding echoes from re-entering `handleInputDataHotSwap`.
     *
     * @param fn Callback to execute under the sync lock.
     */
    public runWithSyncLock(fn: () => void): void {
        const prev = this._isSyncing;
        this._isSyncing = true;
        try {
            fn();
        } finally {
            this._isSyncing = prev;
        }
    }

    /**
     * Natively forces the UI5 framework to push updated properties back up to any bound ViewModels.
     * Avoids redundant `JSON.stringify` serialization when `dataJson` is neither bound nor populated.
     *
     * @param payload The extracted JavaScript payload to push.
     * @param serializedJson Optional pre-serialized JSON string to avoid duplicate serialization.
     * @returns {string | undefined} The serialized JSON string if `dataJson` was updated.
     */
    public pushToBindings(payload: unknown, serializedJson?: string): string | undefined {
        let payloadStr = serializedJson;
        this.runWithSyncLock(() => {
            this.host.setProperty("data", payload, true);
            const rawDataJson = this.host.getBaseProperty
                ? this.host.getBaseProperty("dataJson")
                : this.host.getProperty("dataJson");
            const needsJson =
                payloadStr !== undefined ||
                Boolean(this.host.getBinding("dataJson")) ||
                typeof rawDataJson === "string";
            if (needsJson) {
                if (payloadStr === undefined) {
                    payloadStr = JSON.stringify(payload, null, 2);
                }
                this.host.setProperty("dataJson", payloadStr, true);
            }
        });
        return payloadStr;
    }

    /**
     * Intercepts and parses live updates to the data payload from two-way Fiori bindings.
     */
    public handleInputDataHotSwap(propertyName: string, value: unknown, suppressInvalidate?: boolean): void {
        if (this._isSyncing) {
            if (this.host.getProperty("debugMode")) {
                Logger.debug("[MetaUI]", `Dropped echo for ${propertyName} due to active sync lock`, "DataSyncDelegate");
            }
            this.host.setBaseProperty(propertyName, value, suppressInvalidate);
            return;
        }

        let incomingObj: unknown = null;

        if (typeof value === "string") {
            if (value.trim() === "") {
                incomingObj = null;
            } else {
                try {
                    incomingObj = JSON.parse(value);
                } catch (_e) {
                    this.host.setBaseProperty(propertyName, value, false);
                    this.host.notifyAsyncDataArrived?.();
                    this.host.tearDownGeneratedLayout();
                    this.host.invalidate();
                    return;
                }
            }
        } else {
            incomingObj = value;
        }

        this.host.setBaseProperty(propertyName, value, true);
        if (propertyName === "data" && !this.host.getBinding("dataJson")) {
            this.host.setBaseProperty("dataJson", null, true);
        }
        this.host.notifyAsyncDataArrived?.();

        const stateManager = this.host.getStateManager();
        if (incomingObj === null || incomingObj === undefined) {
            if (!stateManager) {
                return;
            }
            const parsedSchema =
                typeof this.host.getParsedSchema === "function" ? this.host.getParsedSchema() : null;
            const hasExplicitSchema = Boolean(this.host.getProperty("schemaDefinition")) && Boolean(parsedSchema);
            if (!hasExplicitSchema || !parsedSchema) {
                this.host.tearDownGeneratedLayout();
                this.host.invalidate();
                return;
            }
            const cleanReset: unknown = parsedSchema.type === "array" ? { items: [] } : {};
            this.injectSchemaDefaults(
                parsedSchema,
                cleanReset,
                0,
                typeof this.host.getSchemaDefinitions === "function" ? this.host.getSchemaDefinitions() : undefined
            );
            stateManager.getModel().setData(cleanReset as object, false);
            this.host.onDataHotSwapped?.();
            return;
        }

        if (this.host.getProperty("debugMode")) {
            Logger.debug("[MetaUI]", `Accepted external injection for ${propertyName}`, "DataSyncDelegate");
        }

        if (!stateManager) {
            this.host.invalidate();
            return;
        }

        try {
            const isolatedCopy = deepClone(incomingObj);
            const parsedSchema =
                typeof this.host.getParsedSchema === "function" ? this.host.getParsedSchema() : null;
            const currentModelData: unknown = stateManager.getModel().getData();
            let targetData: unknown = isolatedCopy;
            if (
                parsedSchema?.type === "array" &&
                Array.isArray(isolatedCopy) &&
                !Array.isArray(currentModelData) &&
                isRecord(currentModelData) &&
                Array.isArray(currentModelData.items)
            ) {
                targetData = { items: isolatedCopy };
            }
            if (parsedSchema) {
                this.injectSchemaDefaults(
                    parsedSchema,
                    targetData,
                    0,
                    typeof this.host.getSchemaDefinitions === "function"
                        ? this.host.getSchemaDefinitions()
                        : undefined
                );
            }
            stateManager.getModel().setData(targetData as object, false);

            const baseline =
                typeof this.host.getInferredSchemaBaseline === "function"
                    ? this.host.getInferredSchemaBaseline()
                    : null;
            if (baseline || !this.host.getProperty("schemaDefinition")) {
                const newInferredSchema = SchemaNormalizer.inferSchemaFromData(isolatedCopy);
                if (!this.deepEquals(newInferredSchema, baseline ?? parsedSchema)) {
                    this.host.tearDownGeneratedLayout();
                    this.host.invalidate();
                    return;
                }
            }
            if (typeof this.host.onDataHotSwapped === "function") {
                this.host.onDataHotSwapped();
            }
        } catch (e) {
            const msg = `Failed to hot-swap ${propertyName}: ` + (e as Error).message;
            Logger.error("[MetaUI]", msg, "DataSyncDelegate");
            throw new Error(msg);
        }
    }

    /**
     * Reverts the live `StateManager` sandbox back to the last committed `data` or `dataJson` payload
     * when a modal dialog is cancelled in transactional mode (`liveUpdate === false`).
     */
    public revertToCommittedData(): void {
        const stateManager = this.host.getStateManager();
        if (!stateManager) return;

        let committed: unknown = this.host.getProperty("data");
        const rawJson = this.host.getProperty("dataJson");
        if ((committed === null || committed === undefined) && typeof rawJson === "string" && rawJson.trim().length > 0) {
            try {
                committed = JSON.parse(rawJson);
            } catch (_e) {
                committed = {};
            }
        }

        const parsedSchema = typeof this.host.getParsedSchema === "function" ? this.host.getParsedSchema() : null;
        const cloned =
            committed !== null && committed !== undefined
                ? deepClone(committed)
                : parsedSchema?.type === "array"
                  ? []
                  : {};
        let targetData: unknown = cloned;
        if (parsedSchema?.type === "array" && Array.isArray(cloned)) {
            targetData = { items: cloned };
        }
        if (parsedSchema) {
            this.injectSchemaDefaults(
                parsedSchema,
                targetData,
                0,
                typeof this.host.getSchemaDefinitions === "function" ? this.host.getSchemaDefinitions() : undefined
            );
        }
        stateManager.getModel().setData(targetData as object, false);
        this.host.onDataHotSwapped?.();
    }

    /**
     * Recursively compares two values for structural equality, ignoring key order.
     */
    private deepEquals(a: unknown, b: unknown): boolean {
        if (a === b) return true;
        if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
        if (Array.isArray(a) || Array.isArray(b)) {
            if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
            for (let i = 0; i < a.length; i++) {
                if (!this.deepEquals(a[i], b[i])) return false;
            }
            return true;
        }

        const recA = a as Record<string, unknown>;
        const recB = b as Record<string, unknown>;
        const keysA = Object.keys(recA).filter(k => recA[k] !== undefined);
        const keysB = Object.keys(recB).filter(k => recB[k] !== undefined);
        if (keysA.length !== keysB.length) return false;

        for (const key of keysA) {
            if (!keysB.includes(key)) return false;
            if (!this.deepEquals(recA[key], recB[key])) return false;
        }

        return true;
    }

    /**
     * Recursively scans an ISchema for `default` properties and injects them into `rootData`
     * if those properties are currently undefined. Callers must pass a cloned sandbox payload
     * so consumer-owned objects are never mutated.
     *
     * @param schema The MetaUI ISchema or IPropertyMetadata tree.
     * @param rootData The sandbox data payload to populate with defaults.
     * @param depth Current recursion depth (capped at 8 to guard against cyclic schemas).
     * @param definitions Optional normalized `$ref` schema definitions dictionary.
     */
    public injectSchemaDefaults(
        schema: ISchema | IPropertyMetadata | null | undefined,
        rootData: unknown,
        depth: number = 0,
        definitions?: Record<string, ISchema>
    ): void {
        if (!schema || !rootData || typeof rootData !== "object" || depth > 8) return;

        let effectiveSchema = schema;
        const schemaRef = "$ref" in schema ? schema.$ref : undefined;
        if (schemaRef && !schema.properties && definitions) {
            const refKey = schemaRef.split("/").pop();
            if (refKey && definitions[refKey]) {
                effectiveSchema = definitions[refKey];
            }
        }

        if (effectiveSchema.type === "object" && effectiveSchema.properties && isRecord(rootData)) {
            for (const key of Object.keys(effectiveSchema.properties)) {
                const rawPropSchema = effectiveSchema.properties[key];
                const refKey = rawPropSchema.$ref && !rawPropSchema.properties ? rawPropSchema.$ref.split("/").pop() : undefined;
                const propSchema: ISchema | IPropertyMetadata = (refKey && definitions?.[refKey]) || rawPropSchema;
                const propDefault = "default" in propSchema ? propSchema.default : undefined;

                if (rootData[key] === undefined) {
                    if (rawPropSchema.default !== undefined) {
                        rootData[key] = deepClone(rawPropSchema.default);
                    } else if (propDefault !== undefined) {
                        rootData[key] = deepClone(propDefault);
                    } else if (propSchema.type === "object") {
                        const tempObj: Record<string, unknown> = {};
                        this.injectSchemaDefaults(propSchema, tempObj, depth + 1, definitions);
                        if (Object.keys(tempObj).length > 0) {
                            rootData[key] = tempObj;
                        }
                    }
                } else if (typeof rootData[key] === "object" && rootData[key] !== null) {
                    this.injectSchemaDefaults(propSchema, rootData[key], depth + 1, definitions);
                }
            }
        } else if (effectiveSchema.type === "array" && effectiveSchema.items) {
            const targetArray = Array.isArray(rootData)
                ? rootData
                : isRecord(rootData) && Array.isArray(rootData.items)
                  ? rootData.items
                  : null;
            if (targetArray) {
                for (let i = 0; i < targetArray.length; i++) {
                    if (typeof targetArray[i] === "object" && targetArray[i] !== null) {
                        this.injectSchemaDefaults(effectiveSchema.items, targetArray[i], depth + 1, definitions);
                    }
                }
            }
        }
    }
}
