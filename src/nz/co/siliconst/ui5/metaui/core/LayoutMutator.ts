/**
 * @file LayoutMutator.ts
 * @description Intercepts the generated schema before rendering to dynamically mutate the UI layout based on inline rendering rules.
 */

import { ISchema, ILayoutElement } from "../interfaces/ISchema";
import { SchemaNormalizer } from "./SchemaNormalizer";
import { RENDER_MODE, SCHEMA_TYPE } from "../constants/MetaUIConstants";

export class LayoutMutator {
    /**
     * Mutates the `uiLayout` array to expand nested inline objects into native Groups.
     * @param schema The normalized root schema.
     */
    public static apply(schema: ISchema): void {
        if (!schema || !schema.uiLayout || !Array.isArray(schema.uiLayout)) {
            return; // No layout to mutate
        }

        schema.uiLayout = this.expandElements(schema.uiLayout, schema);
    }

    private static expandElements(elements: ILayoutElement[], rootSchema: ISchema): ILayoutElement[] {
        const expanded: ILayoutElement[] = [];

        for (const element of elements) {
            if (element.type === "Group") {
                // Recursively expand group elements
                if (element.elements) {
                    element.elements = this.expandElements(element.elements, rootSchema);
                }
                expanded.push(element);
            } else if (element.type === "Control") {
                if (!element.scope) {
                    expanded.push(element);
                    continue;
                }
                // Resolve the schema to see if this control points to an inline object
                try {
                    const { meta, bindingPath } = SchemaNormalizer.resolveScope(rootSchema, element.scope);
                    
                    const hasExplicitWidget = !!meta?.ui?.widget;
                    const isInlineObject = meta?.type === SCHEMA_TYPE.OBJECT && meta.ui?.renderMode === RENDER_MODE.INLINE && !hasExplicitWidget;

                    if (isInlineObject && meta.properties) {
                        // Transform this Control into a Group containing its properties
                        const newGroup: ILayoutElement = {
                            type: "Group",
                            label: meta.ui?.label || bindingPath.split("/").pop(),
                            elements: []
                        };

                        // Add all child properties as controls
                        for (const childKey of Object.keys(meta.properties)) {
                            newGroup.elements!.push({
                                type: "Control",
                                scope: `${element.scope}/properties/${childKey}`
                            });
                        }

                        // Recursively expand this new group in case it contains further inline objects
                        newGroup.elements = this.expandElements(newGroup.elements!, rootSchema);
                        
                        expanded.push(newGroup);
                    } else {
                        // Scalar control, keep as is
                        expanded.push(element);
                    }
                } catch (e) {
                    // Scope not found, keep element to let normal error handling report it
                    expanded.push(element);
                }
            } else {
                expanded.push(element);
            }
        }

        return expanded;
    }
}
