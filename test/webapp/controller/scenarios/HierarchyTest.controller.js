sap.ui.define([
    "metaui/sandbox/controller/BaseController",
    "metaui/sandbox/mockData/MockDataService",
    "metaui/sandbox/controller/SnippetService"
], function (BaseController, MockDataService, SnippetService) {
    "use strict";

    return BaseController.extend("metaui.sandbox.controller.scenarios.HierarchyTest", {
        onInit: function () {
            console.log("[MetaUI Sandbox] HierarchyTest controller initialized, loading mock data...");
            var oViewModel = this.setupViewModel();
            
            // Load the code example for this specific scenario
            var sSnippet = SnippetService.getCodeSnippet("hierarchy_test");
            oViewModel.setProperty("/codeExamples", sSnippet);
            
            // Load the scenario description
            var sDesc = SnippetService.getScenarioDescription("hierarchy_test");
            oViewModel.setProperty("/scenarioDescription", sDesc);

            MockDataService.loadScenario("hierarchy_test")
                .then(function (result) {
                    console.log("[MetaUI Sandbox] HierarchyTest mock data loaded successfully.");
                    var parsedSchema = result.schemaString.trim() === "" ? null : JSON.parse(result.schemaString);
                    var parsedData = result.dataString.trim() === "" ? null : JSON.parse(result.dataString);
                    
                    // Bind to the CodeEditors
                    oViewModel.setProperty("/schemaString", result.schemaString);
                    oViewModel.setProperty("/editorDataString", result.dataString);
                    
                    // Bind to the native MetaUI bindings
                    oViewModel.setProperty("/parsedSchema", parsedSchema);
                    oViewModel.setProperty("/parsedData", parsedData);
                    oViewModel.setProperty("/rawJsonStringIn", result.dataString);
                }.bind(this));
        }
    });
});