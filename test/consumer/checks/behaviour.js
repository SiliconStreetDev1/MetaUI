/**
 * Behavioural checks for the two areas the render-only harnesses do not cover:
 * the dialog (does an edit commit? does Cancel close it?) and host embedding
 * (do two hosts in one table keep independent state?).
 *
 * Locates controls through the DOM and maps back to UI5, the way releasecheck.js does:
 * walking mAggregations misses controls UI5 renders through other routes.
 */
const puppeteer = require("puppeteer");

/** Override with BASE_URL to point at a different host or port. */
const BASE_URL = process.env.BASE_URL || "http://localhost:8123";

const results = [];
const check = (name, ok, detail) => results.push({ name, ok: !!ok, detail });

(async () => {
    const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1500, height: 1200 });
    const pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(String(e.message)));

    await page.goto(BASE_URL + "/index.html", { waitUntil: "networkidle0", timeout: 120000 });
    await page.waitForFunction(() => window.sap && sap.ui && sap.ui.getCore && sap.ui.getCore().isInitialized(), { timeout: 120000 });
    await new Promise((r) => setTimeout(r, 6000));

    // Shared helpers installed in the page.
    await page.evaluate(() => {
        window.__ui5For = (el) => {
            const core = sap.ui.getCore();
            let id = el.id.replace(/-(inner|content|BDI-content)$/, "");
            let c = core.byId(id);
            let node = el;
            while (!c && node && node.parentElement) { node = node.parentElement; c = node.id ? core.byId(node.id) : null; }
            return c || null;
        };
        window.__hostOf = (ctrl) => {
            let c = ctrl;
            while (c) {
                if (c.isA && c.isA("nz.co.siliconst.ui5.metaui.controls.DynamicHost")) return c;
                c = c.getParent ? c.getParent() : null;
            }
            return null;
        };
    });

    // ---------- host embedding ----------
    const embed = await page.evaluate(async () => {
        const out = {};
        const tableEl = document.querySelector("[id*='rowsTable']");
        if (!tableEl) return { error: "rowsTable not in the DOM" };

        const inputEls = Array.from(tableEl.querySelectorAll("input"));
        out.inputsInTable = inputEls.length;
        const pairs = inputEls.map((el) => {
            const c = window.__ui5For(el);
            return { ctrl: c, host: c ? window.__hostOf(c) : null };
        }).filter((p) => p.ctrl && p.host);
        out.inputsWithHost = pairs.length;

        const hostIds = Array.from(new Set(pairs.map((p) => p.host.getId())));
        out.distinctHosts = hostIds.length;
        if (hostIds.length < 2) return Object.assign(out, { error: `only ${hostIds.length} embedded host(s) found` });

        const a = pairs.find((p) => p.host.getId() === hostIds[0]);
        const b = pairs.find((p) => p.host.getId() === hostIds[1]);
        out.sameControl = a.ctrl.getId() === b.ctrl.getId();

        const beforeB = b.ctrl.getValue();
        a.ctrl.setValue("ROW0-EDIT");
        a.ctrl.fireChange({ value: "ROW0-EDIT" });
        sap.ui.getCore().applyChanges();
        await new Promise((r) => setTimeout(r, 800));

        out.aTook = a.ctrl.getValue() === "ROW0-EDIT";
        out.bUnchanged = b.ctrl.getValue() === beforeB;
        try {
            const da = JSON.stringify(a.host.getProperty("data") || {});
            const db = JSON.stringify(b.host.getProperty("data") || {});
            out.aHasEdit = da.indexOf("ROW0-EDIT") !== -1;
            out.bHasEdit = db.indexOf("ROW0-EDIT") !== -1;
            out.aPayload = da.slice(0, 110);
        } catch (e) { out.payloadErr = e.message; }
        return out;
    });

    if (embed.error) {
        check("Host embedding: two hosts found in the table", false, `${embed.error} (inputs in table: ${embed.inputsInTable})`);
    } else {
        check("Host embedding: a separate host renders per row", embed.distinctHosts >= 2,
            `${embed.distinctHosts} hosts, ${embed.inputsWithHost} bound inputs`);
        check("Host embedding: rows do not share a control instance", embed.sameControl === false);
        check("Host embedding: editing one row leaves the other alone", embed.aTook && embed.bUnchanged,
            `edited row took it=${embed.aTook}, other row unchanged=${embed.bUnchanged}`);
        check("Host embedding: the edit lands only in that row's payload", embed.aHasEdit && !embed.bHasEdit,
            `edited row has it=${embed.aHasEdit}, other row has it=${embed.bHasEdit} :: ${embed.aPayload}`);
    }

    // ---------- dialog ----------
    const dlg = await page.evaluate(async () => {
        const out = {};
        const el = Array.from(document.querySelectorAll("button, .sapMBtn"))
            .find((b) => /Open Schema Dialog/i.test(b.innerText || ""));
        if (!el) return { error: "open-dialog button not in the DOM" };
        const btn = window.__ui5For(el);
        if (!btn || !btn.firePress) return { error: "could not map the button to a UI5 control" };

        btn.firePress();
        await new Promise((r) => setTimeout(r, 3000));
        sap.ui.getCore().applyChanges();

        const dlgEl = document.querySelector(".sapMDialog");
        out.opened = Boolean(dlgEl);
        if (!dlgEl) return out;

        const inputEls = Array.from(dlgEl.querySelectorAll("input")).filter((i) => i.type !== "hidden");
        out.inputCount = inputEls.length;
        const first = inputEls.map((i) => window.__ui5For(i)).find((c) => c && c.setValue && c.fireChange);
        out.mappedAnInput = Boolean(first);
        if (!first) return out;

        const host = window.__hostOf(first);
        out.hostInside = Boolean(host);

        out.before = first.getValue();
        first.setValue("DIALOG-EDIT");
        first.fireChange({ value: "DIALOG-EDIT" });
        sap.ui.getCore().applyChanges();
        await new Promise((r) => setTimeout(r, 600));
        out.editTook = first.getValue() === "DIALOG-EDIT";

        // A dialog host is transactional: the edit lives in the sandbox and reaches `data` only
        // when the user confirms. So "data still holds the old value right after typing" is the
        // CORRECT state, and asserting the opposite would pin the wrong contract.
        const readData = () => { try { return JSON.stringify(host.getProperty("data") || {}); } catch (e) { return "ERR " + e.message; } };
        out.committedBeforeConfirm = readData().indexOf("DIALOG-EDIT") !== -1;

        const footBtns = Array.from(dlgEl.querySelectorAll(".sapMIBar button, .sapMDialogFooter button, footer button"));
        out.footerButtons = footBtns.length;
        const press = (el) => {
            const c = window.__ui5For(el);
            if (c && c.firePress) c.firePress(); else el.click();
        };

        // Cancel first: the edit must be discarded and the dialog must close.
        const cancelEl = footBtns.find((b) => /cancel/i.test(b.innerText || "")) || footBtns[footBtns.length - 1];
        out.cancelLabel = cancelEl ? (cancelEl.innerText || "").trim() : null;
        if (cancelEl) {
            press(cancelEl);
            await new Promise((r) => setTimeout(r, 1500));
            sap.ui.getCore().applyChanges();
        }
        out.closedAfterCancel = document.querySelectorAll(".sapMDialog").length === 0;
        out.revertedAfterCancel = readData().indexOf("DIALOG-EDIT") === -1;

        // Now reopen, edit again, and confirm: this time it must stick.
        btn.firePress();
        await new Promise((r) => setTimeout(r, 3000));
        sap.ui.getCore().applyChanges();
        const dlg2 = document.querySelector(".sapMDialog");
        out.reopened = Boolean(dlg2);
        if (!dlg2) return out;

        const input2 = Array.from(dlg2.querySelectorAll("input"))
            .filter((i) => i.type !== "hidden")
            .map((i) => window.__ui5For(i))
            .find((c) => c && c.setValue && c.fireChange);
        if (!input2) { out.secondInput = false; return out; }
        out.secondInput = true;
        input2.setValue("DIALOG-COMMIT");
        input2.fireChange({ value: "DIALOG-COMMIT" });
        sap.ui.getCore().applyChanges();
        await new Promise((r) => setTimeout(r, 400));

        const dlg2Btns = Array.from(dlg2.querySelectorAll(".sapMIBar button, .sapMDialogFooter button, footer button"));
        const okEl = dlg2Btns.find((b) => /^(ok|save|submit|confirm)$/i.test((b.innerText || "").trim())) || dlg2Btns[0];
        out.confirmLabel = okEl ? (okEl.innerText || "").trim() : null;
        if (okEl) {
            press(okEl);
            await new Promise((r) => setTimeout(r, 1800));
            sap.ui.getCore().applyChanges();
        }
        out.closedAfterConfirm = document.querySelectorAll(".sapMDialog").length === 0;
        out.committedAfterConfirm = readData().indexOf("DIALOG-COMMIT") !== -1;
        return out;
    });

    if (dlg.error) {
        check("Dialog: probe could run", false, dlg.error);
    } else {
        check("Dialog: opens from the host API", dlg.opened);
        check("Dialog: a generated form renders inside it", dlg.inputCount > 0 && dlg.mappedAnInput, `${dlg.inputCount} inputs`);
        check("Dialog: the form inside is a MetaUI host", dlg.hostInside);
        check("Dialog: an edit inside the dialog is accepted", dlg.editTook, `"${dlg.before}" -> DIALOG-EDIT`);
        check("Dialog: an uncommitted edit stays out of the payload (transactional)", dlg.committedBeforeConfirm === false,
            "data must not change until the user confirms");
        check("Dialog: Cancel closes it, leaving no dialog on screen", dlg.closedAfterCancel,
            `${dlg.footerButtons} footer buttons, cancel="${dlg.cancelLabel}"`);
        check("Dialog: Cancel discards the edit", dlg.revertedAfterCancel);
        check("Dialog: it can be reopened after cancelling", dlg.reopened && dlg.secondInput);
        check("Dialog: Confirm closes it", dlg.closedAfterConfirm, `confirm="${dlg.confirmLabel}"`);
        check("Dialog: Confirm commits the edit to the payload", dlg.committedAfterConfirm);
    }

    check("No uncaught page errors during either probe", pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));

    await browser.close();
    let failed = 0;
    for (const r of results) {
        if (!r.ok) failed++;
        console.log(`  [${r.ok ? "PASS" : "FAIL"}] ${r.name}${r.detail ? " :: " + r.detail : ""}`);
    }
    console.log("\n" + "=".repeat(60));
    console.log(failed === 0 ? `ALL ${results.length} BEHAVIOUR CHECKS PASSED` : `${failed} of ${results.length} FAILED`);
    console.log("=".repeat(60));
    process.exit(failed === 0 ? 0 : 1);
})().catch((e) => { console.error("HARNESS ERROR:", e); process.exit(1); });
