/**
 * @file BaseLayout.ts
 * @description Central layout factory that delegates to specific form or table layout engines.
 */

import { ILayoutManager } from "../interfaces/ILayoutManager";
import { IPropertyMetadata } from "../interfaces/ISchema";
import Control from "sap/ui/core/Control";
import { FormLayout } from "./FormLayout";
import { TableLayout } from "./TableLayout";

import { IPlugin } from "../interfaces/IPlugin";

export class BaseLayout implements ILayoutManager {
    public renderForm(properties: Record<string, IPropertyMetadata>, modelName: string = "meta", formTitle?: string, trackPlugin?: (plugin: IPlugin) => void): Control {
        return FormLayout.build(properties, modelName, formTitle, trackPlugin);
    }

    public renderTable(tableMeta: IPropertyMetadata, modelName: string = "meta", tableTitle?: string, trackPlugin?: (plugin: IPlugin) => void): Control {
        return TableLayout.build(tableMeta, modelName, tableTitle, trackPlugin);
    }
}
