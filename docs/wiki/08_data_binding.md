# 08. Data Binding Architecture

MetaUI leverages native SAP UI5 controls internally. However, because MetaUI dynamically generates the layout based on an internal JSON model, you cannot bind external OData paths directly to the generated fields. 

Instead, MetaUI exposes two strict properties for feeding and extracting data: `data` and `dataJson`.

---

## 1. Object Binding (`data`)

This is the standard approach for programmatic integration (e.g., fetching data from a REST API or OData service). You pass a raw Javascript Object into the `data` property, and MetaUI uses it to build the form. 

When the user finishes editing, you listen to the `submit` event to extract the mutated Javascript Object payload.

```javascript
// Controller logic
const host = new DynamicHost({
    schemaDefinition: mySchemaDefinition,
    // Feed the initial data as a standard JS Object
    data: {
        FirstName: "John",
        LastName: "Doe"
    }
});

host.attachSubmit(function(oEvent) {
    // Extract the mutated JS Object payload
    const finalPayload = oEvent.getParameter("payload");
    
    // Send back to your backend (OData/REST/etc.)
    fetch("/api/save", {
        method: "POST",
        body: JSON.stringify(finalPayload)
    });
});
```

---

## 2. String Binding (`dataJson`)

If you prefer to deal purely with serialized JSON strings, or if you want a real-time string snapshot of the form's state (e.g., to log to a console or bind to a display area), you can use the `dataJson` property.

When the form updates, MetaUI automatically pushes the stringified representation of the payload back out to this property.

```xml
<!-- XML View Example -->
<mvc:View
    xmlns:mvc="sap.ui.core.mvc"
    xmlns:meta="nz.co.siliconst.ui5.metaui.controls">
    
    <meta:DynamicHost 
        schemaDefinition="{viewModel>/parsedSchema}" 
        dataJson="{viewModel>/liveFormString}" 
        liveUpdate="true" />
        
</mvc:View>
```

In the example above, if the user edits the form, the `viewModel>/liveFormString` property is updated with the serialized JSON string whenever a standard UI5 `change` event occurs (e.g., the field loses focus or the user presses Enter).
