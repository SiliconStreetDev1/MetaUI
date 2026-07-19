/**
 * @file ILayoutManager.ts
 * @description Factory contract for generating UI5 layout containers (Forms/Tables).
 */

import Control from "sap/ui/core/Control";
import { IPropertyMetadata } from "./ISchema";

import { IPlugin } from "./IPlugin";

export interface ILayoutManager {
    /**
     * Renders a UI container based on the provided schema.
     * @param schema The schema defining the layout content.
     * @param modelName The UI5 JSONModel name for data binding.
     * @param engine Reference back to the Engine for recursive internal field generation.
     * @param onSubmit Callback to trigger form submission from the layout natively (e.g. Wizard complete)
     * @param bindingPath Optional path to bind the layout (e.g. for nested array tables)
     */
    render(schema: import("./ISchema").ISchema, modelName: string, engine: import("../core/Engine").Engine, onSubmit?: () => void, bindingPath?: string): Control;
}
