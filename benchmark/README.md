# MetaUI benchmark harness

Performance, memory and load measurements for the MetaUI library, run against the **built**
artefact in headless Chromium via Puppeteer. Nothing here touches `src/`, `test/`, `scripts/`
or the published package.

## Running

```bash
# 1. Produce a build for the harness to measure.
#    A benchmark-owned build is preferred: a concurrent `npm run build --clean-dest`
#    in the repo root deletes dist/ mid-run, which fails the harness.
npx ui5 build --dest benchmark/.dist

# 2. Run everything (about 25 minutes at the default 7 repeats).
node benchmark/run-benchmarks.js

# Useful variants
node benchmark/run-benchmarks.js --quick                 # smaller sizes, 5 repeats
node benchmark/run-benchmarks.js --only=infer,policy     # selected groups
node benchmark/run-benchmarks.js --repeats=11            # more samples per point
node benchmark/run-benchmarks.js --deep                  # extend the field sweep to 400 and 800
node benchmark/run-benchmarks.js --dist=dist             # measure the shared build instead
node benchmark/run-benchmarks.js --out=results/pr-123.json

# Resolve a per-cycle heap figure too small to separate from noise at 100 cycles
node benchmark/run-benchmarks.js --only=memory \
  --mem-cycles=500 --mem-passes=5 --mem-only=hostLifecycle \
  --out=results/memory-deep.json
```

Groups: `render`, `infer`, `table`, `policy`, `validate`, `memory`, `load`.

| Flag | Effect |
| --- | --- |
| `--quick` | smaller sweeps, 5 repeats, 2 memory passes |
| `--deep` | adds 400- and 800-field points to the render sweep |
| `--repeats=N` | samples per point (minimum 5; a point whose warm-up exceeds 2 s is clamped to 5) |
| `--only=a,b` | run only these groups |
| `--mem-cycles=N` | cycles per memory scenario (default 100) |
| `--mem-passes=N` | identical passes per memory scenario (default 3) |
| `--mem-only=a,b` | run only memory scenarios whose id contains one of these |
| `--dist=PATH` | the build to measure (default: `benchmark/.dist`, else `dist`) |
| `--out=PATH` | write raw results here (relative to `benchmark/`) and leave `BASELINE.md` alone |

Outputs:

| Path | Contents |
| --- | --- |
| `benchmark/results/baseline.json` | every raw sample, summary, environment and curve fit |
| `benchmark/results/memory-deep.json` | the long-run leak resolution for `mem.hostLifecycle` |
| `benchmark/BASELINE.md` | generated report **plus** the hand-written interpretation, budgets and defects below the `BENCHMARK-GENERATED:END` marker, which is preserved across runs |

A run with `--out` does not rewrite `BASELINE.md`, so a targeted run cannot replace the committed
baseline with a partial one.

The harness needs network access on the first page load: the pages bootstrap the UI5 runtime
from `https://ui5.sap.com`, the same way `scripts/run-tests.js` does.

## Method

- Each data point is **one discarded warm-up pass** followed by **at least five measured
  repeats** (seven by default). A point whose single iteration already costs more than two
  seconds is clamped to five repeats so one size cannot dominate the wall clock; the realised
  sample count is always printed and stored.
- Figures are reported as **median and inter-quartile range**, never a mean. A single GC pause
  moves a mean and does not move a median.
- Every summary carries a `stability` label derived from IQR as a share of median:
  `stable` (≤ 10%), `usable` (≤ 25%), `noisy` (> 25%), and `below-timer-resolution` for
  anything under 0.5 ms, where Chromium's 100 µs clock quantisation is the dominant error term.
  **Do not budget against a `noisy` or `below-timer-resolution` figure.**
- Operations that are individually sub-millisecond are additionally **block-timed**: a run of N
  identical operations measured as one window and divided by N. Those metrics are named
  `*Block` or carry a `Micros` suffix.
- Memory is read through CDP: three `HeapProfiler.collectGarbage` passes followed by
  `Runtime.getHeapUsage`, plus `Nodes` and `JSEventListeners` from `Performance.getMetrics` and
  `sap.ui.core.Element.registry.size` from the page. Each memory scenario runs over three
  identical passes: a delta that appears only in pass 1 is warm-up, a delta that repeats at the
  same rate is a leak, a delta that changes sign is allocator noise.
- Curve shape is decided by **per-unit cost growth** (cost/n at the largest size divided by
  cost/n at the smallest), not by R², because a quadratic fit trivially achieves a high R² on a
  linear curve. Linear-fit and quadratic-fit R² are reported alongside for inspection.

## Layout

```
benchmark/
  run-benchmarks.js       Node driver: server, browser, scenarios, statistics, report
  lib/server.js           static server (built library under /resources, pages under /bench)
  lib/stats.js            median / IQR / stability / curve fitting
  lib/report.js           baseline.json -> BASELINE.md
  page/index.html         the benchmark page (UI5 from CDN + built MetaUI)
  page/fixtures.js        seeded, deterministic schema and payload generators
  page/scenarios.js       in-page scenarios; each does its own setup and full teardown
  page/tfr.html           time-to-first-render page, resourceroots-only integration
  page/tfr-lib.html       the same page with the library declared in data-sap-ui-libs
  results/baseline.json   raw results of the last run
  BASELINE.md             generated report plus hand-written interpretation
```

## Adding a scenario

1. Add a generator to `page/fixtures.js` if the input shape is new. Generators must be seeded
   and pure so a size is the only variable between runs.
2. Add `scenarios["group.name"] = async (params) => ({...})` to `page/scenarios.js`. Return raw
   numbers only; the driver does all reduction. Tear down whatever you created, including
   detaching the host from the mount, or the next scenario inherits your DOM.
3. Call it from the matching `run*Group` in `run-benchmarks.js` via `repeat()` and `record()`.
4. Add a curve fit in `main()` if the point is part of a size sweep, and a table in
   `lib/report.js` so it reaches BASELINE.md.
