sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel"
], function (Controller, JSONModel) {
    "use strict";

    return Controller.extend("metaui.sandbox.controller.Playpen", {
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
        
        onGenerate: function() {
            this._syncLeftToRight();
        },

        onCodeEditorChange: function() {
            this._syncLeftToRight();
        },

        onFieldChange: function() {
            var oViewModel = this.getView().getModel("view");
            var oParsed = oViewModel.getProperty("/parsedData");
            oViewModel.setProperty("/jsonString", JSON.stringify(oParsed, null, 4));
        },

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
