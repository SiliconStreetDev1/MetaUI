/* eslint-disable */
/**
 * @file fixtures.js
 * @description Deterministic schema / payload generators for the MetaUI benchmark suite.
 *              Runs inside the browser page; exposed as `window.MetaUIFixtures`.
 *
 * Every generator is pure and seeded, so a given (scenario, size) pair always produces
 * byte-identical input across runs and across machines.
 */
(function (global) {
    "use strict";

    // ---------------------------------------------------------------- seeded RNG
    function mulberry32(seed) {
        let a = seed >>> 0;
        return function () {
            a |= 0;
            a = (a + 0x6d2b79f5) | 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    /** The 6 field archetypes used for "mixed" forms, in fixed rotation so size is the only variable. */
    const FIELD_CYCLE = ["string", "number", "boolean", "date", "enum", "textarea"];

    function fieldName(i) {
        return "Field" + String(i).padStart(4, "0");
    }

    function scalarMeta(kind, i) {
        switch (kind) {
            case "number":
                return { type: "number", minimum: 0, maximum: 100000, ui: { label: "Number " + i } };
            case "boolean":
                return { type: "boolean", ui: { label: "Flag " + i } };
            case "date":
                return { type: "date", ui: { label: "Date " + i } };
            case "enum":
                return {
                    type: "string",
                    enum: ["Alpha", "Bravo", "Charlie", "Delta"],
                    ui: { label: "Choice " + i, widget: "dropdown" }
                };
            case "textarea":
                return { type: "string", maxLength: 400, ui: { label: "Notes " + i, widget: "textarea" } };
            case "string":
            default:
                return { type: "string", maxLength: 80, ui: { label: "Text " + i } };
        }
    }

    function scalarValue(kind, i, rnd) {
        switch (kind) {
            case "number":
                return Math.floor(rnd() * 100000);
            case "boolean":
                return rnd() > 0.5;
            case "date":
                return "20" + String(10 + (i % 15)).padStart(2, "0") + "-0" + (1 + (i % 9)) + "-1" + (i % 10);
            case "enum":
                return ["Alpha", "Bravo", "Charlie", "Delta"][i % 4];
            case "textarea":
                return "Lorem ipsum dolor sit amet " + i;
            case "string":
            default:
                return "Value " + i;
        }
    }

    // ------------------------------------------------- 1. flat explicit-schema form
    /**
     * Flat object schema with `n` mixed scalar fields. No uiLayout: the engine synthesises
     * one via DefaultLayoutGenerator, which is the common production shape.
     */
    function flatSchema(n, opts) {
        opts = opts || {};
        const props = {};
        for (let i = 0; i < n; i++) {
            const kind = FIELD_CYCLE[i % FIELD_CYCLE.length];
            const meta = scalarMeta(kind, i);
            if (opts.allString) {
                Object.assign(meta, { type: "string", maxLength: 80, ui: { label: "Text " + i } });
                delete meta.enum;
                delete meta.minimum;
                delete meta.maximum;
            }
            if (opts.required && i % 3 === 0) meta.required = true;
            if (opts.pattern) meta.pattern = "^[A-Za-z][A-Za-z0-9 _-]{0,79}$";
            props[fieldName(i)] = meta;
        }
        return { type: "object", title: "Flat " + n, properties: props, layoutStrategy: opts.layout || "form" };
    }

    function flatData(n, opts) {
        opts = opts || {};
        const rnd = mulberry32(1337 + n);
        const data = {};
        for (let i = 0; i < n; i++) {
            const kind = opts.allString ? "string" : FIELD_CYCLE[i % FIELD_CYCLE.length];
            data[fieldName(i)] = scalarValue(kind, i, rnd);
        }
        return data;
    }

    // --------------------------------------------------------- 2. inference payloads
    /**
     * Raw payload for data-inference benchmarking.
     *
     * @param {number} fields   scalar fields per object level
     * @param {number} depth    nesting depth (1 = flat object)
     * @param {number} rows     when > 0, the root is an array of `rows` such objects
     */
    function inferencePayload(fields, depth, rows) {
        const rnd = mulberry32(9001 + fields * 31 + depth * 7 + rows);

        function makeObject(level) {
            const obj = {};
            for (let i = 0; i < fields; i++) {
                const kind = FIELD_CYCLE[i % FIELD_CYCLE.length];
                obj[fieldName(i)] = scalarValue(kind, i, rnd);
            }
            if (level < depth - 1) {
                obj.Nested = makeObject(level + 1);
            }
            return obj;
        }

        if (rows > 0) {
            const out = [];
            for (let r = 0; r < rows; r++) out.push(makeObject(0));
            return out;
        }
        return makeObject(0);
    }

    /** Payload whose nesting is realised through arrays-of-objects rather than plain objects. */
    function nestedArrayPayload(fields, depth, childRows) {
        const rnd = mulberry32(4242 + depth);
        function makeObject(level) {
            const obj = {};
            for (let i = 0; i < fields; i++) {
                obj[fieldName(i)] = scalarValue(FIELD_CYCLE[i % FIELD_CYCLE.length], i, rnd);
            }
            if (level < depth - 1) {
                obj.Children = [];
                for (let c = 0; c < childRows; c++) obj.Children.push(makeObject(level + 1));
            }
            return obj;
        }
        return makeObject(0);
    }

    // ----------------------------------------------------------------- 3. tables
    function tableSchema(cols, opts) {
        opts = opts || {};
        const props = {};
        for (let c = 0; c < cols; c++) {
            const kind = opts.allString ? "string" : FIELD_CYCLE[c % FIELD_CYCLE.length];
            const meta = scalarMeta(kind, c);
            if (c === 0) meta.ui = Object.assign({}, meta.ui, { isKey: true });
            props["Col" + String(c).padStart(2, "0")] = meta;
        }
        return {
            type: "object",
            title: "Table host",
            properties: {
                Items: {
                    type: "array",
                    ui: { label: "Items" },
                    items: { type: "object", properties: props }
                }
            }
        };
    }

    function tableData(rows, cols, opts) {
        opts = opts || {};
        const rnd = mulberry32(777 + rows * 13 + cols);
        const items = [];
        for (let r = 0; r < rows; r++) {
            const row = {};
            for (let c = 0; c < cols; c++) {
                const kind = opts.allString ? "string" : FIELD_CYCLE[c % FIELD_CYCLE.length];
                row["Col" + String(c).padStart(2, "0")] = scalarValue(kind, r * cols + c, rnd);
            }
            items.push(row);
        }
        return { Items: items };
    }

    /** Root-level array payload, which the engine renders with the `table` layout strategy. */
    function rootTableData(rows, cols) {
        return tableData(rows, cols).Items;
    }

    // ---------------------------------------------------------------- 4. policies
    /**
     * Flat form of `fields` fields plus `policies` cross-field rules, each reading a distinct
     * driver field and targeting a distinct target field, so no two rules collapse onto the
     * same ledger entry.
     */
    function policySchema(fields, policies) {
        const schema = flatSchema(fields, { allString: false });
        const uiPolicies = [];
        const effects = ["Hide", "Require", "Disable", "Validate"];
        for (let p = 0; p < policies; p++) {
            const driverIdx = (p * 7) % fields;
            const targetIdx = (p * 11 + 3) % fields;
            const driverKind = FIELD_CYCLE[driverIdx % FIELD_CYCLE.length];
            const condition =
                driverKind === "number"
                    ? { NumericGreaterThan: { ["/" + fieldName(driverIdx)]: 50000 } }
                    : { StringEquals: { ["/" + fieldName(driverIdx)]: "Alpha" } };
            uiPolicies.push({
                effect: effects[p % effects.length],
                targets: ["/" + fieldName(targetIdx)],
                condition: condition,
                message: "Policy " + p + " failed"
            });
        }
        schema.uiPolicies = uiPolicies;
        return schema;
    }

    /**
     * Table whose policies use the `$row` token, forcing PolicyEngine.expandRowPolicies()
     * to clone each policy once per physical row before every evaluation.
     */
    function rowPolicySchema(cols, policies) {
        const schema = tableSchema(cols);
        const uiPolicies = [];
        const effects = ["Hide", "Require", "Disable"];
        for (let p = 0; p < policies; p++) {
            const targetCol = "Col" + String((p * 3) % cols).padStart(2, "0");
            const driverCol = "Col" + String((p * 5 + 1) % cols).padStart(2, "0");
            uiPolicies.push({
                effect: effects[p % effects.length],
                targets: ["/Items/$row/" + targetCol],
                condition: { StringEquals: { ["/Items/$row/" + driverCol]: "Alpha" } }
            });
        }
        schema.uiPolicies = uiPolicies;
        return schema;
    }

    // ------------------------------------------------------------------ 5. wizard
    function wizardSchema(steps, fieldsPerStep) {
        const total = steps * fieldsPerStep;
        const schema = flatSchema(total);
        schema.layoutStrategy = "wizard";
        schema.uiLayout = [];
        for (let s = 0; s < steps; s++) {
            const elements = [];
            for (let f = 0; f < fieldsPerStep; f++) {
                elements.push({ type: "Control", scope: "#/properties/" + fieldName(s * fieldsPerStep + f) });
            }
            schema.uiLayout.push({ type: "WizardStep", label: "Step " + (s + 1), elements: elements });
        }
        return schema;
    }

    // -------------------------------------------------------------- 6. validation
    /** Flat form where every field carries a validator chain; `regex` adds a `pattern` rule. */
    function validationSchema(fields, regex) {
        const props = {};
        for (let i = 0; i < fields; i++) {
            const meta = {
                type: "string",
                required: true,
                minLength: 2,
                maxLength: 120,
                ui: { label: "Text " + i }
            };
            if (regex) {
                // Linear-time, non-backtracking by construction: measures the regex engine's
                // cost in the pipeline, not catastrophic backtracking.
                meta.pattern = "^[A-Za-z][A-Za-z0-9 _.-]{1,119}$";
            }
            props[fieldName(i)] = meta;
        }
        return { type: "object", title: "Validation " + fields, properties: props };
    }

    /**
     * @param {number} fields
     * @param {boolean} [invalid] when true every field violates `required`/`minLength`, so a
     *        single `validateAll` fills the ValidationLedger with one entry per field. That is
     *        the state in which the per-change ledger scan is at its most expensive.
     */
    function validationData(fields, invalid) {
        const data = {};
        for (let i = 0; i < fields; i++) data[fieldName(i)] = invalid ? "" : "Sample value " + i;
        return data;
    }

    global.MetaUIFixtures = {
        fieldName: fieldName,
        flatSchema: flatSchema,
        flatData: flatData,
        inferencePayload: inferencePayload,
        nestedArrayPayload: nestedArrayPayload,
        tableSchema: tableSchema,
        tableData: tableData,
        rootTableData: rootTableData,
        policySchema: policySchema,
        rowPolicySchema: rowPolicySchema,
        wizardSchema: wizardSchema,
        validationSchema: validationSchema,
        validationData: validationData
    };
})(window);
