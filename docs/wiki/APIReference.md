# API Reference (DynamicHost)

The `DynamicHost` (`nz.co.siliconst.ui5.metaui.controls.DynamicHost`) is the primary public interface for the MetaUI framework. It extends `sap.ui.core.Control`.

---

## Public Properties

| Property | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `schemaDefinition` | `any` | `null` | The structural schema defining the UI (either JSON Schema or MetaUI object array format). |
| `data` | `object` | `null` | The underlying data model as a native JS object. Supports two-way binding. Automatically updates on `submit` or continuously if `liveUpdate="true"`. |
| `dataJson` | `string` | `null` | The underlying data model as a stringified JSON. Supports two-way binding. Automatically updates on `submit` or continuously if `liveUpdate="true"`. |
| `editable` | `boolean` | `true` | If false, renders the entire generated layout as read-only. |
| `liveUpdate` | `boolean` | `false` | If true, bypasses the sandbox and forcefully pushes field `change` events up to the two-way bound data models. |
| `debugMode` | `boolean` | `false` | If true, generates additional UI components for introspection, such as inline schema error tooltips or layout logs. |
| `useMessageManager` | `boolean` | `false` | If true, ties the internal validation errors directly into the global SAPUI5 MessageManager for centralized error popovers. |

---

## Events

### `beforeSubmit`
Fired immediately before the validation pipeline triggers. Allows you to inject custom pre-flight logic or abort the submission process before the engine processes the layout.

### `submit`
Fired after the validation pipeline passes successfully.
- **Parameters**: 
  - `payload` (object): The clean, sanitized, and validated data object extracted from the state manager.

### `fieldChange`
Fired every time an individual field value is mutated by the user, regardless of whether `liveUpdate` is active or not.
- **Parameters**:
  - `fieldPath` (string): The absolute schema path of the modified field (e.g., `/General/CustomerName`).
  - `isValid` (boolean): Whether the specific field currently passes its local schema validation rules.

### `validationStateChanged`
Fired when the global validity of the entire form changes.
- **Parameters**:
  - `isValid` (boolean): The current overarching state of the form layout.

### `error`
Fired when a catastrophic failure occurs during layout generation (e.g., duplicate IDs, unparseable schemas, unregistered plugin types).

---

## Public Methods

| Method | Returns | Description |
| :--- | :--- | :--- |
| `openInDialog(title?, submitBtnText?, cancelBtnText?, width?, view?)` | `void` | Mounts the host inside a native `sap.m.Dialog` popup and blocks until submitted or cancelled. The `submitBtnText` string sets the text of the primary action button, which inherently triggers the extraction pipeline when clicked. |
| `triggerSubmit()` | `boolean` | Manually fires the validation and extraction pipeline. Returns `true` if validation passes, otherwise returns `false`. |
| `addCustomError(fieldPath, message)` | `void` | Manually applies a visual error state to a specific field and blocks form submission. Ideal for applying custom business rules or backend validation errors. |
| `clearCustomError(fieldPath)` | `void` | Clears a custom error message from a specific field. |
