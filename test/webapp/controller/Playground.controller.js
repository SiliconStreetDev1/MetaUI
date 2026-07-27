sap.ui.define([
    "metaui/sandbox/controller/BaseController",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/ui/core/routing/History",
    "nz/co/siliconst/ui5/metaui/swagger/OpenApiExtractor",
    "nz/co/siliconst/ui5/metaui/controls/DynamicHost",
    "sap/base/Log"
], function (BaseController, JSONModel, MessageToast, History, OpenApiExtractor, DynamicHost, Log) {
    "use strict";

    /**
     * @class
     * Controller for the isolated MetaUI Playground.
     * Provides a completely blank slate for manually typing or pasting JSON schemas and payloads
     * to test the engine's inference and generation capabilities.
     * 
     * @extends metaui.sandbox.controller.BaseController
     * @alias metaui.sandbox.controller.Playground
     */
    return BaseController.extend("metaui.sandbox.controller.Playground", {
        
        /**
         * Lifecycle hook.
         * Initializes the local view model with blank payload and schema states to ensure a pristine playground environment.
         * 
         * @public
         */
        onInit: function () {
            this.setupViewModel();

            this.oModel = new JSONModel({
                settings: {
                    useOpenApi: false,
                    liveUpdate: true,
                    useMessageManager: true,
                    editable: true,
                    debugMode: false,
                    logFieldChanges: false,
                    forceCustomError: false,
                    schemaTarget: "",
                    schemaTargets: []
                },
                current: {
                    data: "",
                    schema: ""
                }
            });
            this.getView().setModel(this.oModel);
            this.getView().setModel(this.oModel, "settings");

            var oMessageManager = sap.ui.getCore().getMessageManager();
            this.getView().setModel(oMessageManager.getMessageModel(), "message");
        },

        /**
         * Dynamically spawns a configuration settings dialog natively using the MetaUI engine itself.
         * This allows developers to test MetaUI's ability to render complex forms inside popups dynamically.
         * 
         * @public
         */
        onSettingsPress: function () {
            var settingsSchema = {
                type: "object",
                layoutStrategy: "form",
                properties: {
                    useOpenApi: { title: "Parse as OpenAPI", type: "boolean" },
                    liveUpdate: { title: "Live Updates", type: "boolean" },
                    useMessageManager: { title: "Global Errors", type: "boolean" },
                    editable: { title: "Editable", type: "boolean" },
                    debugMode: { title: "Debug Mode", type: "boolean" },
                    logFieldChanges: { title: "Log Field Changes", type: "boolean" },
                    forceCustomError: { title: "Force Custom Errors", type: "boolean" }
                }
            };

            var settingsHost = new DynamicHost({
                schemaDefinition: settingsSchema,
                liveUpdate: true
            });

            this.getView().addDependent(settingsHost);
            settingsHost.bindProperty("data", { path: "settings>/settings" });

            settingsHost.openInDialog("Configuration Settings", "Apply", "Cancel", "auto", this.getView());
        },

        /**
         * Monitors real-time typing in the schema editor.
         * Dynamically detects Swagger/OpenAPI structures and surfaces available generation targets in the toolbar.
         * 
         * @public
         */
        onSchemaChange: function () {
            var sSchema = this.oModel.getProperty("/current/schema");
            try {
                var oSchemaObj = sSchema ? JSON.parse(sSchema) : null;
                var aTargets = OpenApiExtractor.extractTargets(oSchemaObj);
                this.oModel.setProperty("/settings/schemaTargets", aTargets);
                
                // If a targets array exists and current target is empty or invalid, select the first one
                var sCurrentTarget = this.oModel.getProperty("/settings/schemaTarget");
                if (aTargets.length > 0) {
                    var bExists = aTargets.some(function(t) { return t.key === sCurrentTarget; });
                    if (!bExists) {
                        this.oModel.setProperty("/settings/schemaTarget", aTargets[0].key);
                    }
                    this.oModel.setProperty("/settings/useOpenApi", true); // Auto-toggle openapi mode for convenience
                }
            } catch(e) {
                Log.trace("[Playground] Ignored invalid schema JSON during typing: " + e.message);
            }
        },

        /**
         * Parses the manually typed schema and payload strings and orchestrates the programmatic instantiation 
         * of a fresh MetaUI DynamicHost instance.
         * 
         * @public
         */
        onGeneratePress: function() {
            var oSettings = this.oModel.getProperty("/settings");
            var container = this.byId("hostContainer");
            
            // Teardown the previously running host instance
            var items = container.getItems();
            items.forEach(function(item) {
                this.getView().removeDependent(item);
                item.destroy();
            }.bind(this));
            container.removeAllItems();

            try {
                var host = new DynamicHost({
                    error: this.onHostError.bind(this),
                    fieldChange: this.onHostFieldChange.bind(this),
                    submit: this.onHostSubmit.bind(this)
                });
                
                host.bindProperty("liveUpdate", { path: "settings>/settings/liveUpdate" });
                host.bindProperty("editable", { path: "settings>/settings/editable" });
                host.bindProperty("debugMode", { path: "settings>/settings/debugMode" });
                host.bindProperty("useMessageManager", { path: "settings>/settings/useMessageManager" });
                
                host.bindProperty("dataJson", { path: "/current/data" });
                host.setProperty("schemaDefinition", this.oModel.getProperty("/current/schema"));
                
                if (oSettings.useOpenApi) {
                    host.bindProperty("schemaTarget", { path: "settings>/settings/schemaTarget" });
                }

                container.addItem(host);
            } catch (e) {
                Log.error("[Playground] Fatal error instantiating programmatic host: " + e.message);
                MessageToast.show("Fatal error instantiating programmatic host: " + e.message);
            }
        },

        /**
         * Generic error handler to surface engine crashes cleanly.
         * 
         * @public
         * @param {sap.ui.base.Event} oEvent The error event from DynamicHost.
         */
        onHostError: function (oEvent) {
            var msg = oEvent.getParameter("message") || "An error occurred in the engine.";
            sap.ui.require(["sap/m/MessageToast"], function(MessageToast) {
                MessageToast.show(msg);
            });
        },

        /**
         * Intercepts individual field changes to test custom validation error injection
         * and to synchronize live payloads back to the code editor.
         * 
         * @public
         * @param {sap.ui.base.Event} oEvent The fieldChange event.
         */
        onHostFieldChange: function (oEvent) {
            var sPath = oEvent.getParameter("fieldPath");
            var bIsValid = oEvent.getParameter("isValid");
            var payload = oEvent.getParameter("payload");
            var host = oEvent.getSource();
            
            var oSettings = this.oModel.getProperty("/settings");

            if (sPath) {
                if (oSettings.forceCustomError) {
                    host.addCustomError(sPath, "Forced custom error from toggle.");
                } else {
                    host.clearCustomError(sPath);
                }
            }

            if (oSettings.logFieldChanges && sPath) {
                sap.ui.require(["sap/m/MessageToast"], function(MessageToast) {
                    MessageToast.show("Field modified: " + sPath + "\nValid: " + bIsValid);
                });
            }

            if (oSettings.liveUpdate) {
                this.oModel.setProperty("/current/data", JSON.stringify(payload, null, 2));
            }
        },

        /**
         * Surfaces the natively extracted JSON payload from a valid submit event.
         * 
         * @public
         * @param {sap.ui.base.Event} oEvent The submit event containing the payload.
         */
        onHostSubmit: function (oEvent) {
            var payload = oEvent.getParameter("payload");
            sap.ui.require(["sap/m/MessageBox"], function(MessageBox) {
                MessageBox.success("Successfully extracted payload natively via submit event:\n\n" + JSON.stringify(payload, null, 2));
            });
        },

        /**
         * Programmatically triggers a mock extraction on the running DynamicHost.
         * Evaluates structural integrity before allowing submission.
         * 
         * @public
         */
        onExtractPress: function () {
            var container = this.byId("hostContainer");
            var items = container.getItems();
            if (items.length > 0) {
                var host = items[0];
                if (host.triggerSubmit) {
                    if (host.triggerSubmit()) {
                        MessageToast.show("Submit Gate Passed! Data extracted.");
                    } else {
                        MessageToast.show("Validation Failed. Submission blocked.");
                    }
                }
            } else {
                MessageToast.show("No engine running to extract from.");
            }
        },

        /**
         * Event handler for navigating back.
         * 
         * @public
         */
        onNavBack: function () {
            var sPreviousHash = History.getInstance().getPreviousHash();
            if (sPreviousHash !== undefined) {
                window.history.go(-1);
            } else {
                this.getOwnerComponent().getRouter().navTo("home", {}, true);
            }
        },

        /**
         * Toggles the UI5 core MessagePopover dynamically instantiated on demand.
         * 
         * @public
         * @param {sap.ui.base.Event} oEvent The button press event.
         */
        onMessagePopoverPress: function (oEvent) {
            var oSourceControl = oEvent.getSource();
            sap.ui.require(["sap/m/MessagePopover", "sap/m/MessageItem"], function(MessagePopover, MessageItem) {
                if (!this._messagePopover) {
                    this._messagePopover = new MessagePopover({
                        items: {
                            path: "message>/",
                            template: new MessageItem({
                                type: "{message>type}",
                                title: "{message>message}",
                                description: "{message>target}",
                                subtitle: "{message>additionalText}"
                            })
                        }
                    });
                    this.getView().addDependent(this._messagePopover);
                }
                this._messagePopover.toggle(oSourceControl);
            }.bind(this));
        }
    });
});
