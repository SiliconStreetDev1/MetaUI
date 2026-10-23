/**
 * @file SchemaWalker.ts
 * @description Single canonical schema tree walker owning depth capping, path-scoped cycle detection,
 * $ref resolution, hidden-node filtering, and JSON-Pointer scope / model binding-path construction.
 */

import type { ISchema, IPropertyMetadata } from "../interfaces/ISchema";
import { MAX_SCHEMA_DEPTH, SCHEMA_TYPE } from "../constants/MetaUIConstants";
import { OpenApiRefResolver } from "../openapi/OpenApiRefResolver";
import { isRecord } from "../utils/TypeGuards";
import { Logger } from "../utils/Logger";

/**
 * Context supplied to {@link SchemaVisitor} for each visited schema node.
 */
export interface ISchemaVisitContext {
    /** Effective property metadata (with `$ref` target merged when `resolveRefs` is active). */
    readonly node: IPropertyMetadata;
    /** Unresolved raw property metadata as it appeared on the parent container before `$ref` merging. */
    readonly rawNode: IPropertyMetadata;
    /** Property key name, `"items"` for single-schema array items, or array index as a string. */
    readonly key: string;
    /** Canonical JSON Pointer scope, e.g. `"#/properties/Address/properties/City"` or `"#/items"`. */
    readonly scope: string;
    /** UI5 model binding path, e.g. `"Address/City"`. */
    readonly bindingPath: string;
    /** Zero-based nesting depth of the visited node. */
    readonly depth: number;
    /** Enclosing parent property metadata, or `null` for top-level children of the root schema. */
    readonly parent: IPropertyMetadata | null;
    /** True when the node was reached via an array's `items` keyword rather than `properties`. */
    readonly isArrayItem: boolean;
}

/**
 * Configuration options controlling a {@link SchemaWalker.walk} traversal.
 */
export interface ISchemaWalkOptions {
    /** Maximum allowed depth before truncation; defaults to `MAX_SCHEMA_DEPTH`. */
    readonly maxDepth?: number;
    /** When true, skips any node whose effective `ui.visible` is `false` along with its subtree. */
    readonly skipHidden?: boolean;
    /** Whether to resolve `$ref` pointers before visiting a node; defaults to `true`. */
    readonly resolveRefs?: boolean;
    /** Optional custom `$ref` resolver overriding the default `definitions` lookup. */
    readonly resolveRef?: (ref: string) => ISchema | IPropertyMetadata | undefined;
    /** Optional explicit definitions dictionary for `$ref` resolution. */
    readonly definitions?: Record<string, ISchema | IPropertyMetadata>;
    /** Starting JSON-Pointer scope for the root container; defaults to `"#"`. */
    readonly baseScope?: string;
    /** Starting model binding path for the root container; defaults to `""`. */
    readonly baseBindingPath?: string;
    /** Starting depth for top-level visited nodes; defaults to `0`. */
    readonly initialDepth?: number;
    /** When true, invokes the visitor on the root schema itself before walking its children. */
    readonly visitRoot?: boolean;
    /** When true, also walks combinator sub-schemas (`not`, `oneOf`, `anyOf`, `allOf`, `additionalProperties`). */
    readonly visitCombinators?: boolean;
    /** When true, walks object-valued `additionalProperties` sub-schemas alongside `properties` and `items`. */
    readonly visitAdditionalProperties?: boolean;
    /** Optional post-order callback invoked after a node's subtree has been walked. */
    readonly onLeave?: (ctx: ISchemaVisitContext) => void;
    /** Optional predicate deciding whether a child property or array `items` node should be visited. */
    readonly shouldVisitChild?: (
        child: IPropertyMetadata,
        key: string,
        parent: IPropertyMetadata,
        isArrayItem: boolean
    ) => boolean;
    /** Optional callback invoked when a `properties[key]` entry is not a valid record object. */
    readonly onInvalidProperty?: (key: string, rawValue: unknown, parent: IPropertyMetadata) => void;
    /** When true, suppresses SchemaWalker's default truncation log so `onTruncate` can emit a caller-specific log. */
    readonly silentTruncationLog?: boolean;
    /** Called once per truncation with the scope and the reason, so no cut is silent. */
    readonly onTruncate?: (scope: string, reason: "depth" | "cycle") => void;
}

/**
 * Return value from a {@link SchemaVisitor} controlling subtree descent or early termination.
 */
export type SchemaVisitorResult = void | "skip-subtree" | "stop";

/**
 * Visitor callback invoked for each node visited by {@link SchemaWalker.walk}.
 */
export type SchemaVisitor = (ctx: ISchemaVisitContext) => SchemaVisitorResult;

/** Internal mutable walk state threaded across one traversal. */
interface IWalkState {
    readonly visitor: SchemaVisitor;
    readonly options: ISchemaWalkOptions | undefined;
    readonly maxDepth: number;
    readonly definitions: Record<string, ISchema | IPropertyMetadata> | undefined;
    readonly activeNodes: WeakSet<object>;
    readonly activeRefs: Set<string>;
}

/**
 * Canonical schema tree walker.
 *
 * @namespace nz.co.siliconst.ui5.metaui.core
 * @public
 */
export class SchemaWalker {
    /**
     * Converts a JSON-Pointer layout scope into the model binding path it addresses.
     *
     * @param scope The JSON-Pointer scope, e.g. `"#/properties/Address/properties/Street"`.
     * @returns {string} The binding path, e.g. `"Address/Street"`.
     */
    public static toBindingPath(scope: string): string {
        return scope.replace(/^#(\/(properties\/)?)?/, "").split("/properties/").join("/");
    }

    /**
     * Resolves a JSON Schema scope (e.g. `'#/properties/header/properties/id'`) against an `ISchema`,
     * detecting path-scoped object and `$ref` cycles.
     *
     * @param schema The root or item `ISchema`.
     * @param scope The JSON Schema scope pointer.
     * @param resolveDefinition Optional resolver for `$ref` definitions.
     * @param activeNodes Optional path-scoped set of active schema objects.
     * @param activeRefs Optional path-scoped set of active `$ref` pointers.
     * @returns {{ meta: IPropertyMetadata | undefined; bindingPath: string; propKey: string }} Resolved scope tuple.
     */
    public static resolveScope(
        schema: ISchema,
        scope: string,
        resolveDefinition?: (ref: string) => ISchema | null,
        activeNodes?: WeakSet<object>,
        activeRefs?: Set<string>
    ): { meta: IPropertyMetadata | undefined; bindingPath: string; propKey: string } {
        if (!scope || !scope.startsWith("#/properties/")) {
            return { meta: undefined, bindingPath: scope || "", propKey: scope || "" };
        }
        const pathSegments = scope
            .replace("#/properties/", "")
            .split("/properties/")
            .map((segment) => OpenApiRefResolver.unescapePointerSegment(segment));
        const bindingPath = pathSegments.join("/");
        const propKey = pathSegments.join("/properties/");
        const pathNodes = new WeakSet<object>([schema]);
        const pathRefs = new Set<string>();
        let current: Record<string, IPropertyMetadata> | undefined = schema.properties;
        let meta: IPropertyMetadata | undefined;
        for (let i = 0; i < pathSegments.length; i++) {
            const segment = pathSegments[i];
            if (!current) {
                meta = undefined;
                break;
            }
            meta = current[segment];
            if (!meta) {
                break;
            }
            if (pathNodes.has(meta) || activeNodes?.has(meta)) {
                Logger.warn(
                    "[MetaUI SchemaNormalizer]",
                    `Circular schema reference detected while resolving scope '${scope}'; stopping recursion.`
                );
                return { meta: undefined, bindingPath, propKey };
            }
            pathNodes.add(meta);

            let resolvedDef: ISchema | null | undefined;
            if (meta.$ref) {
                if (pathRefs.has(meta.$ref) || activeRefs?.has(meta.$ref)) {
                    Logger.warn(
                        "[MetaUI SchemaNormalizer]",
                        `Circular $ref detected (${meta.$ref}) while resolving scope '${scope}'; stopping recursion.`
                    );
                    return { meta: undefined, bindingPath, propKey };
                }
                pathRefs.add(meta.$ref);
                resolvedDef =
                    resolveDefinition?.(meta.$ref) ??
                    schema.definitions?.[OpenApiRefResolver.extractRefName(meta.$ref)];
            }
            current = meta.properties || resolvedDef?.properties;
        }
        if (!meta) {
            Logger.warn("[MetaUI SchemaNormalizer]", `Scope '${scope}' does not resolve to a schema property.`);
        }
        return { meta, bindingPath, propKey };
    }

    /**
     * Walks a schema tree in pre-order depth-first order, handling depth capping, path-scoped
     * cycle detection, `$ref` resolution, and hidden-node skipping.
     *
     * @param root The root schema or property metadata object to walk.
     * @param visitor Callback invoked for each visited node.
     * @param options Optional traversal settings.
     */
    public static walk(
        root: Partial<ISchema> | IPropertyMetadata | Record<string, unknown> | null | undefined,
        visitor: SchemaVisitor,
        options?: ISchemaWalkOptions
    ): void {
        if (!this.isPropertyNode(root)) {
            return;
        }
        const maxDepth = options?.maxDepth ?? MAX_SCHEMA_DEPTH;
        const definitions = this.extractDefinitions(root, options);
        const state: IWalkState = {
            visitor,
            options,
            maxDepth,
            definitions,
            activeNodes: new WeakSet<object>(),
            activeRefs: new Set<string>()
        };

        const baseScope = options?.baseScope ?? "#";
        const baseBindingPath = options?.baseBindingPath ?? "";
        const initialDepth = options?.initialDepth ?? 0;

        if (options?.visitRoot) {
            this.visitNode(root, "", baseScope, baseBindingPath, initialDepth, null, false, state);
            return;
        }

        state.activeNodes.add(root);
        try {
            this.walkChildren(root, baseScope, baseBindingPath, initialDepth, null, state);
        } finally {
            state.activeNodes.delete(root);
        }
    }

    private static visitNode(
        rawNode: IPropertyMetadata,
        key: string,
        scope: string,
        bindingPath: string,
        depth: number,
        parent: IPropertyMetadata | null,
        isArrayItem: boolean,
        state: IWalkState
    ): SchemaVisitorResult {
        if (state.activeNodes.has(rawNode)) {
            this.reportCycleTruncation(scope, state.options);
            return;
        }

        const addedNodes: object[] = [rawNode];
        const addedRefs: string[] = [];
        state.activeNodes.add(rawNode);

        try {
            const resolved = this.resolveNodeRefs(rawNode, scope, state, addedNodes, addedRefs);
            if (!resolved) {
                return;
            }
            if (state.options?.skipHidden && resolved.ui?.visible === false) {
                return;
            }
            if (depth > MAX_SCHEMA_DEPTH || depth > state.maxDepth) {
                if (!state.options?.silentTruncationLog) {
                    Logger.warn(
                        "[MetaUI SchemaWalker]",
                        `Schema traversal exceeded maxDepth (${state.maxDepth}) at '${scope}'; subtree was truncated.`
                    );
                }
                state.options?.onTruncate?.(scope, "depth");
                return;
            }

            const ctx: ISchemaVisitContext = {
                node: resolved,
                rawNode,
                key,
                scope,
                bindingPath,
                depth,
                parent,
                isArrayItem
            };

            const decision = state.visitor(ctx);
            if (decision === "stop") {
                return "stop";
            }
            if (decision !== "skip-subtree") {
                const childStop = this.walkChildren(resolved, scope, bindingPath, depth + 1, resolved, state);
                if (childStop === "stop") {
                    return "stop";
                }
            }
            state.options?.onLeave?.(ctx);
            return;
        } finally {
            for (const n of addedNodes) {
                state.activeNodes.delete(n);
            }
            for (const r of addedRefs) {
                state.activeRefs.delete(r);
            }
        }
    }

    private static walkChildren(
        container: IPropertyMetadata,
        parentScope: string,
        parentBinding: string,
        childDepth: number,
        parentNode: IPropertyMetadata | null,
        state: IWalkState
    ): SchemaVisitorResult {
        const props = container.properties;
        if (isRecord(props)) {
            for (const propKey of Object.keys(props)) {
                const child: unknown = props[propKey];
                if (!this.isPropertyNode(child)) {
                    state.options?.onInvalidProperty?.(propKey, child, container);
                    continue;
                }
                if (state.options?.shouldVisitChild && !state.options.shouldVisitChild(child, propKey, container, false)) {
                    continue;
                }
                const childScope = `${parentScope}/properties/${propKey}`;
                const childBinding = parentBinding ? `${parentBinding}/${propKey}` : propKey;
                const res = this.visitNode(child, propKey, childScope, childBinding, childDepth, parentNode, false, state);
                if (res === "stop") {
                    return "stop";
                }
            }
        }

        const rawItems: unknown = container.items;
        if (Array.isArray(rawItems)) {
            for (let i = 0; i < rawItems.length; i++) {
                const itemElem: unknown = rawItems[i];
                if (!this.isPropertyNode(itemElem)) {
                    continue;
                }
                const idxKey = String(i);
                if (state.options?.shouldVisitChild && !state.options.shouldVisitChild(itemElem, idxKey, container, true)) {
                    continue;
                }
                const itemScope = `${parentScope}/items/${idxKey}`;
                const itemBinding = parentBinding ? `${parentBinding}/items/${idxKey}` : `items/${idxKey}`;
                const res = this.visitNode(itemElem, idxKey, itemScope, itemBinding, childDepth, parentNode, true, state);
                if (res === "stop") {
                    return "stop";
                }
            }
        } else if (this.isPropertyNode(rawItems)) {
            if (!state.options?.shouldVisitChild || state.options.shouldVisitChild(rawItems, "items", container, true)) {
                const itemScope = `${parentScope}/items`;
                const itemBinding = parentBinding ? `${parentBinding}/items` : "items";
                const res = this.visitNode(rawItems, "items", itemScope, itemBinding, childDepth, parentNode, true, state);
                if (res === "stop") {
                    return "stop";
                }
            }
        }

        if (state.options?.visitCombinators || state.options?.visitAdditionalProperties) {
            return this.walkCombinators(container, parentScope, parentBinding, childDepth, parentNode, state);
        }
        return;
    }

    private static walkCombinators(
        container: IPropertyMetadata,
        parentScope: string,
        parentBinding: string,
        childDepth: number,
        parentNode: IPropertyMetadata | null,
        state: IWalkState
    ): SchemaVisitorResult {
        const singleSubs: ReadonlyArray<readonly [string, unknown]> = state.options?.visitCombinators
            ? [
                  ["not", container.not],
                  ["additionalProperties", container.additionalProperties]
              ]
            : [["additionalProperties", container.additionalProperties]];
        for (const [kw, sub] of singleSubs) {
            if (!this.isPropertyNode(sub)) {
                continue;
            }
            const subScope = `${parentScope}/${kw}`;
            const subBinding = parentBinding ? `${parentBinding}/${kw}` : kw;
            const res = this.visitNode(sub, kw, subScope, subBinding, childDepth, parentNode, false, state);
            if (res === "stop") {
                return "stop";
            }
        }
        if (!state.options?.visitCombinators) {
            return;
        }

        const listSubs: ReadonlyArray<readonly [string, unknown]> = [
            ["oneOf", container.oneOf],
            ["anyOf", container.anyOf],
            ["allOf", container.allOf]
        ];
        for (const [kw, list] of listSubs) {
            if (!Array.isArray(list)) {
                continue;
            }
            for (let i = 0; i < list.length; i++) {
                const branch: unknown = list[i];
                if (!this.isPropertyNode(branch)) {
                    continue;
                }
                const idxKey = String(i);
                const subScope = `${parentScope}/${kw}/${idxKey}`;
                const subBinding = parentBinding ? `${parentBinding}/${kw}/${idxKey}` : `${kw}/${idxKey}`;
                const res = this.visitNode(branch, idxKey, subScope, subBinding, childDepth, parentNode, false, state);
                if (res === "stop") {
                    return "stop";
                }
            }
        }
        return;
    }

    private static resolveNodeRefs(
        rawNode: IPropertyMetadata,
        scope: string,
        state: IWalkState,
        addedNodes: object[],
        addedRefs: string[]
    ): IPropertyMetadata | null {
        if (state.options?.resolveRefs === false) {
            return rawNode;
        }
        let effectiveNode: IPropertyMetadata = rawNode;
        let currentRef = effectiveNode.$ref;

        while (currentRef) {
            if (state.activeRefs.has(currentRef)) {
                this.reportCycleTruncation(scope, state.options);
                return null;
            }
            state.activeRefs.add(currentRef);
            addedRefs.push(currentRef);

            const refKey = OpenApiRefResolver.extractRefName(currentRef);
            const target = this.lookupRef(currentRef, refKey, state);
            if (!this.isPropertyNode(target)) {
                break;
            }
            if (state.activeNodes.has(target)) {
                this.reportCycleTruncation(scope, state.options);
                return null;
            }
            state.activeNodes.add(target);
            addedNodes.push(target);

            const nextRef = "$ref" in target && typeof target.$ref === "string" ? target.$ref : undefined;
            effectiveNode = {
                ...target,
                ...effectiveNode,
                type: effectiveNode.type || target.type || SCHEMA_TYPE.OBJECT,
                ui: target.ui || effectiveNode.ui ? { ...(target.ui || {}), ...(effectiveNode.ui || {}) } : undefined,
                $ref: nextRef
            };
            currentRef = nextRef;
        }
        return effectiveNode;
    }

    private static lookupRef(
        ref: string,
        refKey: string,
        state: IWalkState
    ): ISchema | IPropertyMetadata | undefined {
        if (state.options?.resolveRef) {
            return state.options.resolveRef(ref);
        }
        return state.definitions?.[refKey];
    }

    private static extractDefinitions(
        root: Partial<ISchema> | IPropertyMetadata,
        options: ISchemaWalkOptions | undefined
    ): Record<string, ISchema | IPropertyMetadata> | undefined {
        if (options?.definitions) {
            return options.definitions;
        }
        return "definitions" in root && isRecord(root.definitions) ? root.definitions : undefined;
    }

    private static reportCycleTruncation(scope: string, options: ISchemaWalkOptions | undefined): void {
        if (!options?.silentTruncationLog) {
            Logger.warn("[MetaUI SchemaWalker]", `Circular schema reference detected at '${scope}'; stopping recursion.`);
        }
        options?.onTruncate?.(scope, "cycle");
    }

    private static isPropertyNode(value: unknown): value is IPropertyMetadata {
        return isRecord(value);
    }
}
