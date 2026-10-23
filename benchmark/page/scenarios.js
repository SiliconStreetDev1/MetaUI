/* eslint-disable */
/**
 * @file scenarios.js
 * @description In-page benchmark scenarios for the MetaUI library. Exposed as `window.MetaUIBench`.
 *
 * Every scenario is a function `(params) => Promise<result>` that does its own setup and
 * complete teardown, so the Node driver can run any scenario any number of times in any
 * order on a single warm page without cross-contamination.
 *
 * All timings use `performance.now()` inside the page. The driver repeats each scenario
 * and reduces the samples; nothing here averages anything.
 */
(function (global) {
    "use strict";

    const F = global.MetaUIFixtures;
    let M = null; // resolved UI5 / MetaUI modules
    let mount = null; // the sap.m.VBox every host is placed into

    function now() {
        return performance.now();
    }

    function requireAsync(names) {
        return new Promise(function (resolve, reject) {
            sap.ui.require(names, function () {
                resolve(Array.prototype.slice.call(arguments));
            }, reject);
        });
    }

    const ready = (async function bootstrap() {
        await new Promise(function (resolve) {
            sap.ui.getCore().attachInit(resolve);
        });
        const mods = await requireAsync([
            "nz/co/siliconst/ui5/metaui/controls/DynamicHost",
            "nz/co/siliconst/ui5/metaui/core/DataInferenceBuilder",
            "nz/co/siliconst/ui5/metaui/core/SchemaNormalizer",
            "nz/co/siliconst/ui5/metaui/core/PolicyEngine",
            "nz/co/siliconst/ui5/metaui/core/PipelineManager",
            "nz/co/siliconst/ui5/metaui/core/PluginRegistry",
            "sap/m/VBox",
            "sap/ui/core/Core",
            "sap/ui/core/Element"
        ]);
        M = {
            DynamicHost: mods[0],
            DataInferenceBuilder: mods[1].DataInferenceBuilder,
            SchemaNormalizer: mods[2].SchemaNormalizer,
            PolicyEngine: mods[3].PolicyEngine,
            PipelineManager: mods[4].PipelineManager,
            PluginRegistry: mods[5].PluginRegistry,
            VBox: mods[6],
            Core: mods[7],
            Element: mods[8]
        };
        // PluginRegistry resolves policy condition/effect plugins with a SYNCHRONOUS
        // `sap.ui.require(path)`. If the module is not already in the AMD cache the lookup
        // returns undefined and PolicyEngine logs an error per rule per pass, so a benchmark
        // that skips this preload measures console.error throughput, not policy evaluation.
        // A real host reaches the same state via GenerationDelegate.preloadIfNeeded().
        await requireAsync([
            "nz/co/siliconst/ui5/metaui/plugins/policies/effects/BinaryEffectPlugin",
            "nz/co/siliconst/ui5/metaui/plugins/policies/conditions/StringEqualsConditionPlugin",
            "nz/co/siliconst/ui5/metaui/plugins/policies/conditions/NumericGreaterThanConditionPlugin",
            "nz/co/siliconst/ui5/metaui/plugins/policies/conditions/NumericLessThanConditionPlugin",
            "nz/co/siliconst/ui5/metaui/plugins/policies/conditions/IsNullConditionPlugin",
            "nz/co/siliconst/ui5/metaui/plugins/policies/conditions/IsNotNullConditionPlugin",
            "nz/co/siliconst/ui5/metaui/plugins/policies/conditions/DateLessThanConditionPlugin"
        ]);

        mount = new M.VBox({ width: "1100px" });
        mount.placeAt("bench-mount");
        M.Core.applyChanges();
        return true;
    })();

    // ------------------------------------------------------------------ helpers

    /** Creates a host, generates it, renders it, and returns the host plus split timings. */
    async function buildHost(settings) {
        const host = new M.DynamicHost(settings);
        mount.addItem(host);
        M.Core.applyChanges();

        const t0 = now();
        await host.generate();
        const t1 = now();
        M.Core.applyChanges();
        const t2 = now();

        return { host: host, tGenerate: t1 - t0, tApply: t2 - t1, tTotal: t2 - t0 };
    }

    function teardownHost(host) {
        try {
            mount.removeItem(host);
        } catch (e) {
            /* already detached */
        }
        host.destroy();
        M.Core.applyChanges();
    }

    function innerHost(host) {
        return host._innerHost;
    }

    function engineOf(host) {
        const inner = innerHost(host);
        return inner ? inner.engine : null;
    }

    function domNodesUnder(host) {
        const ref = host.getDomRef();
        return ref ? ref.querySelectorAll("*").length : 0;
    }

    function controlCount(host) {
        return host.findAggregatedObjects(true).length;
    }

    /** Finds the first editable input-ish control for a binding path within a host. */
    function findFieldControl(host, path) {
        const engine = engineOf(host);
        if (!engine) return null;
        const plugin = engine.getPluginByPath(path);
        if (!plugin) return null;
        return plugin.mainControl || plugin.control || null;
    }

    /** Fires a UI5 `change` event the way a committed keystroke does. */
    function commitChange(control, value) {
        if (typeof control.setValue === "function") control.setValue(value);
        control.fireChange({ value: value, newValue: value });
    }

    // ----------------------------------------------------------------- scenarios
    const scenarios = {};

    // ---- 1. render time vs field count -------------------------------------
    scenarios["render.explicit"] = async function (p) {
        const schema = F.flatSchema(p.fields);
        const data = F.flatData(p.fields);
        const r = await buildHost({ schemaDefinition: schema, data: data, editable: true, liveUpdate: false });
        const out = {
            tGenerate: r.tGenerate,
            tApply: r.tApply,
            tTotal: r.tTotal,
            plugins: engineOf(r.host) ? engineOf(r.host).getActivePlugins().length : 0,
            controls: controlCount(r.host),
            domNodes: domNodesUnder(r.host)
        };
        teardownHost(r.host);
        return out;
    };

    scenarios["render.inferred"] = async function (p) {
        const data = F.flatData(p.fields);
        const r = await buildHost({ data: data, editable: true, liveUpdate: false });
        const out = {
            tGenerate: r.tGenerate,
            tApply: r.tApply,
            tTotal: r.tTotal,
            plugins: engineOf(r.host) ? engineOf(r.host).getActivePlugins().length : 0,
            controls: controlCount(r.host),
            domNodes: domNodesUnder(r.host)
        };
        teardownHost(r.host);
        return out;
    };

    /**
     * Isolates schema normalisation (no UI5 controls at all) from the rendering cost.
     *
     * Chromium coarsens `performance.now()` to 100 us, so a sub-millisecond operation is timed
     * over an inner loop and divided. The clones are built outside the timed window because
     * `normalize` mutates its argument.
     */
    scenarios["normalize.only"] = function (p) {
        const inner = p.inner || 50;
        const schema = F.flatSchema(p.fields);
        const json = JSON.stringify(schema);
        const copies = [];
        for (let i = 0; i < inner; i++) copies.push(JSON.parse(json));
        const t0 = now();
        for (let i = 0; i < inner; i++) M.SchemaNormalizer.normalize(copies[i]);
        const t1 = now();
        return Promise.resolve({ tNormalize: (t1 - t0) / inner, inner: inner });
    };

    // ---- 2. inference ------------------------------------------------------
    /**
     * Pure inference: no UI5, no DOM. The production hot path in isolation.
     *
     * `inferSchemaFromData` is a pure function of its input, so small payloads are timed over
     * an inner loop (Chromium's `performance.now()` resolution is 100 us) and divided. Payload
     * construction is outside the timed window.
     */
    scenarios["infer.pure"] = function (p) {
        const payload = p.nestedArrays
            ? F.nestedArrayPayload(p.fields, p.depth, p.childRows || 3)
            : F.inferencePayload(p.fields, p.depth, p.rows || 0);
        const bytes = JSON.stringify(payload).length;
        const inner = p.inner || (bytes < 20000 ? 50 : bytes < 200000 ? 10 : 3);
        for (let w = 0; w < 2; w++) M.DataInferenceBuilder.inferSchemaFromData(payload);
        const t0 = now();
        let schema = null;
        for (let i = 0; i < inner; i++) schema = M.DataInferenceBuilder.inferSchemaFromData(payload);
        const t1 = now();
        const propCount = schema.properties
            ? Object.keys(schema.properties).length
            : schema.items && schema.items.properties
              ? Object.keys(schema.items.properties).length
              : 0;
        return Promise.resolve({
            tInfer: (t1 - t0) / inner,
            inner: inner,
            payloadBytes: bytes,
            topLevelProps: propCount
        });
    };

    /** End-to-end inference: raw data in, rendered control tree out. */
    scenarios["infer.e2e"] = async function (p) {
        const payload = F.inferencePayload(p.fields, p.depth, p.rows || 0);
        const bytes = JSON.stringify(payload).length;
        const r = await buildHost({ data: payload, editable: true, liveUpdate: false });
        const out = {
            tGenerate: r.tGenerate,
            tApply: r.tApply,
            tTotal: r.tTotal,
            payloadBytes: bytes,
            plugins: engineOf(r.host) ? engineOf(r.host).getActivePlugins().length : 0,
            domNodes: domNodesUnder(r.host)
        };
        teardownHost(r.host);
        return out;
    };

    // ---- 3. tables ---------------------------------------------------------
    scenarios["table.render"] = async function (p) {
        const schema = F.tableSchema(p.cols);
        const data = F.tableData(p.rows, p.cols);
        const r = await buildHost({ schemaDefinition: schema, data: data, editable: true, liveUpdate: false });
        const out = {
            tGenerate: r.tGenerate,
            tApply: r.tApply,
            tTotal: r.tTotal,
            controls: controlCount(r.host),
            domNodes: domNodesUnder(r.host)
        };
        teardownHost(r.host);
        return out;
    };

    /**
     * Correctness probe, not a timing: how many of the model's rows the generated table actually
     * renders. UI5's `sap.ui.model.Model` applies a default binding size limit of 100 contexts,
     * and nothing in MetaUI raises it, so this reports the point at which rows stop appearing.
     */
    scenarios["table.rowTruncation"] = async function (p) {
        const schema = F.tableSchema(p.cols);
        const data = F.tableData(p.rows, p.cols);
        const r = await buildHost({ schemaDefinition: schema, data: data, editable: true, liveUpdate: false });

        const table = r.host.findAggregatedObjects(true, function (c) {
            return c.getMetadata().getName() === "sap.m.Table";
        })[0];
        const binding = table ? table.getBinding("items") : null;
        const model = r.host._innerHost.stateManager ? r.host._innerHost.stateManager.getModel() : null;

        // `truncated` is deliberately NOT "fewer rows painted than the model holds". Once the
        // generated table pages (growing: true, growingThreshold: 100), painting one page while
        // the collection holds 1000 is correct behaviour, and scoring it as truncation made the
        // report read as though the row-cap defect were still live after it had been fixed.
        //
        // The defect was that rows past the binding's size limit were UNREACHABLE: present in the
        // payload, submitted, and impossible to display or scroll to. So the signal is whether the
        // binding can see the whole collection. A short painted page with a full binding is paging;
        // a short binding is data loss.
        const growingInfo = table && table.getGrowingInfo ? table.getGrowingInfo() : null;
        const bindingLength = binding && binding.getLength ? binding.getLength() : -1;
        const out = {
            modelRows: p.rows,
            renderedItems: table ? table.getItems().length : -1,
            bindingLength: bindingLength,
            modelSizeLimit: model && model.iSizeLimit !== undefined ? model.iSizeLimit : -1,
            domRows: table && table.getDomRef() ? table.getDomRef().querySelectorAll("tbody > tr").length : -1,
            growing: table && table.getGrowing ? table.getGrowing() : null,
            growingThreshold: table && table.getGrowingThreshold ? table.getGrowingThreshold() : null,
            growingReports: growingInfo ? growingInfo.actual + "/" + growingInfo.total : null,
            truncated: table ? bindingLength < p.rows : null
        };
        teardownHost(r.host);
        return out;
    };

    /** Row-clone path: presses the generated "Add Row" button and times the resulting re-render. */
    scenarios["table.addRow"] = async function (p) {
        const schema = F.tableSchema(p.cols);
        const data = F.tableData(p.rows, p.cols);
        const r = await buildHost({ schemaDefinition: schema, data: data, editable: true, liveUpdate: false });

        const addBtn = r.host.findAggregatedObjects(true, function (c) {
            return c.getMetadata().getName() === "sap.m.Button" && c.data && c.data("metauiTableAddBtn") === true;
        })[0];
        if (!addBtn) {
            teardownHost(r.host);
            throw new Error("Add Row button not found for table with " + p.cols + " cols");
        }

        const adds = p.adds || 5;
        const perAdd = [];
        for (let i = 0; i < adds; i++) {
            const t0 = now();
            addBtn.firePress();
            M.Core.applyChanges();
            perAdd.push(now() - t0);
        }
        const out = { perAdd: perAdd, domNodes: domNodesUnder(r.host) };
        teardownHost(r.host);
        return out;
    };

    // ---- 4. policy engine --------------------------------------------------
    /**
     * Cost of one committed field change on a form carrying `policies` rules.
     * `tCommit` is the synchronous path (validate + ledger + host sync, policies excluded,
     * because PolicyDelegate debounces them by 200 ms). `tPolicyEval` is the debounced work,
     * measured separately via the host's flush API.
     */
    scenarios["policy.change"] = async function (p) {
        const schema = F.policySchema(p.fields, p.policies);
        const data = F.flatData(p.fields);
        const r = await buildHost({
            schemaDefinition: schema,
            data: data,
            editable: true,
            liveUpdate: p.liveUpdate !== false
        });

        const path = F.fieldName(1); // "string" archetype -> sap.m.Input
        const ctrl = findFieldControl(r.host, path);
        if (!ctrl || typeof ctrl.fireChange !== "function") {
            teardownHost(r.host);
            throw new Error("No committable control at " + path);
        }

        const keystrokes = p.keystrokes || 10;
        const commits = [];
        const evals = [];
        for (let i = 0; i < keystrokes; i++) {
            const v = "Typed value " + i;
            const t0 = now();
            commitChange(ctrl, v);
            commits.push(now() - t0);

            const t1 = now();
            r.host._innerHost.evaluatePoliciesNow();
            evals.push(now() - t1);
        }

        // Block timings: the same work measured as one window and divided, so the figure is
        // not quantised by Chromium's 100 us clock when a single commit is sub-millisecond.
        const b0 = now();
        for (let i = 0; i < keystrokes; i++) commitChange(ctrl, "Block value " + i);
        const tCommitBlock = (now() - b0) / keystrokes;

        const b1 = now();
        for (let i = 0; i < keystrokes; i++) r.host._innerHost.evaluatePoliciesNow();
        const tPolicyEvalBlock = (now() - b1) / keystrokes;

        const out = {
            tCommit: commits,
            tPolicyEval: evals,
            tCommitBlock: tCommitBlock,
            tPolicyEvalBlock: tPolicyEvalBlock,
            policies: p.policies,
            plugins: engineOf(r.host).getActivePlugins().length
        };
        teardownHost(r.host);
        return out;
    };

    /** PolicyEngine.evaluate() in isolation: no host, no plugins, no DOM. */
    scenarios["policy.engineOnly"] = function (p) {
        const schema = p.rows
            ? F.rowPolicySchema(p.cols || 8, p.policies)
            : F.policySchema(p.fields || 50, p.policies);
        const payload = p.rows ? F.tableData(p.rows, p.cols || 8) : F.flatData(p.fields || 50);
        const engine = new M.PolicyEngine(schema.uiPolicies);

        // First pass emits full deltas; subsequent passes emit only differences, which is what
        // a steady-state keystroke actually costs. Both are reported.
        const t0 = now();
        const firstDeltas = engine.evaluate(payload);
        const t1 = now();

        // Steady-state passes are timed in blocks of `inner` and divided, because a single
        // evaluate() of a small policy set lands under Chromium's 100 us clock resolution.
        const steady = [];
        const reps = p.reps || 10;
        const inner = p.inner || 20;
        for (let i = 0; i < reps; i++) {
            const s0 = now();
            for (let k = 0; k < inner; k++) engine.evaluate(payload);
            steady.push((now() - s0) / inner);
        }
        return Promise.resolve({
            tFirstPass: t1 - t0,
            firstDeltaCount: firstDeltas.length,
            tSteady: steady,
            inner: inner,
            policies: schema.uiPolicies.length,
            rows: p.rows || 0
        });
    };

    /**
     * Isolates the registry round trip that `PolicyEngine` performs for EVERY rule on EVERY pass:
     * `getPolicyEffectPlugin()` / `getPolicyConditionPlugin()` do a synchronous `sap.ui.require()`
     * plus a `new Ctor()`. Compared against calling an already-resolved plugin instance directly,
     * this gives the exact headroom available from hoisting the lookup out of the evaluation loop.
     */
    scenarios["policy.registryLookup"] = function (p) {
        const reg = M.PluginRegistry.getInstance();
        const reps = p.reps || 20000;

        for (let w = 0; w < 1000; w++) {
            reg.getPolicyEffectPlugin("Hide");
            reg.getPolicyConditionPlugin("StringEquals");
        }

        const e0 = now();
        for (let i = 0; i < reps; i++) reg.getPolicyEffectPlugin("Hide");
        const e1 = now();

        const c0 = now();
        for (let i = 0; i < reps; i++) reg.getPolicyConditionPlugin("StringEquals");
        const c1 = now();

        const effect = reg.getPolicyEffectPlugin("Hide");
        const d0 = now();
        for (let i = 0; i < reps; i++) effect.resolveState(true, "Hide");
        const d1 = now();

        return Promise.resolve({
            tEffectLookupMicros: ((e1 - e0) / reps) * 1000,
            tConditionLookupMicros: ((c1 - c0) / reps) * 1000,
            tCachedEffectCallMicros: ((d1 - d0) / reps) * 1000,
            reps: reps
        });
    };

    /** Full host round trip for `$row`-expanded policies inside a rendered table. */
    scenarios["policy.rowExpansion"] = async function (p) {
        const schema = F.rowPolicySchema(p.cols, p.policies);
        const data = F.tableData(p.rows, p.cols);
        const r = await buildHost({ schemaDefinition: schema, data: data, editable: true, liveUpdate: false });

        const reps = p.reps || 10;
        const evals = [];
        for (let i = 0; i < reps; i++) {
            const t0 = now();
            r.host._innerHost.evaluatePoliciesNow();
            evals.push(now() - t0);
        }
        const out = {
            tPolicyEval: evals,
            policies: p.policies,
            rows: p.rows,
            expandedRules: p.policies * p.rows
        };
        teardownHost(r.host);
        return out;
    };

    /**
     * Delta-storm path. `PolicyEngine` suppresses deltas that have not changed since the last
     * pass, so steady-state evaluation emits nothing and costs only the evaluation itself.
     * `resetAndEvaluatePoliciesNow()` clears that differential matrix, so EVERY rule emits a
     * delta and every delta is applied.
     *
     * This is not a synthetic path: `Engine.onArrayMutated()` calls
     * `host.resetAndEvaluatePoliciesNow()`, so adding or deleting one table row puts the form
     * through exactly this. A delta whose target is a cloned row cell has no registered plugin,
     * so `PolicyDelegate` routes it to `Engine.applyRowPolicyState()`, which walks the whole
     * generated control tree looking for bound controls.
     */
    scenarios["policy.deltaStorm"] = async function (p) {
        const schema = F.rowPolicySchema(p.cols, p.policies);
        const data = F.tableData(p.rows, p.cols);
        const r = await buildHost({ schemaDefinition: schema, data: data, editable: true, liveUpdate: false });

        const reps = p.reps || 5;
        const storms = [];
        const steady = [];
        for (let i = 0; i < reps; i++) {
            const t0 = now();
            r.host._innerHost.resetAndEvaluatePoliciesNow();
            storms.push(now() - t0);

            const t1 = now();
            r.host._innerHost.evaluatePoliciesNow();
            steady.push(now() - t1);
        }
        const out = {
            tResetAndEvaluate: storms,
            tSteadyEvaluate: steady,
            rows: p.rows,
            cols: p.cols,
            policies: p.policies,
            expandedRules: p.rows * p.policies,
            controls: controlCount(r.host)
        };
        teardownHost(r.host);
        return out;
    };

    /**
     * The production shape of the same path: press "Add Row" on a table that carries `$row`
     * policies. `TableRowHelper.addRow` -> `Engine.onArrayMutated` -> `resetAndEvaluatePoliciesNow`.
     * Compared against `table.addRow` on an identical table with no policies, the difference is
     * the whole cost of the delta storm.
     */
    scenarios["table.addRowWithPolicies"] = async function (p) {
        const schema = p.policies > 0 ? F.rowPolicySchema(p.cols, p.policies) : F.tableSchema(p.cols);
        const data = F.tableData(p.rows, p.cols);
        const r = await buildHost({ schemaDefinition: schema, data: data, editable: true, liveUpdate: false });

        const addBtn = r.host.findAggregatedObjects(true, function (c) {
            return c.getMetadata().getName() === "sap.m.Button" && c.data && c.data("metauiTableAddBtn") === true;
        })[0];
        if (!addBtn) {
            teardownHost(r.host);
            throw new Error("Add Row button not found");
        }

        const adds = p.adds || 5;
        const press = [];
        const apply = [];
        for (let i = 0; i < adds; i++) {
            const t0 = now();
            addBtn.firePress();
            const t1 = now();
            M.Core.applyChanges();
            const t2 = now();
            press.push(t1 - t0);
            apply.push(t2 - t1);
        }
        const out = {
            perAddPress: press,
            perAddApply: apply,
            perAddTotal: press.map(function (v, i) {
                return v + apply[i];
            }),
            rows: p.rows,
            cols: p.cols,
            policies: p.policies || 0
        };
        teardownHost(r.host);
        return out;
    };

    // ---- 5. validation pipeline -------------------------------------------
    /** One committed change on a validator-heavy form, with and without a `pattern` rule. */
    scenarios["validate.change"] = async function (p) {
        const schema = F.validationSchema(p.fields, p.regex === true);
        const data = F.validationData(p.fields, p.invalid === true);
        const r = await buildHost({
            schemaDefinition: schema,
            data: data,
            editable: true,
            liveUpdate: p.liveUpdate !== false
        });

        const ctrl = findFieldControl(r.host, F.fieldName(0));
        if (!ctrl || typeof ctrl.fireChange !== "function") {
            teardownHost(r.host);
            throw new Error("No committable control for validation scenario");
        }

        // Fill the ValidationLedger before timing, so the per-change cost is measured with the
        // ledger at its realistic worst: one live entry per field.
        let ledgerEntries = 0;
        if (p.invalid === true) {
            ledgerEntries = engineOf(r.host).validateAll(true).length;
        }

        const keystrokes = p.keystrokes || 12;
        const commits = [];
        for (let i = 0; i < keystrokes; i++) {
            const t0 = now();
            commitChange(ctrl, "Sample value " + i);
            commits.push(now() - t0);
        }

        // Block timing for the same reason as in policy.change: beats clock quantisation.
        const b0 = now();
        for (let i = 0; i < keystrokes; i++) commitChange(ctrl, "Block value " + i);
        const tCommitBlock = (now() - b0) / keystrokes;

        const t1 = now();
        const errors = engineOf(r.host).validateAll(true);
        const tValidateAll = now() - t1;

        const out = {
            tCommit: commits,
            tCommitBlock: tCommitBlock,
            tValidateAll: tValidateAll,
            errorCount: errors.length,
            ledgerEntries: ledgerEntries,
            fields: p.fields,
            regex: p.regex === true,
            invalid: p.invalid === true
        };
        teardownHost(r.host);
        return out;
    };

    /** PipelineManager.runValidators() in isolation: the raw validator chain, no UI5 at all. */
    scenarios["validate.pipelineOnly"] = function (p) {
        const pm = M.PipelineManager.getInstance();
        const meta = {
            type: "string",
            required: true,
            minLength: 2,
            maxLength: 120
        };
        if (p.regex) meta.pattern = "^[A-Za-z][A-Za-z0-9 _.-]{1,119}$";
        const value = "Sample value for the validator chain";
        const reps = p.reps || 2000;

        // Warm the JIT so the measured window is steady-state, not first-call compilation.
        for (let w = 0; w < 200; w++) pm.runValidators(value, meta);

        const t0 = now();
        for (let i = 0; i < reps; i++) pm.runValidators(value, meta);
        const t1 = now();
        return Promise.resolve({ tTotal: t1 - t0, reps: reps, tPerCall: (t1 - t0) / reps, regex: !!p.regex });
    };

    // ---- 6. memory / lifecycle --------------------------------------------
    /** Create -> generate -> render -> destroy, `cycles` times. */
    scenarios["mem.hostLifecycle"] = async function (p) {
        const schema = F.flatSchema(p.fields || 30);
        const data = F.flatData(p.fields || 30);
        for (let i = 0; i < p.cycles; i++) {
            const host = new M.DynamicHost({ schemaDefinition: schema, data: data, editable: true });
            mount.addItem(host);
            M.Core.applyChanges();
            await host.generate();
            M.Core.applyChanges();
            teardownHost(host);
        }
        return { cycles: p.cycles };
    };

    /** Re-generate the SAME host instance `cycles` times (schema hot-swap). */
    scenarios["mem.regenerate"] = async function (p) {
        const schema = F.flatSchema(p.fields || 30);
        const data = F.flatData(p.fields || 30);
        const r = await buildHost({ schemaDefinition: schema, data: data, editable: true });
        for (let i = 0; i < p.cycles; i++) {
            r.host.setProperty("data", Object.assign({}, data, { Field0000: "regen " + i }));
            await r.host.generate();
            M.Core.applyChanges();
        }
        const out = { cycles: p.cycles, controls: controlCount(r.host) };
        teardownHost(r.host);
        return out;
    };

    /** Open and close a generated dialog `cycles` times on one persistent host. */
    scenarios["mem.dialog"] = async function (p) {
        const schema = F.flatSchema(p.fields || 20);
        const data = F.flatData(p.fields || 20);
        const host = new M.DynamicHost({ schemaDefinition: schema, data: data, editable: true });
        mount.addItem(host);
        M.Core.applyChanges();
        await host.generate();
        M.Core.applyChanges();

        const Dialog = await requireAsync(["sap/m/Dialog"]).then(function (m) {
            return m[0];
        });

        for (let i = 0; i < p.cycles; i++) {
            const closed = host.openInDialog("Bench " + i, "OK", "Cancel", "auto", mount);
            // openInDialog resolves only once the dialog closes, so close it on the next tick.
            await new Promise(function (resolve) {
                setTimeout(resolve, 0);
            });
            const dlg = M.Element.registry
                .filter(function (el) {
                    return el instanceof Dialog && el.isOpen && el.isOpen();
                })
                .pop();
            if (dlg) {
                dlg.getEndButton() ? dlg.getEndButton().firePress() : dlg.close();
            }
            await closed;
            M.Core.applyChanges();
            await new Promise(function (resolve) {
                setTimeout(resolve, 0);
            });
        }
        teardownHost(host);
        return { cycles: p.cycles };
    };

    /** Walk a wizard forwards and backwards `cycles` times. */
    scenarios["mem.wizardSteps"] = async function (p) {
        const steps = p.steps || 5;
        const schema = F.wizardSchema(steps, p.fieldsPerStep || 6);
        const data = F.flatData(steps * (p.fieldsPerStep || 6));
        const r = await buildHost({ schemaDefinition: schema, data: data, editable: true });

        function buttonByText(text) {
            return r.host.findAggregatedObjects(true, function (c) {
                return (
                    c.getMetadata().getName() === "sap.m.Button" &&
                    typeof c.getText === "function" &&
                    c.getText() === text
                );
            })[0];
        }

        const timings = [];
        for (let i = 0; i < p.cycles; i++) {
            for (let s = 0; s < steps - 1; s++) {
                const next = buttonByText("Next Step");
                if (!next) break;
                const t0 = now();
                next.firePress();
                M.Core.applyChanges();
                timings.push(now() - t0);
                await new Promise(function (res) {
                    setTimeout(res, 0);
                });
            }
            for (let s = steps - 1; s > 0; s--) {
                const prev = buttonByText("Previous");
                if (!prev) break;
                prev.firePress();
                M.Core.applyChanges();
                await new Promise(function (res) {
                    setTimeout(res, 0);
                });
            }
        }
        const out = { cycles: p.cycles, tStep: timings, controls: controlCount(r.host) };
        teardownHost(r.host);
        return out;
    };

    /** Add then delete a table row `cycles` times. */
    scenarios["mem.tableRowChurn"] = async function (p) {
        const cols = p.cols || 8;
        const schema = F.tableSchema(cols);
        const data = F.tableData(p.rows || 20, cols);
        const r = await buildHost({ schemaDefinition: schema, data: data, editable: true });

        const addBtn = r.host.findAggregatedObjects(true, function (c) {
            return c.getMetadata().getName() === "sap.m.Button" && c.data && c.data("metauiTableAddBtn") === true;
        })[0];
        const table = r.host.findAggregatedObjects(true, function (c) {
            return c.getMetadata().getName() === "sap.m.Table";
        })[0];
        if (!addBtn || !table) {
            teardownHost(r.host);
            throw new Error("Table or Add Row button missing");
        }

        for (let i = 0; i < p.cycles; i++) {
            addBtn.firePress();
            M.Core.applyChanges();
            const items = table.getItems();
            const last = items[items.length - 1];
            if (last) {
                table.fireDelete({ listItem: last });
                M.Core.applyChanges();
            }
        }
        const out = { cycles: p.cycles, rows: table.getItems().length, controls: controlCount(r.host) };
        teardownHost(r.host);
        return out;
    };

    /** Settles the page so a heap snapshot is not racing a pending render or timer. */
    scenarios["idle"] = async function (p) {
        M.Core.applyChanges();
        for (let i = 0; i < (p && p.ticks ? p.ticks : 5); i++) {
            await new Promise(function (resolve) {
                setTimeout(resolve, 20);
            });
        }
        return {
            uiControls: M.Element.registry.size,
            domNodes: document.querySelectorAll("*").length
        };
    };

    /** Snapshot of cheap, deterministic liveness counters (no GC involved). */
    scenarios["counters"] = function () {
        return Promise.resolve({
            uiControls: M.Element.registry.size,
            domNodes: document.querySelectorAll("*").length,
            mountItems: mount.getItems().length
        });
    };

    global.MetaUIBench = {
        ready: ready,
        scenarios: scenarios,
        run: async function (name, params) {
            await ready;
            const fn = scenarios[name];
            if (!fn) throw new Error("Unknown benchmark scenario: " + name);
            return fn(params || {});
        }
    };
})(window);
