/**
 * @file BaseLayout.ts
 * @description Central layout factory that delegates to specific form or table layout engines.
 * Implements ILayoutManager.
 */

import { ILayoutManager } from "../interfaces/ILayoutManager";
import { ISchema, ITableMetadata } from "../interfaces/ISchema";
import Control from "sap/ui/core/Control";
import { FormLayout } from "./FormLayout";
import { TableLayout } from "./TableLayout";

/**
 * The core layout manager that delegates structural grid rendering based on schema configurations.
 */
export class BaseLayout implements ILayoutManager {
    /**
     * Constructs a responsive form layout container.
     * @param schema The master schema containing rootFields to be mounted.
     * @returns A populated UI5 container (sap.ui.layout.form.SimpleForm).
     */
    public renderForm(schema: ISchema): Control {
        return FormLayout.build(schema.rootFields);
    }

    /**
     * Constructs a responsive table layout container.
     * @param tableMeta The metadata defining the table columns.
     * @returns A UI5 Table control (sap.m.Table).
     */
    public renderTable(tableMeta: ITableMetadata): Control {
        return TableLayout.build(tableMeta);
    }
}
