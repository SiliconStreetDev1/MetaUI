/**
 * @file widget-matrix.js
 * @description Derives the full (type, widget) mapping list from `DefaultPluginBootstrapper.ts`
 * and builds ONE schema that renders every mapping, so each engine can be held to the same
 * "52/52 mappings render with non-zero geometry" bar rather than to a hand-written subset.
 *
 * Read-only on `src/`. The list is parsed, never restated: adding a mapping to the bootstrapper
 * adds a column to this matrix on the next run, and a mapping whose widget has no fixture recipe
 * below fails loudly instead of being silently skipped.
 */

const fs = require("fs");
const path = require("path");

const SRC_DIR = path.join(__dirname, "..", "..", "src", "nz", "co", "siliconst", "ui5", "metaui");
const BOOTSTRAPPER = path.join(SRC_DIR, "core", "DefaultPluginBootstrapper.ts");
const CONSTANTS = path.join(SRC_DIR, "constants", "MetaUIConstants.ts");

/** Parses `export const NAME = { KEY: "value", ... }` blocks out of MetaUIConstants.ts. */
function parseConstBlock(source, name) {
    const start = source.indexOf(`export const ${name} = {`);
    if (start === -1) throw new Error(`widget-matrix.js: ${name} not found in ${CONSTANTS}`);
    const end = source.indexOf("}", start);
    const body = source.slice(source.indexOf("{", start) + 1, end);
    const out = {};
    for (const line of body.split("\n")) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*:\s*"([^"]*)"/);
        if (m) out[m[1]] = m[2];
    }
    return out;
}

const constantsSource = fs.readFileSync(CONSTANTS, "utf8");
const SCHEMA_TYPE = parseConstBlock(constantsSource, "SCHEMA_TYPE");
const WIDGET_TYPE = parseConstBlock(constantsSource, "WIDGET_TYPE");

const bootSource = fs.readFileSync(BOOTSTRAPPER, "utf8");
const MAPPINGS = [];
const callRe = /registry\.registerPluginPath\(\s*SCHEMA_TYPE\.([A-Z0-9_]+)\s*,\s*([^,]+?)\s*,\s*`\$\{[A-Z_]+\}([A-Za-z0-9_]+)`\s*\)/g;
let match;
while ((match = callRe.exec(bootSource)) !== null) {
    const type = SCHEMA_TYPE[match[1]];
    const widgetToken = match[2].trim();
    let widget;
    if (widgetToken === "undefined") {
        widget = undefined;
    } else if (widgetToken.startsWith("WIDGET_TYPE.")) {
        widget = WIDGET_TYPE[widgetToken.slice("WIDGET_TYPE.".length)];
    } else {
        widget = widgetToken.replace(/^["']|["']$/g, "");
    }
    if (!type || (widgetToken !== "undefined" && widget === undefined)) {
        throw new Error(`widget-matrix.js: could not resolve mapping (${match[1]}, ${widgetToken})`);
    }
    MAPPINGS.push({ type, widget, plugin: match[3] });
}

if (MAPPINGS.length === 0) {
    throw new Error(`widget-matrix.js: parsed zero mappings out of ${BOOTSTRAPPER}`);
}

const DATASOURCE = {
    url: "/mockData/scenarios/index.json",
    keyField: "category",
    textField: "category"
};

/**
 * Per-widget schema fragments and seed values. A mapping with no entry here falls back to the
 * bare `{ type }` form, which is correct for the plain scalar plugins.
 */
const RECIPES = {
    "object|undefined": { schema: { properties: { Inner: { type: "string" } } }, value: { Inner: "inner" } },
    "object|dictionaryMap": { schema: { additionalProperties: { type: "string" } }, value: { PORT: "8080" } },
    "object|reference": { schema: { $ref: "#/definitions/MatrixRefPart" }, value: { PartCode: "P-100" } },
    "object|polymorphic": {
        schema: {
            oneOf: [
                { title: "Card", type: "object", properties: { CardNo: { type: "string" } } },
                { title: "Bank", type: "object", properties: { Iban: { type: "string" } } }
            ]
        },
        value: { CardNo: "4111" }
    },
    "object|location": { value: { lat: -36.8485, lng: 174.7633 } },
    "array|undefined": {
        schema: { items: { type: "object", properties: { ItemCode: { type: "string" } } } },
        value: [{ ItemCode: "IC-1" }]
    },
    "array|multiSelect": { schema: { items: { type: "string", enum: ["M1", "M2", "M3"] } }, value: ["M1"] },
    "array|multiInput": { schema: { items: { type: "string" } }, value: ["alpha", "beta"] },
    "string|select": { schema: { enum: ["A", "B", "C"] }, value: "B" },
    "number|select": { schema: { enum: [1, 2, 3] }, value: 2 },
    "integer|select": { schema: { enum: [1, 2, 3] }, value: 2 },
    "number|step": { schema: { minimum: 0, maximum: 50 }, value: 10 },
    "integer|step": { schema: { minimum: 0, maximum: 50 }, value: 10 },
    "number|slider": { schema: { minimum: 0, maximum: 100 }, value: 40 },
    "integer|slider": { schema: { minimum: 0, maximum: 100 }, value: 40 },
    "number|rating": { schema: { maximum: 5 }, value: 4 },
    "integer|rating": { schema: { maximum: 5 }, value: 4 },
    "string|email": { schema: { format: "email" }, value: "dev@siliconst.co.nz" },
    "string|link": { value: "https://ui5.sap.com" },
    "string|urlButton": { ui: { options: { url: "https://ui5.sap.com" } }, value: "open" },
    "string|date": { value: "2026-10-22" },
    "string|datePicker": { value: "2026-10-22" },
    "string|datetime": { value: "2026-10-22T08:30:00Z" },
    "string|time": { value: "08:30:00" },
    "string|camera": { value: null },
    "string|signature": { value: null },
    "string|richText": { value: "<p>Hello</p>" },
    "string|codeEditor": { value: '{"ok":true}' },
    "string|messageStrip": { value: "System status normal" },
    "string|fileUploader": { value: "report.pdf" },
    "string|voiceInput": { value: "Recorded note" },
    "string|textArea": { value: "Line 1\nLine 2" },
    "string|password": { value: "hunter2" },
    "date|undefined": { value: "2026-10-22" },
    "date|date": { value: "2026-10-22" },
    "date|datePicker": { value: "2026-10-22" },
    "boolean|undefined": { value: true },
    "boolean|switch": { value: true },
    "number|undefined": { value: 4.5 },
    "integer|undefined": { value: 4 },
    "string|undefined": { value: "Matrix value" },
    "string|default": { value: "Matrix default" }
};

const DATASOURCE_WIDGETS = new Set([
    "odataSelect",
    "remoteDropdown",
    "remoteSelect",
    "combobox",
    "liveSearch",
    "remoteValueHelp",
    "valueHelp"
]);

/** Stable, unique, DOM-safe property key for a mapping. */
function keyFor(mapping, index) {
    const widget = mapping.widget ? mapping.widget.charAt(0).toUpperCase() + mapping.widget.slice(1) : "Base";
    const type = mapping.type.charAt(0).toUpperCase() + mapping.type.slice(1);
    return `M${String(index).padStart(2, "0")}${type}${widget}`;
}

/**
 * Builds the all-mappings schema + payload.
 * @returns {{schema: object, data: object, index: Array<{key: string, type: string, widget: string|undefined, plugin: string}>}}
 */
function buildWidgetMatrixFixture() {
    const properties = {};
    const data = {};
    const index = [];

    MAPPINGS.forEach((mapping, i) => {
        const key = keyFor(mapping, i);
        const recipeKey = `${mapping.type}|${mapping.widget === undefined ? "undefined" : mapping.widget}`;
        const recipe = RECIPES[recipeKey] || {};
        const isDataSource = mapping.widget && DATASOURCE_WIDGETS.has(mapping.widget);

        const ui = Object.assign(
            { label: `${mapping.type}:${mapping.widget || "(base)"}` },
            mapping.widget ? { widget: mapping.widget } : {},
            isDataSource ? { dataSource: DATASOURCE } : {},
            recipe.ui || {}
        );

        properties[key] = Object.assign({ type: mapping.type }, recipe.schema || {}, { ui });
        if (Object.prototype.hasOwnProperty.call(recipe, "value")) {
            data[key] = recipe.value;
        } else if (isDataSource) {
            data[key] = "Standard Schemas";
        } else if (mapping.type === "array") {
            data[key] = [];
        } else if (mapping.type === "object") {
            data[key] = {};
        } else {
            data[key] = mapping.type === "boolean" ? true : mapping.type === "number" || mapping.type === "integer" ? 1 : "val";
        }
        index.push({ key, type: mapping.type, widget: mapping.widget, plugin: mapping.plugin });
    });

    return {
        schema: {
            type: "object",
            layoutStrategy: "form",
            definitions: {
                MatrixRefPart: { type: "object", properties: { PartCode: { type: "string", default: "P-100" } } }
            },
            properties
        },
        data,
        index
    };
}

module.exports = { MAPPINGS, buildWidgetMatrixFixture };
