/**
 * @file TableLayout.ts
 * @description Generates a responsive SAP Fiori Table layout for v2 schema.
 */

import Table from "sap/m/Table";
import Column from "sap/m/Column";
import Text from "sap/m/Text";
import ColumnListItem from "sap/m/ColumnListItem";
import Toolbar from "sap/m/Toolbar";
import Title from "sap/m/Title";
import ToolbarSpacer from "sap/m/ToolbarSpacer";
import Button from "sap/m/Button";
import JSONModel from "sap/ui/model/json/JSONModel";
import Control from "sap/ui/core/Control";
import { IPropertyMetadata, ISchema, ILayoutElement } from "../interfaces/ISchema";
import { ILayoutManager } from "../interfaces/ILayoutManager";
import { Engine } from "../core/Engine";
import { Logger } from "../utils/Logger";

/**
 * Layout Manager responsible for generating a responsive SAP Fiori Table.
 * It is automatically utilized by the Engine when the schema root or property is of type 'array'.
 * Includes built-in support for adding and deleting rows via dynamic data binding manipulation.
 * 
 * @namespace nz.co.siliconst.ui5.metaui.layouts
 * @public
 */
export class TableLayout implements ILayoutManager {
    /**
     * Renders the JSON Schema array properties into a UI5 Table.
     * 
     * @param schema The active JSON schema array definition.
     * @param modelName The UI5 JSONModel name used for data binding.
     * @param engine The central orchestrator for delegating column plugin generation.
     * @param onSubmit Optional submit hook.
     * @param bindingPath The JSON path representing the array within the payload.
     * @returns {Control} The generated sap.m.Table control.
     * @throws {Error} If the provided schema is not of type 'array'.
     */
    public render(schema: ISchema, modelName: string, engine: Engine, onSubmit?: () => void, bindingPath: string = "/"): Control {
        if (schema.type !== "array" || !schema.items || !schema.items.properties) {
            throw new Error("[MetaUI] TableLayout requires an array schema with items.properties.");
        }

        const tableTitle = schema.title || "Table";
        const actualModelName = modelName;
        const actualPath = bindingPath;

        const table = new Table({
            headerToolbar: new Toolbar({
                content: [
                    new Title({ text: tableTitle }),
                    new ToolbarSpacer(),
                    ...(engine.isDisplayMode ? [] : [
                        new Button({
                            text: "Add Row",
                            icon: "sap-icon://add",
                            press: (oEvent: sap.ui.base.Event) => {
                                const btn = oEvent.getSource();
                                const tbl = btn.getParent().getParent() as Table;
                                const model = tbl.getModel(actualModelName) as JSONModel;
                                const info = tbl.getBindingInfo("items");
                                if (!info || !info.path) return;

                                const rawData = model.getProperty(info.path);
                                const data = Array.isArray(rawData) ? rawData : [];
                                const newData = [...data, {}];
                                model.setProperty(info.path, newData);
                            }
                        })
                    ])
                ]
            }),
            fixedLayout: false,
            mode: engine.isDisplayMode ? "None" : "Delete",
            delete: (oEvent: sap.ui.base.Event) => {
                const item = oEvent.getParameter("listItem");
                const path = item.getBindingContext(actualModelName).getPath();
                const model = item.getModel(actualModelName) as JSONModel;

                const splitPaths = path.split("/");
                const index = parseInt(splitPaths.pop() || "0", 10);
                let arrayPath = splitPaths.join("/");
                if (arrayPath === "") arrayPath = "/";

                const rawData = model.getProperty(arrayPath);
                const data = Array.isArray(rawData) ? rawData : [];
                const newData = [...data];
                newData.splice(index, 1);
                model.setProperty(arrayPath, newData);
            }
        });

        const templateCells: Control[] = [];
        const props = schema.items.properties;
        const layoutElements = schema.uiLayout;

        if (layoutElements && Array.isArray(layoutElements)) {
            // Only render columns defined in uiLayout
            layoutElements.forEach((element: ILayoutElement) => {
                if (element.type === "Control") {
                    if (!element.scope || !element.scope.startsWith("#/properties/")) {
                        Logger.error(`[MetaUI] Invalid scope '${element.scope}' in uiLayout Control for Table.`, "", "TableLayout");
                        return;
                    }

                    const propKey = element.scope.replace("#/properties/", "");
                    const fieldMeta = props[propKey];

                    if (!fieldMeta) {
                        Logger.error(`[MetaUI] Property '${propKey}' not found in schema definitions for Table.`, "", "TableLayout");
                        return;
                    }

                    try {
                        const isKey = !!fieldMeta.ui?.isKey;

                        const column = new Column({
                            header: new Text({ text: element.label || fieldMeta.ui?.label || propKey }),
                            demandPopin: !isKey,
                            minScreenWidth: isKey ? "" : "Tablet",
                            popinDisplay: "Inline"
                        });
                        table.addColumn(column);

                        // Override widget if specified in the layout element
                        const effectiveMeta = { ...fieldMeta };
                        if (element.widget) {
                            effectiveMeta.ui = { ...fieldMeta.ui, widget: element.widget };
                        }

                        // Use engine to generate fields natively and track validation
                        const control = engine.generateField(effectiveMeta, propKey, actualModelName || "meta", true);
                        templateCells.push(control);
                    } catch (error) {
                        const msg = (error as Error).message;
                        Logger.error(`[MetaUI] Failed to render column ${propKey}`, msg, "TableLayout");
                        Logger.showErrorPopup(`Failed to render table column '${propKey}'.\n\nDetails: ${msg}`);
                        templateCells.push(new Text({ text: "Error" }));
                    }
                } else {
                    Logger.warn(`[MetaUI] Unsupported layout element type '${element.type}' inside TableLayout. Only 'Control' is supported for columns.`, "", "TableLayout");
                }
            });
        } else {
            Logger.debug("[MetaUI TableLayout]", "No uiLayout provided. Falling back to rendering all properties as columns.", "TableLayout");
            // Fallback: If no uiLayout is provided, render all properties as columns
            Object.keys(props).forEach((key) => {
                try {
                    const fieldMeta = props[key];
                    const isKey = !!fieldMeta.ui?.isKey;

                    const column = new Column({
                        header: new Text({ text: fieldMeta.ui?.label || key }),
                        demandPopin: !isKey,
                        minScreenWidth: isKey ? "" : "Tablet",
                        popinDisplay: "Inline"
                    });
                    table.addColumn(column);

                    const control = engine.generateField(fieldMeta, key, actualModelName || "meta", true);
                    templateCells.push(control);
                } catch (error) {
                    const msg = (error as Error).message;
                    Logger.error(`[MetaUI] Failed to render fallback column ${key}`, msg, "TableLayout");
                    Logger.showErrorPopup(`Failed to render fallback table column '${key}'.\n\nDetails: ${msg}`);
                    templateCells.push(new Text({ text: "Error" }));
                }
            });
        }



        const rowTemplate = new ColumnListItem({
            cells: templateCells
        });

        table.bindItems({
            path: actualPath,
            model: actualModelName,
            template: rowTemplate,
            templateShareable: false
        });

        return table;
    }
}
