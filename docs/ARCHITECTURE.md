# MetaUI — Architecture Reference

> **This document is reference material, not rules.** It records how `nz.co.siliconst.ui5.metaui` is built and which invariants the design depends on. Nothing here is a mandate; where behaviour must be preserved, that is enforced by a test or a gate, not by this file.
>
> It absorbs the factual content previously held in `AGENTS.md` rules 2, 9, 10, 12 and the deployment facts in rule 7, which were phrased as commandments but are really descriptions.

---

## 1. What MetaUI is

A runtime metadata-driven UI engine for SAP UI5. It consumes JSON Schema (Draft-07 / 2020-12), OpenAPI 2.0/3.0, or a raw data payload, and generates a bound, validated SAP Fiori control tree at runtime — no static XML view.

It is deliberately **not** a Fiori Elements replacement. Fiori Elements is driven by design-time OData CDS annotations. MetaUI targets cases where those are unavailable, impossible, or too rigid, using universal JSON Schema at runtime.

Library version is declared in `library.ts` (`Core.initLibrary`) and must match `package.json`. UI5 dependencies: `sap.ui.core`, `sap.m`, `sap.ui.layout` (eager) and `sap.ui.unified`, `sap.ui.codeeditor` (lazy). All ship with OpenUI5 as well as SAPUI5.

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

**Events:** `beforeSubmit`, `submit`, `cancel`, `fieldChange`, `validationStateChanged`, `validationError`, `validationSuccess`, `error`, `beforeLayoutSectionChange`. Event `fieldPath` parameters are normalized by `ValidationDelegate.normalizeFieldPath` to a leading-slash JSON Pointer (`"/..."`) for field-level events or `""` for whole-form / root events.

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

> **Known issue:** `ValidationDelegate.confirmBeforeSubmit()` clears prior `beforeSubmit` errors at the start of each submit attempt, whereas the `addError()` callback on `beforeLayoutSectionChange` routes into the consumer custom-error channel and persists until `clearCustomError(fieldPath)` is called. Tracked as Phase 13.2.1.

---

## 7. Policy engine

`uiPolicies` are declarative cross-field rules: `{ effect, targets, condition, message }`.

- **<!-- DOC_COUNT:policyConditions -->6 condition operators** (`NumericGreaterThanConditionPlugin`, `NumericLessThanConditionPlugin`, `StringEqualsConditionPlugin`, `DateLessThanConditionPlugin`, `IsNullConditionPlugin`, `IsNotNullConditionPlugin`, sharing pointer/entry helpers in `PolicyConditionUtil`): `NumericGreaterThan`, `NumericLessThan`, `StringEquals`, `DateLessThan`, `IsNull`, `IsNotNull`.
- **<!-- DOC_COUNT:policyEffects -->8 effects** served by <!-- DOC_COUNT:policyEffectFiles -->1 plugin file (`BinaryEffectPlugin.ts`; see `npm run metrics`): `Show`/`Hide` (visibility), `Validate`/`Invalidate` (validity), `Require`/`Optional` (required), `Enable`/`Disable` (editable).

`$row` tokens in targets and conditions expand per physical table row. The engine keeps a differential state matrix and emits only deltas, including cleanup deltas for targets that disappear (deleted rows).

---

## 8. Plugin system

`PluginRegistry` is a singleton mapping keys to **module path strings**, loaded lazily through `sap.ui.require`. Registration is cheap; nothing is loaded until a schema needs it.

Registered by `DefaultPluginBootstrapper` (canonical counts reported from AST by `npm run metrics`): **<!-- DOC_COUNT:pluginMappings -->51** `(type, widget)` control/action/datasource mappings (backed by **<!-- DOC_COUNT:concreteWidgetPlugins -->37** concrete plugin classes and **<!-- DOC_COUNT:abstractControlPluginBases -->7** control abstract bases — `BasePlugin`, `OptionListPlugin`, `SingleBoundWidgetPlugin`, `PickerPlugin`, `TextLikeInputPlugin`, `NestedDialogPlugin`, `HardwareControlPlugin` — plus `ActionButtonPlugin` in `plugins/actions/`), **<!-- DOC_COUNT:layouts -->4** layout strategies, **<!-- DOC_COUNT:policyConditions -->6** policy conditions, **<!-- DOC_COUNT:policyEffects -->8** policy effects.

Separately, `PipelineManager` is an eagerly-constructed singleton holding **<!-- DOC_COUNT:validators -->14 validators**, **<!-- DOC_COUNT:formatters -->4 formatters**, and **<!-- DOC_COUNT:parsers -->3 parsers** as static imports (reported from AST by `npm run metrics`). These two mechanisms coexist; the difference is historical rather than principled.

### Presentational vs transforming formatters

Because attaching a UI5 `formatter` function to a property binding forces `BindingMode.OneWay` (`Model -> View`), user edits on a formatted control do not write back through UI5's native binding. `BasePlugin.notifyChange()` resolves the value written to the model according to whether the formatter is **presentational** or **transforming**:

- **Presentational formatters** (`phone`, `currency`, `date`) are reversible and display-only. A formatter declares itself presentational by implementing `IParser.parse()` and registering in `PipelineManager.parsers`. On change, `BasePlugin.notifyChange()` runs `GlobalPipeline.runParsers()` (in reverse order when `ui.formatters` chains multiple names) to invert the display mask before writing the raw value to `SandboxJSONModel` and before running `validate()`.
- **Transforming formatters** (`textCase`) are lossy and intentionally normalize the stored value. A formatter declares itself transforming by omitting `parse()`. On change, `BasePlugin.notifyChange()` runs `GlobalPipeline.runFormatters()` on the user's input and writes the transformed value (`"HELLO"`, `"hello"`, `"Hello World"`) to `SandboxJSONModel`, then validates that stored value.

**Plugin categories:** control, action, datasource, validator, formatter, policy condition, policy effect.

**Directory purity:** everything under `plugins/` is a true plugin (`BasePlugin` subclass or a concrete `*Plugin` implementing a plugin interface). Shared helpers live in `utils/` or `core/`.

**Bundling caveat:** the default UI5 library build puts all compiled library modules (see `npm run metrics` for the current `src/` module count) into one `library-preload.js` (~<!-- DOC_MEASURE:bundlePreloadKB tolerance=5% source=npm-run-build -->408 KB raw), so lazy registration yields execution deferral rather than download saving. `builder.bundles` / `builder.libraryPreload.excludes` in `ui5.yaml` is the lever for changing that.

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

## 9a. Shared utilities, accessibility and internationalization

- **`utils/AccessibilityUtil.ts`** owns WAI-ARIA association and screen-reader plumbing across generated controls and layouts (`applyAriaLabelledBy`, `applyAriaDescribedBy`, `applyTooltipAndDescription`, `ensureControlLabelled`, `ensureFieldLabelledByText`, `syncValidationStateDescription`, `syncRequiredAriaDescription`, `applyDialogLandmark`, `applyTableAccessibility`, `applyGroupAccessibility`, `destroyAssociatedInvisibleTexts`, `IAccessibilityContext`, `IAriaLabelSupport`, `IAriaDescriptionSupport`, `isAriaLabelSupport`, `isAriaDescriptionSupport`). Extracted from `ControlDirectiveUtil.ts` so directive binding (`ControlDirectiveUtil.ts`) and ARIA/screen-reader association (`AccessibilityUtil.ts`) have separate single-purpose owners.
- **`utils/I18n.ts`** owns localized runtime text resolution via `TEXT_KEY` (<!-- DOC_COUNT:i18nTextKeys -->111 keys) backed by `messagebundle.properties`, `messagebundle_en.properties` and `messagebundle_de.properties`.
- **`utils/ControlCapabilities.ts`** owns `vetControlProperty`, `writeControlProperty`, capability type guards, remote data-source list extraction, and nested modal dialog launching.
- **`utils/DictionaryMapUtil.ts`** and **`utils/PolymorphicUtil.ts`** own the row serialization and variant-resolution helpers for `DictionaryMapPlugin` and `PolymorphicPlugin`.
- **`controls/BaseHardwareControl.ts`** and **`controls/BaseHardwareControlRenderer.ts`** provide the shared UI5 control lifecycle and renderer for `CameraControl`, `SignatureControl`, `GeolocationControl` and `VoiceInputControl`.

---

## 10. Schema ingestion

`SchemaNormalizer` deep-clones its input, resolves `$defs`/`definitions` and nullable type arrays, delegates directive normalization to `SchemaDirectiveNormalizer`, and merges inferred properties when `additionalProperties: true` (hybrid inference) or when no schema is supplied (full inference, via `DataInferenceBuilder`). `SchemaNormalizer.stripWriteOnlyValues` strips `writeOnly` properties from inbound payloads before seeding `StateManager`, `ODataDelegate.sanitizeODataPayload` flattens OData V2 `Date` instances and strips OData system keys, `SafeConvert` (`safeToString`, `safeToNumber`) provides null-safe primitive coercion, and `PatternValidatorPlugin` (`analyzeBacktracking`) screens `pattern` regular expressions for super-linear backtracking before compilation.

`SchemaBuilderRegistry` dispatches non-JSON-Schema inputs to a builder; `OpenApiBuilder` handles OpenAPI 2.0/3.0 through `OpenApiParserFactory`, `OpenApi2Parser`, `OpenApi3Parser`, `BaseOpenApiParser`, `OpenApiPropertyMapper`, `OpenApiConstraintMapper`, `OpenApiTypeMapper`, `OpenApiUIMapper`, `OpenApiRefResolver`, `OpenApiHeuristicEngine` (`ProtobufVariantHeuristic`), and `OpenApiExtractor`.

**Input immutability is a hard invariant:** passing a `schemaDefinition` or `data` object into `DynamicHost` must never mutate the caller's object. This is enforced at two independent points (`GenerationDelegate` deep-clones both; `OpenApiBuilder` clones the spec) and is covered by test.

---

## 10a. Tree traversal, and the bug class it caused

This section exists because six independent audits of this codebase each found the same shape of
defect: **a rule implemented correctly in one place and silently missing in its twin.** Read it
before adding anything that walks a schema.

### The cause

One tree is traversed by many functions, and `IPropertyMetadata` has **every field optional**. So a
producer that forgets to set a field compiles cleanly and the consumer reads `undefined` — no
error, no crash, just a directive that quietly stops working. Likewise, a rule added to one walker
does not exist in the others.

Three pieces of evidence that this is self-perpetuating rather than historical:

1. `invalidateStaleDataJson` was extracted into a shared static *specifically* to stop duplication,
   and a third copy grew anyway.
2. There were **fifteen** distinct depth caps for one concept. Two of them appeared *while* the
   consolidation onto a shared constant was in progress.
3. The walker count rose from twelve to thirteen during a single day's work, and a fourteenth
   (`PluginRegistry.getPathsToLoad`) was later found with no depth cap and no cycle detection.

**Extraction alone does not prevent the next copy. The gates do.**

### `core/SchemaWalker.ts`

The single canonical traversal engine for schema, layout, raw-record and paired `(schema, payload)` trees (`SchemaWalker.walk`, `SchemaWalker.walkPaired`, `SchemaWalker.toBindingPath`, `SchemaWalker.resolveScope`). It owns depth capping (from `MAX_SCHEMA_DEPTH`), path-scoped cycle detection, `$ref` resolution via `OpenApiRefResolver`, `ui.visible: false` skipping, and JSON-Pointer scope and binding-path construction (`ITreeChild`, `ChildKind`, `ISchemaVisitContext`, `IPairedVisitContext`, `IPairCursor`, `ISchemaWalkOptions`, `ISchemaWalkPairedOptions`, `SchemaVisitor`, `PairedSchemaVisitor`, `SchemaVisitorResult`).

1. **Shape-parameterised single-tree traversal (`SchemaWalker.walk<TNode>(root, visitor, options)`)**:
   Parameterised by `ITreeShape<TNode>`, with four built-in shapes:
   - `SchemaShape` (`ISchema` / `IPropertyMetadata`: `properties`, `items`, `additionalProperties`, `oneOf`/`anyOf`/`allOf`, `$ref` resolution)
   - `LayoutElementShape` (`ILayoutElement`: `elements[]` children in `uiLayout` trees, used by `LayoutElementWalker`)
   - `RawRecordShape` (`Record<string, unknown>`: raw unnormalized JSON Schema / OpenAPI object trees, used by `SchemaNormalizer`, `OpenApiPropertyMapper`, `OpenApiConstraintMapper`, and `DataInferenceBuilder`)
   - `JsonPayloadShape` (arbitrary JSON object/array payloads)
   Supports both pre-order `visitor(ctx)` and post-order `options.onLeave(ctx)` callbacks so bottom-up producers and aggregators share the same depth and cycle machinery as top-down readers.
2. **Lockstep paired traversal (`SchemaWalker.walkPaired(rootSchema, rootData, visitor, options)`)**:
   Co-traverses a normalized `ISchema` tree and a runtime payload (`unknown`) in lockstep, sharing `MAX_SCHEMA_DEPTH`, path-scoped cycle detection on both schema nodes and payload object references, `$ref` resolution, and array-element fan-out (`PayloadValidator`, `DataSyncDelegate.injectSchemaDefaults`, `SchemaNormalizer.stripWriteOnlyValues`, `ODataDelegate.sanitizeODataPayload`).

Cycle detection is **path-scoped** — a node is added on entry and removed on exit. A flat `visited`
set is wrong: it breaks legitimate diamonds, where the same `$ref` is reached by two sibling
branches and must resolve in both. Only a node reachable from itself along the *current* path is a
cycle.

Scope and binding path are both carried because they are not interchangeable: the binding path is
not injective for array items (`#/items` versus a property literally named `items`), which is why
`LayoutScorer`'s decision table is keyed on scope.

### Why only <!-- DOC_COUNT:singleWalkerExemptions -->4 `WALKER_EXEMPT` sites remain

A `WALKER_EXEMPT:` comment, audited by the `[SINGLE_WALKER]` gate, marks a recursive function that cannot delegate to `SchemaWalker.walk` or `SchemaWalker.walkPaired`. Since the generalisation onto `ITreeShape<TNode>`, `onLeave` and `walkPaired`, both co-inductive payload walkers and bottom-up schema producers run on `SchemaWalker`, leaving only **<!-- DOC_COUNT:singleWalkerExemptions -->4** exempt sites in `src/`:

1. `LayoutScorer.scoreNode` — coupled top-down inherited `layoutBudget` and bottom-up `(score, renderMode, resolvedMeta, subTable)` tuple synthesis.
2. `LayoutScorer.scoreRefNode` — `$ref` memoization in `refMemo` keyed by `(refPath, effectiveBudget)`.
3. `LayoutScorer.scoreArrayNode` — entered from `LayoutScorer.scoreNode` at the same scope and depth without advancing depth.
4. `TypeGuards.cloneInternal` (backing `deepClone`) — a pure value cloner with no schema and its own `MAX_CLONE_DEPTH` cap.

### The pattern worth copying

`PipelineManager` *asks* each validator for its rule — `extractRule(meta)` — rather than pushing
metadata into it. All <!-- DOC_COUNT:validators -->14 validators implement it, and it is **the only mapping in this
framework that has never produced a twin.** Every push-model mapping has. Prefer a pull model when
adding a new mapping.

---

## 10b. Structural and documentation gates

`npm run lint` runs **<!-- DOC_COUNT:structuralGates -->10** machine-checked source architectural gates plus the documentation integrity gates alongside the AST lint. They are not
style rules; each one exists because the divergence it catches has already happened here at least
once.

| Gate | Enforces |
|---|---|
| `[PRODUCER_COMPLETENESS]` | Every `IPropertyMetadata` / `IUIDirective` member (`PropertySchemaMemberKey`) is written by each known producer (`IPropertyProducerContract`), or named in that producer's `DECLINED_SCHEMA_FIELDS` (`DeclinedSchemaFieldsMap`) with a justification. Adding a field to `ISchema.ts` fails the build until all producers take a position on it. |
| `[DEPTH_CONSTANT]` | No numeric literal in a depth comparison; no `MAX_*_DEPTH` declared outside `constants/MetaUIConstants.ts`; `MAX_SCHEMA_DEPTH` may not fall below `MAX_LAYOUT_DEPTH`. Tests may read a cap, never restate it. |
| `[SINGLE_WALKER]` | No recursive schema-tree traversal outside `SchemaWalker`, unless carrying a `WALKER_EXEMPT:` justification. |
| `[REF_RESOLVER]` | No hand-rolled `$ref` parsing outside `OpenApiRefResolver`. |
| `[LAYOUT_STRATEGY_DEFAULT]` | The array-to-table / object-to-form default lives only in `DefaultLayoutGenerator.resolveLayoutStrategy`. |
| `[SCHEMA_CONSTANT]` | A string compared against `ui.renderMode`, `layoutStrategy` or `ui.widget` comes from `MetaUIConstants`, including when hoisted into a local. |
| `[DATA_WRITER]` | The committed `data` / `dataJson` pair is written only by `DataSyncDelegate.commitDataPair` / `invalidateStaleDataJson`. |
| `[CATCH_SIGNAL]` | A caught failure logs, rethrows or fires; otherwise it needs a counted `// CATCH_EXEMPT:` justification. |
| `[DEPTH_SIGNAL]` | A depth guard names its limit and what it discarded. No silent truncation. |
| `[RENDER_DEGRADATION]` | A layout `catch` sets `engine.hasPartialRenderingErrors`, so the partial-render banner appears. |
| `[DOC_SYMBOL]` | Two-way symbol parity between `src/` and `docs/`: every backticked symbol cited in prose must exist in `src/` (or `DOC_SYMBOL_ALLOWLIST`), and every exported module / public or extension API member must be documented in `docs/` (or `UNDOCUMENTED_SYMBOL_ALLOWLIST`). |
| `[DOC_COUNT]` | Every `<!-- DOC_COUNT:key -->` figure in Markdown must match the live AST-derived metric from `npm run metrics`. |
| `[DOC_CODE]` | Every fenced `typescript` block in Markdown must compile under `tsc`, and every fenced `json` / `jsonc` block must parse. |
| `[DOC_MEASURE]` | Every `<!-- DOC_MEASURE:key ... -->` figure in Markdown must either fall within its declared `tolerance` against the live build artefact or carry a `measured=YYYY-MM-DD` timestamp within its `maxAgeDays` staleness window, with an explicit `source=<cmd>`. |

**`scripts/prove-structural-gates.js` is the executable explanation** (<!-- DOC_COUNT:gateProofCases -->26 injected divergences caught across the source and documentation gates). It injects a divergence
per gate, asserts the gate catches it *by name*, and restores the tree. If a gate's
purpose is unclear, read its proof case — that is the specification.

Before concluding a gate is wrong and exempting past it: every exemption is counted and reported in
the `npm run lint` tally, and a gate with a growing exemption list has stopped being a gate.

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
8. **The schema is untrusted input.** Every path from a schema directive to a UI5 sink is validated at the sink, by an allowlist wherever the sink's own metadata makes one derivable. A refused directive is logged and skipped; it is never silently applied and never aborts the render.

### Trust boundary

The boundary runs between the **schema** (and the data bound to it) and the **UI5 control tree**. Everything crossing it is validated. The consumer-facing statement of what a schema may and may not do, and what exposure remains, is [`docs/wiki/SupportedFeatures.md`](wiki/SupportedFeatures.md) § *Security Posture & Trust Model*; this is the structural summary.

| Sink | Gate | Owner |
|---|---|---|
| UI5 control property (`ui.controlProps`) | Allowlist over the *declared UI5 property type* resolved through `sap.ui.base.DataType`, not a denylist of names. Only `string` / `boolean` / `int` / `float` pass. Plus two name lists that metadata cannot express: the eleven state properties MetaUI owns, and the four raw-markup sinks. | `vetControlProperty()` in `ControlCapabilities.ts` |
| The write itself | The control's generated `set<Property>`, so UI5's typed-setter coercion is never bypassed. `ManagedObject.setProperty` only where no setter is generated. | `writeControlProperty()` |
| `sap.ui.core.URI` property values | Protocol allowlist, applied to the literal *and* appended as a formatter to the binding so a model-delivered value is checked at write time. | `sanitizeUriPropertyValue()`, `UrlValidator` |
| Condition rules (`visibleOn`, `enabledOn`, bound `controlProps`) | Structural grammar: a `{…}` token must be a plain model reference. Complex-binding object syntax is identified by a top-level `:` / `,` or a second `>`, never by alphabet, which is what keeps OData key predicates such as `/Items(ID=1,Name='x')/Qty` working. | `ExpressionBuilder.buildChecked()` |
| …and again at the sink | Independent backstop that does not depend on reading UI5's parser correctly: the parsed binding is discarded if `BindingParser` resolved a named global into `formatter`, `events`, `factory` or `type`. | `ControlDirectiveUtil` |
| `pattern` evaluation | Length cap, static refusal of provably ambiguous repetition, then a wall-clock budget with session quarantine for what the analysis cannot classify. | `PatternValidatorPlugin` |
| Outbound `fetch` (`ui.dataSource.url`, `valueHelp.url`, remote `schemaDefinition`) | Scheme allowlist, always. Cross-origin is a separate, library-global policy that defaults to permissive-with-warning. | `UrlValidator.isSafeDataSourceUrl()` |

Two deliberate asymmetries are worth recording, because they look like inconsistencies:

- **The markup sinks are refused by name, not by type.** UI5 property metadata carries no "renders raw HTML" flag, so there is nothing to derive an allowlist from. Every other rule in the gate avoids naming properties; this one cannot.
- **Read-only constrains editing, not reaching.** A control whose only job is to open or follow a target (`LinkPlugin`, `UrlNavigationActionPlugin`, the `NestedDialogPlugin` trigger buttons) stays enabled when the host is not editable, because disabling it hides the payload behind a dead widget instead of protecting it. The dialog it opens is itself read-only, and the mutating action plugins keep the default and stay disabled. The opt-in is `BasePlugin.isNavigationAffordance`.

---

## 13. SAP / ABAP deployment notes

> **Provenance:** this section is carried over from the project's own accumulated knowledge (`AGENTS.md` rule 7). It has **not** been independently re-verified. Treat it as the team's working understanding, and confirm against SAP documentation before relying on it for a new deployment.

- A custom library on an ABAP server or Fiori Launchpad cannot be loaded via `index.html` (ignored by Launchpad), and `resourceRoots` in the consuming app's `manifest.json` is ignored by the global UI5 core loader for external libraries.
- A 404 for the library under `/resources/` means the **SAP UI5 App Index** does not know the library exists.
- The fix is to repair the App Index, not to patch path strings: deploy via standard tooling (`ui5-task-abapdeploy`) so `manifest.json` sits at the BSP root, then run `/UI5/APP_INDEX_CALCULATE`. Manual `SE38` uploads bury the manifest and break the index.

When a question about SAP deployment mechanics cannot be answered from verified evidence, the correct answer is "I don't know."
