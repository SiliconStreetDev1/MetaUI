# API Reference (DynamicHost)

The `DynamicHost` (`nz.co.siliconst.ui5.metaui.controls.DynamicHost`) is the primary public interface for the MetaUI framework. It acts as a transparent Facade wrapper that extends `sap.ui.core.Control`.

---

## Public Properties (Metadata)

| Property | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `schemaDefinition` | `any` | `null` | The structural schema defining the UI (either JSON Schema or OpenAPI specification). Can also accept a URL string to fetch remote schemas. |
| `schemaDefinitions` | `object` | `{}` | A dictionary of shared schema definitions parsed from the root schema or OpenAPI definition, used for `$ref` resolution. |
| `schemaTarget` | `string` | `null` | The specific definition or endpoint target to extract from a complex root schema (e.g. `CustomerProfile` or `#/paths/...`). |
| `pluginRegistry` | `object` | `null` | Optional custom `PluginRegistry` instance override for isolated host scoping. |
| `schemaBuilderRegistry` | `object` | `null` | Optional custom `SchemaBuilderRegistry` instance override. |
| `data` | `any` | `null` | The underlying data model as a native JS object. Supports two-way binding. Automatically updates on `submit` or continuously if `liveUpdate="true"`. |
| `dataJson` | `string` | `null` | The underlying data model as a stringified JSON. Supports two-way binding. Automatically updates on `submit` or continuously if `liveUpdate="true"`. |
| `liveUpdate` | `boolean` | `false` | If true, bypasses the sandbox and forcefully pushes field `change` events up to the two-way bound data models. |
| `isValid` | `boolean` | `true` | Tracks the global schema validation state of the entire form. |
| `useMessageManager` | `boolean` | `false` | If true, ties the internal validation errors directly into the global SAPUI5 `Messaging` (`MessageManager`) for centralized error popovers. |
| `modelName` | `string` | `"meta"` | The internal JSONModel namespace used by the Engine for absolute data bindings. |
| `debugMode` | `boolean` | `false` | If true, records diagnostic DOM and layout metadata accessible via `getDebugDomMetadata()`. |
| `editable` | `boolean` | `true` | If false, renders the entire generated layout as read-only. |
| `layoutBudget` | `int` | `0` | Controls how many nested fields can be recursively rendered inline before overflowing into a dialog. `0` disables inline sub-layouts. |
| `engineScopeId` | `string` | `null` | A deterministic internal prefix passed down recursively to prevent DOM ID collisions between multiple engines. |
| `width` | `sap.ui.core.CSSSize` | `"100%"` | Explicit CSS width of the host container (`min-width: 0`, `max-width: 100%`, `box-sizing: border-box` enforced for containment). |
| `height` | `sap.ui.core.CSSSize` | `"auto"` | Explicit CSS height of the host container (`"auto"` by default so embedded hosts size to their content). |

---

## Events (Metadata)

### `beforeSubmit`
Fired immediately before the validation pipeline triggers. Allows you to inject custom pre-flight logic or abort the submission process.
- **Parameters**: 
  - `payload` (object): The clean, sanitized data object extracted from the state manager.
  - `addError` (function): Callback to inject custom validation failures (`addError(fieldPath, message)`).
  - `preventDefault` (function): Callback to abort the submission entirely.

### `submit`
Fired after the validation pipeline passes successfully.
- **Parameters**: 
  - `payload` (object): The validated data object.
  - `payloadJson` (string): The stringified JSON version of the validated payload.

### `cancel`
Fired when a user explicitly cancels a form via the `sap.m.Dialog` (via the `openInDialog` API).

### `fieldChange`
Fired every time an individual field value is mutated by the user, regardless of whether `liveUpdate` is active or not.
- **Parameters**:
  - `fieldPath` (string): The schema path of the modified field (e.g., `CustomerName` or `General/CustomerName`).
  - `value` (any): The newly typed value of the field.
  - `payload` (object): The complete copy of the sandbox data state.
  - `isValid` (boolean): Whether the specific field currently passes its local schema validation rules.

### `validationStateChanged`
Fired when the global validity of the entire form changes.
- **Parameters**:
  - `isValid` (boolean): The current overarching state of the form layout.

### `validationError`
Fired discretely when a specific field fails validation.
- **Parameters**:
  - `fieldPath` (string): The schema path of the invalid field.
  - `message` (string): The error string describing the violation.

### `validationSuccess`
Fired discretely when a specific field passes validation.
- **Parameters**:
  - `fieldPath` (string): The schema path of the valid field.

### `error`
Fired when a catastrophic failure occurs during layout generation (e.g., duplicate IDs, unparseable schemas, unregistered plugin types, or remote fetch failures).
- **Parameters**:
  - `message` (string): Human-readable error description.
  - `exception` (object): The raw JavaScript Error object.

### `beforeLayoutSectionChange`
Fired by `WizardLayout` immediately when the user presses the "Next Step" button, **before** the layout physically transitions to the next step. Provides a structured hook for consumers to perform per-step validation — including asynchronous backend checks — and optionally block or resume the navigation.

> **Important:** With the modern MetaUI custom Wizard architecture, navigation is paused. Calling `preventDefault()` will immediately block the transition. If you are doing an async backend check, you must call `preventDefault()` synchronously during the event, and then call `resumeNavigation()` inside your Promise `.then()` to physically advance the Wizard once validation passes.

- **Parameters**:
  - `stepIndex` (int): The **0-based index** of the step the user is navigating **away from** (the source step).
  - `currentSectionIndex` (int): Alias for `stepIndex` (0-based index of the current wizard step).
  - `newSectionIndex` (int): The **0-based index** of the target wizard step being navigated to (`currentSectionIndex + 1`).
  - `payload` (object): A live snapshot of the full form payload at the moment of transition.
  - `preventDefault` (function): Blocks navigation synchronously. Call this immediately if you need to wait for an async backend check.
  - `addError` (function(fieldPath: string, errorMessage: string)): Blocks navigation **and** paints the specified field with an error state (and pushes to MessageManager if active). Use for async backend validation failures.
  - `resumeNavigation` (function): Explicitly allows navigation after a prior `preventDefault()` call. Intended for async consumer patterns (e.g., backend validation Promises). Calling this causes the wizard to advance to the next step immediately.

**Example — async backend check:**
```javascript
onBeforeLayoutSectionChange: function(oEvent) {
    var oParams = oEvent.getParameters();
    oParams.preventDefault(); // Block navigation immediately pending the async check
    myBackendService.validate(oParams.payload).then(function(result) {
        if (result.isValid) {
            oParams.resumeNavigation(); // Explicitly advances to the next step
        } else {
            oParams.addError("/Applicant/FirstName", result.errorMessage);
        }
    });
}
```

---

## Public Methods

| Method | Returns | Description |
| :--- | :--- | :--- |
| `setBindingContext(oContext: sap.ui.model.Context \| null \| undefined, sModelName?: string)` | `this` | Overridden to intercept OData V4 contexts and automatically initialize the `ODataDelegate`. |
| `bindObject(vPath: string \| { path: string; model?: string }, mParameters?: object)` | `this` | Overridden to bind the object context and attach an OData change listener. |
| `bindElement(vPath: string \| { path: string; model?: string }, mParameters?: object)` | `this` | Overridden to attach change listeners to Element bindings for OData synchronization. |
| `onBeforeRendering()` | `void` | Natively delegates properties to the internal `GeneratorHost` and boots the rendering engine. |
| `getBaseProperty(propertyName: string)` | `unknown` | Reads a property directly from the base UI5 control without inner-host interception. |
| `setBaseProperty(propertyName: string, value: unknown, suppressInvalidate?: boolean)` | `this` | Writes a property directly to the base UI5 control without inner-host forwarding. |
| `forwardResolvedSchemaToInnerHost(resolvedSchema: unknown)` | `void` | Forwards a resolved remote schema object to the inner `GeneratorHost` if already spawned. |
| `setProperty(propertyName: string, value: unknown, suppressInvalidate?: boolean)` | `this` | Transparent proxy. Routes manual property updates dynamically down to the spawned internal host. |
| `getProperty(propertyName: string)` | `unknown` | Transparent proxy. Automatically extracts the freshest inner data (e.g., intercepts calls to `getProperty("outputData")`, `getProperty("data")`, `getProperty("dataJson")`, and `getProperty("isValid")` and routes them to the inner host). |
| `generate()` | `Promise<void>` | Asynchronously preloads required plugins and generates the layout into the host aggregation. |
| `openInDialog(title?: string, submitButtonText?: string, cancelButtonText?: string, dialogWidth?: string, parentView?: Control)` | `Promise<void>` | Mounts the host inside a native `sap.m.Dialog` popup and resolves when the dialog closes. The `submitButtonText` triggers the validation/submit pipeline when clicked. |
| `triggerSubmit()` | `boolean` | Manually fires the validation and extraction pipeline. Returns `true` if validation passes, otherwise `false`. |
| `addCustomError(fieldPath: string, message: string)` | `void` | Manually applies a visual error state to a specific field and blocks form submission. |
| `clearCustomError(fieldPath: string)` | `void` | Clears a custom error message from a specific field. |
| `attachSubmit(fnFunction: (oEvent: Event) => void, oListener?: object)` | `this` | Attaches an event handler to the `submit` event. |
| `setSchemaDefinitions(definitions: Record<string, ISchema>)` | `this` | Sets the global `$ref` schema definitions dictionary on the host and inner host. |
| `getSchemaDefinitions()` | `Record<string, ISchema> \| undefined` | Retrieves the normalized `$ref` schema definitions dictionary from the inner host. |
| `getSchemaDefinition(refPath: string)` | `ISchema \| undefined` | Resolves a single `$ref` definition from the inner host. |
| `getStateManager()` | `StateManager \| null` | Proxies access to the active `StateManager` instance on the inner host. |
| `getDebugDomMetadata()` | `unknown` | Proxies access to the diagnostic DOM metadata tree from the inner host when `debugMode="true"`. |
