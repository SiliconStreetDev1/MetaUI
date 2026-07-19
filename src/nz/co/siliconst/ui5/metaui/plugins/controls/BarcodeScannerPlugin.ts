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

    public render(metadata: IPropertyMetadata,  bindingPath: string,  modelName: string = "meta", engineScopeId?: string): Control {
        this.metadata = metadata;
        this.fieldKey = bindingPath.replace('/', '');
        this.modelName = modelName;

        this.inputControl = new Input({
            id: this.generateStableId(engineScopeId, bindingPath + "-input"),
            value: `{${modelName}>${bindingPath}}`,
            editable: !metadata.ui?.readOnly,
            width: "100%",
            change: () => {
                this.validate();
            }
        });
        
        const scannerBtn = new BarcodeScannerButton({
            id: this.generateStableId(engineScopeId, bindingPath + "-btn"),
            scanSuccess: (oEvent: any) => {
                const text = oEvent.getParameter("text");
                if (text) {
                    this.inputControl.setValue(text);
                    // Update model explicitly since setValue doesn't always trigger two-way binding immediately
                    const model = this.inputControl.getModel(this.modelName) as JSONModel;
                    if (model) {
                        model.setProperty(bindingPath, text);
                    }
                    this.validate();
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

    protected getValue(): any {
        return this.inputControl ? this.inputControl.getValue() : null;
    }

    protected applyState(): void {
        if (this.inputControl && this.metadata) {
            this.inputControl.setEditable(!this.metadata.ui?.readOnly);
        }
    }
}
