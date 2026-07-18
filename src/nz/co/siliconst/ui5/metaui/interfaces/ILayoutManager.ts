/**
 * @file ILayoutManager.ts
 * @description Factory contract for generating UI5 layout containers (Forms/Tables).
 */

import Control from "sap/ui/core/Control";
import { IPropertyMetadata } from "./ISchema";

import { IPlugin } from "./IPlugin";

export interface ILayoutManager {
    /**
     * Renders a form-style layout for the root fields defined in the schema.
     */
    renderForm(properties: Record<string, IPropertyMetadata>, modelName?: string, formTitle?: string, trackPlugin?: (plugin: IPlugin) => void): Control;

    /**
     * Renders a tabular layout for the provided array metadata.
     */
    renderTable(tableMeta: IPropertyMetadata, modelName?: string, tableTitle?: string, trackPlugin?: (plugin: IPlugin) => void): Control;
}
