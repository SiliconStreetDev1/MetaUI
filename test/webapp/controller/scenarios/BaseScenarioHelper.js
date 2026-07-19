sap.ui.define([
    "sap/ui/base/Object",
    "sap/m/MessageToast"
], function (BaseObject, MessageToast) {
    "use strict";

    /**
     * @class BaseScenarioHelper
     * @description Base OOP class for managing Sandbox scenarios. Provides standard, fallback implementations 
     * for form events (onBeforeSubmit, onSubmit, onFieldChange).
     */
    return BaseObject.extend("metaui.sandbox.controller.scenarios.BaseScenarioHelper", {

        /**
         * Initializes the Scenario Helper.
         * @param {sap.ui.core.mvc.Controller} oController The main Playground controller instance.
         */
        constructor: function (oController) {
            BaseObject.apply(this, arguments);
            this._oController = oController;
        },

        /**
         * Fired before the final validation pipeline executes.
         * @param {sap.ui.base.Event} oEvent The beforeSubmit event.
         */
        onBeforeSubmit: function (oEvent) {
            var payload = oEvent.getParameter("payload");
            var addError = oEvent.getParameter("addError");
            var preventDefault = oEvent.getParameter("preventDefault");

            // Generic check across any scenario: If any field named "Name" or "CustomerName" is exactly "error"
            var sNameKey = Object.keys(payload).find(key => key && typeof key === 'string' && key.includes("Name"));
            if (sNameKey && payload[sNameKey] && typeof payload[sNameKey] === "string" && payload[sNameKey].toLowerCase() === "error") {
                addError(sNameKey, "You are not allowed to use the name 'error'.");
                preventDefault();
            }
        },

        /**
         * Fired after the form passes all validations and submits successfully.
         * @param {sap.ui.base.Event} oEvent The submit event.
         */
        onSubmit: function (oEvent) {
            var payload = oEvent.getParameter("payload");
            var oViewModel = this._oController.viewModel;
            
            // Push payload directly to the data viewer
            oViewModel.setProperty("/dataString", JSON.stringify(payload, null, 2));

            this._oController.byId("outputConsole").setValue(
                "--- EXTRACTED PAYLOAD ---\n\n" +
                JSON.stringify(payload, null, 2)
            );
            MessageToast.show("Payload successfully extracted!");

            // Navigate to Payload Data tab
            var oIconTabBar = this._oController.byId("idIconTabBar");
            if (oIconTabBar) {
                oIconTabBar.setSelectedKey("data");
            }
        },

        /**
         * Fired whenever a field's value changes natively in the UI5 control.
         * @param {sap.ui.base.Event} oEvent The fieldChange event.
         */
        onFieldChange: function (oEvent) {
            var sFieldPath = oEvent.getParameter("fieldPath");
            var sValue = oEvent.getParameter("value");
            var oHost = oEvent.getSource();

            // Generic Async Validation fallback
            if (sFieldPath && typeof sFieldPath === 'string' && sFieldPath.includes("Name") && sValue) {
                // Lock the form while 'checking' the server
                oHost.setBusy(true);

                setTimeout(function () {
                    oHost.setBusy(false);
                    if (typeof sValue === "string" && sValue.toLowerCase() === "taken") {
                        oHost.addCustomError(sFieldPath, "This name is already taken in the database.");
                    } else {
                        oHost.clearCustomError(sFieldPath);
                    }
                }, 800);
            }
        }
    });
});
