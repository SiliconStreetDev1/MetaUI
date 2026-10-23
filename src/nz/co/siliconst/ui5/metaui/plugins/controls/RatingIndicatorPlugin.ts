/**
 * @file RatingIndicatorPlugin.ts
 * @description Renders a sap.m.RatingIndicator control for star ratings.
 */

import {
    ISingleBoundWidgetConfig,
    SingleBoundWidgetPlugin,
    SingleBoundWidgetSettings
} from "./SingleBoundWidgetPlugin";
import { IPropertyMetadata } from "../../interfaces/ISchema";
import RatingIndicator from "sap/m/RatingIndicator";
import Control from "sap/ui/core/Control";

/**
 * Plugin responsible for rendering star rating indicators (`sap.m.RatingIndicator`).
 *
 * @namespace nz.co.siliconst.ui5.metaui.plugins.controls
 * @internal
 */
export class RatingIndicatorPlugin extends SingleBoundWidgetPlugin {
    protected readonly widgetConfig: ISingleBoundWidgetConfig = {
        ControlClass: RatingIndicator,
        valueProperty: "value",
        changeEvent: "change",
        editableProperty: "editable",
        readValue: (control: Control) =>
            typeof (control as RatingIndicator).getValue === "function"
                ? (control as RatingIndicator).getValue()
                : undefined
    };

    /**
     * Supplies the rating scale, defaulting to five stars when the schema declares no `maximum`.
     *
     * @param metadata The property metadata.
     * @returns {SingleBoundWidgetSettings} The `sap.m.RatingIndicator` constructor settings.
     */
    protected override buildExtraSettings(metadata: IPropertyMetadata): SingleBoundWidgetSettings {
        return {
            maxValue: metadata.maximum !== undefined ? metadata.maximum : 5
        };
    }

    /**
     * Applies dynamic `maxValue` state updates to the `RatingIndicator`.
     *
     * @param control The rendered `sap.m.RatingIndicator`.
     * @param metadata The current property metadata.
     */
    protected override applyExtraState(control: Control, metadata: IPropertyMetadata): void {
        if (metadata.maximum !== undefined) {
            (control as RatingIndicator).setMaxValue(metadata.maximum);
        }
    }
}
