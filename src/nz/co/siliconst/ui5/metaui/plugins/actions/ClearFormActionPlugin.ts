/**
 * @file ClearFormActionPlugin.ts
 * @description Action plugin that renders a button to reset all fields in the current form model.
 */

import { ActionButtonPlugin, IActionButtonConfig } from "./ActionButtonPlugin";
import Event from "sap/ui/base/Event";
import JSONModel from "sap/ui/model/json/JSONModel";
import { ButtonType } from "sap/m/library";
import { isRecord } from "../../utils/TypeGuards";
import { TEXT_KEY } from "../../utils/I18n";

/**
 * Plugin responsible for rendering a form reset button (`ui.widget = "clearButton"`).
 * Resets all properties in the bound `JSONModel` to empty defaults and notifies the Engine.
 *
 * @namespace nz.co.siliconst.ui5.metaui.plugins.actions
 * @internal
 */
export class ClearFormActionPlugin extends ActionButtonPlugin {
    protected readonly actionConfig: IActionButtonConfig = {
        fallbackLabelKey: TEXT_KEY.actionClearForm,
        buttonType: ButtonType.Default,
        icon: "sap-icon://clear-all"
    };

    /**
     * Clears the bound form data.
     *
     * @param event The `sap.m.Button` press event.
     */
    protected onPress(event: Event): void {
        void event;
        this.clearFormModel();
    }

    /**
     * Recursively resets a data value to its empty representation while preserving nested object keys.
     *
     * @param val The current property value.
     * @returns {unknown} The cleared value.
     */
    private clearDataValue(val: unknown): unknown {
        if (typeof val === "boolean") {
            return false;
        }
        if (typeof val === "number" || val === null) {
            return null;
        }
        if (Array.isArray(val)) {
            return [];
        }
        if (isRecord(val)) {
            const nested: Record<string, unknown> = {};
            for (const [childKey, childVal] of Object.entries(val)) {
                nested[childKey] = this.clearDataValue(childVal);
            }
            return nested;
        }
        return "";
    }

    /**
     * Resets all top-level and nested keys in the bound `JSONModel` to empty values (`""`, `false`, `null`, `[]`),
     * clears active validation errors, and triggers `notifyChange` so the Engine re-evaluates policies and state.
     */
    private clearFormModel(): void {
        if (!this.control) {
            return;
        }
        const model = (this.control.getModel(this.modelName) || this.engineContext?.getModel()) as
            | JSONModel
            | undefined;
        if (!model) {
            return;
        }

        const currentData = model.getData();
        if (isRecord(currentData)) {
            const cleared = this.clearDataValue(currentData) as Record<string, unknown>;
            this.engineContext?.clearValidationErrors?.();
            this.engineContext?.clearValidationPrefix?.("");
            model.setData(cleared);
            this.notifyChange();
        }
    }
}
