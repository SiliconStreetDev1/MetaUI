/**
 * Example: Programmatic Dialog from Raw JSON Strings
 * ====================================================
 * This pattern bypasses XML views and model bindings entirely.
 * Useful when your backend returns a raw JSON payload and you need
 * an instant edit-and-submit popup with full schema validation.
 *
 * Prerequisites:
 * - MetaUI library deployed and visible to the app's namespace resolver.
 * - Called from inside a UI5 controller (requires 'this' context).
 */

sap.ui.require(["nz/co/siliconst/ui5/metaui/controls/DynamicHost"], function (DynamicHost) {

    // 1. Define the schema that describes the editable fields.
    var schema = JSON.stringify({
        "title": "Edit Customer",
        "type": "object",
        "properties": {
            "CustomerName": { "type": "string", "required": true, "maxLength": 100 },
            "Email":        { "type": "string", "ui": { "format": "email" } },
            "IsActive":     { "type": "boolean", "ui": { "widget": "switch" } }
        }
    });

    // 2. Define the initial data payload (can come from your OData response).
    var data = JSON.stringify({
        "CustomerName": "Acme Corp",
        "Email":        "contact@acme.com",
        "IsActive":     true
    });

    // 3. Instantiate the host with raw strings — no model binding needed.
    var oHost = new DynamicHost({
        schemaDefinition: schema,
        dataJson: data
    });

    // 4. Wire up the submit event to receive the validated, clean payload.
    oHost.attachSubmit(function (oEvent) {
        var payload = oEvent.getParameter("payload");
        console.log("Validated payload ready to POST:", payload);
        // oDataModel.create("/Customers", payload);
    });

    // 5. Attach to the view lifecycle so UI5 themes resolve correctly.
    this.getView().addDependent(oHost);

    // 6. Open as a popup. The 'Save' button is wired to MetaUI's validation
    //    pipeline — it will not close if the schema has errors.
    oHost.openInDialog("Edit Customer", "Save", "Cancel", "600px", this.getView());

}.bind(this));
