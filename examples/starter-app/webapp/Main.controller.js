sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/m/MessageToast"
], function (Controller, MessageToast) {
    "use strict";

    return Controller.extend("metaui.starter.Main", {

        /** Fired when the form is submitted. The event carries `payload` and `payloadJson`. */
        onSubmit: function (oEvent) {
            MessageToast.show(oEvent.getParameter("payloadJson"));
        }
    });
});
