# Supported Features & Known Limitations

> **Canonical Counts:** All registry and pipeline counts in this document are verified by `npm run metrics` (`node scripts/run-tests.js --metrics-only`) and cross-checked against the TypeScript AST by `npm run lint`.

---

## 1. Schema Input & Ingestion (`SchemaResolutionDelegate`, `SchemaNormalizer`, `OpenApiBuilder`)

| Input Mode | Supported Specifications / Shapes | Entry Point / Mechanism |
| :--- | :--- | :--- |
| **JSON Schema** | JSON Schema Draft-07 & Draft 2020-12 (`$defs` / `definitions`, `$ref`, `oneOf` / `anyOf` / `allOf`, nullable type arrays `["string", "null"]`) | `schemaDefinition` (JS object or JSON string) normalized via `SchemaNormalizer.normalize()` |
| **OpenAPI / Swagger** | OpenAPI 2.0 (`swagger: "2.0"`) & OpenAPI 3.0.x (`openapi: "3.0.x"`), including operation request/response target extraction via `OpenApiExtractor.extractTargets()` | `OpenApiBuilder.build()`, `OpenApiBuilder.fetchAndBuild()`, or passing an OpenAPI spec + `schemaTarget` to `DynamicHost` |
| **Full Data Inference** | Raw JavaScript object or `dataJson` string with `schemaDefinition` omitted (`null` or `{}`) | `DataInferenceBuilder.inferSchemaFromData()` (spawns `InferredGeneratorHost`) |
| **Hybrid Inference** | Partial explicit schema with `additionalProperties: true` at root or nested object level | `SchemaNormalizer` merges explicit properties with runtime properties inferred from bound `data` / `dataJson` |
| **Remote Schema URL** | `http://` or `https://` URL string passed to `schemaDefinition` | `SchemaResolutionDelegate.startRemoteFetch()` asynchronously fetches and normalizes the schema |

---

## 2. Widget Registry (`DefaultPluginBootstrapper` — <!-- DOC_COUNT:pluginMappings -->51 `(type, widget)` Mappings: <!-- DOC_COUNT:concreteControlPlugins -->30 Concrete Control Plugins + <!-- DOC_COUNT:abstractControlPluginBases -->7 Abstract Bases, <!-- DOC_COUNT:concreteActionPlugins -->3 Concrete Actions + <!-- DOC_COUNT:abstractActionPluginBases -->1 Abstract Base, <!-- DOC_COUNT:datasourcePlugins -->4 Datasources)

All <!-- DOC_COUNT:pluginMappings -->51 `(type, widget)` pairs registered in `src/nz/co/siliconst/ui5/metaui/core/DefaultPluginBootstrapper.ts` (backed by <!-- DOC_COUNT:concreteWidgetPlugins -->37 concrete plugin classes, the <!-- DOC_COUNT:abstractControlPluginBases -->7 control abstract bases `BasePlugin`, `OptionListPlugin`, `SingleBoundWidgetPlugin`, `PickerPlugin`, `TextLikeInputPlugin`, `NestedDialogPlugin`, `HardwareControlPlugin`, the action abstract base `ActionButtonPlugin`, and the hardware control base `BaseHardwareControl` / `BaseHardwareControlRenderer`):

| # | Schema `type` | `ui.widget` | Plugin Class | Edit Mode UI5 Control | Display Mode UI5 Control (`editable: false`) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | `string` | *(omitted)* | `StringPlugin` | `sap.m.Input` | `sap.m.Text` |
| 2 | `number` | *(omitted)* | `NumberPlugin` | `sap.m.Input` (`type="Number"`) | `sap.m.Text` |
| 3 | `integer` | *(omitted)* | `NumberPlugin` | `sap.m.Input` (`type="Number"`) | `sap.m.Text` |
| 4 | `date` | *(omitted)* | `DatePlugin` | `sap.m.DatePicker` | `sap.m.Text` |
| 5 | `boolean` | *(omitted)* | `BooleanPlugin` | `sap.m.CheckBox` | `sap.m.Text` |
| 6 | `array` | *(omitted)* | `ArrayPlugin` | `sap.m.Button` (Modal Trigger) or inline `TableLayout` | `sap.m.Button` ("View …" dialog trigger, **stays enabled**) or inline `TableLayout` |
| 7 | `object` | *(omitted)* | `ObjectPlugin` | `sap.m.Button` (Modal Trigger) or inline `FormLayout` | `sap.m.Button` ("View …" dialog trigger, **stays enabled**) or inline `FormLayout` |
| 8 | `string` | `"default"` | `StringPlugin` | `sap.m.Input` | `sap.m.Text` |
| 9 | `object` | `"dictionaryMap"` | `DictionaryMapPlugin` | `sap.m.VBox` (Key-Value Map) | `sap.m.VBox` (Read-Only Key-Value Rows) |
| 10 | `object` | `"reference"` | `ReferencePlugin` | `sap.m.VBox` (Inline) or `sap.m.Button` (Dialog) | `sap.m.VBox` (Inline) or `sap.m.Button` ("View …" dialog trigger, **stays enabled**) |
| 11 | `object` | `"polymorphic"` | `PolymorphicPlugin` | `sap.m.VBox` (`sap.m.Select` + nested `DynamicHost`) | `sap.m.VBox` (Disabled `sap.m.Select` + read-only `DynamicHost`) |
| 12 | `string` | `"date"` | `DatePlugin` | `sap.m.DatePicker` | `sap.m.Text` |
| 13 | `string` | `"datePicker"` | `DatePlugin` | `sap.m.DatePicker` | `sap.m.Text` |
| 14 | `date` | `"date"` | `DatePlugin` | `sap.m.DatePicker` | `sap.m.Text` |
| 15 | `date` | `"datePicker"` | `DatePlugin` | `sap.m.DatePicker` | `sap.m.Text` |
| 16 | `string` | `"time"` | `TimePlugin` | `sap.m.TimePicker` | `sap.m.Text` |
| 17 | `string` | `"datetime"` | `DateTimePlugin` | `sap.m.DateTimePicker` | `sap.m.Text` |
| 18 | `boolean` | `"switch"` | `SwitchPlugin` | `sap.m.Switch` | `sap.m.Text` |
| 19 | `number` | `"step"` | `StepInputPlugin` | `sap.m.StepInput` | `sap.m.Text` |
| 20 | `integer` | `"step"` | `StepInputPlugin` | `sap.m.StepInput` | `sap.m.Text` |
| 21 | `string` | `"select"` | `DropdownPlugin` | `sap.m.Select` | `sap.m.Text` |
| 22 | `number` | `"select"` | `DropdownPlugin` | `sap.m.Select` | `sap.m.Text` |
| 23 | `integer` | `"select"` | `DropdownPlugin` | `sap.m.Select` | `sap.m.Text` |
| 24 | `string` | `"textArea"` | `TextAreaPlugin` | `sap.m.TextArea` / `sap.m.HBox` (when `expandable`) | `sap.m.Text` |
| 25 | `string` | `"codeEditor"` | `CodeEditorPlugin` | `sap.ui.codeeditor.CodeEditor` / `sap.m.HBox` (when `expandable`) | `sap.ui.codeeditor.CodeEditor` (`editable: false`, `syntaxHints: false`) |
| 26 | `string` | `"link"` | `LinkPlugin` | `sap.m.Link` | `sap.m.Link` (**stays enabled**) |
| 27 | `string` | `"password"` | `PasswordPlugin` | `sap.m.Input` (`type="Password"`) | `sap.m.Text` (Masked `"********"`) |
| 28 | `string` | `"email"` | `EmailPlugin` | `sap.m.Input` (`type="Email"`) | `sap.m.Text` |
| 29 | `string` | `"fileUploader"` | `FileUploaderPlugin` | `sap.m.VBox` (`sap.m.Image` + `sap.ui.unified.FileUploader`) | `sap.m.VBox` (`sap.m.Image` preview, or `sap.m.Text` fallback; no uploader) |
| 30 | `array` | `"multiSelect"` | `MultiSelectPlugin` | `sap.m.MultiComboBox` | `sap.m.Text` (comma-joined; `valueHelp` keys resolved to their text) |
| 31 | `array` | `"multiInput"` | `MultiInputPlugin` | `sap.m.MultiInput` | `sap.m.Text` (comma-joined) |
| 32 | `number` | `"slider"` | `SliderPlugin` | `sap.m.Slider` | `sap.m.Text` |
| 33 | `integer` | `"slider"` | `SliderPlugin` | `sap.m.Slider` | `sap.m.Text` |
| 34 | `number` | `"rating"` | `RatingIndicatorPlugin` | `sap.m.RatingIndicator` | `sap.m.Text` |
| 35 | `integer` | `"rating"` | `RatingIndicatorPlugin` | `sap.m.RatingIndicator` | `sap.m.Text` |
| 36 | `string` | `"messageStrip"` | `MessageStripPlugin` | `sap.m.MessageStrip` | `sap.m.MessageStrip` |
| 37 | `string` | `"camera"` | `CameraPlugin` | `nz.co.siliconst.ui5.metaui.controls.CameraControl` | `sap.m.Image` (`src` filtered by `UrlValidator`) |
| 38 | `string` | `"signature"` | `SignaturePlugin` | `nz.co.siliconst.ui5.metaui.controls.SignatureControl` | `sap.m.Image` (`src` filtered by `UrlValidator`) |
| 39 | `object` | `"location"` | `GeolocationPlugin` | `nz.co.siliconst.ui5.metaui.controls.GeolocationControl` | `sap.m.Text` (`Lat: <lat>, Lng: <lng>`) |
| 40 | `string` | `"voiceInput"` | `VoiceInputPlugin` | `nz.co.siliconst.ui5.metaui.controls.VoiceInputControl` | `sap.m.Text` |
| 41 | `string` | `"richText"` | `RichTextPlugin` | `nz.co.siliconst.ui5.metaui.controls.RichTextControl` | `sap.m.FormattedText` (value written through its own `htmlText` setter) |
| 42 | `string` | `"urlButton"` | `UrlNavigationActionPlugin` | `sap.m.Button` | `sap.m.Button` (**stays enabled**) |
| 43 | `string` | `"submitButton"` | `SubmitFormActionPlugin` | `sap.m.Button` | `sap.m.Button` (`enabled: false`) |
| 44 | `string` | `"clearButton"` | `ClearFormActionPlugin` | `sap.m.Button` | `sap.m.Button` (`enabled: false`) |
| 45 | `string` | `"odataSelect"` | `ODataListBindingPlugin` | `sap.m.ComboBox` | `sap.m.Text` |
| 46 | `string` | `"remoteDropdown"` | `RemoteDropdownPlugin` | `sap.m.Select` | `sap.m.Text` |
| 47 | `string` | `"remoteSelect"` | `RemoteDropdownPlugin` | `sap.m.Select` | `sap.m.Text` |
| 48 | `string` | `"combobox"` | `RemoteDropdownPlugin` | `sap.m.ComboBox` | `sap.m.Text` |
| 49 | `string` | `"liveSearch"` | `LiveSearchPlugin` | `sap.m.Input` (with suggestion items) | `sap.m.Text` |
| 50 | `string` | `"remoteValueHelp"` | `RemoteValueHelpPlugin` | `sap.m.Input` (`showValueHelp: true` + `SelectDialog`) | `sap.m.Text` |
| 51 | `string` | `"valueHelp"` | `RemoteValueHelpPlugin` | `sap.m.Input` (`showValueHelp: true` + `SelectDialog`) | `sap.m.Text` |

---

## 3. Layouts (`DefaultPluginBootstrapper` — 4 Layout Strategies & 5 `uiLayout` Element Types)

### Layout Strategies (`layoutStrategy`)

| Strategy | Class | Rendered Structure |
| :--- | :--- | :--- |
| `"form"` | `FormLayout` | `sap.ui.layout.form.SimpleForm` (`ResponsiveGridLayout`, 1-column label-paired grid) inside a bare `sap.m.VBox` |
| `"table"` | `TableLayout` | `sap.m.Table` with Add/Delete row toolbar, cloned row cell validation, and modal overflow for non-key fields (`TableRowHelper`) |
| `"wizard"` | `WizardLayout` | Custom composable step navigator (`WizardStepRenderer`) with per-step validation gating and `beforeLayoutSectionChange` async hook |
| `"compact"` | `CompactLayout` | Dense `sap.m.VBox` / `sap.m.HBox` layout with nested group sections and inline tables |

### `uiLayout` Element Types (`ILayoutElement["type"]`)

| Element Type | Behaviour |
| :--- | :--- |
| `"Group"` | Renders a titled group section (`sap.ui.core.Title` in `SimpleForm`, or a titled group box in `CompactLayout`) |
| `"Control"` | Resolves `scope` (JSON Pointer, e.g. `#/properties/FirstName`) via `LayoutElementWalker` and renders the paired label and plugin control |
| `"HorizontalLayout"` | Renders child `Control` elements side-by-side (`sap.ui.layout.GridData` spans in `SimpleForm`, or `sap.m.HBox` in `CompactLayout`) |
| `"VerticalLayout"` | Accepted by the schema normalizer and walker, but currently behaves identically to `"Group"` (see **Known Limitations**) |
| `"WizardStep"` | Defines a discrete step in `WizardLayout` (or a group section when rendered under `FormLayout` / `CompactLayout`) |

---

## 4. Data Binding & State Modes (`StateManager`, `DataSyncDelegate`, `ODataDelegate`)

- **Three Input Binding Paths (Tri-Binding)**:
  1. **`data`**: Native JavaScript object or array (deep-cloned into `SandboxJSONModel` on ingest; caller input is never mutated).
  2. **`dataJson`**: Serialized JSON string (parsed on ingest; constructor JSON literals are disambiguated from UI5 binding strings by `extractConstructorJsonLiterals`).
  3. **OData Context (`ODataDelegate`)**: Intercepts OData V2 (`getObject()`) and OData V4 (`requestObject()`) element bindings (`bindElement` / `bindObject` / `setBindingContext`).
- **Transactional (`liveUpdate: false`, default) vs. Continuous (`liveUpdate: true`)**:
  - `liveUpdate: false`: User edits remain isolated inside `SandboxJSONModel`. Data is pushed back to the bound `data` / `dataJson` / OData context only when `triggerSubmit()` succeeds with zero validation errors.
  - `liveUpdate: true`: Every field `change` event immediately pushes the updated sandbox payload to the bound `data` / `dataJson` / OData context via `DataSyncDelegate.runWithSyncLock()` while still painting local validation states.
- **On-Demand Extraction**: `host.getProperty("outputData")` reads the current deep-cloned payload from `StateManager` at any time.

---

## 5. Validation Pipeline (`PipelineManager` — 14 Validators)

All 14 `IValidator` plugins registered in `src/nz/co/siliconst/ui5/metaui/core/PipelineManager.ts`:

| # | Validator Key | Plugin Class | Triggered By Schema Keywords / `ui.format` |
| :--- | :--- | :--- | :--- |
| 1 | `required` | `RequiredValidatorPlugin` | `required: true`, parent `required: ["field"]`, `nullable: false`, or `PolicyEngine` `Require` effect |
| 2 | `minLength` | `MinLengthValidatorPlugin` | `minLength` on `string` |
| 3 | `maxLength` | `MaxLengthValidatorPlugin` | `maxLength` on `string` |
| 4 | `pattern` | `PatternValidatorPlugin` | `pattern` on `string` (also OpenAPI `format: "uuid" \| "ipv4" \| "ipv6" \| "hostname"` mapped via `OpenApiConstraintMapper`) |
| 5 | `range` | `RangeValidatorPlugin` | `minimum`, `maximum`, `exclusiveMinimum`, `exclusiveMaximum` on `number` / `integer` |
| 6 | `multipleOf` | `MultipleOfValidatorPlugin` | `multipleOf` on `number` / `integer` |
| 7 | `arrayItems` | `ArrayItemsValidatorPlugin` | `minItems`, `maxItems`, `uniqueItems` on `array` |
| 8 | `email` | `EmailValidatorPlugin` | `format: "email"` or `ui.format: "email"` or `ui.widget: "email"` |
| 9 | `url` | `UrlValidatorPlugin` | `format: "url" \| "uri"` or `ui.format: "url" \| "uri"` (`http:`, `https:`, `mailto:`) |
| 10 | `iban` | `IbanValidatorPlugin` | `format: "iban"` or `ui.format: "iban"` (MOD-97-10 checksum) |
| 11 | `enum` | `EnumValidatorPlugin` | `enum: [...]` |
| 12 | `const` | `ConstValidatorPlugin` | `const: <value>` |
| 13 | `integer` | `IntegerValidatorPlugin` | `type: "integer"` |
| 14 | `objectProperties` | `ObjectPropertiesValidatorPlugin` | `minProperties`, `maxProperties` on `object` |

**Format-Driven Validation Summary:**
- **Validated `format` / `ui.format` values**: `"email"`, `"url"`, `"uri"`, `"iban"`, and (via OpenAPI `pattern` mapping) `"uuid"`, `"ipv4"`, `"ipv6"`, `"hostname"`.
- **Unvalidated `ui.format` values**: `"phone"` (display formatting only via `ui.formatter: "phone"` — see **Known Limitations**).

---

## 6. Formatters & Parsers (`PipelineManager` — 4 Formatters, 3 Parsers)

| Key | Formatter Class | Implements `IParser.parse()`? | Category | Behaviour on User Edit (`BasePlugin.notifyChange`) |
| :--- | :--- | :--- | :--- | :--- |
| `date` | `DateFormatterPlugin` | Yes (`PipelineManager.parsers`) | **Presentational** | Formats ISO strings / `Date` to `YYYY-MM-DD`; parses `YYYY-MM-DD` (and ISO strings) back to raw `YYYY-MM-DD` before model write and validation |
| `phone` | `PhoneFormatterPlugin` | Yes (`PipelineManager.parsers`) | **Presentational** | Formats 10-digit US (`(555) 123-4567`), 11-digit `+1` (`+1 (555) 123-4567`), and international `+CC` numbers; strips display mask via `parse()` so raw digits/E.164 are stored and validated |
| `currency` | `CurrencyFormatterPlugin` | Yes (`PipelineManager.parsers`) | **Presentational** | Formats numbers with currency symbol and grouping (`$1,234.50`); parses formatted text back to a numeric `number` (`1234.5`) before model write and validation |
| `textCase` | `TextCaseFormatterPlugin` | No | **Transforming** | Lossy case normalization (`args`: `"upper"`, `"lower"`, `"title"`). Writes the transformed string (`"HELLO"`) directly into `SandboxJSONModel` and validates the transformed string |

---

## 7. Policy-Based Rules Engine (`PolicyEngine` — 6 Conditions, 8 Effects)

- **6 Condition Operators (`IPolicyConditionPlugin`)**:
  - `NumericGreaterThan`, `NumericLessThan`, `StringEquals`, `DateLessThan` (supports ISO dates and `"$today"`), `IsNull`, `IsNotNull`.
- **8 Symmetrical Effects (`BinaryEffectPlugin` / `PolicyEffectType`)**:
  - Visibility: `Show` ↔ `Hide` (hidden fields automatically have their validation errors suppressed by `ValidationLedger`).
  - Requirement: `Require` ↔ `Optional`.
  - Editability: `Enable` ↔ `Disable`.
  - Validity: `Validate` ↔ `Invalidate` (applies `policyError` with custom `message`).
- **Per-Row Table Expansion (`$row`)**:
  - Policy `targets` and `condition` paths containing `$row` (e.g. `"/LineItems/$row/Discount"`) expand dynamically across each physical row of an inline `TableLayout`, isolating state deltas per row and cleaning up deleted row paths.

---

## 8. Display Modes, Sizing & Dialogs

- **Editable vs. Read-Only Display Mode (`editable: true | false`)**:
  - When `editable="false"` on `DynamicHost` (or `readOnly: true` on the root schema), value editors render non-interactive display controls — `sap.m.Text` for most widgets, `sap.m.Image` for `camera` / `signature`, `sap.m.FormattedText` for `richText`, and read-only variants for `codeEditor`, `dictionaryMap` and `polymorphic`. See the Display Mode column in the widget table above for the exact control per mapping.
  - **Navigation affordances stay reachable.** Read-only constrains *editing*, not *reaching*: a control whose only job is to open or follow a target remains clickable in display mode. These are `ui.widget: "link"` (`sap.m.Link`), `ui.widget: "urlButton"` (`UrlNavigationActionPlugin`), and the nested-dialog "View …" trigger buttons produced by `ObjectPlugin`, `ArrayPlugin` and `ReferencePlugin`. Disabling them would hide the payload behind a dead widget rather than protect it; the dialog they open is itself rendered read-only.
    - Only an explicit `ui.enabled: false` switches an affordance off (`BasePlugin.isAffordanceEnabled()`), and a `ui.enabledOn` expression, when present, always takes precedence over this rule.
  - **Mutating actions stay disabled.** `ui.widget: "submitButton"` (`SubmitFormActionPlugin`) and `ui.widget: "clearButton"` (`ClearFormActionPlugin`) keep the default behaviour and render with `enabled: false` in display mode.
- **Host Sizing & Containment**:
  - `DynamicHost` exposes `width` (default `"100%"`, `sap.ui.core.CSSSize`) and `height` (default `"auto"`, `sap.ui.core.CSSSize`) and emits `min-width: 0`, `max-width: 100%`, and `box-sizing: border-box` so a host never expands its parent container or table column wider than the width offered to it.
  - For compact label-beside-field rows inside narrow containers (such as a `340px` table column), set root `ui.labelSpan` (`1`–`12` for side-by-side label/field spans across all breakpoints, or `0` to omit labels) or root `ui.controlProps` (`labelSpanS`, `labelSpanM`, `labelSpanL`, `labelSpanXL`) while preserving the default `labelSpanS: 12` when omitted.
- **Root & Nested Sub-Schema Dialogs**:
  - `host.openInDialog(title, submitButtonText, cancelButtonText, dialogWidth, parentView)` mounts the host inside a `sap.m.Dialog` with configurable button labels.
  - `LayoutScorer` and `LayoutMutator` compare nested object/array footprints against `layoutBudget`; sub-schemas exceeding the budget overflow to modal trigger buttons (`ArrayPlugin`, `ObjectPlugin`, `ReferencePlugin`) that spawn isolated child `DynamicHost` dialogs.

---

## 9. Security Posture & Trust Model

MetaUI renders a UI from a schema. The schema is therefore *code-adjacent input*, and the library's design position is explicit:

> **A schema is treated as untrusted input.** Every directive that can reach a UI5 sink — a control property, a binding expression, a URL, a regular expression — is validated before it is applied. A directive that fails validation is refused and logged; it never renders a plausible-looking result and it never aborts the rest of the form.

This is a defence-in-depth position, not a proof. Read the **Residual exposure** list below before deciding whether it is sufficient for your deployment. If your application only ever renders schemas it authored itself, none of this changes what you can express.

### What a schema is permitted to do

- Declare fields, types, constraints, labels and layout, and have them rendered as native Fiori controls.
- Set scalar UI5 properties on the generated control through `ui.controlProps` — anything whose declared UI5 type resolves to `string`, `boolean`, `int` or `float`, including every UI5 enum and `sap.ui.core.CSSSize`.
- Bind those properties, and `ui.visibleOn` / `ui.enabledOn`, to model paths and `{= … }` expression bindings, including bindings against models the host application supplies (`i18n>`, `settings>`, an OData model, …) and OData key predicates.
- Point `ui.dataSource.url` (or a remote `schemaDefinition` URL) at an `http:`/`https:` endpoint, including a cross-origin one by default.
- Carry markup, through the bound *value* of a `ui.widget: "richText"` field, which is rendered by `sap.m.FormattedText` through that control's own `htmlText` setter.
- Reference a validator, formatter or policy plugin **by registered name**. Names are looked up in `PluginRegistry` / `PipelineManager` and are never resolved against the global scope, so a schema cannot name an arbitrary function and have it invoked. An unregistered *validator* name is logged by `PipelineManager.runValidators()`; an unregistered *formatter* name is skipped without a warning.

### What a schema is prevented from doing

| Prevented | Mechanism | Where |
| :--- | :--- | :--- |
| Writing a UI5 property the control does not declare, or one whose type is `object` / `function` / `any` (or an array of those) | Type allowlist derived from UI5's own property metadata via `sap.ui.base.DataType`, not a denylist of names | `vetControlProperty()` |
| Writing MetaUI's own state properties (`value`, `selectedKey`, `selectedKeys`, `selected`, `dateValue`, `tokens`, `editable`, `enabled`, `visible`, `valueState`, `valueStateText`) | `BLOCKED_CONTROL_PROPS` | `vetControlProperty()` |
| Injecting raw markup through a control property (`htmlText`, `html`, `innerHTML`, `content`) | `HTML_SINK_CONTROL_PROPS` — refused by name, because UI5 metadata carries no "renders raw HTML" flag | `vetControlProperty()` |
| Bypassing a UI5 typed setter's own coercion or sanitization | Vetted values are written through the control's generated `set<Property>` when one exists; `ManagedObject.setProperty` is used only where no setter is generated | `writeControlProperty()` |
| Putting a `javascript:` (or any other unsafe-scheme) URI into an `href`, `src`, `icon` or other `sap.ui.core.URI` property — whether written literally in the schema **or** delivered later through the model | `UrlValidator.isSafeUiResourceUri()` applied statically, plus a sanitizing formatter appended to the binding | `vetControlProperty()`, `sanitizeUriPropertyValue()` |
| Smuggling UI5 complex-binding object syntax (`{path:'…', formatter:'…'}`) into a condition rule, which `BindingParser` would resolve against the global scope and invoke with the live field value | Structural grammar check — a top-level `:` or `,` inside a `{…}` token, a second `>` separator, an out-of-alphabet character, a top-level quoted literal, or a stray brace is refused | `ExpressionBuilder.buildChecked()` |
| The same, via any parser behaviour the grammar check failed to anticipate | Independent sink-side backstop: the parsed binding is discarded if `BindingParser` resolved a named global into `formatter`, `events`, `factory` or `type` | `ControlDirectiveUtil` |
| *Repeatedly* hanging the browser with a catastrophic-backtracking `pattern` | 512-character source cap; static refusal of provably ambiguous repetition shapes; a 50 ms wall-clock budget measured per evaluation, with per-session quarantine for anything that overruns it. The first evaluation of an unprovable pattern is **not** bounded — see residual exposure #1 | `PatternValidatorPlugin` |
| Fetching over a non-HTTP scheme, or from a protocol-relative (`//host/…`) target | Scheme allowlist (`http:`, `https:`) enforced on every `ui.dataSource.url`, `valueHelp.url` and remote `schemaDefinition` URL, always, regardless of policy | `UrlValidator.isSafeDataSourceUrl()` |
| Fetching cross-origin — **only once the application opts in** to a restrictive policy; permitted by default | `UrlValidator.setDataSourceOriginPolicy("same-origin")` or `("allowlist", […])`, see below | `UrlValidator` |

Every refusal above emits an unconditional `Logger.warn()` (warnings are never gated by `debugMode`) and skips the offending directive. The field, and the rest of the form, still render.

### Locking down data source origins

Scheme validation is unconditional. The *cross-origin* decision is policy, and the default is permissive:

```javascript
sap.ui.require(["nz/co/siliconst/ui5/metaui/utils/UrlValidator"], function (UrlValidator) {
    // Default: any http/https endpoint, with a one-time logged warning per cross-origin host.
    UrlValidator.setDataSourceOriginPolicy("any");

    // Only the document's own origin.
    UrlValidator.setDataSourceOriginPolicy("same-origin");

    // The document origin plus an explicit list.
    UrlValidator.setDataSourceOriginPolicy("allowlist", ["https://api.example.com"]);
});
```

The setting is **library-global and static**, not per-host: the last call wins for every `DynamicHost` in the page. Call it during application startup, before the first host renders. `UrlValidator.getDataSourceOriginPolicy()` reads back the active mode and the normalized origin list. An unparseable allowlist entry is dropped with a warning rather than silently widening the policy. Changing the policy clears the record of which cross-origin hosts have already been warned about.

**If your application renders schemas it did not author, set this to `"same-origin"` or `"allowlist"`.** Leaving it at the default means a hostile schema can make the user's browser contact an arbitrary third-party host — leaking the visit, and whatever the schema author encoded into the URL path or query — and then render that host's response as the field's dropdown or value-help items. The requests themselves are issued with `fetch`'s default `credentials: "same-origin"`, so no cookies are sent cross-origin.

### Residual exposure

These are known and accepted, not oversights:

1. **A pattern that cannot be *proven* unsafe gets one unbounded evaluation.** The static analysis only refuses shapes it can prove ambiguous. Anything else — including a genuinely catastrophic pattern the analysis cannot classify — is executed with no timeout; the 50 ms budget is measured *after* the regular expression returns, and only then is the pattern quarantined for the session. So the first keystroke that triggers such a pattern can still freeze the tab for as long as that one evaluation takes. There is no pre-emptive timeout, because a synchronous regular-expression match cannot be interrupted on the main thread.
2. **The quarantine and analysis caches are bounded and cleared wholesale.** Both hold at most 256 entries and are emptied when full. A schema carrying more than 256 distinct slow patterns can therefore evict a quarantined pattern and earn it another unbounded evaluation.
3. **Cross-origin data sources are permitted by default** (see above). This is a deliberate compatibility default for the common case of a trusted schema pointing at a trusted API; it is not safe for untrusted schemas.
4. **`ui.controlProps` can still set any scalar property the control declares.** The gate bounds the *type*, not the semantics. A schema can set a misleading `placeholder`, `tooltip`-like text property or `width`. It cannot reach a DOM sink, a URL sink, or MetaUI's state.
5. **Markup in a `richText` value is only as safe as `sap.m.FormattedText`.** MetaUI does not add its own HTML sanitizer on that path; it relies on the UI5 control's `htmlText` setter. `RichTextControl` sanitizes on write in edit mode, but a value that arrives directly from the model in display mode is handed to UI5 to filter.
6. **The engine does not sandbox the data.** Validation constrains what the user may submit; it does not constrain what a host application does with `payload` afterwards.
7. **`OpenApiBuilder.fetchAndBuild()` is not covered by the origin policy.** It fetches the URL it is handed directly. Nothing in `src/` calls it — it is a convenience entry point for a consumer who already has a spec URL in hand, so the URL comes from your code, not from a schema. If you pass it a URL that came from untrusted input, check it yourself with `UrlValidator.isSafeDataSourceUrl()` first. The schema-driven path (`schemaDefinition` as a URL string) goes through `SchemaProvider`, which does enforce the policy.
8. **None of this applies to plugins you register yourself.** A custom `IValidator`, formatter or control plugin runs with full privileges; the gates above protect the built-in path from schema input, not the library from your own code.

---

## 10. Known Limitations (What MetaUI Does Not Do)

1. **No built-in phone validator.**
   Setting `ui.format: "phone"` (or `ui.formatter: "phone"`) performs **no validation**. Only `"email"`, `"url"` / `"uri"`, and `"iban"` have dedicated format validators (plus OpenAPI `"uuid"`, `"ipv4"`, `"ipv6"`, and `"hostname"` via `pattern`). To validate phone numbers, declare a `pattern` constraint (e.g., `"pattern": "^\\+?\\d{10,15}$"` or `"pattern": "^\\d{10}$"`), which runs against the unformatted raw value produced by `PhoneFormatterPlugin.parse()`.
2. **`textCase` is lossy (transforming).**
   Unlike `phone`, `currency`, and `date` (which are reversible presentational masks), `TextCaseFormatterPlugin` (`ui.formatter: "textCase"`) intentionally transforms the stored model value to uppercase, lowercase, or title case. The original mixed-case user input is not preserved.
3. **`VerticalLayout` currently behaves as `Group`.**
   In `LayoutElementWalker.ts`, `VerticalLayout` is accepted as a valid `uiLayout` element type but is handled by the same branch as `Group` rather than creating a dedicated vertical sub-container (tracked as Phase 13.3.7n in `docs/ARCHITECTURE.md` §9).
4. **Embedding `DynamicHost` in fixed-height virtualised grid-table cells (`sap.ui.table.Table`) is unsupported.**
   `sap.ui.table.Table` uses fixed row heights and virtualised row scrolling, which conflicts with multi-field variable-height forms. For grid tables, trigger `host.openInDialog(...)` from a cell button, render `DynamicHost` in a detail pane, or use a responsive `sap.m.Table` with an explicit column width.
5. **Narrow container containment trade-off.**
   Because `DynamicHost` strictly enforces `min-width: 0` and `max-width: 100%`, mounting a multi-field form inside a very narrow table column (e.g. `200px`–`340px`) with the default `labelSpanS: 12` will stack labels above fields (`ResponsiveGridLayout` `S12:12` breakpoint) rather than widening the column. Consumers embedding `DynamicHost` in a narrow column can set root `ui: { labelSpan: 4 }` (or `ui: { labelSpan: 0 }` to omit labels, or `ui: { controlProps: { labelSpanS: 4 } }`) for compact rows, and should set an explicit sensible width on the table column.
6. **Constructor JSON strings whose keys are exclusively UI5 binding descriptor keys require `setProperty()` or `data`.**
   Passing a JSON literal string in constructor settings whose keys are a subset of UI5's `BindingParser` descriptor keys with a string `path` (e.g., `new DynamicHost({ dataJson: '{"path":"/usr/local"}' })`) is classified as a UI5 property binding descriptor (with a logged warning). Pass a parsed object via `data: { path: "/usr/local" }` or call `host.setProperty("dataJson", '{"path":"/usr/local"}')` after construction.
7. **`beforeSubmit` and `beforeLayoutSectionChange` `addError()` callbacks route into the persistent `customError` channel.**
   Calling `addError(fieldPath, message)` inside `beforeSubmit` or `beforeLayoutSectionChange` records a `customError` in `ValidationLedger`. While `ValidationDelegate.confirmBeforeSubmit()` clears its own prior `beforeSubmit` errors on the next submit attempt, errors added during `beforeLayoutSectionChange` must be cleared by calling `host.clearCustomError(fieldPath)` before navigation can proceed (tracked as Phase 13.2.1 in `docs/ARCHITECTURE.md` §6).
8. **`InferredGeneratorHost` is currently a pass-through subclass of `GeneratorHost`.**
   When `DynamicHost` is given data without a schema, `SchemaResolutionDelegate` instantiates `InferredGeneratorHost`, which currently adds no behaviour over `GeneratorHost` (tracked as Phase 13.5.5 in `docs/ARCHITECTURE.md` §3).
9. **`not` is enforced; `writeOnly` suppresses the read, not the write.**
   `PayloadValidator` rejects any value matching a `not` sub-schema, in forms and in table cells alike. A `not` declaring nothing the pipeline can evaluate is reported by `SchemaValidator` rather than silently accepted. A `writeOnly` value supplied in the inbound payload is stripped before the sandbox is seeded, so it is never rendered and never returned; a value the user types is submitted normally. `deprecated`, `precision` and `scale` were withdrawn in 2.0.0 -- they were mapped by the normalizer and read by nothing.
10. **Schema nesting deeper than `MAX_SCHEMA_DEPTH` (30) is truncated.**
    Every walker over the (schema, data) tree — normalization, OpenAPI mapping, inference, validation, `writeOnly` stripping, default injection, OData payload sanitizing, layout scoring — stops at the single shared cap exported from `constants/MetaUIConstants.ts`. Anything below that point is dropped and a warning naming the limit and what was discarded is logged; nothing is silently truncated, but the generated form will not contain those fields. This guard exists to bound recursion on circular specifications. `deepClone` has a deliberately separate, much higher cap (`MAX_CLONE_DEPTH`) because it copies consumer-owned data rather than schema.
11. **`validationError` and `validationSuccess` events carry `ManagedObject`'s accessor types.**
    UI5's `ManagedObject` already defines `validationError`, `validationSuccess`, `parseError` and `formatError` events for binding type validation. MetaUI's control metadata reuses the first two names. This works at runtime because the control's own event registry handles them, but their generated accessors cannot be narrowed without conflicting with the base class signature, so `attachValidationError` and `attachValidationSuccess` are typed as `ManagedObject` declares them rather than with MetaUI's `{ fieldPath, message }` parameters. Read those through `event.getParameter("fieldPath")`, or use `fieldChange` and `validationStateChanged`, which are fully typed. Every other property and event accessor is generated and typed.
12. **`ui.controlProps` cannot reach non-scalar or markup properties.**
    An entry is written only if the generated control declares the property and its UI5 type resolves to `string`, `boolean`, `int` or `float`. UI5's `object`, `function` and `any` primitives (and all array forms) are out of reach, as are `htmlText`, `html`, `innerHTML` and `content`, and the eleven state properties MetaUI owns. This is a deliberate narrowing from the earlier behaviour, which accepted any property that was not on an 11-entry denylist. A refused entry is logged (`REFUSED controlProps entry …`) and skipped; the field still renders. See §9 and [Data Binding & State Management](DataBindingAndState.md).
13. **UI5 complex-binding object syntax is not accepted from a schema.**
    `ui.visibleOn`, `ui.enabledOn` and binding-valued `ui.controlProps` accept model paths, `{= … }` expression bindings, `$root.` / `$row.` references and OData key predicates — but **not** the object form `{path:'…', formatter:'…'}`, because `BindingParser` resolves a named formatter against the global scope. Such a rule is logged (`REFUSED condition rule …`) and the directive is skipped, leaving the field visible and enabled. If you need a named formatter, register it as a MetaUI formatter plugin and reference it through `ui.formatter` / `ui.formatters` instead.
14. **A `pattern` can be rejected for its shape, not just its syntax.**
    `PatternValidatorPlugin` refuses a `pattern` longer than 512 characters, and one whose repetition is provably ambiguous — a quantifier applied to a group built only from variable-length elements (`(a+)+`, `(a?)*`, `(\w+\s?)*`) or to an alternation whose branches can start with the same token (`(a|a)+`, `(a|)+`). The field then reports `Schema configuration error: 'pattern' is unsafe (…)` and is marked invalid, rather than the pattern being quietly ignored. Anchoring the repeated group with one fixed atom (`([a-z]+\.)+`, `(a+b)+`, `(\d{4})+`) is accepted and runs under the evaluation budget described in §9.
15. **`ui.enabledOn` is inert on controls with no `enabled` property.**
    The binding is only applied when the target control declares `enabled`. Most widgets fall back to `sap.m.Text` in display mode, which does not, so an `enabledOn` rule simply has no effect there. (Binding it unguarded previously turned the directive into a hard render failure for the whole field.)
16. **The data source origin policy is library-global, not per host.**
    `UrlValidator.setDataSourceOriginPolicy()` holds static state shared by every `DynamicHost` on the page; the last call wins. An application that must apply different origin rules to trusted and untrusted schemas in the same page cannot express that through this API.
