import deepEqual from "sap/base/util/deepEqual";
import extend from "sap/base/util/extend";
import { Logger } from "../../../utils/Logger";
import { SchemaNormalizer } from "../../../core/SchemaNormalizer";
import PropertyBinding from "sap/ui/model/PropertyBinding";
import { StateManager } from "../../../core/StateManager";

export interface IHostDataSync {
    getProperty(name: string): unknown;
    setProperty(name: string, value: unknown, suppressInvalidate?: boolean): this;
    setBaseProperty(name: string, value: unknown, suppressInvalidate?: boolean): this;
    getBinding(name: string): unknown;
    invalidate(): void;
    getStateManager(): StateManager | null;
    getParsedSchema?(): Record<string, unknown> | null;
    tearDownGeneratedLayout(): void;
}

/**
 * Handles two-way data sync, JSON parsing, loop-breaking, and inference structural diffs.
 */
export class DataSyncDelegate {
    private host: IHostDataSync;
    private _lastPushedPayloadJson: string | null = null;
    private _lastPushedPayloadObj: Record<string, unknown> | null = null;
    private _lastReceivedInputObj: Record<string, unknown> | null = null;

    /**
     * Initializes a new DataSyncDelegate to handle data payload binding extraction.
     * @param host The parent host interface containing properties.
     */
    constructor(host: IHostDataSync) {
        this.host = host;
    }

    /**
     * Natively forces the UI5 framework to push updated properties back up to any bound ViewModels.
     */
    public pushToBindings(payload: Record<string, unknown>): void {
        const payloadStr = JSON.stringify(payload, null, 2);

        // Cache exact payload output to catch echoes on the inbound side
        this._lastPushedPayloadJson = payloadStr;
        this._lastPushedPayloadObj = deepEqual({}, payload) ? null : JSON.parse(JSON.stringify(payload)); // Safe clone

        this.host.setProperty("data", payload, true);
        this.host.setProperty("dataJson", payloadStr, true);
    }

    /**
     * Intercepts and parses live updates to the data payload from two-way Fiori bindings.
     */
    public handleInputDataHotSwap(propertyName: string, value: unknown, suppressInvalidate?: boolean): void {
        let incomingObj: Record<string, unknown> | null = null;

        if (typeof value === "string") {
            try {
                incomingObj = JSON.parse(value) as Record<string, unknown>;
            } catch (e) {
                this.host.setBaseProperty(propertyName, value, true);
                return;
            }
        } else {
            incomingObj = value as Record<string, unknown>;
        }

        if (incomingObj === null) {
            this.host.setBaseProperty(propertyName, value, true);
            return;
        }

        // Loop Breaker 1: Stale Data Injection
        if (this._lastReceivedInputObj && deepEqual(incomingObj, this._lastReceivedInputObj)) {
            if (this.host.getProperty("debugMode")) {
                Logger.debug("[MetaUI]", `Dropped stale data injection for ${propertyName}`, "DataSyncDelegate");
            }
            this.host.setBaseProperty(propertyName, value, suppressInvalidate);
            return;
        }

        // Loop Breaker 2: Two-Way Data Echoes
        if (this._lastPushedPayloadObj && deepEqual(incomingObj, this._lastPushedPayloadObj)) {
            if (this.host.getProperty("debugMode")) {
                Logger.debug("[MetaUI]", `Dropped echo for ${propertyName}`, "DataSyncDelegate");
            }
            this.host.setBaseProperty(propertyName, value, suppressInvalidate);
            return;
        }

        this._lastReceivedInputObj = extend(true, {}, incomingObj) as Record<string, unknown>;

        if (this.host.getProperty("debugMode")) {
            Logger.debug("[MetaUI]", `Accepted external injection for ${propertyName}`, "DataSyncDelegate");
        }

        this.host.setBaseProperty(propertyName, value, true);

        const stateManager = this.host.getStateManager();
        if (!stateManager) {
            this.host.invalidate();
            return;
        }

        try {
            stateManager.getModel().setData(incomingObj, false);

            if (!this.host.getProperty("schemaDefinition") && typeof this.host.getParsedSchema === "function") {
                const newInferredSchema = SchemaNormalizer.inferSchemaFromData(incomingObj);
                const parsedSchema = this.host.getParsedSchema();
                if (!deepEqual(newInferredSchema, parsedSchema)) {
                    this.host.tearDownGeneratedLayout();
                    this.host.invalidate();
                }
            }
        } catch (e) {
            const msg = `Failed to hot-swap ${propertyName}: ` + (e as Error).message;
            Logger.error("[MetaUI]", msg, "DataSyncDelegate");
            throw new Error(msg);
        }
    }

    /**
     * Recursively scans an ISchema for `default` properties and injects them into the rootData 
     * object if those properties are currently undefined.
     * 
     * @param schema The MetaUI ISchema tree.
     * @param rootData The data payload to mutate.
     */
    public injectSchemaDefaults(schema: unknown, rootData: unknown, depth: number = 0): void {
        if (!schema || !rootData || typeof rootData !== "object" || depth > 8) return;

        if (schema.type === "object" && schema.properties) {
            for (const key of Object.keys(schema.properties)) {
                const propSchema = schema.properties[key];
                
                if (rootData[key] === undefined) {
                    if (propSchema.default !== undefined) {
                        rootData[key] = propSchema.default;
                    } else if (propSchema.type === "object") {
                        const tempObj = {};
                        this.injectSchemaDefaults(propSchema, tempObj, depth + 1);
                        if (Object.keys(tempObj).length > 0) {
                            rootData[key] = tempObj;
                        }
                    }
                } else if (typeof rootData[key] === "object" && rootData[key] !== null) {
                    this.injectSchemaDefaults(propSchema, rootData[key], depth + 1);
                }
            }
        } else if (schema.type === "array" && schema.items && Array.isArray(rootData)) {
            for (let i = 0; i < rootData.length; i++) {
                if (typeof rootData[i] === "object" && rootData[i] !== null) {
                    this.injectSchemaDefaults(schema.items, rootData[i], depth + 1);
                }
            }
        }
    }
}
