/**
 * @file TextAreaPlugin.ts
 * @description Renders a sap.m.TextArea for string data specifically marked with the textArea widget.
 */

import { BasePlugin } from "./BasePlugin";
import { IPropertyMetadata } from "../../interfaces/ISchema";
import TextArea from "sap/m/TextArea";
import Control from "sap/ui/core/Control";
import TextControl from "sap/m/Text";
import HBox from "sap/m/HBox";
import Button from "sap/m/Button";
import Dialog from "sap/m/Dialog";
import FlexItemData from "sap/m/FlexItemData";

/**
 * Handles rendering and logic for multi-line text areas.
 */
export class TextAreaPlugin extends BasePlugin {
    private textAreaRef?: TextArea;
    
    /**
     * Renders a `sap.m.TextArea` component.
     * 
     * @param fieldMetadata The specific JSON schema properties for this field.
     * @param bindingPath The JSON path bound to this control.
     * @param modelName The UI5 JSONModel name.
     * @param engineScopeId The deterministic scope ID.
     * @param onChange The callback fired on value change.
     * @returns {Control} The configured TextArea control.
     */
    public render(fieldMetadata: IPropertyMetadata,  bindingPath: string,  modelName: string = "meta", engineScopeId?: string, onChange?: (isValid: boolean, fieldKey?: string, errorMessage?: string, controlId?: string) => void): Control {
        this.onChange = onChange;
        this.metadata = fieldMetadata;
        this.fieldKey = bindingPath.replace("/", ""); // For EventBus
        


        const schemaRows = fieldMetadata.ui?.rows;
        const useDialog = fieldMetadata.ui?.expandable !== false;

        const textArea = new TextArea({
            id: this.generateStableId(engineScopeId, bindingPath),
            value: this.generateBindingInfo(bindingPath, modelName),
            maxLength: fieldMetadata.maxLength || 0,
            required: !!fieldMetadata.required,
            editable: !this.isEditable ? false : !fieldMetadata.ui?.readOnly,
            rows: schemaRows || 10,
            growing: true,
            growingMaxLines: schemaRows || 15,
            width: "100%",
            change: () => {
                const result = this.validate();
                if (this.onChange) {
                    this.onChange(result.isValid, this.fieldKey, result.errorMessage);
                }
            }
        });
        this.textAreaRef = textArea;
        this.mainControl = textArea;

        if (useDialog) {
            const expandBtn = new Button({
                icon: "sap-icon://full-screen",
                type: "Transparent",
                tooltip: "Expand Editor",
                press: () => {
                    const dlg = new Dialog({
                        title: fieldMetadata.title || fieldMetadata.ui?.label || "Edit Text",
                        contentWidth: "80%",
                        contentHeight: "80%",
                        verticalScrolling: false,
                        resizable: true,
                        content: new TextArea({
                            value: this.generateBindingInfo(bindingPath, modelName),
                            width: "100%",
                            height: "100%",
                            editable: !this.isEditable ? false : !fieldMetadata.ui?.readOnly,
                            growing: false
                        }),
                        beginButton: new Button({
                            text: "Close",
                            press: () => dlg.close()
                        }),
                        afterClose: () => dlg.destroy()
                    });
                    this.control?.addDependent(dlg);
                    dlg.open();
                }
            });

            textArea.setLayoutData(new FlexItemData({ growFactor: 1 }));

            this.control = new HBox({
                width: "100%",
                alignItems: "Start",
                items: [textArea, expandBtn]
            });
        } else {
            this.control = textArea;
        }

        this.mainControl = textArea;
        this.applyCommonDirectives(this.control, fieldMetadata, modelName);

        return this.control as Control;
    }



    /**
     * Retrieves the current text string.
     * @returns {unknown} The text string.
     */
    protected getValue(): unknown {
        return this.textAreaRef ? this.textAreaRef.getProperty('value') : null;
    }

    /**
     * Applies dynamic read-only state.
     */
    protected applyState(): void {
        if (this.textAreaRef && this.metadata) {
            if (!this.isEditable) return;
            this.textAreaRef.setEditable(!this.metadata.ui?.readOnly);
            this.textAreaRef.setRequired(!!this.metadata.required);
        }
    }
}
