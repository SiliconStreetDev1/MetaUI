/**
 * @file SchemaResolutionDelegate.ts
 * @description Host delegate for DynamicHost that resolves remote URL schemas via SchemaProvider,
 * translates raw schemas via SchemaBuilderRegistry, and wires inner GeneratorHost properties and events.
 */

import Event from "sap/ui/base/Event";
import MessageToast from "sap/m/MessageToast";
import GeneratorHost from "../GeneratorHost";
import InferredGeneratorHost from "../InferredGeneratorHost";
import { SchemaBuilderRegistry } from "../../../core/SchemaBuilderRegistry";
import { SchemaProvider } from "../../../services/SchemaProvider";
import { Logger } from "../../../utils/Logger";
import { isRecord } from "../../../utils/TypeGuards";
import { DataSyncDelegate } from "./DataSyncDelegate";
import type DynamicHost from "../../DynamicHost";

/**
 * Delegate managing remote schema resolution and inner `GeneratorHost` initialization for `DynamicHost`.
 *
 * @namespace nz.co.siliconst.ui5.metaui.controls.host.delegates
 * @internal
 */
export class SchemaResolutionDelegate {
    private fetchRequestId: number = 0;
    private fetchPromise: Promise<void> | null = null;
    private fetchUrl: string | null = null;

    constructor(private readonly facade: DynamicHost) {}

    /**
     * Returns any currently active remote schema fetch promise so `openInDialog` can await it.
     * @returns {Promise<void> | null} The active fetch promise, or `null`.
     */
    public getFetchPromise(): Promise<void> | null {
        return this.fetchPromise;
    }

    /**
     * Checks whether the provided `data` or `dataJson` contains a non-empty payload for inference.
     *
     * @param data Raw `data` property value.
     * @param dataJson Raw `dataJson` string value.
     * @returns {boolean} True if at least one non-empty data source is available.
     */
    public isDataNonEmpty(data: unknown, dataJson: unknown): boolean {
        if (typeof dataJson === "string") {
            const trimmed = dataJson.trim();
            if (trimmed.length > 0 && trimmed !== "{}" && trimmed !== "[]") {
                return true;
            }
        }
        if (data !== null && data !== undefined) {
            if (typeof data === "string") {
                const trimmed = data.trim();
                return trimmed.length > 0 && trimmed !== "{}" && trimmed !== "[]";
            }
            if (Array.isArray(data)) {
                return data.length > 0;
            }
            if (isRecord(data)) {
                return Object.keys(data).length > 0;
            }
            return true;
        }
        return false;
    }

    /**
     * Evaluates `schemaDefinition` on the facade. If it is a remote HTTP(S) URL, initiates an async fetch
     * and returns `null`. Otherwise translates the schema via `SchemaBuilderRegistry` and spawns a configured
     * `GeneratorHost` or `InferredGeneratorHost` when either schema or data is present.
     *
     * @returns {GeneratorHost | null} The initialized inner `GeneratorHost`, or `null` if waiting on async fetch or empty.
     */
    public resolveAndSpawnInnerHost(): GeneratorHost | null {
        const schemaRaw: unknown = this.facade.getBaseProperty("schemaDefinition");

        if (typeof schemaRaw === "string" && (schemaRaw.startsWith("http://") || schemaRaw.startsWith("https://"))) {
            // `DynamicHost.setProperty` already starts the fetch when the URL is assigned. Only start one here
            // when nothing is in flight for this exact URL, so a remote schema costs a single request.
            if (this.fetchPromise === null || this.fetchUrl !== schemaRaw) {
                this.startRemoteFetch(schemaRaw);
            }
            return null;
        }

        const schema = this.parseAndBuildLocalSchema(schemaRaw);
        const dataJson = this.facade.getBaseProperty("dataJson");
        const data = this.facade.getBaseProperty("data");

        let hasSchema = !!schema;
        if (hasSchema && isRecord(schema) && Object.keys(schema).length === 0) {
            hasSchema = false;
        }
        const hasData = this.isDataNonEmpty(data, dataJson);

        if (!hasSchema && !hasData) {
            return null;
        }

        return this.createAndWireInnerHost(!hasSchema && hasData);
    }

    /**
     * Initiates an asynchronous remote schema fetch for the given HTTP(S) URL.
     * Uses a monotonic request token so superseded requests are safely discarded.
     *
     * @param url The remote schema URL to fetch.
     */
    public startRemoteFetch(url: string): void {
        const reqId = ++this.fetchRequestId;
        this.fetchUrl = url;
        this.facade.setBusy(true);

        this.fetchPromise = SchemaProvider.resolve(url)
            .then((json) => {
                if (reqId !== this.fetchRequestId || this.facade.isDestroyed()) {
                    return;
                }
                this.facade.setBaseProperty("schemaDefinition", json, true);
                this.facade.forwardResolvedSchemaToInnerHost(json);
                this.facade.invalidate();
            })
            .catch((err: unknown) => {
                if (reqId !== this.fetchRequestId || this.facade.isDestroyed()) {
                    return;
                }
                Logger.error(
                    "[MetaUI DynamicHost]",
                    `Failed to fetch remote schema: ${(err as Error).message}`,
                    "DynamicHost"
                );
                MessageToast.show("Failed to fetch remote schema");
                this.facade.setBaseProperty("schemaDefinition", null, true);
                this.facade.invalidate();
            })
            .finally(() => {
                if (reqId === this.fetchRequestId && !this.facade.isDestroyed()) {
                    this.fetchPromise = null;
                    this.fetchUrl = null;
                    this.facade.setBusy(false);
                }
            });
    }

    private parseAndBuildLocalSchema(schemaRaw: unknown): unknown {
        let schema: unknown = schemaRaw;
        if (typeof schema === "string" && schema.trim().startsWith("{")) {
            try {
                schema = JSON.parse(schema);
            } catch (e) {
                Logger.warn(
                    "[MetaUI DynamicHost]",
                    `Failed to parse JSON schema string in DynamicHost; delegating to SchemaNormalizer: ${(e as Error).message}`
                );
            }
        }

        if (isRecord(schema)) {
            type CustomBuilderLookup = {
                getBuilderFor?: (
                    s: Record<string, unknown>
                ) => { build: (s: Record<string, unknown>, t?: string) => unknown } | undefined;
            };
            const customRegistry = this.facade.getBaseProperty("schemaBuilderRegistry") as CustomBuilderLookup | null;
            const plugin = customRegistry?.getBuilderFor
                ? customRegistry.getBuilderFor(schema)
                : SchemaBuilderRegistry.getBuilderFor(schema);
            if (plugin) {
                const target = this.facade.getBaseProperty("schemaTarget") as string | undefined;
                const built = plugin.build(schema, target) as { definitions?: unknown };
                schema = built;
            }
        }
        return schema;
    }

    private createAndWireInnerHost(isPureInference: boolean = false): GeneratorHost {
        const innerHost = isPureInference ? new InferredGeneratorHost() : new GeneratorHost();
        const props = this.facade.getMetadata().getProperties();
        for (const propName of Object.keys(props)) {
            if (propName === "width" || propName === "height") {
                continue;
            }
            const val: unknown = this.facade.getBaseProperty(propName);
            if (val !== null && val !== undefined) {
                innerHost.setProperty(propName, val);
            }
        }

        const events = this.facade.getMetadata().getEvents();
        for (const eventName of Object.keys(events)) {
            innerHost.attachEvent(eventName, (oEvent: Event) => {
                if (eventName === "submit" || eventName === "fieldChange") {
                    const params = oEvent.getParameters() as {
                        payload?: Record<string, unknown>;
                        payloadJson?: string;
                    };
                    if (params.payload) {
                        const isLive = this.facade.getBaseProperty("liveUpdate") === true;
                        if (eventName === "submit" || isLive) {
                            DataSyncDelegate.commitDataPair(this.facade, params.payload, params.payloadJson);
                        }
                    }
                }
                if (eventName === "validationStateChanged") {
                    const vParams = oEvent.getParameters() as { isValid?: boolean };
                    if (typeof vParams.isValid === "boolean") {
                        this.facade.setBaseProperty("isValid", vParams.isValid, true);
                    }
                }
                const allowed = this.facade.fireEvent(eventName, oEvent.getParameters(), true);
                if (allowed === false) {
                    oEvent.preventDefault();
                    const params = oEvent.getParameters() as { preventDefault?: () => void };
                    if (typeof params.preventDefault === "function") {
                        params.preventDefault();
                    }
                }
            });
        }

        return innerHost;
    }
}
