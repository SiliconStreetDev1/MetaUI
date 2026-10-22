/**
 * @file SwitchPlugin.ts
 * @description Renders a sap.m.Switch control for boolean toggle properties.
 */

import { BasePlugin } from "./BasePlugin";
import { IPropertyMetadata } from "../../interfaces/ISchema";
import Switch from "sap/m/Switch";
import Control from "sap/ui/core/Control";
import Event from "sap/ui/base/Event";
import JSONModel from "sap/ui/model/json/JSONModel";

/**
 * Plugin responsible for rendering boolean toggle switches (`sap.m.Switch`).
 *
 * @namespace nz.co.siliconst.ui5.metaui.plugins.controls
 * @public
 */
export class SwitchPlugin extends BasePlugin {
    /**
     * Renders a `sap.m.Switch` component.
     *
     * @param metadata The specific JSON schema properties for this field.
     * @param bindingPath The JSON path bound to this control.
     * @param modelName The UI5 JSONModel name.
     * @param engineScopeId The deterministic scope ID.
     * @param onChange The callback fired on value change.
     * @returns {Control} The configured Switch control.
     */
    public render(
        metadata: IPropertyMetadata,
        bindingPath: string,
        modelName: string = "meta",
        engineScopeId?: string,
        onChange?: (isValid: boolean, fieldKey?: string, errorMessage?: string, controlId?: string) => void
    ): Control {
        this.initialize(metadata, bindingPath, modelName, onChange);

        if (!this.isEditable) {
            return this.createDisplayText(engineScopeId, bindingPath);
        }

        this.control = new Switch({
            id: this.generateStableId(engineScopeId, bindingPath),
            state: this.generateBindingInfo(bindingPath, modelName) as unknown as boolean,
            enabled: this.isControlEditable(),
            change: (oEvent: Event) => {
                const src = oEvent.getSource() as Switch;
                const model = (src.getModel(modelName) || this.engineContext?.getModel()) as JSONModel | undefined;
                if (model) {
                    model.setProperty(this.resolveAbsolutePath(src), src.getState());
                }
                this.notifyChange(src.getId());
            }
        });

        this.applyCommonDirectives(this.control, metadata, modelName);
        return this.control;
    }

    /**
     * Retrieves the current boolean state from the `Switch`.
     *
     * @param sourceControl Optional runtime source control (e.g., cloned table cell).
     * @returns {unknown} True if switched on, false otherwise.
     */
    protected getValue(sourceControl?: Control): unknown {
        const target = (sourceControl ?? this.control) as Switch | undefined;
        const modelVal = this.getModelValue(target);
        if (!this.isEditable || modelVal === null || modelVal === undefined) {
            return modelVal;
        }
        return target && typeof target.getState === "function" ? target.getState() : Boolean(modelVal);
    }

    /**
     * Applies dynamic `readOnly` state updates to the `Switch`.
     */
    protected applyState(): void {
        if (!this.control || !this.metadata || !this.isEditable) {
            return;
        }
        (this.control as Switch).setEnabled(this.isControlEditable());
    }
}
