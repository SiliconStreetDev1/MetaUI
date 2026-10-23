# Contributing to MetaUI

Thanks for your interest in MetaUI. This document covers how to build it, how to
verify a change, and how the repository is laid out.

- Architecture and design invariants: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- Capability inventory and known limitations: [`docs/wiki/SupportedFeatures.md`](docs/wiki/SupportedFeatures.md)
- Full documentation: [`docs/wiki/Home.md`](docs/wiki/Home.md)
- Engineering rules (also read by AI coding agents): [`AGENTS.md`](AGENTS.md)

---

## Prerequisites

- **Node.js** 22.14.0 or later
- **npm** 11.5.1 or later

MetaUI is a UI5 custom library. It declares `sap.ui.core`, `sap.m` and
`sap.ui.layout` as eager UI5 library dependencies, plus `sap.ui.unified` and
`sap.ui.codeeditor` as lazy ones.

> **It runs on OpenUI5 and on SAPUI5.** Every declared dependency ships with
> both distributions, so there is no SAPUI5-only requirement. Verified on
> OpenUI5 1.120.50.

```bash
git clone https://github.com/SiliconStreetDev1/MetaUI.git
cd MetaUI
npm install
```

## Verification loop

Run these before opening a pull request. All five must pass.

```bash
npm run metrics      # read-only canonical counts (files, lines, registrations, assertions)
npm run lint         # AST lint + architectural gate -> 0 violations; exemptions are counted and reported
npm run typecheck    # tsc --noEmit -p .              -> 0 errors
npm run build        # ui5 build --clean-dest         -> dist/
npm test             # full suite in headless Chromium
```

`package.json` defines `"pretest": "npm run build"`, so `npm test` rebuilds
`dist/` automatically — the suite serves the library from `dist/`, never from
`src/`, so a stale build would otherwise be tested silently.

**Never quote a count from memory or from a document.** Take it from
`npm run metrics`, which is reconciled against the live test run on every
`npm test` and fails the build if the two disagree.

### What `npm test` runs

1. **Static AST lint and architectural gate** over `src/` plus the `scripts/` and
   `test/` JavaScript — no `any`, no raw `console.*`, no empty `catch`, max line
   length, required JSDoc, and registry ↔ oracle parity.
2. **QUnit unit tests** — the `Registry<T>` contract, schema normalization purity
   and idempotency, inference, validators and formatters, the policy engine, the
   OpenAPI builder, and every registered plugin mounted into a physical DOM
   sandbox in both editable and display mode, as cloned table-row cells, and
   through a `dataJson` round-trip.
3. **QUnit integration and E2E matrix** — every mock scenario, all binding modes,
   all render targets, policy and wizard journeys, and host lifecycle.
4. **Fiori sandbox app verification** — boots `test/webapp/index.html` and walks
   its routes, failing on any console, page or network error.
5. **Standalone consumer page** — loads the compiled library the way an external
   application would, asserting real DOM geometry for every widget and layout.

## The Double-Entry rule

`test/webapp/test/TestOracle.js` is the ground-truth mirror of the plugin
registry. Whenever you add or change a plugin, layout, policy condition, policy
effect, validator, formatter or parser in `DefaultPluginBootstrapper.ts` or
`PipelineManager.ts`, update `TestOracle.js` in the same change. The parity gate
fails otherwise — and if it fails, the gate is usually right.

## Repository map

| Path | Purpose |
| :--- | :--- |
| `src/.../core/` | `Engine`, `ValidationLedger`, `PayloadValidator`, `StateManager`, `SandboxJSONModel`, `PolicyEngine`, `PipelineManager`, `SchemaNormalizer`, `DataInferenceBuilder`, `PluginRegistry`, `DefaultPluginBootstrapper`, `LayoutScorer`, `LayoutMutator` |
| `src/.../controls/` | `DynamicHost.ts` (public facade) and the custom hardware controls |
| `src/.../controls/host/` | `GeneratorHost`, `HostControlMetadata`, and the `delegates/` that own generation, validation, policy, dialogs, data sync and OData |
| `src/.../plugins/controls/` | `BasePlugin` plus the `PickerPlugin`, `TextLikeInputPlugin`, `NestedDialogPlugin` and `HardwareControlPlugin` bases, and the concrete field plugins |
| `src/.../plugins/{actions,datasources,validators,formatters,policies}/` | The remaining plugin categories |
| `src/.../layouts/` | The four layout strategies plus the shared `LayoutElementWalker` |
| `src/.../openapi/` & `swagger/` | OpenAPI 2.0/3.0 ingestion and target extraction |
| `src/.../utils/` | `TypeGuards`, `Logger`, `ExpressionBuilder`, `ControlDirectiveUtil`, `UrlValidator` |
| `test/webapp/test/` | `TestOracle.js`, the unit suite and the E2E suite |
| `scripts/run-tests.js` | Lint gate, metrics and the headless Puppeteer runner |

Exact file and registration counts come from `npm run metrics`.

## Pull requests

- Keep changes focused; prefer several small pull requests over one large one.
- Add or update tests for behavioural changes. A test that cannot fail is worse
  than no test — if you add one, be able to say which bug it would catch.
- Update the documentation in the same change. The lint gate verifies that every
  symbol cited in `README.md`, `docs/ARCHITECTURE.md` and `docs/wiki/*.md` exists
  in `src/`, so a stale class or interface name fails the build.
- Record user-visible changes in [`CHANGELOG.md`](CHANGELOG.md), and call out
  anything breaking.
- Say what you skipped. An unreported gap is the one that reaches production.

## Reporting issues

Please include the MetaUI version, your SAPUI5 version, a minimal JSON Schema
that reproduces the problem, and what you expected instead. A schema is usually
enough to reproduce a rendering or validation bug exactly.
