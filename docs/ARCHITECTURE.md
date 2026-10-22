# MetaUI — Architecture Reference

> **This document is reference material, not rules.** It records how `nz.co.siliconst.ui5.metaui` is built and which invariants the design depends on. Nothing here is a mandate; where behaviour must be preserved, that is enforced by a test or a gate, not by this file.
>
> It absorbs the factual content previously held in `AGENTS.md` rules 2, 9, 10, 12 and the deployment facts in rule 7, which were phrased as commandments but are really descriptions.

---

## 1. What MetaUI is

A runtime metadata-driven UI engine for SAP UI5. It consumes JSON Schema (Draft-07 / 2020-12), OpenAPI 2.0/3.0, or a raw data payload, and generates a bound, validated SAP Fiori control tree at runtime — no static XML view.

It is deliberately **not** a Fiori Elements replacement. Fiori Elements is driven by design-time OData CDS annotations. MetaUI targets cases where those are unavailable, impossible, or too rigid, using universal JSON Schema at runtime.

Library version is declared in `library.ts` (`Core.initLibrary`) and must match `package.json`. UI5 dependencies: `sap.ui.core`, `sap.m`, `sap.ui.layout`, `sap.ui.unified`, `sap.ui.codeeditor`, `sap.ndc`.

---

## 2. Pipeline

```
Schema / OpenAPI / raw data
  → SchemaResolutionDelegate      resolve string | object | URL | OpenAPI
  → SchemaNormalizer              normalize to ISchema, resolve $ref, merge inference
  → PluginRegistry.preload        lazy-load required AMD modules
  → LayoutScorer / LayoutMutator  score against layoutBudget; mark inline vs dialog
  → StateManager                  deep-clone payload into an isolated sandbox model
  → Layout strategy + plugins     render the control tree
  → PolicyEngine                  evaluate uiPolicies, emit differential deltas
  → ValidationLedger              single authority for error state and Messaging
```

---

## 3. Host topology

**`DynamicHost`** is the public facade control. It owns `SchemaResolutionDelegate` and `ODataDelegate`, and spawns an inner host.

**`GeneratorHost`** is the inner engine host. It owns `DataSyncDelegate`, `ValidationDelegate`, `DialogDelegate`, `PolicyDelegate` and `GenerationDelegate`, and holds the `Engine` and `StateManager`.

**`InferredGeneratorHost`** is spawned instead of `GeneratorHost` when there is data but no schema (`SchemaResolutionDelegate.createAndWireInnerHost`).

> **Known issue:** `InferredGeneratorHost` currently adds no behaviour over `GeneratorHost` — it declares a constructor that calls `super()` and redeclares inherited statics. The routing distinction is therefore presently cosmetic. Resolution is tracked as Phase 13.5.5; it is listed in `library.ts` `controls[]`, so removing it is a public API change.

### Facade proxying

`DynamicHost` must proxy its public programmatic API to the inner host: `triggerSubmit()`, `openInDialog()`, `generate()`, `addCustomError()`, `clearCustomError()`, `getStateManager()`, `getSchemaDefinition(s)()`, and `getProperty("outputData")`. Dropping a proxy causes extraction workflows to return blank payloads rather than fail loudly.

---

## 4. Public control contract

Declared once in `HostControlMetadata.ts` and shared by `DynamicHost` and `GeneratorHost`, guaranteeing parity between facade and inner host.

**Properties:** `schemaDefinition`, `schemaDefinitions`, `schemaTarget`, `pluginRegistry`, `schemaBuilderRegistry`, `data`, `dataJson`, `liveUpdate`, `isValid`, `useMessageManager`, `modelName`, `debugMode`, `editable`, `layoutBudget`, `engineScopeId`, `width`, `height`.

**Events:** `beforeSubmit`, `submit`, `cancel`, `fieldChange`, `validationStateChanged`, `validationError`, `validationSuccess`, `error`, `beforeLayoutSectionChange`.

**`outputData` is not a declared property.** It is resolved by an intercepting `getProperty()` override on both hosts, reading the live `StateManager` on demand. It therefore works programmatically but cannot be used as an XML binding target.

### Sizing and containment

`HOST_CONTROL_METADATA` declares `width` (type `sap.ui.core.CSSSize`, default `"100%"`) and `height` (type `sap.ui.core.CSSSize`, default `"auto"`). `HOST_CONTROL_RENDERER` emits `min-width: 0`, `max-width: 100%`, `box-sizing: border-box`, and the configured `width` / `height` on the host wrapper `<div>`, establishing the containment invariant:

> **A `DynamicHost` must never make its container wider than the width that container offers it.**

If the generated content has a large intrinsic width (long labels, `codeEditor`, `richText`, `dictionaryMap`, or an inline nested table), `min-width: 0` and `max-width: 100%` override Flexbox/Grid `min-width: auto` propagation so the content wraps, stacks, or scrolls inside the host rather than expanding the container or table column past the viewport. Defaulting `height` to `"auto"` (rather than `"100%"`) avoids circular percentage-height resolution inside table cells and auto-height containers.

**Accepted trade-off:** honouring containment means a host mounted in a narrow column with the default `labelSpanS: 12` renders a cramped stacked form (`ResponsiveGridLayout`'s `S12:12` breakpoint stacks labels above fields) rather than forcing the column wider. Consumers embedding `DynamicHost` in a narrow table column can configure root `ui.labelSpan` (`1`–`12` for label-beside-field rows, or `0` to omit labels) or root `ui.controlProps` (`labelSpanS`, `labelSpanM`, `labelSpanL`, `labelSpanXL`), and are expected to give the column a sensible width; MetaUI's job is to respect it, not to fight it.

### Constructor JSON Literal vs. Binding Disambiguation (`extractConstructorJsonLiterals`)

In SAPUI5, passing any string enclosed in `{...}` to a control constructor (`new DynamicHost({ dataJson: '{"field":"val"}' })`) triggers `ManagedObject.applySettings` → `BindingParser`, which misinterprets valid JSON object strings as UI5 binding expressions and discards the literal string. `extractConstructorJsonLiterals` in `HostControlMetadata.ts` intercepts `dataJson` and `schemaDefinition` before `super()` and applies the following disambiguation rules:

| Constructor Input | Classification | Runtime Behaviour |
|---|---|---|
| `'{"field":"val"}'` | Literal JSON | Extracted before `super()` and applied via `setProperty(..., true)`. |
| `'[1,2,3]'` | Literal JSON | Extracted before `super()` and applied via `setProperty(..., true)`. |
| `"{path: '/foo'}"` (UI5 syntax, invalid JSON) | UI5 Binding | Left in constructor settings; parsed by `BindingParser` as a property binding. |
| `'{"path":"/foo"}'` | **UI5 Binding (Precedence Rule)** | Treated as a binding descriptor because `path` is a string and all keys belong to `UI5_BINDING_DESCRIPTOR_KEYS` (`path`, `model`, `type`, `formatOptions`, `constraints`, `formatter`, `parts`, `mode`, `parameters`, `events`). Emits a non-silent `Logger.warn` / `Logger.debug` diagnostic. |
| `'{"path":"/foo","extra":1}'` | Literal JSON | Because `"extra"` is not a UI5 binding descriptor key, classified as a literal JSON payload. |
| `'not json at all'` | Plain String | Does not start with `{` or `[`; left in constructor settings untouched as a literal string. |
| `{ path: "/foo" }` (JS descriptor object) | UI5 Binding | Non-string object; left in constructor settings for standard UI5 property binding. |

**Limitation & Escape Hatch:** A valid JSON string passed in constructor settings whose keys are exclusively UI5 binding descriptor keys (e.g. `'{"path":"/usr/local"}'`) will be classified as a UI5 binding descriptor (with a logged warning). Consumers who need to pass such a payload must either pass a parsed object via `data: { path: "/usr/local" }` or call `host.setProperty("dataJson", '{"path":"/usr/local"}')` after construction (`setProperty` does not invoke `BindingParser`).

### Dialogs

`DialogDelegate` builds native `sap.m.Dialog` instances. `openInDialog(title, submitButtonText, cancelButtonText, dialogWidth, parentView)` mounts `submitButtonText` as the dialog's `beginButton`, and pressing it triggers the `submit` pipeline. The button text is fully configurable by design.

Consumers and sandbox controllers must route through `host.openInDialog()` rather than wrapping the host in a hand-built dialog, which would discard the configurable submit affordance.

### Submit

Pressing the dialog's submit button or calling `triggerSubmit()` runs policy evaluation, then `Engine.validateAll(true)`. On failure it reports errors and returns `false`. On success it reads the payload from `StateManager`, fires `beforeSubmit` (which may veto), then fires `submit` with `payload` and `payloadJson`.

---

## 5. Data binding and state

### Tri-binding

Data enters by three paths: `data` (a JS object), `dataJson` (a serialized string), or an OData v2/v4 binding context handled by `ODataDelegate`.

### Sandbox isolation

`StateManager` deep-clones the incoming payload into a `SandboxJSONModel` on construction. The consumer's object is never mutated by keystrokes. `extractPayload()` returns a deep copy, preserving `Date` instances and root arrays.

### Transactional vs live

- **`liveUpdate: false` (default)** — transactional. Edits stay inside the sandbox. Data leaves only when `triggerSubmit()` runs and validation passes. This protects the parent model from unvalidated input and is the intended default.
- **`liveUpdate: true`** — the sandbox boundary is deliberately broken; unvalidated values are pushed continuously back into the two-way bindings.

`DataSyncDelegate.runWithSyncLock()` is the single authority for outbound binding sync and exists to prevent echo loops.

---

## 6. Validation authority

`ValidationLedger` is the single source of truth for field error state. It tracks three tiers per normalized path:

| Tier | Set by |
|---|---|
| `schemaError` | the validator pipeline, via `Engine.reportSchemaError` |
| `policyError` | `PolicyEngine` effects |
| `customError` | the consumer, via `addCustomError()` / `clearCustomError()` |

It resolves these into one visual state per field, suppresses errors on hidden fields, and owns every `sap/ui/core/Messaging` entry it creates, using the sandbox model as the message processor so teardown can purge by processor id.

### Why controls are not registered with Messaging

**Never call `Messaging.registerObject(control)`.** MetaUI manages its own validation state. Registering controls causes UI5's internal binding sync to delete MetaUI's custom schema errors. Plugins therefore paint their own `valueState` manually via `setVisualValidationState()`.

### Custom error lifecycle

`addCustomError()` and `clearCustomError()` are a consumer-managed pair, intended for asynchronous backend checks during `fieldChange`. A custom error persists until explicitly cleared.

> **Known issue:** the `addError()` callbacks on `beforeSubmit` and `beforeLayoutSectionChange` route into this same permanent channel while giving the handler no way to clear it, which permanently blocks submit and wizard navigation. Tracked as Phase 13.2.1.

---

## 7. Policy engine

`uiPolicies` are declarative cross-field rules: `{ effect, targets, condition, message }`.

- **6 condition operators:** `NumericGreaterThan`, `NumericLessThan`, `StringEquals`, `DateLessThan`, `IsNull`, `IsNotNull`.
- **8 effects** served by 1 plugin file (`BinaryEffectPlugin.ts`; see `npm run metrics`): `Show`/`Hide` (visibility), `Validate`/`Invalidate` (validity), `Require`/`Optional` (required), `Enable`/`Disable` (editable).

`$row` tokens in targets and conditions expand per physical table row. The engine keeps a differential state matrix and emits only deltas, including cleanup deltas for targets that disappear (deleted rows).

---

## 8. Plugin system

`PluginRegistry` is a singleton mapping keys to **module path strings**, loaded lazily through `sap.ui.require`. Registration is cheap; nothing is loaded until a schema needs it.

Registered by `DefaultPluginBootstrapper` (canonical counts reported from AST by `npm run metrics`): **52** `(type, widget)` control/action/datasource mappings, **4** layout strategies, **6** policy conditions, **8** policy effects.

Separately, `PipelineManager` is an eagerly-constructed singleton holding **14 validators**, **4 formatters**, and **3 parsers** as static imports (reported from AST by `npm run metrics`). These two mechanisms coexist; the difference is historical rather than principled.

### Presentational vs transforming formatters

Because attaching a UI5 `formatter` function to a property binding forces `BindingMode.OneWay` (`Model -> View`), user edits on a formatted control do not write back through UI5's native binding. `BasePlugin.notifyChange()` resolves the value written to the model according to whether the formatter is **presentational** or **transforming**:

- **Presentational formatters** (`phone`, `currency`, `date`) are reversible and display-only. A formatter declares itself presentational by implementing `IParser.parse()` and registering in `PipelineManager.parsers`. On change, `BasePlugin.notifyChange()` runs `GlobalPipeline.runParsers()` (in reverse order when `ui.formatters` chains multiple names) to invert the display mask before writing the raw value to `SandboxJSONModel` and before running `validate()`.
- **Transforming formatters** (`textCase`) are lossy and intentionally normalize the stored value. A formatter declares itself transforming by omitting `parse()`. On change, `BasePlugin.notifyChange()` runs `GlobalPipeline.runFormatters()` on the user's input and writes the transformed value (`"HELLO"`, `"hello"`, `"Hello World"`) to `SandboxJSONModel`, then validates that stored value.

**Plugin categories:** control, action, datasource, validator, formatter, policy condition, policy effect.

**Directory purity:** everything under `plugins/` is a true plugin (`BasePlugin` subclass or a concrete `*Plugin` implementing a plugin interface). Shared helpers live in `utils/` or `core/`.

**Bundling caveat:** the default UI5 library build puts all compiled library modules (see `npm run metrics` for the current `src/` module count) into one `library-preload.js` (~306 KB), so lazy registration currently yields no download saving. `builder.libraryPreload.excludes` in `ui5.yaml` is the supported lever for changing that.

---

## 9. Layouts

| Strategy | Renders |
|---|---|
| `form` | `sap.ui.layout.form.SimpleForm` with `ResponsiveGridLayout`, label-paired |
| `table` | `sap.m.Table` with add/delete row and per-cell validation on cloned templates |
| `wizard` | custom composable step UI with per-step validation and a `beforeLayoutSectionChange` veto hook |
| `compact` | dense `VBox`/`HBox` with nested groups and inline tables |

`uiLayout` element types: `Group`, `Control`, `HorizontalLayout`, `VerticalLayout`, `WizardStep`. (`VerticalLayout` is currently accepted but behaves as `Group` — Phase 13.3.7n.)

The wizard is a custom composable rather than `sap.m.Wizard`, because that control requires a specific physical ancestor which conflicts with MetaUI hosting content in dynamically created containers.

---

## 10. Schema ingestion

`SchemaNormalizer` deep-clones its input, resolves `$defs`/`definitions` and nullable type arrays, and merges inferred properties when `additionalProperties: true` (hybrid inference) or when no schema is supplied (full inference, via `DataInferenceBuilder`).

`SchemaBuilderRegistry` dispatches non-JSON-Schema inputs to a builder; `OpenApiBuilder` handles OpenAPI 2.0/3.0 through version-specific parsers.

**Input immutability is a hard invariant:** passing a `schemaDefinition` or `data` object into `DynamicHost` must never mutate the caller's object. This is enforced at two independent points (`GenerationDelegate` deep-clones both; `OpenApiBuilder` clones the spec) and is covered by test.

---

## 11. Core capabilities

These exist and are expected to keep working. Each is covered by tests rather than by instruction.

- **Full inference** — bind raw data with no schema.
- **Hybrid inference** — partial schema plus `additionalProperties: true`.
- **Native validation** — standard JSON Schema constraints and `ui.format` strings map directly to `sap.m.InputBase` error states with no explicit validation block.
- **Custom error API** — programmatic `addCustomError` / `clearCustomError` for asynchronous backend checks.
- **Declarative orchestration** — `layoutStrategy` plus `uiLayout` detach visual presentation from data structure.

---

## 12. Design invariants

Violating any of these produces whole-class bugs rather than local ones.

1. **Single-authority state.** No two classes independently mutate the same external state. `ValidationLedger` owns validation and `Messaging`; `DataSyncDelegate.runWithSyncLock` owns outbound binding sync.
2. **Caller input is never mutated.**
3. **Deterministic lifecycle.** Every dynamically created `Control`, `Dialog`, `JSONModel`, binding and timer is released in `destroy()`/`exit()`. Re-rendering must never produce duplicate UI5 IDs.
4. **Fail loudly.** Unresolvable input must surface as a visible signal, never as a plausible-looking empty result.
5. **Specification-first.** Behaviour derives from JSON Schema / OpenAPI / UI5 specifications, never from the field names in a particular mock scenario.
6. **The model holds data; formatters are display-only unless explicitly transforming.** Presentational formatters (`phone`, `currency`, `date`, which implement `parse()`) never write their display strings into `SandboxJSONModel`, and validators always run against the raw model value. Only transforming formatters (those without `parse()`, such as `textCase`) write their transformed output to the model.
7. **Host containment.** A `DynamicHost` must never make its container wider than the width that container offers it (`min-width: 0`, `max-width: 100%`, `box-sizing: border-box`, default `width: "100%"`, default `height: "auto"`).

---

## 13. SAP / ABAP deployment notes

> **Provenance:** this section is carried over from the project's own accumulated knowledge (`AGENTS.md` rule 7). It has **not** been independently re-verified. Treat it as the team's working understanding, and confirm against SAP documentation before relying on it for a new deployment.

- A custom library on an ABAP server or Fiori Launchpad cannot be loaded via `index.html` (ignored by Launchpad), and `resourceRoots` in the consuming app's `manifest.json` is ignored by the global UI5 core loader for external libraries.
- A 404 for the library under `/resources/` means the **SAP UI5 App Index** does not know the library exists.
- The fix is to repair the App Index, not to patch path strings: deploy via standard tooling (`ui5-task-abapdeploy`) so `manifest.json` sits at the BSP root, then run `/UI5/APP_INDEX_CALCULATE`. Manual `SE38` uploads bury the manifest and break the index.

When a question about SAP deployment mechanics cannot be answered from verified evidence, the correct answer is "I don't know."
