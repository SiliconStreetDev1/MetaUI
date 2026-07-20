import { BasePlugin } from "../controls/BasePlugin";
import { IPropertyMetadata } from "../../interfaces/ISchema";
import Control from "sap/ui/core/Control";
import HBox from "sap/m/HBox";
import Input from "sap/m/Input";
import JSONModel from "sap/ui/model/json/JSONModel";
// @ts-ignore
import BarcodeScannerButton from "sap/ndc/BarcodeScannerButton";

export class BarcodeScannerPlugin extends BasePlugin {
    private inputControl!: Input;

    /**
     * Renders a `BarcodeScannerButton` alongside an `Input`.
     * 
     * @param metadata The specific JSON schema properties for this field.
     * @param bindingPath The JSON path bound to this control.
     * @param modelName The UI5 JSONModel name.
     * @param engineScopeId The deterministic scope ID.
     * @param onChange The callback fired on value change.
     * @returns {Control} The configured HBox control.
     */
    public render(metadata: IPropertyMetadata,  bindingPath: string,  modelName: string = "meta", engineScopeId?: string, onChange?: (isValid: boolean, fieldKey?: string) => void): Control {
        this.onChange = onChange;
        this.metadata = metadata;
        this.fieldKey = bindingPath.replace('/', '');
        this.modelName = modelName;

        if (!this.isEditable) {
            sap.ui.requireSync("sap/m/Text");
            const TextControl = sap.ui.require("sap/m/Text");
            this.control = new TextControl({
                id: this.generateStableId(engineScopeId, bindingPath),
                text: `{${modelName}>${bindingPath}}`
            });
            this.applyCommonDirectives(this.control, metadata, modelName);
            return this.control as Control;
        }

        this.inputControl = new Input({
            id: this.generateStableId(engineScopeId, bindingPath + "-input"),
            value: `{${modelName}>${bindingPath}}`,
            editable: !metadata.ui?.readOnly,
            width: "100%",
            change: () => {
                const result = this.validate();
                if (this.onChange) {
                    this.onChange(result.isValid, this.fieldKey);
                }
            }
        });
        
        const scannerBtn = new BarcodeScannerButton({
            id: this.generateStableId(engineScopeId, bindingPath + "-btn"),
            scanSuccess: (oEvent: sap.ui.base.Event) => {
                const text = oEvent.getParameter("text");
                if (text) {
                    this.inputControl.setValue(text);
                    // Update model explicitly since setValue doesn't always trigger two-way binding immediately
                    const model = this.inputControl.getModel(this.modelName) as JSONModel;
                    if (model) {
                        model.setProperty(bindingPath, text);
                    }
                    const result = this.validate();
                if (this.onChange) {
                    this.onChange(result.isValid, this.fieldKey);
                }
                }
            }
        });

        this.control = new HBox({
            id: this.generateStableId(engineScopeId, bindingPath),
            items: [this.inputControl, scannerBtn],
            width: "100%"
        }).addStyleClass("sapUiSmallMarginBottom");

        this.applyCommonDirectives(this.control, metadata, modelName);

        return this.control as Control;
    }

    /**
     * Retrieves the current scanned text.
     * @returns {any} The barcode string.
     */
    protected getValue(): any {
        return this.inputControl ? this.inputControl.getValue() : null;
    }

    /**
     * Applies dynamic read-only state.
     */
    protected applyState(): void {
        if (this.inputControl && this.metadata) {
            if (!this.isEditable) return;
            this.inputControl.setEditable(!this.metadata.ui?.readOnly);
        }
    }
}
