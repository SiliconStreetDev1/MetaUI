# 02. Fiori App Integration

MetaUI is designed to operate seamlessly within a standard SAP Fiori application. You can embed the engine directly into your XML views.

## 1. Configure Dependencies

**`package.json`**
Ensure the library is listed in your dependencies.
```json
"dependencies": {
  "nz.co.siliconst.ui5.metaui": "^1.0.0"
}
```

**`ui5.yaml`**
Register the library for the UI5 tooling middleware.
```yaml
specVersion: "3.0"
metadata:
  name: your.app.namespace
type: application
framework:
  name: SAPUI5
  version: "1.120.0"
  libraries:
    - name: sap.m
    - name: sap.ui.core
    - name: sap.ui.layout
    - name: nz.co.siliconst.ui5.metaui
```

**`manifest.json`**
Declare the dependency so the Fiori Launchpad loads the library correctly.
```json
"sap.ui5": {
  "dependencies": {
    "minUI5Version": "1.120.0",
    "libs": {
      "nz.co.siliconst.ui5.metaui": {}
    }
  }
}
```

## 2. XML View Declaration

To embed a dynamic form directly into a Fiori page (instead of a popup dialog), declare the `metaui` XML namespace and inject the `<DynamicHost>`.

**`View.view.xml`**
```xml
<mvc:View
    controllerName="your.app.namespace.controller.Main"
    xmlns:mvc="sap.ui.core.mvc"
    xmlns="sap.m"
    xmlns:metaui="nz.co.siliconst.ui5.metaui.controls">

    <Page title="Dynamic Configuration">
        <content>
            <!-- Embed the DynamicHost -->
            <metaui:DynamicHost 
                id="dynamicFormHost" 
                schemaDefinition="{backend>/SchemaDefinition}" 
                data="{backend>/PayloadData}"
                useMessageManager="true"
                submit=".onMetaFormSubmit" />
        </content>
    </Page>

</mvc:View>
```

## 3. Controller Binding (JavaScript)

If your backend supplies the JSON as strings, you can bind to `dataJson` instead of `data`.

```javascript
onInit: function() {
    // If setting programmatically rather than XML binding:
    const host = this.byId("dynamicFormHost");
    
    // Engine automatically renders when schema and data are supplied
    host.setProperty("schemaDefinition", mySchemaObject);
    host.setProperty("data", myPayloadObject);
},
```

## 4. True Two-Way Binding

If you want the `DynamicHost` to act like a standard UI5 input field and automatically mutate your external model property as the user types, you simply rely on UI5's native two-way binding on the `data` (or `dataJson`) property.

The Engine uses a native `deepEqual` check internally to safely break the two-way infinite loop while preserving cursor focus.

```xml
<metaui:DynamicHost 
    id="dynamicFormHost" 
    schemaDefinition="{backend>/SchemaDefinition}" 
    
    <!-- Native two-way binding -->
    data="{backend>/PayloadData}"
    
    liveUpdate="true" />
```

```javascript
onFormSubmit: function(oEvent) {
    const payload = oEvent.getParameter("payload");
    // Send updated payload back to OData/REST service
}
```
