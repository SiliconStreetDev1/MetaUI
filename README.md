# MetaUI

**MetaUI** is a metadata-driven UI5 rendering engine. It provides a mechanism to generate SAP Fiori architectures at runtime by parsing standard JSON Schema definitions, reducing the requirement for manual XML View construction.

Built for strict UI5 architecture adherence, MetaUI enforces modularity through a Plugin-based design and explicitly avoids inline DOM manipulation.

✨ **[Play with the Live Interactive Demo Here!](https://SiliconStreetDev1.github.io/MetaUI/index.html)** ✨

---

## 🏗 Architecture & Design Tenets

1. **JSON-Schema Core:** MetaUI parses standard recursive JSON Schema `properties` blocks (`Record<string, IPropertyMetadata>`).
2. **Implicit Layout Orchestration:** The `Engine` determines standard Layouts based on payload shape. Root `object` types map to `FormLayout` clusters. Root `array` types map to `TableLayout` instances. Nested arrays trigger recursive drill-down dialogs.
3. **ConditionEngine Compilation:** Cross-context visibility rules (e.g., `"$root.status === 'DRAFT'"`) are transpiled into native UI5 Expression Bindings to utilize native reactivity.
4. **Strict Plugin Pipeline:** The `PluginRegistry` isolates control instantiation. Core layout managers delegate to registered implementations of `IPlugin`.

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
    host.openInDialog("User Configuration", "Save");

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

## 📚 Technical Documentation

For detailed information regarding the JSON Schema properties, `ui.*` orchestrations, and recursive nested arrays, consult the payload formats specification:

- [Payload Formats & Directives](docs/payload_formats.md)
- [Fiori Integration Guide](docs/fiori_integration.md)


