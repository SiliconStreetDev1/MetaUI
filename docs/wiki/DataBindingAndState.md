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
Every time a user commits a field edit (via the UI5 control's `change` event, such as on blur, Enter, or selection change), the `DynamicHost` fires a `fieldChange` event. This is the **primary hook** for developers who need to react to user interactions without waiting for a full submission.

Because the engine acts as a sandbox, the parent data model is *not* automatically updated on each field change (unless `liveUpdate` is true). The `fieldChange` event bridges this gap by passing the current state of the sandbox directly to you.

**Event Parameters:**
- `fieldPath` *(string)*: Normalized by `ValidationDelegate.normalizeFieldPath`: a leading-slash JSON Pointer path when a specific field was edited (e.g., `"/firstName"` or `"/address/city"`), or `""` (empty string) when the notification is whole-form / root and not tied to a specific field.
- `value` *(any)*: The newly committed value of the field.
- `isValid` *(boolean)*: Whether the *new* value passes the field's schema constraints.
- `payload` *(object)*: A deep copy of the entire current dataset inside the sandbox, including the new edit.

**Example Usage:**
You can attach to this event to run custom dynamic logic—for example, if a user selects "Other" in a dropdown, you might want to dynamically inject a new field into the schema, or show a warning popup.

```javascript
oHost.attachFieldChange(function(oEvent) {
    var sPath = oEvent.getParameter("fieldPath"); 
    var bIsValid = oEvent.getParameter("isValid");
    var oCurrentData = oEvent.getParameter("payload");

    if (sPath === "/country" && oCurrentData.country === "US") {
        console.log("User selected US. State is valid: " + bIsValid);
        
        // Example: Inject a custom validation error if custom logic fails
        if (!oCurrentData.zipCode) {
            oHost.addCustomError("/zipCode", "Zip Code is required for US customers.");
        } else {
            oHost.clearCustomError("/zipCode");
        }
    }
});
```

---

## Advanced Data Binding: Custom Properties (`controlProps`)

The `ui.controlProps` object injects native SAPUI5 properties into the generated widget. An entry is either a static value (`"showClearIcon": true`) or a UI5 binding expression string.

It is **not** an unrestricted escape hatch. A schema may arrive from a source the application does not control, so every entry is vetted against the target control's own UI5 property metadata before it is written, by `vetControlProperty()` in `src/nz/co/siliconst/ui5/metaui/utils/ControlCapabilities.ts`. The gate is an allowlist over UI5 property **types**, not a denylist of dangerous property names.

### Which control receives the property

The engine looks for the property on the interactive control first, then on the outer wrapper control:

1. the primary interactive control (the inner `sap.m.Input`, `sap.m.TextArea`, … where the widget wraps one), if `getMetadata().hasProperty(name)` is true for it;
2. otherwise the outer generated control, if that declares it;
3. otherwise the entry is refused — no control in the pair declares the property.

### What is accepted

An entry is written only when every one of these holds. They are evaluated in this order, and the first failure decides the logged reason:

| # | Rule | Refusal reason logged when it fails |
| :--- | :--- | :--- |
| 1 | It is not a core state property MetaUI owns (`BLOCKED_CONTROL_PROPS`) | `it is a core state property owned by MetaUI` |
| 2 | It is not a raw-markup property (`HTML_SINK_CONTROL_PROPS`: `htmlText`, `html`, `innerHTML`, `content`) | `it is rendered as raw markup` |
| 3 | Some generated control in the pair declares the property | `no generated control declares it` |
| 4 | That control's metadata gives the property a type | `the control declares no type for it` |
| 5 | The declared UI5 type resolves to a scalar primitive — `string`, `boolean`, `int` or `float` (`ALLOWED_CONTROL_PROP_PRIMITIVES`) | `its UI5 type '<type>' is not a scalar primitive` |

The type rule is resolved through `sap.ui.base.DataType`, so registered UI5 types collapse to one of those four primitives: `sap.ui.core.CSSSize` and every UI5 enum (`sap.m.InputType`, `sap.m.ButtonType`, …) resolve to `string` and are accepted. UI5's remaining built-in primitives — `object`, `function` and `any`, and all array forms — resolve to none of the four and are therefore refused without any property having to be named.

**Core state properties MetaUI owns** (`BLOCKED_CONTROL_PROPS`), unchanged from earlier versions:

- `value`, `selectedKey`, `selectedKeys`, `selected`, `dateValue`, `tokens` — data paths managed strictly by `StateManager`.
- `editable`, `enabled`, `visible` — managed strictly by `visibleOn`, `enabledOn`, and the `readOnly` schema directives.
- `valueState`, `valueStateText` — managed exclusively by the validation pipeline.

**Markup properties are refused outright.** There is no `ui.controlProps` route for injecting HTML. The supported way to render markup is the bound field value of `ui.widget: "richText"`, which renders a `sap.m.FormattedText` in display mode and routes the value through that control's own `htmlText` setter.

### URI-typed properties (`href`, `src`, `icon`, …)

A property whose declared UI5 type is `sap.ui.core.URI` is accepted but its value is protocol-checked by `UrlValidator.isSafeUiResourceUri()`:

- A **static** value that fails the check is refused with `unsafe URI scheme` and never written.
- A **bound** value is wrapped in a sanitizing formatter (`sanitizeUriPropertyValue()`), so a hostile URI that arrives later through the model is collapsed to the empty string at the moment it would be written — not only the literal in the schema.

Accepted URI values are `http:`, `https:`, `mailto:` and `tel:` URLs; document-relative paths beginning `/`, `./`, `../` or `#` (but not protocol-relative `//`); raster `data:image/(png|jpeg|jpg|gif|webp|bmp);base64,` URIs; `sap-icon://…`; and the empty string. Everything else — `javascript:`, non-image `data:`, and any other scheme — resolves to `""`.

### How the value is written

A vetted value is written through the control's own generated setter (`setPlaceholder`, `setWidth`, …) when one exists, via `writeControlProperty()`. `ManagedObject.setProperty` is used only for a property that generates no setter, so UI5's own coercion and sanitization in the typed setter is never bypassed.

### Dynamic Expression Bindings
A `controlProps` value that is a string starting with `{` and ending with `}` is treated as a binding and parsed by the same grammar as `visibleOn` / `enabledOn` (see **Condition expression grammar** below). You can write full UI5 `{= ... }` expressions to dynamically toggle UI states based on other fields in the payload, or bind to external models supplied by your parent application.

**Binding to the Internal MetaUI Payload:**
The MetaUI Engine intercepts both the host's configured `modelName` (default `meta>`) and the generic placeholder `metaui>` (rewriting `${metaui>` to `${<modelName>>` in `ControlDirectiveUtil.ts`). This shields you from sandbox model collisions and avoids conflicts with Fiori Elements metadata models.
```json
{
  "controlProps": {
    "placeholder": "{= ${metaui>/AgreeTerms} ? 'Please leave a comment...' : 'You must agree to terms first!' }"
  }
}
```

**Binding to External Parent Models:**
Because the engine selectively routes the `metaui>` prefix, you can freely bind to any external models provided by your parent application (such as `i18n>`, `device>`, or `Student>`) without the MetaUI engine interfering or trying to sandbox them.
```json
{
  "controlProps": {
    "placeholder": "{= ${settings>/liveUpdate} ? 'Live Data Mode' : 'Sandbox Mode' }"
  }
}
```

### What a refused entry does

A refused entry is skipped and a warning is emitted through `Logger.warn()` — `REFUSED controlProps entry '<name>': <reason>.` — on the `ControlDirectiveUtil` component. Warnings are never suppressed by `debugMode`. The remaining entries, and the field itself, still render: one bad directive does not abort the form.

---

## Condition expression grammar (`visibleOn`, `enabledOn`, bound `controlProps`)

`ui.visibleOn`, `ui.enabledOn` and any `controlProps` value written as a binding string are compiled by `ExpressionBuilder.buildChecked()` and then handed to UI5's `BindingParser`. The grammar is explicit, and a rule outside it is refused rather than passed through.

### Supported forms

| Form | Example | Compiles to |
| :--- | :--- | :--- |
| Absolute model path | `"{/Active}"` | `{meta>/Active}` |
| Relative property name or dotted path | `"{Active}"`, `"{Address.City}"` | resolved against the current field's parent context |
| The engine placeholder prefix | `"{metaui>/Active}"` | rewritten to the host's configured `modelName` |
| Any named external model | `"{settings>/liveUpdate}"`, `"{i18n>/label}"` | passed through unchanged |
| OData path with a key predicate | `"{odata>/Employees('E100')/Active}"` | passed through unchanged |
| Expression binding | `"{= ${/Qty} > 5 }"` | `{= ${meta>/Qty} > 5 }` |
| Key predicate inside an expression binding | `"{= ${odata>/Items(ID=1,Name='x')/Qty} > 5 }"` | passed through unchanged |
| `$root.` absolute reference | `"$root.Status === 'NEW'"` | `{= ${meta>/Status} === 'NEW' }` |
| `$row.` row-relative reference (inline tables) | `"$row.Discount > 0"` | resolved against the current row context |
| Bare identifier expression | `"Category === 'A'"` | identifiers become sibling model paths |
| Empty or whitespace-only rule | `""` | `{= true }` |

Identifiers that are JavaScript built-ins are left alone rather than turned into model paths:

```text
true  false  null  undefined  NaN  Infinity  Math  String  Number  Array
Object  Boolean  RegExp  Date  JSON  parseInt  parseFloat  isNaN  isFinite
```

### Not supported

**UI5 complex-binding object syntax is refused.** A rule such as `"{path:'/Active', formatter:'my.app.fn'}"` is rejected before it reaches `BindingParser`, because that parser resolves a named formatter against the global scope and would then invoke it with the live field value. The structural test is a `:` or `,` at the *top level* of a `{…}` token, or a second `>` model separator; commas and colons nested inside `(…)` or inside a quoted literal are fine, which is what keeps OData key predicates working.

Also refused: a token containing a character outside the path alphabet; inside an expression binding, a quoted string literal sitting at a token's top level rather than inside a `(…)` key predicate; and any stray `{` or `}` left in a compiled expression (which would otherwise close the `{= … }` wrapper early and let the remainder be parsed as a second binding).

A refused rule is logged — `REFUSED condition rule: raw UI5 binding syntax is not accepted from a schema ('<rule>')` — and the directive is **skipped**. The field still renders, with the directive simply not applied.

`ControlDirectiveUtil` additionally re-checks the parsed result: if `BindingParser` came back having resolved a named global reference into `formatter`, `events`, `factory` or `type`, the binding is discarded with `the parsed binding resolved a named global reference`. An expression the parser cannot read at all is logged as `Unparseable binding expression from schema` and skipped.

### `enabledOn` and display mode

`enabledOn` is bound only when the target control actually declares an `enabled` property. Most widgets fall back to `sap.m.Text` in display mode, which has none, so `enabledOn` is inert there rather than a render failure.
