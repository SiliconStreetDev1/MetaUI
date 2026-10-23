/**
 * @file openapi-targets.spec.ts
 * @description Absolute properties for `BaseOpenApiParser`'s target resolution.
 *
 * `dialect-parity.spec.ts` checks that both dialects agree; agreement is blind to a change that
 * moves both of them. These properties state, independently of either parser, *which* schema an
 * operation pointer must resolve to and what must happen when it resolves to nothing.
 */

import * as assert from "assert";
import { fc, reported, withLogCapture } from "./fc-config";
import { JsonRecord } from "./arbitraries";
import { OpenApi2Parser } from "../../src/nz/co/siliconst/ui5/metaui/openapi/parsers/OpenApi2Parser";
import { OpenApi3Parser } from "../../src/nz/co/siliconst/ui5/metaui/openapi/parsers/OpenApi3Parser";
import { ISchema } from "../../src/nz/co/siliconst/ui5/metaui/interfaces/ISchema";

const parser2 = new OpenApi2Parser();
const parser3 = new OpenApi3Parser();

/** An OpenAPI 3.0 document with one operation under `/p`. */
function oa3WithOperation(operation: JsonRecord, schemas: JsonRecord = {}): JsonRecord {
    return {
        openapi: "3.0.3",
        info: { title: "T", version: "1" },
        paths: { "/p": operation },
        components: { schemas }
    };
}

/** An OpenAPI 2.0 document with one operation under `/p`. */
function oa2WithOperation(operation: JsonRecord, definitions: JsonRecord = {}): JsonRecord {
    return {
        swagger: "2.0",
        info: { title: "T", version: "1" },
        paths: { "/p": operation },
        definitions
    };
}

const OPERATION_POINTER = "#/paths/~1p/get";

describe("BaseOpenApiParser — operation target precedence", () => {
    it("a 3.0 requestBody schema wins over parameters and responses", () => {
        const document = oa3WithOperation({
            get: {
                parameters: [{ name: "q", in: "query", schema: { type: "string" } }],
                requestBody: {
                    content: { "application/json": { schema: { type: "object", properties: { body: { type: "string" } } } } }
                },
                responses: {
                    "200": {
                        description: "ok",
                        content: { "application/json": { schema: { type: "object", properties: { res: { type: "string" } } } } }
                    }
                }
            }
        });
        const schema: ISchema = parser3.parse(document, OPERATION_POINTER);
        assert.deepStrictEqual(Object.keys(schema.properties || {}), ["body"]);
    });

    it("a $ref requestBody is resolved before its content is read", () => {
        const document: JsonRecord = {
            openapi: "3.0.3",
            info: { title: "T", version: "1" },
            paths: {
                "/p": { get: { requestBody: { $ref: "#/components/requestBodies/Payload" }, responses: {} } }
            },
            components: {
                requestBodies: {
                    Payload: {
                        content: {
                            "application/json": { schema: { type: "object", properties: { viaRef: { type: "string" } } } }
                        }
                    }
                },
                schemas: {}
            }
        };
        const schema: ISchema = parser3.parse(document, OPERATION_POINTER);
        assert.deepStrictEqual(Object.keys(schema.properties || {}), ["viaRef"]);
    });

    it("a 2.0 body parameter wins over the response schema", () => {
        const document = oa2WithOperation({
            get: {
                parameters: [
                    { name: "q", in: "query", type: "string" },
                    { name: "payload", in: "body", schema: { type: "object", properties: { body: { type: "string" } } } }
                ],
                responses: { "200": { description: "ok", schema: { type: "object", properties: { res: { type: "string" } } } } }
            }
        });
        const schema: ISchema = parser2.parse(document, OPERATION_POINTER);
        assert.deepStrictEqual(Object.keys(schema.properties || {}), ["body"]);
    });

    it("a structured 2xx response wins over synthesized non-body parameters", () => {
        const document = oa2WithOperation({
            get: {
                parameters: [{ name: "q", in: "query", type: "string" }],
                responses: { "200": { description: "ok", schema: { type: "object", properties: { res: { type: "string" } } } } }
            }
        });
        const schema: ISchema = parser2.parse(document, OPERATION_POINTER);
        assert.deepStrictEqual(Object.keys(schema.properties || {}), ["res"]);
    });

    it("an unstructured 2xx response loses to synthesized non-body parameters", () => {
        const document = oa2WithOperation({
            get: {
                parameters: [{ name: "q", in: "query", type: "string" }],
                responses: { "200": { description: "ok", schema: { type: "string" } } }
            }
        });
        const schema: ISchema = parser2.parse(document, OPERATION_POINTER);
        assert.deepStrictEqual(Object.keys(schema.properties || {}), ["q"]);
    });

    it("only 2xx responses are considered", () => {
        fc.assert(
            fc.property(fc.constantFrom("400", "404", "500", "default", "3XX"), (code) => {
                const document = oa2WithOperation({
                    get: {
                        parameters: [{ name: "q", in: "query", type: "string" }],
                        responses: {
                            [code]: { description: "nope", schema: { type: "object", properties: { err: { type: "string" } } } }
                        }
                    }
                });
                const schema: ISchema = parser2.parse(document, OPERATION_POINTER);
                assert.deepStrictEqual(Object.keys(schema.properties || {}), ["q"]);
            }),
            { numRuns: 50 }
        );
    });

    it("path-item parameters are merged with operation parameters, the operation winning per in:name", () => {
        const document = oa2WithOperation({
            parameters: [
                { name: "shared", in: "query", type: "string", maxLength: 9 },
                { name: "onlyPath", in: "query", type: "integer" }
            ],
            get: {
                parameters: [{ name: "shared", in: "query", type: "string", maxLength: 3 }],
                responses: {}
            }
        });
        const schema: ISchema = parser2.parse(document, OPERATION_POINTER);
        assert.deepStrictEqual(Object.keys(schema.properties || {}).sort(), ["onlyPath", "shared"]);
        assert.strictEqual(schema.properties?.shared.maxLength, 3, "the operation parameter did not win");
    });

    it("a $ref parameter is resolved before it is synthesized", () => {
        const document: JsonRecord = {
            swagger: "2.0",
            info: { title: "T", version: "1" },
            paths: { "/p": { get: { parameters: [{ $ref: "#/parameters/Limit" }], responses: {} } } },
            parameters: { Limit: { name: "limit", in: "query", type: "integer", maximum: 50 } },
            definitions: {}
        };
        const schema: ISchema = parser2.parse(document, OPERATION_POINTER);
        assert.strictEqual(schema.properties?.limit.maximum, 50);
    });

    it("an operation with no usable schema yields an empty object rather than a crash", () => {
        const document = oa2WithOperation({ get: { responses: { "204": { description: "no content" } } } });
        const schema: ISchema = parser2.parse(document, OPERATION_POINTER);
        assert.strictEqual(schema.type, "object");
        assert.deepStrictEqual(schema.properties, {});
    });

    it("a parameter's required flag reaches the synthesized schema", () => {
        fc.assert(
            fc.property(fc.boolean(), (required) => {
                const document = oa2WithOperation({
                    get: { parameters: [{ name: "q", in: "query", type: "string", required }], responses: {} }
                });
                const schema: ISchema = parser2.parse(document, OPERATION_POINTER);
                assert.strictEqual(schema.properties?.q.required === true, required);
            }),
            { numRuns: 50 }
        );
    });

    it("a parameter description is copied onto the synthesized schema only when it has none", () => {
        const document = oa2WithOperation({
            get: {
                parameters: [
                    { name: "a", in: "query", type: "string", description: "from parameter" },
                    { name: "b", in: "query", type: "string", description: "from parameter", schema: undefined }
                ],
                responses: {}
            }
        });
        const schema: ISchema = parser2.parse(document, OPERATION_POINTER);
        assert.strictEqual(schema.properties?.a.description, "from parameter");
        assert.strictEqual(schema.properties?.b.description, "from parameter");
    });
});

describe("BaseOpenApiParser — definition targets", () => {
    it("a missing target falls back to the first definition and records the warning on the schema", () => {
        const document = {
            swagger: "2.0",
            info: { title: "T", version: "1" },
            definitions: { First: { type: "object", properties: { a: { type: "string" } } }, Second: { type: "object" } }
        };
        const { value, entries } = withLogCapture(() => parser2.parse(document, "Nonexistent"));
        assert.deepStrictEqual(Object.keys(value.properties || {}), ["a"]);
        assert.ok(reported(entries, "not found"), "the fallback was not reported");
        const warning = value.ui?.options?.targetFallbackWarning;
        assert.strictEqual(typeof warning, "string", "the fallback warning did not reach the schema");
        assert.ok((warning as string).includes("Nonexistent"));
    });

    it("no target at all selects the first definition without a warning", () => {
        const document = {
            swagger: "2.0",
            info: { title: "T", version: "1" },
            definitions: { First: { type: "object", properties: { a: { type: "string" } } } }
        };
        const { value, entries } = withLogCapture(() => parser2.parse(document));
        assert.deepStrictEqual(Object.keys(value.properties || {}), ["a"]);
        assert.strictEqual(reported(entries, "not found"), false);
        assert.strictEqual(value.ui?.options?.targetFallbackWarning, undefined);
    });

    it("a target given as a $ref pointer resolves to the same definition as its bare name", () => {
        fc.assert(
            fc.property(fc.constantFrom("Pet", "Order"), (name) => {
                const definitions: JsonRecord = {
                    Other: { type: "object", properties: { z: { type: "string" } } },
                    [name]: { type: "object", properties: { picked: { type: "string" } } }
                };
                const document = { swagger: "2.0", info: { title: "T", version: "1" }, definitions };
                const byName = parser2.parse(document, name);
                const byPointer = parser2.parse(document, `#/definitions/${name}`);
                assert.deepStrictEqual(Object.keys(byName.properties || {}), ["picked"]);
                assert.deepStrictEqual(Object.keys(byPointer.properties || {}), ["picked"]);
            }),
            { numRuns: 50 }
        );
    });

    it("a document with no definitions at all throws rather than rendering an empty form", () => {
        assert.throws(
            () => parser2.parse({ swagger: "2.0", info: { title: "T", version: "1" } }, "Missing"),
            /Could not find target definition/
        );
    });

    it("an array-typed root becomes an array schema with a table layout", () => {
        fc.assert(
            fc.property(fc.constantFrom<unknown>("array", ["array", "null"]), (type) => {
                const document = {
                    openapi: "3.0.3",
                    info: { title: "T", version: "1" },
                    components: { schemas: { Root: { type, items: { type: "object", properties: { a: { type: "string" } } } } } }
                };
                const schema: ISchema = parser3.parse(document, "Root");
                assert.strictEqual(schema.type, "array");
                assert.strictEqual(schema.layoutStrategy, "table");
                assert.strictEqual(schema.items?.properties?.a.type, "string");
            }),
            { numRuns: 50 }
        );
    });

    it("a scalar root is published as a single named property rather than a blank form", () => {
        fc.assert(
            fc.property(fc.constantFrom("string", "integer", "boolean"), (type) => {
                const document = {
                    openapi: "3.0.3",
                    info: { title: "T", version: "1" },
                    components: { schemas: { Token: { type, maxLength: 12 } } }
                };
                const schema: ISchema = parser3.parse(document, "Token");
                assert.deepStrictEqual(Object.keys(schema.properties || {}), ["Token"]);
                assert.strictEqual(schema.properties?.Token.type, type);
            }),
            { numRuns: 50 }
        );
    });

    it("additionalProperties is carried through verbatim in all three forms", () => {
        const base = { openapi: "3.0.3", info: { title: "T", version: "1" } };
        const open = parser3.parse(
            { ...base, components: { schemas: { Root: { type: "object", additionalProperties: true } } } },
            "Root"
        );
        const closed = parser3.parse(
            { ...base, components: { schemas: { Root: { type: "object", additionalProperties: false } } } },
            "Root"
        );
        const typed = parser3.parse(
            {
                ...base,
                components: { schemas: { Root: { type: "object", additionalProperties: { type: "integer" } } } }
            },
            "Root"
        );
        assert.strictEqual(open.additionalProperties, true);
        assert.strictEqual(closed.additionalProperties, false);
        assert.strictEqual(
            typeof closed.additionalProperties,
            "boolean",
            "a closed object must stay strictly false, not undefined"
        );
        assert.strictEqual((typed.additionalProperties as { type: string }).type, "integer");
    });

    it("every definition in the document appears in the definitions dictionary", () => {
        fc.assert(
            fc.property(fc.uniqueArray(fc.constantFrom("A", "B", "C", "D"), { minLength: 1, maxLength: 4 }), (names) => {
                const schemas: JsonRecord = {};
                for (const name of names) schemas[name] = { type: "object", properties: { v: { type: "string" } } };
                const schema: ISchema = parser3.parse(
                    { openapi: "3.0.3", info: { title: "T", version: "1" }, components: { schemas } },
                    names[0]
                );
                assert.deepStrictEqual(Object.keys(schema.definitions || {}).sort(), [...names].sort());
            }),
            { numRuns: 100 }
        );
    });
});
