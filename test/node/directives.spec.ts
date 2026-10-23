/**
 * @file directives.spec.ts
 * @description Absolute properties for `SchemaDirectiveNormalizer` and `OpenApiUIMapper`.
 *
 * The other spec files are mostly *differential*: they compare two MetaUI code paths, or MetaUI
 * against a reference evaluator for validation keywords. Differential properties are blind to a
 * change that moves both sides the same way — mutate `formatToWidget` and the OpenAPI 2.0 and 3.0
 * parses still agree with each other. The properties here therefore state the mapping tables
 * independently, in a second implementation written from the documented rules, so a change to
 * either side is a failure.
 */

import * as assert from "assert";
import { fc, reported, withLogCapture } from "./fc-config";
import { JsonRecord, isPlainObject } from "./arbitraries";
import { SchemaDirectiveNormalizer } from "../../src/nz/co/siliconst/ui5/metaui/core/SchemaDirectiveNormalizer";
import { DataInferenceBuilder } from "../../src/nz/co/siliconst/ui5/metaui/core/DataInferenceBuilder";
import { OpenApiUIMapper } from "../../src/nz/co/siliconst/ui5/metaui/openapi/OpenApiUIMapper";

/** The documented `format` -> widget / `ui.format` mapping, restated independently. */
const FORMAT_MAPPING_TABLE: Readonly<Record<string, { widget?: string; uiFormat?: string }>> = {
    date: { widget: "date", uiFormat: "date" },
    "date-time": { widget: "datetime", uiFormat: "date-time" },
    datetime: { widget: "datetime", uiFormat: "date-time" },
    time: { widget: "time", uiFormat: "time" },
    email: { widget: "email", uiFormat: "email" },
    password: { widget: "password", uiFormat: "password" },
    uri: { widget: "link", uiFormat: "url" },
    url: { widget: "link", uiFormat: "url" },
    iban: { uiFormat: "iban" },
    binary: { widget: "fileUploader", uiFormat: "binary" },
    byte: { widget: "fileUploader", uiFormat: "byte" }
};

/**
 * Own-property lookup into the table above. A plain `table[key]` would resolve `"valueOf"` and
 * `"constructor"` through `Object.prototype` — the same trap this suite reports as finding F9 in
 * `OpenApiTypeMapper`, and one a test is just as able to fall into.
 *
 * @param format The raw format string.
 * @returns {{ widget?: string; uiFormat?: string }} The expected mapping.
 */
function expectedFormatMapping(format: string): { widget?: string; uiFormat?: string } {
    return Object.prototype.hasOwnProperty.call(FORMAT_MAPPING_TABLE, format)
        ? FORMAT_MAPPING_TABLE[format]
        : { uiFormat: format };
}

const formatArb: fc.Arbitrary<string> = fc.oneof(
    fc.constantFrom(...Object.keys(FORMAT_MAPPING_TABLE)),
    fc.constantFrom("uuid", "ipv4", "hostname", "int64", "decimal", "custom-format"),
    fc.string({ maxLength: 8 })
);

describe("SchemaDirectiveNormalizer — format mapping", () => {
    it("maps every known format to its documented widget and ui.format", () => {
        fc.assert(
            fc.property(formatArb, (format) => {
                const actual = SchemaDirectiveNormalizer.formatToWidget(format);
                if (!format) {
                    assert.deepStrictEqual(actual, {});
                    return;
                }
                const expected = expectedFormatMapping(format);
                assert.strictEqual(actual.widget, expected.widget, `widget for '${format}'`);
                assert.strictEqual(actual.uiFormat, expected.uiFormat, `ui.format for '${format}'`);
            })
        );
    });

    it("an absent format maps to nothing at all", () => {
        assert.deepStrictEqual(SchemaDirectiveNormalizer.formatToWidget(undefined), {});
        assert.deepStrictEqual(SchemaDirectiveNormalizer.formatToWidget(""), {});
    });
});

describe("DataInferenceBuilder.generateLabel", () => {
    /** Independent restatement: split camelCase and snake_case, Title Case each word. */
    function expectedLabel(name: string): string {
        return name
            .replace(/([A-Z])/g, " $1")
            .replace(/_/g, " ")
            .split(" ")
            .filter((word) => word.length > 0)
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(" ")
            .trim();
    }

    it("produces Title Case from camelCase and snake_case technical names", () => {
        fc.assert(
            fc.property(
                fc.oneof(
                    fc.constantFrom(
                        "firstName",
                        "first_name",
                        "ID",
                        "customerOrderID",
                        "a",
                        "",
                        "__",
                        "already Spaced",
                        "ümlaut_field"
                    ),
                    fc.string({ maxLength: 14 })
                ),
                (name) => {
                    assert.strictEqual(DataInferenceBuilder.generateLabel(name), expectedLabel(name));
                }
            )
        );
    });

    it("an empty technical name produces an empty label", () => {
        assert.strictEqual(DataInferenceBuilder.generateLabel(""), "");
    });
});

describe("SchemaDirectiveNormalizer — enum normalization", () => {
    it("keeps primitive members, stringifies everything else, and treats [] as absent", () => {
        fc.assert(
            fc.property(
                fc.array(
                    fc.oneof(
                        fc.string({ maxLength: 4 }),
                        fc.integer({ min: -20, max: 20 }),
                        fc.boolean(),
                        fc.constant(null),
                        fc.constant(undefined),
                        fc.constantFrom<unknown>({ a: 1 }, [1, 2])
                    ),
                    { maxLength: 6 }
                ),
                (raw) => {
                    const actual = SchemaDirectiveNormalizer.normalizeEnum(raw);
                    const expected = raw
                        .filter((item) => item !== undefined)
                        .map((item) =>
                            typeof item === "string" ||
                            typeof item === "number" ||
                            typeof item === "boolean" ||
                            item === null
                                ? item
                                : String(item)
                        );
                    assert.deepStrictEqual(actual, expected.length > 0 ? expected : undefined);
                }
            )
        );
    });

    it("a non-array enum is absent", () => {
        for (const raw of [undefined, null, "a", 1, {}]) {
            assert.strictEqual(SchemaDirectiveNormalizer.normalizeEnum(raw), undefined);
        }
    });
});

describe("SchemaDirectiveNormalizer — valueHelp normalization", () => {
    it("a static array becomes {key, text} pairs, with key used as the text fallback", () => {
        fc.assert(
            fc.property(
                fc.array(
                    fc.record(
                        { key: fc.oneof(fc.string({ maxLength: 4 }), fc.integer()), text: fc.string({ maxLength: 4 }) },
                        { requiredKeys: [] }
                    ),
                    { maxLength: 5 }
                ),
                (entries) => {
                    const actual = SchemaDirectiveNormalizer.normalizeValueHelp(entries);
                    assert.ok(Array.isArray(actual));
                    assert.strictEqual(actual.length, entries.length);
                    entries.forEach((entry, index) => {
                        const pair = (actual as { key: string; text: string }[])[index];
                        assert.strictEqual(pair.key, String(entry.key ?? ""));
                        assert.strictEqual(pair.text, String(entry.text ?? entry.key ?? ""));
                    });
                }
            )
        );
    });

    it("a remote block needs a url and defaults keyPath/textPath", () => {
        fc.assert(
            fc.property(
                fc.record(
                    {
                        url: fc.webUrl(),
                        keyPath: fc.string({ minLength: 1, maxLength: 5 }),
                        textPath: fc.string({ minLength: 1, maxLength: 5 })
                    },
                    { requiredKeys: ["url"] }
                ),
                (raw) => {
                    const actual = SchemaDirectiveNormalizer.normalizeValueHelp(raw) as {
                        url: string;
                        keyPath: string;
                        textPath: string;
                    };
                    assert.strictEqual(actual.url, raw.url);
                    assert.strictEqual(actual.keyPath, raw.keyPath || "key");
                    assert.strictEqual(actual.textPath, raw.textPath || "text");
                }
            )
        );
    });

    it("a block without a url is absent", () => {
        assert.strictEqual(SchemaDirectiveNormalizer.normalizeValueHelp({ keyPath: "k" }), undefined);
        assert.strictEqual(SchemaDirectiveNormalizer.normalizeValueHelp("nonsense"), undefined);
    });
});

describe("SchemaDirectiveNormalizer — discriminator normalization", () => {
    it("accepts the 2.0 string form and the 3.0 object form, and rejects everything else", () => {
        fc.assert(
            fc.property(
                fc.oneof(
                    fc.string({ maxLength: 6 }),
                    fc.record(
                        {
                            propertyName: fc.string({ maxLength: 6 }),
                            mapping: fc.dictionary(fc.constantFrom("a", "b"), fc.oneof(fc.string(), fc.integer()), {
                                maxKeys: 2
                            })
                        },
                        { requiredKeys: [] }
                    ),
                    fc.constantFrom<unknown>(null, undefined, 42, [], true)
                ),
                (raw) => {
                    const actual = SchemaDirectiveNormalizer.normalizeDiscriminator(raw);
                    if (typeof raw === "string") {
                        assert.deepStrictEqual(actual, raw ? { propertyName: raw } : undefined);
                        return;
                    }
                    if (!isPlainObject(raw) || typeof raw.propertyName !== "string" || !raw.propertyName) {
                        assert.strictEqual(actual, undefined);
                        return;
                    }
                    assert.strictEqual(actual?.propertyName, raw.propertyName);
                    if (isPlainObject(raw.mapping)) {
                        const expected: Record<string, string> = {};
                        for (const [key, target] of Object.entries(raw.mapping)) {
                            if (typeof target === "string") expected[key] = target;
                        }
                        assert.deepStrictEqual(actual?.mapping, expected);
                    } else {
                        assert.strictEqual(actual?.mapping, undefined);
                    }
                }
            )
        );
    });
});

describe("SchemaDirectiveNormalizer — layout and policy validation", () => {
    const LAYOUT_TYPES = ["Group", "Control", "HorizontalLayout", "VerticalLayout", "WizardStep"];
    const POLICY_EFFECTS = ["Require", "Hide", "Disable", "Invalidate", "Show", "Enable", "Validate", "Optional"];

    it("accepts exactly the five layout element types and refuses the rest loudly", () => {
        fc.assert(
            fc.property(
                fc.oneof(fc.constantFrom(...LAYOUT_TYPES), fc.constantFrom("Form", "group", "", "Panel"), fc.string()),
                (type) => {
                    const raw = [{ type, label: "L", scope: "#/properties/a" }];
                    if (LAYOUT_TYPES.includes(type)) {
                        const actual = SchemaDirectiveNormalizer.normalizeLayout(raw);
                        assert.strictEqual(actual?.[0].type, type);
                        assert.strictEqual(actual?.[0].label, "L");
                        return;
                    }
                    const { entries } = withLogCapture(() => {
                        assert.throws(() => SchemaDirectiveNormalizer.normalizeLayout(raw), /unsupported type/);
                        return undefined;
                    });
                    assert.ok(reported(entries, "unsupported type"), "the rejected layout node was not reported");
                }
            ),
            { numRuns: 400 }
        );
    });

    it("a layout tree is deep-copied, so later mutation of the input cannot reach the schema", () => {
        const raw: JsonRecord[] = [{ type: "Group", label: "One", elements: [{ type: "Control", scope: "#/a" }] }];
        const normalized = SchemaDirectiveNormalizer.normalizeLayout(raw);
        (raw[0] as { label: string }).label = "Changed";
        ((raw[0].elements as JsonRecord[])[0] as { scope: string }).scope = "#/b";
        assert.strictEqual(normalized?.[0].label, "One");
        assert.strictEqual(normalized?.[0].elements?.[0].scope, "#/a");
    });

    it("accepts exactly the eight policy effects and refuses the rest loudly", () => {
        fc.assert(
            fc.property(
                fc.oneof(fc.constantFrom(...POLICY_EFFECTS), fc.constantFrom("require", "Delete", ""), fc.string()),
                (effect) => {
                    const raw = [{ effect, targets: ["a", 1, "b"], condition: { IsNull: ["x"] }, message: "m" }];
                    if (POLICY_EFFECTS.includes(effect)) {
                        const actual = SchemaDirectiveNormalizer.normalizePolicies(raw);
                        assert.strictEqual(actual?.[0].effect, effect);
                        assert.deepStrictEqual(actual?.[0].targets, ["a", "b"]);
                        assert.deepStrictEqual(actual?.[0].condition, { IsNull: ["x"] });
                        assert.strictEqual(actual?.[0].message, "m");
                        return;
                    }
                    const { entries } = withLogCapture(() => {
                        assert.throws(() => SchemaDirectiveNormalizer.normalizePolicies(raw), /unsupported effect/);
                        return undefined;
                    });
                    assert.ok(reported(entries, "unsupported effect"), "the rejected policy was not reported");
                }
            ),
            { numRuns: 400 }
        );
    });

    it("a non-array layout or policy block is absent rather than an error", () => {
        for (const raw of [undefined, null, {}, "x", 7]) {
            assert.strictEqual(SchemaDirectiveNormalizer.normalizeLayout(raw), undefined);
            assert.strictEqual(SchemaDirectiveNormalizer.normalizePolicies(raw), undefined);
        }
    });
});

describe("SchemaDirectiveNormalizer — type resolution", () => {
    it("resolves the declared type, drops the null member, and falls back by shape", () => {
        fc.assert(
            fc.property(
                fc.oneof(
                    fc.constantFrom<JsonRecord>(
                        { type: "string" },
                        { type: "integer" },
                        { type: "number" },
                        { type: "boolean" },
                        { type: "array" },
                        { type: "object" },
                        { type: "date" },
                        { type: "file" },
                        { type: "quantum" },
                        { type: ["string", "null"] },
                        { type: ["null", "integer"] },
                        { items: { type: "string" } },
                        { properties: {} },
                        { additionalProperties: true },
                        { oneOf: [] },
                        { anyOf: [] },
                        { $ref: "#/definitions/X" },
                        {}
                    ),
                    fc.constant<JsonRecord>({ type: 42 })
                ),
                (prop) => {
                    const { type, hasNullType } = SchemaDirectiveNormalizer.resolveSchemaType(prop, "k");
                    assert.strictEqual(hasNullType, Array.isArray(prop.type) && prop.type.includes("null"));

                    const declared = Array.isArray(prop.type)
                        ? prop.type.find((entry) => entry !== "null")
                        : prop.type;
                    const mapped = declared === "file" ? "string" : declared;
                    const known = ["object", "array", "string", "number", "integer", "boolean", "date"];
                    if (typeof mapped === "string" && known.includes(mapped)) {
                        assert.strictEqual(type, mapped);
                        return;
                    }
                    const expectedFallback = isPlainObject(prop.items)
                        ? "array"
                        : isPlainObject(prop.properties) ||
                            prop.additionalProperties !== undefined ||
                            Array.isArray(prop.oneOf) ||
                            Array.isArray(prop.anyOf) ||
                            typeof prop.$ref === "string"
                          ? "object"
                          : "string";
                    assert.strictEqual(type, expectedFallback);
                }
            )
        );
    });

    it("an unsupported type is reported, not silently coerced", () => {
        const { entries } = withLogCapture(() =>
            SchemaDirectiveNormalizer.resolveSchemaType({ type: "quantum" }, "field")
        );
        assert.ok(reported(entries, "Unsupported type"), "the unsupported type was not reported");
    });
});

describe("SchemaDirectiveNormalizer — widget inference precedence", () => {
    it("an explicit ui.widget always wins", () => {
        fc.assert(
            fc.property(
                fc.constantFrom("slider", "rating", "codeEditor"),
                fc.constantFrom<JsonRecord>(
                    { oneOf: [] },
                    { $ref: "#/definitions/X" },
                    { additionalProperties: { type: "string" } },
                    { enum: ["a"] },
                    { format: "email" },
                    {}
                ),
                (widget, prop) => {
                    const ui = SchemaDirectiveNormalizer.normalizeUI({ widget }, prop, "key", "string", true);
                    assert.strictEqual(ui.widget, widget);
                }
            )
        );
    });

    it("without an explicit widget, the documented precedence applies", () => {
        const cases: ReadonlyArray<readonly [JsonRecord, string, boolean, string | undefined]> = [
            [{ oneOf: [] }, "object", false, "polymorphic"],
            [{ anyOf: [] }, "object", false, "polymorphic"],
            [{ discriminator: "kind" }, "object", false, "polymorphic"],
            [{ $ref: "#/definitions/X" }, "object", false, "reference"],
            [{ $ref: "#/definitions/X", properties: {} }, "object", false, undefined],
            [{ additionalProperties: { type: "string" } }, "object", false, "dictionaryMap"],
            [{ type: "string" }, "string", true, "select"],
            [{ type: "array" }, "array", true, "multiSelect"],
            [{ format: "email" }, "string", false, "email"],
            [{ format: "uuid" }, "string", false, undefined],
            [{ type: "string" }, "string", false, undefined]
        ];
        for (const [prop, type, hasChoices, expected] of cases) {
            const ui = SchemaDirectiveNormalizer.normalizeUI(
                {},
                prop,
                "key",
                type as "string",
                hasChoices
            );
            assert.strictEqual(ui.widget, expected, `widget for ${JSON.stringify(prop)}`);
        }
    });

    it("label falls back from ui.label to title to a generated label", () => {
        fc.assert(
            fc.property(
                fc.option(fc.constantFrom("Explicit"), { nil: undefined }),
                fc.option(fc.constantFrom("From Title"), { nil: undefined }),
                fc.constantFrom("customerName", "id", ""),
                (label, title, keyName) => {
                    const ui = SchemaDirectiveNormalizer.normalizeUI(
                        label === undefined ? {} : { label },
                        title === undefined ? {} : { title },
                        keyName,
                        "string",
                        false
                    );
                    const expected =
                        label ?? title ?? (keyName ? DataInferenceBuilder.generateLabel(keyName) : undefined);
                    assert.strictEqual(ui.label, expected);
                }
            )
        );
    });

    it("readOnly falls back from ui.readOnly to the property's readOnly to false", () => {
        fc.assert(
            fc.property(
                fc.option(fc.boolean(), { nil: undefined }),
                fc.option(fc.boolean(), { nil: undefined }),
                (uiReadOnly, propReadOnly) => {
                    const ui = SchemaDirectiveNormalizer.normalizeUI(
                        uiReadOnly === undefined ? {} : { readOnly: uiReadOnly },
                        propReadOnly === undefined ? {} : { readOnly: propReadOnly },
                        "key",
                        "string",
                        false
                    );
                    assert.strictEqual(ui.readOnly, uiReadOnly ?? propReadOnly ?? false);
                }
            )
        );
    });
});

describe("OpenApiUIMapper", () => {
    it("builds a label, a readOnly flag and a format widget from the raw property", () => {
        fc.assert(
            fc.property(
                fc.record(
                    {
                        title: fc.constantFrom("A Title"),
                        readOnly: fc.boolean(),
                        type: fc.constantFrom("string", "file"),
                        format: formatArb
                    },
                    { requiredKeys: [] }
                ),
                fc.constantFrom("customerName", "id"),
                (rawProp, keyName) => {
                    const ui = OpenApiUIMapper.build(rawProp, keyName);
                    assert.strictEqual(ui.label, rawProp.title ?? DataInferenceBuilder.generateLabel(keyName));
                    assert.strictEqual(ui.readOnly, rawProp.readOnly === true ? true : undefined);

                    const mapping = rawProp.format ? expectedFormatMapping(rawProp.format) : {};
                    const expectedWidget =
                        mapping.widget ?? (rawProp.type === "file" ? "fileUploader" : undefined);
                    assert.strictEqual(ui.widget, expectedWidget, `widget for ${JSON.stringify(rawProp)}`);
                    assert.strictEqual(ui.format, mapping.uiFormat);
                }
            )
        );
    });

    it("an inline ui block overrides the derived directive but never blanks the label", () => {
        const ui = OpenApiUIMapper.build({ title: "T", ui: { widget: "slider", label: "" } }, "key");
        assert.strictEqual(ui.widget, "slider");
        assert.strictEqual(ui.label, "T");
    });

    it("a non-record property still yields a generated label", () => {
        assert.strictEqual(OpenApiUIMapper.build(null, "orderId").label, "Order Id");
        assert.strictEqual(OpenApiUIMapper.build("nonsense", "orderId").label, "Order Id");
    });
});
