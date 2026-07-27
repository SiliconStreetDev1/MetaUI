sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel"
], function (Controller, JSONModel) {
    "use strict";

    /**
     * @class
     * Controller for the experimental Playpen view.
     * Serves as a scratchpad for testing pure bidirectional data binding synchronization
     * between raw JSON strings and dynamically bound Fiori objects.
     * 
     * @extends sap.ui.core.mvc.Controller
     * @alias metaui.sandbox.controller.Playpen
     */
    return Controller.extend("metaui.sandbox.controller.Playpen", {
        
        /**
         * Lifecycle hook.
         * Bootstraps the local view model with an initial payload to test live sync capabilities.
         * 
         * @public
         */
        onInit: function () {
            var initialData = {
                username: "admin123",
                isActive: true,
                rating: 8.5,
                roles: ["User", "Admin"]
            };
            
            var oViewModel = new JSONModel({
                jsonString: JSON.stringify(initialData, null, 4),
                parsedData: initialData
            });
            this.getView().setModel(oViewModel, "view");
        },
        
        /**
         * Explicitly triggers a one-way sync from the CodeEditor string over to the parsed object model.
         * 
         * @public
         */
        onGenerate: function() {
            this._syncLeftToRight();
        },

        /**
         * Event handler attached to the CodeEditor to support live-typing synchronization.
         * 
         * @public
         */
        onCodeEditorChange: function() {
            this._syncLeftToRight();
        },

        /**
         * Intercepts updates bubbled up from the dynamically generated MetaUI form 
         * and serializes them back into the CodeEditor as a formatted string.
         * 
         * @public
         */
        onFieldChange: function() {
            var oViewModel = this.getView().getModel("view");
            var oParsed = oViewModel.getProperty("/parsedData");
            oViewModel.setProperty("/jsonString", JSON.stringify(oParsed, null, 4));
        },

        /**
         * Private utility to parse the current raw string payload into an object.
         * Silently catches syntax errors to prevent the UI from crashing mid-keystroke.
         * 
         * @private
         */
        _syncLeftToRight: function() {
            var oViewModel = this.getView().getModel("view");
            var sValue = oViewModel.getProperty("/jsonString");
            try {
                var oParsed = JSON.parse(sValue);
                oViewModel.setProperty("/parsedData", oParsed);
            } catch (e) {
                // Ignore parse errors while typing, allow Force Sync to show them later if needed
            }
        }
    });
});
