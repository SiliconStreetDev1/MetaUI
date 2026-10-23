/**
 * @file SwitchPlugin.ts
 * @description Renders a sap.m.Switch control for boolean toggle properties.
 */

import { ISingleBoundWidgetConfig, SingleBoundWidgetPlugin } from "./SingleBoundWidgetPlugin";
import Switch from "sap/m/Switch";
import Control from "sap/ui/core/Control";

/**
 * Plugin responsible for rendering boolean toggle switches (`sap.m.Switch`).
 *
 * @namespace nz.co.siliconst.ui5.metaui.plugins.controls
 * @public
 */
export class SwitchPlugin extends SingleBoundWidgetPlugin {
    protected readonly widgetConfig: ISingleBoundWidgetConfig = {
        ControlClass: Switch,
        valueProperty: "state",
        changeEvent: "change",
        editableProperty: "enabled",
        readValue: (control: Control) =>
            typeof (control as Switch).getState === "function" ? (control as Switch).getState() : undefined,
        coerceModelValue: (modelValue: unknown) => Boolean(modelValue)
    };
}
