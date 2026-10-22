/**
 * @file BarcodeScannerPlugin.ts
 * @description Renders a BarcodeScannerButton alongside an Input control.
 */

import { TextLikeInputPlugin } from "./TextLikeInputPlugin";
import { IPropertyMetadata } from "../../interfaces/ISchema";
import Control from "sap/ui/core/Control";
import HBox from "sap/m/HBox";
import Input from "sap/m/Input";
import FlexItemData from "sap/m/FlexItemData";
import JSONModel from "sap/ui/model/json/JSONModel";
import Event from "sap/ui/base/Event";
import BarcodeScannerButton, {
    BarcodeScannerButton$ScanSuccessEventParameters
} from "sap/ndc/BarcodeScannerButton";

/**
 * Plugin responsible for rendering a `sap.ndc.BarcodeScannerButton` paired with a `sap.m.Input`.
 * Sets `this.mainControl = this.inputControl` so validation error states and editability target the Input.
 *
 * @namespace nz.co.siliconst.ui5.metaui.plugins.controls
 * @public
 */
export class BarcodeScannerPlugin extends TextLikeInputPlugin {
    private inputControl?: Input;
    private scannerBtn?: BarcodeScannerButton;

    /**
     * Constructs a `BarcodeScannerButton` alongside an `Input` inside an `HBox`.
     *
     * @param _metadata The specific JSON schema properties for this field.
     * @param bindingPath The JSON path bound to this control.
     * @param modelName The UI5 JSONModel name.
     * @param engineScopeId The deterministic scope ID.
     * @returns {Control} The configured HBox control.
     */
    protected createEditableControl(
        _metadata: IPropertyMetadata,
        bindingPath: string,
        modelName: string,
        engineScopeId?: string
    ): Control {
        this.inputControl = new Input({
            id: this.generateStableId(engineScopeId, `${bindingPath}-input`),
            value: this.generateBindingInfo(bindingPath, modelName) as unknown as string,
            editable: this.isControlEditable(),
            required: this.isRequired(),
            width: "100%",
            layoutData: new FlexItemData({ growFactor: 1 }),
            change: (oEvent: Event) => {
                this.notifyChange((oEvent.getSource() as Control).getId());
            }
        });

        this.scannerBtn = new BarcodeScannerButton({
            id: this.generateStableId(engineScopeId, `${bindingPath}-btn`),
            visible: this.isControlEditable(),
            scanSuccess: (oEvent: Event<BarcodeScannerButton$ScanSuccessEventParameters>) => {
                const params = oEvent.getParameters();
                const text = params?.text;
                const srcBtn = oEvent.getSource() as Control;
                const parentBox = srcBtn.getParent() as HBox | undefined;
                const targetInput = (parentBox?.getItems?.()?.[0] as Input | undefined) ?? this.inputControl;
                if (text && targetInput) {
                    targetInput.setValue(text);
                    const model = (targetInput.getModel(modelName) || this.engineContext?.getModel()) as
                        | JSONModel
                        | undefined;
                    if (model) {
                        model.setProperty(this.resolveAbsolutePath(targetInput), text);
                    }
                    this.notifyChange(targetInput.getId());
                }
            }
        });

        this.mainControl = this.inputControl;
        return new HBox({
            id: this.generateStableId(engineScopeId, bindingPath),
            items: [this.inputControl, this.scannerBtn],
            width: "100%"
        }).addStyleClass("sapUiSmallMarginBottom");
    }

    /**
     * Applies dynamic `readOnly` and `required` state updates to the `Input` and `BarcodeScannerButton`.
     */
    protected override applyState(): void {
        super.applyState();
        if (this.scannerBtn && this.metadata && this.isEditable) {
            this.scannerBtn.setVisible(this.isControlEditable());
        }
    }
}
