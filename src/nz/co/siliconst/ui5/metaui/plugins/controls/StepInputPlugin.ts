/**
 * @file StepInputPlugin.ts
 * @description Renders a sap.m.StepInput control for bounded numeric increments.
 */

import { BasePlugin } from "./BasePlugin";
import { IPropertyMetadata } from "../../interfaces/ISchema";
import StepInput from "sap/m/StepInput";
import Control from "sap/ui/core/Control";
import Event from "sap/ui/base/Event";
import JSONModel from "sap/ui/model/json/JSONModel";

/**
 * Plugin responsible for rendering numeric step inputs (`sap.m.StepInput`).
 *
 * @namespace nz.co.siliconst.ui5.metaui.plugins.controls
 * @public
 */
export class StepInputPlugin extends BasePlugin {
    /**
     * Renders a `sap.m.StepInput` component.
     *
     * @param metadata The specific JSON schema properties for this field.
     * @param bindingPath The JSON path bound to this control.
     * @param modelName The UI5 JSONModel name.
     * @param engineScopeId The deterministic scope ID.
     * @param onChange The callback fired on value change.
     * @returns {Control} The configured StepInput control.
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

        const step =
            typeof metadata.multipleOf === "number"
                ? metadata.multipleOf
                : metadata.ui?.options && typeof metadata.ui.options.step === "number"
                  ? metadata.ui.options.step
                  : 1;

        this.control = new StepInput({
            id: this.generateStableId(engineScopeId, bindingPath),
            value: this.generateBindingInfo(bindingPath, modelName) as unknown as number,
            min: metadata.minimum !== undefined ? metadata.minimum : undefined,
            max: metadata.maximum !== undefined ? metadata.maximum : undefined,
            step,
            required: this.isRequired(),
            change: (oEvent: Event) => {
                const src = oEvent.getSource() as StepInput;
                const model = (src.getModel(modelName) || this.engineContext?.getModel()) as JSONModel | undefined;
                if (model) {
                    model.setProperty(this.resolveAbsolutePath(src), src.getValue());
                }
                this.notifyChange(src.getId());
            }
        });

        this.applyCommonDirectives(this.control, metadata, modelName);
        return this.control;
    }

    /**
     * Retrieves the current numeric value from the `StepInput`.
     *
     * @param sourceControl Optional runtime source control (e.g., cloned table cell).
     * @returns {unknown} The current numeric value.
     */
    protected getValue(sourceControl?: Control): unknown {
        const target = (sourceControl ?? this.control) as StepInput | undefined;
        const modelVal = this.getModelValue(target);
        if (!this.isEditable || modelVal === null || modelVal === undefined) {
            return modelVal;
        }
        return target && typeof target.getValue === "function" ? target.getValue() : modelVal;
    }

    /**
     * Applies dynamic `readOnly`, `required`, `min`, and `max` state updates to the `StepInput`.
     */
    protected applyState(): void {
        if (!this.control || !this.metadata || !this.isEditable) {
            return;
        }
        const si = this.control as StepInput;
        si.setEditable(this.isControlEditable());
        si.setRequired(this.isRequired());
        if (this.metadata.minimum !== undefined) {
            si.setProperty("min", this.metadata.minimum);
        }
        if (this.metadata.maximum !== undefined) {
            si.setProperty("max", this.metadata.maximum);
        }
    }
}
