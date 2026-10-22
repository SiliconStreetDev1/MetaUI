sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/core/UIComponent"
], function (Controller, UIComponent) {
    "use strict";

    /**
     * @class
     * Main entry point controller for the MetaUI Sandbox.
     * Handles top-level routing to the various testing suites (Playground, Scenarios, Playpen, etc.).
     *
     * @extends sap.ui.core.mvc.Controller
     * @alias metaui.sandbox.controller.Home
     */
    return Controller.extend("metaui.sandbox.controller.Home", {

        /**
         * Navigates to the Kitchen Sink testing matrix suite.
         *
         * @public
         */
        onNavToKitchenSink: function () {
            var oRouter = UIComponent.getRouterFor(this);
            oRouter.navTo("scenario", { mode: "kitchen_sink" });
        },

        /**
         * Navigates to the Data Inference Playpen view.
         *
         * @public
         */
        onNavToPlaypen: function () {
            var oRouter = UIComponent.getRouterFor(this);
            oRouter.navTo("playpen");
        },

        /**
         * Navigates to the OpenAPI Integration testing suite.
         *
         * @public
         */
        onNavToOpenApi: function () {
            var oRouter = UIComponent.getRouterFor(this);
            oRouter.navTo("scenario", { mode: "openapi" });
        },

        /**
         * Navigates to the isolated, blank-slate MetaUI Playground.
         *
         * @public
         */
        onNavToSandbox: function () {
            var oRouter = UIComponent.getRouterFor(this);
            oRouter.navTo("playground");
        },

        /**
         * Navigates to the standalone OData V4 context binding test view.
         *
         * @public
         */
        onNavToOData: function () {
            var oRouter = UIComponent.getRouterFor(this);
            oRouter.navTo("odata");
        }
    });
});
