/**
 * @file DefaultLayoutGenerator.ts
 * @description Automatically synthesizes a default UI layout for schemas that lack an explicit mapping.
 */

import { ISchema, ILayoutElement } from "../interfaces/ISchema";

/**
 * Encapsulates the logic to dynamically build a safe, default layout orchestration
 * when the developer or backend fails to provide an explicit `uiLayout`.
 * 
 * By elevating this into a dedicated utility, we avoid polluting layout engines
 * (like FormLayout or TableLayout) with structural inference responsibilities.
 * 
 * @namespace nz.co.siliconst.ui5.metaui.core
 * @public
 */
export class DefaultLayoutGenerator {
    /**
     * Inspects a schema. If it has properties but no `uiLayout`, it synthesizes a default.
     * @param schema The ISchema dictionary.
     * @returns boolean True if a layout was synthesized, false if it already existed or was empty.
     */
    public static ensureLayout(schema: ISchema): boolean {
        // If it already has a valid array, do nothing
        if (schema.uiLayout && Array.isArray(schema.uiLayout) && schema.uiLayout.length > 0) {
            return false;
        }

        const isArray = schema.type === "array";
        const props = isArray ? schema.items?.properties : schema.properties;

        if (!props || Object.keys(props).length === 0) {
            return false; // Nothing to map
        }

        const elements: ILayoutElement[] = [];

        for (const key of Object.keys(props)) {
            elements.push({
                type: "Control",
                scope: `#/properties/${key}`
            });
        }

        if (isArray) {
            // Table layouts expect an array of flat Controls at the root uiLayout
            schema.uiLayout = elements;
        } else {
            // Form layouts expect a grouped structure
            schema.uiLayout = [
                {
                    type: "Group",
                    label: schema.title,
                    elements: elements
                }
            ];
        }

        return true;
    }
}
