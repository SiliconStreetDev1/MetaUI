sap.ui.define([
    "metaui/sandbox/controller/BaseController"
], function (BaseController) {
    "use strict";

    return BaseController.extend("metaui.sandbox.controller.scenarios.ODataV4Rap", {
        onInit: function () {
            // Provide an explicit schema to format the OData Entity gracefully!
            var oSchemaModel = new sap.ui.model.json.JSONModel({
                type: "object",
                layoutStrategy: "form",
                title: "Employee Information",
                properties: {
                    ID: {
                        type: "string",
                        ui: { label: "Employee ID", isKey: true, readOnly: true }
                    },
                    FirstName: {
                        type: "string",
                        ui: { label: "First Name" }
                    },
                    LastName: {
                        type: "string",
                        ui: { label: "Last Name" }
                    },
                    Department: {
                        type: "string",
                        ui: { label: "Department", widget: "select" },
                        enum: ["Engineering", "Sales", "HR", "Marketing"]
                    }
                }
            });
            this.getView().setModel(oSchemaModel, "schema");
        }
    });
});
