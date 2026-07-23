# Data Binding & State Management

The MetaUI framework acts as a protective layer between your backend UI5 Models and the generated layout, providing deep control over data flow, bidirectional bindings, and input validation.

---

## The Tri-Binding Interface

The `DynamicHost` exposes three primary mechanisms to feed data into the engine, catering to different architectural patterns.

### 1. `data` (Object Mode)
This is the standard, strongly-typed JSON binding path. It binds a pure JavaScript object into the engine (typically from a local `JSONModel` or directly from an OData V4 entity property binding).
- **Use Case**: When you have a parsed JavaScript object ready in your controller, or when you are explicitly binding an OData entity object directly to the property (e.g. `data="{odata>/MyEntity}"`).

### 2. `dataJson` (String Mode)
This property accepts raw, unparsed JSON strings. 
- **Use Case**: When pulling raw, stringified payload blobs directly from a database column or REST API, you can bind the raw text string directly to `dataJson` in your XML view. The engine automatically handles parsing and sanitization internally before generating the UI.

### 3. OData V4 Context Synchronization (`ODataDelegate`)
If the `DynamicHost` is placed within a standard UI5 element binding context that maps to a native OData V4 model (e.g., `host.bindElement("/Employees('E1')")`), the `ODataDelegate` seamlessly hooks in, synchronizing backend property changes without requiring a custom JSON layout schema.

---

## Implicit Binding & Inferred Layouts

Regardless of which of the three binding engines you use above, if you successfully bind a data payload to the `DynamicHost` but **do not provide a `schemaDefinition`** (or provide an empty object `{}`), the engine will automatically enter **Data Inference Mode**. 

The engine will instantly traverse the bound dataset structure, infer the types (e.g., strings to Inputs, booleans to Checkboxes, nested objects to Form containers), and hot-swap an inferred layout schema directly into the sandbox. 

This means you can throw raw JSON or OData contexts at the UI without ever writing a single line of schema definition!

---

## Live Update Mode (Continuous Binding)

If you prefer continuous two-way binding over a sandboxed approach, you can set `liveUpdate="true"` on the `DynamicHost`. 

When enabled, every field `change` event (e.g. blurring a field or pressing Enter) completely bypasses the validation queue and forcefully synchronizes the data directly back into the upstream `data` / `dataJson` bound models in real-time.

---

## The Validation Pipeline (Sandboxed Mode)

If `liveUpdate` is set to `false` (the default), the MetaUI engine acts as a **secure sandbox**. 

When a user types into an input field or toggles a checkbox, the framework *does not* instantly update the upstream UI5 model. Instead, the changes are stored internally within the engine's decoupled **StateManager**.

### Triggering the Pipeline
To release the data upstream, you must explicitly invoke the validation pipeline. This is done in one of two ways:
1. Natively via the `openInDialog()` API (clicking the auto-generated popup submit button).
2. Programmatically calling `oHost.triggerSubmit()`.

**How Validation Works:**
1. The engine iterates over every plugin and requests its current internal value.
2. The `ValidationDelegate` cross-references these values against the strict rules defined in your JSON Schema (e.g., `required`, `maxLength`, `minimum`).
3. If errors are found, the layout highlights the offending UI controls in red with inline error messages and halts the submission.
4. If the data is pristine, the host fires the `submit` event, passing the sanitized, validated JSON object in the `payload` parameter.

---

## Error Handling & Visual Validation

How validation errors are visually surfaced to the user depends entirely on whether the engine is in Sandboxed Mode or Live Update Mode.

### Visual Errors in Sandboxed Mode (Default)
In Sandboxed mode, the engine intentionally suppresses visual error messages while the user is typing. Errors are **only evaluated** when the Validation Pipeline is explicitly triggered (via the Submit button or `triggerSubmit()`).
1. The engine evaluates the schema rules.
2. If invalid, it halts the submit event and logs the violations to the console.
3. The framework then falls back to a **Local Visual State** implementation, directly applying red borders to the offending UI controls without relying on the global UI5 core.

### Visual Errors in Live Update Mode
In Live Update Mode, the engine aggressively syncs data on standard field completions (blur, selection, pressing Enter). To provide immediate feedback without annoying the user while they type, the engine natively intercepts every `change` event, runs the field's data against the schema validator, and instantly applies the **Local Visual State** (red borders) to the control if it fails.

### Global Message Manager Integration (Centralized Errors)
By default, validation errors are handled locally by the plugins (creating red borders, but no popups). If you want to aggregate these errors into a centralized UI (such as a standard Fiori Message Popover button in the footer), you can set `useMessageManager="true"` on the `DynamicHost`.

When enabled, the localized fallback is bypassed. Instead, the `ValidationDelegate` automatically pushes all schema violations directly into the global `sap.ui.core.message.MessageManager`, which handles the red highlights natively and makes the errors instantly accessible to any standard UI5 error aggregation controls.

---

## Change Handling

While the sandbox protects the overall model from unvalidated data, you still have granular access to user interactions as they happen.

### The `fieldChange` Event
Every time a user alters an input, the `DynamicHost` instantly fires a `fieldChange` event. This is the **primary hook** for developers who need to react to user interactions without waiting for a full submission.

Because the engine acts as a sandbox, the parent data model is *not* automatically updated as the user types (unless `liveUpdate` is true). The `fieldChange` event bridges this gap by passing the current state of the sandbox directly to you.

**Event Parameters:**
- `fieldPath` *(string)*: The JSON schema key of the field that was just edited (e.g., `firstName` or `address/city`).
- `value` *(any)*: The newly typed value of the field.
- `isValid` *(boolean)*: Whether the *new* value the user just typed passes the schema constraints.
- `payload` *(object)*: A deep copy of the entire current dataset inside the sandbox, including the new edit.

**Example Usage:**
You can attach to this event to run custom dynamic logic—for example, if a user selects "Other" in a dropdown, you might want to dynamically inject a new field into the schema, or show a warning popup.

```javascript
oHost.attachFieldChange(function(oEvent) {
    var sPath = oEvent.getParameter("fieldPath"); 
    var bIsValid = oEvent.getParameter("isValid");
    var oCurrentData = oEvent.getParameter("payload");

    if (sPath === "country" && oCurrentData.country === "US") {
        console.log("User selected US. State is valid: " + bIsValid);
        
        // Example: Inject a custom validation error if custom logic fails
        if (!oCurrentData.zipCode) {
            oHost.addCustomError("zipCode", "Zip Code is required for US customers.");
        } else {
            oHost.clearCustomError("zipCode");
        }
    }
});
```
