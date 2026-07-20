/**
 * @file BaseHardwareControl.ts
 * @description Foundational UI5 Custom Control for hardware plugins.
 * Exposes a standard 'value' property for pure two-way data binding.
 * 
 */

import Control from "sap/ui/core/Control";
import RenderManager from "sap/ui/core/RenderManager";
import { IPropertyMetadata } from "../../interfaces/ISchema";
import BaseHardwareControlRenderer from "./BaseHardwareControlRenderer";

/**
 * @namespace nz.co.siliconst.ui5.metaui.controls
 */
export default class BaseHardwareControl extends Control {
    static readonly metadata = {
        properties: {
            /** The raw data value. Two-way bound to the model. */
            value: { type: "any", defaultValue: null },
            /** The schema metadata for rendering dynamic hints (like labels/readOnly) */
            schemaMetadata: { type: "object", defaultValue: null },
            /** Indicates if the control should be in a read-only state */
            readOnly: { type: "boolean", defaultValue: false }
        },
        aggregations: {
            _content: { type: "sap.m.VBox", multiple: false, visibility: "hidden" }
        },
        events: {
            /** Fired when the hardware successfully captures a value */
            capture: {
                parameters: {
                    value: { type: "any" }
                }
            }
        }
    };

    /**
     * Updates the bound value and fires the capture event.
     */
    public setValueAndFire(val: unknown): void {
        this.setProperty("value", val, true); // true to suppress re-rendering if desired, but we want the binding to update
        this.fireEvent("capture", { value: val });
    }

    /**
     * Common renderer for all hardware controls
     */
    static readonly renderer = BaseHardwareControlRenderer;

    /**
     * Abstract hook for subclasses to render their specific DOM/Controls.
     */
    public renderContent(rm: RenderManager, control: BaseHardwareControl): void {
        // To be overridden by hardware implementations
    }
}
