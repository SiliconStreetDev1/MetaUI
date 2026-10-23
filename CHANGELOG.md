# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Removed — BREAKING

- **The `scanner` widget and `BarcodeScannerPlugin` are withdrawn.** `(type, widget)` mappings
  go from 52 to 51. A schema that still sets `ui.widget: "scanner"` on a `string` falls back to
  the default string plugin and renders a plain `sap.m.Input`; the value is unaffected.

  It was the library's only consumer of `sap.ndc`, which ships with SAPUI5 but **not** with
  OpenUI5. Removing it means MetaUI now has no SAPUI5-only dependency at all: every declared
  dependency — eager `sap.ui.core`, `sap.m`, `sap.ui.layout`, lazy `sap.ui.unified` and
  `sap.ui.codeeditor` — ships with both distributions.

### Fixed — a field that failed to generate reported the form valid

A field whose plugin could not be resolved rendered an `[Error generating field <path>]`
placeholder and raised the partial-render banner, and then the form reported `isValid: true`
and `triggerSubmit()` returned `true`. A **required** field that had visibly failed to draw was
submitted with no value, with no error anywhere. Measured in a browser across all three routes
— module 404, a module exporting no constructor, and a `render()` that throws before
`initialize()` — all three now report invalid and block submission, while per-field degradation
is unchanged: the placeholder, the banner and the sibling fields all still behave as before.

`Engine` now records a structural failure from its `catch` and `ValidationLedger` consults it.
The record is deliberately not a three-tier ledger entry: a data hot-swap does not repair a
plugin module that would not load, so it survives `clear()` and is discarded only when the form
is regenerated. `BasePlugin.validate()` was separately asymmetric — it failed closed for a
missing control but open for missing metadata, contradicting its own JSDoc — and now fails
closed on both arms.

### Fixed — catastrophic backtracking in `pattern`

Two further classes of ReDoS are now refused before execution, both found by measurement rather
than inspection:

- **Redundant grouping** smuggled exponential patterns past the screen. `^((a+))+$` (3015 ms),
  `^(?:(a+))+$` (2594 ms), `^(((a+)))+$` (3804 ms) and `^((a*))*$` (5320 ms) were all accepted.
- **Sequential overlapping quantifiers** were polynomial and uncapped: `^.*.*.*.*.*x$` took
  **13.9 s** on a 200-character value, and because the quarantine is keyed per pattern, changing
  one character bought a fresh stall. Now 0.10 ms, refused.

The screen counts the search space of an overlapping run rather than counting quantifiers, and
decides token disjointness with the regex engine itself over an alphabet derived per pattern —
which closed a further hole where two Cyrillic ranges overlapped outside ASCII (90.6 ms,
accepted, now refused). Checked against a 97-pattern corpus drawn from this repository: 7 newly
refused, all of them the bypass shapes above, and **no legitimate pattern lost**.

### Fixed — large tables truncated silently, then painted slowly

A generated table bound only the first 100 rows of its collection and said nothing; rows past
that were in the payload, submitted, and invisible. The sandbox model now sizes its list binding
to the data, and the generated table pages with an explicit `More (100/1000)` trigger rather
than drawing everything at once. Measured at 1000 rows × 15 columns: **6359 ms → 487 ms** first
paint with all 1000 reachable. Add Row grew the table to cover a row appended past the current
page, and is incidentally faster than before this change at every size.

### Fixed — an inlined `$ref` discarded the referencing node's own `ui` block

`{ "$ref": "#/definitions/X", "ui": { "readOnly": true } }` lost `readOnly`, `enabled`,
`dialogButtonText` and `layoutBudget` when the reference was inlined. For an object `$ref` the
read-only cascade happened to restore `readOnly` afterwards, which is why it went unnoticed; for
an **array** `$ref` there is no `properties` for the cascade to walk, so a collection the schema
declares read-only rendered fully add/edit/delete-able. `readOnly` is now a union of the node's
and the definition's, in both directions.

### Added — structural gates (`npm run lint`)

Nine machine-checked gates in `scripts/run-tests.js`, each proven to fire against the exact
divergence it exists to catch by `scripts/prove-structural-gates.js` (19 injected divergences,
19 caught, tree restored green):

- `[PRODUCER_COMPLETENESS]` — every member of `IPropertyMetadata` and `IUIDirective` must be
  written by each known producer or named in that producer's commented `DECLINED_SCHEMA_FIELDS`
  set with a justification. Adding a field to `ISchema.ts` now fails the build until all three
  producers take a position on it.
- `[DEPTH_CONSTANT]` — no numeric literal in a depth comparison, no `MAX_*_DEPTH` declared
  outside `constants/MetaUIConstants.ts`, and `MAX_SCHEMA_DEPTH` may not drop below
  `MAX_LAYOUT_DEPTH`. A test may read the cap but never restate it.
- `[REF_RESOLVER]` — no hand-rolled `$ref` parsing outside `OpenApiRefResolver`.
- `[LAYOUT_STRATEGY_DEFAULT]` — the array-to-table / object-to-form default lives only in
  `DefaultLayoutGenerator.resolveLayoutStrategy`.
- `[SCHEMA_CONSTANT]` — a string compared against `ui.renderMode`, `layoutStrategy` or
  `ui.widget` must come from `MetaUIConstants`, including when the field is hoisted into a local.
- `[DATA_WRITER]` — the committed `data` / `dataJson` pair is written only by
  `DataSyncDelegate.commitDataPair` / `invalidateStaleDataJson`.
- `[CATCH_SIGNAL]` — a caught failure must log, rethrow or fire; otherwise it needs a counted
  `// CATCH_EXEMPT:` justification. 13 exemptions are recorded and reported in the tally.
- `[DEPTH_SIGNAL]` — a depth guard must name the limit and what it discarded.
- `[RENDER_DEGRADATION]` — a layout catch must set `engine.hasPartialRenderingErrors` so the
  partial-render banner appears.

### Changed

- **One recursion cap.** `MAX_SCHEMA_DEPTH` already existed but only `LayoutScorer` used it;
  twelve other walkers kept private caps for the same concept (`8, 8, 8, 8, 8, 10, 10, 10, 10,
  10, 16, 16`). All twelve now import it. The value stays at **30**, matching `MAX_LAYOUT_DEPTH`:
  a schema walker capped below the layout tree that renders it would truncate fields the layout
  could still draw. `MAX_LAYOUT_DEPTH` and `MAX_CLONE_DEPTH` moved into the same file and remain
  deliberately separate concepts.
- Ten depth guards that truncated in silence now log the limit and what was lost — including
  `PayloadValidator.validateTree` (which reported `isValid: true` for subtrees it had not
  validated), `PayloadValidator.assertsContainerConstraint` (which silently skipped enforcement
  of a whole subtree), `SchemaNormalizer.stripWriteOnlyNode` (which left `writeOnly` fields in
  the outbound payload) and `deepClone` (which replaced the consumer's payload with `{}`).
- Five layout-level catches now raise `engine.hasPartialRenderingErrors`, so a field that fails
  to render no longer leaves the form reporting itself complete.
- The two recursion-limit unit tests now read `MAX_SCHEMA_DEPTH` instead of restating it.

### Fixed

- `OpenApiPropertyMapper` dropped a `uiLayout` block authored inside an OpenAPI property schema,
  so the layout vanished for OpenAPI sources while surviving for JSON Schema.
- `DataSyncDelegate.injectSchemaDefaults` (×2) and `ReferencePlugin` (×2) parsed `$ref` pointers
  with `split("/").pop()`, which mis-reads RFC 6901 escapes (`#/definitions/Order~1Item`) and
  resolves a foreign document's pointer against the local definitions dictionary. All four now
  call `OpenApiRefResolver.extractRefName`.
- `SchemaResolutionDelegate` carried a third, divergent copy of the `data`/`dataJson` write rule
  that bypassed the `invalidateStaleDataJson` helper extracted to prevent exactly that; it now
  calls `DataSyncDelegate.commitDataPair`.
- `PluginRegistry.getPathsToLoad` re-derived the layout-strategy default inline, so the
  lazy-loader could preload one strategy's module while `Engine` rendered another.
- `LayoutElementWalker` compared `ui.renderMode` against the literal `"dialog"` while fourteen
  other sites used `RENDER_MODE.DIALOG`.
- `EmailValidatorPlugin` compared a widget against the literal `"email"` instead of
  `WIDGET_TYPE.EMAIL`, so renaming the constant would have silently stopped the email validator
  from activating.

---

## [2.0.0] — 2026-10-23

A correctness and quality release. Three behavioural changes require action when
upgrading — please read **Breaking Changes** before updating.

### ⚠️ Breaking Changes

#### 1. Formatted fields now store the raw value, not the formatted text

`phone`, `currency` and `date` are now **presentational** formatters. They format
for display only; the data model keeps the underlying value.

```js
// Schema: { "type": "string", "ui": { "formatter": "phone" } }
// User sees: (555) 123-4567

host.getProperty("outputData").Mobile;
// 1.x -> "(555) 123-4567"   (formatted text was written into the model)
// 2.0 -> "5551234567"       (raw value; the control still displays the mask)
```

This fixes a defect where any field combining a formatter with a constraint
(`pattern`, `maxLength`, a numeric `type`) could never validate, because validation
ran against the formatted string.

**Migration:** if you consumed formatted text from `outputData`, `dataJson` or the
`submit` payload, apply the formatter at the point of display instead. `textCase`
is unchanged — it is a *transforming* formatter and its output is still stored,
because the transformation is lossy and is the intended data.

#### 2. Policy conditions now fail closed

A `uiPolicies` condition with a malformed payload previously evaluated to `true`
and fired its effect. It now evaluates to `false` and logs a warning.

```json
{ "effect": "Hide", "targets": ["/Secret"], "condition": { "StringEquals": "Admin" } }
```

The payload above is a bare string where a record (`{"/Role": "Admin"}`) is required.
In 1.x this hid the field unconditionally; in 2.0 it does not fire, and warns.

**Migration:** check your console for `[MetaUI PolicyEngine]` warnings after
upgrading. A policy that silently "worked" may have been malformed all along.

#### 3. Default host height is now `auto`

`DynamicHost` previously rendered with a hardcoded `height: 100%`. It now defaults
to `height: auto` and is containment-safe (`min-width: 0`, `max-width: 100%`,
`box-sizing: border-box`), so it no longer forces its container wider than the
space available — important when embedding in a table column.

**Migration:** if you relied on the host filling a fixed-height parent, set it
explicitly: `<meta:DynamicHost height="100%" />`.

#### 4. The schema is now treated as untrusted input

A security audit proved two working client-side XSS vectors, a data-exfiltration
path and a browser denial of service, all reachable from a schema alone. The
library now defends against a hostile schema. That is a deliberate change of
posture, and it narrows what a schema may do. See
[Security Posture & Trust Model](docs/wiki/SupportedFeatures.md) for the full
contract and the residual exposures.

What stops working:

- **`ui.controlProps` is gated by a type allowlist, not a name denylist.** Only
  properties the control actually declares, whose UI5 type resolves to a scalar
  primitive, are written — and they are written through the control's generated
  setter rather than `setProperty`, which was bypassing UI5's own sanitization.
  `htmlText`, `html`, `innerHTML` and `content` are refused outright; `href`,
  `src` and other URI-typed properties are routed through `UrlValidator`,
  including when bound.
- **`ui.visibleOn` / `ui.enabledOn` accept model paths and `{= … }` expressions
  only.** UI5 complex-binding object syntax (`{path:'…', formatter:'…'}`) is
  refused, because a named formatter was being resolved against globals and
  invoked with live form data. OData key predicates remain fully supported, both
  standalone and inside an expression binding.
- **Validator `pattern` is capped at 512 characters**, and provably ambiguous
  repetition shapes (`(a+)+`, `(a?)*`, `(a|a)+`) are refused with a schema
  configuration error. A pattern that cannot be proven safe still runs, under a
  time budget. One measured example took 2.5 seconds on 28 characters of input.
- **`ui.dataSource.url` must be `http:` or `https:`.** Cross-origin requests are
  still allowed by default, with a one-time warning naming the origin; lock them
  down with `UrlValidator.setDataSourceOriginPolicy("same-origin")` or
  `("allowlist", [...])`.

**Migration:** check the console for `REFUSED` warnings after upgrading. Every
refusal names the directive and the reason. A schema that relied on raw markup
through `controlProps` should bind the field value instead; one that relied on a
named formatter in `visibleOn` should use a `{= … }` expression.

#### 5. Validation now fails closed

Four paths that previously let a field pass validation now fail it. Each was a way
for an invalid form to report itself valid and submit.

- **A plugin whose `validate()` throws** now makes the form invalid and blocks
  `triggerSubmit()`. Previously the crash was logged and the field skipped, so the
  form submitted as though the field were fine.
- **A validator named in `ui.validators` that is not registered** now fails the
  field with a schema-configuration error. Previously it logged a warning and the
  field passed — so a typo silently disabled validation. **This is the change most
  likely to surface a latent typo in an existing schema.**
- **A field whose `render()` threw** now reports invalid instead of reporting valid
  forever. A form with partial rendering errors will now say so. Expect previously
  "valid" forms to start reporting `isValid: false` — that is the point.
- **`minLength`, `maxLength` and `arrayItems` with malformed arguments** now fail
  the field rather than passing it, matching `pattern`'s existing behaviour.

**Migration:** if a form that previously submitted now reports invalid, the
validation was never running. Check the console for `Schema configuration error`.

#### 6. A policy whose condition cannot be evaluated applies nothing

A `uiPolicies` condition with an unrecognised operator, a malformed condition block,
or a plugin that throws now applies **no UI state at all**. Previously it resolved
to `false` — and for a `Show` policy that meant the target was hidden *and its value
deleted from the submit payload*. A single-character typo in an operator name
silently dropped the user's data, with only a console warning.

These are now logged at `error`, matching the severity already used for an
unrecognised effect. `IDeltaState` gains an optional `degraded?: boolean`; anyone
applying deltas themselves must not prune on a degraded one.

**Migration:** a field that was being hidden by a misspelled operator will now be
visible. That is the correct behaviour, but it is a visible change.

#### 7. `precision`, `scale` and `deprecated` are removed from `IPropertyMetadata`

All three were populated by the normalizer and the OpenAPI mapper and then read by
nothing. `precision` and `scale` are not JSON Schema keywords at all — they are
OData conventions — and `docs/wiki/SupportedFeatures.md` incorrectly claimed
`RangeValidatorPlugin` consumed them. It reads only `minimum`, `maximum`,
`exclusiveMinimum` and `exclusiveMaximum`.

**Migration:** use `multipleOf` to constrain decimal places — unlike `scale`, it is
actually enforced. If you read any of these three off a normalized schema, they are
gone from the type; the raw values are still in your own schema document.

#### 8. `not` is enforced, and `writeOnly` no longer round-trips

`not` is standard JSON Schema. It was parsed, normalized and carried through the
entire pipeline, and then validated as though the constraint were absent — so a
schema declaring it got no enforcement and no warning. `PayloadValidator` now
rejects a value matching the sub-schema, in forms and in table cells alike, and a
`not` declaring nothing the engine can evaluate is reported by `SchemaValidator`
instead of being silently honoured.

`writeOnly` now suppresses the read rather than the write: a value arriving in the
inbound payload is stripped before the sandbox is seeded, so it is never rendered
and never echoed back, while a value the user types is kept and submitted. That is
the behaviour the keyword exists for — a password being set.

**Migration:** a schema using `not` that previously submitted may now be rejected.
That is the constraint working for the first time.

#### 9. `allOf` composition now intersects instead of overwriting

`deepMergeSchemas` ended in an assignment, which gave override semantics to every
keyword without an explicit intersection rule — so composing two branches could
admit values that either branch alone rejected, silently, and the result depended
on branch order.

Now intersected: `multipleOf` (by least common multiple), `uniqueItems` (logical
or), `additionalProperties` (`false` wins), contradictory `const` (reported, and
published as an empty `enum`), and mixed draft-4/draft-6 exclusive bounds — a
boolean `exclusiveMaximum: false` can no longer delete a sibling's numeric bound.
Any pair that cannot be reconciled exactly is logged rather than silently widened.

#### 10. Read-only forms keep navigation affordances reachable

Read-only now constrains *editing*, not *reaching*. Nested-dialog "View …"
buttons, `string:link` and `string:urlButton` stay clickable when the host is not
editable — previously a read-only form rendered a greyed-out hyperlink and made
nested payloads unreachable. Mutating actions (submit, clear) remain disabled.
`codeEditor` also now renders a read-only editor in display mode instead of
collapsing multi-line code into a single `sap.m.Text` line.

#### 6. `ILayoutWalkerSink.onHorizontalControls` receives resolved controls

The callback now takes `IResolvedLayoutControl[]` instead of `ILayoutElement[]`,
matching its sibling callbacks. Only affects a custom layout implementing this
sink; the alternative resolved every scope twice and logged every error twice.

### Added

- `width` and `height` properties (`sap.ui.core.CSSSize`) on `DynamicHost` and
  `GeneratorHost`. Defaults: `"100%"` and `"auto"`.
- Root-level `ui.labelSpan` directive for compact rendering in narrow
  containers such as table columns, plus per-breakpoint overrides via
  `ui.controlProps` (`labelSpanXL`, `labelSpanL`, `labelSpanM`, `labelSpanS`).
  A value of `1`–`12` places the label beside the field; `0` suppresses the
  label entirely for cells that rely on column headers. Purely additive — with
  neither set, the spans remain `4` / `4` / `4` / `12` and existing forms
  render unchanged.
- Parser stage: `IParser` with `runParsers()`, and registered parsers for `phone`,
  `currency` and `date`. Custom formatters may implement `parse()` to declare
  themselves presentational.
- A **Requirements** section in the README: MetaUI depends on `sap.ndc` and so
  requires SAPUI5, not OpenUI5. Bootstrapping against OpenUI5 fails while
  resolving `sap/ndc/library.js`.
- [`docs/wiki/SupportedFeatures.md`](docs/wiki/SupportedFeatures.md) — complete
  capability inventory, including a Known Limitations section.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — architecture reference.
- [`CONTRIBUTING.md`](CONTRIBUTING.md) and a root `AGENTS.md` carrying the
  engineering rules.
- `npm run metrics` — read-only canonical project counts.
- `npm run lint` — TypeScript AST lint gate over `src/`, `scripts/` and tests.
- `npm run gen:accessors` — regenerates the typed control accessors below.
- **Typed property and event accessors in the published TypeScript types.**
  `host.getEditable()`, `host.setHeight("20rem")` and
  `host.attachFieldChange(e => e.getParameters().fieldPath)` are now checked.
  Previously only constructor settings were typed and every accessor was
  missing. Generated from each control's UI5 metadata by
  `npm run gen:accessors` and merged into the class, with `npm run lint`
  failing if the generated block drifts from the metadata.
- `npm run stress:fetch` / `npm run stress` — opt-in OpenAPI stress routine that
  crawls the real Kubernetes and GitHub API descriptions (1,827 definitions,
  ~4,300 constraint assertions). The specifications are ~17MB and are fetched on
  demand rather than committed.

### Fixed

- **Full Inference crashed on cyclic data.** `DataInferenceBuilder` had no recursion
  guard; a parent back-reference caused a stack overflow. Now cycle- and depth-guarded.
- **`allOf` merge loosened constraints instead of intersecting them.** `maxLength`
  10 merged with 50 produced 50; `enum` arrays were unioned rather than intersected,
  offering values the spec forbids. The merge is now keyword-aware.
- **OpenAPI version detection diverged** between the parser factory and the target
  extractor, so a spec declaring `"2.0.0"` was routed to the OpenAPI 3 parser and
  rendered a blank form. Detection is now unified.
- **OData V4 `setProperty` rejections were swallowed**, so a failed PATCH left the
  field showing a value the backend never received. Failures now surface.
- **An unresolvable `uiLayout` scope silently dropped the field** while the form
  still reported `isValid: true`. It now flags a partial-rendering error.
- **RFC 6901 JSON Pointer escaping** (`~0`, `~1`) and percent-encoding are handled
  in `$ref` resolution.
- **OpenAPI schemas nested more than four levels deep were silently corrupted.**
  `OpenApiPropertyMapper.mapProperties` and `mapPropertyMetadata` are the two
  halves of a single nesting level, but both incremented the recursion counter,
  so `MAX_MAPPING_DEPTH = 8` actually bit at 4. A `{"type": "string",
  "nullable": true, "maxLength": 7}` leaf five levels down became
  `{"type": "object"}` with every constraint discarded, and anything deeper
  vanished from the form entirely — with no warning. Depth is now counted once
  per level, so all eight documented levels are usable, and truncation beyond
  the limit logs a warning instead of failing silently. Found by crawling the
  real GitHub REST OpenAPI 3.0 description (965 schemas).
- **`schema.title` rendered twice** (three times via `openInDialog`) for any
  schema with a title and no explicit `uiLayout` — the most common case, and
  the one every quickstart example uses. `FormLayout` passed the title to
  `SimpleForm` while `DefaultLayoutGenerator` also labelled its synthesized
  wrapper group with the same string.
- **The published package declared a `types` path that did not exist in the
  tarball**, so TypeScript consumers resolved no types. The generated
  `index.d.ts` roll-up is now shipped, and its references are repointed to the
  published layout and verified at pack time.
- **Shipped declarations could not be compiled with `skipLibCheck` disabled.**
  Every `.d.ts` wraps its contents in `declare module`, and a relative import
  inside an ambient module is invalid TypeScript. Five such specifiers survived
  the build and produced 11 errors in consumer projects, including a spurious
  "`INestedEditorLaunchOptions` is declared locally but not exported" caused by
  an `export *` that could not resolve. They are now rewritten at pack time and
  the build fails if any remain.
- **The tarball contained no `LICENSE`** despite `package.json` declaring
  `"license": "MIT"`. npm only auto-includes `LICENSE` from the package root,
  and the publish step copied in only the README. `LICENSE` and `CHANGELOG.md`
  are now both shipped, and the build fails if either is missing.
- Ten documentation inaccuracies, including two references to interfaces
  (`IValidatorPlugin`, `IFormatterPlugin`) that do not exist — the real names are
  `IValidator` and `IFormatter`.

### Changed

- Plugin tree reduced from 8,256 to 6,739 lines with no loss of capability. New
  `PickerPlugin`, `TextLikeInputPlugin`, `HardwareControlPlugin` and
  `NestedDialogPlugin` base classes; the four policy effect plugins collapsed into
  a single `BinaryEffectPlugin`.
- The four layout strategies now share one `LayoutElementWalker` instead of each
  hand-rolling its own `uiLayout` traversal.
- CI runs lint, typecheck, build and test (previously build only).

### Internal

- Test suite grew from 1,080 to 1,810 assertions. All 52 `(type, widget)` mappings
  are now verified in display mode, as cloned table-row cells, and through a
  `dataJson` round-trip.
- **`puppeteer` was required by the test runner but never declared as a
  dependency.** `npm ci` on a clean checkout produced a tree in which `npm test`
  could not start — which is exactly what CI does. Now declared.
- **Four gates that could not fail were repaired or removed:** a lint exemption
  that still reported "0 exemptions"; a documentation gate pointing at a deleted
  file, which skipped silently; a line-citation gate that only checked line
  counts, so every citation could be wrong and still pass; and a table
  containment assertion that forced `display: grid` on the parent before
  asserting containment, which made the result independent of the code under
  test.
- The 17MB of real-world OpenAPI specifications are no longer committed; the
  stress routine fetches them on demand.
- Engineering rules reduced from 31 to 9, each tagged with how it is enforced.

---

## [1.4.51] and earlier

Changes prior to 2.0.0 were not tracked in a changelog. See the
[commit history](https://github.com/SiliconStreetDev1/MetaUI/commits/main).
