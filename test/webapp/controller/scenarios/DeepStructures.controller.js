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
                companyName: "Silicon Street Development",
                industry: "Software",
                founded: 2026,
                isActive: true,
                Departments: [
                    {
                        departmentName: "Engineering",
                        budget: 1500000,
                        Employees: [
                            {
                                name: "John Doe",
                                role: "Senior Developer",
                                Projects: [
                                    { projectName: "MetaUI Core", status: "Active" },
                                    { projectName: "OData Plugin", status: "Planning" }
                                ],
                                hardwareDetails: {
                                    laptop: "MacBook Pro M3",
                                    monitors: 2
                                }
                            },
                            {
                                name: "Jane Smith",
                                role: "Engineering Manager",
                                Projects: [
                                    { projectName: "Q3 Planning", status: "Active" }
                                ],
                                hardwareDetails: {
                                    laptop: "Lenovo ThinkPad",
                                    monitors: 1
                                }
                            }
                        ]
                    },
                    {
                        departmentName: "Marketing",
                        budget: 500000,
                        Employees: [
                            {
                                name: "Sarah Jones",
                                role: "Brand Manager",
                                Projects: [],
                                hardwareDetails: {
                                    laptop: "MacBook Air",
                                    monitors: 0
                                }
                            }
                        ]
                    }
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
