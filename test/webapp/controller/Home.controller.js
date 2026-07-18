sap.ui.define([
    "sap/ui/core/mvc/Controller"
], function (Controller) {
    "use strict";

    return Controller.extend("metaui.sandbox.controller.Home", {
        onNavToScenario: function (oEvent) {
            var oTile = oEvent.getSource();
            var sScenario = oTile.data("scenario");
            this.getOwnerComponent().getRouter().navTo("playground", {
                scenario: sScenario
            });
        }
    });
});
