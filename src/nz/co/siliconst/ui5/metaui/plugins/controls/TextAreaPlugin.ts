/**
 * @file TextAreaPlugin.ts
 * @description Renders a sap.m.TextArea for string data specifically marked with the textArea widget.
 */

import { BasePlugin } from "./BasePlugin";
import { IPropertyMetadata } from "../../interfaces/ISchema";
import TextArea from "sap/m/TextArea";
import Control from "sap/ui/core/Control";
import TextControl from "sap/m/Text";

/**
 * Handles rendering and logic for multi-line text areas.
 */
export class TextAreaPlugin extends BasePlugin {
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
    public render(fieldMetadata: IPropertyMetadata,  bindingPath: string,  modelName: string = "meta", engineScopeId?: string, onChange?: (isValid: boolean, fieldKey?: string) => void): Control {
        this.onChange = onChange;
        this.metadata = fieldMetadata;
        this.fieldKey = bindingPath.replace("/", ""); // For EventBus
        
        if (!this.isEditable) {
            
            this.control = new TextControl({
                id: this.generateStableId(engineScopeId, bindingPath),
                text: `{${modelName}>${bindingPath}}`
            });
            this.applyCommonDirectives(this.control, fieldMetadata, modelName);
            return this.control as Control;
        }

        this.control = new TextArea({
            id: this.generateStableId(engineScopeId, bindingPath),
            value: `{${modelName}>${bindingPath}}`,
            maxLength: fieldMetadata.maxLength || 0,
            required: !!fieldMetadata.required,
            rows: 3, // Start with at least 3 lines
            growing: false, // We manage height manually to maintain the +2 lines requirement
            change: (oEvent: sap.ui.base.Event) => {
                this.updateHeight(oEvent.getSource() as TextArea);
                const result = this.validate();
                if (this.onChange) {
                    this.onChange(result.isValid, this.fieldKey);
                }
            },
            liveChange: (oEvent: sap.ui.base.Event) => {
                this.updateHeight(oEvent.getSource() as TextArea);
            }
        });

        // Clean architecture: Wait for the model context, then calculate initial height
        (this.control as TextArea).attachEventOnce("modelContextChange", () => {
            const oBinding = (this.control as TextArea).getBinding("value");
            
            const initLogic = () => {
                if (this.control) {
                    this.updateHeight(this.control as TextArea);
                }
            };

            if (oBinding) {
                oBinding.attachChange(initLogic);
            }
            // Execute immediately in case the model is synchronous (JSONModel)
            initLogic();
        });

        this.applyCommonDirectives(this.control, fieldMetadata, modelName);

        return this.control as Control;
    }

    /**
     * Dynamically sets the rows to the content length + 2
     */
    private updateHeight(oTextArea: TextArea): void {
        const val = oTextArea.getValue() || "";
        // Count actual newlines in the string
        const numLines = val.split(/\r\n|\r|\n/).length;
        // Also estimate word wrapping if they type a really long single line without pressing enter
        // A standard character width approximation, assuming ~80 chars per line for full width
        const wrappedLines = Math.ceil(val.length / 80);
        
        const totalLines = Math.max(numLines, wrappedLines);
        
        // Ensure there is always 2 lines of extra breathing room
        oTextArea.setRows(Math.max(3, totalLines + 2));
    }

    /**
     * Retrieves the current text string.
     * @returns {unknown} The text string.
     */
    protected getValue(): unknown {
        return this.control ? (this.control as TextArea).getValue() : null;
    }

    /**
     * Applies dynamic read-only state.
     */
    protected applyState(): void {
        if (this.control && this.metadata) {
            if (!this.isEditable) return;
            const input = this.control as TextArea;
            input.setEditable(!this.metadata.ui?.readOnly);
            input.setRequired(this.metadata.required);
        }
    }
}
