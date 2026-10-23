/**
 * @file StateManager.ts
 * @description Isolated internal state management. Decouples the MetaUI engine from external host models.
 */

import BindingMode from "sap/ui/model/BindingMode";
import Message from "sap/ui/core/message/Message";
import Messaging from "sap/ui/core/Messaging";
import { ISchema } from "../interfaces/ISchema";
import SandboxJSONModel from "./SandboxJSONModel";
import { SchemaNormalizer } from "./SchemaNormalizer";
import { JsonRecord, isRecord, deepClone } from "../utils/TypeGuards";

/**
 * Manages the isolated internal data payload for the MetaUI engine (the "sandbox").
 *
 * - The consumer's data is deep-copied on construction, so the host model is never mutated by keystrokes.
 * - UI5 `Messaging` entries are coordinated by {@link ValidationLedger} using this sandbox model as the processor,
 *   and are deterministically purged when {@link StateManager.destroy} runs.
 *
 * @namespace nz.co.siliconst.ui5.metaui.core
 * @internal
 */
export class StateManager {
    private readonly model: SandboxJSONModel;
    private readonly schema: ISchema;
    private useMessageManager: boolean = false;

    /**
     * Initializes a new isolated `StateManager` sandbox.
     *
     * Values of `writeOnly` properties are dropped from the incoming payload: the spec defines them as
     * never returned on a read, so the sandbox must not display or echo one that arrived with the data.
     * Values the user subsequently types are kept and emitted by {@link StateManager.extractPayload}.
     *
     * The sandbox model sizes its own list-binding capacity from this payload — see
     * {@link SandboxJSONModel}. UI5 caps every list binding at 100 contexts by default, which made a
     * generated table render the first 100 rows of a larger collection and silently discard the rest.
     * The capacity is deliberately *not* set from here: rows added after load go through
     * `SandboxJSONModel.setProperty`, so the model is the only place that sees every change to a
     * collection's size.
     *
     * @param initialData The initial JSON payload (object or array). Deep-copied so the caller's reference is never mutated.
     * @param schema The normalized schema associated with this state.
     */
    constructor(initialData: unknown, schema: ISchema) {
        this.schema = schema;
        const safeInitial =
            initialData !== undefined && initialData !== null
                ? deepClone(initialData)
                : schema.type === "array"
                  ? []
                  : {};
        SchemaNormalizer.stripWriteOnlyValues(schema, safeInitial);
        this.model = new SandboxJSONModel(safeInitial as object);
        this.model.setDefaultBindingMode(BindingMode.TwoWay);
    }

    /**
     * Enables or disables publishing validation failures to the global MessageManager.
     *
     * @param use True to publish messages.
     */
    public setUseMessageManager(use: boolean): void {
        this.useMessageManager = use;
    }

    /**
     * Returns whether `useMessageManager` is active on this state manager.
     *
     * @returns {boolean} True if MessageManager integration is enabled.
     */
    public getUseMessageManager(): boolean {
        return this.useMessageManager;
    }

    /**
     * Returns the normalized schema this state is validated against.
     *
     * @returns {ISchema} The normalized schema.
     */
    public getSchema(): ISchema {
        return this.schema;
    }

    /**
     * Returns the isolated sandbox model attached to the `GeneratorHost`.
     *
     * @returns {SandboxJSONModel} The isolated JSONModel instance.
     */
    public getModel(): SandboxJSONModel {
        return this.model;
    }

    /**
     * Returns all global messages owned by this sandbox model, optionally filtered by target path prefix.
     *
     * The prefix is matched on **path segment boundaries**: `"/Item"` matches `"/Item"` and `"/Item/0/Name"`
     * but never `"/ItemTotal"`. A raw `startsWith` instead purged sibling fields whose names merely began
     * with the array's name.
     *
     * @param targetPrefix Optional absolute path prefix (e.g. `"/Items"`, or `"/"` for a root array).
     * @returns {Message[]} The matching messages.
     */
    public getOwnMessages(targetPrefix?: string): Message[] {
        const modelId = this.model.getId();
        const all: Message[] = Messaging.getMessageModel().getData();
        const boundary = targetPrefix === undefined || targetPrefix.endsWith("/") ? targetPrefix : `${targetPrefix}/`;
        return all.filter((msg) => {
            const processor = msg.getMessageProcessor();
            if (!processor || processor.getId() !== modelId) return false;
            if (targetPrefix === undefined || boundary === undefined) return true;
            const target = msg.getTarget();
            return typeof target === "string" && (target === targetPrefix || target.startsWith(boundary));
        });
    }

    /**
     * Purges all MessageManager errors under an array path.
     * Used to clean up ghost errors when rows are removed and indexes shift.
     *
     * @param arrayPath The array path (e.g. `"/Items"`, or `"/"` for a root array).
     */
    public clearArrayMessages(arrayPath: string): void {
        const prefix = arrayPath.startsWith("/") ? arrayPath : `/${arrayPath}`;
        const stale = this.getOwnMessages(prefix);
        if (stale.length > 0) {
            Messaging.removeMessages(stale);
        }
    }

    /**
     * Extracts a deep copy of the current sandbox state. Native `Date` instances and root arrays are preserved.
     *
     * @returns {JsonRecord | unknown[]} The payload, sharing no references with the internal model.
     */
    public extractPayload(): JsonRecord | unknown[] {
        const data: unknown = this.model.getData();
        if (Array.isArray(data)) {
            return data.map((entry) => StateManager.cloneValue(entry));
        }
        return isRecord(data) ? StateManager.cloneRecord(data) : {};
    }

    private static cloneValue(value: unknown): unknown {
        if (value instanceof Date) return new Date(value.getTime());
        if (Array.isArray(value)) return value.map((entry) => StateManager.cloneValue(entry));
        if (isRecord(value)) return StateManager.cloneRecord(value);
        return value;
    }

    private static cloneRecord(record: JsonRecord): JsonRecord {
        const copy: JsonRecord = {};
        for (const key of Object.keys(record)) {
            copy[key] = StateManager.cloneValue(record[key]);
        }
        return copy;
    }

    /**
     * Reads the current value at an absolute or root-relative path in the sandbox model.
     *
     * @param path Absolute or root-relative path.
     * @returns {unknown} The current property value.
     */
    public getProperty(path: string): unknown {
        if (!path) return undefined;
        return this.model.getProperty(path.startsWith("/") ? path : `/${path}`);
    }

    /**
     * Programmatically writes a model property (e.g. for PBRE state pruning).
     *
     * @param path Absolute or root-relative path.
     * @param value The value to set.
     */
    public setProperty(path: string, value: unknown): void {
        this.model.setProperty(path.startsWith("/") ? path : `/${path}`, value);
    }

    /**
     * Removes every global message owned by this sandbox and destroys the internal model.
     */
    public destroy(): void {
        const owned = this.getOwnMessages();
        if (owned.length > 0) {
            Messaging.removeMessages(owned);
        }
        this.model.destroy();
    }
}
