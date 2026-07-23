# API Reference (DynamicHost)

The `DynamicHost` (`nz.co.siliconst.ui5.metaui.controls.DynamicHost`) is the primary public interface for the MetaUI framework. It acts as a transparent Facade wrapper that extends `sap.ui.core.Control`.

---

## Public Properties (Metadata)

| Property | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `schemaDefinition` | `any` | `null` | The structural schema defining the UI (either JSON Schema or MetaUI object array format). Can also accept a URL string to fetch remote schemas. |
| `data` | `object` | `null` | The underlying data model as a native JS object. Supports two-way binding. Automatically updates on `submit` or continuously if `liveUpdate="true"`. |
| `dataJson` | `string` | `null` | The underlying data model as a stringified JSON. Supports two-way binding. Automatically updates on `submit` or continuously if `liveUpdate="true"`. |
| `editable` | `boolean` | `true` | If false, renders the entire generated layout as read-only. |
| `liveUpdate` | `boolean` | `false` | If true, bypasses the sandbox and forcefully pushes field `change` events up to the two-way bound data models. |
| `isValid` | `boolean` | `true` | Tracks the global schema validation state of the entire form. |
| `useMessageManager` | `boolean` | `false` | If true, ties the internal validation errors directly into the global SAPUI5 MessageManager for centralized error popovers. |
| `modelName` | `string` | `"meta"` | The internal JSONModel namespace used by the Engine for absolute data bindings. |
| `debugMode` | `boolean` | `false` | If true, prints verbose layout rendering and data extraction telemetry to the console. |

---

## Events (Metadata)

### `beforeSubmit`
Fired immediately before the validation pipeline triggers. Allows you to inject custom pre-flight logic or abort the submission process.
- **Parameters**: 
  - `payload` (object): The clean, sanitized data object extracted from the state manager.
  - `addError` (function): Callback to inject custom validation failures.
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
  - `fieldPath` (string): The absolute schema path of the modified field (e.g., `/General/CustomerName`).
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

---

## Public Methods

| Method | Returns | Description |
| :--- | :--- | :--- |
| `setBindingContext(oContext?, sModelName?)` | `this` | Overridden to intercept OData V4 contexts and automatically initialize the `ODataDelegate`. |
| `bindElement(vPath, mParameters?)` | `this` | Overridden to attach change listeners to Element bindings for OData synchronization. |
| `onBeforeRendering()` | `void` | Natively delegates properties to the internal `GeneratorHost` and boots the rendering engine. |
| `setProperty(propertyName, value, suppressInvalidate?)` | `this` | Transparent proxy. Routes manual property updates dynamically down to the spawned internal host. |
| `getProperty(propertyName)` | `unknown` | Transparent proxy. Automatically extracts the freshest inner data (e.g., intercepts calls to `getProperty("data")` and routes them to the sandbox payload). |
| `openInDialog(title?, submitBtnText?, cancelBtnText?, width?, view?)` | `void` | Mounts the host inside a native `sap.m.Dialog` popup. The `submitBtnText` triggers the validation/submit pipeline when clicked. |
| `triggerSubmit()` | `boolean` | Manually fires the validation and extraction pipeline. Returns `true` if validation passes, otherwise `false`. |
| `addCustomError(fieldPath, message)` | `void` | Manually applies a visual error state to a specific field and blocks form submission. |
| `clearCustomError(fieldPath)` | `void` | Clears a custom error message from a specific field. |
