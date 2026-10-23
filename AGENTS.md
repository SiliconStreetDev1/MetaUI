# MetaUI — Engineering Rules

## How this file works

Nine rules, plus two temporary reminders at the end. Each states **what** and **how it is enforced**.

This file previously carried 31 rules. Measured compliance was near-binary: every rule with a machine behind it held at 100%, and every rule without one was substantially violated. The rules were not the problem — the absence of enforcement was. So:

**A rule only belongs here if it requires human or model judgment.** Anything a linter, a gate or a test can check belongs in that linter, gate or test — not in prose. Anything that is a fact about the system belongs in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), which is the single architectural reference.

Every rule is tagged with its enforcement:

| Tag | Meaning |
|---|---|
| `[judgment]` | No tool can check this. It relies on you. |
| `[test]` | A test will fail if you get it wrong. |
| `[gate]` | `npm run lint` or `npm test` will fail. |

**If you want to add a rule and cannot tag it, do not add it.** That constraint is what keeps this file from growing back to 31.

---

## 1. Invariant-first — fix the contract, not the symptom `[judgment]`

Before fixing any rendering, binding, validation or policy bug, identify the base class or coordinator that owns the behaviour — `BasePlugin`, `PluginStateBase`, `ValidationLedger`, `DataSyncDelegate`, `DialogDelegate`, `GeneratorHost`, `LayoutElementWalker`, `SchemaWalker` — and fix it there, once, for the whole pipeline.

This applies with particular force to anything that walks the schema tree. Six separate audits of this codebase each found the same defect shape — a rule implemented correctly in one place and missing in its twin — and the cause is documented in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) §10a. **Read it before adding a traversal.** `SchemaWalker` owns depth, cycles and `$ref`; the `[SINGLE_WALKER]` gate will stop you writing a fourteenth walker, but it cannot tell you why you should not want to.

Never patch an individual control, layout or scenario in isolation. Never add redundant defensive code to force a fix to work; if you are tempted to reassign a property "just to be safe", you have not found the cause yet.

MetaUI is one library. A bug that reproduces in one widget almost always lives in a shared contract.

## 2. Fail loudly `[judgment]` `[test]`

**No silent degradation.** This is the framework's most frequent historical defect, appearing independently across the layout engine, the policy engine, schema ingestion and the OData layer.

Any input the engine cannot honour — an unresolvable `uiLayout` scope, a malformed policy condition, a failed `$ref`, a rejected OData write, a truncated recursion — must produce a signal the user or the consuming application can see: a visible banner, a fired `error` event, a painted field state, or at minimum a logged warning the test harness observes.

**Never render a plausible-looking empty result.** A blank form that reports `isValid: true` is worse than a crash, because nobody investigates it.

## 3. Specification-first `[judgment]`

Every parser, normalizer, layout, validator and plugin is designed upward from the JSON Schema, OpenAPI and SAPUI5 specifications, so it handles arbitrary schemas and payloads.

Never write logic keyed to a field name, scenario key or value that happens to appear in `test/webapp/mockData/`. If a test passes only because of what a mock contains, the implementation is wrong even though the test is green.

## 4. Simplest transformation that works `[judgment]`

Apply the smallest change that satisfies the specification. When modifying a layout tree, swap the node you need to swap; do not rewrite the structure around it.

Do not build elaborate recursive machinery on the assumption that UI5 cannot handle something — check whether it can first.

## 5. Discard components that do not fit `[judgment]`

If a native SAPUI5 component fundamentally contradicts MetaUI's constraints — for example requiring a specific physical ancestor while MetaUI hosts content in dynamically created containers — **do not** hack its render modes, events or typings.

Discard it and compose an equivalent from base primitives (`VBox`, `HBox`, `SimpleForm`). The wizard is the precedent: `sap.m.Wizard` was correctly abandoned for a custom composable.

## 6. Say "I don't know" `[judgment]`

Do not guess at SAPUI5 custom library paths, ABAP deployment mechanics, App Index behaviour or Fiori Launchpad loading. Verify against documentation or the installed tooling, and cite what you checked.

If you cannot establish something from evidence, **say so explicitly**. An honest "I don't know" is a correct answer. A confident wrong answer about deployment costs hours.

Carried-over deployment knowledge lives in `docs/ARCHITECTURE.md` §13 and is marked as unverified for exactly this reason.

## 7. Capability is never removed `[test]` `[gate]`

No plugin, widget mapping, layout strategy, public method, event, mock scenario or Playground testing option may be deleted or simplified to "clean up". Refactoring removes duplicate *implementations*, never *features*.

The Playground is a deliberate matrix — data scenarios × binding modes × render targets × runtime toggles. All combinations must continue to exist.

Enforced by the `DefaultPluginBootstrapper` ↔ `TestOracle` parity gate and by the test matrix. If your change makes a gate fail, the gate is probably right.

## 8. Do what was asked `[judgment]`

Address the request that was made. Do not expand scope, do not perform unrequested investigations, and do not substitute a different problem because it seems more interesting.

If you believe the request is wrong, say so and explain why — then do what was asked, or stop and wait. Do not silently do something else.

## 9. Prove it `[gate]`

Before claiming a task is complete:

```
npm run lint             # 0 violations (exemptions are counted and reported, not asserted to be zero)
npx tsc --noEmit -p .    # 0 errors
npm run build            # clean
npm test                 # all suites pass
npm run metrics          # read-only canonical counts
```

`package.json` defines `"pretest": "npm run build"`, so `npm test` rebuilds `dist/` automatically. Never quote a count from memory or from a document — take it from `npm run metrics`.

Report what you actually ran. If something was skipped, could not be reproduced, or you disagreed with the instruction, **state it plainly** rather than omitting it. An unreported gap is the one that reaches production.

---

## Temporary reminders — delete these when automated

These two are the only surviving "remember to update X when you change Y" rules. That shape is a design smell: the correct fix is to derive the data, not to remind a human. They stay only until that work lands.

**T1. Scenario registration `[judgment]` — temporary.**
When adding a scenario to `test/webapp/mockData/scenarios/index.json`, also add its key to the hardcoded whitelist in `test/webapp/controller/ScenarioRunner.controller.js` (~line 111), or it will silently not appear in the Playground.
*Exit condition: read the list from `index.json` and delete this rule.*

**T2. AI cheat sheet `[judgment]` — temporary.**
When adding a widget, schema property or `ui` directive, update `docs/wiki/AI_Schema_CheatSheet.md`. It is the ground-truth reference other AI agents read, and a stale entry causes hallucinated schemas.
*Exit condition: generate it from `ISchema.ts` + `MetaUIConstants.ts` and delete this rule.*

---

## Where the other 22 rules went

| Previously | Now enforced by |
|---|---|
| No `any`; no raw `console.*`; no empty `catch`; no `.js` in `src/`; plugin directory purity; max line length | the AST lint gate in `scripts/run-tests.js` (`npm run lint`) |
| Strict compiler flags | `tsconfig.json` |
| Registry ↔ Oracle parity; widget ↔ constants parity | `scripts/run-tests.js` |
| Producer completeness against `ISchema`; one shared depth cap; one `$ref` resolver; one layout-strategy default; schema constants over string literals; one `data`/`dataJson` writer; a caught failure must signal; a depth guard must say what it truncated; a degraded render must raise the banner | the structural gates in `scripts/run-tests.js` (`npm run lint`), each proven to fire by `scripts/prove-structural-gates.js` |
| Every plugin renders / mounts / validates; DOM geometry; display mode; row clones; `dataJson` round-trip; standalone consumer; input immutability; memory lifecycle | the test suite |
| Hardcoded counts in documentation | `npm run metrics`, reconciled against the live run on every `npm test` |
| Core features, tri-binding, live vs transactional, Messaging behaviour, deployment facts | `docs/ARCHITECTURE.md` |

### Two deliberate corrections

**`unknown` is not banned.** The previous rule 1 banned `any` "or similar bypasses like `unknown`". That was wrong — `unknown` narrowed through `utils/TypeGuards.ts` is the correct TypeScript pattern and one of the better things in this codebase. The rule is now simply: no `any`; use `unknown` with a type guard.

**The ~300 executable-line file limit is withdrawn.** It measured newlines, not complexity, and was satisfied by joining statements — producing seven files squeezed to 282–299 lines containing lines up to 192 characters. It is replaced by a 140-character max line length plus the AST gate. Prefer clarity; do not shorten a file by compressing it.
