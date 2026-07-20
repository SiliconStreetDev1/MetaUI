/**
 * @file UrlNavigationActionPlugin.ts
 * @description A custom action plugin that navigates to a URL.
 */

import { BasePlugin } from "../controls/BasePlugin";
import { IPropertyMetadata } from "../../interfaces/ISchema";
import Button from "sap/m/Button";
import Control from "sap/ui/core/Control";
import * as library from "sap/m/library";
const URLHelper = library.URLHelper;

/**
 * Renders a Button that triggers a redirect to an external URL (defined in args).
 * 
 * @namespace nz.co.siliconst.ui5.metaui.plugins.actions
 * @public
 */
export class UrlNavigationActionPlugin extends BasePlugin {
    public render(fieldMetadata: IPropertyMetadata, bindingPath: string, modelName: string = "meta"): Control {
        this.metadata = fieldMetadata;

        this.control = new Button({
            text: fieldMetadata.ui?.label || "Open Link",
            icon: "sap-icon://action",
            press: () => {
                // In a real scenario, the URL might come from the payload or from schema args
                const targetUrl = fieldMetadata.ui?.args || "https://sap.com";
                URLHelper.redirect(targetUrl as string, true); // true = open in new window
            }
        });

        return this.control as Control;
    }

    protected getValue(): unknown {
        return null;
    }

    protected applyState(): void {
        if (this.control && this.metadata) {
            (this.control as Button).setEnabled(!this.metadata.ui?.readOnly);
        }
    }
}
