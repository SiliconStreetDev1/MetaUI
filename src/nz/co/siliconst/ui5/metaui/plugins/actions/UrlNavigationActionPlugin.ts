/**
 * @file UrlNavigationActionPlugin.ts
 * @description Action plugin that renders a button to navigate to a validated URL.
 */

import { ActionButtonPlugin, IActionButtonConfig } from "./ActionButtonPlugin";
import { IPropertyMetadata } from "../../interfaces/ISchema";
import Control from "sap/ui/core/Control";
import Event from "sap/ui/base/Event";
import JSONModel from "sap/ui/model/json/JSONModel";
import { ButtonType, URLHelper } from "sap/m/library";
import { UrlValidator } from "../../utils/UrlValidator";
import { Logger } from "../../utils/Logger";
import { TEXT_KEY } from "../../utils/I18n";

/**
 * Plugin responsible for rendering a URL navigation action button (`ui.widget = "urlButton"`).
 * Validates the target URL protocol via `UrlValidator.isSafeNavigationUrl` before redirecting.
 *
 * @namespace nz.co.siliconst.ui5.metaui.plugins.actions
 * @internal
 */
export class UrlNavigationActionPlugin extends ActionButtonPlugin {
    protected readonly actionConfig: IActionButtonConfig = {
        fallbackLabelKey: TEXT_KEY.actionOpenLink,
        buttonType: ButtonType.Default,
        icon: "sap-icon://action"
    };

    /**
     * This button opens a URL in a new tab and mutates nothing, so it is a navigation affordance exactly like
     * `LinkPlugin`: a read-only host must not make the target unreachable. The mutating action buttons
     * (`SubmitFormActionPlugin`, `ClearFormActionPlugin`) deliberately keep the default and stay disabled.
     */
    protected override readonly isNavigationAffordance: boolean = true;

    /**
     * Opens the resolved target URL in a new tab, refusing anything the URL policy rejects.
     *
     * @param event The `sap.m.Button` press event.
     */
    protected onPress(event: Event): void {
        const src = (event.getSource() as Control | undefined) ?? this.control;
        const rawUrl = this.metadata ? this.resolveTargetUrl(this.metadata, src) : undefined;
        if (UrlValidator.isSafeNavigationUrl(rawUrl)) {
            URLHelper.redirect(rawUrl.trim(), true);
            return;
        }
        Logger.warn(`Blocked navigation to unsafe or empty URL: '${String(rawUrl)}'`, undefined, "UrlNavigationActionPlugin");
    }

    /**
     * The bound value here is the navigation target, not a caption, so a bound value that reads as a
     * safe URL must not be painted on the button.
     *
     * @param val The current bound value.
     * @param fallbackLabel The configured fallback caption.
     * @returns {string} The caption to paint on the button.
     */
    protected override resolveLabelText(val: unknown, fallbackLabel: string): string {
        if (typeof val !== "string") {
            return fallbackLabel;
        }
        const labelText: string = val.trim();
        return labelText && !UrlValidator.isSafeNavigationUrl(val) ? labelText : fallbackLabel;
    }

    /**
     * Navigation stays available under `readOnly` and in display mode; only an explicit
     * `ui.enabled: false` switches it off.
     *
     * @returns {boolean} True when the affordance should remain clickable.
     */
    protected override resolveEnabled(): boolean {
        return this.isAffordanceEnabled();
    }

    /**
     * An explicit `ui.enabledOn` expression is bound onto the button by `applyCommonDirectives` and
     * always wins, so `applyState` must not overwrite it.
     *
     * @returns {boolean} True when an `ui.enabledOn` expression owns the enabled state.
     */
    protected override isEnabledStateExternallyOwned(): boolean {
        return Boolean(this.metadata?.ui?.enabledOn);
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
     * Retrieves the resolved target URL string.
     *
     * @param sourceControl Optional runtime source control (e.g., cloned table cell).
     * @returns {unknown} The target URL string or `null`.
     */
    protected override getValue(sourceControl?: Control): unknown {
        return this.metadata ? this.resolveTargetUrl(this.metadata, sourceControl) : null;
    }
}
