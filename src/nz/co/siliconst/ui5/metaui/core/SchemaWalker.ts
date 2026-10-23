/**
 * @file SchemaWalker.ts
 * @description Single canonical tree walker owning depth capping, path-scoped cycle detection,
 * $ref resolution, hidden-node filtering, pluggable ITreeShape child resolution, paired traversal,
 * and JSON-Pointer scope / model binding-path construction.
 */

import type { ISchema, IPropertyMetadata, ILayoutElement } from "../interfaces/ISchema";
import { MAX_SCHEMA_DEPTH, MAX_LAYOUT_DEPTH, SCHEMA_TYPE } from "../constants/MetaUIConstants";
import { OpenApiRefResolver } from "../openapi/OpenApiRefResolver";
import { isRecord, JsonRecord } from "../utils/TypeGuards";
import { Logger } from "../utils/Logger";

/**
 * Classification of a child edge yielded by an {@link ITreeShape}.
 */
export type ChildKind = "property" | "item" | "branch" | "additional" | "element";

/**
 * Describes a single child edge produced by {@link ITreeShape.children}.
 */
export interface ITreeChild<TNode> {
    /** Child key name, array index as string, or keyword (`"items"`, `"not"`, `"additionalProperties"`). */
    readonly key: string;
    /** Target child node. */
    readonly node: TNode;
    /** Structural edge classification. */
    readonly kind: ChildKind;
    /** Segment appended to the parent JSON-Pointer scope (without leading slash). */
    readonly scopeSegment: string;
    /** Segment appended to the parent UI5 model binding path (without leading slash). */
    readonly bindingSegment: string;
    /** Optional combinator or definition section keyword (`"oneOf"`, `"anyOf"`, `"allOf"`, `"not"`, `"definitions"`, `"$defs"`). */
    readonly branchKeyword?: string;
}

/**
 * Pluggable strategy describing how {@link SchemaWalker} resolves children, `$ref` targets,
 * hidden-node filtering, and default depth caps for a node type `TNode`.
 */
export interface ITreeShape<TNode> {
    /** Default recursion cap for this tree shape (`MAX_SCHEMA_DEPTH` or `MAX_LAYOUT_DEPTH`). */
    readonly defaultMaxDepth: number;
    /** Optional `$ref` resolver returning the effective merged node or `null` when a `$ref` cycle is detected. */
    resolveRef?(
        node: TNode,
        scope: string,
        options: ISchemaWalkOptions<TNode> | undefined,
        definitions: Record<string, ISchema | IPropertyMetadata> | undefined,
        activeNodes: WeakSet<object>,
        activeRefs: Set<string>,
        addedNodes: object[],
        addedRefs: string[],
        onCycle: (scope: string) => void
    ): TNode | null;
    /** Optional predicate returning `true` when `skipHidden` should skip `node` and its subtree. */
    isHidden?(node: TNode): boolean;
    /** Yields the direct children of `node` in deterministic pre-order sequence. */
    children(node: TNode, options?: ISchemaWalkOptions<TNode>): Iterable<ITreeChild<TNode>>;
}

/**
 * Context supplied to {@link SchemaVisitor} for each visited tree node.
 */
export interface ISchemaVisitContext<TNode = IPropertyMetadata> {
    /** Effective node (with `$ref` target merged when `resolveRefs` is active on a schema shape). */
    readonly node: TNode;
    /** Unresolved raw node as it appeared on the parent container before `$ref` merging. */
    readonly rawNode: TNode;
    /** Property key name, `"items"` for single-schema array items, or array index as a string. */
    readonly key: string;
    /** Canonical JSON Pointer scope, e.g. `"#/properties/Address/properties/City"` or `"#/items"`. */
    readonly scope: string;
    /** UI5 model binding path, e.g. `"Address/City"`. */
    readonly bindingPath: string;
    /** Zero-based nesting depth of the visited node. */
    readonly depth: number;
    /** Enclosing parent node, or `null` for top-level children of the root container. */
    readonly parent: TNode | null;
    /** True when the node was reached via an array's `items` edge rather than `properties`. */
    readonly isArrayItem: boolean;
    /** Classification of the child edge that reached this node. */
    readonly kind: ChildKind;
    /** Combinator or section keyword when `kind` is `"branch"` or `"additional"`. */
    readonly branchKeyword?: string;
}

/**
 * Context supplied to {@link PairedSchemaVisitor} during a {@link SchemaWalker.walkPaired} traversal.
 */
export interface IPairedVisitContext<TNode = IPropertyMetadata, TOther = unknown>
    extends ISchemaVisitContext<TNode> {
    /** Paired cursor value at the current node, or `undefined` when absent. */
    readonly other: TOther | undefined;
    /** Paired cursor value at the enclosing parent node, or `undefined` at the root. */
    readonly parentOther: TOther | undefined;
    /** Replaces the paired cursor value used when descending into this node's children and in `onLeave`. */
    readonly replaceOther: (next: TOther | undefined) => void;
}

/**
 * Stepping strategy for the secondary cursor in {@link SchemaWalker.walkPaired}.
 */
export interface IPairCursor<TNode, TOther> {
    /** Steps into a named property on the paired value. */
    stepProperty(other: TOther, key: string, childNode: TNode): TOther | undefined;
    /** Optional array stepper that fans out an `"item"` child across elements of `other`. */
    stepArray?(
        other: TOther,
        childNode: TNode,
        key: string
    ): ReadonlyArray<{ key: string; value: TOther }> | undefined;
    /** Optional dictionary stepper that fans out an `"additional"` child across undeclared keys of `other`. */
    stepAdditional?(
        other: TOther,
        childNode: TNode,
        parentNode: TNode
    ): ReadonlyArray<{ key: string; value: TOther }> | undefined;
    /** Optional combinator branch stepper for `"branch"` children (`not`, `oneOf`, `anyOf`, `allOf`). */
    stepBranch?(
        other: TOther,
        branchKeyword: string,
        key: string,
        childNode: TNode
    ): TOther | undefined;
}

/**
 * Configuration options controlling a {@link SchemaWalker.walk} traversal.
 */
export interface ISchemaWalkOptions<TNode = IPropertyMetadata> {
    /** Tree shape strategy; defaults to {@link SchemaShape}. */
    readonly shape?: ITreeShape<TNode>;
    /** Maximum allowed depth before truncation; defaults to `shape.defaultMaxDepth`. */
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
    /** When true, invokes the visitor on the root node itself before walking its children. */
    readonly visitRoot?: boolean;
    /** When true, also walks combinator sub-schemas (`not`, `oneOf`, `anyOf`, `allOf`, `additionalProperties`). */
    readonly visitCombinators?: boolean;
    /** When true, walks object-valued `additionalProperties` sub-schemas alongside `properties` and `items`. */
    readonly visitAdditionalProperties?: boolean;
    /** When true, also walks `definitions` and `$defs` maps on a schema or raw record. */
    readonly visitDefinitions?: boolean;
    /** Optional cap on array element visits for {@link JsonPayloadShape}. */
    readonly maxArrayItems?: number;
    /** Optional pre-seeded path-scoped set of active nodes for cycle detection. */
    readonly activeNodes?: WeakSet<object>;
    /** Optional pre-seeded path-scoped set of active `$ref` strings for cycle detection. */
    readonly activeRefs?: Set<string>;
    /** Optional hook allowing the visitor to synthesize or override children for a visited node. */
    readonly resolveDynamicChildren?: (
        node: TNode,
        ctx: ISchemaVisitContext<TNode>
    ) => Iterable<ITreeChild<TNode>> | undefined;
    /** Optional post-order callback invoked after a node's subtree has been walked. */
    readonly onLeave?: (ctx: ISchemaVisitContext<TNode>) => void;
    /** Optional predicate deciding whether a child node should be visited. */
    readonly shouldVisitChild?: (
        child: TNode,
        key: string,
        parent: TNode,
        isArrayItem: boolean
    ) => boolean;
    /** Optional callback invoked when a `properties[key]` entry is not a valid record object. */
    readonly onInvalidProperty?: (key: string, rawValue: unknown, parent: TNode) => void;
    /** When true, suppresses SchemaWalker's default truncation log so `onTruncate` can emit a caller-specific log. */
    readonly silentTruncationLog?: boolean;
    /** Called once per truncation with the scope, reason, and truncated node/paired value. */
    readonly onTruncate?: (
        scope: string,
        reason: "depth" | "cycle",
        rawNode?: TNode,
        other?: unknown
    ) => void;
}

/**
 * Configuration options controlling a {@link SchemaWalker.walkPaired} traversal.
 */
export interface ISchemaWalkPairedOptions<TNode = IPropertyMetadata, TOther = unknown>
    extends Omit<ISchemaWalkOptions<TNode>, "onLeave" | "resolveDynamicChildren"> {
    /** Optional post-order callback invoked after a paired node's subtree has been walked. */
    readonly onLeave?: (ctx: IPairedVisitContext<TNode, TOther>) => void;
    /** Optional hook allowing a paired visitor to synthesize or override children for a visited node. */
    readonly resolveDynamicChildren?: (
        node: TNode,
        ctx: IPairedVisitContext<TNode, TOther>
    ) => Iterable<ITreeChild<TNode>> | undefined;
    /** When true, also tracks object identity along the active `other` path to cut cycles in the paired tree. */
    readonly detectOtherCycles?: boolean;
    /** Optional pre-seeded path-scoped set of active `other` objects for paired cycle detection. */
    readonly activeOthers?: WeakSet<object>;
}

/**
 * Return value from a {@link SchemaVisitor} controlling subtree descent or early termination.
 */
export type SchemaVisitorResult = void | "skip-subtree" | "stop";

/**
 * Visitor callback invoked for each node visited by {@link SchemaWalker.walk}.
 */
export type SchemaVisitor<TNode = IPropertyMetadata> = (
    ctx: ISchemaVisitContext<TNode>
) => SchemaVisitorResult;

/**
 * Visitor callback invoked for each paired node visited by {@link SchemaWalker.walkPaired}.
 */
export type PairedSchemaVisitor<TNode = IPropertyMetadata, TOther = unknown> = (
    ctx: IPairedVisitContext<TNode, TOther>
) => SchemaVisitorResult;

/**
 * Runtime type guard confirming a value is a non-null record object usable as a tree node `TNode`.
 *
 * @param value Candidate value.
 * @returns {boolean} True when `value` is a non-array record object.
 */
function isRecordNode<TNode>(value: unknown): value is TNode {
    return isRecord(value);
}

/**
 * Runtime type guard confirming a value is a normalized or raw `IPropertyMetadata` record.
 *
 * @param value Candidate value.
 * @returns {boolean} True when `value` is a record object.
 */
function isPropertyNode(value: unknown): value is IPropertyMetadata {
    return isRecord(value);
}

/**
 * Shared child generator for schema-like record objects (`IPropertyMetadata` and raw `JsonRecord`).
 *
 * @param container The schema or raw record node whose children are being enumerated.
 * @param options Optional traversal flags (`visitCombinators`, `visitAdditionalProperties`, `visitDefinitions`).
 * @returns {Iterable<ITreeChild<TNode>>} Deterministic sequence of child edges.
 */
function* iterateSchemaLikeChildren<TNode extends object>(
    container: TNode,
    options?: ISchemaWalkOptions<TNode>
): Iterable<ITreeChild<TNode>> {
    const rec: Record<string, unknown> = isRecord(container) ? container : {};
    const props = rec.properties;
    if (isRecord(props)) {
        for (const propKey of Object.keys(props)) {
            const child: unknown = props[propKey];
            if (!isRecordNode<TNode>(child)) {
                options?.onInvalidProperty?.(propKey, child, container);
                continue;
            }
            yield {
                key: propKey,
                node: child,
                kind: "property",
                scopeSegment: `properties/${propKey}`,
                bindingSegment: propKey
            };
        }
    }

    const rawItems: unknown = rec.items;
    if (Array.isArray(rawItems)) {
        for (let i = 0; i < rawItems.length; i++) {
            const itemElem: unknown = rawItems[i];
            if (!isRecordNode<TNode>(itemElem)) {
                continue;
            }
            const idxKey = String(i);
            yield {
                key: idxKey,
                node: itemElem,
                kind: "item",
                scopeSegment: `items/${idxKey}`,
                bindingSegment: `items/${idxKey}`
            };
        }
    } else if (isRecordNode<TNode>(rawItems)) {
        yield {
            key: "items",
            node: rawItems,
            kind: "item",
            scopeSegment: "items",
            bindingSegment: "items"
        };
    }

    if (options?.visitCombinators && isRecordNode<TNode>(rec.not)) {
        yield {
            key: "not",
            node: rec.not,
            kind: "branch",
            branchKeyword: "not",
            scopeSegment: "not",
            bindingSegment: "not"
        };
    }

    if (
        (options?.visitCombinators || options?.visitAdditionalProperties) &&
        isRecordNode<TNode>(rec.additionalProperties)
    ) {
        yield {
            key: "additionalProperties",
            node: rec.additionalProperties,
            kind: "additional",
            branchKeyword: "additionalProperties",
            scopeSegment: "additionalProperties",
            bindingSegment: "additionalProperties"
        };
    }

    if (options?.visitCombinators) {
        const listKeywords = ["oneOf", "anyOf", "allOf"] as const;
        for (const kw of listKeywords) {
            const list: unknown = rec[kw];
            if (!Array.isArray(list)) {
                continue;
            }
            for (let i = 0; i < list.length; i++) {
                const branch: unknown = list[i];
                if (!isRecordNode<TNode>(branch)) {
                    continue;
                }
                const idxKey = String(i);
                yield {
                    key: idxKey,
                    node: branch,
                    kind: "branch",
                    branchKeyword: kw,
                    scopeSegment: `${kw}/${idxKey}`,
                    bindingSegment: `${kw}/${idxKey}`
                };
            }
        }
    }

    if (options?.visitDefinitions) {
        const defKeywords = ["definitions", "$defs"] as const;
        for (const defKw of defKeywords) {
            const defs: unknown = rec[defKw];
            if (!isRecord(defs)) {
                continue;
            }
            for (const defKey of Object.keys(defs)) {
                const defVal: unknown = defs[defKey];
                if (!isRecordNode<TNode>(defVal)) {
                    continue;
                }
                yield {
                    key: defKey,
                    node: defVal,
                    kind: "branch",
                    branchKeyword: defKw,
                    scopeSegment: `${defKw}/${defKey}`,
                    bindingSegment: `${defKw}/${defKey}`
                };
            }
        }
    }
}

/**
 * Built-in tree shape for normalized {@link IPropertyMetadata} / {@link ISchema} trees.
 *
 * @internal
 */
export const SchemaShape: ITreeShape<IPropertyMetadata> = {
    defaultMaxDepth: MAX_SCHEMA_DEPTH,
    isHidden(node: IPropertyMetadata): boolean {
        return node.ui?.visible === false;
    },
    resolveRef(
        rawNode: IPropertyMetadata,
        scope: string,
        options: ISchemaWalkOptions<IPropertyMetadata> | undefined,
        definitions: Record<string, ISchema | IPropertyMetadata> | undefined,
        activeNodes: WeakSet<object>,
        activeRefs: Set<string>,
        addedNodes: object[],
        addedRefs: string[],
        onCycle: (scope: string) => void
    ): IPropertyMetadata | null {
        if (options?.resolveRefs === false) {
            return rawNode;
        }
        let effectiveNode: IPropertyMetadata = rawNode;
        let currentRef = effectiveNode.$ref;

        while (currentRef) {
            if (activeRefs.has(currentRef)) {
                onCycle(scope);
                return null;
            }
            activeRefs.add(currentRef);
            addedRefs.push(currentRef);

            const refKey = OpenApiRefResolver.extractRefName(currentRef);
            const target = options?.resolveRef ? options.resolveRef(currentRef) : definitions?.[refKey];
            if (!isPropertyNode(target)) {
                break;
            }
            if (activeNodes.has(target)) {
                onCycle(scope);
                return null;
            }
            activeNodes.add(target);
            addedNodes.push(target);

            const nextRef = target.$ref;
            effectiveNode = {
                ...target,
                ...effectiveNode,
                type: effectiveNode.type || target.type || SCHEMA_TYPE.OBJECT,
                ui: target.ui || effectiveNode.ui ? { ...target.ui, ...effectiveNode.ui } : undefined,
                $ref: nextRef
            };
            currentRef = nextRef;
        }
        return effectiveNode;
    },
    children(
        node: IPropertyMetadata,
        options?: ISchemaWalkOptions<IPropertyMetadata>
    ): Iterable<ITreeChild<IPropertyMetadata>> {
        return iterateSchemaLikeChildren(node, options);
    }
};

/**
 * Built-in tree shape for un-normalized raw `JsonRecord` schema / OpenAPI trees.
 *
 * @internal
 */
export const RawRecordShape: ITreeShape<JsonRecord> = {
    defaultMaxDepth: MAX_SCHEMA_DEPTH,
    children(node: JsonRecord, options?: ISchemaWalkOptions<JsonRecord>): Iterable<ITreeChild<JsonRecord>> {
        return iterateSchemaLikeChildren(node, options);
    }
};

/**
 * Built-in tree shape for `uiLayout` {@link ILayoutElement} container hierarchies.
 *
 * @internal
 */
export const LayoutElementShape: ITreeShape<ILayoutElement> = {
    defaultMaxDepth: MAX_LAYOUT_DEPTH,
    *children(
        node: ILayoutElement,
        options?: ISchemaWalkOptions<ILayoutElement>
    ): Iterable<ITreeChild<ILayoutElement>> {
        const list: unknown = Array.isArray(node)
            ? node
            : isRecord(node)
              ? node.elements
              : undefined;
        if (!Array.isArray(list)) {
            return;
        }
        for (let i = 0; i < list.length; i++) {
            const elem: unknown = list[i];
            const idxKey = String(i);
            if (!isRecordNode<ILayoutElement>(elem)) {
                options?.onInvalidProperty?.(idxKey, elem, node);
                continue;
            }
            yield {
                key: idxKey,
                node: elem,
                kind: "element",
                scopeSegment: `elements/${idxKey}`,
                bindingSegment: idxKey
            };
        }
    }
};

/**
 * Built-in tree shape for arbitrary runtime JSON payloads (nested objects and arrays).
 *
 * @internal
 */
export const JsonPayloadShape: ITreeShape<unknown> = {
    defaultMaxDepth: MAX_SCHEMA_DEPTH,
    *children(node: unknown, options?: ISchemaWalkOptions<unknown>): Iterable<ITreeChild<unknown>> {
        if (Array.isArray(node)) {
            const limit =
                options?.maxArrayItems !== undefined ? Math.min(node.length, options.maxArrayItems) : node.length;
            for (let i = 0; i < limit; i++) {
                const item: unknown = node[i];
                if (!isRecord(item) && !Array.isArray(item)) {
                    continue;
                }
                const idxKey = String(i);
                yield {
                    key: idxKey,
                    node: item,
                    kind: "item",
                    scopeSegment: `items/${idxKey}`,
                    bindingSegment: idxKey
                };
            }
            return;
        }
        if (isRecord(node)) {
            for (const key of Object.keys(node)) {
                const val: unknown = node[key];
                if (!isRecord(val) && !Array.isArray(val)) {
                    continue;
                }
                yield {
                    key,
                    node: val,
                    kind: "property",
                    scopeSegment: `properties/${key}`,
                    bindingSegment: key
                };
            }
        }
    }
};

/** Internal mutable walk state threaded across one single or paired traversal. */
interface IWalkState<TNode, TOther> {
    readonly shape: ITreeShape<TNode>;
    readonly visitor: PairedSchemaVisitor<TNode, TOther>;
    readonly cursor: IPairCursor<TNode, TOther> | undefined;
    readonly options: ISchemaWalkPairedOptions<TNode, TOther> | undefined;
    readonly maxDepth: number;
    readonly definitions: Record<string, ISchema | IPropertyMetadata> | undefined;
    readonly activeNodes: WeakSet<object>;
    readonly activeRefs: Set<string>;
    readonly activeOthers: WeakSet<object>;
    readonly detectOtherCycles: boolean;
}

function resolveShape<TNode>(shape: ITreeShape<TNode> | undefined): ITreeShape<TNode>;
function resolveShape(shape: unknown): unknown {
    return shape ?? SchemaShape;
}

/**
 * Canonical schema, layout, and paired tree walker.
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
     * Walks a tree in pre-order depth-first order (with optional `onLeave` post-order hook),
     * handling depth capping, path-scoped cycle detection, `$ref` resolution, and hidden-node skipping.
     *
     * @param root The root schema, layout element array, or record object to walk.
     * @param visitor Callback invoked for each visited node.
     * @param options Optional traversal settings and tree shape.
     */
    public static walk<TNode = IPropertyMetadata>(
        root:
            | NoInfer<TNode>
            | ReadonlyArray<NoInfer<TNode>>
            | Partial<ISchema>
            | IPropertyMetadata
            | Record<string, unknown>
            | null
            | undefined,
        visitor: SchemaVisitor<TNode>,
        options?: ISchemaWalkOptions<TNode>
    ): void {
        this.runTraversal<TNode, undefined>(
            root,
            undefined,
            undefined,
            visitor as PairedSchemaVisitor<TNode, undefined>,
            options
        );
    }

    /**
     * Walks a primary tree `TNode` paired lock-step with a secondary cursor `TOther` (such as a runtime
     * payload or a second schema being merged), handling depth capping, path-scoped cycle detection on
     * one or both trees, `$ref` resolution, and post-order `onLeave` callbacks.
     *
     * @param root The root node of the primary tree.
     * @param otherRoot The root value of the paired secondary cursor.
     * @param cursor Stepping rules advancing `TOther` alongside `TNode`.
     * @param visitor Callback invoked for each visited `(TNode, TOther)` pair.
     * @param options Optional paired traversal settings.
     */
    public static walkPaired<TNode = IPropertyMetadata, TOther = unknown>(
        root:
            | NoInfer<TNode>
            | ReadonlyArray<NoInfer<TNode>>
            | Partial<ISchema>
            | IPropertyMetadata
            | Record<string, unknown>
            | null
            | undefined,
        otherRoot: TOther | undefined,
        cursor: IPairCursor<TNode, TOther>,
        visitor: PairedSchemaVisitor<TNode, TOther>,
        options?: ISchemaWalkPairedOptions<TNode, TOther>
    ): void {
        this.runTraversal<TNode, TOther>(root, otherRoot, cursor, visitor, options);
    }

    private static runTraversal<TNode, TOther>(
        root: unknown,
        otherRoot: TOther | undefined,
        cursor: IPairCursor<TNode, TOther> | undefined,
        visitor: PairedSchemaVisitor<TNode, TOther>,
        options: ISchemaWalkPairedOptions<TNode, TOther> | undefined
    ): void {
        if (!this.isWalkableRoot<TNode>(root)) {
            return;
        }
        const shape = resolveShape(options?.shape);
        const maxDepth = options?.maxDepth ?? shape.defaultMaxDepth;
        const definitions = this.extractDefinitions(root, options);
        const state: IWalkState<TNode, TOther> = {
            shape,
            visitor,
            cursor,
            options,
            maxDepth,
            definitions,
            activeNodes: options?.activeNodes ?? new WeakSet<object>(),
            activeRefs: options?.activeRefs ?? new Set<string>(),
            activeOthers: options?.activeOthers ?? new WeakSet<object>(),
            detectOtherCycles: options?.detectOtherCycles === true
        };

        const baseScope = options?.baseScope ?? "#";
        const baseBindingPath = options?.baseBindingPath ?? "";
        const initialDepth = options?.initialDepth ?? 0;

        if (options?.visitRoot) {
            this.visitNode(
                root,
                otherRoot,
                undefined,
                "",
                "property",
                undefined,
                baseScope,
                baseBindingPath,
                initialDepth,
                null,
                false,
                state
            );
            return;
        }

        state.activeNodes.add(root);
        if (state.detectOtherCycles && this.isWalkableNode(otherRoot)) {
            state.activeOthers.add(otherRoot);
        }
        try {
            this.walkChildren(root, otherRoot, baseScope, baseBindingPath, initialDepth, null, undefined, state);
        } finally {
            state.activeNodes.delete(root);
            if (state.detectOtherCycles && this.isWalkableNode(otherRoot)) {
                state.activeOthers.delete(otherRoot);
            }
        }
    }

    private static visitNode<TNode, TOther>(
        rawNode: TNode,
        other: TOther | undefined,
        parentOther: TOther | undefined,
        key: string,
        kind: ChildKind,
        branchKeyword: string | undefined,
        scope: string,
        bindingPath: string,
        depth: number,
        parent: TNode | null,
        isArrayItem: boolean,
        state: IWalkState<TNode, TOther>
    ): SchemaVisitorResult {
        if (this.isWalkableNode(rawNode) && state.activeNodes.has(rawNode)) {
            this.reportCycleTruncation(scope, state.options, rawNode, other);
            return;
        }
        if (state.detectOtherCycles && this.isWalkableNode(other) && state.activeOthers.has(other)) {
            this.reportCycleTruncation(scope, state.options, rawNode, other);
            return;
        }

        const addedNodes: object[] = [];
        const addedRefs: string[] = [];
        if (this.isWalkableNode(rawNode)) {
            state.activeNodes.add(rawNode);
            addedNodes.push(rawNode);
        }
        let currentOther: TOther | undefined = other;

        try {
            const resolved = state.shape.resolveRef
                ? state.shape.resolveRef(
                      rawNode,
                      scope,
                      state.options as ISchemaWalkOptions<TNode> | undefined,
                      state.definitions,
                      state.activeNodes,
                      state.activeRefs,
                      addedNodes,
                      addedRefs,
                      (cycScope) => this.reportCycleTruncation(cycScope, state.options, rawNode, other)
                  )
                : rawNode;
            if (!resolved) {
                return;
            }
            if (state.options?.skipHidden && state.shape.isHidden?.(resolved)) {
                return;
            }
            if (depth > MAX_SCHEMA_DEPTH || depth > state.maxDepth) {
                if (!state.options?.silentTruncationLog) {
                    Logger.warn(
                        "[MetaUI SchemaWalker]",
                        `Schema traversal exceeded maxDepth (${state.maxDepth}) at '${scope}'; subtree was truncated.`
                    );
                }
                state.options?.onTruncate?.(scope, "depth", rawNode, other);
                return;
            }

            const ctx: IPairedVisitContext<TNode, TOther> = {
                node: resolved,
                rawNode,
                key,
                kind,
                branchKeyword,
                scope,
                bindingPath,
                depth,
                parent,
                isArrayItem,
                get other(): TOther | undefined {
                    return currentOther;
                },
                parentOther,
                replaceOther(next: TOther | undefined): void {
                    currentOther = next;
                }
            };

            const decision = state.visitor(ctx);
            if (decision === "stop") {
                return "stop";
            }
            if (decision !== "skip-subtree") {
                const trackedOther =
                    state.detectOtherCycles && this.isWalkableNode(currentOther) ? currentOther : undefined;
                if (trackedOther) {
                    state.activeOthers.add(trackedOther);
                }
                try {
                    const childStop = this.walkChildren(
                        resolved,
                        currentOther,
                        scope,
                        bindingPath,
                        depth + 1,
                        resolved,
                        ctx,
                        state
                    );
                    if (childStop === "stop") {
                        return "stop";
                    }
                } finally {
                    if (trackedOther) {
                        state.activeOthers.delete(trackedOther);
                    }
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

    private static walkChildren<TNode, TOther>(
        container: TNode,
        currentOther: TOther | undefined,
        parentScope: string,
        parentBinding: string,
        childDepth: number,
        parentNode: TNode | null,
        parentCtx: IPairedVisitContext<TNode, TOther> | undefined,
        state: IWalkState<TNode, TOther>
    ): SchemaVisitorResult {
        const dynamicChildren =
            parentCtx && state.options?.resolveDynamicChildren
                ? state.options.resolveDynamicChildren(container, parentCtx)
                : undefined;
        const children =
            dynamicChildren ?? state.shape.children(container, state.options as ISchemaWalkOptions<TNode> | undefined);

        for (const child of children) {
            const isArrayItem = child.kind === "item";
            if (
                state.options?.shouldVisitChild &&
                !state.options.shouldVisitChild(child.node, child.key, container, isArrayItem)
            ) {
                continue;
            }
            const childScope = `${parentScope}/${child.scopeSegment}`;
            const defaultBinding = parentBinding ? `${parentBinding}/${child.bindingSegment}` : child.bindingSegment;

            if (!state.cursor) {
                const res = this.visitNode(
                    child.node,
                    undefined,
                    undefined,
                    child.key,
                    child.kind,
                    child.branchKeyword,
                    childScope,
                    defaultBinding,
                    childDepth,
                    parentNode,
                    isArrayItem,
                    state
                );
                if (res === "stop") {
                    return "stop";
                }
                continue;
            }

            const isFanOut =
                (isArrayItem && Boolean(state.cursor.stepArray)) ||
                (child.kind === "additional" && Boolean(state.cursor.stepAdditional));
            if (isFanOut) {
                const pairs =
                    currentOther !== undefined
                        ? isArrayItem
                            ? state.cursor.stepArray?.(currentOther, child.node, child.key)
                            : state.cursor.stepAdditional?.(currentOther, child.node, container)
                        : undefined;
                if (pairs) {
                    for (const pair of pairs) {
                        const pairBinding = parentBinding ? `${parentBinding}/${pair.key}` : pair.key;
                        const res = this.visitNode(
                            child.node,
                            pair.value,
                            currentOther,
                            pair.key,
                            child.kind,
                            child.branchKeyword,
                            childScope,
                            pairBinding,
                            childDepth,
                            parentNode,
                            isArrayItem,
                            state
                        );
                        if (res === "stop") {
                            return "stop";
                        }
                    }
                }
                continue;
            }

            const childOther =
                currentOther !== undefined
                    ? child.kind === "branch" && state.cursor.stepBranch
                        ? state.cursor.stepBranch(
                              currentOther,
                              child.branchKeyword ?? child.key,
                              child.key,
                              child.node
                          )
                        : state.cursor.stepProperty(currentOther, child.key, child.node)
                    : undefined;
            const res = this.visitNode(
                child.node,
                childOther,
                currentOther,
                child.key,
                child.kind,
                child.branchKeyword,
                childScope,
                defaultBinding,
                childDepth,
                parentNode,
                isArrayItem,
                state
            );
            if (res === "stop") {
                return "stop";
            }
        }
        return;
    }

    private static extractDefinitions<TNode, TOther>(
        root: object,
        options: ISchemaWalkPairedOptions<TNode, TOther> | undefined
    ): Record<string, ISchema | IPropertyMetadata> | undefined {
        if (options?.definitions) {
            return options.definitions;
        }
        return "definitions" in root && this.isDefinitionsMap(root.definitions) ? root.definitions : undefined;
    }

    private static isDefinitionsMap(value: unknown): value is Record<string, ISchema | IPropertyMetadata> {
        return isRecord(value);
    }

    private static reportCycleTruncation<TNode, TOther>(
        scope: string,
        options: ISchemaWalkPairedOptions<TNode, TOther> | undefined,
        rawNode?: TNode,
        other?: TOther
    ): void {
        if (!options?.silentTruncationLog) {
            Logger.warn("[MetaUI SchemaWalker]", `Circular schema reference detected at '${scope}'; stopping recursion.`);
        }
        options?.onTruncate?.(scope, "cycle", rawNode, other);
    }

    private static isWalkableRoot<TNode>(value: unknown): value is TNode & object {
        return isRecord(value) || Array.isArray(value);
    }

    private static isWalkableNode(value: unknown): value is object {
        return isRecord(value) || Array.isArray(value);
    }
}
