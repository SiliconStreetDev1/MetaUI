/**
 * @file probes.js
 * @description In-page probes, serialised into each engine by `page.evaluate`.
 *
 * Every function here is executed inside the browser, so it must be self-contained: no closures
 * over Node scope, no imports. Shared state between probes lives on `window.__mx`.
 *
 * The probes measure real geometry and real engine behaviour. Nothing here asserts; each probe
 * returns raw numbers and strings and the Node side decides what counts as a defect, so that an
 * engine difference is reported as the measurement that produced it.
 */

/** Waits for UI5 core init and resolves the modules the probes need onto `window.__mx`. */
const bootstrap = async () => {
    await new Promise((resolve) => sap.ui.getCore().attachInit(resolve));
    const mods = await new Promise((resolve, reject) => {
        sap.ui.require(
            [
                "nz/co/siliconst/ui5/metaui/controls/DynamicHost",
                "sap/m/VBox",
                "sap/ui/model/json/JSONModel",
                "sap/ui/core/Core",
                "sap/ui/core/Element",
                "sap/ui/core/format/DateFormat",
                "sap/ui/core/format/NumberFormat"
            ],
            (...m) => resolve(m),
            reject
        );
    });
    window.__mx = {
        DynamicHost: mods[0],
        VBox: mods[1],
        JSONModel: mods[2],
        Core: mods[3],
        Element: mods[4],
        DateFormat: mods[5],
        NumberFormat: mods[6],
        hosts: {},
        containers: {}
    };
    const dev = sap.ui.require("sap/ui/Device");
    return {
        ui5Version: sap.ui.version,
        userAgent: navigator.userAgent,
        ui5DetectedBrowser: dev ? `${dev.browser.name}@${dev.browser.versionStr || dev.browser.version}` : "unknown",
        ui5SupportedBrowser: dev ? Boolean(dev.browser.chrome || dev.browser.firefox || dev.browser.safari || dev.browser.edge) : null,
        devicePixelRatio: window.devicePixelRatio,
        capabilities: {
            getUserMedia: Boolean(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
            geolocation: Boolean(navigator.geolocation),
            SpeechRecognition: typeof window.SpeechRecognition !== "undefined",
            webkitSpeechRecognition: typeof window.webkitSpeechRecognition !== "undefined",
            canvas2d: Boolean(document.createElement("canvas").getContext("2d")),
            canvasToDataURL: (() => {
                try {
                    return document.createElement("canvas").toDataURL("image/png").slice(0, 15);
                } catch (e) {
                    return "THREW:" + e.message;
                }
            })(),
            IntlDisplayNames: typeof Intl.DisplayNames !== "undefined",
            IntlListFormat: typeof Intl.ListFormat !== "undefined",
            IntlRelativeTimeFormat: typeof Intl.RelativeTimeFormat !== "undefined",
            IntlSegmenter: typeof Intl.Segmenter !== "undefined",
            ResizeObserver: typeof window.ResizeObserver !== "undefined",
            structuredClone: typeof window.structuredClone !== "undefined",
            resolvedLocale: Intl.DateTimeFormat().resolvedOptions().locale,
            resolvedTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
        }
    };
};

/**
 * Renders one fixture into a fresh container and measures every active widget's real geometry,
 * containment inside the host box, and the host's own computed sizing contract.
 */
const renderFixture = async (args) => {
    const mx = window.__mx;
    const { label, schema, data, containerWidth } = args;

    const container = new mx.VBox({ width: containerWidth || "1000px" });
    container.placeAt("consumer-mount");
    mx.Core.applyChanges();

    const host = new mx.DynamicHost({
        schemaDefinition: schema,
        data: data,
        editable: true,
        liveUpdate: true,
        useMessageManager: true
    });
    container.addItem(host);
    mx.Core.applyChanges();

    const t0 = performance.now();
    let generateError = null;
    try {
        await host.generate();
    } catch (e) {
        generateError = (e && e.message) || String(e);
    }
    mx.Core.applyChanges();
    await new Promise((r) => setTimeout(r, 250));
    const generateMs = Math.round(performance.now() - t0);

    mx.hosts[label] = host;
    mx.containers[label] = container;

    const result = {
        label,
        generateError,
        generateMs,
        hostHasDom: Boolean(host.getDomRef()),
        expectedPaths: Object.keys(schema.properties || {}),
        activePaths: [],
        zeroGeometry: [],
        overflowing: [],
        boundPaths: [],
        widgetGeometry: {},
        hostBox: null,
        hostComputed: null,
        documentOverflow: null
    };

    const engine = host._innerHost && host._innerHost.engine;
    if (!engine) {
        result.generateError = (result.generateError || "") + " | no engine on _innerHost";
        return result;
    }

    const hostDom = host.getDomRef();
    const hostRect = hostDom ? hostDom.getBoundingClientRect() : null;
    if (hostDom) {
        const cs = window.getComputedStyle(hostDom);
        result.hostBox = { w: Math.round(hostRect.width), h: Math.round(hostRect.height), left: Math.round(hostRect.left), right: Math.round(hostRect.right) };
        result.hostComputed = { minWidth: cs.minWidth, maxWidth: cs.maxWidth, boxSizing: cs.boxSizing, display: cs.display, overflowX: cs.overflowX };
    }

    const active = engine.getActivePlugins();
    for (const entry of active) {
        const p = entry.path.replace(/^\//, "");
        result.activePaths.push(p);
        const ctrl = entry.plugin.control;
        const dom = ctrl ? ctrl.getDomRef() : null;
        if (!dom) {
            result.zeroGeometry.push(`${p}:missing_dom`);
            continue;
        }
        const r = dom.getBoundingClientRect();
        const cs = window.getComputedStyle(dom);
        result.widgetGeometry[p] = {
            w: Math.round(r.width * 100) / 100,
            h: Math.round(r.height * 100) / 100,
            display: cs.display,
            visibility: cs.visibility,
            minWidth: cs.minWidth,
            boxSizing: cs.boxSizing,
            scrollW: dom.scrollWidth,
            clientW: dom.clientWidth
        };
        if (r.width <= 0 || r.height <= 0 || cs.display === "none" || cs.visibility === "hidden") {
            result.zeroGeometry.push(`${p}:${Math.round(r.width)}x${Math.round(r.height)}:${cs.display}`);
        }
        if (hostRect && r.right > hostRect.right + 1) {
            result.overflowing.push(`${p}:right=${Math.round(r.right)}>host=${Math.round(hostRect.right)}`);
        }
    }

    // Inline arrays register their cell plugins under the ITEM property, so the owning property is
    // only visible as a binding on a rendered control. Same fallback the Chromium gate uses.
    const bound = [];
    const subtree = [host].concat(host.findAggregatedObjects(true));
    for (const ctrl of subtree) {
        if (!ctrl.getMetadata || !ctrl.getDomRef || !ctrl.getDomRef()) continue;
        const meta = ctrl.getMetadata();
        const names = Object.keys(meta.getAllProperties()).concat(Object.keys(meta.getAllAggregations()));
        const ctx = ctrl.getBindingContext ? ctrl.getBindingContext() : null;
        const ctxPath = ctx && ctx.getPath ? ctx.getPath() : "";
        for (const name of names) {
            const info = ctrl.getBindingInfo ? ctrl.getBindingInfo(name) : undefined;
            if (!info) continue;
            const raw = [];
            if (info.path) raw.push(info.path);
            for (const part of info.parts || []) if (part && part.path) raw.push(part.path);
            for (const rp of raw) {
                const abs = rp.charAt(0) === "/" ? rp : ctxPath ? ctxPath + "/" + rp : "";
                if (abs) bound.push(abs.replace(/^\//, ""));
            }
        }
    }
    result.boundPaths = bound.filter((v, i, a) => a.indexOf(v) === i);

    const de = document.documentElement;
    result.documentOverflow = {
        scrollWidth: de.scrollWidth,
        clientWidth: de.clientWidth,
        horizontalOverflowPx: de.scrollWidth - de.clientWidth
    };
    return result;
};

/**
 * Measures ResponsiveGridLayout label placement for one field at the current viewport width:
 * "beside" when the label shares a row with its field, "above" when it is stacked.
 */
const probeLabelPlacement = (args) => {
    const mx = window.__mx;
    const host = mx.hosts[args.label];
    const out = { viewportWidth: window.innerWidth, fields: {} };
    for (const fieldPath of args.fields) {
        const plugin = host._innerHost.engine.getPluginByPath(fieldPath);
        const ctrl = plugin && (plugin.mainControl || plugin.control);
        const dom = ctrl && ctrl.getDomRef ? ctrl.getDomRef() : null;
        if (!dom) {
            out.fields[fieldPath] = { error: "no field dom" };
            continue;
        }
        const id = ctrl.getId();
        let labelEl = document.querySelector(`label[for="${id}"]`) || document.querySelector(`label[for="${id}-inner"]`);
        if (!labelEl) {
            // SimpleForm renders the label as a sibling cell in the grid row, not always with a
            // `for` that matches the control the plugin exposes. Walk out until a row that holds
            // a <label> outside the field's own subtree is found.
            let node = dom.parentElement;
            for (let hop = 0; hop < 6 && node && !labelEl; hop++) {
                const candidates = node.querySelectorAll("label");
                for (const c of candidates) {
                    if (!dom.contains(c)) {
                        labelEl = c;
                        break;
                    }
                }
                node = node.parentElement;
            }
        }
        if (!labelEl) {
            out.fields[fieldPath] = { error: "no label found" };
            continue;
        }
        const lr = labelEl.getBoundingClientRect();
        const fr = dom.getBoundingClientRect();
        out.fields[fieldPath] = {
            labelBox: { x: Math.round(lr.left), y: Math.round(lr.top), w: Math.round(lr.width), h: Math.round(lr.height) },
            fieldBox: { x: Math.round(fr.left), y: Math.round(fr.top), w: Math.round(fr.width), h: Math.round(fr.height) },
            placement: lr.bottom <= fr.top + 2 ? "above" : lr.right <= fr.left + 2 ? "beside" : "overlapping",
            fieldWidth: Math.round(fr.width),
            fieldOverflowsViewport: fr.right > window.innerWidth + 1
        };
    }
    return out;
};

/** Returns the DOM ids needed by the Playwright-level (real input) interaction steps. */
const collectInteractionTargets = (args) => {
    const host = window.__mx.hosts[args.label];
    const engine = host._innerHost.engine;
    const idOf = (p) => {
        const plugin = engine.getPluginByPath(p);
        if (!plugin) return null;
        const ctrl = plugin.mainControl || plugin.control;
        return ctrl && ctrl.getId ? ctrl.getId() : null;
    };
    const sig = engine.getPluginByPath("SignatureImg");
    return {
        titleId: idOf("Title"),
        qtyId: idOf("Qty"),
        categoryId: idOf("Category"),
        dueDateId: idOf("DueDate"),
        signatureCanvasId: sig && sig.control ? `${sig.control.getId()}-sig-canvas` : null
    };
};

/** Reads back what the host currently holds, after real keyboard input. */
const readHostValue = (args) => {
    const host = window.__mx.hosts[args.label];
    const out = host.getProperty("outputData");
    return { outputData: out ? JSON.parse(JSON.stringify(out)) : null };
};

/** Opens a sap.m.Select picker programmatically and counts the rendered popover items. */
const probePickers = async (args) => {
    const mx = window.__mx;
    const host = mx.hosts[args.label];
    const engine = host._innerHost.engine;
    const result = {};

    const select = engine.getPluginByPath("Category");
    const selCtrl = select && (select.mainControl || select.control);
    if (selCtrl && selCtrl.open) {
        selCtrl.open();
        mx.Core.applyChanges();
        await new Promise((r) => setTimeout(r, 300));
        const popover = document.querySelector(".sapMSltPicker, .sapMSelectList, .sapMPopover");
        const items = popover ? popover.querySelectorAll(".sapMSLIItem, .sapMSelectListItem, li").length : 0;
        const rect = popover ? popover.getBoundingClientRect() : { width: 0, height: 0 };
        result.select = { opened: Boolean(popover), items, w: Math.round(rect.width), h: Math.round(rect.height) };
        if (selCtrl.close) selCtrl.close();
        mx.Core.applyChanges();
        await new Promise((r) => setTimeout(r, 150));
    } else {
        result.select = { opened: false, reason: "no Select control at /Category" };
    }

    const dp = engine.getPluginByPath("DueDate");
    const dpCtrl = dp && (dp.mainControl || dp.control);
    if (dpCtrl && dpCtrl.toggleOpen) {
        let threw = null;
        try {
            dpCtrl.toggleOpen(false);
            mx.Core.applyChanges();
            await new Promise((r) => setTimeout(r, 400));
        } catch (e) {
            threw = (e && e.message) || String(e);
        }
        const cal = document.querySelector(".sapUiCal");
        const rect = cal ? cal.getBoundingClientRect() : { width: 0, height: 0 };
        const days = cal ? cal.querySelectorAll(".sapUiCalItem").length : 0;
        result.datePicker = {
            opened: Boolean(cal),
            threw,
            w: Math.round(rect.width),
            h: Math.round(rect.height),
            dayCells: days,
            displayedValue: dpCtrl.getValue ? dpCtrl.getValue() : null
        };
        if (dpCtrl.isOpen && dpCtrl.isOpen()) dpCtrl.toggleOpen(true);
        mx.Core.applyChanges();
        await new Promise((r) => setTimeout(r, 150));
    } else {
        result.datePicker = { opened: false, reason: "no DatePicker at /DueDate" };
    }
    return result;
};

/**
 * Exercises every hardware control the way a user would and records whether the control degrades
 * (logs, leaves the form alive) or throws. Nothing is faked: the engines are asked for the real
 * device APIs with no permission granted, which is the degradation path end users hit.
 */
const probeHardware = async (args) => {
    const mx = window.__mx;
    const host = mx.hosts[args.label];
    const engine = host._innerHost.engine;
    const out = {};

    const pluginCountBefore = engine.getActivePlugins().length;

    const pressAndWait = async (fn, ms) => {
        let threw = null;
        try {
            fn();
        } catch (e) {
            threw = (e && e.message) || String(e);
        }
        await new Promise((r) => setTimeout(r, ms));
        return threw;
    };

    // --- camera -------------------------------------------------------------
    const cam = engine.getPluginByPath("CameraSnap");
    const camCtrl = cam && cam.control;
    if (camCtrl) {
        const video = document.getElementById(`${camCtrl.getId()}-video`);
        const vr = video ? video.getBoundingClientRect() : { width: 0, height: 0 };
        out.camera = {
            videoPresent: Boolean(video),
            videoBox: { w: Math.round(vr.width), h: Math.round(vr.height) },
            videoReadyState: video ? video.readyState : null
        };
        out.camera.pressThrew = await pressAndWait(() => camCtrl.captureBtn.firePress(), 2500);
        out.camera.streamAcquired = Boolean(camCtrl.mediaStream);
        out.camera.stillHasDom = Boolean(camCtrl.getDomRef());
        out.camera.buttonTextAfter = camCtrl.captureBtn.getText();
    }

    // --- signature ----------------------------------------------------------
    const sig = engine.getPluginByPath("SignatureImg");
    const sigCtrl = sig && sig.control;
    if (sigCtrl) {
        const canvas = document.getElementById(`${sigCtrl.getId()}-sig-canvas`);
        const cr = canvas ? canvas.getBoundingClientRect() : { width: 0, height: 0 };
        const ctx = canvas ? canvas.getContext("2d") : null;
        out.signature = {
            canvasPresent: Boolean(canvas),
            canvasBox: { w: Math.round(cr.width), h: Math.round(cr.height) },
            canvasAttrSize: canvas ? { w: canvas.width, h: canvas.height } : null,
            has2dContext: Boolean(ctx),
            listenersAttached: Boolean(canvas && typeof canvas.onmousedown === "function"),
            canvasId: canvas ? canvas.id : null
        };
        // Error state must not detach the live canvas listeners (regression guard carried over
        // from the Chromium gate; the re-render path differs per engine).
        sigCtrl.setValueState("Error");
        sigCtrl.setValueStateText("Signature required");
        mx.Core.applyChanges();
        await new Promise((r) => setTimeout(r, 100));
        const canvasAfter = document.getElementById(`${sigCtrl.getId()}-sig-canvas`);
        out.signature.listenersSurviveErrorState = Boolean(canvasAfter && typeof canvasAfter.onmousedown === "function");
        out.signature.ariaInvalid = sigCtrl.getDomRef() ? sigCtrl.getDomRef().getAttribute("aria-invalid") : null;
        sigCtrl.setValueState("None");
        sigCtrl.setValueStateText("");
        mx.Core.applyChanges();
    }

    // --- voice input --------------------------------------------------------
    const voice = engine.getPluginByPath("VoiceNote");
    const voiceCtrl = voice && voice.control;
    if (voiceCtrl) {
        const ir = voiceCtrl.textInput.getDomRef().getBoundingClientRect();
        out.voiceInput = {
            inputBox: { w: Math.round(ir.width), h: Math.round(ir.height) },
            speechApiPresent: typeof window.SpeechRecognition !== "undefined" || typeof window.webkitSpeechRecognition !== "undefined"
        };
        out.voiceInput.pressThrew = await pressAndWait(() => voiceCtrl.recordBtn.firePress(), 1200);
        out.voiceInput.isRecordingAfterPress = voiceCtrl.isRecording === true;
        out.voiceInput.buttonTypeAfter = voiceCtrl.recordBtn.getType();
        out.voiceInput.stillHasDom = Boolean(voiceCtrl.getDomRef());
        // Second press: if the first press left the control stuck "recording" without a live
        // recogniser, the toggle path is the one that breaks.
        out.voiceInput.secondPressThrew = await pressAndWait(() => voiceCtrl.recordBtn.firePress(), 1500);
        out.voiceInput.isRecordingAfterSecondPress = voiceCtrl.isRecording === true;
        out.voiceInput.buttonTypeAfterSecondPress = voiceCtrl.recordBtn.getType();
        out.voiceInput.inputValueAfter = voiceCtrl.textInput.getValue();
    }

    // --- geolocation --------------------------------------------------------
    const geo = engine.getPluginByPath("GpsCoords");
    const geoCtrl = geo && geo.control;
    if (geoCtrl) {
        const gr = geoCtrl.coordInput.getDomRef().getBoundingClientRect();
        out.geolocation = {
            inputBox: { w: Math.round(gr.width), h: Math.round(gr.height) },
            apiPresent: Boolean(navigator.geolocation),
            valueBefore: geoCtrl.coordInput.getValue()
        };
        out.geolocation.busyBefore = geoCtrl.locateBtn.getBusy();
        out.geolocation.pressThrew = await pressAndWait(() => geoCtrl.locateBtn.firePress(), 3000);
        out.geolocation.valueAfter = geoCtrl.coordInput.getValue();
        out.geolocation.stillHasDom = Boolean(geoCtrl.getDomRef());
        // GeolocationControl sets POSITION_TIMEOUT_MS (10s) + WATCHDOG_GRACE_MS (2s) = 12s.
        // Wait 12.5s total (3s + 9.5s) so the watchdog has settled when neither callback fires (Firefox).
        out.geolocation.busyAfter3s = geoCtrl.locateBtn.getBusy();
        await new Promise((r) => setTimeout(r, 9500));
        out.geolocation.busyAfter10s = geoCtrl.locateBtn.getBusy();
    }

    out.pluginCountBefore = pluginCountBefore;
    out.pluginCountAfter = engine.getActivePlugins().length;
    out.hostStillRendered = Boolean(host.getDomRef());
    out.hostStillHasChildren = Boolean(host.getDomRef() && host.getDomRef().childElementCount > 0);
    return out;
};

/**
 * Answers the question rule 2 of AGENTS.md asks of every unhonourable input: when an engine has
 * no Web Speech API and no getUserMedia, does pressing the control produce ANY signal a user or
 * a consuming app can see?
 *
 * It snapshots the control's user-visible state, presses, snapshots again, and separately checks
 * whether the UI5 log level in force would even let the control's Log.warning reach the console.
 */
const probeSilentDegradation = async (args) => {
    const mx = window.__mx;
    const host = mx.hosts[args.label];
    const engine = host._innerHost.engine;
    const Log = sap.ui.require("sap/base/Log");

    const snapshot = (ctrl, button) => {
        const dom = ctrl.getDomRef();
        return {
            buttonText: button && button.getText ? button.getText() : null,
            buttonType: button && button.getType ? button.getType() : null,
            buttonEnabled: button && button.getEnabled ? button.getEnabled() : null,
            buttonTooltip: button && button.getTooltip ? String(button.getTooltip() || "") : null,
            valueState: ctrl.getValueState ? ctrl.getValueState() : null,
            valueStateText: ctrl.getValueStateText ? ctrl.getValueStateText() : null,
            ariaInvalid: dom ? dom.getAttribute("aria-invalid") : null,
            innerHtmlLength: dom ? dom.innerHTML.length : -1,
            errorNodeText: document.getElementById(`${ctrl.getId()}-err`) ? document.getElementById(`${ctrl.getId()}-err`).textContent : null,
            errorNodeVisible: document.getElementById(`${ctrl.getId()}-err`) ? document.getElementById(`${ctrl.getId()}-err`).style.display !== "none" : null
        };
    };

    const globalSignals = () => ({
        messageStrips: document.querySelectorAll(".sapMMsgStrip").length,
        messageBoxes: document.querySelectorAll(".sapMMessageBox, .sapMMessageToast").length,
        dialogs: document.querySelectorAll(".sapMDialog").length
    });

    const out = {
        logLevel: Log ? Log.getLevel() : null,
        logLevelNames: Log && Log.Level ? Object.keys(Log.Level).filter((k) => isNaN(Number(k))).map((k) => `${k}=${Log.Level[k]}`) : null,
        warningReachesConsoleAtDefaultLevel: Log ? Log.getLevel() >= 2 : null,
        controls: {}
    };

    const cases = [
        { name: "voiceInput", path: "VoiceNote", button: (c) => c.recordBtn, apiPresent: typeof window.SpeechRecognition !== "undefined" || typeof window.webkitSpeechRecognition !== "undefined" },
        { name: "camera", path: "CameraSnap", button: (c) => c.captureBtn, apiPresent: Boolean(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) }
    ];

    for (const c of cases) {
        const plugin = engine.getPluginByPath(c.path);
        const ctrl = plugin && plugin.control;
        if (!ctrl) {
            out.controls[c.name] = { error: "control not found" };
            continue;
        }
        const button = c.button(ctrl);
        const before = { control: snapshot(ctrl, button), global: globalSignals() };
        try {
            button.firePress();
        } catch (e) {
            out.controls[c.name] = { threw: (e && e.message) || String(e) };
            continue;
        }
        await new Promise((r) => setTimeout(r, 3000));
        mx.Core.applyChanges();
        const after = { control: snapshot(ctrl, button), global: globalSignals() };
        const changedKeys = Object.keys(before.control).filter((k) => JSON.stringify(before.control[k]) !== JSON.stringify(after.control[k]));
        const globalChanged = Object.keys(before.global).filter((k) => before.global[k] !== after.global[k]);

        // The question is whether the user is TOLD, not whether the press changed something.
        //
        // This probe originally equated the two, and that produced a false failure the moment the
        // controls got better: a control on an engine without the device API now paints its error
        // at render time, so by the time the probe pressed, valueState was already Error and
        // aria-invalid already true - nothing changed across the press, and a correctly degrading
        // control scored as silent. Degrading before the user presses is strictly better than
        // degrading after, so it must not read as a regression.
        //
        // `alreadyDegraded` is recorded separately so the two cases stay distinguishable in the
        // evidence: a control that warned up front, versus one that warned only on the press.
        const a = after.control;
        const alreadyDegraded = a.valueState === "Error" || a.ariaInvalid === "true" || a.errorNodeVisible === true;
        out.controls[c.name] = {
            apiPresent: c.apiPresent,
            before: before.control,
            after: after.control,
            changedKeys,
            globalChanged,
            alreadyDegraded,
            degradedOnPress: changedKeys.length > 0 || globalChanged.length > 0,
            anyUserVisibleSignal: alreadyDegraded || changedKeys.length > 0 || globalChanged.length > 0
        };

        // Second press with the UI5 log level raised, reading UI5's own in-memory log rather
        // than the console. This separates "the control emitted nothing" from "the control
        // emitted a Log.warning that the stock log level throws away".
        if (Log && Log.setLevel) {
            const original = Log.getLevel();
            Log.setLevel(Log.Level ? Log.Level.DEBUG : 4);
            const mark = Log.getLogEntries ? Log.getLogEntries().length : 0;
            try {
                button.firePress();
            } catch (e) {
                void e;
            }
            await new Promise((r) => setTimeout(r, 2500));
            const entries = Log.getLogEntries ? Log.getLogEntries().slice(mark) : [];
            out.controls[c.name].logEntriesWhenLevelRaised = entries
                .filter((en) => /MetaUI/.test(`${en.message} ${en.component || ""}`))
                .map((en) => `L${en.level} ${en.message}${en.details ? " :: " + en.details : ""}`);
            Log.setLevel(original);
        }
    }
    return out;
};

/** Draws into the signature canvas via synthetic events and reads the resulting pixels back. */
const probeSignaturePixels = (args) => {
    const canvas = document.getElementById(args.canvasId);
    if (!canvas) return { error: "canvas not found" };
    const ctx = canvas.getContext("2d");
    if (!ctx) return { error: "no 2d context" };
    let nonBlank = 0;
    let readThrew = null;
    try {
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        for (let i = 3; i < data.length; i += 4) if (data[i] !== 0) nonBlank++;
    } catch (e) {
        readThrew = (e && e.message) || String(e);
    }
    const host = window.__mx.hosts[args.label];
    const plugin = host._innerHost.engine.getPluginByPath("SignatureImg");
    const value = plugin && plugin.control ? plugin.control.getProperty("value") : null;
    return {
        nonBlankPixels: nonBlank,
        readThrew,
        valueIsDataUrl: typeof value === "string" && value.indexOf("data:image/png") === 0,
        valueLength: typeof value === "string" ? value.length : 0
    };
};

/** Date / number / currency formatting through UI5's formatters and the raw engine Intl. */
const probeFormatting = () => {
    const mx = window.__mx;
    const d = new Date(Date.UTC(2026, 9, 22, 8, 30, 0));
    const out = { ui5: {}, intl: {}, errors: [] };
    try {
        out.ui5.dateMedium = mx.DateFormat.getDateInstance({ style: "medium" }).format(d);
        out.ui5.dateShort = mx.DateFormat.getDateInstance({ style: "short" }).format(d);
        out.ui5.dateTimeMedium = mx.DateFormat.getDateTimeInstance({ style: "medium" }).format(d);
        out.ui5.timeShort = mx.DateFormat.getTimeInstance({ style: "short" }).format(d);
        out.ui5.float = mx.NumberFormat.getFloatInstance().format(1234567.891);
        out.ui5.percent = mx.NumberFormat.getPercentInstance().format(0.4567);
        out.ui5.currencyUSD = mx.NumberFormat.getCurrencyInstance().format(1234.5, "USD");
        out.ui5.currencyEUR = mx.NumberFormat.getCurrencyInstance().format(1234.5, "EUR");
        out.ui5.currencyJPY = mx.NumberFormat.getCurrencyInstance().format(1234.5, "JPY");
    } catch (e) {
        out.errors.push("ui5:" + ((e && e.message) || String(e)));
    }
    try {
        out.intl.enUSDate = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(d);
        out.intl.deDEDate = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeZone: "UTC" }).format(d);
        out.intl.jaJPDate = new Intl.DateTimeFormat("ja-JP", { dateStyle: "long", timeZone: "UTC" }).format(d);
        out.intl.enUSNumber = new Intl.NumberFormat("en-US").format(1234567.891);
        out.intl.deDENumber = new Intl.NumberFormat("de-DE").format(1234567.891);
        out.intl.hiINNumber = new Intl.NumberFormat("hi-IN").format(1234567.891);
        out.intl.enUSCurrency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(1234.5);
        out.intl.deDECurrency = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(1234.5);
        out.intl.jaJPCurrency = new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY" }).format(1234.5);
        out.intl.narrowCurrency = new Intl.NumberFormat("en-GB", { style: "currency", currency: "USD", currencyDisplay: "narrowSymbol" }).format(9.99);
        out.intl.unitFormat = new Intl.NumberFormat("en-US", { style: "unit", unit: "kilometer-per-hour" }).format(50);
    } catch (e) {
        out.errors.push("intl:" + ((e && e.message) || String(e)));
    }
    // What the engine actually painted into the rendered date field.
    try {
        const host = mx.hosts["consumer"];
        const dp = host._innerHost.engine.getPluginByPath("DueDate");
        const dt = host._innerHost.engine.getPluginByPath("CreatedAt");
        const tm = host._innerHost.engine.getPluginByPath("AlarmTime");
        out.rendered = {
            DueDate: dp && dp.control && dp.control.getValue ? dp.control.getValue() : null,
            CreatedAt: dt && dt.control && dt.control.getValue ? dt.control.getValue() : null,
            AlarmTime: tm && tm.control && tm.control.getValue ? tm.control.getValue() : null
        };
    } catch (e) {
        out.errors.push("rendered:" + ((e && e.message) || String(e)));
    }
    return out;
};

/** Table / wizard / compact layouts, table row cloning, and the dialog-host lifecycle. */
const probeLayoutsAndDialog = async () => {
    const mx = window.__mx;
    const container = new mx.VBox({ width: "1000px" });
    container.placeAt("consumer-mount");
    mx.Core.applyChanges();

    let parentInvalidations = 0;
    const origInvalidate = container.invalidate.bind(container);
    container.invalidate = function (o) {
        parentInvalidations++;
        origInvalidate(o);
    };

    const out = { layouts: {}, rowClone: {}, dialog: {} };

    const specs = {
        table: {
            schema: {
                type: "array",
                layoutStrategy: "table",
                items: { type: "object", properties: { Name: { type: "string", required: true }, Count: { type: "integer", minimum: 1 } } }
            },
            data: [{ Name: "Row 1", Count: 3 }]
        },
        wizard: {
            schema: {
                type: "object",
                layoutStrategy: "wizard",
                properties: { StepOneField: { type: "string", required: true }, StepTwoField: { type: "string" } },
                uiLayout: [
                    { type: "WizardStep", label: "Step 1", elements: [{ type: "Control", scope: "#/properties/StepOneField" }] },
                    { type: "WizardStep", label: "Step 2", elements: [{ type: "Control", scope: "#/properties/StepTwoField" }] }
                ]
            },
            data: { StepOneField: "Ready", StepTwoField: "Done" }
        },
        compact: {
            schema: { type: "object", layoutStrategy: "compact", properties: { A: { type: "string" }, B: { type: "number" } } },
            data: { A: "CompactVal", B: 42 }
        }
    };

    for (const strategy of Object.keys(specs)) {
        const lHost = new mx.DynamicHost({ schemaDefinition: specs[strategy].schema, data: specs[strategy].data, editable: true });
        container.addItem(lHost);
        mx.Core.applyChanges();
        let err = null;
        try {
            await lHost.generate();
        } catch (e) {
            err = (e && e.message) || String(e);
        }
        mx.Core.applyChanges();
        await new Promise((r) => setTimeout(r, 120));
        const dom = lHost.getDomRef();
        const rect = dom ? dom.getBoundingClientRect() : { width: 0, height: 0 };
        // Taken BEFORE the row-clone step below: the cloned row is empty and its required cell
        // legitimately blocks submit, so measuring after the clone would report a false defect.
        const submitAccepted = lHost.triggerSubmit() === true;

        let extra = {};
        if (strategy === "wizard") {
            const stepOne = lHost._innerHost.engine.getPluginByPath("StepOneField").control;
            const btns = dom ? dom.querySelectorAll(".sapMBtn") : [];
            const nextBtn = btns[1];
            if (nextBtn) {
                const ui5Btn = mx.Element.closestTo(nextBtn);
                if (ui5Btn && ui5Btn.firePress) {
                    ui5Btn.firePress();
                    mx.Core.applyChanges();
                }
            }
            extra = {
                buttons: btns.length,
                stepRetained: stepOne.getParent() !== null && Boolean(stepOne.getModel(lHost._innerHost.activeModelName))
            };
        }
        if (strategy === "table") {
            const table = lHost.findAggregatedObjects(true).find((c) => c.getMetadata && c.getMetadata().getName() === "sap.m.Table");
            const addBtn = lHost.findAggregatedObjects(true).find((c) => c.data && c.data("metauiTableAddBtn"));
            const rowsBefore = table ? table.getItems().length : -1;
            let cloneThrew = null;
            if (addBtn) {
                try {
                    addBtn.firePress();
                } catch (e) {
                    cloneThrew = (e && e.message) || String(e);
                }
                mx.Core.applyChanges();
                await new Promise((r) => setTimeout(r, 200));
            }
            const rowsAfter = table ? table.getItems().length : -1;
            const lastRow = table && table.getItems().length ? table.getItems()[table.getItems().length - 1] : null;
            const lastRowDom = lastRow && lastRow.getDomRef ? lastRow.getDomRef() : null;
            const lrr = lastRowDom ? lastRowDom.getBoundingClientRect() : { width: 0, height: 0 };
            const cellBoxes = lastRowDom
                ? Array.prototype.slice.call(lastRowDom.querySelectorAll("td")).map((td) => {
                      const r = td.getBoundingClientRect();
                      return { w: Math.round(r.width), h: Math.round(r.height) };
                  })
                : [];
            out.rowClone = {
                addButtonFound: Boolean(addBtn),
                rowsBefore,
                rowsAfter,
                cloneThrew,
                newRowBox: { w: Math.round(lrr.width), h: Math.round(lrr.height) },
                newRowCellBoxes: cellBoxes
            };
            extra = { columns: table ? table.getColumns().length : -1 };
        }

        out.layouts[strategy] = {
            generateError: err,
            w: Math.round(rect.width),
            h: Math.round(rect.height),
            submitAccepted,
            ...extra
        };
        container.removeItem(lHost);
        lHost.destroy();
    }

    // Dialog host isolation + messaging lifecycle.
    parentInvalidations = 0;
    const dialogHost = new mx.DynamicHost({
        schemaDefinition: { type: "object", required: ["OrderCode"], properties: { OrderCode: { type: "string", minLength: 4, ui: { label: "Order Code" } } } },
        data: { OrderCode: "AB" },
        editable: true,
        useMessageManager: true
    });
    container.addAggregation("dependents", dialogHost, true);
    let dialogError = null;
    try {
        const closePromise = dialogHost.openInDialog("Matrix Dialog", "Confirm", "Cancel", "auto", container);
        await dialogHost.generate();
        await new Promise((r) => setTimeout(r, 250));
        mx.Core.applyChanges();

        const activeDialog = dialogHost._innerHost.dialogDelegate.activeDialog;
        const dlgDom = activeDialog && activeDialog.getDomRef ? activeDialog.getDomRef() : null;
        const dr = dlgDom ? dlgDom.getBoundingClientRect() : { width: 0, height: 0 };
        out.dialog.dialogBox = { w: Math.round(dr.width), h: Math.round(dr.height) };
        out.dialog.blockedOnInvalid = dialogHost.triggerSubmit() === false;
        out.dialog.messagesOnInvalid = dialogHost.getStateManager().getOwnMessages().length;

        const orderInput = dialogHost._innerHost.engine.getPluginByPath("OrderCode").control;
        orderInput.setValue("ORD-9000");
        orderInput.fireChange({ value: "ORD-9000" });
        out.dialog.messagesAfterFix = dialogHost.getStateManager().getOwnMessages().length;

        activeDialog.getBeginButton().firePress();
        await closePromise;
        mx.Core.applyChanges();
        out.dialog.closedCleanly = true;
    } catch (e) {
        dialogError = (e && e.message) || String(e);
        out.dialog.closedCleanly = false;
    }
    out.dialog.error = dialogError;
    out.dialog.parentInvalidations = parentInvalidations;
    dialogHost.destroy();
    container.destroy();
    return out;
};

/** Transactional / live model synchronisation, re-run per engine. */
const probeModelSync = async () => {
    const mx = window.__mx;
    const container = new mx.VBox({ width: "1000px" });
    container.placeAt("consumer-mount");
    mx.Core.applyChanges();

    const model = new mx.JSONModel({ objPayload: { Code: "INIT-OBJ", Qty: 10 }, strPayload: JSON.stringify({ Code: "INIT-STR", Qty: 20 }) });
    const syncSchema = { type: "object", required: ["Code", "Qty"], properties: { Code: { type: "string", minLength: 3 }, Qty: { type: "integer", minimum: 1 } } };

    const txHost = new mx.DynamicHost({ schemaDefinition: syncSchema, liveUpdate: false, editable: true });
    txHost.setModel(model);
    txHost.bindProperty("data", { path: "/objPayload" });
    container.addItem(txHost);
    mx.Core.applyChanges();
    await txHost.generate();
    mx.Core.applyChanges();

    const txInput = txHost._innerHost.engine.getPluginByPath("Code").control;
    txInput.setValue("EDITED-OBJ");
    txInput.fireChange({ value: "EDITED-OBJ" });

    const res = {
        shieldedBeforeSubmit: model.getProperty("/objPayload/Code") === "INIT-OBJ" && JSON.parse(txHost.getProperty("dataJson")).Code === "INIT-OBJ",
        onDemandOutputBeforeSubmit: txHost.getProperty("outputData").Code === "EDITED-OBJ",
        txSubmitted: txHost.triggerSubmit() === true
    };
    res.onDemandJsonAfterSubmit = JSON.parse(txHost.getProperty("dataJson")).Code === "EDITED-OBJ";
    res.pushedAfterSubmit = model.getProperty("/objPayload/Code") === "EDITED-OBJ";
    container.removeItem(txHost);
    txHost.destroy();

    const liveHost = new mx.DynamicHost({ schemaDefinition: syncSchema, liveUpdate: true, editable: true });
    liveHost.setModel(model);
    liveHost.bindProperty("dataJson", { path: "/strPayload" });
    container.addItem(liveHost);
    mx.Core.applyChanges();
    await liveHost.generate();
    mx.Core.applyChanges();
    const liveInput = liveHost._innerHost.engine.getPluginByPath("Code").control;
    liveInput.setValue("LIVE-STR-OK");
    liveInput.fireChange({ value: "LIVE-STR-OK" });
    res.liveStringSynced = JSON.parse(model.getProperty("/strPayload")).Code === "LIVE-STR-OK";

    container.removeItem(liveHost);
    liveHost.destroy();
    model.destroy();
    container.destroy();
    return res;
};

/**
 * Pushes date strings through MetaUI's own DateFormatterPlugin and through the raw engine
 * `Date.parse`. Non-ISO date strings are implementation-defined in ECMA-262, which is the
 * single most common place Safari/WebKit diverges from Blink, so the divergence is measured
 * against the code path that actually consumes it rather than assumed.
 */
const probeDateParsing = async () => {
    const mod = await new Promise((resolve, reject) =>
        sap.ui.require(["nz/co/siliconst/ui5/metaui/plugins/formatters/DateFormatterPlugin"], resolve, reject)
    );
    const Plugin = mod.DateFormatterPlugin || mod;
    const fmt = new Plugin();
    const samples = [
        "2026-10-22",
        "2026-10-22T08:30:00Z",
        "2026-10-22T08:30:00",
        "2026-10-22 08:30:00",
        "10/22/2026",
        "22.10.2026",
        "Oct 22, 2026",
        "2026/10/22",
        "20261022",
        "/Date(1792153800000)/",
        "not-a-date"
    ];
    const out = { formatted: {}, rawParse: {}, roundTrip: {} };
    for (const s of samples) {
        try {
            out.formatted[s] = fmt.format(s);
        } catch (e) {
            out.formatted[s] = "THREW:" + ((e && e.message) || String(e));
        }
        const t = Date.parse(s);
        out.rawParse[s] = Number.isNaN(t) ? "NaN" : new Date(t).toISOString();
        try {
            out.roundTrip[s] = fmt.parse(fmt.format(s));
        } catch (e) {
            out.roundTrip[s] = "THREW:" + ((e && e.message) || String(e));
        }
    }
    return out;
};

/**
 * The geolocation SUCCESS path, run in a context where the permission is granted and a position
 * is mocked. Without this, "geolocation did nothing" could not be separated from "geolocation is
 * broken on this engine".
 */
const probeGeolocationGranted = async () => {
    const mx = window.__mx;
    const container = new mx.VBox({ width: "600px" });
    container.placeAt("consumer-mount");
    mx.Core.applyChanges();
    const host = new mx.DynamicHost({
        schemaDefinition: { type: "object", properties: { Where: { type: "object", ui: { widget: "location", label: "Where" } } } },
        data: { Where: null },
        editable: true
    });
    container.addItem(host);
    mx.Core.applyChanges();
    await host.generate();
    mx.Core.applyChanges();
    const ctrl = host._innerHost.engine.getPluginByPath("Where").control;
    const before = ctrl.coordInput.getValue();
    ctrl.locateBtn.firePress();
    await new Promise((r) => setTimeout(r, 4000));
    const result = {
        valueBefore: before,
        valueAfter: ctrl.coordInput.getValue(),
        busyAfter: ctrl.locateBtn.getBusy(),
        storedValue: ctrl.getProperty("value")
    };
    host.destroy();
    container.destroy();
    return result;
};

/**
 * The TOUCH drawing path of SignatureControl, which no desktop pointer test reaches.
 * SAPUI5 supports Safari on iOS/iPadOS and Chrome on Android, so `ontouchstart/move/end` is a
 * shipped code path on two of the three engines' mobile forms. Events are dispatched directly
 * because Playwright's touchscreen API only taps; this still exercises the control's handlers
 * and its `e.touches[0].clientX` coordinate maths on each engine's TouchEvent implementation.
 */
const probeSignatureTouch = async () => {
    const mx = window.__mx;
    const container = new mx.VBox({ width: "600px" });
    container.placeAt("consumer-mount");
    mx.Core.applyChanges();
    const host = new mx.DynamicHost({
        schemaDefinition: { type: "object", properties: { Sign: { type: "string", ui: { widget: "signature", label: "Sign" } } } },
        data: { Sign: null },
        editable: true
    });
    container.addItem(host);
    mx.Core.applyChanges();
    await host.generate();
    mx.Core.applyChanges();
    await new Promise((r) => setTimeout(r, 150));

    const ctrl = host._innerHost.engine.getPluginByPath("Sign").control;
    const canvas = document.getElementById(`${ctrl.getId()}-sig-canvas`);
    const result = { touchEventCtorAvailable: typeof window.TouchEvent !== "undefined", canvasPresent: Boolean(canvas) };
    if (canvas) {
        const rect = canvas.getBoundingClientRect();
        const fire = (type, x, y) => {
            let evt;
            try {
                const touch = new Touch({ identifier: 1, target: canvas, clientX: x, clientY: y });
                evt = new TouchEvent(type, { touches: type === "touchend" ? [] : [touch], changedTouches: [touch], bubbles: true, cancelable: true });
            } catch (e) {
                // Engines without the Touch constructor still accept a hand-rolled event object.
                evt = new Event(type, { bubbles: true, cancelable: true });
                evt.touches = type === "touchend" ? [] : [{ clientX: x, clientY: y }];
                evt.changedTouches = [{ clientX: x, clientY: y }];
            }
            canvas.dispatchEvent(evt);
        };
        fire("touchstart", rect.left + 20, rect.top + 20);
        for (let i = 1; i <= 10; i++) fire("touchmove", rect.left + 20 + i * 12, rect.top + 20 + (i % 2) * 20);
        fire("touchend", rect.left + 140, rect.top + 30);
        await new Promise((r) => setTimeout(r, 150));
        const ctx = canvas.getContext("2d");
        let nonBlank = 0;
        try {
            const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
            for (let i = 3; i < data.length; i += 4) if (data[i] !== 0) nonBlank++;
        } catch (e) {
            result.readThrew = (e && e.message) || String(e);
        }
        const value = ctrl.getProperty("value");
        result.nonBlankPixels = nonBlank;
        result.valueIsDataUrl = typeof value === "string" && value.indexOf("data:image/png") === 0;
        result.touchActionStyle = window.getComputedStyle(canvas).touchAction;
    }
    host.destroy();
    container.destroy();
    return result;
};

/** Tears a fixture down and reports whether anything leaked DOM. */
const teardownFixture = (args) => {
    const mx = window.__mx;
    const host = mx.hosts[args.label];
    const container = mx.containers[args.label];
    if (host) host.destroy();
    if (container) container.destroy();
    delete mx.hosts[args.label];
    delete mx.containers[args.label];
    const mount = document.getElementById("consumer-mount");
    return { mountChildrenLeft: mount ? mount.childElementCount : -1 };
};

module.exports = {
    bootstrap,
    renderFixture,
    probeLabelPlacement,
    collectInteractionTargets,
    readHostValue,
    probePickers,
    probeHardware,
    probeSilentDegradation,
    probeSignaturePixels,
    probeFormatting,
    probeDateParsing,
    probeLayoutsAndDialog,
    probeModelSync,
    probeGeolocationGranted,
    probeSignatureTouch,
    teardownFixture
};
