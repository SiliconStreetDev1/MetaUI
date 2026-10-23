/**
 * @file openapi-parser.spec.ts
 * @description The negative and edge branches of `BaseOpenApiParser`.
 *
 * `openapi-targets.spec.ts` states what the parser selects when the document is well formed:
 * which operation target wins, which definition is chosen. Almost every branch in the parser has
 * a second side that nothing asserted — the pointer that resolves nowhere, the response with no
 * schema, the parameter with no name, the media type that carries nothing. Those are precisely
 * the shapes a real specification download produces, and the ones where silent degradation hides
 * (engineering rule 2).
 *
 * The reference is the OpenAPI 2.0 and 3.x object definitions:
 *  - a Parameter Object in 2.0 declares its validation keywords inline, and in 3.x under `schema`
 *    or `content`; both must yield the same descriptor;
 *  - a Response Object carries `schema` in 2.0 and `content/<media>/schema` in 3.x;
 *  - path-item parameters are merged with operation parameters, keyed by `in` + `name`, the
 *    operation's own winning;
 *  - only `2xx` responses describe a success payload.
 */

import * as assert from "assert";
import { withLogCapture, reported } from "./fc-config";
import { ISchema } from "../../src/nz/co/siliconst/ui5/metaui/interfaces/ISchema";
import { OpenApi2Parser } from "../../src/nz/co/siliconst/ui5/metaui/openapi/parsers/OpenApi2Parser";
import { OpenApi3Parser } from "../../src/nz/co/siliconst/ui5/metaui/openapi/parsers/OpenApi3Parser";

const parse2 = (root: unknown, target?: string): ISchema => new OpenApi2Parser().parse(root, target);
const parse3 = (root: unknown, target?: string): ISchema => new OpenApi3Parser().parse(root, target);

/** A minimal 3.0 document around the given component schemas. */
const doc3 = (schemas: Record<string, unknown>, rest: Record<string, unknown> = {}): Record<string, unknown> => ({
    openapi: "3.0.0",
    components: { schemas },
    ...rest
});

/** A minimal 2.0 document around the given definitions. */
const doc2 = (definitions: Record<string, unknown>, rest: Record<string, unknown> = {}): Record<string, unknown> => ({
    swagger: "2.0",
    definitions,
    ...rest
});

describe("BaseOpenApiParser — the root schema", () => {
    it("the document title is used when the target definition has none", () => {
        const schema = parse3(doc3({ Thing: { type: "object", properties: { a: { type: "string" } } } }, {
            info: { title: "Catalogue API" }
        }));
        assert.strictEqual(schema.title, "Catalogue API");
    });

    it("the definition's own title wins over the document title", () => {
        const schema = parse3(doc3({ Thing: { type: "object", title: "A thing", properties: {} } }, {
            info: { title: "Catalogue API" }
        }));
        assert.strictEqual(schema.title, "A thing");
    });

    it("with no title anywhere, the definition key names the schema", () => {
        const schema = parse3(doc3({ Thing: { type: "object", properties: { a: { type: "string" } } } }));
        assert.strictEqual(schema.title, "Thing");
    });

    it("a document with neither titles nor a target has an empty title rather than undefined", () => {
        const schema = parse3({ openapi: "3.0.0", type: "object", properties: {} });
        assert.strictEqual(schema.title, "");
    });

    it("an object root is a form and an array root is a table", () => {
        const form = parse3(doc3({ Thing: { type: "object", properties: { a: { type: "string" } } } }));
        assert.strictEqual(form.type, "object");
        assert.strictEqual(form.layoutStrategy, "form");
        const table = parse3(doc3({ Rows: { type: "array", items: { type: "object", properties: {} } } }));
        assert.strictEqual(table.type, "array");
        assert.strictEqual(table.layoutStrategy, "table");
    });

    it("a union root type resolves to its non-null member", () => {
        const schema = parse3(doc3({ Rows: { type: ["array", "null"], items: { type: "string" } } }));
        assert.strictEqual(schema.type, "array");
        assert.strictEqual(schema.items?.type, "string");
    });

    it("a target given as a $ref pointer is resolved before the root is read", () => {
        const root = doc3({ Thing: { type: "object", properties: { a: { type: "string" } } } });
        const byRef = parse3(root, "#/components/schemas/Thing");
        const byName = parse3(root, "Thing");
        assert.deepStrictEqual(Object.keys(byRef.properties || {}), Object.keys(byName.properties || {}));
    });

    it("a target whose definition is itself a $ref is followed", () => {
        const root = doc3({
            Alias: { $ref: "#/components/schemas/Real" },
            Real: { type: "object", properties: { a: { type: "string", maxLength: 3 } } }
        });
        const schema = parse3(root, "Alias");
        assert.strictEqual(schema.properties?.a.maxLength, 3);
    });

    it("a root allOf is intersected before the root is read", () => {
        const schema = parse3(
            doc3({
                Thing: {
                    allOf: [
                        { type: "object", properties: { a: { type: "string" } } },
                        { type: "object", properties: { b: { type: "integer" } }, required: ["b"] }
                    ]
                }
            })
        );
        assert.deepStrictEqual(Object.keys(schema.properties || {}).sort(), ["a", "b"]);
        assert.deepStrictEqual(schema.required, ["b"]);
    });

    it("a missing target falls back to the first definition and records the warning on the schema", () => {
        const { value, entries } = withLogCapture(() =>
            parse3(doc3({ First: { type: "object", properties: { a: { type: "string" } } } }), "Nonexistent")
        );
        assert.deepStrictEqual(Object.keys(value.properties || {}), ["a"]);
        assert.strictEqual(typeof value.ui?.options?.targetFallbackWarning, "string");
        assert.ok(reported(entries, "Nonexistent"), "the fallback was not reported");
    });

    it("no target at all selects the first definition and records no warning", () => {
        const schema = parse3(
            doc3({ First: { type: "object", properties: { a: { type: "string" } } }, Second: { type: "object" } })
        );
        assert.deepStrictEqual(Object.keys(schema.properties || {}), ["a"]);
        assert.strictEqual(schema.ui, undefined);
    });

    it("every definition in the document is published in the definitions dictionary", () => {
        const schema = parse3(doc3({ A: { type: "object", properties: {} }, B: { type: "string" } }));
        assert.deepStrictEqual(Object.keys(schema.definitions || {}).sort(), ["A", "B"]);
    });

    it("a document with no definitions map publishes no definitions dictionary", () => {
        const schema = parse3({ openapi: "3.0.0", type: "object", properties: { a: { type: "string" } } });
        assert.strictEqual(schema.definitions, undefined);
    });

    it("the three forms of additionalProperties are each carried through", () => {
        assert.strictEqual(parse3(doc3({ T: { type: "object", additionalProperties: true } })).additionalProperties,
            true);
        assert.strictEqual(parse3(doc3({ T: { type: "object", additionalProperties: false } })).additionalProperties,
            false);
        const mapped = parse3(doc3({ T: { type: "object", additionalProperties: { type: "integer" } } }));
        assert.strictEqual(typeof mapped.additionalProperties, "object");
        assert.strictEqual((mapped.additionalProperties as { type?: string }).type, "integer");
        assert.strictEqual(parse3(doc3({ T: { type: "object", properties: {} } })).additionalProperties, undefined);
    });

    it("a scalar root is published as one named field rather than a blank form", () => {
        const schema = parse3(doc3({ Code: { type: "string", maxLength: 4 } }), "Code");
        assert.deepStrictEqual(Object.keys(schema.properties || {}), ["Code"]);
        assert.strictEqual(schema.properties?.Code.maxLength, 4);
    });

    it("an enum-only root is published as one named field too", () => {
        const schema = parse3(doc3({ Colour: { enum: ["RED", "GREEN"] } }), "Colour");
        assert.deepStrictEqual(Object.keys(schema.properties || {}), ["Colour"]);
        assert.deepStrictEqual(schema.properties?.Colour.enum, ["RED", "GREEN"]);
    });

    it("an object root with no properties is left without any, not wrapped in a value field", () => {
        const schema = parse3(doc3({ Opaque: { type: "object" } }), "Opaque");
        assert.strictEqual(schema.properties, undefined);
    });

    it("an array root's items are mapped even though it has no properties", () => {
        const schema = parse3(doc3({ Rows: { type: "array", items: { type: "string", maxLength: 2 } } }), "Rows");
        assert.strictEqual(schema.items?.maxLength, 2);
        assert.strictEqual(schema.properties, undefined);
    });

    it("a polymorphic root is given usable root properties instead of a blank form", () => {
        const schema = parse3(
            doc3({
                Shape: {
                    oneOf: [
                        { type: "object", title: "Square", properties: { side: { type: "number" } } },
                        { type: "object", title: "Circle", properties: { radius: { type: "number" } } }
                    ]
                }
            }),
            "Shape"
        );
        assert.ok(
            schema.oneOf !== undefined || Object.keys(schema.properties || {}).length > 0,
            "a oneOf root rendered as a blank form"
        );
    });

    it("a document that is not an object at all yields an empty form rather than a crash", () => {
        for (const raw of [null, undefined, 7, "text", ["a"]]) {
            const schema = parse3(raw);
            assert.strictEqual(schema.type, "object");
            assert.strictEqual(typeof schema.title, "string");
        }
    });
});

describe("BaseOpenApiParser — operation targets, negative paths", () => {
    it("an operation pointer that resolves to nothing falls back to the definitions", () => {
        const root = doc3({ Thing: { type: "object", properties: { a: { type: "string" } } } }, { paths: {} });
        const { value } = withLogCapture(() => parse3(root, "#/paths/~1missing/get"));
        assert.deepStrictEqual(Object.keys(value.properties || {}), ["a"]);
    });

    it("an operation with no usable schema yields an empty object rather than a crash", () => {
        const root = {
            openapi: "3.0.0",
            paths: { "/ping": { get: { responses: { "204": { description: "No content" } } } } }
        };
        const schema = parse3(root, "#/paths/~1ping/get");
        assert.strictEqual(schema.type, "object");
        assert.deepStrictEqual(schema.properties, {});
    });

    it("a non-2xx response is never read as the success payload", () => {
        const root = {
            openapi: "3.0.0",
            paths: {
                "/thing": {
                    get: {
                        responses: {
                            "404": {
                                content: {
                                    "application/json": {
                                        schema: { type: "object", properties: { error: { type: "string" } } }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        };
        const schema = parse3(root, "#/paths/~1thing/get");
        assert.strictEqual(Object.keys(schema.properties || {}).includes("error"), false);
    });

    it("a 2.0 response schema is read from the response's own schema key", () => {
        const root = doc2(
            {},
            {
                paths: {
                    "/thing": {
                        get: {
                            responses: {
                                "200": { schema: { type: "object", properties: { id: { type: "string" } } } }
                            }
                        }
                    }
                }
            }
        );
        const schema = parse2(root, "#/paths/~1thing/get");
        assert.deepStrictEqual(Object.keys(schema.properties || {}), ["id"]);
    });

    it("a $ref response is resolved before its schema is read", () => {
        const root = {
            openapi: "3.0.0",
            components: {
                responses: {
                    Ok: {
                        content: {
                            "application/json": { schema: { type: "object", properties: { id: { type: "string" } } } }
                        }
                    }
                }
            },
            paths: { "/thing": { get: { responses: { "200": { $ref: "#/components/responses/Ok" } } } } }
        };
        const schema = parse3(root, "#/paths/~1thing/get");
        assert.deepStrictEqual(Object.keys(schema.properties || {}), ["id"]);
    });

    it("a response whose media types carry no schema contributes nothing", () => {
        const root = {
            openapi: "3.0.0",
            paths: {
                "/thing": {
                    get: {
                        parameters: [{ name: "q", in: "query", schema: { type: "string" } }],
                        responses: { "200": { content: { "application/json": {} } } }
                    }
                }
            }
        };
        const schema = parse3(root, "#/paths/~1thing/get");
        assert.deepStrictEqual(Object.keys(schema.properties || {}), ["q"],
            "the empty media type should not have displaced the parameters");
    });

    it("an unstructured 2xx response loses to the synthesized parameters", () => {
        const root = {
            openapi: "3.0.0",
            paths: {
                "/thing": {
                    get: {
                        parameters: [{ name: "q", in: "query", schema: { type: "string" } }],
                        responses: { "200": { content: { "text/plain": { schema: { type: "string" } } } } }
                    }
                }
            }
        };
        assert.deepStrictEqual(Object.keys(parse3(root, "#/paths/~1thing/get").properties || {}), ["q"]);
    });

    it("a structured 2xx response wins over the synthesized parameters", () => {
        const root = {
            openapi: "3.0.0",
            paths: {
                "/thing": {
                    get: {
                        parameters: [{ name: "q", in: "query", schema: { type: "string" } }],
                        responses: {
                            "200": {
                                content: {
                                    "application/json": {
                                        schema: { type: "object", properties: { id: { type: "string" } } }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        };
        assert.deepStrictEqual(Object.keys(parse3(root, "#/paths/~1thing/get").properties || {}), ["id"]);
    });

    it("a response schema is structured when it is a $ref to a structured definition", () => {
        const root = {
            openapi: "3.0.0",
            components: { schemas: { Thing: { type: "object", properties: { id: { type: "string" } } } } },
            paths: {
                "/thing": {
                    get: {
                        parameters: [{ name: "q", in: "query", schema: { type: "string" } }],
                        responses: {
                            "200": {
                                content: {
                                    "application/json": { schema: { $ref: "#/components/schemas/Thing" } }
                                }
                            }
                        }
                    }
                }
            }
        };
        assert.deepStrictEqual(Object.keys(parse3(root, "#/paths/~1thing/get").properties || {}), ["id"]);
    });

    it("a response schema composed with allOf counts as structured", () => {
        const root = {
            openapi: "3.0.0",
            paths: {
                "/thing": {
                    get: {
                        parameters: [{ name: "q", in: "query", schema: { type: "string" } }],
                        responses: {
                            "200": {
                                content: {
                                    "application/json": {
                                        schema: {
                                            allOf: [{ type: "object", properties: { id: { type: "string" } } }]
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        };
        assert.deepStrictEqual(Object.keys(parse3(root, "#/paths/~1thing/get").properties || {}), ["id"]);
    });

    it("a $ref requestBody is resolved before its content is read", () => {
        const root = {
            openapi: "3.0.0",
            components: {
                requestBodies: {
                    Payload: {
                        content: {
                            "application/json": { schema: { type: "object", properties: { body: { type: "string" } } } }
                        }
                    }
                }
            },
            paths: { "/thing": { post: { requestBody: { $ref: "#/components/requestBodies/Payload" } } } }
        };
        assert.deepStrictEqual(Object.keys(parse3(root, "#/paths/~1thing/post").properties || {}), ["body"]);
    });

    it("a requestBody with no usable media type does not displace the parameters", () => {
        const root = {
            openapi: "3.0.0",
            paths: {
                "/thing": {
                    post: {
                        parameters: [{ name: "q", in: "query", schema: { type: "string" } }],
                        requestBody: { content: {} }
                    }
                }
            }
        };
        assert.deepStrictEqual(Object.keys(parse3(root, "#/paths/~1thing/post").properties || {}), ["q"]);
    });
});

describe("BaseOpenApiParser — parameter synthesis", () => {
    /** A 3.0 operation that declares exactly the given parameters. */
    const withParams = (parameters: unknown[], pathItemParams?: unknown[]): Record<string, unknown> => ({
        openapi: "3.0.0",
        paths: {
            "/thing": {
                ...(pathItemParams ? { parameters: pathItemParams } : {}),
                get: { parameters }
            }
        }
    });

    it("each named non-body parameter becomes a property", () => {
        const schema = parse3(
            withParams([
                { name: "q", in: "query", schema: { type: "string" } },
                { name: "id", in: "path", required: true, schema: { type: "integer" } }
            ]),
            "#/paths/~1thing/get"
        );
        assert.deepStrictEqual(Object.keys(schema.properties || {}).sort(), ["id", "q"]);
        assert.strictEqual(schema.properties?.id.type, "integer");
        assert.deepStrictEqual(schema.required, ["id"]);
    });

    it("a parameter with no name contributes nothing", () => {
        const schema = parse3(
            withParams([{ in: "query", schema: { type: "string" } }, { name: "q", in: "query" }]),
            "#/paths/~1thing/get"
        );
        assert.deepStrictEqual(Object.keys(schema.properties || {}), ["q"]);
    });

    it("an entry in the parameter list that is not an object is skipped", () => {
        const schema = parse3(
            withParams([null, 7, "q", { name: "q", in: "query", schema: { type: "string" } }]),
            "#/paths/~1thing/get"
        );
        assert.deepStrictEqual(Object.keys(schema.properties || {}), ["q"]);
    });

    it("a parameters value that is not an array is ignored rather than crashing", () => {
        const schema = parse3(
            { openapi: "3.0.0", paths: { "/thing": { get: { parameters: { name: "q" } } } } },
            "#/paths/~1thing/get"
        );
        assert.deepStrictEqual(schema.properties, {});
    });

    it("a body parameter is never synthesized as a query field", () => {
        const schema = parse2(
            doc2({}, {
                paths: {
                    "/thing": {
                        post: {
                            parameters: [
                                { name: "payload", in: "body", schema: { type: "object", properties: {} } },
                                { name: "q", in: "query", type: "string" }
                            ]
                        }
                    }
                }
            }),
            "#/paths/~1thing/post"
        );
        assert.strictEqual(Object.keys(schema.properties || {}).includes("payload"), false);
    });

    it("a parameter's schema may arrive under content instead of schema", () => {
        const schema = parse3(
            withParams([
                {
                    name: "filter",
                    in: "query",
                    content: { "application/json": { schema: { type: "integer", minimum: 1 } } }
                }
            ]),
            "#/paths/~1thing/get"
        );
        assert.strictEqual(schema.properties?.filter.type, "integer");
        assert.strictEqual(schema.properties?.filter.minimum, 1);
    });

    it("an empty content block falls back to the inline parameter keywords", () => {
        const schema = parse3(withParams([{ name: "q", in: "query", content: {}, type: "integer" }]),
            "#/paths/~1thing/get");
        assert.strictEqual(schema.properties?.q.type, "integer");
    });

    it("a parameter description fills in only when the schema has none of its own", () => {
        const schema = parse3(
            withParams([
                { name: "a", in: "query", description: "From the parameter", schema: { type: "string" } },
                {
                    name: "b",
                    in: "query",
                    description: "From the parameter",
                    schema: { type: "string", description: "From the schema" }
                }
            ]),
            "#/paths/~1thing/get"
        );
        assert.strictEqual(schema.properties?.a.description, "From the parameter");
        assert.strictEqual(schema.properties?.b.description, "From the schema");
    });

    it("a parameter is required only on an explicit required: true", () => {
        const schema = parse3(
            withParams([
                { name: "a", in: "query", required: true, schema: { type: "string" } },
                { name: "b", in: "query", required: false, schema: { type: "string" } },
                { name: "c", in: "query", required: "true", schema: { type: "string" } },
                { name: "d", in: "query", schema: { type: "string" } }
            ]),
            "#/paths/~1thing/get"
        );
        assert.deepStrictEqual(schema.required, ["a"]);
    });

    it("with no required parameters the required list is empty, not absent", () => {
        const schema = parse3(withParams([{ name: "a", in: "query", schema: { type: "string" } }]),
            "#/paths/~1thing/get");
        assert.deepStrictEqual(schema.required, []);
        assert.strictEqual(schema.properties?.a.required, false);
    });

    it("a $ref parameter is resolved before it is synthesized", () => {
        const root = {
            openapi: "3.0.0",
            components: { parameters: { Q: { name: "q", in: "query", schema: { type: "integer" } } } },
            paths: { "/thing": { get: { parameters: [{ $ref: "#/components/parameters/Q" }] } } }
        };
        assert.strictEqual(parse3(root, "#/paths/~1thing/get").properties?.q.type, "integer");
    });

    it("a $ref parameter that resolves nowhere is used as written", () => {
        const root = {
            openapi: "3.0.0",
            paths: { "/thing": { get: { parameters: [{ $ref: "#/components/parameters/Gone", name: "q",
                in: "query" }] } } }
        };
        const { value } = withLogCapture(() => parse3(root, "#/paths/~1thing/get"));
        assert.deepStrictEqual(Object.keys(value.properties || {}), ["q"]);
    });

    it("path-item parameters are merged in, and the operation's own entry wins per in:name", () => {
        const schema = parse3(
            withParams(
                [{ name: "q", in: "query", schema: { type: "integer" } }],
                [
                    { name: "q", in: "query", schema: { type: "string" } },
                    { name: "shared", in: "header", schema: { type: "string" } }
                ]
            ),
            "#/paths/~1thing/get"
        );
        assert.deepStrictEqual(Object.keys(schema.properties || {}).sort(), ["q", "shared"]);
        assert.strictEqual(schema.properties?.q.type, "integer", "the operation's own parameter must win");
    });

    it("the same name in two different locations is kept as two parameters", () => {
        const schema = parse3(
            withParams([
                { name: "id", in: "path", schema: { type: "string" } },
                { name: "id", in: "query", schema: { type: "integer" } }
            ]),
            "#/paths/~1thing/get"
        );
        // Both are merged into one property dictionary keyed by name, so the later one wins there,
        // but both must have survived the in:name keying rather than one replacing the other.
        assert.strictEqual(schema.properties?.id.type, "integer");
    });
});

describe("BaseOpenApiParser — 2.0 inline parameter keywords", () => {
    /** A 2.0 operation declaring one non-body parameter. */
    const param2 = (param: Record<string, unknown>): ISchema =>
        parse2(doc2({}, { paths: { "/thing": { get: { parameters: [{ name: "p", in: "query", ...param }] } } } }),
            "#/paths/~1thing/get");

    it("every validation keyword the 2.0 Parameter Object permits reaches the descriptor", () => {
        const meta = param2({
            type: "string",
            format: "date",
            default: "2026-01-01",
            enum: ["2026-01-01", "2026-01-02"],
            maxLength: 10,
            minLength: 10,
            pattern: "^\\d{4}-\\d{2}-\\d{2}$"
        }).properties?.p;
        assert.strictEqual(meta?.type, "string");
        assert.strictEqual(meta?.format, "date");
        assert.strictEqual(meta?.default, "2026-01-01");
        assert.strictEqual(meta?.maxLength, 10);
        assert.strictEqual(meta?.minLength, 10);
        assert.strictEqual(meta?.pattern, "^\\d{4}-\\d{2}-\\d{2}$");
        assert.deepStrictEqual(meta?.enum, ["2026-01-01", "2026-01-02"]);
    });

    it("the numeric keywords reach the descriptor too", () => {
        const meta = param2({
            type: "integer",
            multipleOf: 5,
            maximum: 100,
            minimum: 10,
            exclusiveMaximum: true,
            exclusiveMinimum: true
        }).properties?.p;
        assert.strictEqual(meta?.multipleOf, 5);
        assert.strictEqual(meta?.maximum, 100);
        assert.strictEqual(meta?.minimum, 10);
        assert.strictEqual(meta?.exclusiveMaximum, true);
        assert.strictEqual(meta?.exclusiveMinimum, true);
    });

    it("the array keywords reach the descriptor too", () => {
        const meta = param2({
            type: "array",
            items: { type: "string" },
            maxItems: 5,
            minItems: 1,
            uniqueItems: true
        }).properties?.p;
        assert.strictEqual(meta?.type, "array");
        assert.strictEqual(meta?.items?.type, "string");
        assert.strictEqual(meta?.maxItems, 5);
        assert.strictEqual(meta?.minItems, 1);
        assert.strictEqual(meta?.uniqueItems, true);
    });

    it("a parameter with no declared type defaults to string", () => {
        assert.strictEqual(param2({}).properties?.p.type, "string");
    });

    it("an absent keyword is left off entirely rather than written as undefined", () => {
        const meta = param2({ type: "string" }).properties?.p;
        assert.strictEqual(meta?.maxLength, undefined);
        assert.strictEqual(meta?.pattern, undefined);
        assert.strictEqual(meta?.enum, undefined);
    });

    it("a 2.0 inline parameter and the equivalent 3.0 schema parameter agree", () => {
        const inline = param2({ type: "integer", minimum: 1, maximum: 9 }).properties?.p;
        const nested = parse3(
            {
                openapi: "3.0.0",
                paths: {
                    "/thing": {
                        get: {
                            parameters: [
                                { name: "p", in: "query", schema: { type: "integer", minimum: 1, maximum: 9 } }
                            ]
                        }
                    }
                }
            },
            "#/paths/~1thing/get"
        ).properties?.p;
        assert.strictEqual(inline?.type, nested?.type);
        assert.strictEqual(inline?.minimum, nested?.minimum);
        assert.strictEqual(inline?.maximum, nested?.maximum);
    });
});
