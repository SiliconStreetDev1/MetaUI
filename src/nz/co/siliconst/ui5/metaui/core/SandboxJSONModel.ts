/**
 * @file SandboxJSONModel.ts
 * @description The isolated JSONModel used by the MetaUI sandbox (StateManager).
 */

import JSONModel from "sap/ui/model/json/JSONModel";
import Context from "sap/ui/model/Context";
import { Logger } from "../utils/Logger";

/** Callback invoked after every successful property write with the resolved absolute path. */
export type PropertyChangeHook = (absolutePath: string, value: unknown) => void;

/**
 * UI5's stock contexts-per-list-binding ceiling, and the floor this model never drops below.
 *
 * Keeping the floor at UI5's own default means a small payload binds exactly as it did before,
 * and a table that grows past its loaded size still has room for rows the user adds.
 */
const DEFAULT_LIST_BINDING_CAPACITY = 100;

/**
 * The largest collection the sandbox will expose to a single list binding.
 *
 * This is a guard against a pathological payload, not a rendering policy: how many of those rows
 * are *painted* is the layout's decision (`sap.m.Table` `growing`), not the model's. The number is
 * 100x UI5's default and covers every payload a generated form realistically receives. Above it the
 * model refuses rather than silently attempting a paint that would lock the main thread for seconds,
 * and says so through {@link Logger} at `error` — the only level that survives UI5's stock `ERROR`
 * log level on a production page.
 */
const MAX_LIST_BINDING_CAPACITY = 10000;

/** Result of walking a payload for its largest array. */
interface ILargestCollection {
    /** Number of entries in the largest array found. */
    readonly length: number;
    /** Absolute path of that array, for diagnostics. */
    readonly path: string;
}

/**
 * A JSONModel that notifies a single observer after every successful `setProperty`, whether the write
 * comes from a two-way binding (relative paths inside table rows) or from programmatic code.
 * Relative paths are resolved against their binding context so observers always receive absolute paths.
 *
 * Subclassing (rather than monkey-patching the instance) keeps the override visible to the type system
 * and to UI5's own class introspection.
 *
 * It also owns the sandbox's **list-binding capacity**. UI5 caps every list binding at
 * `Model#iSizeLimit` contexts, 100 by default, and a `sap.m.Table` bound past that limit renders the
 * first 100 rows and nothing else — no warning, no growing trigger, no gap in the UI. Because the
 * capacity is a property of the model rather than of any one table, it is maintained here, where no
 * caller can forget it: {@link SandboxJSONModel.setData} sizes it from the payload and
 * {@link SandboxJSONModel.setProperty} raises it when a collection is written back larger than before,
 * which is the path `TableRowHelper` uses to add a row.
 *
 * @namespace nz.co.siliconst.ui5.metaui.core
 */
export default class SandboxJSONModel extends JSONModel {
    private propertyChangeHook: PropertyChangeHook | null = null;
    private listBindingCapacity: number = DEFAULT_LIST_BINDING_CAPACITY;

    /**
     * Creates the sandbox model and sizes its list-binding capacity to the payload.
     *
     * The data is applied through an explicit {@link SandboxJSONModel.setData} call rather than through
     * `JSONModel`'s constructor argument. `JSONModel`'s own constructor forwards to `setData`, which
     * would run this subclass's override *before* the field initialisers above have executed and leave
     * the capacity bookkeeping undefined.
     *
     * @param data The initial payload, or `undefined` for an empty model.
     * @param observe Whether UI5 should observe the data object for external mutation.
     */
    constructor(data?: object, observe?: boolean) {
        super(undefined, observe);
        this.setSizeLimit(DEFAULT_LIST_BINDING_CAPACITY);
        if (data !== undefined && data !== null) {
            this.setData(data);
        }
    }

    /**
     * Registers (or clears, when null) the observer for property writes.
     * @param hook The observer callback.
     */
    public setPropertyChangeHook(hook: PropertyChangeHook | null): void {
        this.propertyChangeHook = hook;
    }

    /**
     * Replaces the sandbox payload, first sizing the list-binding capacity to the largest collection it
     * contains so no binding is silently truncated at UI5's default of 100 contexts.
     *
     * The capacity is raised before the write, because `setData` refreshes every binding synchronously
     * and a binding refreshed under the old limit would keep the old context count.
     *
     * @param data The new payload.
     * @param merge True to deep-merge into the current payload instead of replacing it.
     */
    public setData(data: object, merge?: boolean): void {
        const incoming = SandboxJSONModel.measureLargestCollection(data);
        // A deep merge overwrites array entries index-wise, so the merged result cannot hold an array
        // longer than the longer of the two sides.
        const required = merge
            ? Math.max(incoming.length, SandboxJSONModel.measureLargestCollection(this.getData()).length)
            : incoming.length;
        this.ensureListBindingCapacity(required, incoming.path);
        super.setData(data, merge);
    }

    /**
     * Writes a property and notifies the observer when the write succeeded.
     *
     * A write whose value is an array also raises the list-binding capacity when that array is longer
     * than anything seen so far. `TableRowHelper` adds and deletes rows by writing the whole array back
     * through this method, so without it a row added to a table already at capacity would be accepted
     * into the payload and never drawn.
     *
     * @param path Absolute path, or a path relative to `context`.
     * @param value The value to store.
     * @param context Optional binding context for relative paths.
     * @param asyncUpdate Whether bindings update asynchronously.
     * @returns {boolean} True if the value was written.
     */
    public setProperty(path: string, value: unknown, context?: Context, asyncUpdate?: boolean): boolean {
        if (Array.isArray(value)) {
            this.ensureListBindingCapacity(value.length, SandboxJSONModel.resolveAbsolutePath(path, context));
        }
        const written = super.setProperty(path, value, context, asyncUpdate);
        if (written && this.propertyChangeHook) {
            this.propertyChangeHook(SandboxJSONModel.resolveAbsolutePath(path, context), value);
        }
        return written;
    }

    /**
     * Returns the number of entries this model will currently expose to a single list binding.
     *
     * @returns {number} The active `iSizeLimit`, never below UI5's default of 100.
     */
    public getListBindingCapacity(): number {
        return this.listBindingCapacity;
    }

    /**
     * Returns the hard ceiling on list-binding capacity, above which collections are reported as
     * partially rendered rather than silently cut.
     *
     * @returns {number} The maximum number of entries one list binding can receive.
     */
    public static getMaxListBindingCapacity(): number {
        return MAX_LIST_BINDING_CAPACITY;
    }

    /**
     * Raises the capacity to hold `required` entries. The capacity only ever grows: lowering it when a
     * smaller payload arrives would re-truncate a table that is still bound to a larger collection
     * elsewhere in the same sandbox, and the limit costs nothing when it is not reached.
     *
     * @param required Entries the collection needs.
     * @param path Absolute path of the collection, used in the diagnostic.
     */
    private ensureListBindingCapacity(required: number, path: string): void {
        const granted = Math.min(required, MAX_LIST_BINDING_CAPACITY);
        if (granted > this.listBindingCapacity) {
            this.listBindingCapacity = granted;
            this.setSizeLimit(granted);
        }
        if (required > MAX_LIST_BINDING_CAPACITY) {
            Logger.error(
                `The collection at '${path}' holds ${required} entries. The sandbox binds at most ` +
                `${MAX_LIST_BINDING_CAPACITY} of them, so ${required - MAX_LIST_BINDING_CAPACITY} entries ` +
                "cannot be displayed. They remain in the payload and are still submitted. Page or filter " +
                "the collection before handing it to MetaUI.",
                undefined,
                "SandboxJSONModel"
            );
        }
    }

    /**
     * Finds the longest array anywhere in a payload.
     *
     * The walk is iterative rather than recursive so a deeply nested payload cannot overflow the stack,
     * and it visits each node once — the same order of work the sandbox already pays to deep-copy the
     * payload in {@link nz.co.siliconst.ui5.metaui.core.StateManager}.
     *
     * @param data The payload to measure.
     * @returns {ILargestCollection} The largest array's length and path; `{ length: 0, path: "/" }` when there is none.
     */
    private static measureLargestCollection(data: unknown): ILargestCollection {
        let best: ILargestCollection = { length: 0, path: "/" };
        const pending: { node: unknown; path: string }[] = [{ node: data, path: "" }];

        while (pending.length > 0) {
            const current = pending.pop() as { node: unknown; path: string };
            const node = current.node;
            if (Array.isArray(node)) {
                if (node.length > best.length) {
                    best = { length: node.length, path: current.path || "/" };
                }
                for (let index = 0; index < node.length; index++) {
                    const child: unknown = node[index];
                    if (child !== null && typeof child === "object") {
                        pending.push({ node: child, path: `${current.path}/${index}` });
                    }
                }
                continue;
            }
            if (node !== null && typeof node === "object") {
                const record = node as Record<string, unknown>;
                for (const key of Object.keys(record)) {
                    const child: unknown = record[key];
                    if (child !== null && typeof child === "object") {
                        pending.push({ node: child, path: `${current.path}/${key}` });
                    }
                }
            }
        }
        return best;
    }

    /**
     * Resolves a potentially relative binding path against its binding context.
     *
     * @param path The path passed to `setProperty`.
     * @param context Optional binding context.
     * @returns {string} The canonical absolute path starting with `/`.
     */
    private static resolveAbsolutePath(path: string, context?: Context): string {
        if (path.startsWith("/")) {
            return path;
        }
        if (context) {
            const basePath = context.getPath().replace(/\/$/, "");
            return `${basePath}/${path}`;
        }
        return `/${path}`;
    }

    /**
     * Releases the observer before destroying the model.
     */
    public destroy(): void {
        this.propertyChangeHook = null;
        super.destroy();
    }
}
