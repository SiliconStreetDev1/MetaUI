sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/core/routing/History",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast"
], function (Controller, History, JSONModel, MessageToast) {
    "use strict";

    /**
     * MultiHost Controller
     * Demonstrates cloning multiple GeneratorHost controls inside a sap.m.Table template.
     */
    return Controller.extend("metaui.sandbox.controller.MultiHost", {
        onInit: function () {
            // Define the strict Schema requested by the Persona
            var oSchema = {
                type: "object",
                properties: {
                    LogText: {
                        type: "string",
                        ui: { label: "Log Entry" }
                    },
                    LogDate: {
                        type: "date",
                        ui: { label: "Date of Entry" }
                    },
                    LogTime: {
                        type: "string",
                        ui: { label: "Time of Entry", widget: "time" }
                    }
                },
                uiLayout: [
                    {
                        type: "Group",
                        label: "Entry Details",
                        elements: [
                            { type: "Control", scope: "#/properties/LogText" },
                            { type: "Control", scope: "#/properties/LogDate" },
                            { type: "Control", scope: "#/properties/LogTime" }
                        ]
                    }
                ]
            };

            // Define initial mock records
            var aRecords = [
                {
                    data: {
                        LogText: "System startup successful.",
                        LogDate: "2026-07-19",
                        LogTime: "08:00:00"
                    }
                },
                {
                    data: {
                        LogText: "User authentication failed.",
                        LogDate: "2026-07-19",
                        LogTime: "09:15:30"
                    }
                }
            ];

            // Setup the local JSON Model
            this.viewModel = new JSONModel({
                schemaString: JSON.stringify(oSchema, null, 2),
                records: aRecords,
                dataString: JSON.stringify(aRecords, null, 2)
            });
            this.getView().setModel(this.viewModel, "multiModel");
        },

        onAddRow: function () {
            var aRecords = this.viewModel.getProperty("/records");
            aRecords.push({
                data: {
                    LogText: "",
                    LogDate: "",
                    LogTime: ""
                }
            });
            this.viewModel.setProperty("/records", aRecords);
            this.viewModel.setProperty("/dataString", JSON.stringify(aRecords, null, 2));
        },

        onDeleteRow: function (oEvent) {
            var oButton = oEvent.getSource();
            var oContext = oButton.getBindingContext("multiModel");
            var sPath = oContext.getPath();
            
            // Extract the index from the path (e.g. "/records/1")
            var iIndex = parseInt(sPath.split("/").pop(), 10);
            
            var aRecords = this.viewModel.getProperty("/records");
            aRecords.splice(iIndex, 1);
            this.viewModel.setProperty("/records", aRecords);
            this.viewModel.setProperty("/dataString", JSON.stringify(aRecords, null, 2));
        },

        onExtractData: function () {
            var oTable = this.byId("multiHostTable");
            var aItems = oTable.getItems();
            
            var aExtracted = [];
            aItems.forEach(function(oItem) {
                var oGeneratorHost = oItem.getCells()[0];
                
                // Trigger the internal payload extraction mechanics of the GeneratorHost
                // This forces schema validation and extracts the latest data payload.
                var bSuccess = oGeneratorHost.triggerSubmit();
                
                if (bSuccess) {
                    aExtracted.push(oGeneratorHost.getProperty("outputData"));
                } else {
                    MessageToast.show("Validation failed on one or more rows.");
                }
            });
            
            console.log("Extracted Multi-Host Data:", aExtracted);
            MessageToast.show("Extracted " + aExtracted.length + " records. See console.");
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
        }
    });
});
