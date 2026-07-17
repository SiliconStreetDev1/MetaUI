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

            // Fetch the external JSON files to simulate ABAP payload ingestion
            Promise.all([
                fetch("mockSchema.json").then(res => res.json()),
                fetch("mockData.json").then(res => res.json())
            ]).then((results) => {
                this.mockSchema = results[0];
                this.initialData = results[1];
                MessageToast.show("JSON payloads loaded successfully.");
            }).catch((err) => {
                MessageToast.show("Error loading JSON. Are you running a local web server?");
                console.error("Fetch error (Likely a CORS issue if opening via file://):", err);
            });
        },

        onOpenDialog: function() {
            if (!this.mockSchema || !this.initialData) {
                MessageToast.show("JSON payloads not loaded yet.");
                return;
            }

            const host = new GeneratorHost({
                schemaDefinition: this.mockSchema,
                initialData: this.initialData,
                submit: (oEvent) => {
                    // Extract the clean JSON payload from the UI5 engine event
                    const payload = oEvent.getParameter("payload");
                    this.byId("outputArea").setValue(JSON.stringify(payload, null, 2));
                }
            });

            host.openInDialog("MetaUI Generated Form");
        }
    });
});
