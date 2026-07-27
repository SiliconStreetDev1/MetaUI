sap.ui.define([
    "metaui/sandbox/controller/BaseController",
    "sap/ui/model/json/JSONModel",
    "metaui/sandbox/util/ScenarioManager",
    "metaui/sandbox/util/SnippetGenerator",
    "nz/co/siliconst/ui5/metaui/swagger/OpenApiExtractor",
    "sap/m/MessageToast",
    "sap/ui/core/routing/History",
    "nz/co/siliconst/ui5/metaui/controls/DynamicHost",
    "sap/base/Log"
], function (BaseController, JSONModel, ScenarioManager, SnippetGenerator, OpenApiExtractor, MessageToast, History, DynamicHost, Log) {
    "use strict";

    /**
     * @class
     * Controller for the MetaUI Scenario Runner.
     * Acts as an exhaustive matrix testing framework, iterating across all combinations of:
     * Data Scenarios, Binding Types (String vs Object), Render Targets (Declarative vs Programmatic),
     * and Core Engine Settings (Live Updates, Editability).
     * 
     * @extends metaui.sandbox.controller.BaseController
     * @alias metaui.sandbox.controller.ScenarioRunner
     */
    return BaseController.extend("metaui.sandbox.controller.ScenarioRunner", {
        
        /**
         * Lifecycle hook.
         * Bootstraps the runner state, view models, and attaches to the standard routing lifecycle.
         * 
         * @public
         */
        onInit: function () {
            this.setupViewModel();

            this.oModel = new JSONModel({
                ui: {
                    title: "Scenario Runner",
                    mode: "kitchen_sink"
                },
                scenarios: [],
                settings: {
                    selectedScenario: "",
                    selectedBinding: "object",
                    selectedRender: "embedded",
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

            var oRouter = this.getOwnerComponent().getRouter();
            oRouter.getRoute("scenario").attachPatternMatched(this._onRouteMatched, this);
        },

        /**
         * Intercepts the route match to determine which suite of tests to load (e.g., standard schemas vs OpenAPI).
         * Fetches the manifest from the ScenarioManager and applies filtering.
         * 
         * @private
         * @param {sap.ui.base.Event} oEvent The route matched event.
         */
        _onRouteMatched: function (oEvent) {
            var sMode = oEvent.getParameter("arguments").mode;
            this.oModel.setProperty("/ui/mode", sMode);

            var sTitle = "Scenario Runner";
            var sDefaultScenario = "";
            
            if (sMode === "kitchen_sink") {
                sTitle = "Schema Scenarios";
                sDefaultScenario = "kitchen_sink";
            } else if (sMode === "openapi") {
                sTitle = "OpenApi Integration";
                sDefaultScenario = "openapi_v3_complex";
                this.oModel.setProperty("/settings/useOpenApi", true);
            }

            this.oModel.setProperty("/ui/title", sTitle);
            
            ScenarioManager.getIndex().then(function(aScenarios) {
                var flatScenarios = [];
                aScenarios.forEach(function(cat) {
                    if (cat.scenarios) {
                        flatScenarios = flatScenarios.concat(cat.scenarios);
                    } else {
                        flatScenarios.push(cat); 
                    }
                });

                var filtered = flatScenarios.filter(function(s) {
                    if (sMode === "openapi") {
                        return s.key.startsWith("openapi");
                    } else if (sMode === "kitchen_sink") {
                        var whitelist = ["kitchen_sink", "hybrid_inference", "full_inference", "wizard", "complex_nested"];
                        return whitelist.indexOf(s.key) !== -1;
                    }
                    return false;
                });
                this.oModel.setProperty("/scenarios", filtered);

                if (filtered.some(s => s.key === sDefaultScenario)) {
                    this.oModel.setProperty("/settings/selectedScenario", sDefaultScenario);
                } else if (filtered.length > 0) {
                    this.oModel.setProperty("/settings/selectedScenario", filtered[0].key);
                }
                
                this.onMatrixChange();
            }.bind(this));
        },

        /**
         * Orchestrates the transition between different testing mock datasets.
         * Parses and normalizes incoming scenario structures into standard JSON strings and objects.
         * 
         * @public
         * @param {sap.ui.base.Event} [oEvent] Optional event from a list click.
         */
        onMatrixChange: function (oEvent) {
            if (oEvent && oEvent.getParameter("listItem")) {
                var sKey = oEvent.getParameter("listItem").getBindingContext().getProperty("key");
                this.oModel.setProperty("/settings/selectedScenario", sKey);
            }

            var sScenario = this.oModel.getProperty("/settings/selectedScenario");
            if (!sScenario) return;

            var oList = this.byId("scenarioList");
            if (oList && !oEvent) {
                var aItems = oList.getItems();
                for (var i = 0; i < aItems.length; i++) {
                    if (aItems[i].getBindingContext().getProperty("key") === sScenario) {
                        oList.setSelectedItem(aItems[i]);
                        break;
                    }
                }
            }

            ScenarioManager.getScenario(sScenario).then(function(oScenario) {
                this.oModel.setProperty("/current/data", JSON.stringify(oScenario.data, null, 2));
                
                var schemaStr = "";
                if (oScenario.schema && Object.keys(oScenario.schema).length > 0) {
                    schemaStr = JSON.stringify(oScenario.schema, null, 2);
                }
                this.oModel.setProperty("/current/schema", schemaStr);
                
                try {
                    this.oModel.setProperty("/current/dataObj", JSON.parse(this.oModel.getProperty("/current/data") || "{}"));
                    var sSchema = this.oModel.getProperty("/current/schema");
                    var oSchemaObj = sSchema ? JSON.parse(sSchema) : null;
                    this.oModel.setProperty("/current/schemaObj", oSchemaObj);
                    
                    var aTargets = OpenApiExtractor.extractTargets(oSchemaObj);
                    this.oModel.setProperty("/settings/schemaTargets", aTargets);
                } catch(e) {
                    Log.trace("[ScenarioRunner] Ignored parse error while swapping scenarios: " + e.message);
                }
                
                if (oScenario.schemaTarget) {
                    this.oModel.setProperty("/settings/schemaTarget", oScenario.schemaTarget);
                } else if (this.oModel.getProperty("/settings/schemaTargets").length > 0) {
                    this.oModel.setProperty("/settings/schemaTarget", this.oModel.getProperty("/settings/schemaTargets")[0].key);
                }
                
                this.updateCodeSnippets();
            }.bind(this)).catch(this.handleError.bind(this));
        },

        /**
         * Triggers the SnippetGenerator to compile realistic Fiori XML and JS controller 
         * snippets that developers can copy/paste based on the active testing matrix settings.
         * 
         * @public
         */
        updateCodeSnippets: function() {
            var oSettings = this.oModel.getProperty("/settings");
            
            var js = SnippetGenerator.generateJS(oSettings);
            this.oModel.setProperty("/current/jsSnippet", js);

            SnippetGenerator.fetchXML(oSettings.selectedBinding).then(function(xml) {
                this.oModel.setProperty("/current/xmlSnippet", xml);
            }.bind(this));
        },

        /**
         * Monitors real-time typing in the data string payload editor.
         * Silently catches syntax errors to prevent UI locking during mid-keystroke invalid JSON.
         * 
         * @public
         */
        onInboundChange: function () {
            try {
                this.oModel.setProperty("/current/dataObj", JSON.parse(this.oModel.getProperty("/current/data") || "{}"));
            } catch(e) {
                Log.trace("[ScenarioRunner] Ignored invalid inbound JSON during typing: " + e.message);
            }
        },

        /**
         * Monitors real-time typing in the schema editor.
         * Silently catches syntax errors to prevent UI locking during mid-keystroke invalid JSON.
         * 
         * @public
         */
        onSchemaChange: function () {
            try {
                var sSchema = this.oModel.getProperty("/current/schema");
                this.oModel.setProperty("/current/schemaObj", sSchema ? JSON.parse(sSchema) : null);
            } catch(e) {
                Log.trace("[ScenarioRunner] Ignored invalid schema JSON during typing: " + e.message);
            }
        },

        /**
         * Master teardown and rebuild function.
         * Evaluates the testing matrix state and routes the generation logic to either 
         * programmatic JS instantiation or declarative XML Fragment instantiation.
         * 
         * @public
         */
        onGeneratePress: function () {
            var oSettings = this.oModel.getProperty("/settings");
            var container = this.byId("hostContainer");
            
            var items = container.getItems();
            items.forEach(function(item) {
                this.getView().removeDependent(item);
                item.destroy();
            }.bind(this));
            container.removeAllItems();

            this.onInboundChange();
            this.onSchemaChange();

            if (oSettings.selectedBinding === "programmatic" || oSettings.selectedRender === "js_scratch" || oSettings.selectedRender === "js_dialog") {
                this._instantiateProgrammaticHost(oSettings, container);
            } else {
                this._instantiateFragmentHost(oSettings, container);
            }
        },

        /**
         * Programmatically spins up a DynamicHost via standard `new` keyword logic.
         * Tests whether developers can securely bind objects or strings entirely in JS without XML definitions.
         * 
         * @private
         * @param {object} oSettings Current testing matrix settings.
         * @param {sap.ui.core.Control} container The parent rendering target.
         */
        _instantiateProgrammaticHost: function(oSettings, container) {
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
                
                if (oSettings.selectedBinding === "programmatic") {
                    host.setProperty("data", JSON.parse(this.oModel.getProperty("/current/data") || "{}"));
                    host.setProperty("schemaDefinition", JSON.parse(this.oModel.getProperty("/current/schema") || "{}"));
                } else if (oSettings.selectedBinding === "string") {
                    host.bindProperty("dataJson", { path: "/current/data" });
                    host.setProperty("schemaDefinition", this.oModel.getProperty("/current/schema"));
                } else if (oSettings.selectedBinding === "object") {
                    host.bindProperty("data", { path: "/current/dataObj" });
                    host.setProperty("schemaDefinition", this.oModel.getProperty("/current/schemaObj"));
                }
                
                if (oSettings.useOpenApi) {
                    host.bindProperty("schemaTarget", { path: "settings>/settings/schemaTarget" });
                }

                if (oSettings.selectedRender === "dialog" || oSettings.selectedRender === "js_dialog") {
                    this.getView().addDependent(host);
                    host.openInDialog("Programmatic Dialog", "Submit", "Cancel", "auto", this.getView());
                } else {
                    container.addItem(host);
                }
            } catch (e) {
                Log.error("[ScenarioRunner] Fatal error instantiating programmatic host: " + e.message);
                MessageToast.show("Fatal error instantiating programmatic host: " + e.message);
            }
        },

        /**
         * Uses `sap.ui.core.Fragment.load` to simulate a declarative XML initialization of MetaUI.
         * Tests whether the engine correctly boots itself based solely on OneWay or TwoWay XML binding paths.
         * 
         * @private
         * @param {object} oSettings Current testing matrix settings.
         * @param {sap.ui.core.Control} container The parent rendering target.
         */
        _instantiateFragmentHost: function(oSettings, container) {
            var sFragmentName = oSettings.selectedBinding === "string" ? "StringBinding" : "ObjectBinding";
            
            sap.ui.core.Fragment.load({
                name: "metaui.sandbox.view.fragments." + sFragmentName,
                controller: this
            }).then(function(oHost) {
                this.getView().addDependent(oHost);

                if (oSettings.useOpenApi) {
                    oHost.bindProperty("schemaTarget", { path: "settings>/settings/schemaTarget" });
                }

                if (oSettings.selectedRender === "dialog") {
                    oHost.openInDialog("XML Fragment Dialog", "Extract Data", "Cancel", "auto", this.getView());
                } else {
                    container.addItem(oHost);
                }
            }.bind(this));
        },

        /**
         * Constructs a meta-level MetaUI engine strictly for configuring the Sandbox settings.
         * Proves MetaUI's ability to recursively manage its own configuration UI.
         * 
         * @public
         */
        onSettingsPress: function () {
            var settingsSchema = {
                type: "object",
                layoutStrategy: "form",
                properties: {
                    selectedBinding: {
                        title: "Binding Engine",
                        type: "string",
                        enum: ["object", "string", "programmatic"]
                    },
                    selectedRender: {
                        title: "Render Target",
                        type: "string",
                        enum: ["embedded", "dialog", "js_scratch", "js_dialog"]
                    },
                    liveUpdate: { title: "Live Updates", type: "boolean" },
                    useMessageManager: { title: "Global Errors", type: "boolean" },
                    editable: { title: "Editable", type: "boolean" },
                    debugMode: { title: "Debug Mode", type: "boolean" },
                    logFieldChanges: { title: "Log Field Changes", type: "boolean" },
                    forceCustomError: { title: "Force Custom Errors", type: "boolean" }
                }
            };

            if (this.oModel.getProperty("/ui/mode") === "openapi") {
                settingsSchema.properties.useOpenApi = { title: "Parse as OpenAPI", type: "boolean" };
            }

            var settingsHost = new DynamicHost({
                schemaDefinition: settingsSchema,
                liveUpdate: true
            });

            this.getView().addDependent(settingsHost);
            settingsHost.bindProperty("data", { path: "settings>/settings" });

            settingsHost.openInDialog("Configuration Settings", "Apply", "Cancel", "auto", this.getView());
        },

        /**
         * Intercepts the programmatic request to extract data, forcing a global validation check.
         * 
         * @public
         */
        onExtractPress: function () {
            var container = this.byId("hostContainer");
            var items = container.getItems();
            if (items.length > 0 && items[0].triggerSubmit) {
                if (items[0].triggerSubmit()) {
                    MessageToast.show("Submit Gate Passed! Data extracted.");
                } else {
                    MessageToast.show("Validation Failed. Submission blocked.");
                }
            }
        },

        /**
         * Catch-all crash handler bubbled up from the host engines.
         * 
         * @public
         * @param {sap.ui.base.Event} oEvent The engine crash event.
         */
        onHostError: function (oEvent) {
            MessageToast.show(oEvent.getParameter("message") || "An error occurred.");
        },

        /**
         * Intercepts individual field changes to synchronize UI modifications back to the JSON models,
         * or inject fake error states for testing purposes.
         * 
         * @public
         * @param {sap.ui.base.Event} oEvent The fieldChange event.
         */
        onHostFieldChange: function (oEvent) {
            var sPath = oEvent.getParameter("fieldPath");
            var payload = oEvent.getParameter("payload");
            var oSettings = this.oModel.getProperty("/settings");

            if (sPath && oSettings.forceCustomError) {
                oEvent.getSource().addCustomError(sPath, "Forced error.");
            } else if (sPath) {
                oEvent.getSource().clearCustomError(sPath);
            }

            if (oSettings.logFieldChanges && sPath) {
                MessageToast.show("Field modified: " + sPath);
            }

            if (oSettings.liveUpdate) {
                this.oModel.setProperty("/current/data", JSON.stringify(payload, null, 2));
            }
        },

        /**
         * Captures the ultimate, structurally-sound payload after validation passes.
         * 
         * @public
         * @param {sap.ui.base.Event} oEvent The submit event containing the JSON payload.
         */
        onHostSubmit: function (oEvent) {
            var payload = oEvent.getParameter("payload");
            sap.ui.require(["sap/m/MessageBox"], function(MessageBox) {
                MessageBox.success("Successfully extracted payload:\n\n" + JSON.stringify(payload, null, 2));
            });
        },

        /**
         * Navigates the router back through UI5 history securely.
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
         * Evaluates the MessageModel to natively toggle the Fiori validation popover.
         * 
         * @public
         * @param {sap.ui.base.Event} oEvent The message button press event.
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
                                description: "{message>target}"
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
