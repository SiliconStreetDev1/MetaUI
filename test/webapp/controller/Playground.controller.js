sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/core/routing/History",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/m/MessagePopover",
    "sap/m/MessageItem",
    "nz/co/siliconst/ui5/metaui/controls/GeneratorHost",
    "nz/co/siliconst/ui5/metaui/core/PipelineManager",
    "nz/co/siliconst/ui5/metaui/core/PluginRegistry",
    "nz/co/siliconst/ui5/metaui/plugins/validators/EmailValidatorPlugin",
    "nz/co/siliconst/ui5/metaui/plugins/formatters/CurrencyFormatterPlugin",
    "nz/co/siliconst/ui5/metaui/plugins/actions/ClearFormActionPlugin",
    "nz/co/siliconst/ui5/metaui/plugins/datasources/RemoteValueHelpPlugin",
    "nz/co/siliconst/ui5/metaui/library"
], function (Controller, History, JSONModel, MessageToast, MessagePopover, MessageItem, GeneratorHost, PipelineManager, PluginRegistry, EmailValidatorPlugin, CurrencyFormatterPlugin, ClearFormActionPlugin, RemoteValueHelpPlugin) {
    "use strict";

    /**
     * Playground Controller
     * Demonstrates the core capabilities of the MetaUI library.
     */
    return Controller.extend("metaui.sandbox.controller.Playground", {
        
        onInit: function () {
            var oRouter = this.getOwnerComponent().getRouter();
            oRouter.getRoute("playground").attachPatternMatched(this._onObjectMatched, this);

            this.viewModel = new JSONModel({
                scenario: "",
                scenarioTitle: "Playground",
                schemaString: "{}",
                dataString: "{}",
                parsedSchema: null,
                parsedData: null,
                debugMode: false,
                codeExamples: this._getCodeExamples()
            });
            this.getView().setModel(this.viewModel, "viewModel");

            // Register MessageManager for global Fiori validation errors
            var oMessageManager = sap.ui.getCore().getMessageManager();
            this.getView().setModel(oMessageManager.getMessageModel(), "message");
            oMessageManager.registerObject(this.getView(), true);

            // ==========================================
            // REGISTER CUSTOM TEST PLUGINS
            // ==========================================
            
            // Validators & Formatters (PipelineManager)
            PipelineManager.GlobalPipeline.validators.register("email", new EmailValidatorPlugin.EmailValidatorPlugin());
            PipelineManager.GlobalPipeline.formatters.register("currency", new CurrencyFormatterPlugin.CurrencyFormatterPlugin());
            
            // Controls, Actions, Datasources (PluginRegistry)
            var pluginReg = PluginRegistry.PluginRegistry.getInstance();
            pluginReg.register("string", ClearFormActionPlugin.ClearFormActionPlugin, "clearButton");
            pluginReg.register("string", RemoteValueHelpPlugin.RemoteValueHelpPlugin, "remoteDropdown");
        },

        _onObjectMatched: function (oEvent) {
            var sScenario = oEvent.getParameter("arguments").scenario;
            this.viewModel.setProperty("/scenario", sScenario);

            // Always reset to preview tab on scenario change
            var oIconTabBar = this.byId("idIconTabBar");
            if (oIconTabBar) {
                oIconTabBar.setSelectedKey("preview");
            }

            // 1. Resolve Scenario Metadata
            this._applyScenarioMetadata(sScenario);

            // 2. Fetch Base Mock Data
            this._loadBaseMockData(sScenario);
        },

        // ==========================================
        // MODULAR SCENARIO HANDLERS
        // ==========================================

        /**
         * Sets the title in the header based on the selected scenario.
         * @param {string} sScenario The scenario key from the router
         * @private
         */
        _applyScenarioMetadata: function(sScenario) {
            var sTitle = "Playground";

            switch (sScenario) {
                case "basic_form":
                    sTitle = "Basic Structured Form";
                    break;
                case "basic_table":
                    sTitle = "Basic Table Layout";
                    break;
                case "mixed_layout":
                    sTitle = "Form & Table Mixed Layout";
                    break;
                case "everything":
                    sTitle = "The 'Everything' Form";
                    break;
                case "string":
                    sTitle = "String Binding (initialDataJson)";
                    break;
                case "dialog":
                    sTitle = "JavaScript API (Dialog Modality)";
                    break;
                case "inference":
                    sTitle = "Schema Inference (No Schema Provided)";
                    break;
                case "complex":
                    sTitle = "Complex Hierarchy (Nested Arrays)";
                    break;
                case "wizard":
                    sTitle = "Wizard Layout Demonstration";
                    break;
                default:
                    sTitle = "Standard Demonstration";
                    break;
            }

            this.viewModel.setProperty("/scenarioTitle", sTitle);
        },

        /**
         * Loads the appropriate mock JSON files based on the requested scenario.
         * @param {string} sScenario The scenario key from the router
         * @private
         */
        _loadBaseMockData: function(sScenario) {
            var sSchemaUrl = sap.ui.require.toUrl("metaui/sandbox/mockData/mockSchema.json");
            var sDataUrl = sap.ui.require.toUrl("metaui/sandbox/mockData/mockData.json");

            if (sScenario === "complex") {
                sSchemaUrl = sap.ui.require.toUrl("metaui/sandbox/mockData/mockSchemaComplex.json");
                sDataUrl = sap.ui.require.toUrl("metaui/sandbox/mockData/mockDataComplex.json");
            } else if (sScenario === "wizard") {
                sSchemaUrl = sap.ui.require.toUrl("metaui/sandbox/mockData/mockWizardSchema.json");
                sDataUrl = sap.ui.require.toUrl("metaui/sandbox/mockData/mockWizardData.json");
            } else if (sScenario === "basic_form") {
                sSchemaUrl = sap.ui.require.toUrl("metaui/sandbox/mockData/basic_form_schema.json");
                sDataUrl = sap.ui.require.toUrl("metaui/sandbox/mockData/basic_form_data.json");
            } else if (sScenario === "basic_table") {
                sSchemaUrl = sap.ui.require.toUrl("metaui/sandbox/mockData/basic_table_schema.json");
                sDataUrl = sap.ui.require.toUrl("metaui/sandbox/mockData/basic_table_data.json");
            } else if (sScenario === "mixed_layout") {
                sSchemaUrl = sap.ui.require.toUrl("metaui/sandbox/mockData/mixed_layout_schema.json");
                sDataUrl = sap.ui.require.toUrl("metaui/sandbox/mockData/mixed_layout_data.json");
            }

            Promise.all([
                fetch(sSchemaUrl).then(res => res.text()),
                fetch(sDataUrl).then(res => res.text())
            ]).then((results) => {
                var schemaTxt = results[0];
                var dataTxt = results[1];

                // Route data manipulation based on scenario before applying to the editors
                switch (sScenario) {
                    case "inference":
                        schemaTxt = ""; // Erase schema to force inference
                        break;
                    default:
                        // No pre-processing needed
                        break;
                }

                this.viewModel.setProperty("/schemaString", schemaTxt);
                this.viewModel.setProperty("/dataString", dataTxt);

                // Trigger generation once data is populated
                this.onRegenerate();

            }).catch(err => {
                console.error("Error loading JSON", err);
                MessageToast.show("Failed to load mock files.");
            });
        },

        _bindScenarioToHost: function(sScenario, schemaStr, dataStr, parsedSchema, parsedData) {
            var oHost = this.byId("metaHost");

            switch (sScenario) {
                case "string":
                    // Bind raw JSON strings natively (useful for huge payloads)
                    oHost.setProperty("schemaDefinition", schemaStr);
                    oHost.setProperty("initialDataJson", dataStr);
                    break;

                default:
                    // Standard Object Binding (Default fallback for everything, dialog, and inference)
                    this.viewModel.setProperty("/parsedSchema", parsedSchema);
                    this.viewModel.setProperty("/parsedData", parsedData);
                    break;
            }
        },

        // ==========================================
        // UI INTERACTION EVENT HANDLERS
        // ==========================================

        onRegenerate: function() {
            var schemaStr = this.viewModel.getProperty("/schemaString");
            var dataStr = this.viewModel.getProperty("/dataString");
            var sScenario = this.viewModel.getProperty("/scenario");

            try {
                var parsedSchema = schemaStr.trim() === "" ? null : JSON.parse(schemaStr);
                var parsedData = dataStr.trim() === "" ? null : JSON.parse(dataStr);

                // Modular injection into the Host control
                this._bindScenarioToHost(sScenario, schemaStr, dataStr, parsedSchema, parsedData);

                // Force layout generation
                this.byId("metaHost").generate(); 
                
                this.byId("outputConsole").setValue("UI Regenerated.");
                MessageToast.show("UI successfully regenerated from editor code.");
            } catch(e) {
                this.byId("outputConsole").setValue("Syntax Error in JSON:\n" + e.message);
                MessageToast.show("Syntax error in JSON");
            }
        },

        onTriggerSubmit: function() {
            this.byId("metaHost").triggerSubmit();
        },

        onFieldChange: function(oEvent) {
            var sFieldPath = oEvent.getParameter("fieldPath");
            var sValue = oEvent.getParameter("value");
            var oHost = oEvent.getSource();

            // Demonstrate Async Validation on CustomerName
            if (sFieldPath === "CustomerName" && sValue) {
                // Lock the form while 'checking' the server
                oHost.setBusy(true);

                setTimeout(function() {
                    oHost.setBusy(false);
                    if (sValue.toLowerCase() === "taken") {
                        oHost.addCustomError("CustomerName", "This customer name is already taken in the database.");
                    } else {
                        oHost.clearCustomError("CustomerName");
                    }
                }, 800);
            }
        },
        
        onBeforeSubmit: function(oEvent) {
            var payload = oEvent.getParameter("payload");
            var addError = oEvent.getParameter("addError");
            var preventDefault = oEvent.getParameter("preventDefault");

            // Example of a custom validation rule throwing to the Message Manager
            if (payload.Name && payload.Name.toLowerCase() === "error") {
                addError("Name", "You are not allowed to use the name 'error'.");
                preventDefault();
            }
        },

        onMessagePopoverPress: function(oEvent) {
            var oSourceControl = oEvent.getSource();
            if (!this._messagePopover) {
                this._messagePopover = new MessagePopover({
                    items: {
                        path: "message>/",
                        template: new MessageItem({
                            type: "{message>type}",
                            title: "{message>message}",
                            description: "{message>description}",
                            subtitle: "{message>additionalText}"
                        })
                    }
                });
                this.getView().addDependent(this._messagePopover);
            }
            this._messagePopover.toggle(oSourceControl);
        },

        onSubmit: function(oEvent) {
            var payload = oEvent.getParameter("payload");
            
            // Push payload directly to the data viewer
            this.viewModel.setProperty("/dataString", JSON.stringify(payload, null, 2));

            this.byId("outputConsole").setValue(
                "--- EXTRACTED PAYLOAD ---\n\n" + 
                JSON.stringify(payload, null, 2)
            );
            MessageToast.show("Payload successfully extracted!");

            // Navigate to Payload Data tab
            var oIconTabBar = this.byId("idIconTabBar");
            if (oIconTabBar) {
                oIconTabBar.setSelectedKey("data");
            }
        },

        onOpenDialog: function() {
            var host = new GeneratorHost({
                schemaDefinition: this.viewModel.getProperty("/parsedSchema"),
                initialData: this.viewModel.getProperty("/parsedData"),
                submit: this.onSubmit.bind(this)
            });
            
            host.openInDialog("MetaUI Dialog Demonstration", "Save & Extract");
        },

        onNavBack: function () {
            var oHistory = History.getInstance();
            var sPreviousHash = oHistory.getPreviousHash();

            if (sPreviousHash !== undefined) {
                window.history.go(-1);
            } else {
                var oRouter = this.getOwnerComponent().getRouter();
                oRouter.navTo("home", {}, true);
            }
        },

        // ==========================================
        // DOCUMENTATION & INTEGRATION STRINGS
        // ==========================================

        _getCodeExamples: function() {
            return `// ==========================================
// OPTION 1: DECLARATIVE XML BINDING
// ==========================================
<mvc:View
    xmlns:mvc="sap.ui.core.mvc"
    xmlns:meta="nz.co.siliconst.ui5.metaui.controls">
    
    <meta:GeneratorHost 
        id="myMetaForm"
        schemaDefinition="{myModel>/schema}" 
        initialData="{myModel>/data}" 
        submit=".onFormSubmit" />
        
</mvc:View>

// ==========================================
// OPTION 2: PROGRAMMATIC JAVASCRIPT & DIALOG
// ==========================================
sap.ui.define(["nz/co/siliconst/ui5/metaui/controls/GeneratorHost"], function(GeneratorHost) {
    return {
        openMyDynamicForm: function(schemaObj, dataObj) {
            const host = new GeneratorHost({
                schemaDefinition: schemaObj,
                initialData: dataObj,
                submit: function(oEvent) {
                    const payload = oEvent.getParameter("payload");
                    console.log("Extracted Data:", payload);
                }
            });
            
            // Instantly wraps the host in a responsive Dialog
            host.openInDialog("My Dynamic Form", "Save Changes");
        }
    };
});

// ==========================================
// OPTION 3: ADVANCED EVENT HOOKS
// ==========================================
<meta:GeneratorHost 
    schemaDefinition="{...}" 
    initialData="{...}" 
    
    fieldChange=".onFieldChange"       <!-- Fired when ANY field is modified. Provides 'fieldPath' and 'value'. Good for custom async validations. -->
    beforeSubmit=".onBeforeSubmit"     <!-- Fired before validation block. Provides 'payload', 'addError()', 'preventDefault()'. Good for cross-field checks. -->
    submit=".onSubmit"                 <!-- Fired after successful validation. Provides final 'payload'. -->
/>

// ==========================================
// OPTION 4: REGISTERING CUSTOM PLUGINS
// ==========================================
sap.ui.define([
    "nz/co/siliconst/ui5/metaui/core/PluginRegistry",
    "nz/co/siliconst/ui5/metaui/core/PipelineManager",
    "my/app/MyDatePickerPlugin",
    "my/app/MyAsyncValidator"
], function(PluginRegistry, PipelineManager, MyDatePickerPlugin, MyAsyncValidator) {
    
    // 1. Register a custom UI Control for the 'date' primitive
    var registry = PluginRegistry.PluginRegistry.getInstance();
    registry.register("date", MyDatePickerPlugin, "customDate");

    // 2. Register a custom Business Validator
    PipelineManager.GlobalPipeline.validators.register("myValidator", new MyAsyncValidator());
});`;
        }
    });
});
