sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/core/UIComponent"
], function (Controller, UIComponent) {
    "use strict";

    return Controller.extend("metaui.sandbox.controller.Home", {
        onInit: function () {
        },

        onNavToPlayground: function () {
            var oRouter = UIComponent.getRouterFor(this);
            oRouter.navTo("playground");
        },

        onNavToOData: function () {
            var oRouter = UIComponent.getRouterFor(this);
            oRouter.navTo("odata");
        },

        onNavToPlaypen: function () {
            var oRouter = UIComponent.getRouterFor(this);
            oRouter.navTo("playpen");
        }
    });
});
