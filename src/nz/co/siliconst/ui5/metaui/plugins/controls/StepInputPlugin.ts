/**
 * @file StepInputPlugin.ts
 * @description Renders a sap.m.StepInput control for bounded numeric increments.
 */

import {
    ISingleBoundWidgetConfig,
    SingleBoundWidgetPlugin,
    SingleBoundWidgetSettings
} from "./SingleBoundWidgetPlugin";
import { IPropertyMetadata } from "../../interfaces/ISchema";
import StepInput from "sap/m/StepInput";
import Control from "sap/ui/core/Control";

/**
 * Plugin responsible for rendering numeric step inputs (`sap.m.StepInput`).
 *
 * @namespace nz.co.siliconst.ui5.metaui.plugins.controls
 * @internal
 */
export class StepInputPlugin extends SingleBoundWidgetPlugin {
    protected readonly widgetConfig: ISingleBoundWidgetConfig = {
        ControlClass: StepInput,
        valueProperty: "value",
        changeEvent: "change",
        editableProperty: "editable",
        readValue: (control: Control) =>
            typeof (control as StepInput).getValue === "function" ? (control as StepInput).getValue() : undefined
    };

    /**
     * Supplies the step input's bounds, increment and required indicator. Unlike the slider, an absent
     * bound stays `undefined` so the control keeps its own unbounded default rather than clamping to 0..100.
     *
     * @param metadata The property metadata.
     * @returns {SingleBoundWidgetSettings} The `sap.m.StepInput` constructor settings.
     */
    protected override buildExtraSettings(metadata: IPropertyMetadata): SingleBoundWidgetSettings {
        return {
            min: metadata.minimum !== undefined ? metadata.minimum : undefined,
            max: metadata.maximum !== undefined ? metadata.maximum : undefined,
            step: this.resolveStep(metadata),
            required: this.isRequired()
        };
    }

    /**
     * Applies dynamic `required`, `min`, and `max` state updates to the `StepInput`.
     *
     * @param control The rendered `sap.m.StepInput`.
     * @param metadata The current property metadata.
     */
    protected override applyExtraState(control: Control, metadata: IPropertyMetadata): void {
        const si = control as StepInput;
        si.setRequired(this.isRequired());
        if (metadata.minimum !== undefined) {
            si.setProperty("min", metadata.minimum);
        }
        if (metadata.maximum !== undefined) {
            si.setProperty("max", metadata.maximum);
        }
    }
}
