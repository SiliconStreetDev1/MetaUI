/**
 * @file ODataDelegate.ts
 * @description Universal OData Delegate. Natively detects and manages two-way synchronization
 * for both OData V2 and V4 contexts without requiring controller-level mappings.
 */

import type DynamicHost from "../../DynamicHost";
import { Logger } from "../../../utils/Logger";
import ODataV4Context from "sap/ui/model/odata/v4/Context";
import Context from "sap/ui/model/Context";
import Event from "sap/ui/base/Event";
import { isRecord } from "../../../utils/TypeGuards";

interface IODataV2ModelLike {
    setProperty?: (path: string, value: unknown, context?: Context) => boolean;
}

interface IODataV4ContextLike extends Context {
    requestObject?: () => Promise<unknown>;
    setProperty?: (path: string, value: unknown) => Promise<void> | void;
}

/**
 * Universal OData Delegate.
 * Natively detects and manages two-way synchronization for both OData V2 and V4 contexts
 * without requiring controller-level mappings.
 */
export class ODataDelegate {
    private host: DynamicHost;
    private context: ODataV4Context | Context;
    private odataType: "V2" | "V4" | null = null;
    private isSyncing: boolean = false;
    private destroyed: boolean = false;

    /**
     * Initializes a new instance of the ODataDelegate.
     *
     * @param {DynamicHost} host The parent MetaUI DynamicHost instance managing the UI generation.
     * @param {Context} context The active UI5 Model Context bound to the host.
     */
    constructor(host: DynamicHost, context: ODataV4Context | Context) {
        this.host = host;
        this.context = context;
        this.detectODataType();

        this.host.attachEvent("fieldChange", this.onFieldChange, this);
        this.host.attachEvent("submit", this.onSubmit, this);
    }

    /**
     * @returns {ODataV4Context | Context} The context currently managed by this delegate.
     */
    public getContext(): ODataV4Context | Context {
        return this.context;
    }

    /**
     * Event listener wrapper for field changes emitted by the host.
     * Patches the OData context continuously when `liveUpdate` is enabled.
     */
    private onFieldChange(oEvent: Event): void {
        if (this.host.getProperty("liveUpdate") === false) {
            return;
        }
        const params = oEvent.getParameters() as { fieldPath?: string; value?: unknown };
        if (typeof params.fieldPath === "string" && params.fieldPath.length > 0 && params.value !== undefined) {
            this.handleFieldChange(params.fieldPath, params.value);
        }
    }

    /**
     * Event listener wrapper for validated submissions emitted by the host.
     * Flushes all committed payload properties to the bound OData V2 or V4 context on demand.
     */
    private onSubmit(oEvent: Event): void {
        const params = oEvent.getParameters() as { payload?: unknown };
        if (isRecord(params.payload)) {
            this.syncPayloadToContext(params.payload, "");
        }
    }

    /**
     * Recursively patches leaf properties of a committed payload onto the bound OData context.
     *
     * @param record The payload object or nested sub-object to patch.
     * @param prefix The relative slash-separated OData property path prefix.
     */
    private syncPayloadToContext(record: Record<string, unknown>, prefix: string): void {
        for (const key of Object.keys(record)) {
            const val = record[key];
            const path = prefix ? `${prefix}/${key}` : key;
            if (isRecord(val)) {
                this.syncPayloadToContext(val, path);
            } else if (Array.isArray(val)) {
                continue;
            } else {
                this.handleFieldChange(path, val);
            }
        }
    }

    /**
     * Evaluates the underlying UI5 Model bound to the context to determine if it is an
     * OData V2 or OData V4 model.
     */
    private detectODataType(): void {
        const v4Candidate: IODataV4ContextLike = this.context;
        if (typeof v4Candidate.requestObject === "function") {
            this.odataType = "V4";
            return;
        }
        const model = typeof this.context.getModel === "function" ? this.context.getModel() : null;
        if (!model) {
            if (typeof this.context.getObject === "function") {
                this.odataType = "V2";
            }
            return;
        }
        const sClassName = model.getMetadata().getName();
        if (sClassName.indexOf("v4") > -1) {
            this.odataType = "V4";
        } else if (
            sClassName.indexOf("v2") > -1 ||
            sClassName.indexOf("ODataModel") > -1 ||
            typeof this.context.getObject === "function"
        ) {
            this.odataType = "V2";
        }
    }

    /**
     * Extracts the full entity payload from the bound OData context and pushes it to the Engine.
     * V4 uses an asynchronous `requestObject()`, while V2 retrieves it synchronously via `getObject()`.
     */
    public syncToEngine(): void {
        if (!this.odataType) return;

        if (this.odataType === "V4") {
            const v4Context: IODataV4ContextLike = this.context;
            if (typeof v4Context.requestObject === "function") {
                v4Context.requestObject().then((oData: unknown) => {
                    if (this.destroyed || this.host.isDestroyed()) {
                        return;
                    }
                    this.pushPayload(oData);
                }).catch((err: Error) => {
                    if (!this.destroyed && !this.host.isDestroyed()) {
                        Logger.error("[MetaUI]", "Failed to extract V4 Context payload: " + err.message, "ODataDelegate");
                    }
                });
            }
        } else if (this.odataType === "V2") {
            const oData: unknown = this.context.getObject();
            if (oData) {
                this.pushPayload(oData);
            }
        }
    }

    /**
     * Cleans the raw OData payload by recursively stripping framework metadata properties (keys starting with '@' or '__')
     * and pushes the sanitized business data into the MetaUI DynamicHost state manager.
     *
     * @param {unknown} oData The raw JSON object extracted from the OData model context.
     */
    private pushPayload(oData: unknown): void {
        if (!isRecord(oData)) return;

        const cleanData = this.sanitizeODataPayload(oData, 0);

        this.isSyncing = true;
        this.host.setProperty("data", cleanData);
        this.isSyncing = false;
    }

    /**
     * Recursively clones an OData object/array and removes keys starting with `@` or `__`.
     */
    private sanitizeODataPayload(value: unknown, depth: number): unknown {
        if (depth > 10 || value === null || value === undefined || typeof value !== "object") {
            return value;
        }
        if (value instanceof Date) {
            return value.toISOString();
        }
        if (Array.isArray(value)) {
            return value.map((item) => this.sanitizeODataPayload(item, depth + 1));
        }
        if (isRecord(value)) {
            const cleanObj: Record<string, unknown> = {};
            for (const key of Object.keys(value)) {
                if (key.startsWith("@") || key.startsWith("__")) {
                    continue;
                }
                const propVal = value[key];
                if (isRecord(propVal)) {
                    const propKeys = Object.keys(propVal);
                    if (propKeys.length > 0 && propKeys.every((k) => k.startsWith("__") || k.startsWith("@"))) {
                        continue;
                    }
                }
                cleanObj[key] = this.sanitizeODataPayload(propVal, depth + 1);
            }
            return cleanObj;
        }
        return value;
    }

    /**
     * Intercepts a field change from the MetaUI Engine and translates it into an OData property update.
     */
    public handleFieldChange(fieldPath: string, value: unknown): void {
        if (this.isSyncing || !this.odataType) {
            return;
        }
        const cleanPath = fieldPath.replace(/^\/+/, "");
        if (!cleanPath) {
            return;
        }

        try {
            let currentVal: unknown;
            if (typeof this.context.getProperty === "function") {
                try {
                    currentVal = this.context.getProperty(cleanPath);
                } catch (_err) {
                    currentVal = undefined;
                }
            }
            if (currentVal === value) {
                return;
            }
            if (this.odataType === "V4") {
                const v4Context: IODataV4ContextLike = this.context;
                if (typeof v4Context.setProperty === "function") {
                    const result = v4Context.setProperty(cleanPath, value);
                    if (result && typeof (result as Promise<void>).catch === "function") {
                        (result as Promise<void>).catch((err: unknown) => {
                            const msg = err instanceof Error ? err.message : String(err);
                            Logger.error(
                                "[MetaUI]",
                                `Failed to patch OData V4 property '${cleanPath}': ${msg}`,
                                "ODataDelegate"
                            );
                            if (!this.destroyed && typeof this.host.fireEvent === "function") {
                                this.host.fireEvent("error", {
                                    message: `Failed to patch OData V4 property '${cleanPath}': ${msg}`,
                                    fieldPath: `/${cleanPath}`
                                });
                            }
                        });
                    }
                }
            } else if (this.odataType === "V2") {
                const model = this.context.getModel() as IODataV2ModelLike | undefined;
                if (typeof model?.setProperty === "function") {
                    model.setProperty(cleanPath, value, this.context);
                }
            }
            if (this.host.getProperty("debugMode")) {
                Logger.debug("[MetaUI]", `ODataDelegate Patched ${cleanPath} = ${String(value)} via ${this.odataType}`, "ODataDelegate");
            }
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            Logger.error("[MetaUI]", `Failed to patch OData context: ${msg}`, "ODataDelegate");
            if (!this.destroyed && typeof this.host.fireEvent === "function") {
                this.host.fireEvent("error", {
                    message: `Failed to patch OData context: ${msg}`,
                    fieldPath: `/${cleanPath}`
                });
            }
        }
    }

    /**
     * Detaches the `fieldChange` and `submit` listeners from the host to prevent leaks when contexts change or the host exits.
     */
    public destroy(): void {
        this.destroyed = true;
        this.host.detachEvent("fieldChange", this.onFieldChange, this);
        this.host.detachEvent("submit", this.onSubmit, this);
    }
}
