/**
 * Drives the two panels the 13-check release harness does not cover:
 * the no-schema inference path (the primary production path) and the
 * 250-row table (past the old 100-row cap, now paged by `growing`).
 */
const puppeteer = require("puppeteer");

/** Override with BASE_URL to point at a different host or port. */
const BASE_URL = process.env.BASE_URL || "http://localhost:8123";

const results = [];
const check = (name, ok, detail) => results.push({ name, ok: !!ok, detail });

(async () => {
    const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1500, height: 1000 });

    const pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(String(e.message)));

    await page.goto(BASE_URL + "/index.html", { waitUntil: "networkidle0", timeout: 120000 });
    await page.waitForFunction(() => window.sap && sap.ui && sap.ui.getCore && sap.ui.getCore().isInitialized(), { timeout: 120000 });
    // Let every host finish its async generate().
    await new Promise((r) => setTimeout(r, 6000));

    const probe = await page.evaluate(() => {
        const out = {};
        const byId = (id) => sap.ui.getCore().byId(id) || Array.from(document.querySelectorAll("*"))
            .map((n) => sap.ui.getCore().byId(n.id)).find((c) => c && c.getId && c.getId().indexOf(id) !== -1);

        function walk(ctrl, acc, depth) {
            if (!ctrl || !ctrl.getMetadata || depth > 22) return acc;
            acc.push(ctrl.getMetadata().getName());
            const aggs = ctrl.mAggregations || {};
            Object.keys(aggs).forEach((k) => {
                const v = aggs[k];
                if (Array.isArray(v)) v.forEach((c) => walk(c, acc, depth + 1));
                else walk(v, acc, depth + 1);
            });
            return acc;
        }

        // --- Panel 1: inference from raw data, NO schema -------------------
        const inferred = byId("inferredHost");
        out.inferredFound = !!inferred;
        if (inferred) {
            const names = walk(inferred, [], 0);
            out.inferredControls = names.length;
            out.inferredInputs = names.filter((n) => n === "sap.m.Input").length;
            out.inferredHasDatePicker = names.indexOf("sap.m.DatePicker") !== -1;
            out.inferredHasCheckBox = names.indexOf("sap.m.CheckBox") !== -1;
            const dom = inferred.getDomRef();
            const r = dom ? dom.getBoundingClientRect() : { width: 0, height: 0 };
            out.inferredGeometry = Math.round(r.width) + "x" + Math.round(r.height);
            out.inferredVisible = r.width > 100 && r.height > 20;
            try { out.inferredData = JSON.stringify(inferred.getProperty("data")).slice(0, 160); } catch (e) { out.inferredData = "ERR " + e.message; }
        }

        // --- Panel 4: the 250-row table ------------------------------------
        const tableHost = byId("tableHost");
        out.tableHostFound = !!tableHost;
        if (tableHost) {
            let tbl = null;
            (function find(c, d) {
                if (!c || !c.getMetadata || tbl || d > 22) return;
                if (c.getMetadata().getName() === "sap.m.Table") { tbl = c; return; }
                const aggs = c.mAggregations || {};
                Object.keys(aggs).forEach((k) => {
                    const v = aggs[k];
                    if (Array.isArray(v)) v.forEach((x) => find(x, d + 1));
                    else find(v, d + 1);
                });
            })(tableHost, 0);
            out.tableFound = !!tbl;
            if (tbl) {
                out.growingEnabled = tbl.getGrowing ? tbl.getGrowing() : null;
                out.growingThreshold = tbl.getGrowingThreshold ? tbl.getGrowingThreshold() : null;
                out.painted = tbl.getItems ? tbl.getItems().length : null;
                const b = tbl.getBinding && tbl.getBinding("items");
                out.bindingLength = b && b.getLength ? b.getLength() : null;
                const gi = tbl.getGrowingInfo ? tbl.getGrowingInfo() : null;
                out.growingInfo = gi ? { actual: gi.actual, total: gi.total } : null;
            }
        }
        return out;
    });

    const p = probe;
    check("Inference host exists (no schema supplied)", p.inferredFound);
    check("Inference rendered real controls", p.inferredControls > 5, `${p.inferredControls} controls, ${p.inferredInputs} Inputs`);
    check("Inference typed a date field from raw data", p.inferredHasDatePicker, "sap.m.DatePicker present");
    check("Inference typed a boolean field from raw data", p.inferredHasCheckBox, "sap.m.CheckBox present");
    check("Inference host has real geometry", p.inferredVisible, p.inferredGeometry);
    check("Inference host exposes its data", p.inferredData && p.inferredData.indexOf("ERR") !== 0, p.inferredData);

    check("250-row table host exists", p.tableHostFound);
    check("A sap.m.Table was generated", p.tableFound);
    check("Table paging is ON (growing)", p.growingEnabled === true, `growing=${p.growingEnabled}`);
    check("One page is 100 rows", p.growingThreshold === 100, `threshold=${p.growingThreshold}`);
    check("Binding holds ALL 250 rows (no truncation)", p.bindingLength === 250, `bindingLength=${p.bindingLength}`);
    check("Only one page is painted (not all 250)", p.painted === 100, `painted=${p.painted}`);
    check("Growing counter reports the full collection", p.growingInfo && p.growingInfo.total === 250,
        p.growingInfo ? `${p.growingInfo.actual}/${p.growingInfo.total}` : "no growingInfo");
    check("No uncaught page errors", pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));

    await browser.close();

    let failed = 0;
    for (const r of results) {
        if (!r.ok) failed++;
        console.log(`  [${r.ok ? "PASS" : "FAIL"}] ${r.name}${r.detail ? " :: " + r.detail : ""}`);
    }
    console.log("\n" + "=".repeat(60));
    console.log(failed === 0 ? `ALL ${results.length} PANEL CHECKS PASSED` : `${failed} of ${results.length} PANEL CHECKS FAILED`);
    console.log("=".repeat(60));
    process.exit(failed === 0 ? 0 : 1);
})().catch((e) => { console.error("HARNESS ERROR:", e); process.exit(1); });
