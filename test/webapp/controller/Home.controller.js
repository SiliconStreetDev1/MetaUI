sap.ui.define([
    "sap/ui/core/mvc/Controller"
], function (Controller) {
    "use strict";

    return Controller.extend("metaui.sandbox.controller.Home", {
        onInit: function () {
            // Check if we are running from index.html (static server)
            var bIsStaticServer = window.location.pathname.endsWith("index.html");
            if (bIsStaticServer) {
                // Disable the OData V4 Mock Server scenarios
                var oTile1 = this.byId("tileODataV4RAP");
                var oTile2 = this.byId("tileODataV4Object");
                if (oTile1) {
                    oTile1.setFailedText("Requires Mock Server");
                    oTile1.setState("Failed");
                }
                if (oTile2) {
                    oTile2.setFailedText("Requires Mock Server");
                    oTile2.setState("Failed");
                }
            }
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

            if (oTile.getState() === "Failed") {
                sap.ui.require(["sap/m/MessageToast"], function(MessageToast) {
                    MessageToast.show("OData V4 Mock Server scenarios are disabled. Please launch the app via the mock server startup script (e.g., npm run start:mock).");
                });
                return;
            }

            var oRouter = this.getOwnerComponent().getRouter();
            
            console.log("[MetaUI Sandbox] Navigating to scenario:", sScenario);
            
            // Navigate directly to the standalone scenario route
            oRouter.navTo(sScenario);
        }
    });
});
