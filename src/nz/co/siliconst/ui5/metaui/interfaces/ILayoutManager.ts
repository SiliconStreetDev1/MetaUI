/**
 * @file ILayoutManager.ts
 * @description Factory contract for generating UI5 layout containers (Forms/Tables).
 */

import Control from "sap/ui/core/Control";
import { ISchema, ITableMetadata } from "./ISchema";

/**
 * The factory interface responsible for structuring the visual grid.
 */
export interface ILayoutManager {
    /**
     * Constructs a responsive form layout container utilizing native UI5 grids.
     * @param schema The master schema containing rootFields to be mounted.
     * @returns A populated UI5 container (e.g., sap.ui.layout.form.SimpleForm).
     */
    renderForm(schema: ISchema): Control;

    /**
     * Constructs an analytical or responsive table layout.
     * @param tableMeta The metadata defining the table columns.
     * @returns A UI5 Table control (e.g., sap.m.Table or sap.ui.table.Table).
     */
    renderTable(tableMeta: ITableMetadata): Control;
}
