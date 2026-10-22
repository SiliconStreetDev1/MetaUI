/**
 * @file RatingIndicatorPlugin.ts
 * @description Renders a sap.m.RatingIndicator control for star ratings.
 */

import { BasePlugin } from "./BasePlugin";
import { IPropertyMetadata } from "../../interfaces/ISchema";
import RatingIndicator from "sap/m/RatingIndicator";
import Control from "sap/ui/core/Control";
import Event from "sap/ui/base/Event";
import JSONModel from "sap/ui/model/json/JSONModel";

/**
 * Plugin responsible for rendering star rating indicators (`sap.m.RatingIndicator`).
 *
 * @namespace nz.co.siliconst.ui5.metaui.plugins.controls
 * @public
 */
export class RatingIndicatorPlugin extends BasePlugin {
    /**
     * Renders a `sap.m.RatingIndicator` component.
     *
     * @param metadata The specific JSON schema properties for this field.
     * @param bindingPath The JSON path bound to this control.
     * @param modelName The UI5 JSONModel name.
     * @param engineScopeId The deterministic scope ID.
     * @param onChange The callback fired on value change.
     * @returns {Control} The configured RatingIndicator control.
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

        const maxValue = metadata.maximum !== undefined ? metadata.maximum : 5;

        this.control = new RatingIndicator({
            id: this.generateStableId(engineScopeId, bindingPath),
            value: this.generateBindingInfo(bindingPath, modelName) as unknown as number,
            maxValue,
            editable: this.isControlEditable(),
            change: (oEvent: Event) => {
                const src = oEvent.getSource() as RatingIndicator;
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
     * Retrieves the current rating value from the `RatingIndicator`.
     *
     * @param sourceControl Optional runtime source control (e.g., cloned table cell).
     * @returns {unknown} The numeric rating value.
     */
    protected getValue(sourceControl?: Control): unknown {
        const target = (sourceControl ?? this.control) as RatingIndicator | undefined;
        const modelVal = this.getModelValue(target);
        if (!this.isEditable || modelVal === null || modelVal === undefined) {
            return modelVal;
        }
        return target && typeof target.getValue === "function" ? target.getValue() : modelVal;
    }

    /**
     * Applies dynamic `readOnly` and `maxValue` state updates to the `RatingIndicator`.
     */
    protected applyState(): void {
        if (!this.control || !this.metadata || !this.isEditable) {
            return;
        }
        const ri = this.control as RatingIndicator;
        ri.setEditable(this.isControlEditable());
        if (this.metadata.maximum !== undefined) {
            ri.setMaxValue(this.metadata.maximum);
        }
    }
}
