// End-to-end verification of the packed @siliconst/metaui tarball running as an
// installed npm dependency in a real UI5 Tooling app. Fails loudly; no silent passes.
const path = require("path");
const puppeteer = require("puppeteer");

/** Override with BASE_URL to point at a different host or port. */
const BASE_URL = process.env.BASE_URL || "http://localhost:8123";

const results = [];
function check(name, ok, detail) {
    results.push({ name, ok, detail });
    console.log(`  [${ok ? "PASS" : "FAIL"}] ${name}${detail ? " :: " + detail : ""}`);
}

(async () => {
    const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox", "--window-size=1500,1000"] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1500, height: 1000 });

    const consoleErrors = [];
    const pageErrors = [];
    const failedRequests = [];
    // favicon.ico is served by nobody in a ui5-serve app; it is not a library defect.
    const isFavicon = (u) => /favicon\.ico/i.test(u);
    let faviconMisses = 0;
    page.on("console", (m) => {
        if (m.type() !== "error") return;
        const loc = (m.location() && m.location().url) || "";
        if (isFavicon(loc)) { faviconMisses += 1; return; }
        consoleErrors.push(`${m.text()} @ ${loc || "unknown"}`);
    });
    page.on("pageerror", (e) => pageErrors.push(e.message));
    page.on("requestfailed", (r) => { if (!isFavicon(r.url())) failedRequests.push(`${r.url()} :: ${r.failure() && r.failure().errorText}`); });
    page.on("response", (r) => { if (r.status() >= 400 && !isFavicon(r.url())) failedRequests.push(`${r.url()} -> HTTP ${r.status()}`); });

    await page.goto(BASE_URL + "/index.html", { waitUntil: "networkidle2", timeout: 90000 });
    await page.waitForFunction("document.querySelectorAll('input').length > 3", { timeout: 60000 });
    await new Promise((r) => setTimeout(r, 2500));

    // 1. The library actually loaded from node_modules, not from a stale copy.
    const libInfo = await page.evaluate(() => {
        const lib = sap.ui.getCore ? sap.ui.getCore().getLoadedLibraries() : null;
        return {
            present: !!(lib && lib["nz.co.siliconst.ui5.metaui"]),
            version: lib && lib["nz.co.siliconst.ui5.metaui"] ? lib["nz.co.siliconst.ui5.metaui"].version : null
        };
    });
    check("Library nz.co.siliconst.ui5.metaui loaded", libInfo.present, "version " + libInfo.version);
    check("Reports version 2.0.0", libInfo.version === "2.0.0", "got " + libInfo.version);

    // 2. Phase 17.1 -- schema.title must render exactly once in the declarative form.
    const titleCount = await page.evaluate(() => {
        const panel = [...document.querySelectorAll(".sapMPanel")].find((p) =>
            (p.textContent || "").includes("Declarative form"));
        if (!panel) return -1;
        const host = panel.querySelector("[id*='declarativeHost']");
        if (!host) return -2;
        return (host.textContent.match(/Purchase Order/g) || []).length;
    });
    check("Phase 17.1: schema.title renders exactly once", titleCount === 1, "occurrences = " + titleCount);

    // 3. Host renders real geometry (not collapsed, not zero-size).
    const geom = await page.evaluate(() => {
        const host = document.querySelector("[id*='declarativeHost']");
        if (!host) return null;
        const r = host.getBoundingClientRect();
        return { w: Math.round(r.width), h: Math.round(r.height), inputs: host.querySelectorAll("input").length };
    });
    check("Declarative host has real geometry", !!geom && geom.w > 200 && geom.h > 50,
        geom ? `${geom.w}x${geom.h}, ${geom.inputs} inputs` : "host not found");

    // 4. Containment -- no element may overflow the document horizontally.
    const overflow = await page.evaluate(() => ({
        docScrollW: document.documentElement.scrollWidth,
        docClientW: document.documentElement.clientWidth
    }));
    check("No page-level horizontal overflow", overflow.docScrollW <= overflow.docClientW + 2,
        `scrollW ${overflow.docScrollW} vs clientW ${overflow.docClientW}`);

    // 5. Table embedding -- hosts inside the middle column stay inside their cell.
    const tableInfo = await page.evaluate(() => {
        const table = document.querySelector("[id*='rowsTable']");
        if (!table) return null;
        const cells = [...table.querySelectorAll("td")].filter((td) => td.querySelector("[id*='__host'], .sapMPanel, [data-sap-ui]"));
        const hosts = [...table.querySelectorAll("td")].map((td) => {
            const h = td.querySelector("div[id*='__']");
            if (!h) return null;
            const tr = td.getBoundingClientRect(), hr = h.getBoundingClientRect();
            return { cellW: Math.round(tr.width), hostW: Math.round(hr.width), overflows: hr.width > tr.width + 2 };
        }).filter(Boolean);
        return { rows: table.querySelectorAll("tbody tr").length, cells: cells.length, hosts,
            anyOverflow: hosts.some((h) => h.overflows) };
    });
    check("Table rows rendered", !!tableInfo && tableInfo.rows > 0, tableInfo ? tableInfo.rows + " rows" : "table not found");
    check("No host overflows its table cell", !!tableInfo && !tableInfo.anyOverflow,
        tableInfo ? tableInfo.hosts.filter((h) => h.overflows).length + " overflowing of " + tableInfo.hosts.length : "n/a");

    // 6. Live interaction -- typing into a generated field must reach the model.
    const typed = await page.evaluate(async () => {
        const host = document.querySelector("[id*='declarativeHost']");
        const input = host && host.querySelector("input:not([readonly]):not([disabled])");
        if (!input) return { ok: false, why: "no editable input" };
        const ui5 = sap.ui.getCore().byId(input.id.replace(/-inner$/, ""));
        if (!ui5 || !ui5.setValue) return { ok: false, why: "no UI5 control for input" };
        ui5.setValue("PO-DEADBEEF");
        ui5.fireChange({ value: "PO-DEADBEEF" });
        await new Promise((r) => setTimeout(r, 400));
        const hostCtrl = sap.ui.getCore().byId(host.id);
        const out = hostCtrl && hostCtrl.getProperty ? hostCtrl.getProperty("outputData") : null;
        return { ok: !!out && JSON.stringify(out).includes("PO-DEADBEEF"), payload: JSON.stringify(out).slice(0, 160) };
    });
    check("Edit propagates to outputData", typed.ok, typed.payload || typed.why);

    // 7. Dialog path -- openInDialog must open and show the title once in the form.
    // A raw DOM click does not reliably reach UI5's press handler; fire it on the control.
    const dialog = await page.evaluate(async () => {
        const el = [...document.querySelectorAll("button, .sapMBtn")]
            .find((b) => /Open Schema Dialog/i.test(b.innerText || ""));
        const btn = el && sap.ui.getCore().byId(el.id.replace(/-(inner|content|BDI-content)$/, ""));
        if (!btn || typeof btn.firePress !== "function") return { ok: false, why: "dialog button control not found" };
        btn.firePress();
        await new Promise((r) => setTimeout(r, 2500));
        const dlg = document.querySelector(".sapMDialog");
        if (!dlg) return { ok: false, why: "no dialog opened" };
        const content = dlg.querySelector(".sapMDialogScrollCont") || dlg;
        return { ok: true, inForm: (content.textContent.match(/Purchase Order/g) || []).length,
            inputs: dlg.querySelectorAll("input").length };
    });
    check("openInDialog opens a dialog", dialog.ok, dialog.why || `${dialog.inputs} inputs`);
    if (dialog.ok) {
        check("Dialog form body shows the title at most once", dialog.inForm <= 1, "occurrences = " + dialog.inForm);
    }

    // 8. Clean console.
    const ignorable = (t) => /favicon|DevTools|sap-ui-debug/i.test(t);
    const realConsole = consoleErrors.filter((t) => !ignorable(t));
    const realFailed = failedRequests.filter((t) => !ignorable(t));
    check("No uncaught page errors", pageErrors.length === 0, pageErrors.slice(0, 2).join(" | "));
    check("No console errors", realConsole.length === 0, realConsole.slice(0, 2).join(" | "));
    check("No failed network requests", realFailed.length === 0, realFailed.slice(0, 2).join(" | "));

    await page.screenshot({ path: path.join(__dirname, "release-verify.png"), fullPage: false });
    await browser.close();

    const failed = results.filter((r) => !r.ok);
    console.log("\n" + "=".repeat(60));
    console.log(failed.length === 0
        ? `ALL ${results.length} RELEASE CHECKS PASSED`
        : `${failed.length} of ${results.length} CHECKS FAILED: ` + failed.map((f) => f.name).join("; "));
    console.log("=".repeat(60));
    process.exit(failed.length === 0 ? 0 : 1);
})().catch((e) => { console.error("HARNESS ERROR:", e.message); process.exit(2); });
