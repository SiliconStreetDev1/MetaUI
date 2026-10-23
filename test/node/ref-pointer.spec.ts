/**
 * @file ref-pointer.spec.ts
 * @description `OpenApiRefResolver` against RFC 6901, stated case by case.
 *
 * `ref-resolver.spec.ts` states the escaping round-trip and the headline failure modes. What it
 * does not state is the pointer grammar itself: which traversals succeed, which fail, and what the
 * resolver does at each fork. RFC 6901 is the reference — reference tokens are separated by `/`,
 * `~1` denotes `/` and `~0` denotes `~`, an array is addressed by a decimal index with no leading
 * zeros, and the URI-fragment form percent-decodes before unescaping.
 *
 * On top of the RFC, two MetaUI rules are documented on the class and stated here: a non-local
 * pointer resolves to `null` rather than being fetched, and a pointer chain is followed to its
 * final target with cycle protection.
 */

import * as assert from "assert";
import { fc, withLogCapture, reported } from "./fc-config";
import { OpenApiRefResolver } from "../../src/nz/co/siliconst/ui5/metaui/openapi/OpenApiRefResolver";
import { MAX_SCHEMA_DEPTH } from "../../src/nz/co/siliconst/ui5/metaui/constants/MetaUIConstants";

describe("OpenApiRefResolver — pointer token escaping", () => {
    it("the two RFC 6901 escapes are decoded, in the order the RFC prescribes", () => {
        assert.strictEqual(OpenApiRefResolver.unescapePointerSegment("a~1b"), "a/b");
        assert.strictEqual(OpenApiRefResolver.unescapePointerSegment("a~0b"), "a~b");
        assert.strictEqual(OpenApiRefResolver.unescapePointerSegment("a~01b"), "a~1b",
            "~0 must be decoded after ~1, or '~01' would become '/'");
        assert.strictEqual(OpenApiRefResolver.unescapePointerSegment("plain"), "plain");
        assert.strictEqual(OpenApiRefResolver.unescapePointerSegment(""), "");
    });

    it("escaping produces the two RFC escapes and protects a literal percent", () => {
        assert.strictEqual(OpenApiRefResolver.escapePointerSegment("a/b"), "a~1b");
        assert.strictEqual(OpenApiRefResolver.escapePointerSegment("a~b"), "a~0b");
        assert.strictEqual(OpenApiRefResolver.escapePointerSegment("a~1b"), "a~01b");
        assert.strictEqual(OpenApiRefResolver.escapePointerSegment("/a%20b/{id}"), "~1a%2520b~1{id}");
    });

    it("a well-formed percent escape is decoded, a malformed one is left alone", () => {
        assert.strictEqual(OpenApiRefResolver.unescapePointerSegment("a%20b"), "a b");
        assert.strictEqual(OpenApiRefResolver.unescapePointerSegment("100%"), "100%",
            "a lone percent is not an escape and must not throw");
        assert.strictEqual(OpenApiRefResolver.unescapePointerSegment("a%zzb"), "a%zzb");
        assert.strictEqual(OpenApiRefResolver.unescapePointerSegment("a%2"), "a%2");
    });

    it("unescape(escape(key)) is the identity for any key", () => {
        fc.assert(
            fc.property(fc.string({ maxLength: 24 }), (key) => {
                assert.strictEqual(
                    OpenApiRefResolver.unescapePointerSegment(OpenApiRefResolver.escapePointerSegment(key)),
                    key
                );
            })
        );
    });
});

describe("OpenApiRefResolver — extractRefName", () => {
    it("each of the three definition prefixes is stripped", () => {
        assert.strictEqual(OpenApiRefResolver.extractRefName("#/components/schemas/Pet"), "Pet");
        assert.strictEqual(OpenApiRefResolver.extractRefName("#/definitions/Pet"), "Pet");
        assert.strictEqual(OpenApiRefResolver.extractRefName("#/$defs/Pet"), "Pet");
    });

    it("any other local pointer yields its last token", () => {
        assert.strictEqual(OpenApiRefResolver.extractRefName("#/paths/~1pets/get"), "get");
        assert.strictEqual(OpenApiRefResolver.extractRefName("#/components/responses/Ok"), "Ok");
        assert.strictEqual(OpenApiRefResolver.extractRefName("#/a"), "a");
    });

    it("the extracted name is unescaped", () => {
        assert.strictEqual(OpenApiRefResolver.extractRefName("#/components/schemas/a~1b"), "a/b");
        assert.strictEqual(OpenApiRefResolver.extractRefName("#/definitions/a~0b"), "a~b");
        assert.strictEqual(OpenApiRefResolver.extractRefName("#/$defs/a%20b"), "a b");
    });

    it("a nested pointer under a definition prefix keeps the rest of the path", () => {
        assert.strictEqual(
            OpenApiRefResolver.extractRefName("#/components/schemas/Pet/properties/name"),
            "Pet/properties/name",
            "the prefix is stripped, not the whole path"
        );
    });

    it("a pointer that is not local at all is returned unchanged", () => {
        assert.strictEqual(OpenApiRefResolver.extractRefName("Pet"), "Pet");
        assert.strictEqual(OpenApiRefResolver.extractRefName("other.json#/definitions/Pet"),
            "other.json#/definitions/Pet");
    });

    it("an empty pointer yields an empty name", () => {
        assert.strictEqual(OpenApiRefResolver.extractRefName(""), "");
    });

    it("a bare '#/' yields the pointer itself, since there is no last token", () => {
        assert.strictEqual(OpenApiRefResolver.extractRefName("#/"), "#/");
    });
});

describe("OpenApiRefResolver — resolve", () => {
    const root = {
        components: {
            schemas: {
                Pet: { type: "object", properties: { name: { type: "string" } } },
                Alias: { $ref: "#/components/schemas/Pet" },
                "a/b": { type: "string" },
                "a~b": { type: "integer" }
            }
        },
        definitions: { Legacy: { type: "boolean" } },
        rows: [{ type: "string" }, { type: "number" }]
    };

    it("a pointer resolves to the node it names", () => {
        assert.deepStrictEqual(OpenApiRefResolver.resolve("#/components/schemas/Pet", root), root.components.schemas
            .Pet);
        assert.deepStrictEqual(OpenApiRefResolver.resolve("#/definitions/Legacy", root), { type: "boolean" });
    });

    it("a multi-segment pointer walks through nested objects", () => {
        assert.deepStrictEqual(OpenApiRefResolver.resolve("#/components/schemas/Pet/properties/name", root), {
            type: "string"
        });
    });

    it("an escaped key is unescaped before the lookup", () => {
        assert.deepStrictEqual(OpenApiRefResolver.resolve("#/components/schemas/a~1b", root), { type: "string" });
        assert.deepStrictEqual(OpenApiRefResolver.resolve("#/components/schemas/a~0b", root), { type: "integer" });
    });

    it("an array is addressed by its decimal index", () => {
        assert.deepStrictEqual(OpenApiRefResolver.resolve("#/rows/0", root), { type: "string" });
        assert.deepStrictEqual(OpenApiRefResolver.resolve("#/rows/1", root), { type: "number" });
    });

    it("an index outside the array, or one that is not an index, resolves to nothing", () => {
        const { value, entries } = withLogCapture(() => OpenApiRefResolver.resolve("#/rows/2", root));
        assert.strictEqual(value, null);
        assert.ok(reported(entries, "#/rows/2"), "the unresolvable pointer was not reported");
        for (const pointer of ["#/rows/-1", "#/rows/name", "#/rows/1.5", "#/rows/"]) {
            assert.strictEqual(OpenApiRefResolver.resolve(pointer, root), null, pointer);
        }
    });

    it("a chain of pointers resolves to the final target", () => {
        assert.deepStrictEqual(OpenApiRefResolver.resolve("#/components/schemas/Alias", root), root.components
            .schemas.Pet);
    });

    it("a pointer that resolves nowhere falls back to the definitions dictionary by name", () => {
        // A 2.0 document rewritten with 3.0 pointers still resolves, which is the documented
        // tolerance for mixed-dialect downloads.
        const mixed = { definitions: { Pet: { type: "object" } } };
        assert.deepStrictEqual(OpenApiRefResolver.resolve("#/components/schemas/Pet", mixed), { type: "object" });
        const defs = { $defs: { Pet: { type: "array" } } };
        assert.deepStrictEqual(OpenApiRefResolver.resolve("#/components/schemas/Pet", defs), { type: "array" });
    });

    it("the fallback only fires for a name the dictionary actually holds", () => {
        const { value, entries } = withLogCapture(() =>
            OpenApiRefResolver.resolve("#/components/schemas/Ghost", { definitions: { Pet: {} } })
        );
        assert.strictEqual(value, null);
        assert.ok(reported(entries, "Ghost"));
    });

    it("a cycle terminates, resolves to nothing and is reported", () => {
        const cyclic = {
            components: {
                schemas: {
                    A: { $ref: "#/components/schemas/B" },
                    B: { $ref: "#/components/schemas/A" }
                }
            }
        };
        const { value, entries } = withLogCapture(() =>
            OpenApiRefResolver.resolve("#/components/schemas/A", cyclic)
        );
        assert.strictEqual(value, null);
        assert.ok(reported(entries, "Circular"), "the cycle was not reported");
    });

    it("a self-reference terminates immediately", () => {
        const selfRef = { components: { schemas: { A: { $ref: "#/components/schemas/A" } } } };
        const { value } = withLogCapture(() => OpenApiRefResolver.resolve("#/components/schemas/A", selfRef));
        assert.strictEqual(value, null);
    });

    it("a chain longer than the published depth cap is refused and reported", () => {
        const schemas: Record<string, unknown> = {};
        const links = MAX_SCHEMA_DEPTH + 3;
        for (let i = 0; i < links; i++) {
            schemas[`L${i}`] = { $ref: `#/components/schemas/L${i + 1}` };
        }
        schemas[`L${links}`] = { type: "string" };
        const { value, entries } = withLogCapture(() =>
            OpenApiRefResolver.resolve("#/components/schemas/L0", { components: { schemas } })
        );
        assert.strictEqual(value, null);
        assert.ok(reported(entries, "overly deep"), "the depth refusal was not reported");
    });

    it("a chain within the cap still resolves to its target", () => {
        const schemas: Record<string, unknown> = {};
        const links = MAX_SCHEMA_DEPTH - 2;
        for (let i = 0; i < links; i++) {
            schemas[`L${i}`] = { $ref: `#/components/schemas/L${i + 1}` };
        }
        schemas[`L${links}`] = { type: "string", maxLength: 3 };
        assert.deepStrictEqual(OpenApiRefResolver.resolve("#/components/schemas/L0", { components: { schemas } }), {
            type: "string",
            maxLength: 3
        });
    });

    it("a non-local or empty pointer resolves to nothing and is never fetched", () => {
        for (const pointer of ["", "Pet", "/components/schemas/Pet", "https://example.com/s.json#/Pet", "#Pet"]) {
            assert.strictEqual(OpenApiRefResolver.resolve(pointer, root), null, pointer);
        }
    });

    it("a root that is not a document resolves nothing without crashing", () => {
        for (const document of [null, undefined, 7, "text", []]) {
            assert.strictEqual(OpenApiRefResolver.resolve("#/components/schemas/Pet", document), null,
                JSON.stringify(document));
        }
    });

    it("a pointer that walks into a scalar stops rather than inventing a node", () => {
        const shallow = { a: { b: "scalar" } };
        assert.strictEqual(OpenApiRefResolver.resolve("#/a/b/c", shallow), null);
    });

    it("resolving a node whose value is falsy still reports it as found", () => {
        const falsy = { a: { zero: 0, blank: "", off: false } };
        assert.strictEqual(OpenApiRefResolver.resolve("#/a/zero", falsy), 0);
        assert.strictEqual(OpenApiRefResolver.resolve("#/a/blank", falsy), "");
        assert.strictEqual(OpenApiRefResolver.resolve("#/a/off", falsy), false);
    });

    it("an escaped path-item pointer resolves to its operation", () => {
        const document = { paths: { "/v1/orders": { post: { operationId: "create" } } } };
        assert.deepStrictEqual(OpenApiRefResolver.resolve("#/paths/~1v1~1orders/post", document), {
            operationId: "create"
        });
    });

    it("a pointer built from escapePointerSegment resolves to the key it was built from", () => {
        fc.assert(
            fc.property(fc.string({ minLength: 1, maxLength: 12 }), (key) => {
                const document = { components: { schemas: { [key]: { type: "string" } } } };
                const pointer = `#/components/schemas/${OpenApiRefResolver.escapePointerSegment(key)}`;
                assert.deepStrictEqual(OpenApiRefResolver.resolve(pointer, document), { type: "string" }, key);
            }),
            { numRuns: 300 }
        );
    });
});
