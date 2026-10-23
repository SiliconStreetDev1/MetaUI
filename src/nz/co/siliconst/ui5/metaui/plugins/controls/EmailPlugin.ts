/**
 * @file EmailPlugin.ts
 * @description Renders an email-typed sap.m.Input control.
 */

import { TextLikeInputPlugin } from "./TextLikeInputPlugin";
import { IPropertyMetadata } from "../../interfaces/ISchema";
import Input from "sap/m/Input";
import Control from "sap/ui/core/Control";
import Event from "sap/ui/base/Event";
import { InputType } from "sap/m/library";

/**
 * Handles rendering logic for Email strings (`ui.widget = "email"` or `format = "email"`).
 *
 * @namespace nz.co.siliconst.ui5.metaui.plugins.controls
 * @internal
 */
export class EmailPlugin extends TextLikeInputPlugin {
    /**
     * Constructs the editable `sap.m.Input` control with `type: InputType.Email`.
     *
     * @param metadata The specific JSON schema properties for this field.
     * @param bindingPath The JSON path bound to this control.
     * @param modelName The UI5 JSONModel name.
     * @param engineScopeId The deterministic scope ID.
     * @returns {Control} The configured email Input control.
     */
    protected createEditableControl(
        metadata: IPropertyMetadata,
        bindingPath: string,
        modelName: string,
        engineScopeId?: string
    ): Control {
        return new Input({
            id: this.generateStableId(engineScopeId, bindingPath),
            type: InputType.Email,
            value: this.generateBindingInfo(bindingPath, modelName) as unknown as string,
            placeholder: metadata.ui?.placeholder || "example@domain.com",
            maxLength: metadata.maxLength || 0,
            required: this.isRequired(),
            change: (oEvent: Event) => {
                this.notifyChange((oEvent.getSource() as Control).getId());
            }
        });
    }
}
