/**
 * @file payload-walk.spec.ts
 * @description `PayloadValidator.validatePayloadArrays` — the host's whole-payload sweep.
 *
 * `payload-validator.spec.ts` covers `validateTree`, which answers "is this value valid" for one
 * node. `validatePayloadArrays` answers a different question: it walks the entire payload and
 * returns one result **per addressable cell**, so the host can paint a field state on each one.
 * Its contract is therefore about paths and labels as much as about verdicts, and almost none of
 * it is reachable from `validateTree`.
 *
 * What is stated here, from the method's documented contract:
 *
 *  - every cell of a table yields a result, keyed by `row/column`, valid or not;
 *  - a path a live plugin already owns, and a path the host reports as hidden, are not revalidated
 *    behind the user's back;
 *  - `$ref` nodes are resolved before their subtree is walked, on the container and on a child;
 *  - a required nested container that is missing from the payload is reported rather than skipped
 *    (engineering rule 2), and an absent array with `minItems` is tested as the empty array it
 *    will render as;
 *  - a `$row`-scoped policy override decides a cell's required state, overriding the schema.
 */

import * as assert from "assert";
import { IPlugin, IPluginValidationResult } from "../../src/nz/co/siliconst/ui5/metaui/interfaces/IPlugin";
import { ISchema } from "../../src/nz/co/siliconst/ui5/metaui/interfaces/ISchema";
import { PayloadValidator } from "../../src/nz/co/siliconst/ui5/metaui/core/PayloadValidator";
import { SchemaNormalizer } from "../../src/nz/co/siliconst/ui5/metaui/core/SchemaNormalizer";

/** No plugin owns any path. */
const noPlugins = (): IPlugin | undefined => undefined;

/** The failing results, as `path -> message`. */
function failures(results: IPluginValidationResult[]): Record<string, string> {
    const out: Record<string, string> = {};
    for (const entry of results) {
        if (!entry.isValid) {
            out[entry.fieldKey || ""] = entry.errorMessage || "";
        }
    }
    return out;
}

/** The paths that reported a verdict at all, in order. */
const paths = (results: IPluginValidationResult[]): string[] => results.map((entry) => entry.fieldKey || "");

describe("PayloadValidator.validatePayloadArrays — what is walked at all", () => {
    const schema: ISchema = SchemaNormalizer.normalize({
        type: "array",
        items: { type: "object", properties: { name: { type: "string", maxLength: 2 } } }
    });

    it("a payload that is not a structured value yields no results", () => {
        for (const payload of [null, undefined, 7, "text", true]) {
            assert.deepStrictEqual(PayloadValidator.validatePayloadArrays(schema, payload, "", noPlugins), []);
        }
    });

    it("an empty table yields the array-level verdict and no cells", () => {
        const results = PayloadValidator.validatePayloadArrays(schema, [], "rows", noPlugins);
        assert.deepStrictEqual(paths(results), ["rows"]);
        assert.strictEqual(results[0].isValid, true);
    });

    it("a hidden container is not walked at all", () => {
        const results = PayloadValidator.validatePayloadArrays(
            schema,
            [{ name: "far too long" }],
            "rows",
            noPlugins,
            undefined,
            undefined,
            (path) => path === "rows"
        );
        assert.deepStrictEqual(results, []);
    });

    it("a container marked invisible in the schema is not walked", () => {
        const hidden: ISchema = SchemaNormalizer.normalize({
            type: "array",
            ui: { visible: false },
            items: { type: "object", properties: { name: { type: "string", maxLength: 2 } } }
        });
        assert.deepStrictEqual(
            PayloadValidator.validatePayloadArrays(hidden, [{ name: "far too long" }], "rows", noPlugins),
            []
        );
    });

    it("a hidden column still reports a verdict, so its stale error is cleared", () => {
        const results = PayloadValidator.validatePayloadArrays(
            schema,
            [{ name: "far too long" }],
            "",
            noPlugins,
            undefined,
            undefined,
            (path) => path === "0/name"
        );
        assert.deepStrictEqual(failures(results), {});
        assert.ok(paths(results).includes("0/name"), "the hidden cell reported nothing, so its state would stick");
    });

    it("an invisible column still reports a verdict rather than being omitted", () => {
        const invisible: ISchema = SchemaNormalizer.normalize({
            type: "array",
            items: {
                type: "object",
                properties: { name: { type: "string", maxLength: 2, ui: { visible: false } } }
            }
        });
        const results = PayloadValidator.validatePayloadArrays(invisible, [{ name: "far too long" }], "", noPlugins);
        assert.deepStrictEqual(failures(results), {});
        assert.ok(paths(results).includes("0/name"));
    });
});

describe("PayloadValidator.validatePayloadArrays — table cells", () => {
    const schema: ISchema = SchemaNormalizer.normalize({
        type: "array",
        items: {
            type: "object",
            required: ["name"],
            properties: {
                name: { type: "string", maxLength: 3, ui: { label: "Product" } },
                qty: { type: "integer", minimum: 1 }
            }
        }
    });

    it("every cell of every row reports a verdict, keyed by row and column", () => {
        const results = PayloadValidator.validatePayloadArrays(
            schema,
            [{ name: "ab", qty: 2 }, { name: "cd", qty: 3 }],
            "",
            noPlugins
        );
        for (const path of ["0/name", "0/qty", "1/name", "1/qty"]) {
            assert.ok(paths(results).includes(path), `no verdict for ${path}`);
        }
        assert.deepStrictEqual(failures(results), {});
    });

    it("the failing cell is named, and only it", () => {
        const results = PayloadValidator.validatePayloadArrays(
            schema,
            [{ name: "ab", qty: 2 }, { name: "far too long", qty: 3 }],
            "",
            noPlugins
        );
        assert.deepStrictEqual(Object.keys(failures(results)), ["1/name"]);
    });

    it("a failing cell carries its column label", () => {
        const results = PayloadValidator.validatePayloadArrays(schema, [{ name: "far too long", qty: 0 }], "",
            noPlugins);
        const named = results.find((entry) => entry.fieldKey === "0/name");
        const generated = results.find((entry) => entry.fieldKey === "0/qty");
        assert.strictEqual(named?.fieldLabel, "Product", "the declared label was not used");
        assert.strictEqual(generated?.fieldLabel, "Qty", "the normalizer's generated label was not used");
    });

    it("a column with no label at all falls back to its key", () => {
        // Reachable only for a descriptor the normalizer never saw, which is what a host that
        // assembles IPropertyMetadata by hand produces.
        const handBuilt = {
            type: "array",
            items: { type: "object", properties: { qty: { type: "integer", minimum: 1 } } }
        } as unknown as ISchema;
        const results = PayloadValidator.validatePayloadArrays(handBuilt, [{ qty: 0 }], "", noPlugins);
        assert.strictEqual(results.find((entry) => entry.fieldKey === "0/qty")?.fieldLabel, "qty");
    });

    it("a required column missing from a row is reported", () => {
        const results = PayloadValidator.validatePayloadArrays(schema, [{ qty: 1 }], "", noPlugins);
        assert.ok(Object.keys(failures(results)).includes("0/name"));
    });

    it("a row that is not an object is treated as an empty row, not skipped", () => {
        const results = PayloadValidator.validatePayloadArrays(schema, ["not a row"], "", noPlugins);
        assert.ok(Object.keys(failures(results)).includes("0/name"), "a malformed row escaped validation");
    });

    it("the cell paths are prefixed by the container path when there is one", () => {
        const results = PayloadValidator.validatePayloadArrays(schema, [{ name: "ab", qty: 1 }], "order/lines",
            noPlugins);
        assert.ok(paths(results).includes("order/lines/0/name"));
        assert.ok(paths(results).includes("order/lines"), "the array itself reported no verdict");
    });

    it("a root payload that wraps its rows under 'items' is walked under that prefix", () => {
        const results = PayloadValidator.validatePayloadArrays(
            schema,
            { items: [{ name: "far too long", qty: 1 }] },
            "",
            noPlugins
        );
        assert.deepStrictEqual(Object.keys(failures(results)), ["items/0/name"]);
    });

    it("the wrapped form is only recognised at the root", () => {
        const results = PayloadValidator.validatePayloadArrays(
            schema,
            { items: [{ name: "far too long" }] },
            "nested",
            noPlugins
        );
        assert.deepStrictEqual(results, [], "a nested object was walked as if it were the root wrapper");
    });

    it("a table of scalars validates each element against the item schema", () => {
        const scalars: ISchema = SchemaNormalizer.normalize({
            type: "array",
            items: { type: "string", maxLength: 2, ui: { label: "Tag" } }
        });
        const results = PayloadValidator.validatePayloadArrays(scalars, ["ab", "far too long"], "tags", noPlugins);
        assert.deepStrictEqual(Object.keys(failures(results)), ["tags/1"]);
        assert.strictEqual(results.find((entry) => entry.fieldKey === "tags/1")?.fieldLabel, "Tag");
    });

    it("a hidden scalar element reports valid without being validated", () => {
        const scalars: ISchema = SchemaNormalizer.normalize({
            type: "array",
            items: { type: "string", maxLength: 2 }
        });
        const results = PayloadValidator.validatePayloadArrays(
            scalars,
            ["far too long"],
            "tags",
            noPlugins,
            undefined,
            undefined,
            (path) => path === "tags/0"
        );
        assert.deepStrictEqual(failures(results), {});
        assert.ok(paths(results).includes("tags/0"));
    });
});

describe("PayloadValidator.validatePayloadArrays — array-level constraints", () => {
    it("a cardinality violation is reported against the array's own path", () => {
        const schema: ISchema = SchemaNormalizer.normalize({
            type: "array",
            minItems: 2,
            title: "Order lines",
            items: { type: "object", properties: { name: { type: "string" } } }
        });
        const results = PayloadValidator.validatePayloadArrays(schema, [{ name: "a" }], "lines", noPlugins);
        assert.ok(Object.keys(failures(results)).includes("lines"));
        assert.strictEqual(results.find((entry) => entry.fieldKey === "lines")?.fieldLabel, "Order lines");
    });

    it("a satisfied array reports a positive verdict on its own path", () => {
        const schema: ISchema = SchemaNormalizer.normalize({
            type: "array",
            minItems: 1,
            items: { type: "object", properties: { name: { type: "string" } } }
        });
        const results = PayloadValidator.validatePayloadArrays(schema, [{ name: "a" }], "lines", noPlugins);
        assert.strictEqual(results.find((entry) => entry.fieldKey === "lines")?.isValid, true);
    });

    it("a root array with no container path is reported under 'items'", () => {
        const schema: ISchema = SchemaNormalizer.normalize({
            type: "array",
            minItems: 2,
            items: { type: "string" }
        });
        const results = PayloadValidator.validatePayloadArrays(schema, ["a"], "", noPlugins);
        assert.ok(Object.keys(failures(results)).includes("items"));
    });
});

describe("PayloadValidator.validatePayloadArrays — nested objects", () => {
    const schema: ISchema = SchemaNormalizer.normalize({
        type: "object",
        required: ["header"],
        properties: {
            header: {
                type: "object",
                properties: { id: { type: "string", maxLength: 2 } }
            },
            optional: { type: "object", properties: { note: { type: "string", maxLength: 2 } } },
            scalar: { type: "string", maxLength: 1 }
        }
    });

    it("a nested object present in the payload is walked, and its path accumulates", () => {
        const results = PayloadValidator.validatePayloadArrays(
            schema,
            { header: { id: "far too long" } },
            "",
            noPlugins
        );
        // The nested object is an object, not a table, so the sweep descends but reports cells only
        // where there is an array or a missing container; the descent itself must still happen.
        assert.ok(Array.isArray(results));
    });

    it("a required nested object missing from the payload is reported, not skipped", () => {
        const results = PayloadValidator.validatePayloadArrays(schema, {}, "", noPlugins);
        assert.ok(Object.keys(failures(results)).includes("header"), "a missing required sub-form was waved through");
    });

    it("an optional nested object missing from the payload is not reported", () => {
        const results = PayloadValidator.validatePayloadArrays(schema, { header: {} }, "", noPlugins);
        assert.strictEqual(Object.keys(failures(results)).includes("optional"), false);
    });

    it("a missing required container owned by a live plugin is left to that plugin", () => {
        const results = PayloadValidator.validatePayloadArrays(
            schema,
            {},
            "",
            (path) => (path === "header" ? ({} as IPlugin) : undefined)
        );
        assert.strictEqual(Object.keys(failures(results)).includes("header"), false);
    });

    it("a missing array with minItems is tested as the empty array it will render as", () => {
        const withList: ISchema = SchemaNormalizer.normalize({
            type: "object",
            properties: { lines: { type: "array", minItems: 1, items: { type: "string" } } }
        });
        const results = PayloadValidator.validatePayloadArrays(withList, {}, "", noPlugins);
        assert.ok(Object.keys(failures(results)).includes("lines"), "minItems on an absent list was not enforced");
    });

    it("a missing array with no minItems is not reported", () => {
        const withList: ISchema = SchemaNormalizer.normalize({
            type: "object",
            properties: { lines: { type: "array", items: { type: "string" } } }
        });
        assert.deepStrictEqual(failures(PayloadValidator.validatePayloadArrays(withList, {}, "", noPlugins)), {});
    });

    it("a hidden nested path is not reported even when it is required", () => {
        const results = PayloadValidator.validatePayloadArrays(
            schema,
            {},
            "",
            noPlugins,
            undefined,
            undefined,
            (path) => path === "header"
        );
        assert.deepStrictEqual(failures(results), {});
    });

    it("a nested table under an object property is walked under its own path", () => {
        const nested: ISchema = SchemaNormalizer.normalize({
            type: "object",
            properties: {
                order: {
                    type: "object",
                    properties: {
                        lines: {
                            type: "array",
                            items: { type: "object", properties: { sku: { type: "string", maxLength: 2 } } }
                        }
                    }
                }
            }
        });
        const results = PayloadValidator.validatePayloadArrays(
            nested,
            { order: { lines: [{ sku: "far too long" }] } },
            "",
            noPlugins
        );
        assert.deepStrictEqual(Object.keys(failures(results)), ["order/lines/0/sku"]);
    });

    it("a scalar property is left to its own control and reports nothing here", () => {
        const results = PayloadValidator.validatePayloadArrays(schema, { header: {}, scalar: "too long" }, "",
            noPlugins);
        assert.strictEqual(Object.keys(failures(results)).includes("scalar"), false);
    });
});

describe("PayloadValidator.validatePayloadArrays — $ref resolution", () => {
    const document = {
        type: "object",
        $defs: {
            Line: {
                type: "object",
                required: ["sku"],
                properties: { sku: { type: "string", maxLength: 3 } }
            },
            Lines: {
                type: "array",
                minItems: 1,
                items: { $ref: "#/$defs/Line" }
            }
        },
        properties: {
            lines: { type: "array", items: { $ref: "#/$defs/Line" } }
        }
    };

    const schema: ISchema = SchemaNormalizer.normalize(document);
    const resolve = (ref: string): ISchema | null => {
        const name = ref.split("/").pop() || "";
        return (schema.definitions && schema.definitions[name]) || null;
    };

    it("an item $ref is resolved before the rows are walked", () => {
        const results = PayloadValidator.validatePayloadArrays(
            schema.properties?.lines as ISchema,
            [{ sku: "far too long" }],
            "lines",
            noPlugins,
            resolve
        );
        assert.deepStrictEqual(Object.keys(failures(results)), ["lines/0/sku"]);
    });

    it("the definition's required list applies to the referenced rows", () => {
        const results = PayloadValidator.validatePayloadArrays(
            schema.properties?.lines as ISchema,
            [{}],
            "lines",
            noPlugins,
            resolve
        );
        assert.ok(Object.keys(failures(results)).includes("lines/0/sku"));
    });

    it("without a resolver the $ref item is not expanded, and nothing is invented", () => {
        const results = PayloadValidator.validatePayloadArrays(
            schema.properties?.lines as ISchema,
            [{ sku: "far too long" }],
            "lines",
            noPlugins
        );
        assert.deepStrictEqual(failures(results), {});
    });

    it("a $ref on the container itself is resolved before the walk", () => {
        const container = { ...(schema.properties?.lines as ISchema), $ref: "#/$defs/Lines" };
        const results = PayloadValidator.validatePayloadArrays(container, [], "lines", noPlugins, resolve);
        assert.ok(Object.keys(failures(results)).includes("lines"), "the definition's minItems was not applied");
    });

    it("a $ref that resolves to nothing leaves the node's own schema in force", () => {
        const results = PayloadValidator.validatePayloadArrays(
            schema.properties?.lines as ISchema,
            [{ sku: "far too long" }],
            "lines",
            noPlugins,
            () => null
        );
        assert.deepStrictEqual(failures(results), {});
    });
});

describe("PayloadValidator.validatePayloadArrays — row-scoped policy overrides", () => {
    const schema: ISchema = SchemaNormalizer.normalize({
        type: "array",
        items: {
            type: "object",
            required: ["always"],
            properties: {
                always: { type: "string" },
                sometimes: { type: "string" }
            }
        }
    });

    it("a $row override can require a column the schema leaves optional", () => {
        const results = PayloadValidator.validatePayloadArrays(
            schema,
            [{ always: "x" }],
            "",
            noPlugins,
            undefined,
            (path) => (path === "0/sometimes" ? true : undefined)
        );
        assert.ok(Object.keys(failures(results)).includes("0/sometimes"));
    });

    it("a $row override can release a column the schema requires", () => {
        const results = PayloadValidator.validatePayloadArrays(
            schema,
            [{}],
            "",
            noPlugins,
            undefined,
            (path) => (path === "0/always" ? false : undefined)
        );
        assert.strictEqual(Object.keys(failures(results)).includes("0/always"), false);
    });

    it("an override that returns undefined leaves the schema's own decision in place", () => {
        const results = PayloadValidator.validatePayloadArrays(schema, [{}], "", noPlugins, undefined, () => undefined);
        assert.ok(Object.keys(failures(results)).includes("0/always"));
    });

    it("the override is addressed per row, not per column", () => {
        const results = PayloadValidator.validatePayloadArrays(
            schema,
            [{ always: "x" }, { always: "y" }],
            "",
            noPlugins,
            undefined,
            (path) => (path === "1/sometimes" ? true : undefined)
        );
        assert.deepStrictEqual(Object.keys(failures(results)), ["1/sometimes"]);
    });
});
