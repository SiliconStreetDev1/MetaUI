sap.ui.define([
    "sap/ui/core/mvc/Controller"
], function (Controller) {
    "use strict";

    return Controller.extend("metaui.sandbox.controller.Home", {
        /**
         * Navigates to the playground view and passes the selected scenario name.
         * @param {sap.ui.base.Event} oEvent The press event fired by the GenericTile
         * @public
         */
        onNavToScenario: function (oEvent) {
            var oTile = oEvent.getSource();
            var sScenario = oTile.data("scenario");
            this.getOwnerComponent().getRouter().navTo("playground", {
                scenario: sScenario
            });
        }
    });
});
