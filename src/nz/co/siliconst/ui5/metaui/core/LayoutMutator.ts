/**
 * @file LayoutMutator.ts
 * @description Intercepts the generated schema before rendering to dynamically mutate the UI layout based on inline rendering rules.
 */

import { ISchema, ILayoutElement } from "../interfaces/ISchema";
import { SchemaNormalizer } from "./SchemaNormalizer";
import { LAYOUT_STRATEGY, RENDER_MODE, SCHEMA_TYPE } from "../constants/MetaUIConstants";
import { Logger } from "../utils/Logger";

/**
 * Intercepts the generated schema before rendering to dynamically mutate the UI layout
 * based on inline versus dialog rendering rules.
 */
export class LayoutMutator {
    /**
     * Mutates the `uiLayout` array to expand nested inline objects into native Groups.
     *
     * @param schema The normalized root schema.
     */
    public static apply(schema: ISchema): void {
        if (!schema || !schema.uiLayout || !Array.isArray(schema.uiLayout)) {
            return;
        }

        schema.uiLayout = this.expandElements(schema.uiLayout, schema, true);
    }

    /**
     * Recursively expands container layout elements (`Group`, `WizardStep`, `HorizontalLayout`, `VerticalLayout`)
     * and converts inline object `Control` elements into nested `Group` (or `VerticalLayout` at wizard top-level) elements.
     *
     * @param elements The layout elements array to expand.
     * @param rootSchema The root normalized schema.
     * @param isTopLevel True when expanding root-level elements of `schema.uiLayout`.
     * @returns {ILayoutElement[]} A new expanded layout elements array.
     */
    private static expandElements(
        elements: ILayoutElement[],
        rootSchema: ISchema,
        isTopLevel: boolean = false
    ): ILayoutElement[] {
        const expanded: ILayoutElement[] = [];
        const emittedDialogScopes = new Set<string>();
        const isWizardTopLevel = isTopLevel && rootSchema.layoutStrategy === LAYOUT_STRATEGY.WIZARD;

        for (const element of elements) {
            if (
                element.type === "Group" ||
                element.type === "WizardStep" ||
                element.type === "HorizontalLayout" ||
                element.type === "VerticalLayout"
            ) {
                const clonedContainer: ILayoutElement = { ...element };
                if (element.elements) {
                    clonedContainer.elements = this.expandElements(element.elements, rootSchema, false);
                }
                expanded.push(clonedContainer);
            } else if (element.type === "Control") {
                if (!element.scope) {
                    expanded.push(element);
                    continue;
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
                        topPropMeta.ui?.renderMode === RENDER_MODE.DIALOG
                    ) {
                        if (!emittedDialogScopes.has(topScope)) {
                            emittedDialogScopes.add(topScope);
                            expanded.push({ type: "Control", scope: topScope });
                        }
                        continue;
                    }

                    const { meta, bindingPath } = SchemaNormalizer.resolveScope(rootSchema, element.scope);

                    const hasExplicitWidget = Boolean(meta?.ui?.widget || element.widget);
                    const isInlineObject =
                        meta?.type === SCHEMA_TYPE.OBJECT &&
                        meta.ui?.renderMode === RENDER_MODE.INLINE &&
                        !hasExplicitWidget;

                    if (isInlineObject && meta.properties) {
                        const childElements: ILayoutElement[] = [];
                        for (const childKey of Object.keys(meta.properties)) {
                            childElements.push({
                                type: "Control",
                                scope: `${element.scope}/properties/${childKey}`
                            });
                        }

                        const newGroup: ILayoutElement = {
                            ...element,
                            type: isWizardTopLevel ? "VerticalLayout" : "Group",
                            label: element.label || meta.ui?.label || bindingPath.split("/").pop(),
                            elements: this.expandElements(childElements, rootSchema, false)
                        };
                        delete newGroup.scope;

                        expanded.push(newGroup);
                    } else {
                        expanded.push(element);
                    }
                } catch (err) {
                    Logger.debug(
                        "[MetaUI LayoutMutator]",
                        `Scope '${element.scope}' skipped during expansion: ${(err as Error).message}`
                    );
                    expanded.push(element);
                }
            } else {
                expanded.push(element);
            }
        }

        return expanded;
    }
}
