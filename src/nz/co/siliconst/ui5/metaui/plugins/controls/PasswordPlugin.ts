/**
 * @file PasswordPlugin.ts
 * @description Renders a password-masked sap.m.Input control.
 */

import { TextLikeInputPlugin } from "./TextLikeInputPlugin";
import { IPropertyMetadata } from "../../interfaces/ISchema";
import Input from "sap/m/Input";
import Control from "sap/ui/core/Control";
import Event from "sap/ui/base/Event";
import { InputType } from "sap/m/library";
import { PropertyBindingInfo } from "sap/ui/base/ManagedObject";
import { I18n, TEXT_KEY } from "../../utils/I18n";

/**
 * Handles rendering logic for Password strings (`ui.widget = "password"` or `format = "password"`).
 * Masks characters in both edit mode (`InputType.Password`) and display mode (`********`).
 *
 * @namespace nz.co.siliconst.ui5.metaui.plugins.controls
 * @internal
 */
export class PasswordPlugin extends TextLikeInputPlugin {
    /**
     * Renders a masked `********` display text control when the host is in display mode.
     *
     * @param _metadata The property metadata.
     * @param bindingPath The JSON path bound to this control.
     * @param modelName The UI5 JSONModel name.
     * @param engineScopeId The deterministic scope ID.
     * @returns {Control} The masked Text control.
     */
    protected override renderDisplayControl(
        _metadata: IPropertyMetadata,
        bindingPath: string,
        modelName: string,
        engineScopeId?: string
    ): Control {
        const maskedBinding = this.generateBindingInfo(bindingPath, modelName, undefined, {
            formatter: (val: unknown) => (val ? "********" : "")
        }) as PropertyBindingInfo;
        return this.createDisplayText(engineScopeId, bindingPath, maskedBinding);
    }

    /**
     * Constructs the editable `sap.m.Input` control with `type: InputType.Password`.
     *
     * @param metadata The specific JSON schema properties for this field.
     * @param bindingPath The JSON path bound to this control.
     * @param modelName The UI5 JSONModel name.
     * @param engineScopeId The deterministic scope ID.
     * @returns {Control} The configured password Input control.
     */
    protected createEditableControl(
        metadata: IPropertyMetadata,
        bindingPath: string,
        modelName: string,
        engineScopeId?: string
    ): Control {
        return new Input({
            id: this.generateStableId(engineScopeId, bindingPath),
            type: InputType.Password,
            value: this.generateBindingInfo(bindingPath, modelName) as unknown as string,
            placeholder: metadata.ui?.placeholder || I18n.getText(TEXT_KEY.passwordPlaceholder),
            maxLength: metadata.maxLength || 0,
            required: this.isRequired(),
            change: (oEvent: Event) => {
                this.notifyChange((oEvent.getSource() as Control).getId());
            }
        });
    }
}
