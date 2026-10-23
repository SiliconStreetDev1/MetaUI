/**
 * @file StringPlugin.ts
 * @description Renders a standard sap.m.Input control for string properties.
 */

import { TextLikeInputPlugin } from "./TextLikeInputPlugin";
import { IPropertyMetadata } from "../../interfaces/ISchema";
import Input from "sap/m/Input";
import Control from "sap/ui/core/Control";
import Event from "sap/ui/base/Event";

/**
 * Plugin responsible for rendering standard text inputs (`sap.m.Input`).
 * Supports `maxLength`, `placeholder`, and live validation hooks.
 *
 * @namespace nz.co.siliconst.ui5.metaui.plugins.controls
 * @internal
 */
export class StringPlugin extends TextLikeInputPlugin {
    protected override readonly syncPlaceholderAndMaxLength: boolean = true;

    /**
     * Constructs the editable `sap.m.Input` control.
     *
     * @param metadata The specific JSON schema properties for this field.
     * @param bindingPath The JSON path bound to this control.
     * @param modelName The UI5 JSONModel name.
     * @param engineScopeId The deterministic scope ID.
     * @returns {Control} The configured Input control.
     */
    protected createEditableControl(
        metadata: IPropertyMetadata,
        bindingPath: string,
        modelName: string,
        engineScopeId?: string
    ): Control {
        return new Input({
            id: this.generateStableId(engineScopeId, bindingPath),
            value: this.generateBindingInfo(bindingPath, modelName) as unknown as string,
            placeholder: metadata.ui?.placeholder || "",
            maxLength: metadata.maxLength || 0,
            required: this.isRequired(),
            change: (oEvent: Event) => {
                const src = oEvent.getSource() as Control;
                this.notifyChange(src.getId());
            }
        });
    }
}
