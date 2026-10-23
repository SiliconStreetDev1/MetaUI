/**
 * @file DefaultLayoutGenerator.ts
 * @description Automatically synthesizes a default UI layout for schemas that lack an explicit mapping.
 */

import { ISchema, ILayoutElement, IPropertyMetadata } from "../interfaces/ISchema";
import { SCHEMA_TYPE, LAYOUT_STRATEGY } from "../constants/MetaUIConstants";
import { Logger } from "../utils/Logger";

/**
 * Encapsulates the logic to dynamically build a safe, default layout orchestration
 * when the developer or backend fails to provide an explicit `uiLayout`.
 *
 * By elevating this into a dedicated utility, we avoid polluting layout engines
 * (like FormLayout or TableLayout) with structural inference responsibilities.
 *
 * @namespace nz.co.siliconst.ui5.metaui.core
 * @internal
 */
export class DefaultLayoutGenerator {
    /**
     * Resolves the layout strategy for a schema: the explicit `layoutStrategy` if the author set one,
     * otherwise `table` for an array schema and `form` for everything else.
     *
     * This default previously appeared verbatim in three places (`Engine.generate`,
     * `Engine.generateLayout`, `PluginRegistry.getPathsToLoad`), so the lazy-loader could
     * preload one strategy's module while the renderer picked another. The `[LAYOUT_STRATEGY_DEFAULT]`
     * gate in `scripts/run-tests.js` forbids the expression from reappearing inline.
     *
     * @param schema The normalized schema being rendered or scanned.
     * @returns {string} The layout strategy key to look up in the `PluginRegistry`.
     */
    public static resolveLayoutStrategy(schema: ISchema): string {
        return schema.layoutStrategy || (schema.type === SCHEMA_TYPE.ARRAY ? LAYOUT_STRATEGY.TABLE : LAYOUT_STRATEGY.FORM);
    }

    /**
     * Inspects a schema. If it has properties but no `uiLayout`, it synthesizes a default.
     *
     * @param schema The ISchema dictionary.
     * @returns {boolean} True if a layout was synthesized, false if it already existed or was empty.
     */
    public static ensureLayout(schema: ISchema): boolean {
        if (schema.uiLayout && Array.isArray(schema.uiLayout) && schema.uiLayout.length > 0) {
            return false;
        }

        const isArray = schema.type === "array";
        const props = isArray ? schema.items?.properties : schema.properties;

        if (!props || Object.keys(props).length === 0) {
            return false;
        }

        const elements = this.generateElementsFromProperties(props, "#/properties");

        if (isArray) {
            schema.uiLayout = elements.filter((e) => e.type === "Control");
        } else {
            schema.uiLayout = [
                {
                    type: "Group",
                    label: undefined,
                    elements
                }
            ];
        }

        return true;
    }

    /**
     * Traverses property metadata to synthesize generic Control layout definitions.
     *
     * @param props The properties object from the schema.
     * @param basePath The absolute JSON scope path to prefix bindings.
     * @returns {ILayoutElement[]} An array of generated layout element descriptors.
     */
    private static generateElementsFromProperties(
        props: Record<string, IPropertyMetadata>,
        basePath: string
    ): ILayoutElement[] {
        const elements: ILayoutElement[] = [];
        for (const key of Object.keys(props)) {
            try {
                const currentPath = `${basePath}/${key}`;
                elements.push({
                    type: "Control",
                    scope: currentPath
                });
            } catch (error) {
                const msg = `[MetaUI] DefaultLayoutGenerator failed to synthesize property '${key}': ${(error as Error).message}`;
                Logger.error(msg);
                throw new Error(msg);
            }
        }
        return elements;
    }
}
