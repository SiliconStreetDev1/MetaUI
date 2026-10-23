/**
 * @file SliderPlugin.ts
 * @description Renders a sap.m.Slider control for numeric range selection.
 */

import {
    ISingleBoundWidgetConfig,
    SingleBoundWidgetPlugin,
    SingleBoundWidgetSettings
} from "./SingleBoundWidgetPlugin";
import { IPropertyMetadata } from "../../interfaces/ISchema";
import Slider from "sap/m/Slider";
import Control from "sap/ui/core/Control";

/**
 * Plugin responsible for rendering numeric range sliders (`sap.m.Slider`).
 *
 * @namespace nz.co.siliconst.ui5.metaui.plugins.controls
 * @internal
 */
export class SliderPlugin extends SingleBoundWidgetPlugin {
    protected readonly widgetConfig: ISingleBoundWidgetConfig = {
        ControlClass: Slider,
        valueProperty: "value",
        changeEvent: "change",
        editableProperty: "enabled",
        readValue: (control: Control) =>
            typeof (control as Slider).getValue === "function" ? (control as Slider).getValue() : undefined
    };

    /**
     * Supplies the slider's bounds, step and tooltip affordances.
     * A slider always needs a finite track, so the bounds fall back to 0..100 rather than to `undefined`.
     *
     * @param metadata The property metadata.
     * @returns {SingleBoundWidgetSettings} The `sap.m.Slider` constructor settings.
     */
    protected override buildExtraSettings(metadata: IPropertyMetadata): SingleBoundWidgetSettings {
        return {
            min: metadata.minimum !== undefined ? metadata.minimum : 0,
            max: metadata.maximum !== undefined ? metadata.maximum : 100,
            step: this.resolveStep(metadata),
            width: "100%",
            showAdvancedTooltip: true,
            inputsAsTooltips: true
        };
    }

    /**
     * Applies dynamic `min` and `max` state updates to the `Slider`.
     *
     * @param control The rendered `sap.m.Slider`.
     * @param metadata The current property metadata.
     */
    protected override applyExtraState(control: Control, metadata: IPropertyMetadata): void {
        const slider = control as Slider;
        if (metadata.minimum !== undefined) {
            slider.setMin(metadata.minimum);
        }
        if (metadata.maximum !== undefined) {
            slider.setMax(metadata.maximum);
        }
    }
}
