sap.ui.define([
    "metaui/sandbox/controller/BaseController",
    "metaui/sandbox/mockData/MockDataService"
], function (BaseController, MockDataService) {
    "use strict";

    return BaseController.extend("metaui.sandbox.controller.scenarios.StringBinding", {
        
        onInit: function () {
            var oViewModel = this.setupViewModel();

            MockDataService.loadScenario("string")
                .then(function (result) {
                    var parsedSchema = result.schemaString.trim() === "" ? null : JSON.parse(result.schemaString);
                    oViewModel.setProperty("/parsedSchema", parsedSchema);
                    oViewModel.setProperty("/rawJsonStringIn", result.dataString);
                }.bind(this));
        }

    });
});
