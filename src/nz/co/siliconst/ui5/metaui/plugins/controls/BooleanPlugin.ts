/**
 * @file BooleanPlugin.ts
 * @description Renders a sap.m.CheckBox control for boolean properties.
 */

import { BasePlugin } from "./BasePlugin";
import { IPropertyMetadata } from "../../interfaces/ISchema";
import CheckBox from "sap/m/CheckBox";
import Control from "sap/ui/core/Control";
import Event from "sap/ui/base/Event";
import JSONModel from "sap/ui/model/json/JSONModel";

/**
 * Plugin responsible for rendering boolean checkboxes (`sap.m.CheckBox`).
 *
 * @namespace nz.co.siliconst.ui5.metaui.plugins.controls
 * @public
 */
export class BooleanPlugin extends BasePlugin {
    /**
     * Renders a `sap.m.CheckBox` component.
     *
     * @param metadata The specific JSON schema properties for this field.
     * @param bindingPath The JSON path bound to this control.
     * @param modelName The UI5 JSONModel name.
     * @param engineScopeId The deterministic scope ID.
     * @param onChange The callback fired on value change.
     * @returns {Control} The configured CheckBox control.
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

        this.control = new CheckBox({
            id: this.generateStableId(engineScopeId, bindingPath),
            selected: this.generateBindingInfo(bindingPath, modelName) as unknown as boolean,
            editable: this.isControlEditable(),
            select: (oEvent: Event) => {
                const src = oEvent.getSource() as CheckBox;
                const model = (src.getModel(modelName) || this.engineContext?.getModel()) as JSONModel | undefined;
                if (model) {
                    model.setProperty(this.resolveAbsolutePath(src), src.getSelected());
                }
                this.notifyChange(src.getId());
            }
        });

        this.applyCommonDirectives(this.control, metadata, modelName);
        return this.control;
    }

    /**
     * Retrieves the current boolean selection state from the `CheckBox`.
     *
     * @param sourceControl Optional runtime source control (e.g., cloned table cell).
     * @returns {unknown} True if checked, false otherwise.
     */
    protected getValue(sourceControl?: Control): unknown {
        const target = (sourceControl ?? this.control) as CheckBox | undefined;
        const modelVal = this.getModelValue(target);
        if (!this.isEditable || modelVal === null || modelVal === undefined) {
            return modelVal;
        }
        return target && typeof target.getSelected === "function" ? target.getSelected() : Boolean(modelVal);
    }

    /**
     * Applies dynamic `readOnly` state updates to the `CheckBox`.
     */
    protected applyState(): void {
        if (!this.control || !this.metadata || !this.isEditable) {
            return;
        }
        (this.control as CheckBox).setEditable(this.isControlEditable());
    }
}
