/**
 * @file LayoutMutator.ts
 * @description Applies the layout decisions computed by `LayoutScorer` to the render tree: rewrites
 * `uiLayout` so inline objects become native Groups, and materializes an inlined `$ref` onto the node
 * it was declared on, which is the one decision the schema itself still has to carry.
 */

import { ISchema, ILayoutElement, IPropertyMetadata, IUIDirective } from "../interfaces/ISchema";
import { SchemaNormalizer } from "./SchemaNormalizer";
import { LayoutElementShape, SchemaWalker } from "./SchemaWalker";
import { ILayoutDecision, LayoutDecisionTable, LayoutScorer } from "./LayoutScorer";
import {
    LAYOUT_STRATEGY,
    MAX_LAYOUT_DEPTH,
    RENDER_MODE,
    RenderModeType,
    SCHEMA_TYPE,
    WIDGET_TYPE
} from "../constants/MetaUIConstants";
import { Logger } from "../utils/Logger";

/**
 * Applies `LayoutScorer`'s decisions before rendering.
 *
 * `LayoutScorer` is pure — it writes nothing to the schema. This class is the single writer, and what it
 * still writes is now down to one structural case plus one annotation:
 *
 * - **`$ref` materialization (structural, required).** `SchemaNormalizer.resolveScope` cannot see through
 *   a `$ref`, so an inlined reference must be overlaid onto the node before any child scope resolves.
 *   This is also the one projection that couples layout to validation, because what `PayloadValidator`
 *   sees depends on whether the reference was inlined. Retiring it means teaching `resolveScope` to
 *   dereference — deliberately deferred while `core/SchemaNormalizer.ts` is being migrated elsewhere.
 * - **`ui.renderMode` (annotation, retained for visibility).** No production consumer reads it any more:
 *   `ArraySubSchemaFactory.isTableSubLayout` now takes the decision, and the nested-dialog budget is
 *   passed explicitly through `INestedEditorLaunchOptions`. Two existing regression tests still assert
 *   the mode on the node, and keeping that assertion live is what makes a behaviour change visible.
 */
export class LayoutMutator {
    /**
     * Projects the scorer's decisions onto the schema and expands the `uiLayout` array accordingly.
     *
     * @param schema The normalized root schema.
     * @param decisions The decisions from `LayoutScorer.apply`. Defaults to the table published for this
     *        schema root; when there is none, only author-declared `ui.renderMode` directives apply.
     */
    public static apply(schema: ISchema, decisions: LayoutDecisionTable | undefined = LayoutScorer.getDecisions(schema)): void {
        if (!schema) {
            return;
        }

        if (decisions && decisions.size > 0) {
            this.projectDecisions(schema, decisions);
        }

        if (!schema.uiLayout || !Array.isArray(schema.uiLayout)) {
            return;
        }

        schema.uiLayout = this.expandElements(schema.uiLayout, schema, decisions, true);
    }

    /**
     * Writes each decision onto the node it describes, parents first so that a reference materialized
     * from a `$ref` exists before its children are annotated.
     *
     * @param schema The normalized root schema.
     * @param decisions The decisions from `LayoutScorer.apply`.
     */
    private static projectDecisions(schema: ISchema, decisions: LayoutDecisionTable): void {
        const scopes = Array.from(decisions.keys()).sort((a, b) => a.split("/").length - b.split("/").length);
        for (const scope of scopes) {
            const decision = decisions.get(scope);
            const node = this.resolveNode(schema, scope);
            if (!decision || !node) {
                continue;
            }
            node.ui = node.ui || {};
            if (decision.widget) {
                node.ui.widget = decision.widget;
            }
            if (decision.resolvedRef) {
                this.materializeRef(node, decision.resolvedRef);
            }
            if (decision.cascadeReadOnly) {
                this.cascadeReadOnly(node);
            }
            node.ui.renderMode = decision.renderMode;
        }
    }

    /**
     * Overlays a resolved `$ref` target onto the referencing node, keeping the node's own `ui` block,
     * label, `required` and `nullable` declarations, and drops the now-redundant `$ref` and
     * `reference` widget.
     *
     * The node's `ui` block has to be captured *before* the overlay: `Object.assign` replaces
     * `node.ui` with the definition's, so a rebuild that reads `node.ui` afterwards spreads the
     * definition's block twice and every directive the author wrote on the referencing node is gone.
     * `ui.readOnly: true` was in that set, which meant a property the schema declares read-only
     * rendered as an editable field — an access constraint dropped, not a cosmetic one.
     *
     * @param node The referencing node.
     * @param resolvedMeta The resolved definition to materialize.
     */
    private static materializeRef(node: IPropertyMetadata, resolvedMeta: IPropertyMetadata): void {
        const localUi: IUIDirective = node.ui ? { ...node.ui } : {};
        const originalRequired = node.required;
        const originalNullable = node.nullable;
        const originalReadOnly = node.readOnly === true || localUi.readOnly === true;

        Object.assign(node, resolvedMeta);
        delete node.$ref;
        node.required = originalRequired;
        node.nullable = originalNullable;
        node.ui = this.overlayUiDirectives(resolvedMeta.ui, localUi);
        // Read-only is a restriction, so it is the union of both sides rather than an override:
        // `SchemaNormalizer` emits `ui.readOnly: false` on every node it touches, so letting the
        // local block win key by key would relax a definition that declares itself read-only.
        if (originalReadOnly || resolvedMeta.readOnly === true || resolvedMeta.ui?.readOnly === true) {
            node.readOnly = true;
            node.ui.readOnly = true;
        }
        if (node.ui.widget === WIDGET_TYPE.REFERENCE) {
            if (resolvedMeta.ui?.widget && resolvedMeta.ui.widget !== WIDGET_TYPE.REFERENCE) {
                node.ui.widget = resolvedMeta.ui.widget;
            } else {
                delete node.ui.widget;
            }
        }
    }

    /**
     * Merges the referencing node's `ui` directives over the resolved definition's.
     *
     * Mirrors `PayloadValidator.mergeResolvedDefinition`: `SchemaNormalizer` emits every directive as
     * an own property, so an absent `dialogButtonText` is present-with-the-value-`undefined` and a
     * plain spread would erase the definition's. Only keys the node carries a value for override.
     *
     * @param definitionUi The resolved definition's `ui` block.
     * @param localUi The referencing node's own `ui` block.
     * @returns {IUIDirective} The merged directive block.
     */
    private static overlayUiDirectives(definitionUi: IUIDirective | undefined, localUi: IUIDirective): IUIDirective {
        const merged: Record<string, unknown> = { ...(definitionUi || {}) };
        for (const [key, value] of Object.entries(localUi as Record<string, unknown>)) {
            if (value !== undefined) {
                merged[key] = value;
            }
        }
        merged.label = localUi.label || definitionUi?.label;
        return merged as IUIDirective;
    }

    /**
     * Marks a read-only node's property and array-item subtree read-only. A child renders from its own
     * metadata, so without the cascade the children of a read-only object or array render as editable fields.
     *
     * @param node The read-only node.
     */
    private static cascadeReadOnly(node: IPropertyMetadata): void {
        if (!node.properties && !node.items) {
            return;
        }
        node.readOnly = true;
        node.ui = { ...(node.ui || {}), readOnly: true };
        SchemaWalker.walk(
            node,
            (ctx) => {
                ctx.node.readOnly = true;
                ctx.node.ui = { ...(ctx.node.ui || {}), readOnly: true };
                if (!ctx.node.properties && !ctx.node.items) {
                    return "skip-subtree";
                }
                return undefined;
            },
            { resolveRefs: false }
        );
    }

    /**
     * Resolves a JSON-Pointer layout scope (`#/properties/A/items`) to the node it addresses.
     *
     * @param schema The normalized root schema.
     * @param scope The JSON-Pointer scope.
     * @returns {IPropertyMetadata | undefined} The addressed node, or `undefined` if it does not exist.
     */
    private static resolveNode(schema: ISchema, scope: string): IPropertyMetadata | undefined {
        const tokens = scope.split("/");
        let current: ISchema | IPropertyMetadata | undefined = schema;
        for (let i = 1; i < tokens.length && current; i++) {
            const token = tokens[i];
            if (token === "properties") {
                const key = tokens[i + 1];
                if (key === undefined) {
                    return undefined;
                }
                i += 1;
                current = current.properties?.[key];
            } else if (token === "items") {
                current = current.items;
            } else {
                return undefined;
            }
        }
        return current === schema ? undefined : (current as IPropertyMetadata | undefined);
    }

    /**
     * Resolves the render mode in force at a scope: the scorer's decision when there is one, otherwise
     * the author's own `ui.renderMode` directive.
     *
     * @param scope The element's JSON-Pointer scope.
     * @param meta The resolved property metadata, if already known.
     * @param decisions The active decision table, if any.
     * @returns {RenderModeType | undefined} The effective render mode, or `undefined` when unconstrained.
     */
    private static resolveRenderMode(
        scope: string | undefined,
        meta: IPropertyMetadata | undefined,
        decisions: LayoutDecisionTable | undefined
    ): RenderModeType | undefined {
        const decision: ILayoutDecision | undefined = scope ? decisions?.get(scope) : undefined;
        return decision?.renderMode || meta?.ui?.renderMode;
    }

    /**
     * Recursively expands container layout elements (`Group`, `WizardStep`, `HorizontalLayout`, `VerticalLayout`)
     * and converts inline object `Control` elements into nested `Group` (or `VerticalLayout` at wizard top-level) elements.
     *
     * @param elements The layout elements array to expand.
     * @param rootSchema The root normalized schema.
     * @param decisions The active decision table, if any.
     * @param isTopLevel True when expanding root-level elements of `schema.uiLayout`.
     * @param emittedDialogScopes Dialog scopes already emitted during this {@link LayoutMutator.apply} pass.
     * @returns {ILayoutElement[]} A new expanded layout elements array.
     */
    private static expandElements(
        elements: ILayoutElement[],
        rootSchema: ISchema,
        decisions: LayoutDecisionTable | undefined,
        isTopLevel: boolean = false,
        emittedDialogScopes: Set<string> = new Set<string>()
    ): ILayoutElement[] {
        const isWizardTopLevel = isTopLevel && rootSchema.layoutStrategy === LAYOUT_STRATEGY.WIZARD;
        const childrenStack: ILayoutElement[][] = [[]];
        const activeInlineMetas = new WeakSet<object>();
        const containerFrames = new Set<ILayoutElement>();
        const inlineFrames = new Map<
            ILayoutElement,
            { meta: IPropertyMetadata; newGroup: ILayoutElement; childElements: ILayoutElement[] }
        >();

        SchemaWalker.walk<ILayoutElement>(
            elements,
            (ctx) => {
                const element = ctx.node;
                if (
                    element.type === "Group" ||
                    element.type === "WizardStep" ||
                    element.type === "HorizontalLayout" ||
                    element.type === "VerticalLayout"
                ) {
                    containerFrames.add(element);
                    if (element.elements) {
                        childrenStack.push([]);
                        if (ctx.depth >= MAX_LAYOUT_DEPTH) {
                            Logger.warn(
                                "[MetaUI LayoutMutator]",
                                `uiLayout nesting exceeded MAX_LAYOUT_DEPTH (${MAX_LAYOUT_DEPTH}) ` +
                                    `during layout expansion; truncating deeper elements.`
                            );
                            return "skip-subtree";
                        }
                        return undefined;
                    }
                    return "skip-subtree";
                }
                if (element.type === "Control") {
                    if (!element.scope) {
                        childrenStack[childrenStack.length - 1].push(element);
                        return "skip-subtree";
                    }
                    try {
                        const topSegment = element.scope.startsWith("#/properties/")
                            ? element.scope.replace("#/properties/", "").split("/properties/")[0]
                            : undefined;
                        const topPropMeta = topSegment ? rootSchema.properties?.[topSegment] : undefined;
                        const topScope = topSegment ? `#/properties/${topSegment}` : undefined;
                        if (
                            topPropMeta &&
                            topScope &&
                            element.scope !== topScope &&
                            this.resolveRenderMode(topScope, topPropMeta, decisions) === RENDER_MODE.DIALOG
                        ) {
                            if (!emittedDialogScopes.has(topScope)) {
                                emittedDialogScopes.add(topScope);
                                childrenStack[childrenStack.length - 1].push({ type: "Control", scope: topScope });
                            }
                            return "skip-subtree";
                        }

                        const { meta, bindingPath } = SchemaNormalizer.resolveScope(rootSchema, element.scope);
                        const hasExplicitWidget = Boolean(meta?.ui?.widget || element.widget);
                        const isInlineObject =
                            meta?.type === SCHEMA_TYPE.OBJECT &&
                            this.resolveRenderMode(element.scope, meta, decisions) === RENDER_MODE.INLINE &&
                            !hasExplicitWidget;

                        if (isInlineObject && meta.properties) {
                            if (activeInlineMetas.has(meta)) {
                                Logger.warn(
                                    "[MetaUI LayoutMutator]",
                                    `Circular inline object detected at '${element.scope}'; stopping recursive expansion.`
                                );
                                childrenStack[childrenStack.length - 1].push(element);
                                return "skip-subtree";
                            }
                            activeInlineMetas.add(meta);
                            const childElements: ILayoutElement[] = [];
                            for (const childKey of Object.keys(meta.properties)) {
                                childElements.push({
                                    type: "Control",
                                    scope: `${element.scope}/properties/${childKey}`
                                });
                            }
                            const newGroup: ILayoutElement = {
                                ...element,
                                type: isWizardTopLevel && ctx.depth === 0 ? "VerticalLayout" : "Group",
                                label: element.label || meta.ui?.label || bindingPath.split("/").pop()
                            };
                            delete newGroup.scope;
                            inlineFrames.set(element, { meta, newGroup, childElements });
                            childrenStack.push([]);
                            if (ctx.depth >= MAX_LAYOUT_DEPTH) {
                                Logger.warn(
                                    "[MetaUI LayoutMutator]",
                                    `uiLayout nesting exceeded MAX_LAYOUT_DEPTH (${MAX_LAYOUT_DEPTH}) ` +
                                        `during layout expansion; truncating deeper elements.`
                                );
                                return "skip-subtree";
                            }
                            return undefined;
                        }
                        childrenStack[childrenStack.length - 1].push(element);
                        return "skip-subtree";
                    } catch (err) {
                        Logger.debug(
                            "[MetaUI LayoutMutator]",
                            `Scope '${element.scope}' skipped during expansion: ${(err as Error).message}`
                        );
                        childrenStack[childrenStack.length - 1].push(element);
                        return "skip-subtree";
                    }
                }
                childrenStack[childrenStack.length - 1].push(element);
                return "skip-subtree";
            },
            {
                shape: LayoutElementShape,
                silentTruncationLog: true,
                resolveDynamicChildren: (node) => {
                    const frame = inlineFrames.get(node);
                    if (!frame) {
                        return undefined;
                    }
                    return frame.childElements.map((child, idx) => ({
                        key: String(idx),
                        node: child,
                        kind: "element" as const,
                        scopeSegment: `elements/${idx}`,
                        bindingSegment: String(idx)
                    }));
                },
                onLeave: (ctx) => {
                    const element = ctx.node;
                    if (containerFrames.has(element)) {
                        containerFrames.delete(element);
                        const clonedContainer: ILayoutElement = { ...element };
                        if (element.elements) {
                            clonedContainer.elements = childrenStack.pop() || [];
                        }
                        childrenStack[childrenStack.length - 1].push(clonedContainer);
                        return;
                    }
                    const inlineFrame = inlineFrames.get(element);
                    if (inlineFrame) {
                        inlineFrames.delete(element);
                        activeInlineMetas.delete(inlineFrame.meta);
                        inlineFrame.newGroup.elements = childrenStack.pop() || [];
                        childrenStack[childrenStack.length - 1].push(inlineFrame.newGroup);
                    }
                },
                onTruncate: (_scope, reason) => {
                    if (reason === "cycle") {
                        Logger.warn(
                            "[MetaUI LayoutMutator]",
                            "Circular uiLayout element reference detected during layout expansion; stopping recursion."
                        );
                    }
                }
            }
        );

        return childrenStack[0];
    }
}
