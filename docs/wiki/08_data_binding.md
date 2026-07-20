# 08. Data Binding Architecture

MetaUI leverages native SAP UI5 controls internally. It supports three strict binding strategies for feeding and extracting data: Native OData Binding, `data` (Object Binding), and `dataJson` (String Binding).

---

## 1. Native OData Binding (V2 and V4)

MetaUI includes an internal `ODataDelegate` that natively detects and synchronizes with standard SAPUI5 `sap.ui.model.odata.v2.ODataModel` and `sap.ui.model.odata.v4.ODataModel` contexts. 

You can bind an OData element context directly to the `DynamicHost` without requiring any intermediate Javascript models or manual extraction.

```xml
<!-- XML View Example -->
<mvc:View
    xmlns:mvc="sap.ui.core.mvc"
    xmlns:meta="nz.co.siliconst.ui5.metaui.controls">
    
    <!-- Bind the host directly to the OData Entity context path -->
    <meta:DynamicHost 
        schemaDefinition="{viewModel>/parsedSchema}"
        binding="{/Employees('1234')}" 
        liveUpdate="true" />
        
</mvc:View>
```

When the OData context resolves:
1. The `ODataDelegate` automatically extracts the payload (using async `requestObject` for V4 or sync `getObject` for V2).
2. It dynamically strips all framework annotations (e.g., `__metadata`, `@odata.etag`) so the Engine only receives clean business data.
3. If `liveUpdate` is true, or if `triggerSubmit()` is called, MetaUI automatically routes property patches back onto the OData Context so the OData model handles the actual backend HTTP PATCH request.

---

## 2. Object Binding (`data`)

This is the standard approach for programmatic REST API integration when you aren't using OData. You pass a raw Javascript Object into the `data` property, and MetaUI uses it to build the form. 

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
    
    // Send back to your backend (REST/etc.)
    fetch("/api/save", {
        method: "POST",
        body: JSON.stringify(finalPayload)
    });
});
```

---

## 3. String Binding (`dataJson`)

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
