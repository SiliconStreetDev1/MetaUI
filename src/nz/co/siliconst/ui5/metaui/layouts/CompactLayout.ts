/**
 * @file CompactLayout.ts
 * @description Generates a lightweight, dense VBox layout for use inside tight spaces like table cells.
 */

import VBox from "sap/m/VBox";
import Label from "sap/m/Label";
import Title from "sap/ui/core/Title";
import { IPropertyMetadata, ISchema, ILayoutElement } from "../interfaces/ISchema";
import { ILayoutManager } from "../interfaces/ILayoutManager";
import { Engine } from "../core/Engine";
import { SchemaNormalizer } from "../core/SchemaNormalizer";
import { Logger } from "../utils/Logger";
import Control from "sap/ui/core/Control";

/**
 * Layout Manager responsible for generating a dense, lightweight layout (no SimpleForm padding).
 * Ideal for rendering objects dynamically inside table cells or side-panels.
 * 
 * @namespace nz.co.siliconst.ui5.metaui.layouts
 * @public
 */
export class CompactLayout implements ILayoutManager {
    /**
     * Renders the JSON Schema properties into a dense VBox layout.
     * 
     * @param schema The active JSON schema subset.
     * @param modelName The bound UI5 model name.
     * @param engine The central orchestrator for delegating plugin generation.
     * @param onSubmit Optional submit hook.
     * @returns {Control} The VBox wrapper containing the generated compact form.
     */
    public render(schema: ISchema, modelName: string, engine: Engine, onSubmit?: () => void): Control {
        const container = new VBox({ renderType: "Bare" });
        container.addStyleClass("sapUiTinyMargin");

        if (!schema.uiLayout || !Array.isArray(schema.uiLayout)) {
            Logger.warn("[MetaUI] Missing 'uiLayout' array in schema. CompactLayout will not render any fields.");
            return container;
        }

        const tableElements: { scope: string, meta: IPropertyMetadata, label?: string }[] = [];

        // Recursively render layout elements
        const renderElement = (element: ILayoutElement) => {
            if (element.type === "Group") {
                if (element.label) {
                    const title = new sap.m.Title({ text: element.label, level: "H5" });
                    title.addStyleClass("sapUiTinyMarginTop sapUiTinyMarginBottom");
                    container.addItem(title);
                }
                
                if (element.elements && Array.isArray(element.elements)) {
                    element.elements.forEach(renderElement);
                }
            } else if (element.type === "Control") {
                if (!element.scope || !element.scope.startsWith("#/properties/")) {
                    Logger.error(`[MetaUI] Invalid scope '${element.scope}' in uiLayout Control.`, "", "CompactLayout");
                    return;
                }
                
                const { meta, bindingPath, propKey } = SchemaNormalizer.resolveScope(schema, element.scope);
                
                if (!meta) {
                    Logger.error(`[MetaUI] Property '${propKey}' not found in schema definitions.`, "", "CompactLayout");
                    return;
                }

                const isCollectionOfRecords = meta.items?.type === "object" || meta.items?.properties;
                const hasExplicitWidget = !!meta.ui?.widget;
                const isSubLayout = meta.type === "array" && isCollectionOfRecords && !hasExplicitWidget;

                if (isSubLayout) {
                    Logger.debug("[MetaUI CompactLayout]", `Routing property '${propKey}' to Table Sub-Layout.`, "CompactLayout");
                    tableElements.push({ scope: bindingPath, meta, label: element.label });
                } else {
                    Logger.debug("[MetaUI CompactLayout]", `Rendering scalar field '${bindingPath}'.`, "CompactLayout");
                    this._renderScalarField(container, element, bindingPath, meta, modelName, engine);
                }
            } else {
                Logger.warn(`[MetaUI] Unsupported layout element type '${element.type}'.`, "", "CompactLayout");
            }
        };

        // Render everything defined in the layout
        schema.uiLayout.forEach(renderElement);

        // Render array/table sub-layouts full width below the fields
        tableElements.forEach(field => {
            try {
                const subSchema = {
                    type: "array",
                    title: field.label || field.meta.ui?.label || field.scope,
                    items: field.meta.items || { type: "object", properties: {} },
                    uiLayout: field.meta.items?.uiLayout
                };
                
                const control = engine.generateLayout(subSchema as ISchema, modelName, `/${field.scope}`);
                if (control) {
                    control.addStyleClass("sapUiTinyMarginTop");
                    container.addItem(control);
                }
            } catch (error) {
                const msg = (error as Error).message;
                Logger.error(`[MetaUI] Failed to render array field ${field.scope}`, msg, "CompactLayout");
                Logger.showErrorPopup(`Failed to render array field '${field.scope}'.\n\nDetails: ${msg}`);
            }
        });

        return container;
    }

    /**
     * Synthesizes a primitive field into the layout.
     * @param container The VBox container.
     * @param element The layout element definition.
     * @param propKey The bound property key.
     * @param meta The inferred metadata schema.
     * @param modelName The UI5 data model name.
     * @param engine The core Engine instance.
     */
    private _renderScalarField(container: VBox, element: ILayoutElement, propKey: string, meta: IPropertyMetadata, modelName: string, engine: Engine): void {
        try {
            const labelText = element.label || meta.ui?.label || propKey;
            const label = new Label({
                text: labelText,
                required: meta.required
            });
            label.addStyleClass("sapUiTinyMarginTop");

            const effectiveMeta = { ...meta };
            if (element.widget) {
                effectiveMeta.ui = { ...meta.ui, widget: element.widget };
            }

            const control = engine.generateField(effectiveMeta, `/${propKey}`, modelName);
            control.addStyleClass("sapUiTinyMarginBottom");

            // Wrap label and field tightly
            const fieldBox = new VBox({ renderType: "Bare", items: [label, control] });
            container.addItem(fieldBox);
        } catch (error) {
            const msg = (error as Error).message;
            Logger.error(`[MetaUI] Failed to render field ${propKey}`, msg, "CompactLayout");
            Logger.showErrorPopup(`Failed to render field '${propKey}'.\n\nDetails: ${msg}`);
        }
    }
}
