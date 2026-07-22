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
                        "ID": { type: "string", ui: { label: "User ID", editable: false } },
                        "Name": { type: "string", ui: { label: "Full Name" } },
                        "Email": { type: "string", ui: { label: "Email Address" } },
                        "IsActive": { type: "boolean", ui: { label: "Active Status" } }
                    }
                }
            });
            this.getView().setModel(oSchemaModel);
        }
    });
});
