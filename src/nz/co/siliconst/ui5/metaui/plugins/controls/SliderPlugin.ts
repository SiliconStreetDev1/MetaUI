/**
 * @file SliderPlugin.ts
 * @description Renders a sap.m.Slider control for numeric range selection.
 */

import { BasePlugin } from "./BasePlugin";
import { IPropertyMetadata } from "../../interfaces/ISchema";
import Slider from "sap/m/Slider";
import Control from "sap/ui/core/Control";
import Event from "sap/ui/base/Event";
import JSONModel from "sap/ui/model/json/JSONModel";

/**
 * Plugin responsible for rendering numeric range sliders (`sap.m.Slider`).
 *
 * @namespace nz.co.siliconst.ui5.metaui.plugins.controls
 * @public
 */
export class SliderPlugin extends BasePlugin {
    /**
     * Renders a `sap.m.Slider` component.
     *
     * @param metadata The specific JSON schema properties for this field.
     * @param bindingPath The JSON path bound to this control.
     * @param modelName The UI5 JSONModel name.
     * @param engineScopeId The deterministic scope ID.
     * @param onChange The callback fired on value change.
     * @returns {Control} The configured Slider control.
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

        this.control = new Slider({
            id: this.generateStableId(engineScopeId, bindingPath),
            value: this.generateBindingInfo(bindingPath, modelName) as unknown as number,
            min: metadata.minimum !== undefined ? metadata.minimum : 0,
            max: metadata.maximum !== undefined ? metadata.maximum : 100,
            step,
            enabled: this.isControlEditable(),
            width: "100%",
            showAdvancedTooltip: true,
            inputsAsTooltips: true,
            change: (oEvent: Event) => {
                const src = oEvent.getSource() as Slider;
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
     * Retrieves the current numeric value from the `Slider`.
     *
     * @param sourceControl Optional runtime source control (e.g., cloned table cell).
     * @returns {unknown} The slider value.
     */
    protected getValue(sourceControl?: Control): unknown {
        const target = (sourceControl ?? this.control) as Slider | undefined;
        const modelVal = this.getModelValue(target);
        if (!this.isEditable || modelVal === null || modelVal === undefined) {
            return modelVal;
        }
        return target && typeof target.getValue === "function" ? target.getValue() : modelVal;
    }

    /**
     * Applies dynamic `readOnly`, `min`, and `max` state updates to the `Slider`.
     */
    protected applyState(): void {
        if (!this.control || !this.metadata || !this.isEditable) {
            return;
        }
        const slider = this.control as Slider;
        slider.setEnabled(this.isControlEditable());
        if (this.metadata.minimum !== undefined) {
            slider.setMin(this.metadata.minimum);
        }
        if (this.metadata.maximum !== undefined) {
            slider.setMax(this.metadata.maximum);
        }
    }
}
