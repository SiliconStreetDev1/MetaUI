# MetaUI

**MetaUI** is an extensible, metadata-driven UI engine built on top of SAP UI5. Instead of relying on static XML views, it parses standard JSON Schema definitions at runtime to dynamically generate SAP Fiori component trees. This enables server-driven architectures where the UI structure and data bindings are determined entirely by the incoming payload.

## MetaUI vs. Fiori Elements
It is important to note that MetaUI is **not** an attempt to replace SAP Fiori Elements. Fiori Elements is a robust framework for building UIs driven by static OData CDS annotations. 

MetaUI is designed for use cases where **CDS annotations are unavailable, impossible, or too rigid.** 
- **Highly Dynamic**: MetaUI parses standard JSON Schemas at runtime, allowing you to generate completely dynamic layouts based on user roles, remote APIs, or NoSQL databases where the schema isn't known until execution.
- **Backend Agnostic**: Because it relies on universal JSON rather than OData metadata, MetaUI can be plugged into virtually any tech stack (Node.js, Firebase, GraphQL, REST).

## 🚀 Key Features

Built for strict UI5 architecture adherence, MetaUI enforces modularity through a Plugin-based design and explicitly avoids inline DOM manipulation.

✨ **[Play with the Live Interactive Demo Here!](https://SiliconStreetDev1.github.io/MetaUI/index.html)** ✨

---

## 📚 Technical Documentation

For detailed information regarding the JSON Schema properties, `ui.*` orchestrations, and recursive nested arrays, consult the payload formats specification:

- [MetaUI Documentation Wiki](docs/wiki/Home.md)
- [Payload Formats & Directives](docs/payload_formats.md)
- [Fiori Integration Guide](docs/fiori_integration.md)
- [Custom Plugin Authorship Guide](docs/plugin_authorship.md)

---

## 🏗 Architecture & Design Tenets

1. **JSON-Schema Core:** MetaUI parses standard recursive JSON Schema `properties` blocks (`Record<string, IPropertyMetadata>`).
2. **Implicit Layout Orchestration:** The `Engine` determines standard Layouts based on payload shape. Root `object` types map to `FormLayout` clusters. Root `array` types map to `TableLayout` instances. Nested arrays trigger recursive drill-down dialogs.
3. **ConditionEngine Compilation:** Cross-context visibility rules (e.g., `"$root.status === 'DRAFT'"`) are transpiled into native UI5 Expression Bindings to utilize native reactivity.
4. **Universal Plugin Architecture:** The `PluginRegistry` isolates control instantiation. Core layout managers delegate to registered implementations of `IPlugin`. Plugins are rigorously segregated into:
   - `plugins/controls/`: Visual UI components (e.g., String, Date).
   - `plugins/validators/`: Custom business logic constraints.
   - `plugins/formatters/`: Data transformation utilities.
   - `plugins/actions/`: Button and execution handlers.
   - `plugins/datasources/`: Remote value help providers.

---

## 🚀 Quick Start (Sandbox)

The repository contains an internal UI5 sandbox for testing the engine's inference logic.

```bash
# Install dependencies
npm install

# Run the UI5 development server (Sandbox application)
npm run start
```
The test suite will boot at `http://localhost:8080/index.html`.

---

## 🛠 Integration

### Installation

Import the compiled library namespace into your UI5 project. 

```javascript
sap.ui.require(["nz/co/siliconst/ui5/metaui/controls/GeneratorHost"], function (GeneratorHost) {
    const host = new GeneratorHost({
        // The Schema Definition
        schemaDefinition: {
            type: "object",
            uiLayout: [
                {
                    type: "Group",
                    label: "User Settings",
                    elements: [
                        { type: "Control", scope: "#/properties/Username" },
                        { type: "Control", scope: "#/properties/IsActive" }
                    ]
                }
            ],
            properties: {
                Username: { type: "string", ui: { label: "User Name" } },
                IsActive: { type: "boolean", ui: { label: "Active", widget: "switch" } }
            }
        },
        // The Data Payload
        initialData: {
            Username: "JDoe",
            IsActive: true
        }
    });

    // Option A: Render inside an existing container
    myVBox.addItem(host);
    
    // Option B: Mount as an isolated Dialog
    host.openInDialog("User Configuration", "OK");

    // Capture the extracted JSON payload on submit
    host.attachSubmit(function(oEvent) {
        const payload = oEvent.getParameter("payload");
        console.log(payload);
    });
});
```

### Declarative XML Binding

MetaUI supports client-side validation based on JSON Schema constraints natively.

### Mandatory Fields
Adding `"required": true` to any property in the schema will enforce input validation prior to the `submit` event being fired.

### Custom Validation Exits (`beforeSubmit`)
For business logic requiring custom checks (e.g., async validation), the `GeneratorHost` provides a `beforeSubmit` event.

```javascript
onBeforeSubmit: function(oEvent) {
    const payload = oEvent.getParameter("payload");
    const preventDefault = oEvent.getParameter("preventDefault");
    const addError = oEvent.getParameter("addError");

    if (payload.CustomerName === "Reserved") {
        addError("CustomerName", "This customer name is reserved.");
        preventDefault();
    }
}
```

### Asynchronous Field Validation (`fieldChange`)
For real-time validation (like checking if a username is taken), listen to the `fieldChange` event. You can lock the form using `setBusy(true)`, perform your async check, and imperatively paint the field red using `addCustomError()` if the check fails.

```javascript
onFieldChange: function(oEvent) {
    const fieldPath = oEvent.getParameter("fieldPath");
    const value = oEvent.getParameter("value");
    const host = oEvent.getSource();

    if (fieldPath === "Username") {
        host.setBusy(true); // Lock the UI5 form
        
        myBackendService.checkUsername(value).then((isTaken) => {
            if (isTaken) {
                host.addCustomError("Username", "This username is taken.");
            } else {
                host.clearCustomError("Username");
            }
        }).finally(() => {
            host.setBusy(false); // Unlock
        });
    }
}
```

### Fiori Message Manager Integration
By default, validation errors are shown locally. To aggregate validation errors into the global UI5 Message Popover, enable `useMessageManager` on the `GeneratorHost`:

```xml
<meta:GeneratorHost
    schemaDefinition="{/mySchema}"
    useMessageManager="true"
    beforeSubmit=".onBeforeSubmit"
    submit=".onSubmit" />
```

## Supported Features

The `GeneratorHost` fully supports declarative XML instantiation in traditional UI5 views:

```xml
<mvc:View
    xmlns:mvc="sap.ui.core.mvc"
    xmlns:meta="nz.co.siliconst.ui5.metaui.controls">
    
    <meta:GeneratorHost 
        id="metaHost"
        schemaDefinition="{backend>/schema}" 
        initialData="{backend>/data}" 
        submit=".onFormSubmit" />
        
</mvc:View>
```

---

## ⚖️ License & Disclaimer

**MIT License**

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

> [!WARNING]
> **Disclaimer**: This software is provided "as is", without warranty of any kind, express or implied. Use of this project in production environments is at your own risk. The authors shall not be liable for any damages or issues arising from its usage.

