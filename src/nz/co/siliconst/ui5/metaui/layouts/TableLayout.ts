/**
 * @file TableLayout.ts
 * @description Generates a responsive SAP Fiori Table layout.
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
import { ITableMetadata, IFieldMetadata } from "../interfaces/ISchema";
import { PluginRegistry } from "../core/PluginRegistry";
import Control from "sap/ui/core/Control";

/**
 * Utility class strictly for constructing sap.m.Table structures with dynamic pop-in vectors.
 */
export class TableLayout {
    /**
     * Builds a responsive Table, dynamically calculating column priorities.
     * @param tableMeta The metadata defining the table's columns and nested fields.
     * @returns A fully constructed sap.m.Table ready to be bound to a list array.
     */
    public static build(tableMeta: ITableMetadata): Table {
        const table = new Table({
            headerToolbar: new Toolbar({
                content: [
                    new Title({ text: tableMeta.label || tableMeta.tableName }),
                    new ToolbarSpacer(),
                    new Button({
                        text: "Add Row",
                        icon: "sap-icon://add",
                        press: (oEvent: any) => {
                            const btn = oEvent.getSource();
                            const tbl = btn.getParent().getParent() as Table;
                            const model = tbl.getModel("meta") as JSONModel;
                            const path = `/${tableMeta.tableName}`;
                            const data = model.getProperty(path) || [];
                            data.push({}); // append empty row
                            model.setProperty(path, data);
                        }
                    })
                ]
            }),
            fixedLayout: false, // Allows native UI5 column width calculations
            mode: "Delete",
            delete: (oEvent: any) => {
                const item = oEvent.getParameter("listItem");
                const path = item.getBindingContext("meta").getPath(); // e.g. "/Contacts/0"
                const model = item.getModel("meta") as JSONModel;
                
                const parts = path.split("/");
                const index = parseInt(parts.pop() || "0", 10);
                const arrayPath = parts.join("/");
                
                const data = model.getProperty(arrayPath);
                data.splice(index, 1);
                model.setProperty(arrayPath, data);
            }
        });

        const templateCells: Control[] = [];
        const registry = PluginRegistry.getInstance();

        tableMeta.fields.forEach((field: IFieldMetadata) => {
            // Build the column header
            const column = new Column({
                header: new Text({ text: field.label }),
                // Fiori UX: High priority for primary keys so they don't pop-in too early
                demandPopin: !field.isKey, 
                minScreenWidth: field.isKey ? "" : "Tablet",
                popinDisplay: "Inline"
            });
            table.addColumn(column);

            // Instantiate the cell template (plugin)
            const plugin = registry.getPlugin(field.type);
            
            // In table lists, the binding path is relative to the row's context context (e.g. "{fieldName}")
            const control = plugin.render(field, field.fieldName);
            templateCells.push(control);
        });

        // Create the row template and bind it to the table via the tableName array path
        const rowTemplate = new ColumnListItem({
            cells: templateCells
        });

        // The absolute binding path from the StateManager for this table (using the named model 'meta')
        table.bindItems({
            path: `meta>/${tableMeta.tableName}`,
            template: rowTemplate,
            templateShareable: false
        });

        return table;
    }
}
