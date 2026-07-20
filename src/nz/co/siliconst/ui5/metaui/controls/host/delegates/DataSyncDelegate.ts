import deepEqual from "sap/base/util/deepEqual";
import extend from "sap/base/util/extend";
import { Logger } from "../../../utils/Logger";
import { SchemaNormalizer } from "../../../core/SchemaNormalizer";
import PropertyBinding from "sap/ui/model/PropertyBinding";
import { StateManager } from "../../../core/StateManager";

export interface IHostDataSync {
    getProperty(name: string): unknown;
    setProperty(name: string, value: unknown, suppressInvalidate?: boolean): any;
    setBaseProperty(name: string, value: unknown, suppressInvalidate?: boolean): any;
    getBinding(name: string): any;
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

        this.host.setProperty("outputData", payload, true);
        this.host.setProperty("outputDataJson", payloadStr, true);

        let outDataBinding = this.host.getBinding("outputData") as PropertyBinding;
        if (!outDataBinding && (this.host as any).getParent && (this.host as any).getParent()?.getMetadata().getName() === "nz.co.siliconst.ui5.metaui.controls.DynamicHost") {
            outDataBinding = (this.host as any).getParent().getBinding("outputData");
        }

        if (outDataBinding && typeof outDataBinding.setExternalValue === "function") {
            outDataBinding.setExternalValue(payload);
        } else if (outDataBinding && typeof outDataBinding.setValue === "function") {
            outDataBinding.setValue(payload);
        }

        let outJsonBinding = this.host.getBinding("outputDataJson") as PropertyBinding;
        if (!outJsonBinding && (this.host as any).getParent && (this.host as any).getParent()?.getMetadata().getName() === "nz.co.siliconst.ui5.metaui.controls.DynamicHost") {
            outJsonBinding = (this.host as any).getParent().getBinding("outputDataJson");
        }

        if (outJsonBinding && typeof outJsonBinding.setExternalValue === "function") {
            outJsonBinding.setExternalValue(payloadStr);
        } else if (outJsonBinding && typeof outJsonBinding.setValue === "function") {
            outJsonBinding.setValue(payloadStr);
        }
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
            if (this.host.getProperty("debugMode")) {
                sap.ui.require(["sap/m/MessageBox"], (MessageBox: unknown) => (MessageBox as Record<string, Function>).error(msg));
            }
        }
    }
}
