/**
 * @file BaseHardwareControlRenderer.ts
 * @description Standard renderer for all MetaUI hardware controls.
 * 
 * @namespace nz.co.siliconst.ui5.metaui.controls
 */
import RenderManager from "sap/ui/core/RenderManager";
import BaseHardwareControl from "./BaseHardwareControl";

import Control from "sap/ui/core/Control";
export default {
    apiVersion: 2,
    render: function (rm: RenderManager, control: BaseHardwareControl) {
        rm.openStart("div", control);
        rm.class("sapUiSmallMarginBottom");
        rm.openEnd();
        
        const content = control.getAggregation("_content") as Control;
        if (content) {
            rm.renderControl(content);
        }
        
        if (typeof control.renderContent === "function") {
            control.renderContent(rm, control);
        }
        
        rm.close("div");
    }
};
