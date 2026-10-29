sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/m/MessageToast"
], function (Controller, MessageToast) {
    "use strict";

    return Controller.extend("metaui.starter.Main", {

        /** An inline form has no submit button of its own. This validates it, and fires `submit` only if it is valid. */
        onPressSubmit: function () {
            this.byId("host").triggerSubmit();
        },

        /** Fired when the form is submitted. The event carries `payload` and `payloadJson`. */
        onSubmit: function (oEvent) {
            MessageToast.show(oEvent.getParameter("payloadJson"));
        }
    });
});
