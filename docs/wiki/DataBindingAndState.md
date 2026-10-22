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

When enabled, every field `change` event (e.g. blurring a field or pressing Enter) immediately runs local field validation (`ValueState.Error`) and synchronizes the updated sandbox payload directly back into the upstream `data` / `dataJson` / OData bound models without waiting for `triggerSubmit()`.

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

## Error Handling & Single-Authority Validation (`ValidationLedger`)

MetaUI uses `ValidationLedger` as the single authoritative coordinator for field and form validation across three error channels (`schemaError`, `policyError`, and `customError`).

### Local Visual Validation & Sandbox Isolation
1. **Interactive Field Changes (`change` event)**: Whenever a user completes a field edit (e.g. blurring an input, selecting an item, or picking a date), the plugin runs its `validate()` pipeline via `PipelineManager` and notifies the `Engine` and `ValidationLedger`. If invalid, the plugin immediately applies `ValueState.Error` and `ValueStateText` to the UI5 control.
2. **Sandboxed Mode (`liveUpdate="false"`, default) vs. Live Mode (`liveUpdate="true"`)**:
   - When `liveUpdate="false"`, edits remain isolated inside the internal `StateManager` (`SandboxJSONModel`). The parent application's bound `data` / `dataJson` / OData model is shielded from unsubmitted edits until `triggerSubmit()` succeeds with zero active errors.
   - When `liveUpdate="true"`, `DataSyncDelegate` continuously pushes every field change back to the parent `data` / `dataJson` / OData binding while still evaluating and displaying validation state on the controls.
3. **Full Form Validation Gate (`triggerSubmit()`)**: Calling `triggerSubmit()` (or pressing the dialog submit button) runs `Engine.validateAll()` across all registered plugins, cloned table rows, and nested array/object payloads (`PayloadValidator`), and blocks submission if any visible field has an active `schemaError`, `policyError`, or `customError`.

### Global Message Manager Integration (`useMessageManager="true"`)
As documented in [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md) §6, plugins always manage their own `ValueState.Error` manually on the control so UI5's internal binding sync never overwrites custom schema or policy errors. When you additionally set `useMessageManager="true"` on the `DynamicHost`, `ValidationLedger` synchronizes scoped `sap/ui/core/message/Message` instances (tagged with `processor: stateManager.getModel()`) into `sap/ui/core/Messaging`. This populates centralized Fiori `MessagePopover` controls while ensuring every message is deterministically cleaned up when the field is fixed or when the host is destroyed.

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

---

## Advanced Data Binding: Custom Properties (`controlProps`)

The `ui.controlProps` object acts as an escape hatch in your JSON Schema, allowing you to inject raw, native SAPUI5 properties directly into the generated widget. While it can be used for static properties (e.g., `"showClearIcon": true`), its true power lies in **Dynamic Expression Bindings**.

### Dynamic Expression Bindings
You can write full UI5 `{= ... }` expressions to dynamically toggle UI states based on other fields in the payload, or even bind to external models supplied by your parent application.

**Binding to the Internal MetaUI Payload:**
The MetaUI Engine intercepts both the host's configured `modelName` (default `meta>`) and the generic placeholder `metaui>` (rewriting `${metaui>` to `${<modelName>>` in `ControlDirectiveUtil.ts`). This shields you from sandbox model collisions and avoids conflicts with Fiori Elements metadata models.
```json
"controlProps": {
  "placeholder": "{= ${metaui>/AgreeTerms} ? 'Please leave a comment...' : 'You must agree to terms first!' }"
}
```

**Binding to External Parent Models:**
Because the engine selectively routes the `metaui>` prefix, you can freely bind to any external models provided by your parent application (such as `i18n>`, `device>`, or `Student>`) without the MetaUI engine interfering or trying to sandbox them.
```json
"controlProps": {
  "placeholder": "{= ${settings>/liveUpdate} ? 'Live Data Mode' : 'Sandbox Mode' }"
}
```

### Blocked Properties (Sandbox Integrity)
To maintain the security and architectural integrity of the two-way data binding engine, certain critical properties (`BLOCKED_CONTROL_PROPS` in `ControlCapabilities.ts`) are blocked and cannot be overridden in `controlProps`. These include:
- `value`, `selectedKey`, `selectedKeys`, `selected`, `dateValue`, `tokens` (Data paths managed strictly by the `StateManager`)
- `editable`, `enabled`, `visible` (Managed strictly by `visibleOn`, `enabledOn`, and `readOnly` schema directives)
- `valueState`, `valueStateText` (Managed exclusively by the validation pipeline)

If you attempt to inject these, the Engine will block them and log an `ILLEGAL OVERRIDE` warning via `Logger.warn`.
