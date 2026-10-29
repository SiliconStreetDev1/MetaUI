sap.ui.define([
    "sap/ui/core/UIComponent",
    "sap/ui/model/json/JSONModel"
], function (UIComponent, JSONModel) {
    "use strict";

    return UIComponent.extend("metaui.starter.Component", {
        metadata: { manifest: "json" },

        init: function () {
            UIComponent.prototype.init.apply(this, arguments);

            // No schema. MetaUI infers the form from the shape of the data: a date string
            // becomes a DatePicker, a boolean a CheckBox, and so on.
            this.setModel(new JSONModel({
                booking: {
                    FullName: "Ada Lovelace",
                    Email: "ada@example.com",
                    CheckIn: "2026-12-01",
                    Guests: 2,
                    VIP: true
                }
            }));
        }
    });
});
