# MetaUI - Dynamic SAP UI5 Rendering Engine

MetaUI is an UI5 library that dynamically generates fully accessible, Fiori-compliant forms and tables purely from JSON schemas. It utilizes an **Isolated State Pattern** to entirely decouple from host OData bindings, yielding a clean JSON payload upon submission.

## 🏗️ Architecture
1. **Standard UI5**: Relies strictly on native UI5 layout grids (`sap.ui.layout.form.SimpleForm`, `sap.m.Table`).
2. **Schema Normalization**: Ingests ABAP RTTI JSON payloads and normalizes them into a strict `ISchema` layout matrix.
3. **Plugin Registry**: Maps primitive schema types (`string`, `number`, `boolean`, `dropdown`, `date`) directly to discrete UI5 control plugins (`sap.m.Input`, `sap.m.StepInput`, etc.).

## 📚 Documentation Wiki
Full payload references and API details are tracked in Git under the `docs/` folder:
*   [Payload Formats & Schema API](docs/payload_formats.md)

## 🚀 How to Test the Sandbox

To understand how the engine works, a standalone test sandbox has been provided. It asynchronously loads two physical files:
*   `test/mockSchema.json` - The schema definition detailing field types, required states, and dropdown arrays.
*   `test/mockData.json` - The initial state payload to populate the form.

### Running the Test
You **cannot** run this test by double-clicking the `index.html` file due to browser CORS restrictions blocking `fetch()`. You must run it via a local web server.

1. Open a terminal in the root `MetaUI` project folder.
2. Run a static file server using Node.js:
   ```bash
   npx serve -p 8080 .
   ```
3. Open your web browser and navigate to:
   `http://localhost:8080/test/index.html`
4. Click **"Open MetaUI Dialog"**.
5. Modify the values in the form. Notice the built-in validation rules (e.g., required fields, dropdown selections).
6. Click **Save**. The clean, extracted JSON payload will be printed directly to the text area.

## 📦 Installation (NPM)

If you are developing a modern UI5 application utilizing `ui5-tooling`, you can pull this engine in directly via NPM:

```bash
npm install @siliconst/metaui
```

### 1. package.json Configuration
Ensure your application consumes the library by adding it to your `package.json` under the `ui5` dependencies block:

```json
  "ui5": {
    "dependencies": [
      "@siliconst/metaui"
    ]
  }
```
*(Note: Because this is published as an enterprise-grade UI5 library, you **do not** need to configure any `ui5.yaml` project-shims!)*

### 2. manifest.json Registration
You must explicitly declare the library dependency in your application's `manifest.json` so the UI5 core automatically downloads the runtime files and triggers the internal `PluginRegistry` bootstrapper.

```json
"sap.ui5": {
  "dependencies": {
    "minUI5Version": "1.120.0",
    "libs": {
      "sap.m": {},
      "sap.ui.core": {},
      "nz.co.siliconst.ui5.metaui": {}
    }
  }
}
```

## 💻 Instantiating the Engine in your Controller

Once installed and registered, simply require the `GeneratorHost` control in your view controllers:

```javascript
sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "nz/co/siliconst/ui5/metaui/controls/GeneratorHost"
], function(Controller, GeneratorHost) {
    return Controller.extend("my.app.controller.Main", {
        
        openDynamicForm: function(schemaPayload, dataPayload) {
            const host = new GeneratorHost({
                schemaDefinition: schemaPayload, // The RTTI schema from ABAP
                initialData: dataPayload,        // Your isolated JSON payload
                submit: (oEvent) => {
                    const finalJsonPayload = oEvent.getParameter("payload");
                    // Send finalJsonPayload back to SAP ABAP via your REST/OData API!
                }
            });
            
            host.openInDialog("Edit Customer");
        }
    });
});
```

## 🔗 Declarative XML Model Binding
Because `GeneratorHost` extends `sap.ui.core.Control`, you can also embed it directly into your XML Views and bind standard UI5 Models (JSON, OData) natively to its properties.

First, add the namespace to your XML View:
```xml
xmlns:meta="nz.co.siliconst.ui5.metaui.controls"
```

Then bind your host application's models directly to the control:
```xml
<meta:GeneratorHost 
    schemaDefinition="{schemaModel>/CustomerSchema}" 
    initialData="{odataModel>/Customers('1001')}" />
```
*Note: The engine will safely clone the incoming `initialData` into its own isolated state, preventing any unwanted two-way binding bleed into your host OData models until you explicitly catch the `submit` event!*
