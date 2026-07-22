sap.ui.define([
    "metaui/sandbox/controller/BaseController",
    "sap/ui/model/json/JSONModel",
    "metaui/sandbox/util/ScenarioManager",
    "metaui/sandbox/util/SnippetGenerator",
    "sap/m/MessageToast"
], function (BaseController, JSONModel, ScenarioManager, SnippetGenerator, MessageToast) {
    "use strict";

    /**
     * @class
     * Controller for the Playground Sandbox view.
     * Orchestrates UI bindings and delegates logic to specific utility modules.
     * Authentic Testing: This controller loads genuine XML fragments or authentic JS programmatic paths to prove functionality.
     * 
     * @extends metaui.sandbox.controller.BaseController
     */
    return BaseController.extend("metaui.sandbox.controller.Playground", {
        
        /**
         * Lifecycle hook initializing the view model and loading the scenario index.
         * 
         * @public
         */
        onInit: function () {
            // Call base controller setup
            this.setupViewModel();

            this.oModel = new JSONModel({
                scenarios: [], // Populated dynamically
                settings: {
                    selectedScenario: "kitchen_sink",
                    selectedBinding: "object",
                    selectedRender: "embedded",
                    liveUpdate: true,
                    useMessageManager: true,
                    editable: true,
                    debugMode: false,
                    logFieldChanges: false,
                    forceCustomError: false
                },
                current: {
                    data: "{}",
                    schema: "{}",
                    xmlSnippet: "",
                    jsSnippet: ""
                }
            });
            this.getView().setModel(this.oModel);
            this.getView().setModel(this.oModel, "settings"); // Named model for direct programmatic bindings

            // Set global MessageManager model to the view for the footer button
            var oMessageManager = sap.ui.getCore().getMessageManager();
            this.getView().setModel(oMessageManager.getMessageModel(), "message");

            // Fetch scenarios asynchronously
            ScenarioManager.getIndex().then(function(aScenarios) {
                // Hardcode hide OData V4 Mock for now
                var filteredScenarios = aScenarios.filter(function(s) {
                    return s.key !== "odata_v4";
                });
                this.oModel.setProperty("/scenarios", filteredScenarios);
                
                // Ensure we don't try to default to a hidden scenario
                if (this.oModel.getProperty("/settings/selectedScenario") === "odata_v4" && filteredScenarios.length > 0) {
                    this.oModel.setProperty("/settings/selectedScenario", filteredScenarios[0].key);
                }
                this.onMatrixChange();
            }.bind(this)).catch(this.handleError.bind(this));
        },

        /**
         * Triggered when the user changes the selected scenario dropdown.
         * Fetches the new scenario payload and updates the snippets.
         * 
         * @public
         */
        onMatrixChange: function () {
            var selectedKey = this.oModel.getProperty("/settings/selectedScenario");
            if (!selectedKey) return;

            ScenarioManager.getScenario(selectedKey).then(function(oScenario) {
                this.oModel.setProperty("/current/data", JSON.stringify(oScenario.data, null, 2));
                this.oModel.setProperty("/current/schema", oScenario.schema ? JSON.stringify(oScenario.schema, null, 2) : "");
                
                try {
                    this.oModel.setProperty("/current/dataObj", JSON.parse(this.oModel.getProperty("/current/data") || "{}"));
                    var sSchema = this.oModel.getProperty("/current/schema");
                    this.oModel.setProperty("/current/schemaObj", sSchema ? JSON.parse(sSchema) : null);
                } catch(e) {
                    // Ignore parse errors while typing, but valid JSON is required for generation
                }

                this.updateCodeSnippets();
            }.bind(this)).catch(this.handleError.bind(this));
        },

        /**
         * Triggered when binding or render mode changes.
         * 
         * @public
         */
        onToggleChange: function() {
            this.updateCodeSnippets();
            
            // If the user turns off the global message manager, we must flush it immediately
            // to hide the footer popover button and clear old ghost errors.
            if (!this.oModel.getProperty("/settings/useMessageManager")) {
                sap.ui.getCore().getMessageManager().removeAllMessages();
            }
        },

        /**
         * Delegates snippet generation to the SnippetGenerator module.
         * 
         * @private
         */
        updateCodeSnippets: function() {
            var oSettings = this.oModel.getProperty("/settings");
            
            // Generate Authentic JS synchronously
            var js = SnippetGenerator.generateJS(oSettings);
            this.oModel.setProperty("/current/jsSnippet", js);

            // Fetch Authentic XML asynchronously
            SnippetGenerator.fetchXML(oSettings.selectedBinding).then(function(xml) {
                this.oModel.setProperty("/current/xmlSnippet", xml);
            }.bind(this));
        },

        /**
         * Main event handler to instantiate and mount the DynamicHost.
         * Authentic Testing: Directly loads the scenario's authentic fragment or tests the JS API.
         * 
         * @public
         */
        onGeneratePress: function() {
            var oSettings = this.oModel.getProperty("/settings");
            var container = this.byId("hostContainer");
            
            // CRITICAL MEMORY LEAK FIX:
            // Ensure destroyed items are fully removed from the View's dependents aggregation
            // to prevent UI5 element ID collisions and corrupted bindings.
            var items = container.getItems();
            items.forEach(function(item) {
                this.getView().removeDependent(item);
                item.destroy();
            }.bind(this));
            container.removeAllItems();

            // Bridge parse for object mode in case user edited inbound JSON
            try {
                this.oModel.setProperty("/current/dataObj", JSON.parse(this.oModel.getProperty("/current/data") || "{}"));
                var sSchema = this.oModel.getProperty("/current/schema");
                this.oModel.setProperty("/current/schemaObj", sSchema ? JSON.parse(sSchema) : null);
            } catch(e) {
                MessageToast.show("Invalid JSON in Editor: Cannot parse.");
                return;
            }

            if (oSettings.selectedBinding === "programmatic" || oSettings.selectedRender === "js_scratch" || oSettings.selectedRender === "js_dialog") {
                this._instantiateProgrammaticHost(oSettings, container);
            } else {
                this._instantiateFragmentHost(oSettings, container);
            }
        },

        /**
         * Instantiates the host programmatically based on the active JS scratch settings.
         * 
         * @private
         * @param {object} oSettings Active view settings
         * @param {sap.m.VBox} container The container to mount the host in
         */
        _instantiateProgrammaticHost: function(oSettings, container) {
            sap.ui.require(["nz/co/siliconst/ui5/metaui/controls/DynamicHost"], function(DynamicHost) {
                try {
                    var host = new DynamicHost({
                        error: this.onHostError.bind(this),
                        fieldChange: this.onHostFieldChange.bind(this),
                        submit: this.onHostSubmit.bind(this)
                    });
                    
                    // Natively bind settings so that toggling the toolbar switches instantly applies to programmatic tests
                    host.bindProperty("liveUpdate", { path: "settings>/settings/liveUpdate" });
                    host.bindProperty("editable", { path: "settings>/settings/editable" });
                    host.bindProperty("debugMode", { path: "settings>/settings/debugMode" });
                    host.bindProperty("useMessageManager", { path: "settings>/settings/useMessageManager" });
                    
                    if (oSettings.selectedBinding === "programmatic") {
                        host.setProperty("data", JSON.parse(this.oModel.getProperty("/current/data") || "{}"));
                        host.setProperty("schemaDefinition", JSON.parse(this.oModel.getProperty("/current/schema") || "{}"));
                    } else { // js_scratch or js_dialog
                        if (oSettings.selectedBinding === "string") {
                            host.bindProperty("dataJson", { path: "/current/data" });
                            host.bindProperty("schemaDefinition", { path: "/current/schema" });
                        } else if (oSettings.selectedBinding === "object") {
                            host.bindProperty("data", { path: "/current/dataObj" });
                            host.bindProperty("schemaDefinition", { path: "/current/schemaObj" });
                        } else if (oSettings.selectedBinding === "odata") {
                            host.bindElement({ path: "/Employees('E100')", model: "odata" });
                        }
                    }

                    if (oSettings.selectedRender === "dialog" || oSettings.selectedRender === "js_dialog") {
                        // CRITICAL: Must add as dependent BEFORE opening dialog so bindings resolve
                        this.getView().addDependent(host);
                        host.openInDialog("Programmatic Dialog", "Submit", "Cancel", "800px", this.getView());
                    } else {
                        container.addItem(host);
                    }
                } catch (e) {
                    MessageToast.show("Fatal error instantiating programmatic host: " + e.message);
                }
            }.bind(this), function(err) {
                MessageToast.show("Failed to require DynamicHost: " + err.message);
            });
        },

        /**
         * Loads the authentic XML fragment.
         * 
         * @private
         * @param {object} oSettings Active view settings
         * @param {sap.m.VBox} container The container to mount the host in
         */
        _instantiateFragmentHost: function(oSettings, container) {
            var fragmentMap = {
                "string": "StringBinding",
                "object": "ObjectBinding",
                "odata": "ODataBinding"
            };
            var sFragmentName = fragmentMap[oSettings.selectedBinding];
            if (!sFragmentName) {
                MessageToast.show("Unknown binding mode for fragment.");
                return;
            }

            sap.ui.core.Fragment.load({
                name: "metaui.sandbox.view.fragments." + sFragmentName,
                controller: this
            }).then(function(oHost) {
                this.getView().addDependent(oHost);

                if (oSettings.selectedRender === "dialog") {
                    oHost.openInDialog("XML Fragment Dialog", "Extract Data", "Cancel", "800px", this.getView());
                } else {
                    container.addItem(oHost);
                }
            }.bind(this)).catch(function(err) {
                MessageToast.show("Failed to load authentic fragment: " + err.message);
            });
        },

        /**
         * Event handler for engine validation errors.
         * 
         * @public
         * @param {sap.ui.base.Event} oEvent The UI5 Event object
         */
        onHostError: function (oEvent) {
            var msg = oEvent.getParameter("message") || "An error occurred in the engine.";
            sap.ui.require(["sap/m/MessageToast"], function(MessageToast) {
                MessageToast.show(msg);
            });
        },

        /**
         * Event handler for live updates from the engine.
         * 
         * @public
         * @param {sap.ui.base.Event} oEvent The UI5 Event object
         */
        onHostFieldChange: function (oEvent) {
            var sPath = oEvent.getParameter("fieldPath");
            var bIsValid = oEvent.getParameter("isValid");
            var payload = oEvent.getParameter("payload");
            var host = oEvent.getSource();
            
            var oSettings = this.oModel.getProperty("/settings");

            // Custom Error Injection Test
            if (sPath) {
                if (oSettings.forceCustomError) {
                    host.addCustomError(sPath, "Forced custom error from toggle.");
                } else {
                    host.clearCustomError(sPath);
                }
            }

            // Example: Log or act on specific field interactions without waiting for submit
            if (oSettings.logFieldChanges && sPath) {
                // We use MessageToast just to visually demonstrate the event firing in the test app
                sap.ui.require(["sap/m/MessageToast"], function(MessageToast) {
                    MessageToast.show("Field modified: " + sPath + "\nValid: " + bIsValid);
                });
            }

            if (oSettings.liveUpdate) {
                this.oModel.setProperty("/current/data", JSON.stringify(payload, null, 2));
            }
        },

        /**
         * Event handler for successful extraction pipeline.
         * 
         * @public
         * @param {sap.ui.base.Event} oEvent The UI5 Event object
         */
        onHostSubmit: function (oEvent) {
            var payload = oEvent.getParameter("payload");
            sap.ui.require(["sap/m/MessageBox"], function(MessageBox) {
                MessageBox.success("Successfully extracted payload natively via submit event:\n\n" + JSON.stringify(payload, null, 2));
            });
        },

        /**
         * Forces programmatic extraction of the active engine instance.
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
         * Toggles the Message Popover in the footer.
         * 
         * @public
         * @param {sap.ui.base.Event} oEvent The press event
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
