/**
 * @file PluginStateBase.ts
 * @description Abstract base class implementing the IPluginStateReceiver contract for UI5 control plugins.
 * Manages control lifecycle references, visual validation states, and dynamic policy effects
 * (visibility, editability, requirement, and validity) independently of data-binding concerns.
 */

import { IPluginStateReceiver } from "../interfaces/IPlugin";
import { IPropertyMetadata } from "../interfaces/ISchema";
import { ControlDirectiveUtil } from "../utils/ControlDirectiveUtil";
import Control from "sap/ui/core/Control";
import Label from "sap/m/Label";

/**
 * Base class implementing {@link IPluginStateReceiver} for all UI5 control plugins.
 * Separates reactive visual state management and policy effect application from
 * schema binding and validation pipeline execution in {@link BasePlugin}.
 *
 * @namespace nz.co.siliconst.ui5.metaui.core
 * @public
 */
export abstract class PluginStateBase implements IPluginStateReceiver {
    protected control?: Control;
    protected mainControl?: Control;
    protected associatedLabel?: Label;
    protected metadata?: IPropertyMetadata;
    protected fieldKey?: string;
    protected isEditable: boolean = true;

    /**
     * Applies dynamic state changes (e.g., `readOnly`, `required`) to the concrete UI5 control.
     */
    protected abstract applyState(): void;

    /**
     * Associates a companion `sap.m.Label` with this plugin so Fiori `labelFor` accessibility
     * and dynamic `required` / `visible` policy changes remain synchronized.
     *
     * @param label The companion UI5 Label control.
     */
    public setAssociatedLabel(label: Label): void {
        this.associatedLabel = label;
        const target = this.mainControl ?? this.control;
        if (target && typeof label.setLabelFor === "function") {
            label.setLabelFor(target);
        }
    }

    /**
     * Returns the runtime ID of the primary interactive control (`this.mainControl`) or outer control (`this.control`).
     *
     * @returns {string | undefined} The UI5 control ID.
     */
    public getControlId(): string | undefined {
        return this.mainControl ? this.mainControl.getId() : this.control ? this.control.getId() : undefined;
    }

    /**
     * Sets the global editable state for this plugin before rendering.
     *
     * @param editable True to render in edit mode, false for display mode.
     */
    public setEditable(editable: boolean): void {
        this.isEditable = editable;
    }

    /**
     * Sets the visual validation state on the primary interactive UI5 control (`this.mainControl ?? this.control`).
     *
     * @param isValid True if the control value is valid.
     * @param errorMessage Optional validation error text.
     */
    public setVisualValidationState(isValid: boolean, errorMessage?: string): void {
        const target = this.mainControl ?? this.control;
        if (target) {
            ControlDirectiveUtil.applyVisualValidationState(target, isValid, errorMessage);
        }
    }

    /**
     * Applies an error message to the control's visual state (`IPluginStateReceiver` implementation).
     *
     * @param errorMessage The validation error message to display.
     */
    public applyError(errorMessage: string): void {
        this.setVisualValidationState(false, errorMessage);
    }

    /**
     * Clears any visual error state on the control (`IPluginStateReceiver` implementation).
     */
    public clearError(): void {
        this.setVisualValidationState(true);
    }

    /**
     * Returns the human-readable field label for error reporting (`IPluginStateReceiver` implementation).
     *
     * @returns {string | undefined} The resolved label string.
     */
    public getFieldLabel(): string | undefined {
        return this.metadata?.ui?.label || this.metadata?.title || this.fieldKey;
    }

    /**
     * Dynamically updates a specific state property (`visible`, `editable`, `required`, `valid`) at runtime.
     *
     * @param property The state aspect to update.
     * @param value The boolean state value.
     * @param message Optional error message when `property === "valid"`.
     */
    public setState(property: "visible" | "editable" | "required" | "valid", value: boolean, message?: string): void {
        if (!this.control) {
            return;
        }
        switch (property) {
            case "visible":
                this.applyVisibility(value);
                break;
            case "editable":
                this.applyEditable(value);
                break;
            case "required":
                this.applyRequired(value);
                break;
            case "valid":
                this.setVisualValidationState(value, message);
                this.applyState();
                break;
        }
    }

    /**
     * Returns whether the outer control is currently visible (`getVisible() !== false`).
     *
     * @returns {boolean} True if the control is visible, false if hidden.
     */
    public isVisible(): boolean {
        return this.control && typeof this.control.getVisible === "function" ? this.control.getVisible() : true;
    }

    /**
     * Applies dynamic visibility changes to the outer control and any associated label.
     *
     * @param visible True to show the control, false to hide.
     */
    public applyVisibility(visible: boolean): void {
        if (this.control && typeof this.control.setVisible === "function") {
            this.control.setVisible(visible);
        }
        const parent = this.control?.getParent() as Control | undefined;
        if (
            parent &&
            typeof parent.data === "function" &&
            parent.data("metauiFieldWrapper") === true &&
            typeof parent.setVisible === "function"
        ) {
            parent.setVisible(visible);
        }
        if (this.associatedLabel && typeof this.associatedLabel.setVisible === "function") {
            this.associatedLabel.setVisible(visible);
        }
        if (!visible) {
            this.clearError();
        }
    }

    /**
     * Evaluates whether the concrete control should be interactive based on host editability
     * and property-level `readOnly` / `ui.readOnly` / `ui.enabled` directives.
     *
     * @returns {boolean} True if the control should be editable/enabled.
     */
    protected isControlEditable(): boolean {
        if (!this.isEditable || !this.metadata) {
            return false;
        }
        return !this.metadata.readOnly && !this.metadata.ui?.readOnly && this.metadata.ui?.enabled !== false;
    }

    /**
     * Applies dynamic editability changes to the primary interactive control (`this.mainControl ?? this.control`).
     *
     * @param editable True to enable editing, false for read-only.
     */
    public applyEditable(editable: boolean): void {
        if (!this.isEditable) {
            return;
        }
        if (this.metadata) {
            this.metadata.readOnly = !editable;
            this.metadata.ui = this.metadata.ui || {};
            this.metadata.ui.readOnly = !editable;
            if (editable && this.metadata.ui.enabled === false) {
                this.metadata.ui.enabled = true;
            }
        }
        ControlDirectiveUtil.applyEditableState(this.mainControl ?? this.control, this.isControlEditable());
        this.applyState();
    }

    /**
     * Applies dynamic required state changes to the primary interactive control and any associated label.
     *
     * @param required True if the field is mandatory.
     */
    public applyRequired(required: boolean): void {
        if (this.metadata) {
            this.metadata.required = required;
        }
        ControlDirectiveUtil.applyRequiredState(this.mainControl ?? this.control, required);
        if (this.associatedLabel && typeof this.associatedLabel.setRequired === "function") {
            this.associatedLabel.setRequired(required);
        }
        this.applyState();
    }

    /**
     * Destroys the underlying UI5 control and releases references.
     */
    public destroy(): void {
        if (this.control) {
            this.control.destroy();
            this.control = undefined;
        }
        this.mainControl = undefined;
        this.associatedLabel = undefined;
    }
}
