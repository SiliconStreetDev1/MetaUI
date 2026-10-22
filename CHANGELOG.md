# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
  test. The containment assertion now fails when the fix is removed.
- The 17MB of real-world OpenAPI specifications are no longer committed; the
  stress routine fetches them on demand.
- Engineering rules reduced from 31 to 9, each tagged with how it is enforced.

---

## [1.4.51] and earlier

Changes prior to 2.0.0 were not tracked in a changelog. See the
[commit history](https://github.com/SiliconStreetDev1/MetaUI/commits/main).
