
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
    private _isSyncing: boolean = false;

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
        this._isSyncing = true;
        const payloadStr = JSON.stringify(payload, null, 2);

        this.host.setProperty("data", payload, true);
        this.host.setProperty("dataJson", payloadStr, true);
        
        this._isSyncing = false;
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
                this.host.setBaseProperty(propertyName, value, false); // Invalidate to force rendering engine to display the error strip
                return;
            }
        } else {
            incomingObj = value as Record<string, unknown>;
        }

        if (incomingObj === null) {
            this.host.setBaseProperty(propertyName, value, true);
            return;
        }

        if (this._isSyncing) {
            if (this.host.getProperty("debugMode")) {
                Logger.debug("[MetaUI]", `Dropped echo for ${propertyName} due to active sync lock`, "DataSyncDelegate");
            }
            this.host.setBaseProperty(propertyName, value, suppressInvalidate);
            return;
        }

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
                const parsedSchema = this.host.getParsedSchema();
                const newInferredSchema = SchemaNormalizer.inferSchemaFromData(incomingObj);
                if (!this.deepEquals(newInferredSchema, parsedSchema)) {
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
     * Recursively compares two objects for equality, ignoring key order.
     */
    private deepEquals(a: any, b: any): boolean {
        if (a === b) return true;
        if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
        if (Array.isArray(a) !== Array.isArray(b)) return false;

        const keysA = Object.keys(a);
        const keysB = Object.keys(b);
        if (keysA.length !== keysB.length) return false;

        for (const key of keysA) {
            if (!keysB.includes(key)) return false;
            if (!this.deepEquals(a[key], b[key])) return false;
        }

        return true;
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

        const typedSchema = schema as Record<string, unknown>;
        const typedRootData = rootData as Record<string, unknown>;

        if (typedSchema.type === "object" && typedSchema.properties) {
            const properties = typedSchema.properties as Record<string, unknown>;
            for (const key of Object.keys(properties)) {
                const propSchema = properties[key] as Record<string, unknown>;
                
                if (typedRootData[key] === undefined) {
                    if (propSchema.default !== undefined) {
                        typedRootData[key] = propSchema.default;
                    } else if (propSchema.type === "object") {
                        const tempObj = {};
                        this.injectSchemaDefaults(propSchema, tempObj, depth + 1);
                        if (Object.keys(tempObj).length > 0) {
                            typedRootData[key] = tempObj;
                        }
                    }
                } else if (typeof typedRootData[key] === "object" && typedRootData[key] !== null) {
                    this.injectSchemaDefaults(propSchema, typedRootData[key], depth + 1);
                }
            }
        } else if (typedSchema.type === "array" && typedSchema.items && Array.isArray(typedRootData)) {
            for (let i = 0; i < typedRootData.length; i++) {
                if (typeof typedRootData[i] === "object" && typedRootData[i] !== null) {
                    this.injectSchemaDefaults(typedSchema.items, typedRootData[i], depth + 1);
                }
            }
        }
    }
}
