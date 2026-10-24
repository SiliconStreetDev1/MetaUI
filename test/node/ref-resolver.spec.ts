/**
 * @file ref-resolver.spec.ts
 * @description Properties of `OpenApiRefResolver`, the RFC 6901 pointer layer.
 *
 * The audit fixed an escaping defect here: `unescapePointerSegment` percent-decodes, so a key
 * containing a literal `%` — an OpenAPI path such as `/a%20b/{id}` is the common case — only
 * survives the round trip if `escapePointerSegment` percent-encodes it first. An example-based
 * test checks the one key someone thought of; a round-trip property checks all of them.
 */

import * as assert from "assert";
import { fc, reported, withLogCapture } from "./fc-config";
import { JsonRecord } from "./arbitraries";
import { OpenApiRefResolver } from "../../src/nz/co/siliconst/ui5/metaui/openapi/OpenApiRefResolver";
import { OpenApiTypeMapper } from "../../src/nz/co/siliconst/ui5/metaui/openapi/OpenApiTypeMapper";

/** Keys that stress every escaping rule: `~`, `/`, `%`, valid and invalid percent sequences. */
const pointerKeyArb: fc.Arbitrary<string> = fc.oneof(
    { weight: 3, arbitrary: fc.string({ maxLength: 10 }) },
    {
        weight: 5,
        arbitrary: fc.string({
            unit: fc.constantFrom("a", "~", "/", "%", "0", "1", "2", "F", "z", " ", "#", "+"),
            maxLength: 10
        })
    },
    {
        weight: 2,
        arbitrary: fc.constantFrom(
            "/a%20b/{id}",
            "a~1b",
            "a~0b",
            "~01",
            "%zz",
            "%25",
            "100%",
            "a/b/c",
            "",
            "applications/json"
        )
    }
);

describe("OpenApiRefResolver — pointer escaping", () => {
    it("unescape(escape(key)) === key for any key", () => {
        fc.assert(
            fc.property(pointerKeyArb, (key) => {
                assert.strictEqual(
                    OpenApiRefResolver.unescapePointerSegment(OpenApiRefResolver.escapePointerSegment(key)),
                    key
                );
            })
        );
    });

    it("an escaped pointer resolves to the definition it names", () => {
        fc.assert(
            fc.property(pointerKeyArb, pointerKeyArb, (key, otherKey) => {
                const target = { type: "string", maxLength: 7 };
                const decoy = { type: "integer" };
                const definitions: JsonRecord = {};
                if (otherKey !== key) definitions[otherKey] = decoy;
                definitions[key] = target;
                const document: JsonRecord = { definitions };
                const pointer = `#/definitions/${OpenApiRefResolver.escapePointerSegment(key)}`;
                assert.strictEqual(OpenApiRefResolver.resolve(pointer, document), target);
            })
        );
    });

    it("extractRefName recovers the definition name from an escaped pointer", () => {
        fc.assert(
            fc.property(
                pointerKeyArb,
                fc.constantFrom("#/definitions/", "#/components/schemas/", "#/$defs/"),
                (key, prefix) => {
                    const pointer = `${prefix}${OpenApiRefResolver.escapePointerSegment(key)}`;
                    assert.strictEqual(OpenApiRefResolver.extractRefName(pointer), key);
                }
            )
        );
    });

    it("a multi-segment pointer resolves through objects and array indices", () => {
        fc.assert(
            fc.property(pointerKeyArb, fc.integer({ min: 0, max: 4 }), (key, index) => {
                const target = { type: "boolean" };
                const list: unknown[] = [];
                for (let i = 0; i < index; i++) list.push({ type: "string" });
                list.push(target);
                const document: JsonRecord = { paths: { [key]: { entries: list } } };
                const pointer = `#/paths/${OpenApiRefResolver.escapePointerSegment(key)}/entries/${index}`;
                assert.strictEqual(OpenApiRefResolver.resolve(pointer, document), target);
            })
        );
    });
});

describe("OpenApiRefResolver — unresolvable and circular pointers", () => {
    it("a local pointer that resolves nowhere returns null and is reported", () => {
        fc.assert(
            fc.property(fc.string({ maxLength: 8 }), (suffix) => {
                const { value, entries } = withLogCapture(() =>
                    OpenApiRefResolver.resolve(`#/definitions/missing_${suffix}`, {
                        definitions: { Known: { type: "string" } }
                    })
                );
                assert.strictEqual(value, null);
                assert.ok(reported(entries, "Failed to resolve local $ref"), "the failure was silent");
            }),
            { numRuns: 400 }
        );
    });

    it("a non-local or empty $ref is dropped loudly, above debug level", () => {
        // Was finding F10: this reported through `Logger.debug`, which is gated behind
        // `Logger.setDebugMode(true)` and so is invisible in production. A spec splitting its
        // definitions across files lost them with no signal and rendered an empty field — the
        // "plausible-looking empty result" AGENTS.md rule 2 forbids.
        for (const pointer of ["", "Pet", "http://example.com/x.json#/Pet", "./other.yaml#/Pet"]) {
            const { value, entries } = withLogCapture(() =>
                OpenApiRefResolver.resolve(pointer, { definitions: { Known: { type: "string" } } })
            );
            assert.strictEqual(value, null, `'${pointer}' unexpectedly resolved`);
            assert.ok(
                entries.some((entry) => entry.level === "warning" || entry.level === "error"),
                `'${pointer}' was dropped without a visible signal`
            );
        }
    });

    it("a $ref cycle terminates, returns null and is reported", () => {
        const document: JsonRecord = {
            definitions: {
                A: { $ref: "#/definitions/B" },
                B: { $ref: "#/definitions/A" }
            }
        };
        const { value, entries } = withLogCapture(() =>
            OpenApiRefResolver.resolve("#/definitions/A", document)
        );
        assert.strictEqual(value, null);
        assert.ok(reported(entries, "Circular or overly deep $ref"), "the cycle was not reported");
    });

    it("a chain of $ref hops resolves to the final target", () => {
        fc.assert(
            fc.property(fc.integer({ min: 1, max: 8 }), (hops) => {
                const target = { type: "number", minimum: 3 };
                const definitions: JsonRecord = { Target: target };
                for (let i = 0; i < hops; i++) {
                    definitions[`Hop${i}`] = { $ref: i === 0 ? "#/definitions/Target" : `#/definitions/Hop${i - 1}` };
                }
                assert.strictEqual(
                    OpenApiRefResolver.resolve(`#/definitions/Hop${hops - 1}`, { definitions }),
                    target
                );
            }),
            { numRuns: 100 }
        );
    });
});

describe("OpenApiTypeMapper", () => {
    const FIELD_TYPES = ["string", "number", "integer", "boolean", "array", "object", "date"];

    /** Keys inherited from `Object.prototype`, which a plain lookup object would resolve instead of missing. */
    const INHERITED_KEYS = [
        "constructor",
        "toString",
        "valueOf",
        "hasOwnProperty",
        "isPrototypeOf",
        "propertyIsEnumerable",
        "toLocaleString",
        "__proto__",
        "__defineGetter__",
        "__defineSetter__",
        "__lookupGetter__",
        "__lookupSetter__"
    ];

    it("maps every OpenAPI type to a MetaUI field type", () => {
        fc.assert(
            fc.property(
                fc.oneof(
                    fc.constantFrom("string", "file", "number", "integer", "boolean", "array", "object", "date", ""),
                    fc.string({ maxLength: 8 })
                ),
                (rawType) => {
                    const mapped = OpenApiTypeMapper.mapType(rawType);
                    assert.ok(FIELD_TYPES.includes(mapped), `'${rawType}' mapped to '${String(mapped)}'`);
                }
            )
        );
    });

    it("file maps to string and an unknown type falls back to string", () => {
        assert.strictEqual(OpenApiTypeMapper.mapType("file"), "string");
        assert.strictEqual(OpenApiTypeMapper.mapType("quantum"), "string");
        assert.strictEqual(OpenApiTypeMapper.mapType("integer"), "integer");
    });

    it("an inherited Object.prototype key falls back to string rather than resolving a function", () => {
        // Was finding F9: `typeMap[openApiType] || "string"` read through the prototype chain of
        // an object literal, so `type: "constructor"` yielded the `Object` constructor — a
        // function whose declared type was `FieldType`. The table is a `Map` now. The spec being
        // mapped is untrusted input, so this stays as an explicit regression test.
        for (const key of INHERITED_KEYS) {
            const mapped = OpenApiTypeMapper.mapType(key);
            assert.strictEqual(typeof mapped, "string", `'${key}' mapped to a ${typeof mapped}`);
            assert.strictEqual(mapped, "string", `'${key}' did not fall back to string`);
        }
    });
});
