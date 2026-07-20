/**
 * @file FormLayout.ts
 * @description Generates a fully responsive SAP Fiori Form layout (SimpleForm).
 */

import SimpleForm from "sap/ui/layout/form/SimpleForm";
import Label from "sap/m/Label";
import Title from "sap/ui/core/Title";
import VBox from "sap/m/VBox";
import { IPropertyMetadata, ISchema, ILayoutElement } from "../interfaces/ISchema";
import { ILayoutManager } from "../interfaces/ILayoutManager";
import { Engine } from "../core/Engine";
import { SchemaNormalizer } from "../core/SchemaNormalizer";
import { Logger } from "../utils/Logger";
import Control from "sap/ui/core/Control";

/**
 * Layout Manager responsible for generating a fully responsive SAP Fiori SimpleForm.
 * It traverses the `uiLayout` tree defined in the schema to build the form groups and fields,
 * completely separating visual orchestration from data modeling.
 * @namespace nz.co.siliconst.ui5.metaui.layouts
 * @public
 */
export class FormLayout implements ILayoutManager {
    /**
     * Renders the JSON Schema properties into a UI5 SimpleForm using the uiLayout definitions.
     * 
     * @param schema The active JSON schema subset.
     * @param modelName The bound UI5 model name.
     * @param engine The central orchestrator for delegating plugin generation.
     * @param onSubmit Optional submit hook.
     * @returns {Control} The VBox wrapper containing the generated form.
     */
    public render(schema: ISchema, modelName: string, engine: Engine, onSubmit?: () => void): Control {
        const container = new VBox({ renderType: "Bare" });
        const form = new SimpleForm({
            editable: true,
            title: schema.title,
            layout: "ResponsiveGridLayout",
            labelSpanXL: 4, labelSpanL: 4, labelSpanM: 4, labelSpanS: 12,
            adjustLabelSpan: false,
            emptySpanXL: 0, emptySpanL: 0, emptySpanM: 0, emptySpanS: 0,
            columnsXL: 1, columnsL: 1, columnsM: 1,
            singleContainerFullSize: false
        });

        if (!schema.uiLayout || !Array.isArray(schema.uiLayout)) {
            Logger.warn("[MetaUI] Missing 'uiLayout' array in schema. Form will not render any fields.");
            container.addItem(form);
            return container;
        }

        const tableElements: { scope: string, meta: IPropertyMetadata, label?: string }[] = [];
        let hasFormFields = false;

        // Recursively render layout elements
        const renderElement = (element: ILayoutElement) => {
            if (element.type === "Group") {
                if (element.label) {
                    form.addContent(new Title({ text: element.label }));
                }
                
                if (element.elements && Array.isArray(element.elements)) {
                    element.elements.forEach(renderElement);
                }
            } else if (element.type === "Control") {
                if (!element.scope || !element.scope.startsWith("#/properties/")) {
                    Logger.error(`[MetaUI] Invalid scope '${element.scope}' in uiLayout Control.`, "", "FormLayout");
                    return;
                }
                
                const { meta, bindingPath, propKey } = SchemaNormalizer.resolveScope(schema, element.scope);
                
                if (!meta) {
                    Logger.error(`[MetaUI] Property '${propKey}' not found in schema definitions.`, "", "FormLayout");
                    return;
                }

                // Architectural Boundary: Separate Field Controls (Plugins) from Sub-Layouts (LayoutManagers)
                // A property is delegated to a Sub-Layout Manager (Table) ONLY if it represents a collection of complex objects.
                // Collections of primitives, or explicitly assigned widgets (like multiSelect), remain in the Form as Field Plugins.
                const isCollectionOfRecords = meta.items?.type === "object" || meta.items?.properties;
                const hasExplicitWidget = !!meta.ui?.widget;
                const isSubLayout = meta.type === "array" && isCollectionOfRecords && !hasExplicitWidget;

                if (isSubLayout) {
                    Logger.debug("[MetaUI FormLayout]", `Routing property '${propKey}' to Table Sub-Layout.`, "FormLayout");
                    tableElements.push({ scope: bindingPath, meta, label: element.label });
                } else {
                    hasFormFields = true;
                    Logger.debug("[MetaUI FormLayout]", `Rendering scalar field '${bindingPath}'.`, "FormLayout");
                    this._renderScalarField(form, element, bindingPath, meta, modelName, engine);
                }
            } else {
                Logger.warn(`[MetaUI] Unsupported layout element type '${element.type}'.`, "", "FormLayout");
            }
        };

        // Render everything defined in the layout
        schema.uiLayout.forEach(renderElement);

        if (hasFormFields) {
            container.addItem(form);
        }

        // Render array/table sub-layouts full width below the form
        tableElements.forEach(field => {
            try {
                const subSchema = {
                    type: "array",
                    title: field.label || field.meta.ui?.label || field.scope,
                    items: field.meta.items || { type: "object", properties: {} },
                    uiLayout: field.meta.items?.uiLayout // Pass down sub-layout if available
                };
                
                const control = engine.generateLayout(subSchema as ISchema, modelName, `/${field.scope}`);
                if (control) {
                    control.addStyleClass("sapUiSmallMarginTop");
                    container.addItem(control);
                }
            } catch (error) {
                const msg = (error as Error).message;
                Logger.error(`[MetaUI] Failed to render array field ${field.scope}`, msg, "FormLayout");
                Logger.showErrorPopup(`Failed to render array field '${field.scope}'.\n\nDetails: ${msg}`);
            }
        });

        return container;
    }

    private _renderScalarField(form: SimpleForm, element: ILayoutElement, propKey: string, meta: IPropertyMetadata, modelName: string, engine: Engine): void {
        try {
            const labelText = element.label || meta.ui?.label || propKey;
            const label = new Label({
                text: labelText,
                required: meta.required
            });

            // Override widget if specified in the layout element
            const effectiveMeta = { ...meta };
            if (element.widget) {
                effectiveMeta.ui = { ...meta.ui, widget: element.widget };
            }

            const control = engine.generateField(effectiveMeta, `/${propKey}`, modelName);

            if (effectiveMeta.ui?.fullWidth) {
                sap.ui.require(["sap/ui/layout/GridData"], (GridData: any) => {
                    control.setLayoutData(new GridData({ span: "XL12 L12 M12 S12" }));
                });
            }

            form.addContent(label);
            form.addContent(control);
        } catch (error) {
            const msg = (error as Error).message;
            Logger.error(`[MetaUI] Failed to render field ${propKey}`, msg, "FormLayout");
            Logger.showErrorPopup(`Failed to render field '${propKey}'.\n\nDetails: ${msg}`);
        }
    }
}
