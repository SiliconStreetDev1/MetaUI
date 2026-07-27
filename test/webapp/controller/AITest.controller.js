sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/core/UIComponent",
    "nz/co/siliconst/ui5/metaui/ai/AIConfig",
    "nz/co/siliconst/ui5/metaui/ai/MockLLMProxy",
    "nz/co/siliconst/ui5/metaui/ai/RestLLMProxy"
], function (Controller, JSONModel, UIComponent, AIConfig, MockLLMProxy, RestLLMProxy) {
    "use strict";

    /**
     * @class
     * Controller for testing the AI Inference engine integration.
     * Demonstrates how MetaUI can generate forms dynamically by passing data payloads 
     * through Large Language Models to infer schema structure.
     * 
     * @extends sap.ui.core.mvc.Controller
     * @alias metaui.sandbox.controller.AITest
     */
    return Controller.extend("metaui.sandbox.controller.AITest", {
        
        /**
         * Lifecycle hook.
         * Bootstraps the local view model with a default complex JSON payload and a partial schema 
         * to demonstrate Hybrid Inference (AI completing missing schema definitions).
         * 
         * @public
         */
        onInit: function () {
            var oData = {
                inferenceStrategy: "AI",
                proxyType: "mock",
                dataJson: JSON.stringify({
                    "VendorID": "V-908234",
                    "CompanyName": "Acme Global Supplies Ltd",
                    "CorporateEmailAddress": "procurement@acmeglobal.com",
                    "TotalApprovedBudgetUSD": 1500000.50,
                    "IsActiveVendor": true,
                    "VendorRegistrationDate": "2024-01-15T00:00:00Z",
                    "RiskAssessmentScore": 12,
                    "PrimaryContactName": "Jane Smith",
                    "PrimaryContactPhone": "+1-555-0198",
                    "VendorCategory": "HARDWARE"
                }, null, 2),
                schemaJson: JSON.stringify({
                    "type": "object",
                    "properties": {
                        "VendorCategory": {
                            "type": "string",
                            "ui": {
                                "label": "Vendor Class (Manual Override)",
                                "widget": "select"
                            },
                            "enum": [
                                "SOFTWARE",
                                "HARDWARE",
                                "SERVICES"
                            ]
                        }
                    }
                }, null, 2),
                schemaDefinition: null // Passed to DynamicHost
            };

            var oModel = new JSONModel(oData);
            this.getView().setModel(oModel);
        },

        /**
         * Navigates the router back to the home page securely.
         * 
         * @public
         */
        onNavBack: function () {
            var oRouter = UIComponent.getRouterFor(this);
            oRouter.navTo("home");
        },

        /**
         * Orchestrates the extraction of raw editor strings, applies the selected AI Proxy Configuration, 
         * and triggers the MetaUI inference pipeline by re-binding the schema and data.
         * 
         * @public
         */
        onTriggerInference: function () {
            var oModel = this.getView().getModel();
            var sProxyType = oModel.getProperty("/proxyType");

            // 1. Configure the AI Proxy globally
            if (sProxyType === "rest") {
                AIConfig.setProxy(new RestLLMProxy());
            } else {
                AIConfig.setProxy(new MockLLMProxy());
            }

            // 2. Parse the Partial Schema
            var sSchemaJson = oModel.getProperty("/schemaJson");
            var oPartialSchema = null;
            if (sSchemaJson && sSchemaJson.trim() !== "") {
                try {
                    oPartialSchema = JSON.parse(sSchemaJson);
                } catch (e) {
                    sap.m.MessageToast.show("Invalid Partial Schema JSON");
                    return;
                }
            }

            // 3. Set the schemaDefinition on the model to trigger DynamicHost inference
            // Note: DynamicHost intercepts this when inferenceStrategy === "AI"
            oModel.setProperty("/schemaDefinition", oPartialSchema);
            
            // To force DynamicHost to re-evaluate if it's already bound, we need to toggle the data binding temporarily
            var oHost = this.byId("dynamicHost");
            var sDataJson = oModel.getProperty("/dataJson");
            oHost.setProperty("dataJson", "");
            setTimeout(function() {
                oHost.setProperty("dataJson", sDataJson);
            }, 10);
        }
    });
});
