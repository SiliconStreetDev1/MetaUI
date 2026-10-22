/**
 * @file BaseHardwareControlRenderer.ts
 * @description Standard renderer for all MetaUI hardware controls.
 *
 * @namespace nz.co.siliconst.ui5.metaui.controls
 */
import RenderManager from "sap/ui/core/RenderManager";
import BaseHardwareControl from "./BaseHardwareControl";
import Control from "sap/ui/core/Control";
import { ValueState } from "sap/ui/core/library";

export default {
    apiVersion: 2,
    /**
     * Renders the hardware control wrapper `div`, ARIA attributes, and its internal `_content` aggregation.
     *
     * @param rm The UI5 RenderManager instance.
     * @param control The BaseHardwareControl instance being rendered.
     */
    render: function (rm: RenderManager, control: BaseHardwareControl): void {
        const valueState = control.getValueState();
        const valueStateText = control.getValueStateText();

        rm.openStart("div", control);
        rm.class("sapUiSmallMarginBottom");
        rm.style("width", "100%");
        rm.attr("role", "group");
        if (valueState === ValueState.Error) {
            rm.attr("aria-invalid", "true");
            rm.style("border", "1px solid #b00");
            rm.style("border-radius", "4px");
            rm.style("padding", "0.25rem");
            rm.style("box-sizing", "border-box");
        }
        if (valueStateText) {
            rm.attr("title", valueStateText);
        }
        rm.openEnd();

        const content = control.getAggregation("_content") as Control | null;
        if (content) {
            rm.renderControl(content);
        }

        const showErr = valueState === ValueState.Error && Boolean(valueStateText);
        rm.openStart("div", `${control.getId()}-err`);
        rm.style("color", "#b00");
        rm.style("font-size", "0.75rem");
        rm.style("margin-top", "0.25rem");
        rm.style("display", showErr ? "block" : "none");
        rm.openEnd();
        rm.text(valueStateText || "");
        rm.close("div");

        rm.close("div");
    }
};
