sap.ui.define([
    "../BaseController",
    "sap/ui/model/json/JSONModel"
], function (BaseController, JSONModel) {
    "use strict";

    return BaseController.extend("metaui.sandbox.controller.scenarios.DeepStructures", {
        onInit: function () {
            var oViewModel = this.setupViewModel();
            
            // Load the code example for this specific scenario
            sap.ui.require(["metaui/sandbox/controller/SnippetService"], function(SnippetService) {
                var sSnippet = SnippetService.getCodeSnippet("deep_structures");
                oViewModel.setProperty("/codeExamples", sSnippet || "// Complex nested data structures are automatically inferred by MetaUI!");
                
                var sDesc = SnippetService.getScenarioDescription("complex"); // Reuse complex description
                oViewModel.setProperty("/scenarioDescription", sDesc);
            });

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
                },
                Contacts: [
                    { name: "John Doe", role: "Manager" },
                    { name: "Jane Smith", role: "Developer" }
                ]
            };

            const dataString = JSON.stringify(initialData, null, 2);

            // Bind to the CodeEditors
            oViewModel.setProperty("/editorDataString", dataString);
            
            // Bind to the native MetaUI bindings
            oViewModel.setProperty("/parsedSchema", null); // Let it infer
            oViewModel.setProperty("/parsedData", initialData);
            oViewModel.setProperty("/rawJsonStringIn", dataString);
        }
    });
});
