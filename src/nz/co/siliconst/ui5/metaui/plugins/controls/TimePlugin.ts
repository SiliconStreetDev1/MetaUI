/**
 * @file TimePlugin.ts
 * @description Handles rendering logic for Time strings.
 */

import TimePicker from "sap/m/TimePicker";
import { IPickerPluginConfig, PickerPlugin } from "./PickerPlugin";

/**
 * Handles rendering and logic for time inputs (`HH:mm:ss`).
 *
 * @namespace nz.co.siliconst.ui5.metaui.plugins.controls
 * @public
 */
export class TimePlugin extends PickerPlugin {
    protected readonly pickerConfig: IPickerPluginConfig = {
        ControlClass: TimePicker,
        bindingType: "sap.ui.model.type.Time",
        sourcePattern: "HH:mm:ss",
        displayFormat: "HH:mm:ss",
        parseErrorMessage: "Please enter a valid time."
    };
}
