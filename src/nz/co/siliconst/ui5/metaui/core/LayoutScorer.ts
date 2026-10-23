/**
 * @file LayoutScorer.ts
 * @description Pure footprint scorer. Computes the nested footprint score of a normalized schema and
 * publishes the inline-versus-dialog outcome as a side table keyed by JSON-Pointer scope. It never
 * writes to the schema it is given: the schema stays the consumer's contract, the table is the
 * layout engine's working memory.
 */

import { ISchema, IPropertyMetadata } from "../interfaces/ISchema";
import { PluginRegistry } from "./PluginRegistry";
import { SchemaWalker } from "./SchemaWalker";
import { OpenApiRefResolver } from "../openapi/OpenApiRefResolver";
import { Logger } from "../utils/Logger";
import { MAX_SCHEMA_DEPTH, RENDER_MODE, RenderModeType, SCHEMA_TYPE, WIDGET_TYPE } from "../constants/MetaUIConstants";
import { deepClone } from "../utils/TypeGuards";

/**
 * One node's layout outcome. Produced by {@link LayoutScorer}, consumed by `LayoutMutator`
 * and the layout renderers. Everything the old implementation used to write onto the node
 * (`ui.renderMode`, `ui.layoutBudget`, `ui.widget`, the materialized `$ref` target and the
 * read-only cascade) is carried here instead.
 */
export interface ILayoutDecision {
    /** JSON-Pointer scope of the node, e.g. `#/properties/Address/properties/Street` or `#/properties/Lines/items`. */
    readonly scope: string;
    /** Model binding path of the node, e.g. `Address/Street`. */
    readonly bindingPath: string;
    /** Resolved render mode for the node. */
    readonly renderMode: RenderModeType;
    /** Footprint score the node contributed to its parent. */
    readonly score: number;
    /** Effective budget in force at the node, or `undefined` where no budget applies. */
    readonly layoutBudget?: number;
    /** Widget the node must adopt (an unresolvable `$ref` renders as a reference trigger). */
    readonly widget?: string;
    /** Resolved `$ref` target when the reference fitted inline; absent when the reference stays a trigger. */
    readonly resolvedRef?: IPropertyMetadata;
    /** True when the node is read-only and that must cascade onto its property subtree. */
    readonly cascadeReadOnly?: boolean;
}

/**
 * Immutable side table of layout decisions keyed by JSON-Pointer scope.
 */
export type LayoutDecisionTable = ReadonlyMap<string, ILayoutDecision>;

/**
 * Memoized outcome of scoring one `$ref` definition at one budget, including the decisions
 * recorded for its subtree so a second occurrence replays them under its own scope.
 */
interface IRefMemoEntry {
    readonly score: number;
    readonly renderMode: RenderModeType;
    readonly resolvedMeta: IPropertyMetadata;
    readonly subTable: ReadonlyArray<readonly [string, ILayoutDecision]>;
}

/**
 * Mutable state threaded through one scoring pass.
 */
interface IScoringContext {
    readonly visited: WeakSet<object>;
    readonly activeRefs: Set<string>;
    readonly refMemo: Map<string, IRefMemoEntry>;
    readonly definitions?: Record<string, ISchema>;
    readonly registry: PluginRegistry;
    /** The table decisions are currently recorded into; swapped for a private one while scoring a `$ref`. */
    table: Map<string, ILayoutDecision>;
}

/**
 * Decisions published per schema root, so a consumer holding only the schema can look them up
 * without the table being threaded through every call site. Weakly keyed: the entry dies with
 * the schema it describes, and nothing is ever written onto the schema object itself.
 */
const DECISIONS_BY_SCHEMA = new WeakMap<ISchema, LayoutDecisionTable>();

/**
 * Computes the visual footprint score of nested object, array and `$ref` nodes against a layout
 * budget and returns the inline-versus-dialog decisions as a side table.
 */
export class LayoutScorer {
    /**
     * Scores a normalized schema and returns the resulting decision table. The schema is read, never written:
     * passing a deep-frozen schema is safe.
     *
     * @param schema The normalized schema root.
     * @param budget The layout budget (e.g., 50). 0 disables inline budget scoring unless `schema.ui.layoutBudget` is set.
     * @param schemaDefinitions Optional global `$ref` definitions dictionary.
     * @param registry Optional injected `PluginRegistry` supplying per-widget footprint scores.
     * @returns {LayoutDecisionTable} The decisions keyed by JSON-Pointer scope; empty when no budget applies.
     */
    public static apply(
        schema: ISchema | null,
        budget: number,
        schemaDefinitions?: Record<string, ISchema>,
        registry: PluginRegistry = PluginRegistry.getInstance()
    ): LayoutDecisionTable {
        const table = new Map<string, ILayoutDecision>();
        if (!schema) return table;

        DECISIONS_BY_SCHEMA.set(schema, table);

        const effectiveBudget =
            budget > 0 ? budget : schema.ui?.layoutBudget && schema.ui.layoutBudget > 0 ? schema.ui.layoutBudget : 0;
        if (effectiveBudget <= 0) return table;

        const context: IScoringContext = {
            visited: new WeakSet<object>(),
            activeRefs: new Set<string>(),
            refMemo: new Map<string, IRefMemoEntry>(),
            definitions: schemaDefinitions,
            registry,
            table
        };

        if (schema.properties) {
            for (const key of Object.keys(schema.properties)) {
                const prop = schema.properties[key];
                if (prop.type === SCHEMA_TYPE.OBJECT || prop.type === SCHEMA_TYPE.ARRAY || prop.$ref) {
                    this.scoreNode(prop, `#/properties/${key}`, effectiveBudget, context, 0);
                }
            }
        }
        if (schema.type === SCHEMA_TYPE.ARRAY && schema.items) {
            this.scoreNode(schema.items, "#/items", effectiveBudget, context, 0);
        }

        return table;
    }

    /**
     * Returns the decisions published by the most recent {@link LayoutScorer.apply} for a schema root.
     *
     * @param schema The normalized schema root the decisions were computed for.
     * @returns {LayoutDecisionTable | undefined} The table, or `undefined` if the schema was never scored.
     */
    public static getDecisions(schema: ISchema | null | undefined): LayoutDecisionTable | undefined {
        return schema ? DECISIONS_BY_SCHEMA.get(schema) : undefined;
    }

    /**
     * Looks up one node's decision by JSON-Pointer scope.
     *
     * @param schema The normalized schema root the decisions were computed for.
     * @param scope The node's JSON-Pointer scope, e.g. `#/properties/Address`.
     * @returns {ILayoutDecision | undefined} The decision, or `undefined` if the node was not scored.
     */
    public static getDecision(schema: ISchema | null | undefined, scope: string | undefined): ILayoutDecision | undefined {
        if (!schema || !scope) return undefined;
        return DECISIONS_BY_SCHEMA.get(schema)?.get(scope);
    }

    /**
     * Converts a JSON-Pointer layout scope into the model binding path it addresses.
     *
     * @param scope The JSON-Pointer scope, e.g. `#/properties/Address/properties/Street`.
     * @returns {string} The binding path, e.g. `Address/Street`.
     */
    public static toBindingPath(scope: string): string {
        return SchemaWalker.toBindingPath(scope);
    }

    /**
     * Traverses a node, computes its total footprint and records its decision.
     * Score > budget forces `dialog`; score <= budget yields `inline`.
     *
     * @param node The schema node to score.
     * @param scope The node's JSON-Pointer scope.
     * @param budget The budget inherited from the parent.
     * @param context The scoring pass state.
     * @param depth Current recursion depth, capped by `MAX_SCHEMA_DEPTH`.
     * @returns {number} The footprint this node contributes to its parent.
     */
    private static scoreNode(
        node: IPropertyMetadata,
        scope: string,
        budget: number,
        context: IScoringContext,
        depth: number
    ): number {
        if (!node || typeof node !== "object") return 0;
        // WALKER_EXEMPT: scoreNode combines top-down inherited budget overrides (effectiveBudget = node.ui?.layoutBudget || budget)
        // with bottom-up non-monotonic score clamping (returning 1 instead of totalScore when decide() yields RENDER_MODE.DIALOG
        // or when depth/visited guards trigger), skips recursion on scalar children (adding registry.getPluginScore directly
        // without advancing depth or recording a decision), and delegates $ref and array nodes to scoreRefNode/scoreArrayNode
        // at the same depth and scope while holding node in context.visited.
        // A field the user never sees costs nothing. Scoring it pushes forms the user experiences as
        // three fields over the budget and into a dialog. Every other walker honours this rule.
        if (node.ui?.visible === false) return 0;

        const effectiveBudget = node.ui?.layoutBudget && node.ui.layoutBudget > 0 ? node.ui.layoutBudget : budget;
        const explicitRenderMode = node.ui?.renderMode;

        if (depth > MAX_SCHEMA_DEPTH) {
            Logger.warn(
                `[MetaUI LayoutScorer] Maximum schema depth (${MAX_SCHEMA_DEPTH}) exceeded at '${scope}'. ` +
                    "Forcing dialog mode; the remainder of this branch is not scored.",
                "",
                "LayoutScorer"
            );
            this.record(context, scope, { renderMode: RENDER_MODE.DIALOG, score: 1, layoutBudget: effectiveBudget });
            return 1;
        }

        if (context.visited.has(node)) {
            Logger.warn(
                `[MetaUI LayoutScorer] Circular reference detected at '${scope}'. Forcing dialog mode to prevent crash.`,
                "",
                "LayoutScorer"
            );
            this.record(context, scope, { renderMode: RENDER_MODE.DIALOG, score: 1, layoutBudget: effectiveBudget });
            return 1;
        }
        context.visited.add(node);

        if (node.$ref) {
            const refScore = this.scoreRefNode(node, scope, effectiveBudget, context, depth, explicitRenderMode);
            context.visited.delete(node);
            return refScore;
        }

        if (node.type === SCHEMA_TYPE.ARRAY) {
            const arrayScore = this.scoreArrayNode(node, scope, effectiveBudget, context, depth, explicitRenderMode);
            context.visited.delete(node);
            return arrayScore;
        }

        let totalScore = 0;
        if (node.properties) {
            for (const key of Object.keys(node.properties)) {
                const child = node.properties[key];
                if (child.ui?.visible === false) {
                    continue;
                }
                if (child.type === SCHEMA_TYPE.OBJECT || child.type === SCHEMA_TYPE.ARRAY || child.$ref) {
                    totalScore += this.scoreNode(child, `${scope}/properties/${key}`, effectiveBudget, context, depth + 1);
                } else {
                    totalScore += context.registry.getPluginScore(child.type || SCHEMA_TYPE.STRING, child.ui?.widget);
                }
            }
        } else {
            totalScore += context.registry.getPluginScore(SCHEMA_TYPE.OBJECT, node.ui?.widget);
        }

        context.visited.delete(node);

        const cascadeReadOnly =
            (node.readOnly === true || node.ui?.readOnly === true) && !!(node.properties || node.items);
        const mode = this.decide(explicitRenderMode, totalScore, effectiveBudget);
        this.record(context, scope, {
            renderMode: mode,
            score: mode === RENDER_MODE.INLINE ? totalScore : 1,
            layoutBudget: effectiveBudget,
            cascadeReadOnly: cascadeReadOnly || undefined
        });
        return mode === RENDER_MODE.INLINE ? totalScore : 1;
    }

    /**
     * Scores a `$ref` node: resolves the definition, memoizes the outcome per definition and budget,
     * and decides whether the reference is materialized inline or kept as a dialog trigger.
     *
     * @param node The `$ref` node.
     * @param scope The node's JSON-Pointer scope.
     * @param effectiveBudget The budget in force at the node.
     * @param context The scoring pass state.
     * @param depth Current recursion depth.
     * @param explicitRenderMode Author-declared render mode on the node, if any.
     * @returns {number} The footprint this node contributes to its parent.
     */
    private static scoreRefNode(
        node: IPropertyMetadata,
        scope: string,
        effectiveBudget: number,
        context: IScoringContext,
        depth: number,
        explicitRenderMode?: RenderModeType
    ): number {
        // WALKER_EXEMPT: scoreRefNode memoizes (score, renderMode, resolvedMeta, subTable) in context.refMemo keyed by
        // `${key}::${effectiveBudget}`, swaps context.table = privateTable before re-entering scoreNode(resolvedMeta, scope,
        // effectiveBudget, context, depth) at the same scope and depth (whereas SchemaWalker always increments depth and appends
        // a scopeSegment per child edge), and only replays subTable via replaySubTable when refFitInline or explicit INLINE
        // holds, discarding privateTable on DIALOG overflow so diamond $ref graphs do not materialize 2^N dead decisions.
        const key = OpenApiRefResolver.extractRefName(node.$ref || "");

        if (context.activeRefs.has(key)) {
            Logger.warn(
                `[MetaUI LayoutScorer] Circular OpenAPI $ref detected at '${scope}' for '${key}'. Forcing dialog mode to prevent crash.`,
                "",
                "LayoutScorer"
            );
            this.record(context, scope, { renderMode: RENDER_MODE.DIALOG, score: 1 });
            return 1;
        }

        const resolvedOriginal = context.definitions ? context.definitions[key] : undefined;
        if (!resolvedOriginal) {
            this.record(context, scope, {
                renderMode: RENDER_MODE.DIALOG,
                score: 1,
                layoutBudget: effectiveBudget,
                widget: node.ui?.widget || WIDGET_TYPE.REFERENCE
            });
            return 1;
        }

        const memoKey = `${key}::${effectiveBudget}`;
        const cachedRef = context.refMemo.get(memoKey);
        let resolvedMeta: IPropertyMetadata;
        let resolvedScore: number;
        let resolvedMode: RenderModeType;
        let subTable: ReadonlyArray<readonly [string, ILayoutDecision]>;

        if (cachedRef) {
            resolvedMeta = deepClone(cachedRef.resolvedMeta);
            resolvedScore = cachedRef.score;
            resolvedMode = cachedRef.renderMode;
            subTable = cachedRef.subTable;
        } else {
            context.activeRefs.add(key);
            const resolvedClone = deepClone(resolvedOriginal);
            resolvedMeta = {
                ...resolvedClone,
                type: resolvedClone.type || SCHEMA_TYPE.OBJECT
            };
            // The definition's own subtree is scored into a private table. A `$ref` that overflows into a
            // dialog re-scores its sub-schema inside the nested host, so its descendants' decisions are
            // never read — and keeping them would make a diamond $ref graph cost one entry per path (2^N).
            const outerTable = context.table;
            const privateTable = new Map<string, ILayoutDecision>();
            context.table = privateTable;
            resolvedScore = this.scoreNode(resolvedMeta, scope, effectiveBudget, context, depth);
            context.table = outerTable;
            resolvedMode = privateTable.get(scope)?.renderMode || resolvedMeta.ui?.renderMode || RENDER_MODE.INLINE;
            subTable = this.relativizeSubTable(privateTable, scope);
            context.activeRefs.delete(key);
            context.refMemo.set(memoKey, {
                score: resolvedScore,
                renderMode: resolvedMode,
                resolvedMeta: deepClone(resolvedMeta),
                subTable
            });
        }

        if (explicitRenderMode === RENDER_MODE.DIALOG) {
            this.record(context, scope, { renderMode: RENDER_MODE.DIALOG, score: 1, layoutBudget: effectiveBudget });
            return 1;
        }

        const refFitInline = resolvedMode !== RENDER_MODE.DIALOG && resolvedScore <= effectiveBudget;
        if (refFitInline || explicitRenderMode === RENDER_MODE.INLINE) {
            const cascadeReadOnly =
                (node.readOnly === true ||
                    node.ui?.readOnly === true ||
                    resolvedMeta.readOnly === true ||
                    resolvedMeta.ui?.readOnly === true) &&
                !!(resolvedMeta.properties || resolvedMeta.items);
            this.replaySubTable(context, scope, subTable);
            this.record(context, scope, {
                renderMode: RENDER_MODE.INLINE,
                score: resolvedScore,
                layoutBudget: effectiveBudget,
                resolvedRef: resolvedMeta,
                cascadeReadOnly: cascadeReadOnly || undefined
            });
            return resolvedScore;
        }

        this.record(context, scope, { renderMode: RENDER_MODE.DIALOG, score: 1, layoutBudget: effectiveBudget });
        return 1;
    }

    /**
     * Scores an array node from its own widget footprint plus the footprint of its item schema.
     *
     * @param node The array node.
     * @param scope The node's JSON-Pointer scope.
     * @param effectiveBudget The budget in force at the node.
     * @param context The scoring pass state.
     * @param depth Current recursion depth.
     * @param explicitRenderMode Author-declared render mode on the node, if any.
     * @returns {number} The footprint this node contributes to its parent.
     */
    private static scoreArrayNode(
        node: IPropertyMetadata,
        scope: string,
        effectiveBudget: number,
        context: IScoringContext,
        depth: number,
        explicitRenderMode?: RenderModeType
    ): number {
        // WALKER_EXEMPT: scoreArrayNode is entered from scoreNode at the same scope and depth without advancing depth,
        // conditionally calls scoreNode(itemsMeta, itemsScope, effectiveBudget, context, depth + 1) only when itemsMeta is
        // OBJECT, ARRAY, or $ref, and then reads context.table.get(itemsScope)?.renderMode to force the parent array's own
        // decision to RENDER_MODE.DIALOG with clamped score 1 whenever items overflowed into a dialog.
        let arrayScore = context.registry.getPluginScore(SCHEMA_TYPE.ARRAY, node.ui?.widget);
        const itemsScope = `${scope}/items`;

        const itemsMeta = node.items;
        if (itemsMeta && (itemsMeta.type === SCHEMA_TYPE.OBJECT || itemsMeta.type === SCHEMA_TYPE.ARRAY || itemsMeta.$ref)) {
            arrayScore += this.scoreNode(itemsMeta, itemsScope, effectiveBudget, context, depth + 1);
        }
        const itemsMode = context.table.get(itemsScope)?.renderMode || itemsMeta?.ui?.renderMode;
        const cascadeReadOnly = (node.readOnly === true || node.ui?.readOnly === true) && !!node.items;

        if (explicitRenderMode === RENDER_MODE.DIALOG || itemsMode === RENDER_MODE.DIALOG) {
            this.record(context, scope, {
                renderMode: RENDER_MODE.DIALOG,
                score: 1,
                layoutBudget: effectiveBudget,
                cascadeReadOnly: cascadeReadOnly || undefined
            });
            return 1;
        }

        const mode = this.decide(explicitRenderMode, arrayScore, effectiveBudget);
        this.record(context, scope, {
            renderMode: mode,
            score: mode === RENDER_MODE.INLINE ? arrayScore : 1,
            layoutBudget: effectiveBudget,
            cascadeReadOnly: cascadeReadOnly || undefined
        });
        return mode === RENDER_MODE.INLINE ? arrayScore : 1;
    }

    /**
     * Applies the budget rule: an explicit directive wins, otherwise a node that fits renders inline.
     *
     * @param explicitRenderMode Author-declared render mode on the node, if any.
     * @param score The node's computed footprint.
     * @param effectiveBudget The budget in force at the node.
     * @returns {RenderModeType} The resolved render mode.
     */
    private static decide(
        explicitRenderMode: RenderModeType | undefined,
        score: number,
        effectiveBudget: number
    ): RenderModeType {
        if (explicitRenderMode === RENDER_MODE.DIALOG) return RENDER_MODE.DIALOG;
        if (score <= effectiveBudget || explicitRenderMode === RENDER_MODE.INLINE) return RENDER_MODE.INLINE;
        return RENDER_MODE.DIALOG;
    }

    /**
     * Writes one decision into the side table, deriving the scope-dependent fields.
     *
     * @param context The scoring pass state.
     * @param scope The node's JSON-Pointer scope.
     * @param decision The scope-independent part of the decision.
     */
    private static record(
        context: IScoringContext,
        scope: string,
        decision: Omit<ILayoutDecision, "scope" | "bindingPath">
    ): void {
        context.table.set(scope, { ...decision, scope, bindingPath: this.toBindingPath(scope) });
    }

    /**
     * Re-keys a `$ref` definition's private table relative to the referencing scope, so the memo can
     * replay it under any later occurrence of the same definition.
     *
     * @param privateTable The table the definition's subtree was scored into.
     * @param scope The `$ref` node's scope.
     * @returns {ReadonlyArray<readonly [string, ILayoutDecision]>} Relative scope/decision pairs.
     */
    private static relativizeSubTable(
        privateTable: Map<string, ILayoutDecision>,
        scope: string
    ): ReadonlyArray<readonly [string, ILayoutDecision]> {
        const prefix = `${scope}/`;
        const snapshot: (readonly [string, ILayoutDecision])[] = [];
        for (const [key, decision] of privateTable) {
            if (key.startsWith(prefix)) {
                snapshot.push([key.slice(scope.length), decision] as const);
            }
        }
        return snapshot;
    }

    /**
     * Replays memoized subtree decisions under a second occurrence of the same `$ref`.
     *
     * @param context The scoring pass state.
     * @param scope The `$ref` node's scope.
     * @param subTable Relative scope/decision pairs captured by {@link LayoutScorer.snapshotSubTable}.
     */
    private static replaySubTable(
        context: IScoringContext,
        scope: string,
        subTable: ReadonlyArray<readonly [string, ILayoutDecision]>
    ): void {
        for (const [relativeScope, decision] of subTable) {
            const absoluteScope = `${scope}${relativeScope}`;
            context.table.set(absoluteScope, {
                ...decision,
                scope: absoluteScope,
                bindingPath: this.toBindingPath(absoluteScope),
                resolvedRef: decision.resolvedRef ? deepClone(decision.resolvedRef) : undefined
            });
        }
    }
}
