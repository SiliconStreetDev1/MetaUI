/**
 * @file SubmitFormActionPlugin.ts
 * @description Action plugin that renders an Emphasized Submit button and invokes the Engine's submit hook.
 */

import { BasePlugin } from "../controls/BasePlugin";
import { IPropertyMetadata } from "../../interfaces/ISchema";
import Button from "sap/m/Button";
import Control from "sap/ui/core/Control";
import { ButtonType } from "sap/m/library";

/**
 * Plugin responsible for rendering an inline form submit trigger (`ui.widget = "submitButton"`).
 * Invokes `this.engineContext.onSubmit()` when pressed.
 *
 * @namespace nz.co.siliconst.ui5.metaui.plugins.actions
 * @public
 */
export class SubmitFormActionPlugin extends BasePlugin {
    /**
     * Renders an emphasized `sap.m.Button` that triggers the host submission pipeline.
     *
     * @param metadata The specific JSON schema properties for this action field.
     * @param bindingPath The JSON path bound to this control.
     * @param modelName The UI5 JSONModel name.
     * @param engineScopeId The deterministic scope ID.
     * @param onChange The callback fired on value change.
     * @returns {Control} The configured Submit Button control.
     */
    public render(
        metadata: IPropertyMetadata,
        bindingPath: string,
        modelName: string = "meta",
        engineScopeId?: string,
        onChange?: (isValid: boolean, fieldKey?: string, errorMessage?: string, controlId?: string) => void
    ): Control {
        this.initialize(metadata, bindingPath, modelName, onChange);

        const fallbackLabel = metadata.ui?.label || "Submit";
        const textBinding = this.generateBindingInfo(bindingPath, modelName, undefined, {
            formatter: (val: unknown) => (typeof val === "string" && val.trim() ? val.trim() : fallbackLabel)
        });

        this.control = new Button({
            id: this.generateStableId(engineScopeId, bindingPath),
            text: textBinding as unknown as string,
            type: ButtonType.Emphasized,
            icon: "sap-icon://accept",
            enabled: this.isControlEditable(),
            press: () => {
                if (this.engineContext?.onSubmit) {
                    this.engineContext.onSubmit();
                }
            }
        });

        this.applyCommonDirectives(this.control, metadata, modelName);
        return this.control;
    }

    /**
     * Action buttons do not hold user data and never fail schema validation.
     * @returns {{ isValid: boolean; errorMessage?: string }} Always `{ isValid: true }`.
     */
    public override validate(): { isValid: boolean; errorMessage?: string } {
        return { isValid: true };
    }

    /**
     * Action buttons have no bound value.
     * @returns {unknown} Always `null`.
     */
    protected getValue(): unknown {
        return null;
    }

    /**
     * Updates the button's `enabled` state when `isEditable` or `readOnly` changes.
     */
    protected applyState(): void {
        if (this.control && this.metadata) {
            (this.control as Button).setEnabled(this.isControlEditable());
        }
    }
}
