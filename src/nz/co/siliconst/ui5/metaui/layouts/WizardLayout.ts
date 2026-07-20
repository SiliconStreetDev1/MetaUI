/**
 * @file WizardLayout.ts
 * @description Generates a fully responsive SAP Fiori Wizard layout.
 */

import Wizard from "sap/m/Wizard";
import WizardStep from "sap/m/WizardStep";
import SimpleForm from "sap/ui/layout/form/SimpleForm";
import Label from "sap/m/Label";
import VBox from "sap/m/VBox";
import { IPropertyMetadata, ISchema, ILayoutElement } from "../interfaces/ISchema";
import { ILayoutManager } from "../interfaces/ILayoutManager";
import { Engine } from "../core/Engine";
import { SchemaNormalizer } from "../core/SchemaNormalizer";
import { Logger } from "../utils/Logger";
import Control from "sap/ui/core/Control";

/**
 * Layout Manager responsible for generating a responsive SAP Fiori Wizard.
 * It segments the schema fields into discrete Wizard Steps based on `uiLayout` elements 
 * of type `Group` or `WizardStep`.
 * 
 * @namespace nz.co.siliconst.ui5.metaui.layouts
 * @public
 */
export class WizardLayout implements ILayoutManager {
    /**
     * Renders the JSON Schema properties into a paginated UI5 Wizard using uiLayout.
     * 
     * @param schema The active JSON schema object.
     * @param modelName The bound UI5 model name.
     * @param engine The central orchestrator for delegating plugin generation.
     * @param onSubmit Hook executed when the Wizard's native 'complete' event is fired.
     * @returns {Control} The generated sap.m.Wizard control.
     */
    public render(schema: ISchema, modelName: string, engine: Engine, onSubmit?: () => void): Control {
        const wizard = new Wizard({
            renderMode: "Page",
            showNextButton: true,
            complete: function() {
                if (onSubmit) onSubmit();
            }
        });

        if (!schema.uiLayout || !Array.isArray(schema.uiLayout)) {
            Logger.warn("[MetaUI] Missing 'uiLayout' array in wizard schema. Wizard will not render any steps.");
            return wizard;
        }

        schema.uiLayout.forEach((element: ILayoutElement) => {
            if (element.type === "Group" || element.type === "WizardStep") {
                const step = new WizardStep({
                    title: element.label || "Step",
                    validated: true // The PipelineManager handles global validation, wizard step validation can be local later
                });

                const form = new SimpleForm({
                    editable: true,
                    layout: "ResponsiveGridLayout",
                    labelSpanXL: 4, labelSpanL: 4, labelSpanM: 4, labelSpanS: 12,
                    adjustLabelSpan: false,
                    emptySpanXL: 0, emptySpanL: 0, emptySpanM: 0, emptySpanS: 0,
                    columnsXL: 1, columnsL: 1, columnsM: 1,
                    singleContainerFullSize: false
                });
                
                if (element.elements && Array.isArray(element.elements)) {
                    element.elements.forEach(childElement => {
                        this._renderElementInForm(form, childElement, schema, modelName, engine);
                    });
                }

                step.addContent(form);
                wizard.addStep(step);
            } else {
                Logger.warn(`[MetaUI] Top-level element '${element.type}' inside WizardLayout must be 'Group' or 'WizardStep'.`, "", "WizardLayout");
            }
        });

        return wizard;
    }

    /**
     * Synthesizes a field into the wizard step form.
     * @param form The SimpleForm belonging to the step.
     * @param element The layout element definition.
     * @param schema The schema reference.
     * @param modelName The UI5 data model name.
     * @param engine The core Engine instance.
     */
    private _renderElementInForm(form: SimpleForm, element: ILayoutElement, schema: ISchema, modelName: string, engine: Engine): void {
        if (element.type === "Control") {
            if (!element.scope || !element.scope.startsWith("#/properties/")) {
                Logger.error(`[MetaUI] Invalid scope '${element.scope}' in uiLayout Control.`, "", "WizardLayout");
                return;
            }
            
            const { meta, bindingPath, propKey } = SchemaNormalizer.resolveScope(schema, element.scope);
            
            if (!meta) {
                Logger.error(`[MetaUI] Property '${propKey}' not found in schema definitions.`, "", "WizardLayout");
                return;
            }

            try {
                const labelText = element.label || meta.ui?.label || propKey;
                const label = new Label({
                    text: labelText,
                    required: meta.required
                });

                const effectiveMeta = { ...meta };
                if (element.widget) {
                    effectiveMeta.ui = { ...meta.ui, widget: element.widget };
                }

                const control = engine.generateField(effectiveMeta, `/${bindingPath}`, modelName);

                if (effectiveMeta.ui?.fullWidth) {
                    sap.ui.require(["sap/ui/layout/GridData"], (GridData: any) => {
                        control.setLayoutData(new GridData({ span: "XL12 L12 M12 S12" }));
                    });
                }

                form.addContent(label);
                form.addContent(control);
            } catch (error) {
                Logger.error(`[MetaUI] Failed to render Wizard field ${propKey}`, (error as Error).message, "WizardLayout");
                form.addContent(new Label({ text: propKey }));
            }
        } else {
            Logger.warn(`[MetaUI] Nested groups within Wizard steps are not fully supported in SimpleForm yet.`, "", "WizardLayout");
        }
    }
}
