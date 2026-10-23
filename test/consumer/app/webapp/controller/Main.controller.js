sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "nz/co/siliconst/ui5/metaui/controls/DynamicHost"
], function (Controller, JSONModel, DynamicHostMod) {
    "use strict";

    var DynamicHost = DynamicHostMod.default || DynamicHostMod;

    // ---- Pure JSON Schema (Draft-07 style), no inference anywhere ----
    var SCHEMA = {
        title: "Purchase Order",
        type: "object",
        required: ["OrderCode", "Quantity", "Email"],
        properties: {
            OrderCode:  { type: "string", minLength: 3, maxLength: 20, ui: { label: "Order Code", placeholder: "e.g. PO-10021" } },
            Email:      { type: "string", ui: { label: "Contact Email", format: "email" } },
            Quantity:   { type: "integer", minimum: 1, maximum: 999, ui: { label: "Quantity", widget: "step" } },
            UnitPrice:  { type: "number", ui: { label: "Unit Price", formatter: "currency" } },
            Mobile:     { type: "string", pattern: "^\\d{10}$", ui: { label: "Mobile (10 digits)", formatter: "phone" } },
            DeliveryOn: { type: "string", ui: { label: "Delivery Date", widget: "date" } },
            Priority:   { type: "string", enum: ["Low", "Standard", "Urgent"], ui: { label: "Priority", widget: "select" } },
            Expedite:   { type: "boolean", ui: { label: "Expedite", widget: "switch" } },
            Notes:      { type: "string", ui: { label: "Notes", widget: "textArea", rows: 3 } }
        },
        uiPolicies: [
            { effect: "Require", targets: ["/Notes"], condition: { StringEquals: { "/Priority": "Urgent" } } }
        ]
    };

    var DATA = {
        OrderCode: "PO-10021",
        Email: "buyer@example.com",
        Quantity: 12,
        UnitPrice: 1234.56,
        Mobile: "5551234567",
        DeliveryOn: "2026-11-30",
        Priority: "Standard",
        Expedite: false,
        Notes: ""
    };

    // Compact schema used inside the table cells
    var ROW_SCHEMA = {
        type: "object",
        properties: {
            Sku:   { type: "string", minLength: 2, ui: { label: "SKU" } },
            Qty:   { type: "integer", minimum: 1, ui: { label: "Qty", widget: "step" } },
            Rush:  { type: "boolean", ui: { label: "Rush", widget: "switch" } }
        }
    };

    // ---- INFERENCE: no schema at all. Mirrors the primary production usage. ----
    var INFERRED_DATA = {
        CustomerName: "Acme Holdings",
        AccountNumber: "AC-99120",
        CreditLimit: 25000.5,
        Active: true,
        OpenedOn: "2024-03-14",
        Contact: { Email: "ops@acme.example", Phone: "5559876543" },
        Notes: null
    };

    // ---- INFERENCE + a minimal schema declaring only what is mandatory. ----
    var REQUIRED_SCHEMA = {
        title: "Mandatory Fields",
        type: "object",
        required: ["Reference", "Amount"],
        properties: {
            Reference: { type: "string", ui: { label: "Reference" } },
            Amount: { type: "number", ui: { label: "Amount" } },
            Comment: { type: "string", ui: { label: "Comment (optional)" } }
        }
    };
    var REQUIRED_DATA = { Reference: "", Amount: null, Comment: "" };

    // ---- A generated table. 250 rows, past UI5's default 100-context binding cap. ----
    var TABLE_SCHEMA = {
        title: "Line Items",
        type: "array",
        items: {
            type: "object",
            properties: {
                Line: { type: "integer", ui: { label: "Line" } },
                Sku: { type: "string", ui: { label: "SKU" } },
                Qty: { type: "integer", ui: { label: "Qty" } }
            }
        }
    };
    var TABLE_DATA = (function () {
        var rows = [];
        for (var i = 1; i <= 250; i++) {
            rows.push({ Line: i, Sku: "SKU-" + (1000 + i), Qty: (i % 9) + 1 });
        }
        return rows;
    }());


    return Controller.extend("metaui.consumer.controller.Main", {
        onInit: function () {
            this.getView().setModel(new JSONModel({
                schema: SCHEMA,
                data: DATA,
                inferredData: INFERRED_DATA,
                requiredSchema: REQUIRED_SCHEMA,
                requiredData: REQUIRED_DATA,
                tableSchema: TABLE_SCHEMA,
                tableData: TABLE_DATA,
                rowSchema: ROW_SCHEMA,
                rows: [
                    { id: "R-001", code: "AAA-1", status: "Open",   owner: "RL", detail: { Sku: "SKU-100", Qty: 2, Rush: false } },
                    { id: "R-002", code: "BBB-2", status: "Open",   owner: "RL", detail: { Sku: "SKU-200", Qty: 5, Rush: true  } },
                    { id: "R-003", code: "CCC-3", status: "Closed", owner: "AB", detail: { Sku: "SKU-300", Qty: 1, Rush: false } }
                ]
            }), "app");

            // Prove the library really came from the installed npm package
            var strip = this.byId("proofStrip");
            var loaded = !!sap.ui.require("nz/co/siliconst/ui5/metaui/controls/DynamicHost");
            strip.setText(
                "nz.co.siliconst.ui5.metaui loaded from node_modules: " + loaded +
                "  |  DynamicHost resolved: " + (typeof DynamicHost === "function")
            );
            strip.setType(loaded ? "Success" : "Error");
        },

        onSubmitRequired: function () {
            var host = this.byId("requiredHost");
            var ok = host.triggerSubmit();
            this.byId("requiredOut").setText(ok ? "SUBMITTED (unexpected while empty)" : "blocked by validation (correct)");
        },

        onTriggerSubmit: function () {
            var host = this.byId("declarativeHost");
            var ok = host.triggerSubmit();
            var payload = host.getProperty("outputData");
            this.byId("payloadOut").setText(
                ok ? "submit OK -> " + JSON.stringify(payload)
                   : "blocked by validation (fix required/invalid fields)"
            );
        },

        onSubmitted: function (oEvent) {
            this.byId("payloadOut").setText("submit event -> " + oEvent.getParameter("payloadJson"));
        },

        onOpenDialog: function () {
            var that = this;
            if (!this._dialogHost) {
                this._dialogHost = new DynamicHost({
                    schemaDefinition: SCHEMA,
                    data: JSON.parse(JSON.stringify(DATA)),
                    editable: true,
                    submit: function (oEvent) {
                        that.byId("dialogOut").setText("dialog submit -> " + oEvent.getParameter("payloadJson"));
                    }
                });
                this.getView().addDependent(this._dialogHost);
            }
            this._dialogHost.openInDialog("Purchase Order", "Extract Payload", "Cancel", "40rem");
        }
    });
});
