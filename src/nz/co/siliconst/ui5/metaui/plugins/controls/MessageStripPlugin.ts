/**
 * @file MessageStripPlugin.ts
 * @description Renders a sap.m.MessageStrip for inline contextual notifications and banners.
 */

import { BasePlugin } from "./BasePlugin";
import { IPropertyMetadata } from "../../interfaces/ISchema";
import MessageStrip from "sap/m/MessageStrip";
import Control from "sap/ui/core/Control";
import { MessageType } from "sap/ui/core/library";

/**
 * Maps a schema `ui.valueState` string to a UI5 `MessageType` enum value.
 * @param valueState The schema valueState string (`"Information"`, `"Warning"`, `"Error"`, `"Success"`).
 * @returns {MessageType} The resolved `sap.ui.core.MessageType`.
 */
function resolveMessageType(valueState?: string): MessageType {
    switch (valueState) {
        case "Warning":
            return MessageType.Warning;
        case "Error":
            return MessageType.Error;
        case "Success":
            return MessageType.Success;
        case "Information":
        default:
            return MessageType.Information;
    }
}

/**
 * Plugin responsible for rendering non-editable inline banners (`sap.m.MessageStrip`).
 *
 * @namespace nz.co.siliconst.ui5.metaui.plugins.controls
 * @public
 */
export class MessageStripPlugin extends BasePlugin {
    /**
     * Renders a `sap.m.MessageStrip` bound to the property text.
     *
     * @param metadata The specific JSON schema properties for this field.
     * @param bindingPath The JSON path bound to this control.
     * @param modelName The UI5 JSONModel name.
     * @param engineScopeId The deterministic scope ID.
     * @param onChange The callback fired on value change.
     * @returns {Control} The configured MessageStrip control.
     */
    public render(
        metadata: IPropertyMetadata,
        bindingPath: string,
        modelName: string = "meta",
        engineScopeId?: string,
        onChange?: (isValid: boolean, fieldKey?: string, errorMessage?: string, controlId?: string) => void
    ): Control {
        this.initialize(metadata, bindingPath, modelName, onChange);

        const strip = new MessageStrip({
            id: this.generateStableId(engineScopeId, bindingPath),
            text: this.generateBindingInfo(bindingPath, modelName) as unknown as string,
            type: resolveMessageType(metadata.ui?.valueState),
            showIcon: true,
            showCloseButton: false
        });

        strip.addStyleClass("sapUiTinyMarginBottom");

        this.control = strip;
        this.applyCommonDirectives(this.control, metadata, modelName);

        return this.control;
    }

    /**
     * `MessageStrip` is a read-only display widget and never blocks form submission.
     * @returns {{ isValid: boolean; errorMessage?: string }} Always `{ isValid: true }`.
     */
    public override validate(): { isValid: boolean; errorMessage?: string } {
        return { isValid: true };
    }

    /**
     * Retrieves the current banner text from the `MessageStrip`.
     * @returns {unknown} The text string.
     */
    protected getValue(): unknown {
        return this.control ? (this.control as MessageStrip).getText() : "";
    }

    /**
     * Applies dynamic `valueState` updates to the `MessageStrip` type.
     */
    protected applyState(): void {
        if (!this.control || !this.metadata) {
            return;
        }
        const strip = this.control as MessageStrip;
        if (this.metadata.ui?.valueState) {
            strip.setType(resolveMessageType(this.metadata.ui.valueState));
        }
    }
}
