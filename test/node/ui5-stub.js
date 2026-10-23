/**
 * @file ui5-stub.js
 * @description Node-side UI5 module interception for the property-based suite.
 *
 * Same approach as `test/swagger_schemas/node-ui5-stub.js` (intercept `Module._load`
 * before the first `require` of a `src/` module), extended with the two formatting
 * modules the pipeline pulls in eagerly — `sap/ui/core/format/NumberFormat` and
 * `sap/ui/core/format/DateFormat` — and with a log sink the properties assert against.
 *
 * The two format stubs are deliberately an *exactly invertible* pair over the domain the
 * generators produce (en-US, grouped thousands, 2 fraction digits; `MMM d, yyyy`). A
 * round-trip failure is therefore attributable to the plugin's own pre/post-processing
 * and never to the stub. See `pipeline.spec.ts`.
 */

const Module = require("module");
const fs = require("fs");
const path = require("path");

/** Message and details joined, so a search finds the text whichever slot it was passed in. */
function entryText(entry) {
    return entry.details === undefined ? entry.message : `${entry.message} ${entry.details}`;
}

/**
 * Captures MetaUI log output so the "fail loudly" properties can assert that a lossy
 * transformation was reported. Disabled until a test calls `start()`, so the generators
 * do not accumulate hundreds of thousands of entries.
 */
const logSink = {
    capturing: false,
    entries: [],
    start() {
        this.capturing = true;
        this.entries.length = 0;
        return this;
    },
    stop() {
        this.capturing = false;
        return this;
    },
    push(level, message, details, component) {
        if (!this.capturing) return;
        if (this.entries.length >= 200) return;
        this.entries.push({
            level,
            message: String(message),
            details: details === undefined ? undefined : String(details),
            component
        });
    },
    /** True when any captured entry of `level` contains `needle` in its message or details. */
    has(level, needle) {
        return this.entries.some((e) => e.level === level && entryText(e).indexOf(needle) !== -1);
    },
    /**
     * True when any captured warning or error mentions `needle`.
     *
     * Message *and* details are searched: 87 of the 127 `Logger.warn`/`Logger.error` call sites
     * in `src/` pass the component tag as the first argument and the real diagnostic as the
     * second, so the text lands in UI5's `details` slot. See finding L1 in the report.
     */
    reported(needle) {
        return this.entries.some(
            (e) => (e.level === "warning" || e.level === "error") && entryText(e).indexOf(needle) !== -1
        );
    },
    /** All captured entries, joined — used in assertion messages. */
    text() {
        return this.entries.map((e) => `${e.level}: ${entryText(e)}`).join("\n");
    }
};

const LOG_STUB = {
    debug(message, details, component) {
        logSink.push("debug", message, details, component);
    },
    info(message, details, component) {
        logSink.push("info", message, details, component);
    },
    warning(message, details, component) {
        logSink.push("warning", message, details, component);
    },
    error(message, details, component) {
        logSink.push("error", message, details, component);
    }
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Groups the integer part of a fixed-point decimal string in threes, en-US style. */
function group(fixed) {
    const dot = fixed.indexOf(".");
    const intPart = dot === -1 ? fixed : fixed.slice(0, dot);
    const rest = dot === -1 ? "" : fixed.slice(dot);
    return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + rest;
}

const CURRENCY_INSTANCE = {
    format(value) {
        if (typeof value !== "number" || !Number.isFinite(value)) return "";
        return group(value.toFixed(2));
    },
    parse(text) {
        if (typeof text !== "string") return NaN;
        const normalized = text.replace(/,/g, "").trim();
        if (!/^[+-]?\d+(\.\d+)?$/.test(normalized)) return NaN;
        return Number(normalized);
    }
};

const NUMBER_FORMAT_STUB = {
    getCurrencyInstance() {
        return CURRENCY_INSTANCE;
    },
    getFloatInstance() {
        return CURRENCY_INSTANCE;
    },
    getIntegerInstance() {
        return CURRENCY_INSTANCE;
    }
};

const DATE_INSTANCE = {
    format(date) {
        if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
        return `${MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
    },
    parse(text) {
        if (typeof text !== "string") return null;
        const match = /^([A-Z][a-z]{2}) (\d{1,2}), (\d{1,6})$/.exec(text.trim());
        if (!match) return null;
        const monthIdx = MONTHS.indexOf(match[1]);
        if (monthIdx === -1) return null;
        const day = Number(match[2]);
        const year = Number(match[3]);
        const parsed = new Date(2000, monthIdx, day);
        // Years 0-99 would be mapped into the 1900s by the Date constructor.
        parsed.setFullYear(year);
        if (parsed.getMonth() !== monthIdx || parsed.getDate() !== day || parsed.getFullYear() !== year) {
            return null;
        }
        return parsed;
    }
};

const DATE_FORMAT_STUB = {
    getDateInstance() {
        return DATE_INSTANCE;
    },
    getDateTimeInstance() {
        return DATE_INSTANCE;
    },
    getTimeInstance() {
        return DATE_INSTANCE;
    }
};

/**
 * Parses a Java `.properties` file well enough for the MetaUI message bundle: `key=value`,
 * `#`/`!` comments, blank lines, and backslash line continuations.
 */
function parseProperties(text) {
    const entries = {};
    const lines = text.split(/\r?\n/);
    let pending = "";
    for (const rawLine of lines) {
        const line = pending ? pending + rawLine.trimStart() : rawLine;
        pending = "";
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("!")) continue;
        if (trimmed.endsWith("\\")) {
            pending = trimmed.slice(0, -1);
            continue;
        }
        const separator = trimmed.search(/[=:]/);
        if (separator === -1) continue;
        entries[trimmed.slice(0, separator).trim()] = trimmed.slice(separator + 1).trim();
    }
    return entries;
}

/**
 * Resource bundle backed by the library's real `messagebundle.properties`, so a text key that is
 * declared but not shipped surfaces as `undefined` here exactly as it would in the browser.
 */
const BUNDLE_PATH = path.join(
    __dirname,
    "..",
    "..",
    "src",
    "nz",
    "co",
    "siliconst",
    "ui5",
    "metaui",
    "messagebundle.properties"
);

let bundleTexts = null;

function loadBundleTexts() {
    if (bundleTexts === null) {
        bundleTexts = fs.existsSync(BUNDLE_PATH)
            ? parseProperties(fs.readFileSync(BUNDLE_PATH, "utf8"))
            : {};
    }
    return bundleTexts;
}

/**
 * Mirror of `sap/base/strings/formatMessage`, which is what `ResourceBundle#getText` runs the
 * text through when arguments are supplied. The quoting rules are java.text.MessageFormat's, and
 * they matter: `metaui.validation.const=Value must equal ''{0}''.` renders as
 * `Value must equal 'ABC'.` in a browser. A naive `{n}` replacement would leave the apostrophes
 * doubled here, and a property comparing a produced message against an expected string would then
 * fail in a way that looks like a library defect and is really a stub artefact.
 *
 * The pattern and the branch order are taken from the UI5 implementation, including its error on
 * an unpaired brace — a bundle that trips it has a real defect worth surfacing, not hiding.
 */
const MESSAGE_FORMAT_PATTERN = /('')|'([^']+(?:''[^']*)*)(?:'|$)|\{([0-9]+(?:\s*,[^{}]*)?)\}|[{}]/g;

function formatMessage(pattern, values) {
    const args = values === undefined ? [] : Array.isArray(values) ? values : [values];
    return pattern.replace(
        MESSAGE_FORMAT_PATTERN,
        (match, escapedBracket, escapedText, index, offset) => {
            if (escapedBracket) return "'";
            if (escapedText) return escapedText.replace(/''/g, "'");
            if (index) return String(args[parseInt(index, 10)]);
            throw new Error(`formatMessage: pattern syntax error at pos. ${offset}`);
        }
    );
}

const RESOURCE_BUNDLE_STUB = {
    getText(key, args, ignoreKeyFallback) {
        const texts = loadBundleTexts();
        const template = texts[key];
        if (template === undefined) {
            return ignoreKeyFallback ? undefined : key;
        }
        // UI5 only runs the text through formatMessage when arguments are supplied; without them
        // a doubled apostrophe stays doubled. That asymmetry is real behaviour, so it is kept.
        return args === undefined || args === null ? template : formatMessage(template, args);
    },
    hasText(key) {
        return Object.prototype.hasOwnProperty.call(loadBundleTexts(), key);
    }
};

const LIB_STUB = {
    getResourceBundleFor() {
        return RESOURCE_BUNDLE_STUB;
    }
};

/** Wraps a stub so both `require(x)` and `import x from "x"` (CommonJS interop) resolve it. */
function asModule(stub) {
    return Object.assign({ __esModule: true, default: stub }, stub);
}

/** Minimal UI5 class stub for modules imported at file scope by layout and delegate modules. */
function StubControl(settings) {
    this._settings = settings || {};
}

const SAP_M_LIBRARY_STUB = {
    FlexRendertype: { Bare: "Bare", Div: "Div" },
    ButtonType: { Default: "Default", Emphasized: "Emphasized", Reject: "Reject", Transparent: "Transparent" },
    ListMode: { None: "None", Delete: "Delete", SingleSelectMaster: "SingleSelectMaster" },
    PopinDisplay: { Inline: "Inline" }
};

const SAP_UI_CORE_LIBRARY_STUB = {
    ValueState: { None: "None", Error: "Error", Warning: "Warning", Success: "Success", Information: "Information" },
    MessageType: { None: "None", Error: "Error", Warning: "Warning", Success: "Success", Information: "Information" }
};

const STUBS = {
    "sap/base/Log": asModule(LOG_STUB),
    "sap/ui/core/format/NumberFormat": asModule(NUMBER_FORMAT_STUB),
    "sap/ui/core/format/DateFormat": asModule(DATE_FORMAT_STUB),
    "sap/ui/core/Lib": asModule(LIB_STUB),
    "sap/base/i18n/ResourceBundle": asModule(RESOURCE_BUNDLE_STUB),
    "sap/m/Label": asModule(StubControl),
    "sap/m/VBox": asModule(StubControl),
    "sap/m/HBox": asModule(StubControl),
    "sap/m/FlexItemData": asModule(StubControl),
    "sap/m/Button": asModule(StubControl),
    "sap/m/Dialog": asModule(StubControl),
    "sap/m/BusyDialog": asModule(StubControl),
    "sap/m/Table": asModule(StubControl),
    "sap/m/ColumnListItem": asModule(StubControl),
    "sap/m/Text": asModule(StubControl),
    "sap/m/MessageBox": asModule({ error() {}, warning() {}, show() {} }),
    "sap/m/MessageStrip": asModule(StubControl),
    "sap/m/library": asModule(SAP_M_LIBRARY_STUB),
    "sap/ui/core/Control": asModule(StubControl),
    "sap/ui/core/Element": asModule(StubControl),
    "sap/ui/core/Title": asModule(StubControl),
    "sap/ui/core/InvisibleText": asModule(StubControl),
    "sap/ui/core/library": asModule(SAP_UI_CORE_LIBRARY_STUB),
    "sap/ui/layout/form/SimpleForm": asModule(StubControl),
    "sap/ui/layout/GridData": asModule(StubControl),
    "sap/ui/base/BindingParser": asModule({ complexParser() { return null; } }),
    "sap/ui/base/ManagedObject": asModule(StubControl),
    "sap/ui/base/DataType": asModule({ getType() { return null; } }),
    "sap/ui/base/Event": asModule(StubControl),
    "sap/ui/model/Context": asModule(StubControl),
    "sap/ui/model/json/JSONModel": asModule(StubControl),
    "sap/ui/model/odata/v4/Context": asModule(StubControl)
};

if (!Module._metaUiPropertyStubInstalled) {
    Module._metaUiPropertyStubInstalled = true;
    const originalLoad = Module._load;
    Module._load = function (request) {
        if (Object.prototype.hasOwnProperty.call(STUBS, request)) {
            return STUBS[request];
        }
        if (request.startsWith("sap/")) {
            throw new Error(
                `The property suite reached UI5 module '${request}', which has no Node stub. ` +
                    `Either add one in test/node/ui5-stub.js or move this coverage into the browser suite.`
            );
        }
        return originalLoad.apply(this, arguments);
    };
}

module.exports = { logSink };
