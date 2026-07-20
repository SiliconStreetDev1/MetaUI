sap.ui.define([
    "../BaseController",
    "sap/ui/model/json/JSONModel"
], function (BaseController, JSONModel) {
    "use strict";

    return BaseController.extend("metaui.sandbox.controller.scenarios.DeepStructures", {
        onInit: function () {
            const initialData = {
                header: {
                    id: "DOC-29384",
                    type: "Invoice",
                    createdBy: "admin",
                    metadata: {
                        region: "US-West",
                        priority: "High"
                    }
                },
                shipping: {
                    address: "123 Main St",
                    city: "San Francisco",
                    zip: "94105",
                    details: {
                        instructions: "Leave at back door",
                        requiresSignature: true
                    }
                }
            };

            const oModel = new JSONModel({
                deepData: initialData,
                deepDataStr: JSON.stringify(initialData, null, 2)
            });

            this.getView().setModel(oModel, "viewModel");

            // Setup two-way binding for the CodeEditor string sync
            const oBinding = oModel.bindProperty("/deepDataStr");
            oBinding.attachChange(function (oEvent) {
                try {
                    const parsed = JSON.parse(oEvent.getSource().getValue());
                    oModel.setProperty("/deepData", parsed);
                } catch (e) {
                    // Invalid JSON while typing, ignore
                }
            });
        },

        onFieldChange: function (oEvent) {
            const oModel = this.getView().getModel("viewModel");
            const newData = oModel.getProperty("/deepData");
            
            // Sync changes back to the text editor string
            oModel.setProperty("/deepDataStr", JSON.stringify(newData, null, 2));
        }
    });
});
