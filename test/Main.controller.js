sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "nz/co/siliconst/ui5/metaui/controls/GeneratorHost",
    "sap/m/MessageToast",
    "nz/co/siliconst/ui5/metaui/library"
], function(Controller, GeneratorHost, MessageToast) {
    "use strict";

    return Controller.extend("test.Main", {
        onInit: function() {
            this.mockSchema = null;
            this.initialData = null;

            // Fetch the external JSON files to simulate backend payload ingestion
            Promise.all([
                fetch("mockSchema.json").then(res => res.json()),
                fetch("mockData.json").then(res => res.json())
            ]).then((results) => {
                this.mockSchema = results[0];
                this.initialData = results[1];

                var sapUIModel = sap.ui.require("sap/ui/model/json/JSONModel");
                if (!sapUIModel) {
                    sapUIModel = sap.ui.model.json.JSONModel;
                }
                
                // Create JSON models for the declarative XML binding
                var schemaModel = new sapUIModel(this.mockSchema);
                var dataModel = new sapUIModel(this.initialData);
                
                this.getView().setModel(schemaModel, "schemaModel");
                this.getView().setModel(dataModel, "dataModel");
                
                MessageToast.show("JSON payloads successfully bound to XML View.");
            }).catch((err) => {
                MessageToast.show("Error loading JSON.");
                console.error("Fetch error:", err);
            });
        },

        // ---------- OPTION 1: XML BINDING INLINE ----------
        onSaveInline: function() {
            // Trigger the submit event on the embedded XML control
            this.byId("metaHost").triggerSubmit();
        },

        // ---------- OPTION 2: JAVASCRIPT API DIALOG ----------
        onOpenDialog: function() {
            if (!this.mockSchema || !this.initialData) {
                MessageToast.show("JSON payloads not loaded yet.");
                return;
            }

            const host = new GeneratorHost({
                schemaDefinition: this.mockSchema,
                initialData: this.initialData,
                submit: (oEvent) => {
                    this.onSubmit(oEvent); // Reuse the same handler to output payload
                }
            });

            host.openInDialog("MetaUI Generated Form (JS API)", "OK");
        },

        // ---------- COMMON OUTPUT HANDLER ----------
        onSubmit: function(oEvent) {
            // Extract the clean JSON payload from the UI5 engine event
            const payload = oEvent.getParameter("payload");
            this.byId("outputArea").setValue(JSON.stringify(payload, null, 2));
            MessageToast.show("Payload Extracted Successfully!");
        }
    });
});
