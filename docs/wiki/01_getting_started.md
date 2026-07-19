# 01. Getting Started

MetaUI is a plugin-driven JSON-schema rendering engine for SAP UI5. Instead of relying on static XML views, it parses standard JSON Schema definitions at runtime to dynamically generate SAP Fiori component trees, enabling fully server-driven architectures.

## Architecture Overview

```mermaid
flowchart TD
    A[JSON Schema & Payload] --> B(GeneratorHost)
    B --> C{Engine}
    C -->|Routes Primitives| D[PluginRegistry]
    C -->|Evaluates visibleOn/enabledOn| E[ConditionEngine]
    C -->|Validates & Formats| F[PipelineManager]
    D --> G[Native UI5 Controls]
    G --> H[Fiori Screen]
```

## Installation

Install the package via npm:

```bash
npm install nz.co.siliconst.ui5.metaui
```

## Basic Initialization (JavaScript)

The core control is the `GeneratorHost`. It requires two properties:
1. `schemaDefinition`: The JSON Schema defining the fields.
2. `initialData`: The runtime data payload.

```javascript
sap.ui.require(["nz/co/siliconst/ui5/metaui/controls/GeneratorHost"], function (GeneratorHost) {
    
    // 1. Define the schema
    const schema = {
        type: "object",
        properties: {
            Username: { type: "string", ui: { label: "User Name" } },
            IsActive: { type: "boolean", ui: { label: "Active Status" } }
        }
    };

    // 2. Define the payload
    const data = {
        Username: "Developer",
        IsActive: true
    };

    // 3. Instantiate the host
    const host = new GeneratorHost({
        schemaDefinition: schema,
        initialData: data
    });

    // 4. Open the form in a Dialog
    host.openInDialog("User Configuration", "OK");

    // 5. Listen for the payload extraction on submit
    host.attachSubmit(function(oEvent) {
        const payload = oEvent.getParameter("payload");
        console.log("Updated data:", payload);
    });

});
```

When `openInDialog` is called, the engine processes the schema and natively generates a `sap.ui.layout.form.SimpleForm` with a bound `sap.m.Input` and `sap.m.Switch`.

## Next Steps

While opening in a dialog is great for quick scripts, you'll likely want to embed the engine directly into a standard Fiori XML View. 

**Continue to [02. Fiori App Integration](02_fiori_app_integration.md)** to see how to properly configure your `ui5.yaml` and inject `<GeneratorHost>` into an XML view.
