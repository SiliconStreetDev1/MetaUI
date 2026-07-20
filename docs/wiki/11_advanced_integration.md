# 10. Advanced Integration

MetaUI is designed to be highly extensible. You can intercept the layout generation and submission lifecycles directly from your XML View Controllers.

## Event Hooks

The `DynamicHost` emits three critical events: `beforeSubmit`, `submit`, and `validationError`.

### `beforeSubmit`
Fired after all internal validations pass, but *before* the dialog closes or the final `submit` event fires. Use this to run asynchronous backend validations or complex cross-field checks.

**`View.view.xml`**
```xml
<metaui:DynamicHost 
    id="dynamicFormHost" 
    beforeSubmit=".onBeforeSubmit" 
    submit=".onFinalSubmit" />
```

**`Controller.controller.js`**
```javascript
onBeforeSubmit: function(oEvent) {
    const payload = oEvent.getParameter("payload");
    const addError = oEvent.getParameter("addError");
    const preventDefault = oEvent.getParameter("preventDefault");

    // Example: Custom asynchronous check
    if (payload.StartDate > payload.EndDate) {
        addError("EndDate", "End Date must be after Start Date.");
        preventDefault(); // Halts the submission pipeline
    }
}
```

### `validationError`
Fired whenever a field fails internal validation, or if a custom plugin throws a catastrophic error during the submit pipeline.

```javascript
onValidationError: function(oEvent) {
    const fieldPath = oEvent.getParameter("fieldPath");
    const message = oEvent.getParameter("message");
    
    sap.m.MessageToast.show("Validation failed at " + fieldPath + ": " + message);
}
```

## OData V2/V4 Model Injection

MetaUI runs entirely isolated using its internal `JSONModel` bound as `meta`. However, you can pass an external OData model to the `DynamicHost` if your custom plugins (like `ODataListBindingPlugin`) require backend access.

```javascript
onInit: function() {
    const oDataModel = this.getOwnerComponent().getModel();
    const host = this.byId("dynamicFormHost");
    
    // Inject the global OData model into the MetaUI host container
    host.setModel(oDataModel, "backend");
}
```

In your schema, your plugin can now reference the `backend` model alias to fetch data.
