sap.ui.define([
    "sap/ui/core/mvc/Controller"
], function (Controller) {
    "use strict";

    return Controller.extend("metaui.sandbox.controller.Home", {
        onInit: function () {
            // Check removed so user can freely click the tiles.
        },

        /**
         * Navigates to the playground view and passes the selected scenario name.
         * @param {sap.ui.base.Event} oEvent The press event fired by the GenericTile
         * @public
         */
        onNavToODataV4Rap: function () {
            this.getOwnerComponent().getRouter().navTo("odata_v4_rap");
        },

        onNavToDeepStructures: function () {
            this.getOwnerComponent().getRouter().navTo("deep_structures");
        },

        onNavToScenario: function (oEvent) {
            var oTile = oEvent.getSource();
            var sScenario = oTile.data("scenario");

            var oRouter = this.getOwnerComponent().getRouter();
            
            console.log("[MetaUI Sandbox] Navigating to scenario:", sScenario);
            
            // Navigate directly to the standalone scenario route
            oRouter.navTo(sScenario);
        }
    });
});
