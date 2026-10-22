/**
 * @file ILayoutManager.ts
 * @description Factory contract for generating UI5 layout containers (Forms/Tables/Wizards).
 */

import Control from "sap/ui/core/Control";
import { ISchema } from "./ISchema";
import type { Engine } from "../core/Engine";

/**
 * Contract implemented by all layout strategies (`FormLayout`, `TableLayout`, `WizardLayout`, `CompactLayout`).
 *
 * @namespace nz.co.siliconst.ui5.metaui.interfaces
 * @public
 */
export interface ILayoutManager {
    /**
     * Renders a UI container based on the provided schema.
     *
     * @param schema The schema defining the layout content.
     * @param modelName The UI5 JSONModel name for data binding.
     * @param engine Reference back to the Engine for recursive internal field generation.
     * @param onSubmit Callback to trigger form submission from the layout natively (e.g. Wizard complete).
     * @param bindingPath Optional path to bind the layout (e.g. for nested array tables).
     * @returns {Control} The constructed UI5 layout container.
     */
    render(schema: ISchema, modelName: string, engine: Engine, onSubmit?: () => void, bindingPath?: string): Control;
}
