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

## 2. Widget Registry (`DefaultPluginBootstrapper` — 52 `(type, widget)` Mappings: 31 Concrete Control Plugins + 5 Abstract Bases, 3 Actions, 4 Datasources)

All 52 `(type, widget)` pairs registered in `src/nz/co/siliconst/ui5/metaui/core/DefaultPluginBootstrapper.ts`:

| # | Schema `type` | `ui.widget` | Plugin Class | Edit Mode UI5 Control | Display Mode UI5 Control (`editable: false`) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | `string` | *(omitted)* | `StringPlugin` | `sap.m.Input` | `sap.m.Text` |
| 2 | `number` | *(omitted)* | `NumberPlugin` | `sap.m.Input` (`type="Number"`) | `sap.m.Text` |
| 3 | `integer` | *(omitted)* | `NumberPlugin` | `sap.m.Input` (`type="Number"`) | `sap.m.Text` |
| 4 | `date` | *(omitted)* | `DatePlugin` | `sap.m.DatePicker` | `sap.m.Text` |
| 5 | `boolean` | *(omitted)* | `BooleanPlugin` | `sap.m.CheckBox` | `sap.m.ObjectStatus` |
| 6 | `array` | *(omitted)* | `ArrayPlugin` | `sap.m.Button` (Modal Trigger) or inline `TableLayout` | `sap.m.Button` (View Dialog Trigger) or inline `TableLayout` |
| 7 | `object` | *(omitted)* | `ObjectPlugin` | `sap.m.Button` (Modal Trigger) or inline `FormLayout` | `sap.m.Button` (View Dialog Trigger) or inline `FormLayout` |
| 8 | `string` | `"default"` | `StringPlugin` | `sap.m.Input` | `sap.m.Text` |
| 9 | `object` | `"dictionaryMap"` | `DictionaryMapPlugin` | `sap.m.VBox` (Key-Value Map) | `sap.m.VBox` (Read-Only Key-Value Rows) |
| 10 | `object` | `"reference"` | `ReferencePlugin` | `sap.m.VBox` (Inline) or `sap.m.Button` (Dialog) | `sap.m.VBox` (Inline) or `sap.m.Button` (View Dialog) |
| 11 | `object` | `"polymorphic"` | `PolymorphicPlugin` | `sap.m.VBox` (`sap.m.Select` + nested `DynamicHost`) | `sap.m.VBox` (Disabled `sap.m.Select` + read-only `DynamicHost`) |
| 12 | `string` | `"date"` | `DatePlugin` | `sap.m.DatePicker` | `sap.m.Text` |
| 13 | `string` | `"datePicker"` | `DatePlugin` | `sap.m.DatePicker` | `sap.m.Text` |
| 14 | `date` | `"date"` | `DatePlugin` | `sap.m.DatePicker` | `sap.m.Text` |
| 15 | `date` | `"datePicker"` | `DatePlugin` | `sap.m.DatePicker` | `sap.m.Text` |
| 16 | `string` | `"time"` | `TimePlugin` | `sap.m.TimePicker` | `sap.m.Text` |
| 17 | `string` | `"datetime"` | `DateTimePlugin` | `sap.m.DateTimePicker` | `sap.m.Text` |
| 18 | `boolean` | `"switch"` | `SwitchPlugin` | `sap.m.Switch` | `sap.m.ObjectStatus` |
| 19 | `number` | `"step"` | `StepInputPlugin` | `sap.m.StepInput` | `sap.m.Text` |
| 20 | `integer` | `"step"` | `StepInputPlugin` | `sap.m.StepInput` | `sap.m.Text` |
| 21 | `string` | `"select"` | `DropdownPlugin` | `sap.m.Select` | `sap.m.Text` |
| 22 | `number` | `"select"` | `DropdownPlugin` | `sap.m.Select` | `sap.m.Text` |
| 23 | `integer` | `"select"` | `DropdownPlugin` | `sap.m.Select` | `sap.m.Text` |
| 24 | `string` | `"textArea"` | `TextAreaPlugin` | `sap.m.TextArea` / `sap.m.HBox` (when `expandable`) | `sap.m.Text` |
| 25 | `string` | `"codeEditor"` | `CodeEditorPlugin` | `sap.m.VBox` (`sap.ui.codeeditor.CodeEditor`) | `sap.m.VBox` (Read-Only `CodeEditor`) |
| 26 | `string` | `"link"` | `LinkPlugin` | `sap.m.Link` | `sap.m.Link` |
| 27 | `string` | `"password"` | `PasswordPlugin` | `sap.m.Input` (`type="Password"`) | `sap.m.Text` (Masked `"********"`) |
| 28 | `string` | `"email"` | `EmailPlugin` | `sap.m.Input` (`type="Email"`) | `sap.m.Text` |
| 29 | `string` | `"fileUploader"` | `FileUploaderPlugin` | `sap.m.VBox` (`sap.m.Image` + `sap.ui.unified.FileUploader`) | `sap.m.VBox` (Preview only, uploader hidden) |
| 30 | `array` | `"multiSelect"` | `MultiSelectPlugin` | `sap.m.MultiComboBox` | `sap.m.Tokenizer` (Read-Only) |
| 31 | `array` | `"multiInput"` | `MultiInputPlugin` | `sap.m.MultiInput` | `sap.m.Tokenizer` (Read-Only) |
| 32 | `number` | `"slider"` | `SliderPlugin` | `sap.m.Slider` | `sap.m.ProgressIndicator` |
| 33 | `integer` | `"slider"` | `SliderPlugin` | `sap.m.Slider` | `sap.m.ProgressIndicator` |
| 34 | `number` | `"rating"` | `RatingIndicatorPlugin` | `sap.m.RatingIndicator` | `sap.m.RatingIndicator` (`editable: false`) |
| 35 | `integer` | `"rating"` | `RatingIndicatorPlugin` | `sap.m.RatingIndicator` | `sap.m.RatingIndicator` (`editable: false`) |
| 36 | `string` | `"messageStrip"` | `MessageStripPlugin` | `sap.m.MessageStrip` | `sap.m.MessageStrip` |
| 37 | `string` | `"camera"` | `CameraPlugin` | `nz.co.siliconst.ui5.metaui.controls.CameraControl` | `CameraControl` (`editable: false`) |
| 38 | `string` | `"signature"` | `SignaturePlugin` | `nz.co.siliconst.ui5.metaui.controls.SignatureControl` | `SignatureControl` (`editable: false`) |
| 39 | `object` | `"location"` | `GeolocationPlugin` | `nz.co.siliconst.ui5.metaui.controls.GeolocationControl` | `GeolocationControl` (`editable: false`) |
| 40 | `string` | `"scanner"` | `BarcodeScannerPlugin` | `sap.m.HBox` (`sap.m.Input` + `sap.ndc.BarcodeScannerButton`) | `sap.m.Text` |
| 41 | `string` | `"voiceInput"` | `VoiceInputPlugin` | `nz.co.siliconst.ui5.metaui.controls.VoiceInputControl` | `VoiceInputControl` (`editable: false`) |
| 42 | `string` | `"richText"` | `RichTextPlugin` | `nz.co.siliconst.ui5.metaui.controls.RichTextControl` | `RichTextControl` (`editable: false`) |
| 43 | `string` | `"urlButton"` | `UrlNavigationActionPlugin` | `sap.m.Button` | `sap.m.Button` |
| 44 | `string` | `"submitButton"` | `SubmitFormActionPlugin` | `sap.m.Button` | `sap.m.Button` (`enabled: false`) |
| 45 | `string` | `"clearButton"` | `ClearFormActionPlugin` | `sap.m.Button` | `sap.m.Button` (`enabled: false`) |
| 46 | `string` | `"odataSelect"` | `ODataListBindingPlugin` | `sap.m.ComboBox` | `sap.m.Text` |
| 47 | `string` | `"remoteDropdown"` | `RemoteDropdownPlugin` | `sap.m.Select` | `sap.m.Text` |
| 48 | `string` | `"remoteSelect"` | `RemoteDropdownPlugin` | `sap.m.Select` | `sap.m.Text` |
| 49 | `string` | `"combobox"` | `RemoteDropdownPlugin` | `sap.m.ComboBox` | `sap.m.Text` |
| 50 | `string` | `"liveSearch"` | `LiveSearchPlugin` | `sap.m.Input` (with suggestion items) | `sap.m.Text` |
| 51 | `string` | `"remoteValueHelp"` | `RemoteValueHelpPlugin` | `sap.m.Input` (`showValueHelp: true` + `SelectDialog`) | `sap.m.Text` |
| 52 | `string` | `"valueHelp"` | `RemoteValueHelpPlugin` | `sap.m.Input` (`showValueHelp: true` + `SelectDialog`) | `sap.m.Text` |

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
| 5 | `range` | `RangeValidatorPlugin` | `minimum`, `maximum`, `exclusiveMinimum`, `exclusiveMaximum`, `precision`, `scale` on `number` / `integer` |
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
  - When `editable="false"` on `DynamicHost` (or `readOnly: true` on the root schema), all 52 `(type, widget)` mappings render non-interactive display controls (`sap.m.Text`, `sap.m.ObjectStatus`, `sap.m.Tokenizer`, `sap.m.ProgressIndicator`, read-only `sap.m.RatingIndicator`, etc.).
- **Host Sizing & Containment**:
  - `DynamicHost` exposes `width` (default `"100%"`, `sap.ui.core.CSSSize`) and `height` (default `"auto"`, `sap.ui.core.CSSSize`) and emits `min-width: 0`, `max-width: 100%`, and `box-sizing: border-box` so a host never expands its parent container or table column wider than the width offered to it.
  - For compact label-beside-field rows inside narrow containers (such as a `340px` table column), set root `ui.labelSpan` (`1`–`12` for side-by-side label/field spans across all breakpoints, or `0` to omit labels) or root `ui.controlProps` (`labelSpanS`, `labelSpanM`, `labelSpanL`, `labelSpanXL`) while preserving the default `labelSpanS: 12` when omitted.
- **Root & Nested Sub-Schema Dialogs**:
  - `host.openInDialog(title, submitButtonText, cancelButtonText, dialogWidth, parentView)` mounts the host inside a `sap.m.Dialog` with configurable button labels.
  - `LayoutScorer` and `LayoutMutator` compare nested object/array footprints against `layoutBudget`; sub-schemas exceeding the budget overflow to modal trigger buttons (`ArrayPlugin`, `ObjectPlugin`, `ReferencePlugin`) that spawn isolated child `DynamicHost` dialogs.

---

## 9. Known Limitations (What MetaUI Does Not Do)

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
9. **`writeOnly`, `deprecated`, and `not` are metadata-only.**
   `SchemaNormalizer` and `OpenApiPropertyMapper` preserve `writeOnly`, `deprecated`, and `not` on normalized `IPropertyMetadata` for consumer or custom-plugin inspection, but the core layouts and validator pipeline do not automatically hide `writeOnly` fields, badge `deprecated` fields, or evaluate `not` sub-schemas.
10. **OpenAPI nesting deeper than `MAX_MAPPING_DEPTH` (8) is truncated.**
    `OpenApiPropertyMapper` stops descending past eight levels of nested `properties`. Properties below that point are dropped and a warning is logged on the `OpenApiPropertyMapper` component; nothing is silently discarded, but the generated form will not contain those fields. This guard exists to bound recursion on circular specifications.
11. **`validationError` and `validationSuccess` events carry `ManagedObject`'s accessor types.**
    UI5's `ManagedObject` already defines `validationError`, `validationSuccess`, `parseError` and `formatError` events for binding type validation. MetaUI's control metadata reuses the first two names. This works at runtime because the control's own event registry handles them, but their generated accessors cannot be narrowed without conflicting with the base class signature, so `attachValidationError` and `attachValidationSuccess` are typed as `ManagedObject` declares them rather than with MetaUI's `{ fieldPath, message }` parameters. Read those through `event.getParameter("fieldPath")`, or use `fieldChange` and `validationStateChanged`, which are fully typed. Every other property and event accessor is generated and typed.
