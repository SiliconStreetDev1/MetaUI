/**
 * @file BooleanPlugin.ts
 * @description Renders a sap.m.CheckBox control for boolean properties.
 */

import { ISingleBoundWidgetConfig, SingleBoundWidgetPlugin } from "./SingleBoundWidgetPlugin";
import CheckBox from "sap/m/CheckBox";
import Control from "sap/ui/core/Control";

/**
 * Plugin responsible for rendering boolean checkboxes (`sap.m.CheckBox`).
 *
 * @namespace nz.co.siliconst.ui5.metaui.plugins.controls
 * @internal
 */
export class BooleanPlugin extends SingleBoundWidgetPlugin {
    protected readonly widgetConfig: ISingleBoundWidgetConfig = {
        ControlClass: CheckBox,
        valueProperty: "selected",
        changeEvent: "select",
        editableProperty: "editable",
        readValue: (control: Control) =>
            typeof (control as CheckBox).getSelected === "function" ? (control as CheckBox).getSelected() : undefined,
        coerceModelValue: (modelValue: unknown) => Boolean(modelValue)
    };
}
