/**
 * @file TableLayout.ts
 * @description Generates a responsive SAP Fiori Table layout for v2 array schemas.
 */

import Table from "sap/m/Table";
import Column from "sap/m/Column";
import Label from "sap/m/Label";
import Text from "sap/m/Text";
import ColumnListItem from "sap/m/ColumnListItem";
import Toolbar from "sap/m/Toolbar";
import Title from "sap/m/Title";
import ToolbarSpacer from "sap/m/ToolbarSpacer";
import Button from "sap/m/Button";
import Control from "sap/ui/core/Control";
import Event from "sap/ui/base/Event";
import { ListMode, PopinDisplay } from "sap/m/library";
import { IPropertyMetadata, ISchema, ILayoutElement } from "../interfaces/ISchema";
import { ILayoutManager } from "../interfaces/ILayoutManager";
import { Engine } from "../core/Engine";
import { TableRowHelper } from "./TableRowHelper";
import { ControlDirectiveUtil } from "../utils/ControlDirectiveUtil";
import { Logger } from "../utils/Logger";
import { SCHEMA_TYPE } from "../constants/MetaUIConstants";
import { isRecord } from "../utils/TypeGuards";
import { LayoutElementWalker, LayoutFieldFactory } from "./LayoutElementWalker";

/**
 * Layout Manager responsible for generating a responsive SAP Fiori Table.
 * Automatically utilized by the Engine when the schema root or property is of type `'array'`.
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
     * @param _onSubmit Optional submit hook.
     * @param bindingPath The JSON path representing the array within the payload.
     * @returns {Control} The generated `sap.m.Table` control.
     * @throws {Error} If the provided schema is not of type `'array'`.
     */
    public render(
        schema: ISchema,
        modelName: string,
        engine: Engine,
        _onSubmit?: () => void,
        bindingPath: string = "/"
    ): Control {
        const itemsSchema = TableRowHelper.resolveItemsSchema(schema, engine, bindingPath);
        const isPrimitive = Boolean(
            itemsSchema &&
                !itemsSchema.properties &&
                ["string", "number", "integer", "boolean"].includes(itemsSchema.type as string)
        );

        if (schema.type !== SCHEMA_TYPE.ARRAY || !itemsSchema || (!itemsSchema.properties && !isPrimitive)) {
            Logger.error(
                `[MetaUI] TableLayout fatal error! schema.type: ${schema.type}, itemsSchema: ${!!itemsSchema}`,
                "",
                "TableLayout"
            );
            throw new Error("[MetaUI] TableLayout requires an array schema with items.properties or primitive items.");
        }

        const resolvedItemsSchema: IPropertyMetadata = itemsSchema;
        const tableTitle = schema.title || schema.ui?.label || "Table";
        const canEditTable =
            engine.isEditable && !schema.readOnly && !schema.ui?.readOnly && schema.ui?.enabled !== false;

        let effectiveBindingPath = bindingPath;
        if (bindingPath === "/") {
            const activeModel = engine.getModel() as { getData?: () => unknown } | undefined;
            const rootData = typeof activeModel?.getData === "function" ? activeModel.getData() : undefined;
            if (!Array.isArray(rootData) && isRecord(rootData) && Array.isArray(rootData.items)) {
                effectiveBindingPath = "/items";
            }
        }

        const addRowBtn = new Button({
            text: "Add Row",
            icon: "sap-icon://add",
            visible: canEditTable,
            press: (oEvent: Event) => {
                const btn = oEvent.getSource() as Button;
                const tbl = btn.getParent()?.getParent() as Table | undefined;
                TableRowHelper.addRow(tbl, modelName, resolvedItemsSchema, engine, effectiveBindingPath, schema);
            }
        });
        addRowBtn.data("metauiTableAddBtn", true);

        const table = new Table({
            headerToolbar: new Toolbar({
                content: [new Title({ text: tableTitle }), new ToolbarSpacer(), addRowBtn]
            }),
            fixedLayout: false,
            mode: !canEditTable ? ListMode.None : ListMode.Delete,
            delete: (oEvent: Event) => {
                const params = oEvent.getParameters() as { listItem?: ColumnListItem };
                TableRowHelper.deleteRow(params.listItem, modelName, engine, effectiveBindingPath, schema);
            }
        });
        table.data("metauiBindingPath", effectiveBindingPath);
        if (schema.ui?.visible === false || schema.ui?.visibleOn) {
            ControlDirectiveUtil.applyCommonDirectives(
                table,
                table,
                { type: "array", ui: { visible: schema.ui.visible, visibleOn: schema.ui.visibleOn } },
                effectiveBindingPath,
                canEditTable,
                modelName
            );
        }

        const templateCells = this.buildColumnsAndCells(
            table,
            schema,
            resolvedItemsSchema,
            isPrimitive,
            modelName,
            engine,
            canEditTable
        );

        table.bindItems({
            path: effectiveBindingPath,
            model: modelName,
            template: new ColumnListItem({ cells: templateCells }),
            templateShareable: false
        });

        return table;
    }

    /**
     * Populates the `sap.m.Table` columns (with accessible `sap.m.Label` headers and `required` indicators)
     * and generates the corresponding cell template controls.
     *
     * @param table The target `sap.m.Table` control.
     * @param schema The array schema.
     * @param resolvedItemsSchema The resolved `items` metadata.
     * @param isPrimitive True if the array items are primitives rather than objects.
     * @param modelName The UI5 JSONModel alias.
     * @param engine The owning `Engine` instance.
     * @param canEditTable True if the table allows editing.
     * @returns {Control[]} The array of template cell controls for `ColumnListItem`.
     */
    private buildColumnsAndCells(
        table: Table,
        schema: ISchema,
        resolvedItemsSchema: IPropertyMetadata,
        isPrimitive: boolean,
        modelName: string,
        engine: Engine,
        canEditTable: boolean = true
    ): Control[] {
        const templateCells: Control[] = [];
        const props = resolvedItemsSchema.properties;
        const layoutElements = schema.uiLayout || resolvedItemsSchema.uiLayout;
        const effectiveModel = modelName || "meta";

        const withTableReadOnly = (meta: IPropertyMetadata, widgetOverride?: string): IPropertyMetadata => {
            return LayoutFieldFactory.cloneFieldMetadata(meta, widgetOverride, !canEditTable);
        };

        if (isPrimitive) {
            table.addColumn(
                new Column({
                    header: new Label({ text: "Value", required: resolvedItemsSchema.required === true })
                })
            );
            templateCells.push(engine.generateField(withTableReadOnly(resolvedItemsSchema), "", effectiveModel, true));
            return templateCells;
        }

        const hasExplicitKey = props
            ? Object.values(props).some((p) => Boolean(p.ui?.isKey))
            : false;

        if (layoutElements && Array.isArray(layoutElements)) {
            let renderedColIndex = 0;
            const itemObjectSchema: ISchema = { type: "object", properties: props };
            const controlCount = LayoutElementWalker.walk(
                layoutElements,
                itemObjectSchema,
                engine,
                {
                    onScalarField: (element: ILayoutElement, colBindingPath: string, fieldMeta: IPropertyMetadata) => {
                        const isAnchor = Boolean(fieldMeta.ui?.isKey) || (!hasExplicitKey && renderedColIndex === 0);
                        renderedColIndex++;
                        table.addColumn(
                            new Column({
                                header: new Label({
                                    text: element.label || fieldMeta.ui?.label || colBindingPath,
                                    required: fieldMeta.required === true
                                }),
                                demandPopin: !isAnchor,
                                minScreenWidth: isAnchor ? "" : "Tablet",
                                popinDisplay: PopinDisplay.Inline
                            })
                        );
                        const effectiveMeta = withTableReadOnly(fieldMeta, element.widget);
                        templateCells.push(engine.generateField(effectiveMeta, colBindingPath, effectiveModel, true));
                    }
                },
                "TableLayout"
            );
            if (controlCount > 0) {
                return templateCells;
            }
            Logger.warn(
                "[MetaUI] Table uiLayout contains no Control elements; falling back to item properties.",
                "",
                "TableLayout"
            );
        }

        if (props) {
            Object.keys(props).forEach((key, colIdx) => {
                try {
                    const fieldMeta = withTableReadOnly(props[key]);
                    const isAnchor = Boolean(fieldMeta.ui?.isKey) || (!hasExplicitKey && colIdx === 0);
                    table.addColumn(
                        new Column({
                            header: new Label({
                                text: fieldMeta.ui?.label || key,
                                required: fieldMeta.required === true
                            }),
                            demandPopin: !isAnchor,
                            minScreenWidth: isAnchor ? "" : "Tablet",
                            popinDisplay: PopinDisplay.Inline
                        })
                    );
                    templateCells.push(engine.generateField(fieldMeta, key, effectiveModel, true));
                } catch (error) {
                    const msg = (error as Error).message;
                    Logger.error(`[MetaUI] Failed to render fallback column ${key}`, msg, "TableLayout");
                    Logger.showErrorPopup(`Failed to render fallback table column '${key}'.\n\nDetails: ${msg}`);
                    templateCells.push(new Text({ text: "Error" }));
                }
            });
        }

        return templateCells;
    }
}
