/**
 * @file ODataDelegate.ts
 * @description Universal OData Delegate. Natively detects and manages two-way synchronization
 * for both OData V2 and V4 contexts without requiring controller-level mappings.
 */

import type DynamicHost from "../../DynamicHost";
import { Logger } from "../../../utils/Logger";
import { JsonPayloadShape, SchemaWalker } from "../../../core/SchemaWalker";
import ODataV4Context from "sap/ui/model/odata/v4/Context";
import Context from "sap/ui/model/Context";
import Event from "sap/ui/base/Event";
import { isRecord } from "../../../utils/TypeGuards";
import { MAX_SCHEMA_DEPTH } from "../../../constants/MetaUIConstants";

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
                this.syncArrayToContext(val, path);
            } else {
                this.handleFieldChange(path, val);
            }
        }
    }

    /**
     * Recursively patches the leaf entries of a committed collection onto the bound OData context.
     * Mirrors the element-wise paths (`Items/0/Qty`) the Engine already emits in `liveUpdate` mode so a
     * transactional submit writes exactly what a live edit would.
     *
     * @param items The payload collection or nested sub-collection to patch.
     * @param prefix The relative slash-separated OData property path of the collection itself.
     */
    private syncArrayToContext(items: unknown[], prefix: string): void {
        for (let index = 0; index < items.length; index++) {
            const entry = items[index];
            const path = `${prefix}/${index}`;
            if (isRecord(entry)) {
                this.syncPayloadToContext(entry, path);
            } else if (Array.isArray(entry)) {
                this.syncArrayToContext(entry, path);
            } else {
                this.handleFieldChange(path, entry);
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
        if (depth > MAX_SCHEMA_DEPTH) {
            Logger.warn(
                `OData payload nesting exceeded MAX_SCHEMA_DEPTH (${MAX_SCHEMA_DEPTH}); '@'/'__' annotation keys ` +
                    `below this level were left in the payload instead of being stripped.`,
                undefined,
                "ODataDelegate"
            );
            return value;
        }
        if (value === null || value === undefined || typeof value !== "object") {
            return value;
        }
        if (value instanceof Date) {
            return value.toISOString();
        }
        if (!Array.isArray(value) && !isRecord(value)) {
            return value;
        }

        const isDeferredStub = (val: unknown): boolean => {
            if (!isRecord(val)) return false;
            const keys = Object.keys(val);
            return keys.length > 0 && keys.every((k) => k.startsWith("__") || k.startsWith("@"));
        };

        const sanitizedMap = new Map<object, unknown>();

        SchemaWalker.walk(
            value,
            (ctx) => {
                if (ctx.depth >= MAX_SCHEMA_DEPTH) {
                    const warnMsg =
                        `OData payload nesting exceeded MAX_SCHEMA_DEPTH (${MAX_SCHEMA_DEPTH}); '@'/'__' annotation keys ` +
                        `below this level were left in the payload instead of being stripped.`;
                    if (Array.isArray(ctx.node)) {
                        for (let i = 0; i < ctx.node.length; i++) {
                            Logger.warn(warnMsg, undefined, "ODataDelegate");
                        }
                        sanitizedMap.set(ctx.node, [...ctx.node]);
                    } else if (isRecord(ctx.node)) {
                        const cleanObj: Record<string, unknown> = {};
                        for (const key of Object.keys(ctx.node)) {
                            if (key.startsWith("@") || key.startsWith("__")) {
                                continue;
                            }
                            const propVal = ctx.node[key];
                            if (isDeferredStub(propVal)) {
                                continue;
                            }
                            Logger.warn(warnMsg, undefined, "ODataDelegate");
                            cleanObj[key] = propVal;
                        }
                        sanitizedMap.set(ctx.node, cleanObj);
                    }
                    return "skip-subtree";
                }
                return undefined;
            },
            {
                shape: JsonPayloadShape,
                visitRoot: true,
                initialDepth: depth,
                silentTruncationLog: true,
                shouldVisitChild: (child, key, _parent, isArrayItem) => {
                    if (!isArrayItem) {
                        if (key.startsWith("@") || key.startsWith("__")) {
                            return false;
                        }
                        if (isDeferredStub(child)) {
                            return false;
                        }
                    }
                    return true;
                },
                onLeave: (ctx) => {
                    if (Array.isArray(ctx.node)) {
                        if (sanitizedMap.has(ctx.node)) {
                            return;
                        }
                        const cleanArr = ctx.node.map((item: unknown) => {
                            if (item instanceof Date) return item.toISOString();
                            if (isRecord(item) || Array.isArray(item)) {
                                return sanitizedMap.get(item) ?? item;
                            }
                            return item;
                        });
                        sanitizedMap.set(ctx.node, cleanArr);
                    } else if (isRecord(ctx.node)) {
                        if (sanitizedMap.has(ctx.node)) {
                            return;
                        }
                        const cleanObj: Record<string, unknown> = {};
                        for (const key of Object.keys(ctx.node)) {
                            if (key.startsWith("@") || key.startsWith("__")) {
                                continue;
                            }
                            const propVal = ctx.node[key];
                            if (isDeferredStub(propVal)) {
                                continue;
                            }
                            if (propVal instanceof Date) {
                                cleanObj[key] = propVal.toISOString();
                            } else if (isRecord(propVal) || Array.isArray(propVal)) {
                                cleanObj[key] = sanitizedMap.get(propVal) ?? propVal;
                            } else {
                                cleanObj[key] = propVal;
                            }
                        }
                        sanitizedMap.set(ctx.node, cleanObj);
                    }
                }
            }
        );

        return sanitizedMap.get(value) ?? value;
    }

    /**
     * Compares a model value against an outbound Engine value.
     *
     * `sanitizeODataPayload` flattens OData V2 `Date` instances to ISO strings before they reach the Engine,
     * so a strict `===` can never match on the way back and every submit would rewrite every date. Dates are
     * therefore compared by instant rather than by identity.
     *
     * @param currentVal The value currently held by the bound OData context.
     * @param value The value the Engine wants to write.
     * @returns {boolean} True when the context already holds this value.
     */
    private valuesMatch(currentVal: unknown, value: unknown): boolean {
        if (currentVal === value) {
            return true;
        }
        if (currentVal instanceof Date) {
            if (value instanceof Date) {
                return value.getTime() === currentVal.getTime();
            }
            if (typeof value === "string") {
                const parsed = Date.parse(value);
                return !Number.isNaN(parsed) && parsed === currentVal.getTime();
            }
        }
        return false;
    }

    /**
     * Restores the native type of an outbound value when the bound property is `Date`-typed, so a genuinely
     * changed OData V2 `Edm.DateTime` property receives a `Date` rather than the ISO string the Engine holds.
     *
     * @param currentVal The value currently held by the bound OData context.
     * @param value The value the Engine wants to write.
     * @returns {unknown} The value to hand to the OData model.
     */
    private coerceOutboundValue(currentVal: unknown, value: unknown): unknown {
        if (currentVal instanceof Date && typeof value === "string") {
            const parsed = Date.parse(value);
            if (!Number.isNaN(parsed)) {
                return new Date(parsed);
            }
        }
        return value;
    }

    /**
     * Logs a failed OData write and surfaces it to the consuming application through the host `error` event,
     * so a rejected or failed patch is never swallowed.
     *
     * @param message Human-readable description of the failure.
     * @param cleanPath The relative OData property path that failed.
     */
    private reportWriteFailure(message: string, cleanPath: string): void {
        Logger.error("[MetaUI]", message, "ODataDelegate");
        if (!this.destroyed && typeof this.host.fireEvent === "function") {
            this.host.fireEvent("error", { message, fieldPath: `/${cleanPath}` });
        }
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
                    // CATCH_EXEMPT: an OData V4 Context throws for a property that has not been
                    // requested yet; 'not loaded' is indistinguishable from 'absent' here and both
                    // mean the same thing to the change check below -- treat it as no prior value.
                    currentVal = undefined;
                }
            }
            if (this.valuesMatch(currentVal, value)) {
                return;
            }
            const outbound = this.coerceOutboundValue(currentVal, value);
            if (this.odataType === "V4") {
                const v4Context: IODataV4ContextLike = this.context;
                if (typeof v4Context.setProperty === "function") {
                    const result = v4Context.setProperty(cleanPath, outbound);
                    if (result && typeof (result as Promise<void>).catch === "function") {
                        (result as Promise<void>).catch((err: unknown) => {
                            const msg = err instanceof Error ? err.message : String(err);
                            this.reportWriteFailure(`Failed to patch OData V4 property '${cleanPath}': ${msg}`, cleanPath);
                        });
                    }
                }
            } else if (this.odataType === "V2") {
                const model = this.context.getModel() as IODataV2ModelLike | undefined;
                if (typeof model?.setProperty === "function") {
                    const accepted = model.setProperty(cleanPath, outbound, this.context);
                    if (accepted === false) {
                        this.reportWriteFailure(`OData V2 model rejected the write to property '${cleanPath}'`, cleanPath);
                        return;
                    }
                }
            }
            if (this.host.getProperty("debugMode")) {
                Logger.debug(
                    "[MetaUI]",
                    `ODataDelegate Patched ${cleanPath} = ${String(outbound)} via ${this.odataType}`,
                    "ODataDelegate"
                );
            }
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            this.reportWriteFailure(`Failed to patch OData context: ${msg}`, cleanPath);
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
