/**
 * @file DataSyncDelegate.ts
 * @description Handles two-way data sync, JSON parsing, loop-breaking, and inference structural diffs.
 */

import { Logger } from "../../../utils/Logger";
import { SchemaNormalizer } from "../../../core/SchemaNormalizer";
import { ITreeChild, SchemaShape, SchemaWalker } from "../../../core/SchemaWalker";
import { StateManager } from "../../../core/StateManager";
import { ISchema, IPropertyMetadata } from "../../../interfaces/ISchema";
import { isRecord, deepClone } from "../../../utils/TypeGuards";
import { OpenApiRefResolver } from "../../../openapi/OpenApiRefResolver";
import { MAX_SCHEMA_DEPTH } from "../../../constants/MetaUIConstants";

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
 * Minimal host surface required to apply the "writing `data` retires a stale `dataJson`" rule.
 * Implemented by both `GeneratorHost` (via {@link IHostDataSync}) and the `DynamicHost` facade.
 */
export interface IDataJsonInvalidationTarget {
    getBinding(name: string): unknown;
    setBaseProperty(name: string, value: unknown, suppressInvalidate?: boolean): unknown;
}

/**
 * Host surface required to commit the (`data`, `dataJson`) pair. Extends
 * {@link IDataJsonInvalidationTarget} with the read needed to decide whether `dataJson`
 * is actually observed, which the invalidation rule on its own does not need.
 */
export interface IDataPairCommitTarget extends IDataJsonInvalidationTarget {
    getBaseProperty(name: string): unknown;
}

/**
 * Handles two-way data sync, JSON parsing, loop-breaking, and inference structural diffs.
 */
export class DataSyncDelegate {
    private host: IHostDataSync;
    private _isSyncing: boolean = false;

    /**
     * Retires a stale literal `dataJson` whenever `data` is written, so the most recently supplied payload
     * always wins. Both host properties describe the same payload, and `HOST_CONTROL_METADATA` declares
     * `data` before `dataJson`; without this rule a leftover `dataJson` would silently override a newer
     * `data` value when the facade replays its properties into a freshly spawned inner host.
     *
     * Does nothing when `dataJson` carries its own binding, since that binding owns the value.
     *
     * @param host The host whose base properties are being written.
     * @param propertyName The property that was just written.
     */
    public static invalidateStaleDataJson(host: IDataJsonInvalidationTarget, propertyName: string): void {
        if (propertyName !== "data" || host.getBinding("dataJson")) {
            return;
        }
        host.setBaseProperty("dataJson", null, true);
    }

    /**
     * The single writer of the committed (`data`, `dataJson`) property pair.
     *
     * `data` and `dataJson` are two views of one payload, so whoever writes one must decide about
     * the other in the same breath. {@link DataSyncDelegate.invalidateStaleDataJson} was extracted
     * to stop the facade and the inner host diverging on that rule, and a third copy grew in
     * `SchemaResolutionDelegate.createAndWireInnerHost` anyway, bypassing it. Both rules now live
     * here, and the `[DATA_WRITER]` gate in `scripts/run-tests.js` forbids
     * `setBaseProperty("data", ...)` or `setBaseProperty("dataJson", ...)` anywhere outside this file.
     *
     * `dataJson` is serialized only when it is actually observed -- bound, already a string, or
     * already serialized by the caller -- so an unused `dataJson` never costs a `JSON.stringify`.
     *
     * @param host The host whose base properties are written.
     * @param payload The committed payload to store in `data`.
     * @param serializedJson Optional pre-serialized JSON to reuse instead of re-stringifying.
     */
    public static commitDataPair(host: IDataPairCommitTarget, payload: unknown, serializedJson?: string): void {
        host.setBaseProperty("data", payload, true);
        const needsJson =
            Boolean(host.getBinding("dataJson")) ||
            typeof host.getBaseProperty("dataJson") === "string" ||
            typeof serializedJson === "string";
        if (needsJson) {
            host.setBaseProperty("dataJson", serializedJson || JSON.stringify(payload, null, 2), true);
            return;
        }
        this.invalidateStaleDataJson(host, "data");
    }

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
                } catch (e) {
                    Logger.error(
                        "[MetaUI]",
                        `Failed to parse ${propertyName} string: ${(e as Error).message}. ` +
                            "Tearing down the generated layout rather than rendering stale content.",
                        "DataSyncDelegate"
                    );
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
        DataSyncDelegate.invalidateStaleDataJson(this.host, propertyName);
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
            } catch (e) {
                Logger.error(
                    "[MetaUI]",
                    `Failed to parse dataJson string while reverting: ${(e as Error).message}. ` +
                        "There is no readable committed baseline, so the form is reset to an empty payload.",
                    "DataSyncDelegate"
                );
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
     * @param depth Current recursion depth (capped at MAX_SCHEMA_DEPTH to guard against cyclic schemas).
     * @param definitions Optional normalized `$ref` schema definitions dictionary.
     */
    public injectSchemaDefaults(
        schema: ISchema | IPropertyMetadata | null | undefined,
        rootData: unknown,
        depth: number = 0,
        definitions?: Record<string, ISchema>
    ): void {
        if (!schema || !rootData || typeof rootData !== "object") return;

        const resolveOneHop = (node: ISchema | IPropertyMetadata): ISchema | IPropertyMetadata => {
            const schemaRef = "$ref" in node ? node.$ref : undefined;
            if (schemaRef && !node.properties && definitions) {
            const refKey = OpenApiRefResolver.extractRefName(schemaRef);
                if (refKey && definitions[refKey]) {
                    return definitions[refKey];
                }
            }
            return node;
        };

        const dynamicEdges = new Map<IPropertyMetadata, ITreeChild<IPropertyMetadata>[]>();
        const childOthers = new Map<IPropertyMetadata, object>();
        const tempObjects = new WeakSet<object>();

        SchemaWalker.walkPaired(
            { ...(schema as IPropertyMetadata) },
            rootData,
            {
                stepProperty: (_other, _key, childNode) => childOthers.get(childNode),
                stepArray: (other, itemNode) => {
                    const targetArray = Array.isArray(other)
                        ? other
                        : isRecord(other) && Array.isArray(other.items)
                          ? other.items
                          : null;
                    if (!targetArray) {
                        return [];
                    }
                    const rows: Array<{ key: string; value: object }> = [];
                    for (let i = 0; i < targetArray.length; i++) {
                        const rowVal: unknown = targetArray[i];
                        if (typeof rowVal === "object" && rowVal !== null) {
                            rows.push({ key: String(i), value: rowVal });
                        }
                    }
                    void itemNode;
                    return rows;
                }
            },
            (ctx) => {
                const effectiveSchema = resolveOneHop(ctx.node);
                const currentData = ctx.other;
                const edges: ITreeChild<IPropertyMetadata>[] = [];

                if (effectiveSchema.type === "object" && effectiveSchema.properties && isRecord(currentData)) {
                    for (const key of Object.keys(effectiveSchema.properties)) {
                        const rawPropSchema = effectiveSchema.properties[key];
                        const propSchema = resolveOneHop(rawPropSchema);
                        const propDefault = "default" in propSchema ? propSchema.default : undefined;

                        if (currentData[key] === undefined) {
                            if (rawPropSchema.default !== undefined) {
                                currentData[key] = deepClone(rawPropSchema.default);
                            } else if (propDefault !== undefined) {
                                currentData[key] = deepClone(propDefault);
                            } else if (propSchema.type === "object") {
                                const tempObj: Record<string, unknown> = {};
                                tempObjects.add(tempObj);
                                const childNode: IPropertyMetadata = { ...(propSchema as IPropertyMetadata) };
                                childOthers.set(childNode, tempObj);
                                edges.push({
                                    key,
                                    node: childNode,
                                    kind: "property",
                                    scopeSegment: `properties/${key}`,
                                    bindingSegment: key
                                });
                            }
                        } else if (typeof currentData[key] === "object" && currentData[key] !== null) {
                            const childNode: IPropertyMetadata = { ...(propSchema as IPropertyMetadata) };
                            childOthers.set(childNode, currentData[key]);
                            edges.push({
                                key,
                                node: childNode,
                                kind: "property",
                                scopeSegment: `properties/${key}`,
                                bindingSegment: key
                            });
                        }
                    }
                } else if (effectiveSchema.type === "array" && effectiveSchema.items) {
                    const targetArray = Array.isArray(currentData)
                        ? currentData
                        : isRecord(currentData) && Array.isArray(currentData.items)
                          ? currentData.items
                          : null;
                    if (targetArray) {
                        edges.push({
                            key: "items",
                            node: { ...effectiveSchema.items },
                            kind: "item",
                            scopeSegment: "items",
                            bindingSegment: "items"
                        });
                    }
                }

                dynamicEdges.set(ctx.node, edges);
                return edges.length > 0 ? undefined : "skip-subtree";
            },
            {
                shape: SchemaShape,
                visitRoot: true,
                resolveRefs: false,
                initialDepth: depth,
                silentTruncationLog: true,
                resolveDynamicChildren: (node) => dynamicEdges.get(node) ?? [],
                onLeave: (ctx) => {
                    dynamicEdges.delete(ctx.node);
                    childOthers.delete(ctx.node);
                    if (
                        ctx.kind === "property" &&
                        isRecord(ctx.other) &&
                        tempObjects.has(ctx.other) &&
                        isRecord(ctx.parentOther)
                    ) {
                        tempObjects.delete(ctx.other);
                        if (Object.keys(ctx.other).length > 0) {
                            ctx.parentOther[ctx.key] = ctx.other;
                        }
                    }
                },
                onTruncate: (_scope, reason) => {
                    if (reason === "depth") {
                        Logger.warn(
                            "[MetaUI]",
                            `Schema nesting exceeded MAX_SCHEMA_DEPTH (${MAX_SCHEMA_DEPTH}); ` +
                                `schema defaults below this level were not injected, ` +
                                `so those fields start empty rather than at their declared default.`,
                            "DataSyncDelegate"
                        );
                    }
                }
            }
        );
    }
}
