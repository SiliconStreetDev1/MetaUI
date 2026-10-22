/**
 * @file FormLayout.ts
 * @description Generates a fully responsive SAP Fiori Form layout (SimpleForm).
 */

import VBox from "sap/m/VBox";
import { FlexRendertype } from "sap/m/library";
import { ISchema } from "../interfaces/ISchema";
import { ILayoutManager } from "../interfaces/ILayoutManager";
import { Engine } from "../core/Engine";
import { Logger } from "../utils/Logger";
import Control from "sap/ui/core/Control";
import { LayoutElementWalker, LayoutFieldFactory } from "./LayoutElementWalker";

/**
 * Layout Manager responsible for generating a fully responsive SAP Fiori SimpleForm.
 * It traverses the `uiLayout` tree defined in the schema to build the form groups and fields,
 * completely separating visual orchestration from data modeling.
 *
 * @namespace nz.co.siliconst.ui5.metaui.layouts
 * @public
 */
export class FormLayout implements ILayoutManager {
    /**
     * Renders the JSON Schema properties into a UI5 SimpleForm using the `uiLayout` definitions.
     *
     * @param schema The active JSON schema subset.
     * @param modelName The bound UI5 model name.
     * @param engine The central orchestrator for delegating plugin generation.
     * @param _onSubmit Optional submit hook.
     * @returns {Control} The VBox wrapper containing the generated form.
     */
    public render(schema: ISchema, modelName: string, engine: Engine, _onSubmit?: () => void): Control {
        const container = new VBox({ renderType: FlexRendertype.Bare });
        const form = LayoutFieldFactory.createSimpleForm(schema.title, schema.ui);

        if (!schema.uiLayout || !Array.isArray(schema.uiLayout)) {
            Logger.warn("[MetaUI] Missing 'uiLayout' array in schema. Form will not render any fields.");
            container.addItem(form);
            return container;
        }

        let hasFormFields = false;
        LayoutElementWalker.walk(
            schema.uiLayout,
            schema,
            engine,
            LayoutElementWalker.createSimpleFormSink(form, schema, modelName, engine, "FormLayout", undefined, () => {
                hasFormFields = true;
            }),
            "FormLayout"
        );

        if (hasFormFields) {
            container.addItem(form);
        } else {
            form.destroy();
        }

        return container;
    }
}
