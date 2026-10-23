/**
 * @file DateTimePlugin.ts
 * @description Handles rendering logic for DateTime strings (timestamps).
 */

import DateTimePicker from "sap/m/DateTimePicker";
import { IPickerPluginConfig, PickerPlugin } from "./PickerPlugin";
import { TEXT_KEY } from "../../utils/I18n";

/**
 * Handles rendering and logic for ISO timestamps/datetime inputs (`yyyy-MM-dd'T'HH:mm:ss'Z'`).
 *
 * @namespace nz.co.siliconst.ui5.metaui.plugins.controls
 * @public
 */
export class DateTimePlugin extends PickerPlugin {
    protected readonly pickerConfig: IPickerPluginConfig = {
        ControlClass: DateTimePicker,
        bindingType: "sap.ui.model.type.DateTime",
        sourcePattern: "yyyy-MM-dd'T'HH:mm:ss'Z'",
        parseErrorMessageKey: TEXT_KEY.dateTimeParseError
    };
}
