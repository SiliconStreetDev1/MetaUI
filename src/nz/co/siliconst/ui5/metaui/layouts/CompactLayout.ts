/**
 * @file CompactLayout.ts
 * @description Generates a lightweight, dense VBox layout for use inside tight spaces like table cells.
 */

import VBox from "sap/m/VBox";
import HBox from "sap/m/HBox";
import FlexItemData from "sap/m/FlexItemData";
import MTitle from "sap/m/Title";
import { TitleLevel } from "sap/ui/core/library";
import { FlexRendertype } from "sap/m/library";
import { IPropertyMetadata, ISchema, ILayoutElement } from "../interfaces/ISchema";
import { ILayoutManager } from "../interfaces/ILayoutManager";
import { Engine } from "../core/Engine";
import { ControlDirectiveUtil } from "../utils/ControlDirectiveUtil";
import { Logger } from "../utils/Logger";
import Control from "sap/ui/core/Control";
import { ArraySubSchemaFactory, LayoutElementWalker, LayoutFieldFactory } from "./LayoutElementWalker";

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
     * @param _onSubmit Optional submit hook.
     * @returns {Control} The VBox wrapper containing the generated compact form.
     */
    public render(schema: ISchema, modelName: string, engine: Engine, _onSubmit?: () => void): Control {
        const container = new VBox({ renderType: FlexRendertype.Bare });
        container.addStyleClass("sapUiTinyMargin");

        if (!schema.uiLayout || !Array.isArray(schema.uiLayout)) {
            Logger.warn("[MetaUI] Missing 'uiLayout' array in schema. CompactLayout will not render any fields.");
            return container;
        }

        const boxStack: (VBox | HBox)[] = [container];
        const currentBox = (): VBox | HBox => boxStack[boxStack.length - 1];

        LayoutElementWalker.walk(
            schema.uiLayout,
            schema,
            engine,
            {
                onSectionHeader: (label: string) => {
                    const title = new MTitle({ text: label, level: TitleLevel.H5 });
                    title.addStyleClass("sapUiTinyMarginTop sapUiTinyMarginBottom");
                    currentBox().addItem(title);
                },
                onEnterContainer: (element: ILayoutElement) => {
                    const parentBox = currentBox();
                    if (element.type === "VerticalLayout") {
                        const colBox = new VBox({
                            renderType: FlexRendertype.Bare,
                            width: "100%",
                            layoutData:
                                parentBox.getMetadata().getName() === "sap.m.HBox"
                                    ? new FlexItemData({ growFactor: 1, baseSize: "0%" })
                                    : undefined
                        });
                        parentBox.addItem(colBox);
                        boxStack.push(colBox);
                    } else if (element.type === "HorizontalLayout") {
                        const rowBox = new HBox({ renderType: FlexRendertype.Bare, width: "100%" });
                        parentBox.addItem(rowBox);
                        boxStack.push(rowBox);
                    }
                },
                onExitContainer: (element: ILayoutElement) => {
                    if (element.type === "VerticalLayout" || element.type === "HorizontalLayout") {
                        boxStack.pop();
                    }
                },
                onTableSubLayout: (element: ILayoutElement, bindingPath: string, _propKey: string, meta: IPropertyMetadata) => {
                    this._renderArrayTable(currentBox(), element, bindingPath, meta, modelName, engine);
                },
                onScalarField: (element: ILayoutElement, bindingPath: string, meta: IPropertyMetadata) => {
                    this._renderScalarField(currentBox(), element, bindingPath, meta, modelName, engine);
                }
            },
            "CompactLayout"
        );

        return container;
    }

    /**
     * Synthesizes an inline array table into the container that is open at the element's declared position.
     * Deferring these to the root container after the walk dropped every inline table out of its row and out
     * of its declared order, which `FormLayout` never did.
     *
     * @param container The VBox or HBox container currently open in the walk.
     * @param element The layout element definition.
     * @param bindingPath The resolved relative binding path of the array property.
     * @param meta The array property metadata.
     * @param modelName The UI5 data model name.
     * @param engine The core Engine instance.
     */
    private _renderArrayTable(
        container: VBox | HBox,
        element: ILayoutElement,
        bindingPath: string,
        meta: IPropertyMetadata,
        modelName: string,
        engine: Engine
    ): void {
        try {
            const subSchema = ArraySubSchemaFactory.build(element.label, bindingPath, meta);
            const control = engine.generateLayout(subSchema, modelName, `/${bindingPath}`);
            if (!control) {
                return;
            }
            control.addStyleClass("sapUiTinyMarginTop");
            if (container.getMetadata().getName() === "sap.m.HBox") {
                control.setLayoutData(new FlexItemData({ growFactor: 1, baseSize: "0%" }));
                control.addStyleClass("sapUiTinyMarginEnd");
            }
            container.addItem(control);
        } catch (error) {
            engine.hasPartialRenderingErrors = true;
            const msg = (error as Error).message;
            Logger.error(`[MetaUI] Failed to render array field ${bindingPath}`, msg, "CompactLayout");
            Logger.showErrorPopup(`Failed to render array field '${bindingPath}'.\n\nDetails: ${msg}`);
        }
    }

    /**
     * Synthesizes a primitive field into the layout.
     *
     * @param container The VBox or HBox container.
     * @param element The layout element definition.
     * @param propKey The bound property key.
     * @param meta The inferred metadata schema.
     * @param modelName The UI5 data model name.
     * @param engine The core Engine instance.
     */
    private _renderScalarField(
        container: VBox | HBox,
        element: ILayoutElement,
        propKey: string,
        meta: IPropertyMetadata,
        modelName: string,
        engine: Engine
    ): void {
        try {
            const { label, control, effectiveMeta, absolutePath } = LayoutFieldFactory.createLabelledField(
                element,
                propKey,
                meta,
                modelName,
                engine
            );
            label.addStyleClass("sapUiTinyMarginTop");
            control.addStyleClass("sapUiTinyMarginBottom");

            const fieldBox = new VBox({ renderType: FlexRendertype.Bare, items: [label, control] });
            fieldBox.data("metauiFieldWrapper", true);
            if (effectiveMeta.ui?.visible === false || effectiveMeta.ui?.visibleOn) {
                ControlDirectiveUtil.applyCommonDirectives(
                    fieldBox,
                    fieldBox,
                    { type: "string", ui: { visible: effectiveMeta.ui.visible, visibleOn: effectiveMeta.ui.visibleOn } },
                    absolutePath,
                    true,
                    modelName
                );
            }
            if (container.getMetadata().getName() === "sap.m.HBox") {
                fieldBox.setLayoutData(new FlexItemData({ growFactor: 1, baseSize: "0%" }));
                fieldBox.addStyleClass("sapUiTinyMarginEnd");
            }
            container.addItem(fieldBox);
        } catch (error) {
            engine.hasPartialRenderingErrors = true;
            const msg = (error as Error).message;
            Logger.error(`[MetaUI] Failed to render field ${propKey}`, msg, "CompactLayout");
            Logger.showErrorPopup(`Failed to render field '${propKey}'.\n\nDetails: ${msg}`);
        }
    }
}
