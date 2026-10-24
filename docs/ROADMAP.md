# Roadmap

Where this library is going, what it is deliberately not doing, and why. Written after the
2.0.0 release and the architectural consolidation that followed it.

This is a direction document, not a commitment. Dates are absent on purpose.

---

## How to read this

MetaUI exists to render a UI at **runtime** from whatever description of the data is available —
JSON Schema, OpenAPI, OData metadata, or nothing but the payload itself. Everything below is
weighed against that one sentence. A feature that only helps when the shape is known at design
time belongs in Fiori Elements or a hand-written view, not here.

Three constraints bound every item on this list:

1. **I/O stays narrow, declared, and policed.** The library does fetch, in exactly five places:
   the three datasource plugins that populate a field from a REST endpoint (`LiveSearchPlugin`,
   `RemoteDropdownPlugin`, `RemoteValueHelpPlugin`), plus `SchemaProvider` and `OpenApiBuilder`
   loading a schema or spec by URL. Every one of those goes through `UrlValidator` and its
   origin policy. Nothing else reaches the network, nothing persists, nothing authenticates.
   New external access should prefer a consumer-supplied resolver callback over a new fetch —
   that is what keeps the published package free of runtime dependencies and the attack surface
   enumerable.
2. **New shared behaviour gets a gate.** Six separate audits of this codebase each found the same
   defect shape — a rule implemented in one place and missing in its twin. Ten structural gates
   now prevent that, each with an executable proof. Anything added here that creates a new
   shared rule needs an eleventh.
3. **Scope is the standing risk.** The engine is a sensible size; the plugin surface is wide but
   shallow and cheap to own. What is expensive is *another subsystem beside* core, utils and
   layouts. Prefer a plugin over a subsystem, and a consumer callback over either.

---

## Near term — OpenAPI as a request-building source

The OpenAPI layer was built to normalise a spec into a renderable schema. Using it to build
**API requests** — the natural fit for client and testing tooling — needs four things it does not
yet do.

### 1. External `$ref` must be visible, and resolvable by the consumer

Today `OpenApiRefResolver` drops any `$ref` that is not a local JSON pointer, returning `null` and
logging at `debug` — which UI5's default `ERROR` log level discards before buffering. Multi-file
specs are the norm in enterprise OpenAPI, so a consumer importing a real document gets a form
silently missing its fields and no indication why.

This is the fail-silent class the rest of the library has eliminated. Two parts:

- **Report unresolved references as structured data**, not a log line, so a consumer can show
  *"this spec references `./schemas/Order.yaml`"* and act on it.
- **Accept a resolver hook** — `resolveExternalRef?: (url: string) => Promise<JsonRecord | undefined>`.
  The library asks; the consumer fetches. The pattern already exists as `resolveRef` on
  `SchemaWalker`.

### 2. `OpenApiExtractor.extractTargets` returns too little

`{ key, text }` cannot render an endpoint browser. An operation picker needs the HTTP method, the
path, `operationId`, the summary, the deprecated flag, and tags for grouping. Widening the return
type is additive.

### 3. Parameters deserve first-class treatment

Path, query and header parameters are half of an API request and currently get minimal handling
next to `requestBody`. They are schemas like any other and should render through the same
machinery — most naturally as a separate host alongside the body.

### 4. Spec `examples` as default values

Not read at all today. It is the cheapest large improvement available: an operation form that
arrives pre-filled with the spec author's example rather than empty.

**Explicitly out of scope:** security schemes and authentication. Those are the consumer's
concern, and pulling them in would widen the library past rendering.

---

## Known limitations worth fixing

**Heterogeneous arrays.** `DataInferenceBuilder` types a column from the **first row**. An array
whose objects differ — optional fields, varying types, polymorphic entries — infers from row one
and mistypes the rest. Low impact for hand-authored forms, high impact for arbitrary API
responses, which are messy in exactly that way.

**Deep payloads.** `MAX_SCHEMA_DEPTH` is <!-- DOC_COUNT:maxSchemaDepth -->30. Anything deeper truncates — loudly, with a logged
warning naming the scope, but it truncates. Fine for forms; worth knowing before rendering an
arbitrary deeply-nested response.

**Large responses are unbenchmarked in the shape that matters.** The benchmark suite covers wide
data (1,000-row tables, now paged). It does not cover *deep* data. Those are different costs.

**Keyboard and screen-reader accessibility.** axe-core runs in CI with zero blocking violations,
but axe is static analysis. There are **no keyboard-interaction assertions** — nothing verifies
tab order through a generated form, that Escape closes a dialog, or where focus lands after a row
is deleted. This is the largest closeable gap in the test suite and would be the first thing an
accessibility audit found.

**Documentation drift is now guarded in both directions.** `[DOC_SYMBOL]` checks both that symbols cited in `docs/` exist in `src/` and that new exported modules and API members in `src/` are mentioned in `docs/` (or named in `UNDOCUMENTED_SYMBOL_ALLOWLIST` with a reason), alongside `[DOC_COUNT]`, `[DOC_CODE]` and `[DOC_MEASURE]`.

---

## Quality backlog

Ordered by value, not effort. Several may be complete by the time you read this.

- **Mutation coverage on the weakest modules.** `stryker.conf.json` targets 35 files (12 explicit modules plus the `openapi/parsers/*.ts`, `plugins/formatters/*.ts` and `plugins/validators/*.ts` globs). `PatternValidatorPlugin` is the weakest module in the mutate set — its regex parser, quantifier search-space screen and probe-alphabet builder carry many boundary branches — followed by `OpenApiConstraintMapper` and `SafeConvert`, whereas `RangeValidatorPlugin`, `RequiredValidatorPlugin` and `SchemaWalker` sit at the top of the distribution. Run `npm run mutate` (or `npm run mutate -- --mutate "<path>"`) to measure current figures.
- **Bundle split.** One `library-preload.js` of roughly <!-- DOC_MEASURE:bundlePreloadKB tolerance=5% source=npm-run-build -->408 KB (measure the current build with `npm run build`) ships everything, so a consumer
  using forms and tables still downloads the policy engine, OpenAPI ingestion and the hardware
  controls. `ui5.yaml` `builder.bundles` is the lever. **Measure before and after** — splitting
  badly turns one request into many and makes first render slower.
- **The `-dbg.js` payload.** Roughly three quarters of the unpacked package is readable debug
  copies, loaded only with `sap-ui-debug=true`. Keeping them lets a consumer step through MetaUI
  inside their own app. Dropping them nearly quarters the package. A deliberate decision, not a
  default.
- **`ControlDirectiveUtil`** is smaller since the accessibility extraction but still well above
  the median file size. Split further only if it starts costing something.

---

## Deliberately not doing

This section exists because the standing risk to this project is scope, not quality.

**SAP draft.** Draft entities, locking, activate/discard, cross-session persistence of incomplete
work. It is a large subsystem solving a problem most consumers do not have, and the natural
client-side alternative — hold state locally, submit once — is what this library already does.
Any app that genuinely needs draft wants Fiori Elements.

**A general HTTP layer, persistence, or authentication.** The five existing fetches are narrow
and specific — a field populating its own options, or a schema loaded by URL — and each is
policed by `UrlValidator`. That is the ceiling, not a foundation to build on. Request
orchestration, retries, caching, token handling and credential storage belong to the consumer.

**A second rendering target.** The engine's architecture would port to plain DOM, and for some
environments that would be a better fit. It would also be a second product. Not here.

**A plugin marketplace, a theme system, or a visual designer.** Each is a reasonable idea and each
would double the maintenance surface.

**Promoting internals to the public API without a reason.** The public tier is <!-- DOC_COUNT:publicTierModules -->6 modules and
<!-- DOC_COUNT:publicTierDeclarations -->30 declarations, and it has survived two rounds of core surgery unchanged. That is a feature.
Candidates exist — `OpenApiExtractor` in particular, which consumers already call — but promotion
is a permanent commitment and should follow demonstrated need, not anticipation.

---

## Open questions

Genuinely undecided, recorded so they are not silently resolved by default.

- **Should external `$ref` resolution ship at all**, or should the consumer pre-flatten the spec
  before handing it over? A resolver hook is small; the reporting around partial resolution is
  not.
- **Is OpenAPI 3.1 worth explicit support?** It is currently detected and routed to the 3.0
  parser, which works for most documents. 3.1 realigned on JSON Schema 2020-12, so `type` arrays,
  numeric `exclusiveMinimum` and `const` may map oddly. Unclear whether real specs hit this.
- **Does the inference engine need a declared-shape escape hatch** — a way for a consumer to say
  "this array is heterogeneous, sample all of it" — or should sampling simply be smarter?

---

## What is not on this list, and why

No performance work beyond the bundle split, because the benchmarks do not show a problem. No new
widgets, because <!-- DOC_COUNT:pluginMappings -->51 is sufficient and each is cheap to add on demand. No framework upgrade
work, because UI5 1.120 is current and the library uses little of its surface.

The most valuable thing that could happen to this library is not on this list at all: **more
consumers**. Every item above was found by measurement or review. Assumption errors — "nobody told
me schemas could look like that" — are found by users, and this library has had very few.
