/**
 * @file directive-table.spec.ts
 * @description The `ui` directive contract, key by key.
 *
 * `directives.spec.ts` covers the widget-inference rules and the layout/policy guards. What it
 * does not cover is the directive block's own surface: the two dozen keys `docs/wiki/
 * AI_Schema_CheatSheet.md` publishes, each read with its own type guard. Those reads were executed
 * by other properties but never asserted, which is why they survived mutation wholesale.
 *
 * Each key is stated the same way as the schema keywords in `normalizer-keywords.spec.ts`: the
 * declared value when its JSON type is the documented one, `undefined` (or the documented default)
 * when it is absent, and `undefined` when it carries the wrong JSON type. The remaining groups
 * state the documented fallbacks — `ui.label` → `title` → generated label, `ui.format` → `format`,
 * `ui.placeholder` → `example` — and the normalizers for `valueHelp`, `dataSource`, `validators`,
 * `uiLayout` and `uiPolicies`.
 */

import * as assert from "assert";
import { withLogCapture, reported } from "./fc-config";
import { IUIDirective } from "../../src/nz/co/siliconst/ui5/metaui/interfaces/ISchema";
import {
    SchemaDirectiveNormalizer
} from "../../src/nz/co/siliconst/ui5/metaui/core/SchemaDirectiveNormalizer";

/** Normalizes a `ui` block on a plain string property. */
const directive = (ui: Record<string, unknown>, prop: Record<string, unknown> = {}): IUIDirective =>
    SchemaDirectiveNormalizer.normalizeUI(ui, prop, "sampleKey", "string", false);

/** One row of the directive key table. */
interface IDirectiveRow {
    readonly key: keyof IUIDirective;
    readonly accepted: readonly unknown[];
    readonly rejected: readonly unknown[];
    readonly absent: unknown;
}

const NOT_A_STRING: readonly unknown[] = [7, true, null, ["a"], { v: "a" }];
const NOT_A_BOOLEAN: readonly unknown[] = ["true", 1, 0, null, [true], { v: true }];
const NOT_A_NUMBER: readonly unknown[] = ["3", true, null, [3], { v: 3 }];

const STRING_KEYS: readonly (keyof IUIDirective)[] = [
    "placeholder",
    "visibleOn",
    "enabledOn",
    "valueState",
    "formatter",
    "dialogButtonText"
];

const BOOLEAN_KEYS: readonly (keyof IUIDirective)[] = ["visible", "enabled", "expandable", "fullWidth"];

const NUMBER_KEYS: readonly (keyof IUIDirective)[] = ["rows", "layoutBudget", "labelSpan"];

const DIRECTIVE_TABLE: readonly IDirectiveRow[] = [
    ...STRING_KEYS.map((key) => ({ key, accepted: ["x", "a longer value"], rejected: NOT_A_STRING, absent: undefined })),
    ...BOOLEAN_KEYS.map((key) => ({ key, accepted: [true, false], rejected: NOT_A_BOOLEAN, absent: undefined })),
    ...NUMBER_KEYS.map((key) => ({ key, accepted: [0, 3, 12], rejected: NOT_A_NUMBER, absent: undefined })),
    { key: "isKey", accepted: [true, false], rejected: NOT_A_BOOLEAN, absent: false },
    { key: "readOnly", accepted: [true, false], rejected: NOT_A_BOOLEAN, absent: false }
];

describe("SchemaDirectiveNormalizer — the ui directive key table", () => {
    for (const row of DIRECTIVE_TABLE) {
        it(`ui.${String(row.key)}: a value of the documented type is carried verbatim`, () => {
            for (const value of row.accepted) {
                assert.strictEqual(
                    directive({ [row.key]: value })[row.key],
                    value,
                    `${String(row.key)}=${JSON.stringify(value)}`
                );
            }
        });

        it(`ui.${String(row.key)}: an absent key takes its documented default`, () => {
            assert.strictEqual(directive({})[row.key], row.absent, String(row.key));
        });

        it(`ui.${String(row.key)}: a value of the wrong type takes the default, never a coercion`, () => {
            for (const value of row.rejected) {
                assert.strictEqual(
                    directive({ [row.key]: value })[row.key],
                    row.absent,
                    `${String(row.key)}=${JSON.stringify(value)} was accepted`
                );
            }
        });
    }

    it("ui.formatters keeps the string entries of an array and discards the rest", () => {
        assert.deepStrictEqual(directive({ formatters: ["phone", 7, "textCase"] }).formatters, ["phone", "textCase"]);
        assert.deepStrictEqual(directive({ formatters: [] }).formatters, []);
        assert.strictEqual(directive({ formatters: "phone" }).formatters, undefined, "a bare string is not a chain");
        assert.strictEqual(directive({}).formatters, undefined);
    });

    it("ui.args, ui.controlProps and ui.options are deep-copied, never shared", () => {
        const args = { nested: [1, 2] };
        const copied = directive({ args, controlProps: args, options: args });
        for (const carried of [copied.args, copied.controlProps, copied.options]) {
            assert.deepStrictEqual(carried, args);
            assert.notStrictEqual(carried, args, "the directive shares a reference with the source schema");
        }
    });

    it("ui.args accepts any JSON value, while controlProps and options must be objects", () => {
        assert.strictEqual(directive({ args: "upper" }).args, "upper");
        assert.strictEqual(directive({ args: 0 }).args, 0);
        assert.strictEqual(directive({ args: false }).args, false);
        assert.strictEqual(directive({}).args, undefined);
        assert.strictEqual(directive({ controlProps: "nope" }).controlProps, undefined);
        assert.strictEqual(directive({ options: ["nope"] }).options, undefined);
    });

    it("ui.renderMode accepts only the two documented modes", () => {
        assert.strictEqual(directive({ renderMode: "inline" }).renderMode, "inline");
        assert.strictEqual(directive({ renderMode: "dialog" }).renderMode, "dialog");
        for (const value of ["Inline", "popup", "", 1, true, null, ["inline"]]) {
            assert.strictEqual(directive({ renderMode: value }).renderMode, undefined, JSON.stringify(value));
        }
        assert.strictEqual(directive({}).renderMode, undefined);
    });
});

describe("SchemaDirectiveNormalizer — the documented fallbacks", () => {
    it("the label falls back from ui.label to title to a label generated from the key", () => {
        assert.strictEqual(directive({ label: "Explicit" }, { title: "Title" }).label, "Explicit");
        assert.strictEqual(directive({}, { title: "Title" }).label, "Title");
        assert.strictEqual(directive({}, {}).label, "Sample Key");
        assert.strictEqual(
            SchemaDirectiveNormalizer.normalizeUI({}, {}, "", "string", false).label,
            undefined,
            "a nameless node gets no invented label"
        );
    });

    it("the placeholder falls back from ui.placeholder to a scalar example", () => {
        assert.strictEqual(directive({ placeholder: "Type here" }, { example: "ACME" }).placeholder, "Type here");
        assert.strictEqual(directive({}, { example: "ACME" }).placeholder, "ACME");
        assert.strictEqual(directive({}, { example: 42 }).placeholder, "42");
        assert.strictEqual(directive({}, { example: false }).placeholder, "false");
        assert.strictEqual(directive({}, {}).placeholder, undefined);
    });

    it("a non-scalar or empty example illustrates nothing and is not used", () => {
        for (const example of [null, "", [1], { a: 1 }, undefined]) {
            assert.strictEqual(SchemaDirectiveNormalizer.exampleAsPlaceholder(example), undefined,
                JSON.stringify(example));
        }
        assert.strictEqual(SchemaDirectiveNormalizer.exampleAsPlaceholder("ACME"), "ACME");
        assert.strictEqual(SchemaDirectiveNormalizer.exampleAsPlaceholder(0), "0");
        assert.strictEqual(SchemaDirectiveNormalizer.exampleAsPlaceholder(true), "true");
    });

    it("readOnly falls back from ui.readOnly to the schema's readOnly, defaulting to false", () => {
        assert.strictEqual(directive({ readOnly: false }, { readOnly: true }).readOnly, false, "the ui block wins");
        assert.strictEqual(directive({}, { readOnly: true }).readOnly, true);
        assert.strictEqual(directive({}, { readOnly: false }).readOnly, false);
        assert.strictEqual(directive({}, {}).readOnly, false);
    });

    it("the format falls back from ui.format to the schema's format", () => {
        assert.strictEqual(directive({ format: "email" }, { format: "uri" }).format, "email");
        assert.strictEqual(directive({}, { format: "uri" }).format, "uri");
        assert.strictEqual(directive({}, {}).format, undefined);
    });
});

describe("SchemaDirectiveNormalizer — formatToWidget", () => {
    it("every documented format maps to its widget and canonical ui.format", () => {
        const table: ReadonlyArray<readonly [string, string | undefined, string | undefined]> = [
            ["date", "date", "date"],
            ["date-time", "datetime", "date-time"],
            ["datetime", "datetime", "date-time"],
            ["time", "time", "time"],
            ["email", "email", "email"],
            ["password", "password", "password"],
            ["uri", "link", "url"],
            ["url", "link", "url"],
            ["iban", undefined, "iban"],
            ["binary", "fileUploader", "binary"],
            ["byte", "fileUploader", "byte"]
        ];
        for (const [format, widget, uiFormat] of table) {
            const mapped = SchemaDirectiveNormalizer.formatToWidget(format);
            assert.strictEqual(mapped.widget, widget, `${format} widget`);
            assert.strictEqual(mapped.uiFormat, uiFormat, `${format} uiFormat`);
        }
    });

    it("an unknown format keeps its name and picks no widget", () => {
        for (const format of ["uuid", "ipv4", "hostname", "custom"]) {
            assert.deepStrictEqual(SchemaDirectiveNormalizer.formatToWidget(format), { uiFormat: format }, format);
        }
    });

    it("an absent or empty format maps to nothing at all", () => {
        assert.deepStrictEqual(SchemaDirectiveNormalizer.formatToWidget(undefined), {});
        assert.deepStrictEqual(SchemaDirectiveNormalizer.formatToWidget(""), {});
    });
});

describe("SchemaDirectiveNormalizer — resolveSchemaType", () => {
    it("a declared supported type is used as it is", () => {
        for (const type of ["object", "array", "string", "number", "integer", "boolean", "date"]) {
            assert.strictEqual(SchemaDirectiveNormalizer.resolveSchemaType({ type }).type, type, type);
        }
    });

    it("the OpenAPI 2.0 file type is mapped to string", () => {
        assert.strictEqual(SchemaDirectiveNormalizer.resolveSchemaType({ type: "file" }).type, "string");
    });

    it("a union type resolves to its first non-null member and flags nullability", () => {
        const resolved = SchemaDirectiveNormalizer.resolveSchemaType({ type: ["null", "integer"] });
        assert.strictEqual(resolved.type, "integer");
        assert.strictEqual(resolved.hasNullType, true);
        assert.strictEqual(SchemaDirectiveNormalizer.resolveSchemaType({ type: ["string"] }).hasNullType, false);
        assert.strictEqual(SchemaDirectiveNormalizer.resolveSchemaType({ type: "string" }).hasNullType, false);
    });

    it("with no declared type, the shape decides: items means array, structure means object", () => {
        assert.strictEqual(SchemaDirectiveNormalizer.resolveSchemaType({ items: { type: "string" } }).type, "array");
        assert.strictEqual(SchemaDirectiveNormalizer.resolveSchemaType({ properties: {} }).type, "object");
        assert.strictEqual(SchemaDirectiveNormalizer.resolveSchemaType({ additionalProperties: false }).type,
            "object");
        assert.strictEqual(SchemaDirectiveNormalizer.resolveSchemaType({ oneOf: [] }).type, "object");
        assert.strictEqual(SchemaDirectiveNormalizer.resolveSchemaType({ anyOf: [] }).type, "object");
        assert.strictEqual(SchemaDirectiveNormalizer.resolveSchemaType({ $ref: "#/x" }).type, "object");
        assert.strictEqual(SchemaDirectiveNormalizer.resolveSchemaType({}).type, "string");
    });

    it("items wins over the object signals, because a list of objects is still a list", () => {
        assert.strictEqual(
            SchemaDirectiveNormalizer.resolveSchemaType({ items: { type: "string" }, properties: {} }).type,
            "array"
        );
    });

    it("an unsupported declared type falls back to the shape and is reported when the key is known", () => {
        const { value, entries } = withLogCapture(() =>
            SchemaDirectiveNormalizer.resolveSchemaType({ type: "widget" }, "someField")
        );
        assert.strictEqual(value.type, "string");
        assert.strictEqual(value.rawType, "widget");
        assert.ok(reported(entries, "someField"), "the unsupported type was not reported");
    });

    it("the same fallback without a key name is silent, since there is nothing to name", () => {
        const { value, entries } = withLogCapture(() =>
            SchemaDirectiveNormalizer.resolveSchemaType({ type: "widget" })
        );
        assert.strictEqual(value.type, "string");
        assert.strictEqual(entries.length, 0);
    });
});

describe("SchemaDirectiveNormalizer — normalizeValueHelp", () => {
    it("a static list becomes key/text entries, with the key standing in for a missing text", () => {
        assert.deepStrictEqual(
            SchemaDirectiveNormalizer.normalizeValueHelp([{ key: "A", text: "Alpha" }, { key: "B" }]),
            [
                { key: "A", text: "Alpha" },
                { key: "B", text: "B" }
            ]
        );
    });

    it("non-string keys and texts are stringified, and a missing key becomes the empty string", () => {
        assert.deepStrictEqual(SchemaDirectiveNormalizer.normalizeValueHelp([{ key: 1, text: 2 }, { text: "only" }]), [
            { key: "1", text: "2" },
            { key: "", text: "only" }
        ]);
    });

    it("entries that are not objects are discarded", () => {
        assert.deepStrictEqual(SchemaDirectiveNormalizer.normalizeValueHelp(["A", 1, null, { key: "B" }]), [
            { key: "B", text: "B" }
        ]);
        assert.deepStrictEqual(SchemaDirectiveNormalizer.normalizeValueHelp([]), []);
    });

    it("a remote block with a url becomes a remote configuration with documented default paths", () => {
        assert.deepStrictEqual(SchemaDirectiveNormalizer.normalizeValueHelp({ url: "/api/codes" }), {
            url: "/api/codes",
            keyPath: "key",
            textPath: "text"
        });
        assert.deepStrictEqual(
            SchemaDirectiveNormalizer.normalizeValueHelp({ url: "/api/codes", keyPath: "id", textPath: "name" }),
            { url: "/api/codes", keyPath: "id", textPath: "name" }
        );
    });

    it("anything with no url and no entries is not value help at all", () => {
        for (const raw of [undefined, null, "list", 7, {}, { keyPath: "id" }, { url: 7 }]) {
            assert.strictEqual(SchemaDirectiveNormalizer.normalizeValueHelp(raw), undefined, JSON.stringify(raw));
        }
    });
});

describe("SchemaDirectiveNormalizer — normalizeDataSource", () => {
    it("a dataSource block with a url yields the documented field defaults", () => {
        assert.deepStrictEqual(SchemaDirectiveNormalizer.normalizeDataSource({ url: "/api/codes" }), {
            url: "/api/codes",
            keyField: "key",
            textField: "text",
            dataPath: undefined,
            modelName: undefined
        });
    });

    it("keyField and textField accept both the Field and the Path spelling, Field winning", () => {
        assert.deepStrictEqual(
            SchemaDirectiveNormalizer.normalizeDataSource({
                url: "/u",
                keyField: "a",
                keyPath: "b",
                textField: "c",
                textPath: "d"
            }),
            { url: "/u", keyField: "a", textField: "c", dataPath: undefined, modelName: undefined }
        );
        const pathsOnly = SchemaDirectiveNormalizer.normalizeDataSource({ url: "/u", keyPath: "b", textPath: "d" });
        assert.strictEqual(pathsOnly?.keyField, "b");
        assert.strictEqual(pathsOnly?.textField, "d");
    });

    it("dataPath and modelName are carried when declared as strings", () => {
        const source = SchemaDirectiveNormalizer.normalizeDataSource({
            url: "/u",
            dataPath: "/d/results",
            modelName: "catalog"
        });
        assert.strictEqual(source?.dataPath, "/d/results");
        assert.strictEqual(source?.modelName, "catalog");
    });

    it("a remote valueHelp block stands in when no dataSource is declared", () => {
        assert.strictEqual(
            SchemaDirectiveNormalizer.normalizeDataSource(undefined, { url: "/from-value-help" })?.url,
            "/from-value-help"
        );
        assert.strictEqual(
            SchemaDirectiveNormalizer.normalizeDataSource({ url: "/explicit" }, { url: "/from-value-help" })?.url,
            "/explicit"
        );
    });

    it("a static valueHelp array is not a data source", () => {
        assert.strictEqual(SchemaDirectiveNormalizer.normalizeDataSource(undefined, [{ key: "A" }]), undefined);
    });

    it("a block with no url is not a data source", () => {
        for (const raw of [undefined, null, {}, { keyField: "id" }, "nope", { url: 7 }]) {
            assert.strictEqual(SchemaDirectiveNormalizer.normalizeDataSource(raw), undefined, JSON.stringify(raw));
        }
    });

    it("the directive picks up both spellings of the source", () => {
        assert.strictEqual(directive({ dataSource: { url: "/a" } }).dataSource?.url, "/a");
        assert.strictEqual(directive({ valueHelp: { url: "/b" } }).dataSource?.url, "/b");
        assert.strictEqual(directive({}, { valueHelp: { url: "/c" } }).dataSource?.url, "/c");
        assert.strictEqual(directive({ valueHelp: [{ key: "A" }] }).dataSource, undefined);
        assert.deepStrictEqual(directive({ valueHelp: [{ key: "A" }] }).valueHelp, [{ key: "A", text: "A" }]);
    });
});

describe("SchemaDirectiveNormalizer — normalizeValidators", () => {
    it("a string entry is a rule name and an object entry carries its arguments", () => {
        assert.deepStrictEqual(
            SchemaDirectiveNormalizer.normalizeValidators(["email", { name: "maxLength", args: 5 }]),
            ["email", { name: "maxLength", args: 5 }]
        );
    });

    it("an object entry with no arguments carries undefined rather than inventing one", () => {
        assert.deepStrictEqual(SchemaDirectiveNormalizer.normalizeValidators([{ name: "email" }]), [
            { name: "email", args: undefined }
        ]);
    });

    it("entry arguments are deep-copied", () => {
        const args = { nested: [1] };
        const rules = SchemaDirectiveNormalizer.normalizeValidators([{ name: "x", args }]);
        const carried = (rules?.[0] as { args: unknown }).args;
        assert.deepStrictEqual(carried, args);
        assert.notStrictEqual(carried, args);
    });

    it("a malformed entry is dropped and reported, never silently kept", () => {
        const { value, entries } = withLogCapture(() =>
            SchemaDirectiveNormalizer.normalizeValidators(["email", 7, null, {}, { args: 1 }])
        );
        assert.deepStrictEqual(value, ["email"]);
        assert.ok(reported(entries, "malformed"), "the malformed entries were dropped silently");
    });

    it("a validators block that is not an array is absent, and an empty one is an empty list", () => {
        assert.strictEqual(SchemaDirectiveNormalizer.normalizeValidators(undefined), undefined);
        assert.strictEqual(SchemaDirectiveNormalizer.normalizeValidators("email"), undefined);
        assert.deepStrictEqual(SchemaDirectiveNormalizer.normalizeValidators([]), []);
    });
});

describe("SchemaDirectiveNormalizer — normalizeLayout", () => {
    it("every documented element type is accepted and copied with its own keys", () => {
        for (const type of ["Group", "Control", "HorizontalLayout", "VerticalLayout", "WizardStep"]) {
            const normalized = SchemaDirectiveNormalizer.normalizeLayout([
                { type, label: "L", scope: "#/properties/a", widget: "textArea" }
            ]);
            assert.deepStrictEqual(normalized, [
                { type, label: "L", scope: "#/properties/a", widget: "textArea", elements: undefined }
            ]);
        }
    });

    it("nested elements are normalized recursively", () => {
        const normalized = SchemaDirectiveNormalizer.normalizeLayout([
            { type: "Group", elements: [{ type: "Control", scope: "#/properties/a" }] }
        ]);
        assert.strictEqual(normalized?.[0].elements?.[0].type, "Control");
        assert.strictEqual(normalized?.[0].elements?.[0].scope, "#/properties/a");
    });

    it("an unsupported element type throws and is reported, rather than vanishing from the screen", () => {
        const { entries } = withLogCapture(() => {
            assert.throws(() => SchemaDirectiveNormalizer.normalizeLayout([{ type: "Accordion" }]), /Accordion/);
            return undefined;
        });
        assert.ok(reported(entries, "Accordion"), "the rejected layout node was not reported");
    });

    it("an element that is not an object at all throws too", () => {
        assert.throws(() => SchemaDirectiveNormalizer.normalizeLayout(["Group"]), /uiLayout element #0/);
        assert.throws(() => SchemaDirectiveNormalizer.normalizeLayout([null]), /uiLayout element #0/);
        assert.throws(() => SchemaDirectiveNormalizer.normalizeLayout([{ type: "Group" }, 7]),
            /uiLayout element #1/);
    });

    it("a layout that is not an array is absent, and an empty one is an empty list", () => {
        assert.strictEqual(SchemaDirectiveNormalizer.normalizeLayout(undefined), undefined);
        assert.strictEqual(SchemaDirectiveNormalizer.normalizeLayout({ type: "Group" }), undefined);
        assert.deepStrictEqual(SchemaDirectiveNormalizer.normalizeLayout([]), []);
    });
});

describe("SchemaDirectiveNormalizer — normalizePolicies", () => {
    it("every documented effect is accepted", () => {
        for (const effect of ["Require", "Hide", "Disable", "Invalidate", "Show", "Enable", "Validate", "Optional"]) {
            const normalized = SchemaDirectiveNormalizer.normalizePolicies([
                { effect, targets: ["a"], condition: { "===": [1, 1] }, message: "m" }
            ]);
            assert.strictEqual(normalized?.[0].effect, effect, effect);
        }
    });

    it("targets default to the empty list and the condition is deep-copied", () => {
        const condition = { "===": [{ var: "a" }, 1] };
        const normalized = SchemaDirectiveNormalizer.normalizePolicies([{ effect: "Hide", condition }]);
        assert.deepStrictEqual(normalized?.[0].targets, []);
        assert.deepStrictEqual(normalized?.[0].condition, condition);
        assert.notStrictEqual(normalized?.[0].condition["==="], condition["==="]);
        assert.strictEqual(normalized?.[0].message, undefined);
    });

    it("a non-string target is discarded", () => {
        const normalized = SchemaDirectiveNormalizer.normalizePolicies([
            { effect: "Hide", targets: ["a", 7, null, "b"] }
        ]);
        assert.deepStrictEqual(normalized?.[0].targets, ["a", "b"]);
    });

    it("an absent condition becomes an empty condition rather than undefined", () => {
        const normalized = SchemaDirectiveNormalizer.normalizePolicies([{ effect: "Show" }]);
        assert.deepStrictEqual(normalized?.[0].condition, {});
    });

    it("an unsupported effect throws and is reported", () => {
        const { entries } = withLogCapture(() => {
            assert.throws(() => SchemaDirectiveNormalizer.normalizePolicies([{ effect: "Explode" }]), /Explode/);
            return undefined;
        });
        assert.ok(reported(entries, "Explode"));
    });

    it("a policy entry that is not an object throws, naming its index", () => {
        assert.throws(() => SchemaDirectiveNormalizer.normalizePolicies([{ effect: "Hide" }, "Show"]),
            /uiPolicies\[1\]/);
    });

    it("a policies block that is not an array is absent, and an empty one is an empty list", () => {
        assert.strictEqual(SchemaDirectiveNormalizer.normalizePolicies(undefined), undefined);
        assert.strictEqual(SchemaDirectiveNormalizer.normalizePolicies({ effect: "Hide" }), undefined);
        assert.deepStrictEqual(SchemaDirectiveNormalizer.normalizePolicies([]), []);
    });
});
