/**
 * @file run-browser-matrix.js
 * @description Cross-engine (Blink / Gecko / WebKit) compatibility harness for MetaUI.
 *
 * Why this exists: every MetaUI test to date ran in headless Chromium. SAPUI5's own support
 * matrix (https://ui5.sap.com/docs/topics/74b59efa0eef48988d3b716bd0ecc933.html) covers Chrome
 * and Edge (Blink), Firefox (Gecko, Windows) and Safari (WebKit, macOS/iOS), so all three
 * engines are inside the library's supported scope and all three are exercised here.
 *
 * It renders the SAME standalone consumer page and the SAME fixture the Chromium gate in
 * `scripts/run-tests.js` renders (see fixtures.js), plus a generated schema that covers all
 * registered (type, widget) mappings (see widget-matrix.js), and measures real geometry,
 * real input, real device-API degradation and real Intl output on each engine.
 *
 * Usage (from this directory):
 *   npm install                     # Playwright, kept out of the root package.json
 *   npm run install-browsers        # ~250MB of Chromium + Firefox + WebKit
 *   node run-browser-matrix.js                       # all three engines
 *   node run-browser-matrix.js --engines=firefox     # one engine
 *   node run-browser-matrix.js --gate=chromium       # only Chromium failures set exit 1
 *   node run-browser-matrix.js --headed              # watch it
 *
 * Requires `npm run build` at the repo root first (it serves dist/resources).
 * This harness is read-only on everything outside test/browsers/.
 */

const fs = require("fs");
const path = require("path");
const playwright = require("playwright");

const { startServer } = require("./server");
const { CONSUMER_ALL_WIDGETS_SCHEMA, CONSUMER_ALL_WIDGETS_DATA } = require("./fixtures");
const { buildWidgetMatrixFixture, MAPPINGS } = require("./widget-matrix");
const probes = require("./probes");

const ENGINES = ["chromium", "firefox", "webkit"];
const REPORT_DIR = path.join(__dirname, "reports");

const argv = process.argv.slice(2);
const argValue = (name, fallback) => {
    const hit = argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : fallback;
};
const selectedEngines = argValue("engines", ENGINES.join(",")).split(",").map((s) => s.trim()).filter(Boolean);
const gateEngines = argValue("gate", "chromium").split(",").map((s) => s.trim()).filter(Boolean);
const headed = argv.includes("--headed");

for (const e of selectedEngines) {
    if (!ENGINES.includes(e)) throw new Error(`Unknown engine '${e}'. Known: ${ENGINES.join(", ")}`);
}

/**
 * Console errors the Chromium gate already treats as intentional, plus the engine-specific
 * noise that is provably not MetaUI's: anything matched here is recorded as `benign` and
 * reported separately rather than dropped, so nothing becomes invisible.
 */
const BENIGN_CONSOLE = [
    { re: /Permissions policy violation: unload is not allowed in this document/, why: "Chromium deprecation notice from the SAPUI5 CDN bootstrap registering an 'unload' listener. Framework, not MetaUI." },
    { re: /\[MetaUI Validation\] Plugin failed validation:/, why: "ValidationLedger logging an intentionally invalid fixture value." },
    { re: /Content-Security-Policy|Tracking Protection|dom\.webnotifications/, why: "Browser-chrome notice, not page script." },
    // The hardware probe deliberately presses camera, voiceInput, and geolocation with NO permission granted.
    // MetaUI logging the refusal via BaseHardwareControl.reportCapabilityFailure is rule 2 ("fail loudly")
    // working as designed, so it is counted and shown in benign console output rather than failing the engine.
    {
        re: /(Failed to access camera:|Camera (could not be used|is not available in this browser|access was blocked|did not respond in time)\.).*CameraControl/,
        why: "Expected: hardware probe exercises CameraControl with no permission or hardware granted; BaseHardwareControl.reportCapabilityFailure logs and stays alive."
    },
    {
        re: /(Failed to acquire geolocation:|Location (could not be used|is not available in this browser|access was blocked|did not respond in time)\.).*GeolocationControl/,
        why: "Expected: hardware probe presses locate with no permission granted; BaseHardwareControl.reportCapabilityFailure logs and stays alive."
    },
    {
        re: /(Speech recognition (could not be used|is not available in this browser|access was blocked|did not respond in time)\.).*VoiceInputControl/,
        why: "Expected: hardware probe exercises VoiceInputControl on engines without Web Speech API; BaseHardwareControl.reportCapabilityFailure logs and stays alive."
    }
];

const isBenign = (text) => BENIGN_CONSOLE.find((b) => b.re.test(text));

const withTimeout = (promise, ms, label) =>
    Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error(`TIMEOUT after ${ms}ms in ${label}`)), ms))
    ]);

/** Runs one probe and records the failure instead of aborting the engine's whole run. */
async function step(record, name, ms, fn) {
    const t0 = Date.now();
    try {
        const value = await withTimeout(fn(), ms, name);
        record.steps[name] = { ok: true, ms: Date.now() - t0, value };
        return value;
    } catch (err) {
        record.steps[name] = { ok: false, ms: Date.now() - t0, error: (err && err.message) || String(err) };
        record.failures.push(`${name}: ${(err && err.message) || String(err)}`);
        return null;
    }
}

async function runEngine(engineName, baseUrl, widgetMatrixFixture) {
    const record = {
        engine: engineName,
        browserVersion: null,
        startedAt: new Date().toISOString(),
        steps: {},
        failures: [],
        console: { errors: [], warnings: [], benign: [] },
        pageErrors: [],
        unhandledRejections: [],
        failedRequests: [],
        totalMs: 0
    };
    const t0 = Date.now();

    const browser = await playwright[engineName].launch({ headless: !headed });
    record.browserVersion = browser.version();

    // locale + timezone are pinned so that any Intl difference is an engine/ICU difference
    // rather than a difference between the machines or profiles the engines run in.
    const context = await browser.newContext({
        viewport: { width: 1280, height: 900 },
        locale: "en-US",
        timezoneId: "UTC"
    });
    // Deliberately NO permissions granted: camera / microphone / geolocation must be probed on
    // the denial path, which is what a real user who refuses the prompt sees.

    await context.addInitScript(() => {
        window.__mxRejections = [];
        window.addEventListener("unhandledrejection", (e) => {
            const r = e && e.reason;
            window.__mxRejections.push(r && r.message ? r.message : String(r));
        });
    });

    const page = await context.newPage();
    page.on("console", (msg) => {
        const text = msg.text();
        if (msg.type() === "error") {
            const benign = isBenign(text);
            if (benign) record.console.benign.push({ text, why: benign.why });
            else record.console.errors.push(text);
        } else if (msg.type() === "warning") {
            record.console.warnings.push(text);
        }
    });
    page.on("pageerror", (err) => record.pageErrors.push((err && err.message) || String(err)));
    page.on("requestfailed", (req) => {
        const u = req.url();
        if (u.includes("/resources/") || u.includes("/mockData/") || u.includes("ui5.sap.com")) {
            record.failedRequests.push(`${req.method()} ${u} -> ${(req.failure() && req.failure().errorText) || "unknown"}`);
        }
    });
    page.on("response", (res) => {
        const u = res.url();
        // UI5's ResourceBundle probes locale-specific .properties before falling back to the base
        // file, so a 404 there is the framework's normal path, not a broken asset.
        if (res.status() >= 400 && (u.includes("/resources/") || u.includes("/mockData/")) && !(u.endsWith(".properties") && res.status() === 404)) {
            record.failedRequests.push(`HTTP ${res.status()} for ${u}`);
        }
    });

    try {
        // ---- 1. Does it load at all -------------------------------------------------
        await step(record, "load", 90000, async () => {
            // Loaded with UI5's stock configuration on purpose: the log level a real consumer
            // runs at is part of what the silentDegradation probe measures.
            await page.goto(`${baseUrl}/standalone-consumer.html`, { waitUntil: "load", timeout: 80000 });
            await page.waitForFunction(() => typeof window.sap !== "undefined" && window.sap.ui && window.sap.ui.getCore, null, { timeout: 60000 });
            return { url: page.url() };
        });
        const boot = await step(record, "bootstrap", 90000, () => page.evaluate(probes.bootstrap));
        if (!boot) {
            record.totalMs = Date.now() - t0;
            await browser.close();
            return record;
        }

        // ---- 2. The shipped consumer fixture (same tree the Chromium gate asserts) ----
        await step(record, "renderConsumer", 120000, () =>
            page.evaluate(probes.renderFixture, { label: "consumer", schema: CONSUMER_ALL_WIDGETS_SCHEMA, data: CONSUMER_ALL_WIDGETS_DATA, containerWidth: "1000px" })
        );

        // ---- 3. Every registered (type, widget) mapping ------------------------------
        await step(record, "renderAllMappings", 120000, () =>
            page.evaluate(probes.renderFixture, { label: "mappings", schema: widgetMatrixFixture.schema, data: widgetMatrixFixture.data, containerWidth: "1000px" })
        );
        await step(record, "teardownMappings", 30000, () => page.evaluate(probes.teardownFixture, { label: "mappings" }));

        // ---- 4. Layout + containment at two container widths -------------------------
        await step(record, "labelPlacementWide", 30000, () =>
            page.evaluate(probes.probeLabelPlacement, { label: "consumer", fields: ["Title", "Qty", "Notes", "Category"] })
        );
        await step(record, "renderNarrow", 120000, () =>
            page.evaluate(probes.renderFixture, { label: "narrow", schema: CONSUMER_ALL_WIDGETS_SCHEMA, data: CONSUMER_ALL_WIDGETS_DATA, containerWidth: "400px" })
        );
        await step(record, "labelPlacementNarrow", 30000, () =>
            page.evaluate(probes.probeLabelPlacement, { label: "narrow", fields: ["Title", "Qty", "Notes", "Category"] })
        );
        await step(record, "teardownNarrow", 30000, () => page.evaluate(probes.teardownFixture, { label: "narrow" }));

        // ---- 5. Real keyboard input through the engine's own input stack -------------
        const targets = await step(record, "interactionTargets", 20000, () => page.evaluate(probes.collectInteractionTargets, { label: "consumer" }));
        if (targets && targets.titleId) {
            await step(record, "typeIntoField", 40000, async () => {
                const sel = `[id="${targets.titleId}-inner"]`;
                const locator = page.locator(sel);
                await locator.scrollIntoViewIfNeeded();
                await locator.click();
                await locator.fill("");
                await locator.type("Typed By Engine", { delay: 12 });
                await page.keyboard.press("Tab");
                await page.waitForTimeout(250);
                const after = await page.evaluate(probes.readHostValue, { label: "consumer" });
                return { selector: sel, domValue: await locator.inputValue(), modelTitle: after.outputData ? after.outputData.Title : null };
            });
        }

        // ---- 6. Pickers / popovers ---------------------------------------------------
        await step(record, "pickers", 40000, () => page.evaluate(probes.probePickers, { label: "consumer" }));

        // ---- 7. Hardware controls on the denial path ---------------------------------
        await step(record, "hardware", 90000, () => page.evaluate(probes.probeHardware, { label: "consumer" }));
        await step(record, "silentDegradation", 60000, () => page.evaluate(probes.probeSilentDegradation, { label: "consumer" }));

        // Real pointer drag on the signature canvas, then read the pixels back.
        await step(record, "signatureDraw", 40000, async () => {
            const canvas = page.locator('canvas[id$="-sig-canvas"]').first();
            await canvas.scrollIntoViewIfNeeded();
            const box = await canvas.boundingBox();
            if (!box) return { error: "signature canvas has no bounding box" };
            await page.mouse.move(box.x + 20, box.y + 20);
            await page.mouse.down();
            await page.mouse.move(box.x + 80, box.y + 60, { steps: 10 });
            await page.mouse.move(box.x + 160, box.y + 30, { steps: 10 });
            await page.mouse.up();
            await page.waitForTimeout(200);
            const pixels = await page.evaluate(probes.probeSignaturePixels, { label: "consumer", canvasId: await canvas.getAttribute("id") });
            return { box: { w: Math.round(box.width), h: Math.round(box.height) }, ...pixels };
        });

        // ---- 8. Intl / formatting ----------------------------------------------------
        await step(record, "formatting", 30000, () => page.evaluate(probes.probeFormatting));
        await step(record, "dateParsing", 30000, () => page.evaluate(probes.probeDateParsing));

        // ---- 9. Layouts, table row cloning, dialog lifecycle, model sync -------------
        await step(record, "layoutsAndDialog", 120000, () => page.evaluate(probes.probeLayoutsAndDialog));
        await step(record, "modelSync", 90000, () => page.evaluate(probes.probeModelSync));

        await step(record, "teardownConsumer", 30000, () => page.evaluate(probes.teardownFixture, { label: "consumer" }));

        record.unhandledRejections = await page.evaluate(() => window.__mxRejections || []);

        // A touch-enabled context: SAPUI5 supports Safari on iOS/iPadOS and Chrome on Android,
        // and SignatureControl has a touch drawing path a desktop pointer never reaches.
        await step(record, "signatureTouch", 90000, async () => {
            const touchContext = await browser.newContext({
                viewport: { width: 420, height: 820 },
                locale: "en-US",
                timezoneId: "UTC",
                hasTouch: true,
                isMobile: engineName === "chromium" ? true : undefined
            });
            try {
                const p3 = await touchContext.newPage();
                await p3.goto(`${baseUrl}/standalone-consumer.html`, { waitUntil: "load", timeout: 60000 });
                await p3.waitForFunction(() => typeof window.sap !== "undefined" && window.sap.ui && window.sap.ui.getCore, null, { timeout: 45000 });
                await p3.evaluate(probes.bootstrap);
                return await p3.evaluate(probes.probeSignatureTouch);
            } finally {
                await touchContext.close().catch(() => {});
            }
        });

        // A second context where geolocation IS granted, so "nothing happened" in the denial
        // probe can be separated from "the success path is broken on this engine".
        await step(record, "geolocationGranted", 90000, async () => {
            const grantedContext = await browser.newContext({
                viewport: { width: 1000, height: 800 },
                locale: "en-US",
                timezoneId: "UTC",
                permissions: ["geolocation"],
                geolocation: { latitude: -36.8485, longitude: 174.7633 }
            });
            try {
                const p2 = await grantedContext.newPage();
                await p2.goto(`${baseUrl}/standalone-consumer.html`, { waitUntil: "load", timeout: 60000 });
                await p2.waitForFunction(() => typeof window.sap !== "undefined" && window.sap.ui && window.sap.ui.getCore, null, { timeout: 45000 });
                await p2.evaluate(probes.bootstrap);
                return await p2.evaluate(probes.probeGeolocationGranted);
            } finally {
                await grantedContext.close().catch(() => {});
            }
        });
    } finally {
        record.totalMs = Date.now() - t0;
        await browser.close().catch(() => {});
    }
    return record;
}

// ---------------------------------------------------------------------------------
// Verdicts: the Node side decides what a measurement means, so every row of the
// printed matrix can be traced to a number the browser actually produced.
// ---------------------------------------------------------------------------------

function verdicts(record, widgetMatrixFixture) {
    const v = [];
    const s = (n) => record.steps[n];
    const val = (n) => (s(n) && s(n).ok ? s(n).value : null);

    const push = (capability, status, detail) => v.push({ capability, status, detail });

    // Load
    if (!s("load") || !s("load").ok) {
        push("Library loads", "FAIL", (s("load") && s("load").error) || "step never ran");
        return v;
    }
    const boot = val("bootstrap");
    push("Library loads", boot ? "PASS" : "FAIL", boot ? `UI5 ${boot.ui5Version}; UI5 Device says ${boot.ui5DetectedBrowser}` : (s("bootstrap") && s("bootstrap").error) || "");

    // Consumer fixture
    const consumer = val("renderConsumer");
    if (!consumer) {
        push("Consumer form renders", "FAIL", (s("renderConsumer") && s("renderConsumer").error) || "");
    } else {
        const covered = (p) => consumer.activePaths.includes(p) || consumer.boundPaths.some((b) => b === p || b.indexOf(p + "/") === 0);
        const missing = consumer.expectedPaths.filter((p) => !covered(p));
        push(
            "Consumer form renders",
            consumer.generateError || missing.length ? "FAIL" : "PASS",
            `${consumer.expectedPaths.length - missing.length}/${consumer.expectedPaths.length} properties covered, ${consumer.activePaths.length} active plugins, generate ${consumer.generateMs}ms` +
                (missing.length ? `; MISSING: ${missing.join(", ")}` : "") +
                (consumer.generateError ? `; generate error: ${consumer.generateError}` : "")
        );
        push(
            "Consumer widgets non-zero geometry",
            consumer.zeroGeometry.length ? "FAIL" : "PASS",
            consumer.zeroGeometry.length ? consumer.zeroGeometry.join(", ") : `all ${consumer.activePaths.length} widgets have a painted box`
        );
        push(
            "Host sizing contract (min-width:0 / max-width:100% / border-box)",
            consumer.hostComputed && consumer.hostComputed.minWidth === "0px" && consumer.hostComputed.boxSizing === "border-box" ? "PASS" : "FAIL",
            JSON.stringify(consumer.hostComputed)
        );
        push(
            "Widgets contained in host box (1000px)",
            consumer.overflowing.length ? "FAIL" : "PASS",
            consumer.overflowing.length ? consumer.overflowing.join(", ") : `host ${consumer.hostBox && consumer.hostBox.w}px, no child crosses its right edge`
        );
    }

    // All registered mappings
    const mappings = val("renderAllMappings");
    if (!mappings) {
        push(`All ${MAPPINGS.length} (type,widget) mappings render`, "FAIL", (s("renderAllMappings") && s("renderAllMappings").error) || "");
    } else {
        const covered = (p) => mappings.activePaths.includes(p) || mappings.boundPaths.some((b) => b === p || b.indexOf(p + "/") === 0);
        const missing = widgetMatrixFixture.index.filter((m) => !covered(m.key));
        push(
            `All ${MAPPINGS.length} (type,widget) mappings render`,
            missing.length || mappings.generateError ? "FAIL" : "PASS",
            `${MAPPINGS.length - missing.length}/${MAPPINGS.length} mapped properties produced a control` +
                (missing.length ? `; MISSING: ${missing.map((m) => `${m.type}:${m.widget || "(base)"}`).join(", ")}` : "")
        );
        push(
            `All mappings non-zero geometry`,
            mappings.zeroGeometry.length ? "FAIL" : "PASS",
            mappings.zeroGeometry.length ? mappings.zeroGeometry.join(", ") : `${mappings.activePaths.length} widgets painted`
        );
    }

    // Responsive label placement
    const wide = val("labelPlacementWide");
    const narrow = val("labelPlacementNarrow");
    const narrowRender = val("renderNarrow");
    if (wide && narrow) {
        const w = Object.entries(wide.fields).map(([k, f]) => `${k}=${f.placement || f.error}`).join(" ");
        const n = Object.entries(narrow.fields).map(([k, f]) => `${k}=${f.placement || f.error}`).join(" ");
        const reflowed = Object.keys(wide.fields).some(
            (k) => wide.fields[k].placement === "beside" && narrow.fields[k] && narrow.fields[k].placement === "above"
        );
        push("ResponsiveGridLayout breakpoint reflow", reflowed ? "PASS" : "WARN", `1000px container: ${w} | 400px container: ${n}`);
    }
    if (narrowRender) {
        push(
            "Containment at 400px (flex min-width:auto)",
            narrowRender.overflowing.length ? "FAIL" : "PASS",
            narrowRender.overflowing.length
                ? `${narrowRender.overflowing.length} widgets overflow the 400px host: ${narrowRender.overflowing.slice(0, 6).join(", ")}${narrowRender.overflowing.length > 6 ? ", ..." : ""}`
                : `host ${narrowRender.hostBox && narrowRender.hostBox.w}px, nothing crosses its right edge`
        );
    }

    // Input
    const typed = val("typeIntoField");
    if (typed) {
        push(
            "Typing + change event reaches the model",
            typed.domValue === "Typed By Engine" && typed.modelTitle === "Typed By Engine" ? "PASS" : "FAIL",
            `DOM="${typed.domValue}" model="${typed.modelTitle}"`
        );
    } else {
        push("Typing + change event reaches the model", "FAIL", (s("typeIntoField") && s("typeIntoField").error) || "no input target found");
    }

    const pickers = val("pickers");
    if (pickers) {
        push("Select popover opens", pickers.select && pickers.select.opened ? "PASS" : "FAIL", JSON.stringify(pickers.select));
        push("DatePicker calendar opens", pickers.datePicker && pickers.datePicker.opened ? "PASS" : "FAIL", JSON.stringify(pickers.datePicker));
    }

    // Hardware
    const hw = val("hardware");
    if (hw) {
        const grade = (name, obj, extra) => {
            if (!obj) return push(`Hardware: ${name}`, "FAIL", "control not found");
            const threw = obj.pressThrew || obj.secondPressThrew;
            push(`Hardware: ${name}`, threw ? "FAIL" : "PASS", `${threw ? `THREW: ${threw}; ` : "degraded without throwing; "}${extra(obj)}`);
        };
        grade("camera (getUserMedia)", hw.camera, (o) => `video box ${o.videoBox.w}x${o.videoBox.h}, stream=${o.streamAcquired}, button now "${o.buttonTextAfter}"`);
        grade(
            "voiceInput (Web Speech)",
            hw.voiceInput,
            (o) =>
                `speechApi=${o.speechApiPresent}, input ${o.inputBox.w}px, after press 1: isRecording=${o.isRecordingAfterPress} button=${o.buttonTypeAfter}, after press 2: isRecording=${o.isRecordingAfterSecondPress} button=${o.buttonTypeAfterSecondPress}`
        );
        if (hw.voiceInput && hw.voiceInput.speechApiPresent) {
            push(
                "voiceInput recording state resets after toggle off",
                hw.voiceInput.isRecordingAfterSecondPress === false && hw.voiceInput.buttonTypeAfterSecondPress === "Default" ? "PASS" : "FAIL",
                `press 1 -> isRecording=${hw.voiceInput.isRecordingAfterPress}/${hw.voiceInput.buttonTypeAfter}; press 2 -> isRecording=${hw.voiceInput.isRecordingAfterSecondPress}/${hw.voiceInput.buttonTypeAfterSecondPress}`
            );
        }
        grade("geolocation", hw.geolocation, (o) => `api=${o.apiPresent}, value "${o.valueBefore}" -> "${o.valueAfter}", input ${o.inputBox.w}px, busy ${o.busyBefore}->${o.busyAfter3s}@3s->${o.busyAfter10s}@10s`);
        if (hw.geolocation) {
            push(
                "Geolocation button clears its busy state",
                hw.geolocation.busyAfter10s === false ? "PASS" : "FAIL",
                `getCurrentPosition is called with no options (so no timeout). Busy after press: 3s=${hw.geolocation.busyAfter3s}, 10s=${hw.geolocation.busyAfter10s}. A permanently busy button means neither callback fired and nothing times out.`
            );
        }
        if (hw.signature) {
            const sg = hw.signature;
            push(
                "Hardware: signature canvas",
                sg.canvasPresent && sg.canvasBox.w >= 200 && sg.canvasBox.h >= 100 && sg.has2dContext && sg.listenersSurviveErrorState ? "PASS" : "FAIL",
                `box ${sg.canvasBox.w}x${sg.canvasBox.h}, attr ${sg.canvasAttrSize && sg.canvasAttrSize.w}x${sg.canvasAttrSize && sg.canvasAttrSize.h}, 2d=${sg.has2dContext}, listeners=${sg.listenersAttached}, listenersSurviveErrorState=${sg.listenersSurviveErrorState}`
            );
        }
        push(
            "Form survives hardware interaction",
            hw.hostStillRendered && hw.hostStillHasChildren && hw.pluginCountAfter === hw.pluginCountBefore ? "PASS" : "FAIL",
            `plugins ${hw.pluginCountBefore} -> ${hw.pluginCountAfter}, host rendered=${hw.hostStillRendered}`
        );
    }

    const st = val("signatureTouch");
    if (st) {
        push(
            "Signature touch drawing (mobile path)",
            st.canvasPresent && st.nonBlankPixels > 0 && st.valueIsDataUrl ? "PASS" : "FAIL",
            `TouchEvent ctor=${st.touchEventCtorAvailable}, canvas touch-action="${st.touchActionStyle}", drawn pixels=${st.nonBlankPixels}, value is PNG=${st.valueIsDataUrl}${st.readThrew ? `, getImageData threw: ${st.readThrew}` : ""}`
        );
    }

    const gg = val("geolocationGranted");
    if (gg) {
        push(
            "Geolocation success path (permission granted)",
            /-36\.8485/.test(String(gg.valueAfter)) && gg.busyAfter === false ? "PASS" : "FAIL",
            `value "${gg.valueBefore}" -> "${gg.valueAfter}", stored ${JSON.stringify(gg.storedValue)}, busy after=${gg.busyAfter}`
        );
    } else {
        push("Geolocation success path (permission granted)", "FAIL", (s("geolocationGranted") && s("geolocationGranted").error) || "step did not run");
    }

    const sd = val("silentDegradation");
    if (sd) {
        for (const name of Object.keys(sd.controls)) {
            const c = sd.controls[name];
            if (c.error || c.threw) {
                push(`Degrades visibly: ${name}`, "FAIL", c.error || `threw: ${c.threw}`);
                continue;
            }
            // Only meaningful where the engine cannot honour the press at all.
            if (c.apiPresent) {
                push(`Degrades visibly: ${name}`, "INFO", `API present on this engine, so the press was honourable; changed=${c.changedKeys.join(",") || "nothing"}`);
            } else {
                push(
                    `Degrades visibly: ${name}`,
                    c.anyUserVisibleSignal ? "PASS" : "FAIL",
                    `API absent on this engine. User-visible signal: ${
                        c.anyUserVisibleSignal
                            ? (c.alreadyDegraded
                                ? `shown before the press (valueState=${c.after.valueState}, aria-invalid=${c.after.ariaInvalid}, inline error "${c.after.errorNodeText}")`
                                : "appeared on the press") +
                              (c.changedKeys.concat(c.globalChanged).length ? `; changed on press: ${c.changedKeys.concat(c.globalChanged).join(", ")}` : "")
                            : "NONE (no valueState, no text, no tooltip, no message strip, no dialog)"
                    }. ` +
                        `Stock UI5 log level is ${sd.logLevel} (${sd.warningReachesConsoleAtDefaultLevel ? "warnings reach the console" : "Log.warning is suppressed"}). ` +
                        `With the level raised to DEBUG the control logged: ${(c.logEntriesWhenLevelRaised || []).join(" | ") || "nothing at all"}.`
                );
            }
        }
    }

    const sign = val("signatureDraw");
    if (sign) {
        push(
            "Signature capture (real pointer drag -> PNG)",
            sign.nonBlankPixels > 0 && sign.valueIsDataUrl ? "PASS" : "FAIL",
            `drawn pixels=${sign.nonBlankPixels}, value is PNG data URL=${sign.valueIsDataUrl} (${sign.valueLength} chars)${sign.readThrew ? `, getImageData threw: ${sign.readThrew}` : ""}${sign.error ? `, ${sign.error}` : ""}`
        );
    }

    // Formatting
    const fmt = val("formatting");
    if (fmt) {
        push(
            "Intl date/number/currency",
            fmt.errors && fmt.errors.length ? "FAIL" : "PASS",
            `UI5 medium date "${fmt.ui5.dateMedium}", float "${fmt.ui5.float}", USD "${fmt.ui5.currencyUSD}"; Intl de-DE "${fmt.intl.deDENumber}", ja-JP ¥ "${fmt.intl.jaJPCurrency}", narrow "${fmt.intl.narrowCurrency}", unit "${fmt.intl.unitFormat}"` +
                (fmt.errors.length ? ` ERRORS: ${fmt.errors.join(" | ")}` : "")
        );
        if (fmt.rendered) {
            push("Date fields render a formatted value", fmt.rendered.DueDate ? "PASS" : "FAIL", JSON.stringify(fmt.rendered));
        }
    }

    const dp = val("dateParsing");
    if (dp) {
        const threw = Object.entries(dp.formatted).filter(([, out]) => String(out).startsWith("THREW"));
        push(
            "DateFormatterPlugin never throws on odd input",
            threw.length ? "FAIL" : "PASS",
            threw.length ? threw.map(([k, o]) => `${k} -> ${o}`).join(" | ") : `${Object.keys(dp.formatted).length} samples, every one returned a string`
        );
        push(
            "Non-ISO date strings (engine-defined parsing)",
            "INFO",
            Object.keys(dp.formatted)
                .filter((k) => !/^\d{4}-\d{2}-\d{2}(T|$)/.test(k))
                .map((k) => `"${k}" -> "${dp.formatted[k]}" (Date.parse ${dp.rawParse[k]})`)
                .join(" | ")
        );
    }

    // Layouts / dialog / rows
    const ld = val("layoutsAndDialog");
    if (ld) {
        for (const strategy of Object.keys(ld.layouts)) {
            const l = ld.layouts[strategy];
            push(
                `Layout: ${strategy}`,
                !l.generateError && l.w > 0 && l.h > 0 && l.submitAccepted ? "PASS" : "FAIL",
                `${l.w}x${l.h}px, submit=${l.submitAccepted}${l.generateError ? `, error: ${l.generateError}` : ""}${l.stepRetained !== undefined ? `, wizard step retained=${l.stepRetained}` : ""}${l.columns !== undefined ? `, columns=${l.columns}` : ""}`
            );
        }
        if (ld.rowClone) {
            const rc = ld.rowClone;
            push(
                "Table row cloning",
                rc.addButtonFound && rc.rowsAfter === rc.rowsBefore + 1 && !rc.cloneThrew && rc.newRowBox.h > 0 ? "PASS" : "FAIL",
                `rows ${rc.rowsBefore} -> ${rc.rowsAfter}, new row ${rc.newRowBox.w}x${rc.newRowBox.h}, cells ${JSON.stringify(rc.newRowCellBoxes)}${rc.cloneThrew ? `, threw: ${rc.cloneThrew}` : ""}`
            );
        }
        const d = ld.dialog;
        push(
            "Dialog host (isolation + messaging lifecycle)",
            !d.error && d.parentInvalidations === 0 && d.blockedOnInvalid && d.messagesOnInvalid > 0 && d.messagesAfterFix === 0 ? "PASS" : "FAIL",
            `dialog ${d.dialogBox ? `${d.dialogBox.w}x${d.dialogBox.h}` : "n/a"}, parentInvalidations=${d.parentInvalidations}, blockedOnInvalid=${d.blockedOnInvalid}, messages ${d.messagesOnInvalid}->${d.messagesAfterFix}${d.error ? `, error: ${d.error}` : ""}`
        );
    }

    const ms = val("modelSync");
    if (ms) {
        const ok = ms.shieldedBeforeSubmit && ms.onDemandOutputBeforeSubmit && ms.txSubmitted && ms.onDemandJsonAfterSubmit && ms.pushedAfterSubmit && ms.liveStringSynced;
        push("Transactional + live model binding", ok ? "PASS" : "FAIL", JSON.stringify(ms));
    }

    // Diagnostics
    push(
        "Console clean (errors / page errors / unhandled rejections)",
        record.console.errors.length || record.pageErrors.length || record.unhandledRejections.length ? "FAIL" : "PASS",
        `consoleErrors=${record.console.errors.length}, pageErrors=${record.pageErrors.length}, unhandledRejections=${record.unhandledRejections.length}, benign=${record.console.benign.length}` +
            (record.console.errors.length ? ` :: ${record.console.errors.slice(0, 3).join(" | ")}` : "") +
            (record.pageErrors.length ? ` :: PAGEERR ${record.pageErrors.slice(0, 3).join(" | ")}` : "") +
            (record.unhandledRejections.length ? ` :: REJECT ${record.unhandledRejections.slice(0, 3).join(" | ")}` : "")
    );
    const metauiWarnings = [...new Set(record.console.warnings.filter((w) => /MetaUI/.test(w)).map((w) => w.replace(/^[\d.: -]+/, "")))];
    push(
        "Degradation signal (MetaUI warnings the engine produced)",
        "INFO",
        metauiWarnings.length ? metauiWarnings.join(" | ") : "none"
    );
    push(
        "Network (library + CDN requests)",
        record.failedRequests.length ? "FAIL" : "PASS",
        record.failedRequests.length ? record.failedRequests.slice(0, 5).join(" | ") : "no failed resource requests"
    );

    return v;
}

function printMatrix(results) {
    const capabilities = [];
    for (const r of results) for (const v of r.verdicts) if (!capabilities.includes(v.capability)) capabilities.push(v.capability);

    const nameCol = Math.max(...capabilities.map((c) => c.length), 10) + 2;
    const engineCol = 11;
    console.log(`\n${"=".repeat(nameCol + engineCol * results.length)}`);
    console.log("MetaUI cross-engine compatibility matrix");
    console.log("=".repeat(nameCol + engineCol * results.length));
    console.log("CAPABILITY".padEnd(nameCol) + results.map((r) => r.engine.padEnd(engineCol)).join(""));
    console.log("-".repeat(nameCol + engineCol * results.length));
    for (const cap of capabilities) {
        const row = results.map((r) => {
            const hit = r.verdicts.find((v) => v.capability === cap);
            return (hit ? hit.status : "n/a").padEnd(engineCol);
        });
        console.log(cap.padEnd(nameCol) + row.join(""));
    }
    console.log("-".repeat(nameCol + engineCol * results.length));
    console.log("RUNTIME".padEnd(nameCol) + results.map((r) => `${(r.totalMs / 1000).toFixed(1)}s`.padEnd(engineCol)).join(""));
    console.log("=".repeat(nameCol + engineCol * results.length));

    // Geometry deltas: the point of measuring boxes rather than presence is to see where the
    // engines actually disagree, so the biggest disagreements are listed even when every
    // capability passed.
    const geomSteps = ["renderConsumer", "renderNarrow", "renderAllMappings"];
    for (const stepName of geomSteps) {
        const perEngine = results.filter((r) => r.steps[stepName] && r.steps[stepName].ok).map((r) => ({ engine: r.engine, g: r.steps[stepName].value.widgetGeometry }));
        if (perEngine.length < 2) continue;
        const paths = Object.keys(perEngine[0].g);
        const deltas = [];
        for (const p of paths) {
            const ws = perEngine.map((e) => (e.g[p] ? e.g[p].w : null));
            const hs = perEngine.map((e) => (e.g[p] ? e.g[p].h : null));
            if (ws.some((w) => w === null)) {
                deltas.push({ p, note: `missing on ${perEngine.filter((e) => !e.g[p]).map((e) => e.engine).join(",")}`, spread: Infinity });
                continue;
            }
            const spread = Math.max(Math.max(...ws) - Math.min(...ws), Math.max(...hs) - Math.min(...hs));
            if (spread >= 2) deltas.push({ p, note: perEngine.map((e, i) => `${e.engine} ${ws[i]}x${hs[i]}`).join(" / "), spread });
        }
        deltas.sort((a, b) => b.spread - a.spread);
        if (deltas.length) {
            console.log(`\nGeometry differences >=2px (${stepName}), largest first:`);
            for (const d of deltas.slice(0, 15)) console.log(`  ${d.p.padEnd(22)} ${d.note}`);
            if (deltas.length > 15) console.log(`  ... and ${deltas.length - 15} more (see the JSON report)`);
        } else {
            console.log(`\nGeometry differences >=2px (${stepName}): none across ${perEngine.map((e) => e.engine).join(", ")}`);
        }
    }

    for (const r of results) {
        console.log(`\n--- ${r.engine} (${r.browserVersion}) ---`);
        for (const v of r.verdicts) {
            if (v.status === "PASS") continue;
            console.log(`  [${v.status}] ${v.capability}\n        ${v.detail}`);
        }
        const passes = r.verdicts.filter((v) => v.status === "PASS").length;
        console.log(`  ${passes}/${r.verdicts.length} capabilities PASS`);
        if (r.console.benign.length) {
            const uniq = [...new Set(r.console.benign.map((b) => b.why))];
            console.log(`  benign console noise (${r.console.benign.length}): ${uniq.join(" | ")}`);
        }
    }
}

async function main() {
    const widgetMatrixFixture = buildWidgetMatrixFixture();
    const fixtureServer = await startServer();
    const baseUrl = fixtureServer.baseUrl;
    console.log(`Fixture server: ${baseUrl}`);
    console.log(`Serving a frozen snapshot of dist/resources from ${fixtureServer.servedResourcesDir}`);
    console.log(`Engines: ${selectedEngines.join(", ")} (gating: ${gateEngines.join(", ") || "none"})`);
    console.log(`Consumer fixture: ${Object.keys(CONSUMER_ALL_WIDGETS_SCHEMA.properties).length} properties; mapping matrix: ${MAPPINGS.length} (type,widget) mappings`);

    const results = [];
    try {
        for (const engine of selectedEngines) {
            console.log(`\n>>> ${engine} ...`);
            let record;
            try {
                record = await runEngine(engine, baseUrl, widgetMatrixFixture);
            } catch (err) {
                record = {
                    engine,
                    browserVersion: "LAUNCH FAILED",
                    steps: {},
                    failures: [`engine launch/run failed: ${(err && err.message) || String(err)}`],
                    console: { errors: [], warnings: [], benign: [] },
                    pageErrors: [],
                    unhandledRejections: [],
                    failedRequests: [],
                    totalMs: 0
                };
            }
            record.verdicts = verdicts(record, widgetMatrixFixture);
            results.push(record);
            console.log(`<<< ${engine} done in ${(record.totalMs / 1000).toFixed(1)}s`);
        }
    } finally {
        fixtureServer.close();
    }

    printMatrix(results);

    fs.mkdirSync(REPORT_DIR, { recursive: true });
    const reportPath = path.join(REPORT_DIR, `browser-matrix-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    fs.writeFileSync(reportPath, JSON.stringify({ generatedAt: new Date().toISOString(), mappings: MAPPINGS.length, results }, null, 2));
    console.log(`\nFull evidence written to ${reportPath}`);

    const gatingFailures = results.filter((r) => gateEngines.includes(r.engine) && r.verdicts.some((v) => v.status === "FAIL"));
    if (gatingFailures.length) {
        console.error(`\nGATING ENGINES FAILED: ${gatingFailures.map((r) => r.engine).join(", ")}`);
        process.exitCode = 1;
    } else {
        console.log(`\nGating engines (${gateEngines.join(", ") || "none"}) passed.`);
    }
}

main().catch((err) => {
    console.error("BROWSER MATRIX HARNESS FAILED:", err);
    process.exit(2);
});
