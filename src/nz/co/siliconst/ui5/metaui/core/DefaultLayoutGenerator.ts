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

        const elements = this.generateElementsFromProperties(props, "#/properties");

        if (isArray) {
            // Table layouts expect an array of flat Controls at the root uiLayout
            // For tables, we flatten the deep elements or just render the root level
            // To keep it safe, we'll just use the flat elements for tables
            schema.uiLayout = elements.filter(e => e.type === "Control");
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

    /**
     * Recursively traverses property metadata to synthesize generic Group and Control layout definitions.
     * @param props The properties object from the schema.
     * @param basePath The absolute JSON scope path to prefix bindings.
     * @returns An array of generated layout element descriptors.
     */
    private static generateElementsFromProperties(props: Record<string, import("../interfaces/ISchema").IPropertyMetadata>, basePath: string): ILayoutElement[] {
        const elements: ILayoutElement[] = [];
        for (const key of Object.keys(props)) {
            try {
                const prop = props[key];
                const currentPath = `${basePath}/${key}`;

                if (prop.type === "object" && prop.properties) {
                    elements.push({
                        type: "Group",
                        label: prop.ui?.label || key,
                        elements: this.generateElementsFromProperties(prop.properties, `${currentPath}/properties`)
                    });
                } else {
                    elements.push({
                        type: "Control",
                        scope: currentPath
                    });
                }
            } catch (error) {
                // If a single synthesized property fails, swallow it to prevent the entire synthesized form from crashing.
                import("../utils/Logger").then(({ Logger }) => {
                    Logger.error(`[MetaUI] DefaultLayoutGenerator failed to synthesize property '${key}'`, (error as Error).message);
                });
            }
        }
        return elements;
    }
}
