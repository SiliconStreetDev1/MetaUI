sap.ui.define([
    "sap/ui/core/mvc/XMLView"
], function(XMLView) {
    "use strict";

    XMLView.create({
        viewName: "test.Main"
    }).then(function(oView) {
        oView.placeAt("content");
    });
});
