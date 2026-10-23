/**
 * @file DatePlugin.ts
 * @description Renders a sap.m.DatePicker natively bound to ISO date strings.
 */

import DatePicker from "sap/m/DatePicker";
import { IPickerPluginConfig, PickerPlugin } from "./PickerPlugin";
import { TEXT_KEY } from "../../utils/I18n";

/**
 * Handles rendering logic for ISO Date strings (`yyyy-MM-dd`).
 *
 * @namespace nz.co.siliconst.ui5.metaui.plugins.controls
 * @public
 */
export class DatePlugin extends PickerPlugin {
    protected readonly pickerConfig: IPickerPluginConfig = {
        ControlClass: DatePicker,
        bindingType: "sap.ui.model.type.Date",
        sourcePattern: "yyyy-MM-dd",
        displayFormat: "long",
        parseErrorMessageKey: TEXT_KEY.dateParseError
    };
}
