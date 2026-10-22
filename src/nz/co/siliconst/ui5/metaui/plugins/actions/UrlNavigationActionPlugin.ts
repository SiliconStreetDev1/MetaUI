/**
 * @file UrlNavigationActionPlugin.ts
 * @description Action plugin that renders a button to navigate to a validated URL.
 */

import { BasePlugin } from "../controls/BasePlugin";
import { IPropertyMetadata } from "../../interfaces/ISchema";
import Button from "sap/m/Button";
import Control from "sap/ui/core/Control";
import Event from "sap/ui/base/Event";
import JSONModel from "sap/ui/model/json/JSONModel";
import { ButtonType, URLHelper } from "sap/m/library";
import { UrlValidator } from "../../utils/UrlValidator";
import { Logger } from "../../utils/Logger";

/**
 * Plugin responsible for rendering a URL navigation action button (`ui.widget = "urlButton"`).
 * Validates the target URL protocol via `UrlValidator.isSafeNavigationUrl` before redirecting.
 *
 * @namespace nz.co.siliconst.ui5.metaui.plugins.actions
 * @public
 */
export class UrlNavigationActionPlugin extends BasePlugin {
    /**
     * Renders a `sap.m.Button` that opens the bound or configured URL in a new tab when pressed.
     *
     * @param metadata The specific JSON schema properties for this action field.
     * @param bindingPath The JSON path bound to this control.
     * @param modelName The UI5 JSONModel name.
     * @param engineScopeId The deterministic scope ID.
     * @param onChange The callback fired on value change.
     * @returns {Control} The configured URL Navigation Button control.
     */
    public render(
        metadata: IPropertyMetadata,
        bindingPath: string,
        modelName: string = "meta",
        engineScopeId?: string,
        onChange?: (isValid: boolean, fieldKey?: string, errorMessage?: string, controlId?: string) => void
    ): Control {
        this.initialize(metadata, bindingPath, modelName, onChange);

        const fallbackLabel = metadata.ui?.label || "Open Link";
        const textBinding = this.generateBindingInfo(bindingPath, modelName, undefined, {
            formatter: (val: unknown) => {
                if (typeof val !== "string") {
                    return fallbackLabel;
                }
                const labelText: string = val.trim();
                return labelText && !UrlValidator.isSafeNavigationUrl(val) ? labelText : fallbackLabel;
            }
        });

        this.control = new Button({
            id: this.generateStableId(engineScopeId, bindingPath),
            text: textBinding as unknown as string,
            type: ButtonType.Default,
            icon: "sap-icon://action",
            enabled: this.isControlEditable(),
            press: (oEvent: Event) => {
                const src = (oEvent.getSource() as Control | undefined) ?? this.control;
                const rawUrl = this.resolveTargetUrl(metadata, src);
                if (UrlValidator.isSafeNavigationUrl(rawUrl)) {
                    URLHelper.redirect(rawUrl.trim(), true);
                } else {
                    Logger.warn(
                        "[MetaUI UrlNavigationActionPlugin]",
                        `Blocked navigation to unsafe or empty URL: '${String(rawUrl)}'`,
                        "UrlNavigationActionPlugin"
                    );
                }
            }
        });

        this.applyCommonDirectives(this.control, metadata, modelName);
        return this.control;
    }

    /**
     * Resolves the target URL from either the bound `JSONModel` property, `metadata.ui.options.url`, or `metadata.default`.
     *
     * @param metadata The action property metadata.
     * @param sourceControl Optional runtime source control (e.g., cloned table cell).
     * @returns {unknown} The candidate URL string.
     */
    private resolveTargetUrl(metadata: IPropertyMetadata, sourceControl?: Control): unknown {
        const target = sourceControl ?? this.control;
        if (target) {
            const model = (target.getModel(this.modelName) || this.engineContext?.getModel()) as
                | JSONModel
                | undefined;
            if (model) {
                const boundVal = model.getProperty(this.resolveAbsolutePath(target));
                if (typeof boundVal === "string" && UrlValidator.isSafeNavigationUrl(boundVal)) {
                    return boundVal;
                }
            }
        }
        if (metadata.ui?.options && typeof metadata.ui.options.url === "string") {
            return metadata.ui.options.url;
        }
        if (typeof metadata.ui?.args === "string") {
            return metadata.ui.args;
        }
        return metadata.default;
    }

    /**
     * Action buttons do not hold user data and never fail schema validation.
     * @returns {{ isValid: boolean; errorMessage?: string }} Always `{ isValid: true }`.
     */
    public override validate(): { isValid: boolean; errorMessage?: string } {
        return { isValid: true };
    }

    /**
     * Retrieves the resolved target URL string.
     * @param sourceControl Optional runtime source control (e.g., cloned table cell).
     * @returns {unknown} The target URL string or `null`.
     */
    protected getValue(sourceControl?: Control): unknown {
        return this.metadata ? this.resolveTargetUrl(this.metadata, sourceControl) : null;
    }

    /**
     * Updates the button's `enabled` state when `isEditable` or `readOnly` changes.
     */
    protected applyState(): void {
        if (this.control && this.metadata) {
            (this.control as Button).setEnabled(this.isControlEditable());
        }
    }
}
