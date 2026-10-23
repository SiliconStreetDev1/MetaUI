/**
 * @file run-benchmarks.js
 * @description Re-runnable performance, memory and load benchmark harness for the MetaUI library.
 *
 *   node benchmark/run-benchmarks.js                      # everything
 *   node benchmark/run-benchmarks.js --only=infer,policy  # selected groups
 *   node benchmark/run-benchmarks.js --repeats=11         # more samples per point
 *   node benchmark/run-benchmarks.js --quick              # smaller sizes, fewer repeats
 *   node benchmark/run-benchmarks.js --out=results/x.json
 *
 * Groups: render, infer, table, policy, validate, memory, load
 *
 * The harness never averages a single run. Every data point is repeated (default 7 times,
 * minimum 5) and reported as median with inter-quartile range; the report marks each point
 * stable / usable / noisy / below-timer-resolution so a reader can tell a measurement from
 * a number. Requires `npm run build` to have produced `dist/resources` first.
 */
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const zlib = require("zlib");
const puppeteer = require("puppeteer");

const { startServer } = require("./lib/server");
const { summarize, stability, fitCurve } = require("./lib/stats");
const { writeReport } = require("./lib/report");

const REPO_ROOT = path.resolve(__dirname, "..");
const PAGE_DIR = path.join(__dirname, "page");
const RESULTS_DIR = path.join(__dirname, "results");

const LIB_SUBPATH = path.join("nz", "co", "siliconst", "ui5", "metaui");

/**
 * Resolves the built library to measure. Prefers a benchmark-owned build
 * (`benchmark/.dist`, produced by `npx ui5 build --dest benchmark/.dist`) so a concurrent
 * `npm run build --clean-dest` in the repo root cannot delete the artefact mid-run, and
 * falls back to the shared `dist/`.
 *
 * @param {string|null} override explicit `--dist=` path
 * @returns {{root:string, resources:string, lib:string, source:string}|null}
 */
function resolveDist(override) {
    const candidates = [];
    if (override) candidates.push({ root: path.resolve(REPO_ROOT, override), source: "--dist" });
    candidates.push({ root: path.join(__dirname, ".dist"), source: "benchmark/.dist" });
    candidates.push({ root: path.join(REPO_ROOT, "dist"), source: "dist" });
    for (const c of candidates) {
        const lib = path.join(c.root, "resources", LIB_SUBPATH);
        if (fs.existsSync(path.join(lib, "library-preload.js"))) {
            return { root: c.root, resources: path.join(c.root, "resources"), lib, source: c.source };
        }
    }
    return null;
}

// ------------------------------------------------------------------ CLI
function parseArgs(argv) {
    const args = {
        repeats: 7,
        quick: false,
        deep: false,
        only: null,
        out: null,
        dist: null,
        memCycles: null,
        memPasses: null,
        memOnly: null
    };
    for (const raw of argv.slice(2)) {
        if (raw === "--quick") args.quick = true;
        else if (raw === "--deep") args.deep = true;
        else if (raw.startsWith("--repeats=")) args.repeats = Number(raw.split("=")[1]);
        else if (raw.startsWith("--only=")) args.only = raw.split("=")[1].split(",").map((s) => s.trim());
        else if (raw.startsWith("--out=")) args.out = raw.split("=")[1];
        else if (raw.startsWith("--dist=")) args.dist = raw.split("=")[1];
        else if (raw.startsWith("--mem-cycles=")) args.memCycles = Number(raw.split("=")[1]);
        else if (raw.startsWith("--mem-passes=")) args.memPasses = Number(raw.split("=")[1]);
        else if (raw.startsWith("--mem-only=")) args.memOnly = raw.split("=")[1].split(",").map((s) => s.trim());
    }
    if (!Number.isFinite(args.repeats) || args.repeats < 5) {
        if (!args.quick) {
            console.warn(`  [warn] --repeats raised to the 5-sample minimum (asked for ${args.repeats}).`);
            args.repeats = 5;
        }
    }
    if (args.quick) args.repeats = Math.max(5, Math.min(args.repeats, 5));
    return args;
}

const ARGS = parseArgs(process.argv);
const DIST = resolveDist(ARGS.dist);
const DIST_RESOURCES = DIST ? DIST.lib : path.join(REPO_ROOT, "dist", "resources", LIB_SUBPATH);
const GROUPS = ["render", "infer", "table", "policy", "validate", "memory", "load"];
const ACTIVE = ARGS.only ? GROUPS.filter((g) => ARGS.only.includes(g)) : GROUPS;

function wants(group) {
    return ACTIVE.includes(group);
}

// ------------------------------------------------------------------ records
const records = [];

/**
 * Stores one benchmark point.
 *
 * @param {string} group    group name (render, infer, ...)
 * @param {string} scenario in-page scenario id
 * @param {string} label    human-readable point label
 * @param {object} params   scenario parameters
 * @param {object} samples  {metricName: number[]}
 * @param {object} [meta]   invariant facts (control counts, payload sizes, ...)
 */
function record(group, scenario, label, params, samples, meta) {
    const summary = {};
    for (const [metric, values] of Object.entries(samples)) {
        const s = summarize(values);
        summary[metric] = Object.assign({}, s, { stability: stability(s) });
    }
    const rec = { group, scenario, label, params, samples, summary, meta: meta || {} };
    records.push(rec);
    const primary = Object.keys(summary)[0];
    const s = summary[primary];
    const unit = /Micros$/.test(primary) ? "us" : "ms";
    console.log(
        `    ${label.padEnd(42)} ${primary}=${s.median.toFixed(3)}${unit} ` +
            `(n=${s.n}, IQR ${s.iqr.toFixed(3)}${unit}, ${s.stability})`
    );
    return rec;
}

/**
 * Runs an in-page scenario `repeats` times and collects the named metrics.
 *
 * The warm-up pass is also used to size the run: a point whose single iteration already costs
 * seconds is clamped to the 5-sample statistical minimum rather than being allowed to dominate
 * the wall clock. The actual sample count is always reported alongside the figure.
 */
async function repeat(page, scenario, params, repeats) {
    const results = [];
    // One discarded warm-up pass: the first run of any scenario pays JIT, UI5 lazy module
    // resolution and style recalculation that no steady-state user interaction pays.
    const warmStart = Date.now();
    await page.evaluate((s, p) => window.MetaUIBench.run(s, p), scenario, params);
    const warmMs = Date.now() - warmStart;

    const effective = warmMs > 2000 ? 5 : repeats;
    for (let i = 0; i < effective; i++) {
        results.push(await page.evaluate((s, p) => window.MetaUIBench.run(s, p), scenario, params));
    }
    return results;
}

/** Pulls a scalar metric out of every repeat result. */
function pick(results, key) {
    return results.map((r) => r[key]);
}

/** Flattens a per-repeat array metric (e.g. 10 keystrokes x 7 repeats) into one sample set. */
function flatten(results, key) {
    return results.reduce((acc, r) => acc.concat(r[key] || []), []);
}

// ------------------------------------------------------------------ heap/CDP
async function makeHeapProbe(page) {
    const client = await page.createCDPSession();
    await client.send("HeapProfiler.enable");
    await client.send("Performance.enable").catch(() => {});

    async function settle() {
        // Three collections: the first frees the obvious garbage, the later two give
        // finalizers and weak-ref clearing a chance to release a second generation.
        for (let i = 0; i < 3; i++) {
            await client.send("HeapProfiler.collectGarbage");
            await new Promise((r) => setTimeout(r, 60));
        }
    }

    async function sample() {
        await settle();
        const usage = await client.send("Runtime.getHeapUsage").catch(() => ({ usedSize: NaN, totalSize: NaN }));
        let nodes = NaN;
        let listeners = NaN;
        try {
            const perf = await client.send("Performance.getMetrics");
            const byName = Object.fromEntries(perf.metrics.map((m) => [m.name, m.value]));
            nodes = byName.Nodes;
            listeners = byName.JSEventListeners;
        } catch (e) {
            /* Performance domain unavailable */
        }
        const counters = await page.evaluate(() => window.MetaUIBench.run("counters"));
        return {
            usedHeapBytes: usage.usedSize,
            totalHeapBytes: usage.totalSize,
            domNodes: nodes,
            jsEventListeners: listeners,
            uiControls: counters.uiControls,
            liveDomNodes: counters.domNodes
        };
    }

    return { client, sample };
}

// ------------------------------------------------------------------ groups

async function runRenderGroup(page) {
    console.log("\n[1] Render time vs field count");
    // `--deep` extends the sweep past any plausible production form. A quadratic term that is
    // invisible at 200 fields is still a cliff; the only way to find where it is, is to go past it.
    const sizes = ARGS.quick ? [5, 20, 50] : ARGS.deep ? [5, 20, 50, 100, 200, 400, 800] : [5, 20, 50, 100, 200];

    for (const mode of ["explicit", "inferred"]) {
        console.log(`  -- ${mode} schema`);
        for (const fields of sizes) {
            const res = await repeat(page, `render.${mode}`, { fields }, ARGS.repeats);
            record(
                "render",
                `render.${mode}`,
                `${mode} ${fields} fields`,
                { fields },
                {
                    tTotal: pick(res, "tTotal"),
                    tGenerate: pick(res, "tGenerate"),
                    tApply: pick(res, "tApply")
                },
                {
                    fields,
                    plugins: res[0].plugins,
                    controls: res[0].controls,
                    domNodes: res[0].domNodes
                }
            );
        }
    }

    console.log("  -- schema normalisation only (no UI5 controls)");
    for (const fields of sizes) {
        const res = await repeat(page, "normalize.only", { fields }, ARGS.repeats);
        record("render", "normalize.only", `normalize ${fields} fields`, { fields }, {
            tNormalize: pick(res, "tNormalize")
        }, { fields });
    }
}

async function runInferGroup(page) {
    console.log("\n[2] Inference time vs payload size and nesting depth");

    console.log("  -- pure inference, flat object, width sweep");
    const widths = ARGS.quick ? [10, 50, 200] : [10, 50, 200, 1000, 5000];
    for (const fields of widths) {
        const res = await repeat(page, "infer.pure", { fields, depth: 1, rows: 0 }, ARGS.repeats);
        record("infer", "infer.pure", `pure flat ${fields} fields`, { fields, depth: 1 }, {
            tInfer: pick(res, "tInfer")
        }, { fields, payloadBytes: res[0].payloadBytes });
    }

    console.log("  -- pure inference, depth sweep (20 fields per level)");
    const depths = ARGS.quick ? [1, 3, 5] : [1, 2, 3, 5, 8, 10, 12];
    for (const depth of depths) {
        const res = await repeat(page, "infer.pure", { fields: 20, depth, rows: 0 }, ARGS.repeats);
        record("infer", "infer.pure", `pure depth ${depth} x 20 fields`, { fields: 20, depth }, {
            tInfer: pick(res, "tInfer")
        }, { depth, payloadBytes: res[0].payloadBytes });
    }

    console.log("  -- pure inference, array-of-objects row sweep (15 cols)");
    const rowCounts = ARGS.quick ? [10, 100, 1000] : [10, 50, 100, 500, 1000, 5000];
    for (const rows of rowCounts) {
        const res = await repeat(page, "infer.pure", { fields: 15, depth: 1, rows }, ARGS.repeats);
        record("infer", "infer.pure", `pure ${rows} rows x 15 cols`, { fields: 15, rows }, {
            tInfer: pick(res, "tInfer")
        }, { rows, payloadBytes: res[0].payloadBytes });
    }

    console.log("  -- pure inference, nested arrays-of-objects (fan-out 3)");
    const nestDepths = ARGS.quick ? [2, 4] : [2, 3, 4, 5, 6];
    for (const depth of nestDepths) {
        const res = await repeat(
            page,
            "infer.pure",
            { fields: 8, depth, nestedArrays: true, childRows: 3 },
            ARGS.repeats
        );
        record("infer", "infer.pure", `pure nested-array depth ${depth}`, { depth, nestedArrays: true }, {
            tInfer: pick(res, "tInfer")
        }, { depth, payloadBytes: res[0].payloadBytes });
    }

    console.log("  -- end-to-end inferred render (raw data in, control tree out)");
    const e2eSizes = ARGS.quick ? [10, 50] : [10, 50, 100, 200];
    for (const fields of e2eSizes) {
        const res = await repeat(page, "infer.e2e", { fields, depth: 1, rows: 0 }, ARGS.repeats);
        record("infer", "infer.e2e", `e2e inferred ${fields} fields`, { fields }, {
            tTotal: pick(res, "tTotal"),
            tGenerate: pick(res, "tGenerate"),
            tApply: pick(res, "tApply")
        }, { fields, payloadBytes: res[0].payloadBytes, plugins: res[0].plugins, domNodes: res[0].domNodes });
    }
}

async function runTableGroup(page) {
    console.log("\n[3] Table rendering, rows x columns");

    // Correctness probe first, because it decides how the timings below must be read:
    // rows that are never rendered are rows that were never paid for.
    console.log("  -- rendered rows vs model rows (binding size limit probe)");
    const truncation = [];
    for (const rows of [50, 99, 100, 101, 200, 1000]) {
        const res = await page.evaluate(
            (s, p) => window.MetaUIBench.run(s, p),
            "table.rowTruncation",
            { rows, cols: 3 }
        );
        truncation.push(res);
        console.log(
            `    model ${String(rows).padStart(5)} rows -> painted ${String(res.renderedItems).padStart(5)}, ` +
                `binding length ${res.bindingLength}, model size limit ${res.modelSizeLimit}, ` +
                `DOM rows ${res.domRows}` +
                (res.growing ? `, paging ${res.growingReports || "on"}` : "") +
                // Unreachable, not merely unpainted: see the note in scenarios.js.
                `${res.truncated ? "   [UNREACHABLE ROWS]" : ""}`
        );
    }
    records.push({
        group: "table",
        scenario: "table.rowTruncation",
        label: "rendered rows vs model rows",
        params: { cols: 3 },
        samples: {},
        summary: {},
        meta: { probes: truncation }
    });

    const rowCounts = ARGS.quick ? [10, 50] : [10, 50, 200, 1000];
    const colCounts = ARGS.quick ? [3, 8] : [3, 8, 15];

    for (const cols of colCounts) {
        for (const rows of rowCounts) {
            const res = await repeat(page, "table.render", { rows, cols }, ARGS.repeats);
            record("table", "table.render", `table ${rows}r x ${cols}c`, { rows, cols }, {
                tTotal: pick(res, "tTotal"),
                tGenerate: pick(res, "tGenerate"),
                tApply: pick(res, "tApply")
            }, { rows, cols, controls: res[0].controls, domNodes: res[0].domNodes });
        }
    }

    console.log("  -- row-clone path (Add Row press -> re-render)");
    for (const rows of ARGS.quick ? [10, 50] : [10, 50, 200]) {
        for (const cols of ARGS.quick ? [8] : [3, 8, 15]) {
            const res = await repeat(page, "table.addRow", { rows, cols, adds: 5 }, ARGS.repeats);
            record("table", "table.addRow", `addRow @ ${rows}r x ${cols}c`, { rows, cols }, {
                tAddRow: flatten(res, "perAdd")
            }, { rows, cols });
        }
    }

    console.log("  -- Add Row with and without $row policies (press vs re-render split)");
    for (const rows of ARGS.quick ? [10, 50] : [10, 50, 200]) {
        for (const policies of [0, 10]) {
            const res = await repeat(
                page,
                "table.addRowWithPolicies",
                { rows, cols: 8, policies, adds: 5 },
                ARGS.repeats
            );
            record(
                "table",
                "table.addRowWithPolicies",
                `addRow @ ${rows}r x 8c, ${policies} $row policies`,
                { rows, cols: 8, policies },
                {
                    tAddTotal: flatten(res, "perAddTotal"),
                    tAddPress: flatten(res, "perAddPress"),
                    tAddApply: flatten(res, "perAddApply")
                },
                { rows, cols: 8, policies }
            );
        }
    }
}

async function runPolicyGroup(page) {
    console.log("\n[4] Policy engine cost");

    console.log("  -- PolicyEngine.evaluate() in isolation, flat policies");
    for (const policies of [10, 50, 200]) {
        const res = await repeat(page, "policy.engineOnly", { fields: 60, policies, reps: 10 }, ARGS.repeats);
        record("policy", "policy.engineOnly", `engine-only ${policies} policies`, { policies }, {
            tSteady: flatten(res, "tSteady"),
            tFirstPass: pick(res, "tFirstPass")
        }, { policies, firstDeltaCount: res[0].firstDeltaCount });
    }

    console.log("  -- PolicyEngine.evaluate() with $row expansion");
    const rowSets = ARGS.quick ? [[20, 10], [100, 10]] : [[20, 10], [100, 10], [100, 50], [500, 10], [500, 50]];
    for (const [rows, policies] of rowSets) {
        const res = await repeat(page, "policy.engineOnly", { rows, cols: 8, policies, reps: 10 }, ARGS.repeats);
        record("policy", "policy.engineOnly", `engine-only $row ${policies}p x ${rows}r`, { rows, policies }, {
            tSteady: flatten(res, "tSteady"),
            tFirstPass: pick(res, "tFirstPass")
        }, { rows, policies, expandedRules: rows * policies, firstDeltaCount: res[0].firstDeltaCount });
    }

    console.log("  -- committed field change on a policy-carrying form");
    for (const policies of [10, 50, 200]) {
        const res = await repeat(
            page,
            "policy.change",
            { fields: 60, policies, keystrokes: 10 },
            ARGS.repeats
        );
        record("policy", "policy.change", `change+flush, ${policies} policies`, { policies }, {
            tCommitBlock: pick(res, "tCommitBlock"),
            tPolicyEvalBlock: pick(res, "tPolicyEvalBlock"),
            tCommit: flatten(res, "tCommit"),
            tPolicyEval: flatten(res, "tPolicyEval")
        }, { policies, plugins: res[0].plugins });
    }

    console.log("  -- registry round trip performed once per rule per pass");
    {
        const res = await repeat(page, "policy.registryLookup", { reps: 20000 }, ARGS.repeats);
        record("policy", "policy.registryLookup", "getPolicyEffectPlugin() per call", {}, {
            tEffectLookupMicros: pick(res, "tEffectLookupMicros"),
            tConditionLookupMicros: pick(res, "tConditionLookupMicros"),
            tCachedEffectCallMicros: pick(res, "tCachedEffectCallMicros")
        }, { reps: res[0].reps });
    }

    console.log("  -- full host $row expansion inside a rendered table (steady state)");
    const hostRowSets = ARGS.quick ? [[20, 10]] : [[20, 10], [50, 10], [50, 50], [200, 10]];
    for (const [rows, policies] of hostRowSets) {
        const res = await repeat(
            page,
            "policy.rowExpansion",
            { rows, cols: 8, policies, reps: 10 },
            ARGS.repeats
        );
        record("policy", "policy.rowExpansion", `host $row ${policies}p x ${rows}r`, { rows, policies }, {
            tPolicyEval: flatten(res, "tPolicyEval")
        }, { rows, policies, expandedRules: rows * policies });
    }

    console.log("  -- delta storm: resetAndEvaluatePoliciesNow() on a $row table");
    const stormSets = ARGS.quick ? [[10, 5], [50, 5]] : [[10, 5], [25, 5], [50, 5], [100, 5], [50, 20]];
    for (const [rows, policies] of stormSets) {
        const res = await repeat(
            page,
            "policy.deltaStorm",
            { rows, cols: 8, policies, reps: 5 },
            ARGS.repeats
        );
        record(
            "policy",
            "policy.deltaStorm",
            `delta storm ${policies}p x ${rows}r`,
            { rows, policies },
            {
                tResetAndEvaluate: flatten(res, "tResetAndEvaluate"),
                tSteadyEvaluate: flatten(res, "tSteadyEvaluate")
            },
            { rows, policies, expandedRules: rows * policies, controls: res[0].controls }
        );
    }
}

async function runValidateGroup(page) {
    console.log("\n[5] Validation pipeline cost");

    console.log("  -- raw validator chain (PipelineManager.runValidators)");
    for (const regex of [false, true]) {
        const res = await repeat(page, "validate.pipelineOnly", { regex, reps: 5000 }, ARGS.repeats);
        record("validate", "validate.pipelineOnly", `runValidators ${regex ? "with" : "without"} pattern`, { regex }, {
            tPerCallMicros: res.map((r) => r.tPerCall * 1000)
        }, { reps: res[0].reps, regex });
    }

    console.log("  -- committed change on a validator-heavy form (all fields valid)");
    for (const fields of ARGS.quick ? [20, 100] : [20, 50, 100, 200]) {
        for (const regex of [false, true]) {
            const res = await repeat(
                page,
                "validate.change",
                { fields, regex, keystrokes: 12 },
                ARGS.repeats
            );
            record(
                "validate",
                "validate.change",
                `change @ ${fields} fields${regex ? " +pattern" : ""}`,
                { fields, regex, invalid: false },
                {
                    tCommitBlock: pick(res, "tCommitBlock"),
                    tValidateAll: pick(res, "tValidateAll"),
                    tCommit: flatten(res, "tCommit")
                },
                { fields, regex, errorCount: res[0].errorCount }
            );
        }
    }

    console.log("  -- same form with every field already invalid (ValidationLedger full)");
    for (const fields of ARGS.quick ? [20, 100] : [20, 50, 100, 200]) {
        const res = await repeat(
            page,
            "validate.change",
            { fields, regex: false, invalid: true, keystrokes: 12 },
            ARGS.repeats
        );
        record(
            "validate",
            "validate.change.invalid",
            `change @ ${fields} fields, ledger full`,
            { fields, regex: false, invalid: true },
            {
                tCommitBlock: pick(res, "tCommitBlock"),
                tValidateAll: pick(res, "tValidateAll"),
                tCommit: flatten(res, "tCommit")
            },
            { fields, errorCount: res[0].errorCount, ledgerEntries: res[0].ledgerEntries }
        );
    }
}

async function runMemoryGroup(page) {
    console.log("\n[6] Memory across a long session");
    const probe = await makeHeapProbe(page);
    const cycles = ARGS.memCycles || (ARGS.quick ? 25 : 100);

    let scenariosToRun = [
        { id: "mem.hostLifecycle", label: `create+generate+destroy x${cycles}`, params: { cycles, fields: 30 } },
        { id: "mem.regenerate", label: `re-generate same host x${cycles}`, params: { cycles, fields: 30 } },
        { id: "mem.dialog", label: `open+close dialog x${cycles}`, params: { cycles, fields: 20 } },
        {
            id: "mem.wizardSteps",
            label: `wizard forward+back x${Math.max(5, Math.round(cycles / 5))}`,
            params: { cycles: Math.max(5, Math.round(cycles / 5)), steps: 5, fieldsPerStep: 6 }
        },
        {
            id: "mem.tableRowChurn",
            label: `table add+delete row x${cycles}`,
            params: { cycles, rows: 20, cols: 8 }
        }
    ];

    if (ARGS.memOnly) {
        scenariosToRun = scenariosToRun.filter((sc) => ARGS.memOnly.some((n) => sc.id.includes(n)));
    }

    // Several passes of the same churn. A delta that appears only in pass 1 is one-off warm-up
    // (lazy module load, UI5 static area, style cache). A delta that repeats across later passes
    // at the same rate is a leak. Anything else is allocator noise. Raise --mem-cycles and
    // --mem-passes to resolve a per-cycle figure too small to separate from noise at 100 cycles.
    const PASSES = ARGS.memPasses || (ARGS.quick ? 2 : 3);
    for (let pass = 1; pass <= PASSES; pass++) {
        console.log(`  -- pass ${pass} of ${PASSES}`);
        for (const sc of scenariosToRun) {
            await page.evaluate(() => window.MetaUIBench.run("idle", { ticks: 6 }));
            const before = await probe.sample();

            const t0 = Date.now();
            let errorMessage = null;
            try {
                await page.evaluate((id, p) => window.MetaUIBench.run(id, p), sc.id, sc.params);
            } catch (e) {
                errorMessage = e.message;
            }
            const wallMs = Date.now() - t0;

            await page.evaluate(() => window.MetaUIBench.run("idle", { ticks: 10 }));
            const after = await probe.sample();

            const rec = {
                group: "memory",
                scenario: sc.id,
                pass,
                label: `${sc.label} [pass ${pass}]`,
                params: sc.params,
                samples: {},
                summary: {},
                meta: {
                    before,
                    after,
                    deltaHeapBytes: after.usedHeapBytes - before.usedHeapBytes,
                    deltaHeapPerCycleBytes: (after.usedHeapBytes - before.usedHeapBytes) / sc.params.cycles,
                    deltaDomNodes: after.domNodes - before.domNodes,
                    deltaListeners: after.jsEventListeners - before.jsEventListeners,
                    deltaUiControls: after.uiControls - before.uiControls,
                    absHeapBytesAfter: after.usedHeapBytes,
                    absUiControlsAfter: after.uiControls,
                    absDomNodesAfter: after.domNodes,
                    wallMs,
                    error: errorMessage
                }
            };
            records.push(rec);
            console.log(
                `    ${rec.label.padEnd(48)} heap ${(rec.meta.deltaHeapBytes / 1024).toFixed(0)}KB ` +
                    `(${(rec.meta.deltaHeapPerCycleBytes / 1024).toFixed(2)}KB/cycle), ` +
                    `controls ${rec.meta.deltaUiControls >= 0 ? "+" : ""}${rec.meta.deltaUiControls}, ` +
                    `DOM ${rec.meta.deltaDomNodes >= 0 ? "+" : ""}${rec.meta.deltaDomNodes}, ` +
                    `listeners ${rec.meta.deltaListeners >= 0 ? "+" : ""}${rec.meta.deltaListeners}` +
                    (errorMessage ? ` [ERROR: ${errorMessage}]` : "")
            );
        }
    }

    await probe.client.detach().catch(() => {});
}

/** Static bundle analysis: what actually ships in library-preload.js. */
function analysePreload() {
    const preloadPath = path.join(DIST_RESOURCES, "library-preload.js");
    if (!fs.existsSync(preloadPath)) {
        return { error: "library-preload.js not found; run `npm run build` first." };
    }
    const src = fs.readFileSync(preloadPath, "utf8");
    const raw = Buffer.byteLength(src, "utf8");
    const gzip = zlib.gzipSync(src).length;
    const brotli = zlib.brotliCompressSync(Buffer.from(src, "utf8")).length;

    // Split on the predefine boundaries to attribute bytes to modules.
    const boundary = /sap\.ui\.predefine\("([^"]+)"/g;
    const hits = [];
    let m;
    while ((m = boundary.exec(src)) !== null) {
        hits.push({ name: m[1], start: m.index });
    }
    const modules = hits.map((h, i) => ({
        name: h.name,
        bytes: (i + 1 < hits.length ? hits[i + 1].start : src.length) - h.start
    }));

    // library.ts eagerly imports these; everything else is nominally lazy but is still
    // inside the same bundle, so "lazy" here means "deferred execution", not "deferred download".
    const EAGER = new Set([
        "nz/co/siliconst/ui5/metaui/library",
        "nz/co/siliconst/ui5/metaui/plugins/controls/StringPlugin",
        "nz/co/siliconst/ui5/metaui/plugins/controls/NumberPlugin",
        "nz/co/siliconst/ui5/metaui/plugins/controls/BooleanPlugin",
        "nz/co/siliconst/ui5/metaui/plugins/controls/ObjectPlugin",
        "nz/co/siliconst/ui5/metaui/plugins/controls/ArrayPlugin",
        "nz/co/siliconst/ui5/metaui/plugins/controls/DropdownPlugin",
        "nz/co/siliconst/ui5/metaui/plugins/controls/MultiInputPlugin",
        "nz/co/siliconst/ui5/metaui/plugins/controls/DatePlugin",
        "nz/co/siliconst/ui5/metaui/core/DefaultLayoutGenerator",
        "nz/co/siliconst/ui5/metaui/utils/ExpressionBuilder",
        "nz/co/siliconst/ui5/metaui/layouts/FormLayout",
        "nz/co/siliconst/ui5/metaui/layouts/TableLayout",
        "nz/co/siliconst/ui5/metaui/layouts/WizardLayout",
        "nz/co/siliconst/ui5/metaui/layouts/CompactLayout"
    ]);

    const categorize = (name) => {
        if (EAGER.has(name)) return "eager-import";
        if (/\/openapi\/|\/swagger\//.test(name)) return "openapi";
        if (/\/plugins\/datasources\//.test(name)) return "datasource";
        if (/CameraPlugin|SignaturePlugin|VoiceInputPlugin|GeolocationPlugin|HardwareControlPlugin|CodeEditorPlugin|RichTextPlugin|FileUploaderPlugin/.test(name))
            return "specialised-widget";
        if (/\/controls\/(Camera|Signature|VoiceInput|Geolocation|RichText|BaseHardware)/.test(name))
            return "hardware-control";
        if (/\/plugins\/actions\//.test(name)) return "action";
        if (/\/plugins\/controls\//.test(name)) return "lazy-widget";
        return "core";
    };

    const byCategory = {};
    for (const mod of modules) {
        const cat = categorize(mod.name);
        byCategory[cat] = byCategory[cat] || { bytes: 0, count: 0, modules: [] };
        byCategory[cat].bytes += mod.bytes;
        byCategory[cat].count += 1;
        byCategory[cat].modules.push(mod.name);
    }

    return {
        rawBytes: raw,
        gzipBytes: gzip,
        brotliBytes: brotli,
        moduleCount: modules.length,
        modules: modules.sort((a, b) => b.bytes - a.bytes),
        byCategory,
        otherArtifacts: fs
            .readdirSync(DIST_RESOURCES)
            .filter((f) => f.endsWith(".js") || f.endsWith(".json"))
            .map((f) => ({ file: f, bytes: fs.statSync(path.join(DIST_RESOURCES, f)).size }))
            .sort((a, b) => b.bytes - a.bytes)
    };
}

async function runLoadGroup(browser, baseUrl) {
    console.log("\n[7] Load cost");

    const bundle = analysePreload();
    records.push({
        group: "load",
        scenario: "bundle.static",
        label: "library-preload.js static analysis",
        params: {},
        samples: {},
        summary: {},
        meta: bundle
    });
    if (!bundle.error) {
        console.log(
            `    library-preload.js: ${(bundle.rawBytes / 1024).toFixed(0)}KB raw, ` +
                `${(bundle.gzipBytes / 1024).toFixed(0)}KB gzip, ${(bundle.brotliBytes / 1024).toFixed(0)}KB brotli, ` +
                `${bundle.moduleCount} modules`
        );
    } else {
        console.log(`    ${bundle.error}`);
    }

    console.log("  -- time to first render, trivial 3-field schema (cold page each run)");
    const repeats = ARGS.quick ? 5 : Math.max(5, ARGS.repeats);

    /**
     * Two integrations of the same 3-field form:
     *  - `tfr.html`     declares only `data-sap-ui-resourceroots`, which is what the README shows.
     *  - `tfr-lib.html` additionally names the library in `data-sap-ui-libs`, which is what makes
     *    UI5 fetch `library-preload.js` instead of resolving every module individually.
     * The difference between them is the entire value of the preload bundle.
     */
    const variants = [
        { file: "tfr.html", id: "load.timeToFirstRender", label: "TTFR, resourceroots only (README integration)" },
        {
            file: "tfr-lib.html",
            id: "load.timeToFirstRender.libDeclared",
            label: "TTFR, library declared in data-sap-ui-libs"
        },
        // A localhost measurement understates per-request cost to nearly nothing, which is
        // exactly the cost a bundle exists to remove. 40 ms RTT is an ordinary mobile/WAN
        // round trip and makes the request-count difference visible.
        {
            file: "tfr.html",
            id: "load.timeToFirstRender.latency40",
            label: "TTFR, resourceroots only, 40ms RTT",
            latencyMs: 40
        },
        {
            file: "tfr-lib.html",
            id: "load.timeToFirstRender.libDeclared.latency40",
            label: "TTFR, library declared, 40ms RTT",
            latencyMs: 40
        }
    ];

    for (const variant of variants) {
        const tfr = [];
        for (let i = 0; i < repeats; i++) {
            const p = await browser.newPage();
            const served = [];
            let bytes = 0;
            p.on("response", async (res) => {
                const u = res.url();
                if (!u.includes("/resources/nz/co/siliconst")) return;
                served.push(u);
                const len = Number(res.headers()["content-length"] || 0);
                if (Number.isFinite(len)) bytes += len;
            });
            await p.setCacheEnabled(false);
            if (variant.latencyMs) {
                const cdp = await p.createCDPSession();
                await cdp.send("Network.enable");
                await cdp.send("Network.emulateNetworkConditions", {
                    offline: false,
                    latency: variant.latencyMs,
                    downloadThroughput: (10 * 1024 * 1024) / 8,
                    uploadThroughput: (5 * 1024 * 1024) / 8
                });
            }
            const nav0 = Date.now();
            await p.goto(`${baseUrl}/${variant.file}`, { waitUntil: "domcontentloaded", timeout: 120000 });
            await p.waitForFunction(() => window.__tfr && window.__tfr.done === true, { timeout: 120000 });
            const wall = Date.now() - nav0;
            const s = await p.evaluate(() => window.__tfr);
            tfr.push({
                wall,
                tCoreInit: s.tCoreInit - s.t0,
                tModuleLoaded: s.tModuleLoaded - s.t0,
                tFirstRender: s.tFirstRender - s.t0,
                tMetaUIShare: s.tFirstRender - s.tCoreInit,
                domNodes: s.domNodes,
                metaUiRequests: served.length,
                metaUiBytes: bytes,
                usedPreload: served.some((u) => u.endsWith("library-preload.js")),
                metaUiUrls: served.map((u) => u.replace(baseUrl, ""))
            });
            await p.close();
        }

        record(
            "load",
            variant.id,
            variant.label,
            { fields: 3, page: variant.file, latencyMs: variant.latencyMs || 0 },
            {
                tFirstRenderFromDocStart: tfr.map((t) => t.tFirstRender),
                tMetaUIShareAfterCoreInit: tfr.map((t) => t.tMetaUIShare),
                tCoreInit: tfr.map((t) => t.tCoreInit),
                wallClockTotal: tfr.map((t) => t.wall)
            },
            {
                domNodes: tfr[0].domNodes,
                metaUiRequests: tfr[0].metaUiRequests,
                metaUiBytes: tfr[0].metaUiBytes,
                usedPreload: tfr[0].usedPreload,
                metaUiUrls: tfr[0].metaUiUrls
            }
        );
    }
}

// ------------------------------------------------------------------ main
async function main() {
    if (!DIST) {
        console.error(
            `\nERROR: no built library found. Produce one before benchmarking:\n` +
                `  npx ui5 build --dest benchmark/.dist      (benchmark-owned, survives a concurrent repo build)\n` +
                `  npm run build                             (shared dist/)\n` +
                `The harness deliberately measures the built artefact, not the TypeScript sources.\n`
        );
        process.exit(1);
    }

    fs.mkdirSync(RESULTS_DIR, { recursive: true });

    // A baseline is only comparable to another baseline taken from the same source. Record what
    // was measured, including whether the working tree was dirty: `benchmark/.dist` is built
    // separately from the run, so a dirty tree means the build and the commit may disagree.
    let git = { commit: "unknown", dirty: null };
    try {
        const { execFileSync } = require("child_process");
        const run = (args) => execFileSync("git", args, { cwd: REPO_ROOT, encoding: "utf8" }).trim();
        git = { commit: run(["rev-parse", "HEAD"]), dirty: run(["status", "--porcelain"]).length > 0 };
    } catch (e) {
        /* not a git checkout, or git unavailable */
    }

    const distBuiltAt = (() => {
        try {
            return fs.statSync(path.join(DIST_RESOURCES, "library-preload.js")).mtime.toISOString();
        } catch (e) {
            return null;
        }
    })();

    const environment = {
        timestamp: new Date().toISOString(),
        node: process.version,
        v8: process.versions.v8,
        puppeteer: require("puppeteer/package.json").version,
        platform: `${os.platform()} ${os.release()} ${os.arch()}`,
        cpuModel: os.cpus()[0] ? os.cpus()[0].model.trim() : "unknown",
        cpuCount: os.cpus().length,
        totalMemGB: Number((os.totalmem() / 1024 ** 3).toFixed(1)),
        loadAvg: os.loadavg(),
        repeats: ARGS.repeats,
        quick: ARGS.quick,
        deep: ARGS.deep,
        groups: ACTIVE,
        distSource: DIST.source,
        distPath: DIST.root,
        distBuiltAt,
        gitCommit: git.commit,
        gitDirty: git.dirty
    };

    const served = [];
    const { server, baseUrl } = await startServer({
        resourcesDir: DIST.resources,
        pageDir: PAGE_DIR,
        onServe: (e) => served.push(e)
    });

    const profileDir = path.join(os.tmpdir(), `.metaui_bench_profile_${process.pid}_${Date.now()}`);
    fs.mkdirSync(profileDir, { recursive: true });

    let browser;
    try {
        browser = await puppeteer.launch({
            headless: "new",
            userDataDir: profileDir,
            args: [
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-gpu",
                // Required for HeapProfiler.collectGarbage to be worth anything and for
                // steady heap readings; without it V8 GCs on its own schedule.
                "--js-flags=--expose-gc",
                "--disable-background-timer-throttling",
                "--disable-renderer-backgrounding",
                "--disable-backgrounding-occluded-windows"
            ]
        });
        environment.chromium = await browser.version();
        console.log(`\nMetaUI benchmark harness`);
        console.log(`  node ${environment.node} (V8 ${environment.v8}) / ${environment.chromium}`);
        console.log(`  ${environment.cpuModel} x${environment.cpuCount}, ${environment.totalMemGB}GB, ${environment.platform}`);
        console.log(
            `  repeats=${ARGS.repeats}  groups=${ACTIVE.join(",")}  quick=${ARGS.quick}  deep=${ARGS.deep}  dist=${DIST.source}`
        );

        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 900 });
        // Chromium emits this on every page that loads the UI5 CDN bootstrap; it has nothing
        // to do with MetaUI and would otherwise mask a real error in the noise.
        const BENIGN = [
            /Permissions policy violation: unload is not allowed in this document/,
            // ValidationLedger logs one line per invalid plugin; the ledger-full scenarios make
            // that happen on purpose. Counted separately below rather than treated as a failure.
            /\[MetaUI Validation\] Plugin failed validation:/
        ];
        const pageErrors = [];
        let validationLogLines = 0;
        const note = (text) => {
            if (/\[MetaUI Validation\] Plugin failed validation:/.test(text)) validationLogLines++;
            if (!BENIGN.some((re) => re.test(text))) pageErrors.push(text);
        };
        page.on("pageerror", (err) => note(err.message));
        page.on("console", (msg) => {
            if (msg.type() === "error") note("console: " + msg.text());
        });

        await page.goto(`${baseUrl}/index.html`, { waitUntil: "networkidle2", timeout: 90000 });
        await page.waitForFunction(() => window.MetaUIBench && window.MetaUIBench.ready, { timeout: 60000 });
        await page.evaluate(() => window.MetaUIBench.ready);

        if (wants("render")) await runRenderGroup(page);
        if (wants("infer")) await runInferGroup(page);
        if (wants("table")) await runTableGroup(page);
        if (wants("policy")) await runPolicyGroup(page);
        if (wants("validate")) await runValidateGroup(page);
        if (wants("memory")) await runMemoryGroup(page);
        if (wants("load")) await runLoadGroup(browser, baseUrl);

        environment.pageErrors = pageErrors;
        environment.validationLogLines = validationLogLines;
        if (pageErrors.length) {
            console.log(`\n  [warn] ${pageErrors.length} page error(s) captured during the run (see results JSON).`);
        }

        // ------------------------------------------------- curve fits
        const curves = {};
        const curveSpecs = [
            { key: "render.explicit.tTotal", group: "render", scenario: "render.explicit", x: "fields", metric: "tTotal" },
            { key: "render.inferred.tTotal", group: "render", scenario: "render.inferred", x: "fields", metric: "tTotal" },
            { key: "normalize.only", group: "render", scenario: "normalize.only", x: "fields", metric: "tNormalize" }
        ];
        for (const spec of curveSpecs) {
            const pts = records.filter((r) => r.group === spec.group && r.scenario === spec.scenario && r.params[spec.x]);
            if (pts.length >= 3) {
                curves[spec.key] = fitCurve(
                    pts.map((r) => r.params[spec.x]),
                    pts.map((r) => r.summary[spec.metric].median)
                );
            }
        }
        // Inference curves, split by which dimension was swept.
        const inferWidth = records.filter((r) => r.scenario === "infer.pure" && /pure flat/.test(r.label));
        if (inferWidth.length >= 3) {
            curves["infer.pure.width"] = fitCurve(
                inferWidth.map((r) => r.params.fields),
                inferWidth.map((r) => r.summary.tInfer.median)
            );
        }
        const inferRows = records.filter((r) => r.scenario === "infer.pure" && /rows x 15 cols/.test(r.label));
        if (inferRows.length >= 3) {
            curves["infer.pure.rows"] = fitCurve(
                inferRows.map((r) => r.params.rows),
                inferRows.map((r) => r.summary.tInfer.median)
            );
        }
        const inferDepth = records.filter((r) => r.scenario === "infer.pure" && /pure depth/.test(r.label));
        if (inferDepth.length >= 3) {
            curves["infer.pure.depth"] = fitCurve(
                inferDepth.map((r) => r.params.depth),
                inferDepth.map((r) => r.summary.tInfer.median)
            );
        }
        for (const cols of [3, 8, 15]) {
            const pts = records.filter((r) => r.scenario === "table.render" && r.params.cols === cols);
            if (pts.length >= 3) {
                curves[`table.render.${cols}cols`] = fitCurve(
                    pts.map((r) => r.params.rows),
                    pts.map((r) => r.summary.tTotal.median)
                );
            }
        }
        const polFlat = records.filter(
            (r) => r.scenario === "policy.engineOnly" && !r.meta.rows && r.params.policies
        );
        if (polFlat.length >= 3) {
            curves["policy.engineOnly.flat"] = fitCurve(
                polFlat.map((r) => r.params.policies),
                polFlat.map((r) => r.summary.tSteady.median)
            );
        }
        const storm = records.filter((r) => r.scenario === "policy.deltaStorm" && r.params.policies === 5);
        if (storm.length >= 3) {
            curves["policy.deltaStorm.rows"] = fitCurve(
                storm.map((r) => r.params.rows),
                storm.map((r) => r.summary.tResetAndEvaluate.median)
            );
        }
        for (const pol of [0, 10]) {
            const pts = records.filter(
                (r) => r.scenario === "table.addRowWithPolicies" && r.params.policies === pol
            );
            if (pts.length >= 3) {
                curves[`table.addRow.${pol}policies`] = fitCurve(
                    pts.map((r) => r.params.rows),
                    pts.map((r) => r.summary.tAddTotal.median)
                );
            }
        }
        const addRowPts = records.filter((r) => r.scenario === "table.addRow" && r.params.cols === 8);
        if (addRowPts.length >= 3) {
            curves["table.addRow.8cols"] = fitCurve(
                addRowPts.map((r) => r.params.rows),
                addRowPts.map((r) => r.summary.tAddRow.median)
            );
        }
        const valInvalid = records.filter((r) => r.scenario === "validate.change.invalid");
        if (valInvalid.length >= 3) {
            curves["validate.change.invalidLedger"] = fitCurve(
                valInvalid.map((r) => r.params.fields),
                valInvalid.map((r) => r.summary.tCommitBlock.median)
            );
            curves["validate.validateAll.invalidLedger"] = fitCurve(
                valInvalid.map((r) => r.params.fields),
                valInvalid.map((r) => r.summary.tValidateAll.median)
            );
        }
        const valFields = records.filter(
            (r) => r.scenario === "validate.change" && r.params.regex === false && !r.params.invalid
        );
        if (valFields.length >= 3) {
            curves["validate.change.fields"] = fitCurve(
                valFields.map((r) => r.params.fields),
                valFields.map((r) => r.summary.tCommitBlock.median)
            );
            curves["validate.validateAll.fields"] = fitCurve(
                valFields.map((r) => r.params.fields),
                valFields.map((r) => r.summary.tValidateAll.median)
            );
        }

        const payload = { environment, records, curves, servedRequests: served.length };
        // A relative --out is resolved against benchmark/, not the repo root, so
        // `--out=results/x.json` lands beside the default baseline instead of in a
        // directory that does not exist.
        const outPath = ARGS.out ? path.resolve(__dirname, ARGS.out) : path.join(RESULTS_DIR, "baseline.json");
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));
        console.log(`\nRaw results -> ${outPath}`);

        // Only a full default run rewrites the committed baseline report. The comment here used
        // to claim --only was covered; it was not, and a `--only=policy --quick` run duly
        // replaced the committed report with a policy-only, quick-mode partial. --quick also
        // shrinks the parameter sweeps, so its numbers are not comparable with a full run's.
        const partialRun = Boolean(ARGS.only || ARGS.quick);
        if (!ARGS.out && !partialRun) {
            const mdPath = path.join(__dirname, "BASELINE.md");
            writeReport(payload, mdPath);
            console.log(`Report      -> ${mdPath}`);
        } else {
            const why = ARGS.out ? "--out given" : `partial run (${ARGS.only ? "--only" : ""}${ARGS.only && ARGS.quick ? " " : ""}${ARGS.quick ? "--quick" : ""})`;
            console.log(`Report      -> skipped (${why}; BASELINE.md left untouched)`);
        }
    } finally {
        if (browser) await browser.close();
        server.close();
        try {
            fs.rmSync(profileDir, { recursive: true, force: true });
        } catch (e) {
            /* best effort */
        }
    }
}

// Only run when invoked directly. Requiring this file (to reuse `analysePreload`, for example)
// must not launch a browser: a second Chromium competing for cores silently corrupts the
// timings of any run already in flight.
if (require.main === module) {
    main().catch((err) => {
        console.error("\nBENCHMARK RUN FAILED:", err && err.stack ? err.stack : err);
        process.exit(1);
    });
}

module.exports = { analysePreload, resolveDist };
