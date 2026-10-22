/**
 * @file LinkPlugin.ts
 * @description Renders a sap.m.Link control for URI/URL strings with safe protocol validation.
 */

import { BasePlugin } from "./BasePlugin";
import { IPropertyMetadata } from "../../interfaces/ISchema";
import Link from "sap/m/Link";
import Control from "sap/ui/core/Control";
import { UrlValidator } from "../../utils/UrlValidator";

/**
 * Handles rendering logic for URI/URL strings as clickable links (`sap.m.Link`).
 * Validates the target URL protocol via `UrlValidator.isSafeNavigationUrl` to block unsafe schemes (`javascript:`, `data:`).
 *
 * @namespace nz.co.siliconst.ui5.metaui.plugins.controls
 * @public
 */
export class LinkPlugin extends BasePlugin {
    /**
     * Renders a `sap.m.Link` component bound to the target URL string.
     *
     * @param metadata The specific JSON schema properties for this field.
     * @param bindingPath The JSON path bound to this control.
     * @param modelName The UI5 JSONModel name.
     * @param engineScopeId The deterministic scope ID.
     * @param onChange The callback fired on value change.
     * @returns {Control} The configured Link control.
     */
    public render(
        metadata: IPropertyMetadata,
        bindingPath: string,
        modelName: string = "meta",
        engineScopeId?: string,
        onChange?: (isValid: boolean, fieldKey?: string, errorMessage?: string, controlId?: string) => void
    ): Control {
        this.initialize(metadata, bindingPath, modelName, onChange);

        const safeHrefBinding = this.generateBindingInfo(bindingPath, modelName, undefined, {
            formatter: (val: unknown) => (UrlValidator.isSafeNavigationUrl(val) ? val.trim() : "")
        });

        this.control = new Link({
            id: this.generateStableId(engineScopeId, bindingPath),
            text: (metadata.ui?.placeholder || this.generateBindingInfo(bindingPath, modelName)) as unknown as string,
            href: safeHrefBinding as unknown as string,
            target: "_blank",
            enabled: this.isControlEditable()
        });

        this.applyCommonDirectives(this.control, metadata, modelName);
        return this.control;
    }

    /**
     * Retrieves the current URL value from the bound model or Link `href` property.
     * @param sourceControl Optional cloned control instance for table rows.
     * @returns {unknown} The URL string.
     */
    protected getValue(sourceControl?: Control): unknown {
        const target = sourceControl || this.control;
        const modelVal = this.getModelValue(target);
        if (modelVal !== undefined && modelVal !== null) {
            return modelVal;
        }
        return target ? (target as Link).getProperty("href") : null;
    }

    /**
     * Applies dynamic enabled state based on `isEditable` and `readOnly` metadata.
     */
    protected applyState(): void {
        if (this.control && this.metadata) {
            const link = this.control as Link;
            link.setEnabled(this.isControlEditable());
        }
    }
}
