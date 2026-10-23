# 09. Testing Routines, TestOracle, and Automated Verification Guide

This document provides the complete blueprint for running, debugging, and extending the MetaUI automated test suites. It is designed so that any developer or AI coding agent can pick up the repository and execute full verification with zero guesswork.

---

## 1. Quick-Start Commands

All verification steps should be executed in the following order whenever any TypeScript source file in `src/` or test scenario in `test/` is modified:

```bash
# 1. Strict TypeScript compilation check (0 errors allowed)
npx tsc --noEmit -p .

# 2. Transpile and bundle the UI5 library into dist/
npm run build

# 3. Run the full headless Puppeteer automated test suite (Unit + E2E + Sandbox App)
npm test
```

> **Important Note for AI Agents**:
> The automated browser test runner (`scripts/run-tests.js`) serves `/resources/nz/co/siliconst/ui5/metaui` directly from `dist/resources/nz/co/siliconst/ui5/metaui`. Therefore, you **must always run `npm run build` before running `npm test`** after modifying any `.ts` file in `src/`, or the browser tests will execute against stale compiled JavaScript.

---

## 2. Architecture of the Automated Test Suite

The MetaUI test architecture is organized into four distinct verification layers:

| Layer | Location | Runner / Entry Point | Purpose |
| :--- | :--- | :--- | :--- |
| **0. Ground-Truth Oracle** | `test/webapp/test/TestOracle.js` | Loaded by QUnit Unit & E2E suites | Single source of truth for all 52 `(type, widget)` plugin mappings, 4 layouts, 6 policy conditions, 8 policy effects, 14 validators, 4 formatters, and 3 parsers (enforces Rule 7 parity in `AGENTS.md`). |
| **1. QUnit Unit Tests (Physical DOM)** | `test/webapp/test/unit/` | `test/webapp/test/unit/unitTests.qunit.html` | Tests core architecture (`Registry`, `PluginRegistry`, `SchemaNormalizer`, `DataInferenceBuilder`, `SchemaValidator`, `PayloadValidator`, `StateManager`, `LayoutScorer`, `LayoutMutator`, `DefaultLayoutGenerator`, `PolicyEngine`, `ExpressionBuilder`, `OpenApiBuilder`, `OpenApiExtractor`), all 18 pipeline plugins (14 validators + 4 formatters, including 3 presentational parsers), and physically mounts all 52 control/action/datasource plugin mappings in a real DOM sandbox. |
| **2. QUnit Integration & E2E Matrix** | `test/webapp/test/integration/` | `test/webapp/test/integration/opaTests.qunit.html` | Tests `DynamicHost` and `GeneratorHost` across all binding modes (`string`, `object`, `programmatic`, `odata`), all render targets (`embedded`, `dialog`, `js_scratch`, `js_dialog`), all 4 layout strategies (`form`, `table`, `wizard`, `compact`), all 11 scenario JSON files in `test/webapp/mockData/scenarios/index.json` + all selectable OpenAPI `schemaTarget` entries, host lifecycle events (`beforeSubmit`, `validationError`, `validationSuccess`, `validationStateChanged`, `cancel`), cloned table cell live validation, root array dialogs, and runtime live property toggles. |
| **3. Fiori Sandbox App Verification** | `test/webapp/index.html` | `scripts/run-tests.js` | Boots the full SAP Fiori Sandbox application in headless Chromium and navigates across routes (`#/`, `#/scenario/kitchen_sink`, `#/scenario/openapi`, `#/playpen`, `#/playground`, `#/odata`), verifying zero uncaught console or page errors. |
| **4. Standalone Consumer Page Verification** | `/standalone-consumer.html` | `scripts/run-tests.js` | Boots a clean standalone SAPUI5 consumer page outside `ScenarioRunner`, physically renders all 38 widget/action/datasource plugins and verifies non-zero `getBoundingClientRect()` DOM geometry, hardware inner elements (`<canvas>`, `<video>`, `FlexItemData` inputs), all 4 layout strategies + display mode, dependent dialog isolation, single-authority `Messaging` cleanup, and optimal model synchronization. |
| **5. OpenAPI Stress Test** (opt-in) | `test/swagger_schemas/test_runner.ts` | `npm run stress:fetch` then `npm run stress` | Crawls the real Kubernetes OpenAPI 2.0 (~4MB) and GitHub REST OpenAPI 3.0 (~12MB) descriptions — 1,827 definitions, ~4,300 constraint assertions — verifying `OpenApiBuilder.build()` maps every declared constraint. The two specifications are ~17MB and are **not committed**; `stress:fetch` downloads them and the runner reports a skip if they are absent. Not part of `npm test`: it needs a network fetch and takes minutes. It found the schema-depth accounting defect fixed in 2.0.0. |

---

## 3. The Double-Entry Rule (`TestOracle.js`)

Per **Rule 7** in `AGENTS.md`, whenever a plugin, layout, policy condition, policy effect, validator, formatter, or parser is added to or modified in `DefaultPluginBootstrapper.ts` or `PipelineManager.ts`, you **must** simultaneously update `test/webapp/test/TestOracle.js`.

`TestOracle.js` exports seven dictionaries/lists:

1. **`PLUGIN_MAP`** (`52` entries): Maps every `"<type>:<widget>"` key (e.g., `"string:default"`, `"object:dictionaryMap"`, `"object:polymorphic"`, `"string:camera"`) to:
   - `modulePath`: Exact AMD path registered in `DefaultPluginBootstrapper.ts`.
   - `controlClass`: Exact UI5 control metadata name returned by `plugin.render(...).getMetadata().getName()`.
   - `sampleMeta`: Valid `IPropertyMetadata` used to instantiate the plugin in physical DOM tests.
   - `sampleValue` & `mutatedValue`: Initial and mutated test values bound via `JSONModel`.
   - `invalidMeta` & `invalidValue` *(optional)*: Schema and invalid value to prove visual error state (`ValueState.Error`).
2. **`LAYOUT_MAP`** (`4` entries): Maps `form`, `table`, `wizard`, and `compact` to their layout module paths.
3. **`POLICY_CONDITION_MAP`** (`6` entries): Maps `NumericGreaterThan`, `NumericLessThan`, `StringEquals`, `DateLessThan`, `IsNull`, and `IsNotNull` to their condition plugin module paths.
4. **`POLICY_EFFECT_MAP`** (`8` entries): Maps `Show`, `Hide`, `Validate`, `Invalidate`, `Require`, `Optional`, `Enable`, and `Disable` to their effect plugin module paths.
5. **`VALIDATOR_LIST`** (`14` entries): `required`, `minLength`, `maxLength`, `pattern`, `range`, `multipleOf`, `arrayItems`, `email`, `url`, `iban`, `enum`, `const`, `integer`, `objectProperties`.
6. **`FORMATTER_LIST`** (`4` entries): `date`, `phone`, `textCase`, `currency`.
7. **`PARSER_LIST`** (`3` entries): `date`, `phone`, `currency`.

The unit test `"Double-Entry Rule: PluginRegistry 100% matches TestOracle.PLUGIN_MAP, LAYOUT_MAP, and POLICY_MAPs"` in `test/webapp/test/unit/core/CoreArchitecture.qunit.js` compares the live `PluginRegistry` maps against `TestOracle.js` in both directions. If any entry is missing on either side, the test fails immediately.

---

## 4. Detailed Breakdown of QUnit Test Files

### A. `test/webapp/test/unit/core/CoreArchitecture.qunit.js`
- **Generic `Registry<T>` Contract**: Verifies `register`, `get`, `getStrict`, `has`, `getKeys`, `clear`, and `items`.
- **Double-Entry Verification**: Verifies 1:1 parity between `PluginRegistry` and `TestOracle` across all 52 `(type, widget)` control/action/datasource mappings, 4 layouts, 6 policy conditions, and 8 policy effects, and asynchronously resolves every registered module.
- **`SchemaNormalizer` & `DataInferenceBuilder`**: Verifies immutability (input schema is never mutated), idempotency (`normalize(normalize(s)) === normalize(s)`), Full Inference (strings, numbers, booleans, ISO dates, arrays), and Hybrid Inference (`additionalProperties: true`).
- **`SchemaValidator`, `PayloadValidator`, `StateManager`, `ExpressionBuilder`, `LayoutScorer`, `LayoutMutator`, `DefaultLayoutGenerator`**: Verifies structural schema validation, recursive payload validation, state sandboxing, UI5 expression binding compilation (`$root.` and relative paths), and inline-vs-dialog layout budget mutation.
- **`PolicyEngine`**: Evaluates all 6 condition operators (`StringEquals`, `NumericGreaterThan`, `NumericLessThan`, `DateLessThan`, `IsNull`, `IsNotNull`) and verifies the exact `IDeltaState` mutations emitted for `visibility`, `required`, `validity`, `errorMessage`, and `editable`.
- **`OpenApiBuilder` & `OpenApiExtractor`**: Verifies OpenAPI 3.0 target extraction, schema building, `format: "email"` mapping, and `ProtobufVariantHeuristic` variant conversion.

### B. `test/webapp/test/unit/plugins/PipelinePlugins.qunit.js`
- **All 14 `IValidator` Implementations**: Verifies every validator plugin in `TestOracle.VALIDATOR_LIST` with both valid and invalid inputs, plus polymorphic `extractRule(fieldMeta)` rule extraction via `GlobalPipeline.assembleAndExecute()`.
- **All 4 `IFormatter` and 3 `IParser` Implementations**: Verifies every formatter plugin in `TestOracle.FORMATTER_LIST` (`date`, `phone`, `textCase`, `currency`) via `PipelineManager.runFormatters()` and every presentational parser in `TestOracle.PARSER_LIST` (`date`, `phone`, `currency`) via `PipelineManager.runParsers()`.

### C. `test/webapp/test/unit/plugins/ControlPlugins.qunit.js`
- **Physical DOM Sandbox for All 52 Control, Action & Datasource Plugin Mappings**:
  - Loops over all 52 entries in `TestOracle.PLUGIN_MAP`.
  - Instantiates a fresh `JSONModel` with `sampleValue` and physically renders each plugin into a real DOM container (`#qunit-fixture`) alongside a companion `sap.m.Label` (`setAssociatedLabel`) using `plugin.render(...)` and `sap.ui.getCore().applyChanges()`.
  - Asserts that the rendered control exists in the physical DOM (`control.getDomRef()`) and matches `entry.controlClass`.
  - Mutates the model to `entry.mutatedValue` and verifies live data binding reactivity and validation.
  - Exercises `plugin.setState("visible", false/true)`, `plugin.setState("editable", false/true)`, `plugin.setState("required", true/false)` (verifying companion label synchronization), and `plugin.setState("valid", false, "Unit test error")` (verifying `ValueState.Error` or `ButtonType.Reject`).
  - Destroys the control, label, and model cleanly after each iteration.

### D. `test/webapp/test/integration/AllJourneys.js`
- **Binding Modes & Render Targets Matrix**:
  - Mounts `DynamicHost` into the physical DOM and tests:
    1. `string` binding mode (`dataJson` two-way JSON string binding + `triggerSubmit()`).
    2. `object` binding mode (`data` native JS object binding + `liveUpdate: true` continuous propagation + `liveUpdate: false` transactional isolation).
    3. `programmatic` mode (`setProperty` / `getProperty("outputData")` / `js_scratch` VBox mounting).
    4. `odata` mode (mocked OData V4 context with `requestObject()` / `setProperty()` via `ODataDelegate`).
    5. `dialog` / `js_dialog` mode (`host.openInDialog("Title", "Extract Payload", "Cancel")` verifying configurable `beginButton` text).
- **Runtime Toggles, Host Events & Custom Error API**:
  - Verifies runtime toggling of `editable`, `useMessageManager`, `debugMode` (`getDebugDomMetadata()`), `addCustomError` / `clearCustomError`, host events (`beforeSubmit` veto via `addError`, `validationError`, `validationSuccess`, `validationStateChanged`, `cancel`), inline `TableLayout` `minItems` validation, and repeated `generate()` / `destroy()` with fixed `engineScopeId`.
- **All 4 Layout Strategies**:
  - Physically renders `form`, `table`, `wizard` (custom step navigation Next/Back + `beforeLayoutSectionChange` veto), and `compact` layouts into the DOM.
- **All 11 Sandbox Mock Scenarios & OpenAPI Targets**:
  - Dynamically fetches `test/webapp/mockData/scenarios/index.json`, loads every scenario JSON (`kitchen_sink`, `inference_hybrid`, `inference_only`, `wizard`, `deep_structure`, `ultra_complex_structure`, `control_props`, `openapi_v2_complex`, `openapi_v3_complex`, `odata_v4`, `pbre_scenario`), exercises every selectable OpenAPI `schemaTarget` from `OpenApiExtractor.extractTargets()`, mounts each scenario in a `DynamicHost`, and verifies DOM rendering and payload extraction.

---

## 5. How `scripts/run-tests.js` Works

`scripts/run-tests.js` is a zero-configuration Node.js + Puppeteer test harness:
1. Executes the **Static Architectural Quality Gate** across all `.ts` files in `src/` (enforcing TypeScript AST rules: `0` `any`, `0` empty/comment-only `catch` blocks, `0` raw `console.*`, `<= 140` characters per executable code line, `@file` / `@description` headers, JSDoc on all exported classes/interfaces/functions and public/protected methods, plugin folder purity, and bidirectional `DefaultPluginBootstrapper` ↔ `TestOracle` parity) and runs the AST symbol-existence gate across `docs/wiki/*.md`, `README.md`, and `docs/ARCHITECTURE.md`.
2. Starts an embedded HTTP static file server on a random free localhost port:
   - Requests to `/resources/nz/co/siliconst/ui5/metaui/*` are served from `dist/resources/nz/co/siliconst/ui5/metaui/*`.
   - Requests to `/odata/v4/main/*` return mocked OData V4 `$metadata` and entity JSON for offline/headless testing.
   - All other requests are served from `test/webapp/*`.
3. Launches headless Chromium via `puppeteer`.
4. Navigates to `/test/unit/unitTests.qunit.html`, waits for QUnit completion, streams every `[PASS]` / `[FAIL]` test assertion to stdout, and fails on any QUnit failure or uncaught page error.
5. Navigates to `/test/integration/opaTests.qunit.html`, waits for QUnit completion, and asserts 0 failures and 0 page errors.
6. Navigates to `/index.html` and verifies the Fiori Sandbox routes (`#/`, `#/scenario/kitchen_sink`, `#/scenario/openapi`, `#/playpen`, `#/playground`, `#/odata`).
7. Navigates to `/standalone-consumer.html` and verifies standalone library consumption across all 38 widgets, 4 layouts, dependent dialogs, and optimal model sync.
8. Closes the browser and HTTP server and exits with code `0` (all passed) or `1` (any failure).
