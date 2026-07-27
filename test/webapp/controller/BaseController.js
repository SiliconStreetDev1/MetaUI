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

    /**
     * @class
     * Base Controller for the Sandbox application.
     * Provides common routing, view model setup, and generic event handlers for testing MetaUI capabilities.
     * 
     * @extends sap.ui.core.mvc.Controller
     * @alias metaui.sandbox.controller.BaseController
     */
    return Controller.extend("metaui.sandbox.controller.BaseController", {

        /**
         * Convenience method for accessing the router in every controller of the application.
         * 
         * @public
         * @returns {sap.ui.core.routing.Router} The router for this component.
         */
        getRouter: function () {
            return sap.ui.core.UIComponent.getRouterFor(this);
        },

        /**
         * Convenience method for getting the view model by name in every controller of the application.
         * 
         * @public
         * @param {string} [sName] The model name.
         * @returns {sap.ui.model.Model} The model instance.
         */
        getModel: function (sName) {
            return this.getView().getModel(sName);
        },

        /**
         * Convenience method for setting the view model in every controller of the application.
         * 
         * @public
         * @param {sap.ui.model.Model} oModel The model instance.
         * @param {string} sName The model name.
         * @returns {sap.ui.mvc.View} The view instance.
         */
        setModel: function (oModel, sName) {
            return this.getView().setModel(oModel, sName);
        },

        /**
         * Lifecycle hook to initialize standard sandbox settings.
         * Subclasses should call this in their onInit to setup common Sandbox wiring.
         * 
         * @public
         * @returns {sap.ui.model.json.JSONModel} The newly created view model.
         */
        setupViewModel: function () {
            var oViewModel = new JSONModel({
                debugMode: true,
                liveUpdate: true,
                editable: true,
                scenarioDescription: ""
            });
            this.setModel(oViewModel, "viewModel");

            // Setup global MessageManager to catch UI5 validation messages
            var oMessageManager = Core.getMessageManager();
            this.getView().setModel(oMessageManager.getMessageModel(), "message");

            return oViewModel;
        },

        /**
         * Displays the objective and instructions for the currently loaded scenario.
         * 
         * @public
         */
        onScenarioInfo: function () {
            var oViewModel = this.getModel("viewModel");
            var description = oViewModel.getProperty("/scenarioDescription");
            sap.ui.require(["sap/m/MessageBox"], function (MessageBox) {
                MessageBox.information(description, { title: "Scenario Objective" });
            });
        },

        /**
         * Event handler for navigating back.
         * Resolves the UI5 history hash and navigates back seamlessly.
         * If no previous hash exists, routes back to the home page.
         * 
         * @public
         */
        onNavBack: function () {
            var sPreviousHash = History.getInstance().getPreviousHash();

            if (sPreviousHash !== undefined) {
                window.history.go(-1);
            } else {
                this.getRouter().navTo("home", {}, true);
            }
        },

        /**
         * Shields the CodeEditor from immediate invalid JSON parses.
         * Pushes raw strings down to bindings and safely parses them if structurally sound.
         * 
         * @public
         * @param {sap.ui.base.Event} oEvent The inbound change event from the code editor.
         */
        onInboundStringChange: function (oEvent) {
            var newVal = oEvent.getParameter("value");
            var oViewModel = this.getModel("viewModel");

            oViewModel.setProperty("/rawJsonStringIn", newVal);

            try {
                var parsed = JSON.parse(newVal);
                oViewModel.setProperty("/parsedData", parsed);
            } catch (e) {
                Log.trace("[Sandbox] Ignored invalid JSON during manual typing: " + e.message);
            }
        },

        /**
         * Forces the dynamically bound MetaUI host to validate and extract its current payload.
         * 
         * @public
         */
        onTriggerSubmit: function () {
            var oHost = this.byId("metaHost");
            if (oHost) {
                oHost.triggerSubmit();
            }
        },

        /**
         * Toggles the global MessagePopover containing centralized UI validation state errors.
         * 
         * @public
         * @param {sap.ui.base.Event} oEvent The press event originating from the message indicator button.
         */
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

        /**
         * Parses the manually typed JSON strings from the CodeEditors and re-binds them 
         * to trigger a full regeneration of the internal MetaUI layout.
         * 
         * @public
         */
        onRegenerate: function () {
            var oViewModel = this.getModel("viewModel");
            var schemaStr = oViewModel.getProperty("/schemaString") || "";
            var dataStr = oViewModel.getProperty("/editorDataString") || "";

            try {
                var parsedSchema = schemaStr.trim() === "" ? null : JSON.parse(schemaStr);
                var parsedData = dataStr.trim() === "" ? null : JSON.parse(dataStr);

                oViewModel.setProperty("/parsedSchema", parsedSchema);
                oViewModel.setProperty("/parsedData", parsedData);
                oViewModel.setProperty("/rawJsonStringIn", dataStr);

                MessageToast.show("UI successfully regenerated from editor code.");
            } catch (e) {
                MessageToast.show("Invalid JSON: " + e.message);
            }
        },

        /**
         * Programmatically builds a MetaUI engine and mounts it natively inside a popup dialog.
         * Useful for testing popup orchestration decoupled from static XML views.
         * 
         * @public
         */
        onOpenDialog: function () {
            var oViewModel = this.getModel("viewModel");
            var oHost = new DynamicHost({
                schemaDefinition: oViewModel.getProperty("/parsedSchema"),
                data: oViewModel.getProperty("/parsedData"),
                editable: oViewModel.getProperty("/editable"),
                debugMode: oViewModel.getProperty("/debugMode")
            });

            oHost.attachSubmit(function(oEvent) {
                var params = oEvent.getParameters();
                var payload = params.payload;
                var sPayload = JSON.stringify(payload, null, 2);
                
                Log.info("[Sandbox] Popup Submit Payload:", payload);
                
                sap.ui.require(["sap/m/MessageBox"], function(MessageBox) {
                    MessageBox.success("Payload successfully extracted from MetaUI.", {
                        title: "Extracted Payload",
                        details: sPayload || "No payload extracted."
                    });
                });
            });

            this.getView().addDependent(oHost);
            oHost.openInDialog("MetaUI Sandbox Dialog", "Extract Payload");
        },

        /* =========================================================== */
        /* DynamicHost Event Handlers                                  */
        /* =========================================================== */

        /**
         * Handles native field modifications bubbled up from the MetaUI Engine.
         * 
         * @public
         * @param {sap.ui.base.Event} oEvent The field change event containing the updated payload.
         */
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

        /**
         * Tracks shifts in the engine's global structural validity.
         * 
         * @public
         * @param {sap.ui.base.Event} oEvent The validation state event.
         */
        onValidationStateChanged: function (oEvent) {
            var isValid = oEvent.getParameter("isValid");
            Log.info("[Sandbox] Global Validation State Changed. Valid: " + isValid);
        },

        /**
         * Intercepts the submit flow directly prior to validation.
         * 
         * @public
         * @param {sap.ui.base.Event} oEvent The beforeSubmit event.
         */
        onBeforeSubmit: function (oEvent) {
            Log.info("[Sandbox] Before Submit fired.");
        },

        /**
         * Captures the ultimate, structurally-sound payload after validation passes.
         * 
         * @public
         * @param {sap.ui.base.Event} oEvent The submit event containing the JSON payload.
         */
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
         * @param {string|Error} vError The error message or error object.
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
