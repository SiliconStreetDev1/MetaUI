/**
 * @file ActionButtonPlugin.ts
 * @description Shared abstract base class for the action trigger plugins that render a single
 * `sap.m.Button` carrying no user data: submit, clear, and URL navigation.
 */

import { BasePlugin } from "../controls/BasePlugin";
import { IPropertyMetadata } from "../../interfaces/ISchema";
import Button from "sap/m/Button";
import Control from "sap/ui/core/Control";
import Event from "sap/ui/base/Event";
import { ButtonType } from "sap/m/library";
import { PropertyBindingInfo } from "sap/ui/base/ManagedObject";
import { I18n, MetaUITextKey } from "../../utils/I18n";

/**
 * Static configuration descriptor for a concrete `ActionButtonPlugin` subclass.
 *
 * @namespace nz.co.siliconst.ui5.metaui.plugins.actions
 * @public
 */
export interface IActionButtonConfig {
    /** Bundle key for the label shown when the bound value supplies none. */
    fallbackLabelKey: MetaUITextKey;
    /** The `sap.m.ButtonType` applied to the trigger. */
    buttonType: ButtonType;
    /** The `sap-icon://` identifier shown on the trigger. */
    icon: string;
}

/**
 * Shared abstract base class for `SubmitFormActionPlugin`, `ClearFormActionPlugin`, and
 * `UrlNavigationActionPlugin`.
 *
 * Action buttons hold no user data, so `getValue` is `null` and `validate` always passes. What the
 * three otherwise repeat is the label binding, the button construction, and the `enabled` lifecycle.
 * Collecting them here turns the one real difference between them into a declaration: the mutating
 * buttons take the default and go dead under a read-only host, while a navigation affordance
 * overrides {@link ActionButtonPlugin.resolveEnabled} and
 * {@link ActionButtonPlugin.isEnabledStateExternallyOwned} and stays reachable.
 *
 * @namespace nz.co.siliconst.ui5.metaui.plugins.actions
 * @public
 */
export abstract class ActionButtonPlugin extends BasePlugin {
    protected abstract readonly actionConfig: IActionButtonConfig;

    /**
     * Renders the configured `sap.m.Button` trigger.
     *
     * @param metadata The specific JSON schema properties for this action field.
     * @param bindingPath The JSON path bound to this control.
     * @param modelName The UI5 JSONModel name.
     * @param engineScopeId The deterministic scope ID.
     * @param onChange The callback fired on value change.
     * @returns {Control} The configured action Button control.
     */
    public render(
        metadata: IPropertyMetadata,
        bindingPath: string,
        modelName: string = "meta",
        engineScopeId?: string,
        onChange?: (isValid: boolean, fieldKey?: string, errorMessage?: string, controlId?: string) => void
    ): Control {
        this.initialize(metadata, bindingPath, modelName, onChange);

        this.control = new Button({
            id: this.generateStableId(engineScopeId, bindingPath),
            text: this.buildLabelBinding(metadata, bindingPath, modelName) as unknown as string,
            type: this.actionConfig.buttonType,
            icon: this.actionConfig.icon,
            enabled: this.resolveEnabled(),
            press: (oEvent: Event) => {
                this.onPress(oEvent);
            }
        });

        this.applyCommonDirectives(this.control, metadata, modelName);
        return this.control;
    }

    /**
     * Performs the action behind the trigger.
     *
     * Implementations read `this.metadata`, never a render-time closure: a policy effect replaces
     * the metadata through `updateMetadata`, and a handler that captured the original object would
     * act on a target the field no longer has.
     *
     * @param event The `sap.m.Button` press event.
     */
    protected abstract onPress(event: Event): void;

    /**
     * Builds the button's `text` binding: the bound value when it reads as a label, otherwise the
     * configured fallback.
     *
     * @param metadata The action property metadata.
     * @param bindingPath The JSON path bound to this control.
     * @param modelName The UI5 JSONModel name.
     * @returns {PropertyBindingInfo | string} The label binding descriptor.
     */
    protected buildLabelBinding(
        metadata: IPropertyMetadata,
        bindingPath: string,
        modelName: string
    ): PropertyBindingInfo | string {
        const fallbackLabel = metadata.ui?.label || I18n.getText(this.actionConfig.fallbackLabelKey);
        return this.generateBindingInfo(bindingPath, modelName, undefined, {
            formatter: (val: unknown) => this.resolveLabelText(val, fallbackLabel)
        });
    }

    /**
     * Chooses the label text for a bound value. Overridden where the bound value is the action's
     * target rather than its caption.
     *
     * @param val The current bound value.
     * @param fallbackLabel The configured fallback caption.
     * @returns {string} The caption to paint on the button.
     */
    protected resolveLabelText(val: unknown, fallbackLabel: string): string {
        return typeof val === "string" && val.trim() ? val.trim() : fallbackLabel;
    }

    /**
     * Resolves whether the trigger is interactive. The default follows host editability, because a
     * read-only host must not let the user mutate the form.
     *
     * @returns {boolean} True when the button should be enabled.
     */
    protected resolveEnabled(): boolean {
        return this.isControlEditable();
    }

    /**
     * Reports whether something other than this plugin owns the button's `enabled` state, in which
     * case `applyState` must not overwrite it. The default is that the plugin owns it.
     *
     * @returns {boolean} True when `applyState` should leave `enabled` alone.
     */
    protected isEnabledStateExternallyOwned(): boolean {
        return false;
    }

    /**
     * Action buttons do not hold user data and never fail schema validation.
     *
     * @returns {{ isValid: boolean; errorMessage?: string }} Always `{ isValid: true }`.
     */
    public override validate(): { isValid: boolean; errorMessage?: string } {
        return { isValid: true };
    }

    /**
     * Action buttons have no bound value.
     *
     * @param sourceControl Optional runtime source control (e.g., cloned table cell).
     * @returns {unknown} Always `null`.
     */
    protected getValue(sourceControl?: Control): unknown {
        void sourceControl;
        return null;
    }

    /**
     * Updates the button's `enabled` state when `isEditable` or `readOnly` changes.
     */
    protected applyState(): void {
        if (!this.control || !this.metadata || this.isEnabledStateExternallyOwned()) {
            return;
        }
        (this.control as Button).setEnabled(this.resolveEnabled());
    }
}
