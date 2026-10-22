sap.ui.define([
    "metaui/sandbox/controller/BaseController",
    "sap/ui/model/json/JSONModel"
], function (BaseController, JSONModel) {
    "use strict";

    /**
     * @class
     * Controller for the OData V4 testing view.
     * Inherits from BaseController to gain generic routing.
     * 
     * @extends metaui.sandbox.controller.BaseController
     * @alias metaui.sandbox.controller.ODataTest
     */
    return BaseController.extend("metaui.sandbox.controller.ODataTest", {
        
        /**
         * Lifecycle hook initializing the local view model.
         * 
         * @public
         */
        onInit: function () {
            this.setupViewModel();

            // Provide a schema for the OData mock data
            var oSchemaModel = new JSONModel({
                odataSchema: {
                    type: "object",
                    title: "OData User Profile",
                    properties: {
                        "ID": { type: "string", readOnly: true, ui: { label: "Employee ID", readOnly: true } },
                        "FirstName": { type: "string", ui: { label: "First Name" } },
                        "LastName": { type: "string", ui: { label: "Last Name" } }
                    }
                }
            });
            this.getView().setModel(oSchemaModel);
        }
    });
});
