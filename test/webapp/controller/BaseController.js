sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/core/routing/History",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessagePopover",
    "sap/m/MessageItem",
    "sap/ui/core/Core",
    "sap/m/MessageToast",
    "sap/m/Dialog",
    "sap/m/Button",
    "nz/co/siliconst/ui5/metaui/controls/DynamicHost",
    "sap/base/Log"
], function (Controller, History, JSONModel, MessagePopover, MessageItem, Core, MessageToast, Dialog, Button, DynamicHost, Log) {
    "use strict";

    return Controller.extend("metaui.sandbox.controller.BaseController", {

        /**
         * Convenience method for accessing the router.
         * @public
         * @returns {sap.ui.core.routing.Router} the router for this component
         */
        getRouter: function () {
            return sap.ui.core.UIComponent.getRouterFor(this);
        },

        /**
         * Convenience method for getting the view model by name.
         * @public
         * @param {string} [sName] the model name
         * @returns {sap.ui.model.Model} the model instance
         */
        getModel: function (sName) {
            return this.getView().getModel(sName);
        },

        /**
         * Convenience method for setting the view model.
         * @public
         * @param {sap.ui.model.Model} oModel the model instance
         * @param {string} sName the model name
         * @returns {sap.ui.mvc.View} the view instance
         */
        setModel: function (oModel, sName) {
            return this.getView().setModel(oModel, sName);
        },

        /**
         * Lifecycle hook.
         * Subclasses should call this in their onInit to setup common Sandbox wiring.
         */
        setupViewModel: function () {
            var oViewModel = new JSONModel({
                debugMode: true,
                liveUpdate: true,
                editable: true,
                scenarioDescription: ""
            });
            this.setModel(oViewModel, "viewModel");

            // Setup MessageManager
            var oMessageManager = Core.getMessageManager();
            this.getView().setModel(oMessageManager.getMessageModel(), "message");

            return oViewModel;
        },

        onScenarioInfo: function () {
            var oViewModel = this.getModel("viewModel");
            var description = oViewModel.getProperty("/scenarioDescription");
            sap.ui.require(["sap/m/MessageBox"], function (MessageBox) {
                MessageBox.information(description, { title: "Scenario Objective" });
            });
        },

        /**
         * Event handler for navigating back.
         * It checks if there is a history entry. If yes, history.go(-1) happens.
         * If not, it replaces the current entry of the browser history with the master route.
         * @public
         */
        onNavBack: function () {
            var sPreviousHash = History.getInstance().getPreviousHash();

            if (sPreviousHash !== undefined) {
                // The history contains a previous entry
                window.history.go(-1);
            } else {
                // Otherwise we go backwards with a forward history
                var bReplace = true;
                this.getRouter().navTo("home", {}, bReplace);
            }
        },

        /**
         * Shield CodeEditor from UI5 TwoWay invalidation bug by updating separate properties
         */
        onInboundStringChange: function (oEvent) {
            var newVal = oEvent.getParameter("value");
            var oViewModel = this.getModel("viewModel");

            // Push strings down to the native bindings
            oViewModel.setProperty("/rawJsonStringIn", newVal);

            try {
                var parsed = JSON.parse(newVal);
                oViewModel.setProperty("/parsedData", parsed);
            } catch (e) {
                // Ignore while typing
            }
        },

        onTriggerSubmit: function () {
            var oHost = this.byId("metaHost");
            if (oHost) {
                oHost.triggerSubmit();
            }
        },

        onMessagePopoverPress: function (oEvent) {
            var oSourceControl = oEvent.getSource();
            if (!this._messagePopover) {
                this._messagePopover = new MessagePopover({
                    items: {
                        path: "message>/",
                        template: new MessageItem({
                            type: "{message>type}",
                            title: "{message>message}",
                            subtitle: "{message>additionalText}",
                            description: "{message>description}"
                        })
                    }
                });
                this.getView().addDependent(this._messagePopover);
            }
            this._messagePopover.toggle(oSourceControl);
        },

        onRegenerate: function () {
            var oViewModel = this.getModel("viewModel");
            var schemaStr = oViewModel.getProperty("/schemaString") || "";
            var dataStr = oViewModel.getProperty("/editorDataString") || "";

            try {
                var parsedSchema = schemaStr.trim() === "" ? null : JSON.parse(schemaStr);
                var parsedData = dataStr.trim() === "" ? null : JSON.parse(dataStr);

                // Update native bindings
                oViewModel.setProperty("/parsedSchema", parsedSchema);
                oViewModel.setProperty("/parsedData", parsedData);
                oViewModel.setProperty("/rawJsonStringIn", dataStr);

                MessageToast.show("UI successfully regenerated from editor code.");
            } catch (e) {
                MessageToast.show("Invalid JSON: " + e.message);
            }
        },

        onOpenDialog: function () {
            var oViewModel = this.getModel("viewModel");
            var oHost = new DynamicHost({
                schemaDefinition: oViewModel.getProperty("/parsedSchema"),
                data: oViewModel.getProperty("/parsedData"),
                editable: oViewModel.getProperty("/editable"),
                debugMode: oViewModel.getProperty("/debugMode")
            });

            // Wire up the submit event to extract data when the user clicks the configurable button
            oHost.attachSubmit(function(oEvent) {
                var params = oEvent.getParameters();
                var payload = params.payload;
                var sPayload = JSON.stringify(payload, null, 2);
                console.log("----- DIALOG SUBMIT TRIGGERED -----");
                console.log("oEvent.getParameters():", params);
                console.log("Extracted payload:", payload);
                console.log("Stringified payload:", sPayload);
                Log.info("[Sandbox] Popup Submit Payload:", payload);
                
                sap.ui.require(["sap/m/MessageBox"], function(MessageBox) {
                    MessageBox.success("Payload successfully extracted from MetaUI.", {
                        title: "Extracted Payload",
                        details: sPayload || "No payload extracted."
                    });
                });
            });

            // Make sure the host is attached to the view lifecycle for models/theming
            this.getView().addDependent(oHost);

            // Trigger the native internal popup framework with configurable submit text
            oHost.openInDialog("MetaUI Sandbox Dialog", "Extract Payload");
        },

        /* =========================================================== */
        /* DynamicHost Event Handlers                                  */
        /* =========================================================== */

        onFieldChange: function (oEvent) {
            var fieldPath = oEvent.getParameter("fieldPath");
            var isValid = oEvent.getParameter("isValid");
            var payload = oEvent.getParameter("payload");
            
            Log.info("[Sandbox] Field Changed: " + fieldPath + " (Valid: " + isValid + ")");
            
            var oViewModel = this.getModel("viewModel");
            if (oViewModel && oViewModel.getProperty("/liveUpdate") && payload) {
                oViewModel.setProperty("/editorDataString", JSON.stringify(payload, null, 2));
            }
        },

        onValidationStateChanged: function (oEvent) {
            var isValid = oEvent.getParameter("isValid");
            Log.info("[Sandbox] Global Validation State Changed. Valid: " + isValid);
        },

        onBeforeSubmit: function (oEvent) {
            Log.info("[Sandbox] Before Submit fired.");
        },

        onSubmit: function (oEvent) {
            var isValid = oEvent.getParameter("isValid");
            var payload = oEvent.getParameter("payload");

            if (isValid) {
                MessageToast.show("Submit successful! Check console for payload.");
                Log.info("[Sandbox] Submit Payload:", payload);
            } else {
                MessageToast.show("Submit failed: Validation errors exist.");
                Log.error("[Sandbox] Submit failed due to validation errors.");
            }
        },

        /**
         * Generic error handler for dynamically instantiated hosts or components.
         * Logs the error cleanly and surfaces it via a MessageToast.
         * 
         * @public
         * @param {string|Error} vError The error message or error object
         * @returns {void}
         */
        handleError: function (vError) {
            var sMessage = (typeof vError === "object" && vError.message) ? vError.message : vError;
            sap.ui.require(["sap/m/MessageToast", "sap/base/Log"], function(MessageToast, Log) {
                Log.error("[Sandbox BaseController]", sMessage);
                MessageToast.show("An error occurred: " + sMessage);
            });
        }

    });

});
