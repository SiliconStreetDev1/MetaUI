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
import { PluginRegistry } from "../core/PluginRegistry";
import Control from "sap/ui/core/Control";
import { IPlugin } from "../interfaces/IPlugin";
import { IPropertyMetadata } from "../interfaces/ISchema";

export class TableLayout {
    /**
     * Builds a responsive Table, dynamically calculating column priorities.
     */
    public static build(tableMeta: IPropertyMetadata, bindingPath: string = "meta>/", tableTitle: string = "Table", trackPlugin?: (plugin: IPlugin) => void): Table {
        if (!tableMeta.properties) {
            throw new Error("[MetaUI] Table requires an items schema with properties.");
        }

        const parts = bindingPath.split(">");
        const actualModelName = parts.length > 1 ? parts[0] : undefined;
        const actualPath = parts.length > 1 ? parts[1] : bindingPath;
        // e.g. "meta>/Contacts" -> actualModelName = "meta", actualPath = "/Contacts"

        const table = new Table({
            headerToolbar: new Toolbar({
                content: [
                    new Title({ text: tableTitle }),
                    new ToolbarSpacer(),
                    new Button({
                        text: "Add Row",
                        icon: "sap-icon://add",
                        press: (oEvent: any) => {
                            const btn = oEvent.getSource();
                            const tbl = btn.getParent().getParent() as Table;
                            const model = tbl.getModel(actualModelName) as JSONModel;
                            const info = tbl.getBindingInfo("items");
                            if (!info || !info.path) return;
                            
                            const data = model.getProperty(info.path) || [];
                            data.push({}); // append empty row
                            model.setProperty(info.path, data);
                        }
                    })
                ]
            }),
            fixedLayout: false,
            mode: "Delete",
            delete: (oEvent: any) => {
                const item = oEvent.getParameter("listItem");
                const path = item.getBindingContext(actualModelName).getPath(); 
                const model = item.getModel(actualModelName) as JSONModel;
                
                const splitPaths = path.split("/");
                const index = parseInt(splitPaths.pop() || "0", 10);
                let arrayPath = splitPaths.join("/");
                if (arrayPath === "") arrayPath = "/";
                
                const data = model.getProperty(arrayPath);
                data.splice(index, 1);
                model.setProperty(arrayPath, data);
            }
        });

        const templateCells: Control[] = [];
        const registry = PluginRegistry.getInstance();
        const props = tableMeta.properties;

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

                const plugin = registry.getPlugin(fieldMeta.type, fieldMeta.ui?.widget);
                if (trackPlugin) trackPlugin(plugin);
                const control = plugin.render(fieldMeta, key, actualModelName); // No trailing slash for relative bindings
                templateCells.push(control);
            } catch (error) {
                sap.ui.require(["sap/base/Log"], (Log: any) => {
                    if (Log) Log.error(`[MetaUI] Failed to render column ${key}`, (error as Error).message, "TableLayout");
                });
                
                // Add an empty text control as a fallback so the table columns match the cells array length
                templateCells.push(new Text({ text: "Error" }));
            }
        });

        const rowTemplate = new ColumnListItem({
            cells: templateCells
        });

        // V2 Fix: Actually bind the items to the table!
        table.bindItems({
            path: actualPath,
            model: actualModelName,
            template: rowTemplate,
            templateShareable: false
        });

        return table;
    }
}
