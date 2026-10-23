/**
 * @file SubmitFormActionPlugin.ts
 * @description Action plugin that renders an Emphasized Submit button and invokes the Engine's submit hook.
 */

import { ActionButtonPlugin, IActionButtonConfig } from "./ActionButtonPlugin";
import Event from "sap/ui/base/Event";
import { ButtonType } from "sap/m/library";
import { TEXT_KEY } from "../../utils/I18n";

/**
 * Plugin responsible for rendering an inline form submit trigger (`ui.widget = "submitButton"`).
 * Invokes `this.engineContext.onSubmit()` when pressed.
 *
 * @namespace nz.co.siliconst.ui5.metaui.plugins.actions
 * @public
 */
export class SubmitFormActionPlugin extends ActionButtonPlugin {
    protected readonly actionConfig: IActionButtonConfig = {
        fallbackLabelKey: TEXT_KEY.actionSubmit,
        buttonType: ButtonType.Emphasized,
        icon: "sap-icon://accept"
    };

    /**
     * Triggers the host submission pipeline.
     *
     * @param event The `sap.m.Button` press event.
     */
    protected onPress(event: Event): void {
        void event;
        if (this.engineContext?.onSubmit) {
            this.engineContext.onSubmit();
        }
    }
}
