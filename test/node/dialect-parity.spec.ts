/**
 * @file dialect-parity.spec.ts
 * @description Properties asserting that the same logical API produces the same MetaUI schema
 * whichever dialect it is written in.
 *
 * Three ingestion paths exist for one specification: `OpenApi2Parser`, `OpenApi3Parser` and
 * `SchemaNormalizer`. Every one of the audit's ingestion defects was one of them disagreeing
 * with another. These properties make the disagreement itself the failure.
 */

import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import { fc } from "./fc-config";
import {
    JsonRecord,
    constraintsOf,
    neutralizeRefs,
    primitiveSchemaArb,
    prune,
    rootSchemaArb,
    schemaDocumentArb,
    toJsonSchema,
    toOpenApi2,
    toOpenApi3
} from "./arbitraries";
import { OpenApi2Parser } from "../../src/nz/co/siliconst/ui5/metaui/openapi/parsers/OpenApi2Parser";
import { OpenApi3Parser } from "../../src/nz/co/siliconst/ui5/metaui/openapi/parsers/OpenApi3Parser";
import { OpenApiBuilder } from "../../src/nz/co/siliconst/ui5/metaui/openapi/OpenApiBuilder";
import { OpenApiParserFactory } from "../../src/nz/co/siliconst/ui5/metaui/openapi/OpenApiParserFactory";
import { GenerationDelegate } from "../../src/nz/co/siliconst/ui5/metaui/controls/host/delegates/GenerationDelegate";
import { DataInferenceBuilder } from "../../src/nz/co/siliconst/ui5/metaui/core/DataInferenceBuilder";
import { SchemaNormalizer } from "../../src/nz/co/siliconst/ui5/metaui/core/SchemaNormalizer";
import { SchemaWalker } from "../../src/nz/co/siliconst/ui5/metaui/core/SchemaWalker";
import { OpenApiPropertyMapper } from "../../src/nz/co/siliconst/ui5/metaui/openapi/parsers/OpenApiPropertyMapper";
import { ISchema } from "../../src/nz/co/siliconst/ui5/metaui/interfaces/ISchema";
import type GeneratorHost from "../../src/nz/co/siliconst/ui5/metaui/controls/host/GeneratorHost";

const parser2 = new OpenApi2Parser();
const parser3 = new OpenApi3Parser();

/** Parses the same document in both dialects and returns both results, pointers neutralised. */
function parseBothDialects(oa2: JsonRecord, oa3: JsonRecord, target: string): [unknown, unknown] {
    return [
        prune(neutralizeRefs(parser2.parse(oa2, target))),
        prune(neutralizeRefs(parser3.parse(oa3, target)))
    ];
}

describe("dialect parity — definitions", () => {
    it("an OpenAPI 2.0 document and the equivalent 3.0 document produce the same ISchema", () => {
        fc.assert(
            fc.property(schemaDocumentArb(3), (doc) => {
                const [fromTwo, fromThree] = parseBothDialects(toOpenApi2(doc), toOpenApi3(doc), "Root");
                assert.deepStrictEqual(fromTwo, fromThree);
            })
        );
    });

    it("the parser factory selects a parser that agrees with the explicit one", () => {
        fc.assert(
            fc.property(schemaDocumentArb(2), (doc) => {
                const oa2 = toOpenApi2(doc);
                const oa3 = toOpenApi3(doc);
                assert.strictEqual(OpenApiParserFactory.detectSpecVersion(oa2), "2.0");
                assert.strictEqual(OpenApiParserFactory.detectSpecVersion(oa3), "3.0");
                assert.deepStrictEqual(
                    prune(neutralizeRefs(OpenApiParserFactory.getParser(oa2).parse(oa2, "Root"))),
                    prune(neutralizeRefs(parser2.parse(oa2, "Root")))
                );
                assert.deepStrictEqual(
                    prune(neutralizeRefs(OpenApiParserFactory.getParser(oa3).parse(oa3, "Root"))),
                    prune(neutralizeRefs(parser3.parse(oa3, "Root")))
                );
            }),
            { numRuns: 300 }
        );
    });
});

describe("dialect parity — nullability spelling", () => {
    it("OpenAPI 2.0 'x-nullable' and OpenAPI 3.0 'nullable' produce the same descriptor", () => {
        fc.assert(
            fc.property(primitiveSchemaArb, fc.boolean(), (leaf, nullable) => {
                const two = toOpenApi2({
                    root: { type: "object", properties: { field: { ...leaf, "x-nullable": nullable } } },
                    defs: {}
                });
                const three = toOpenApi3({
                    root: { type: "object", properties: { field: { ...leaf, nullable } } },
                    defs: {}
                });
                const [fromTwo, fromThree] = parseBothDialects(two, three, "Root");
                assert.deepStrictEqual(fromTwo, fromThree);
            }),
            { numRuns: 500 }
        );
    });
});

/**
 * The OpenAPI 2.0 Parameter Object declares its validation keywords inline; the 3.0 Parameter
 * Object nests them under `schema`. `BaseOpenApiParser.inlineParameterSchema` exists to make the
 * two equivalent — this property is the thing that checks it stayed equivalent.
 */
describe("dialect parity — operation parameters", () => {
    const parameterCaseArb = fc.array(
        fc.tuple(
            fc.constantFrom("page", "limit", "filter", "sortBy"),
            fc.constantFrom("query", "header", "path"),
            fc.boolean(),
            primitiveSchemaArb,
            fc.option(fc.constantFrom("The page", "A limit"), { nil: undefined })
        ),
        { minLength: 1, maxLength: 4 }
    );

    it("inline 2.0 parameter keywords match 3.0 parameter schemas", () => {
        fc.assert(
            fc.property(parameterCaseArb, (params) => {
                const seen = new Set<string>();
                const unique = params.filter(([name, location]) => {
                    const key = `${location}:${name}`;
                    if (seen.has(key)) return false;
                    seen.add(key);
                    return true;
                });
                const oa2Params = unique.map(([name, location, required, leaf, description]) => ({
                    name,
                    in: location,
                    required: location === "path" ? true : required,
                    ...leaf,
                    ...(description ? { description } : {})
                }));
                const oa3Params = unique.map(([name, location, required, leaf, description]) => ({
                    name,
                    in: location,
                    required: location === "path" ? true : required,
                    schema: { ...leaf },
                    ...(description ? { description } : {})
                }));
                const responses = { "204": { description: "no content" } };
                const oa2: JsonRecord = {
                    swagger: "2.0",
                    info: { title: "Parity", version: "1.0.0" },
                    paths: { "/p": { get: { parameters: oa2Params, responses } } }
                };
                const oa3: JsonRecord = {
                    openapi: "3.0.3",
                    info: { title: "Parity", version: "1.0.0" },
                    paths: { "/p": { get: { parameters: oa3Params, responses } } }
                };
                const [fromTwo, fromThree] = parseBothDialects(oa2, oa3, "#/paths/~1p/get");
                assert.deepStrictEqual(fromTwo, fromThree);
            })
        );
    });
});

describe("dialect parity — JSON Schema versus OpenAPI", () => {
    it("the same schema yields the same constraints through SchemaNormalizer and the 3.0 parser", () => {
        fc.assert(
            fc.property(rootSchemaArb(2), (root) => {
                const normalized: ISchema = SchemaNormalizer.normalize(toJsonSchema({ root, defs: {} }));
                const parsed: ISchema = parser3.parse(toOpenApi3({ root, defs: {} }), "Root");
                for (const key of Object.keys((root.properties as JsonRecord) || {})) {
                    assert.deepStrictEqual(
                        constraintsOf(normalized.properties?.[key]),
                        constraintsOf(parsed.properties?.[key]),
                        `property '${key}' differs between the JSON Schema and OpenAPI paths`
                    );
                }
            })
        );
    });

    it("documents the one deliberate divergence: OpenAPI substitutes an RFC pattern for known formats", () => {
        // Not a defect: `OpenApiConstraintMapper.FORMAT_PATTERNS` enriches `uuid`/`ipv4`/`ipv6`/
        // `hostname` with a validating pattern. `SchemaNormalizer` does not. The property above
        // excludes these formats; this test records why, and fails if either side changes.
        const schema = { type: "object", properties: { id: { type: "string", format: "uuid" } } };
        const normalized = SchemaNormalizer.normalize(schema);
        const parsed = parser3.parse(toOpenApi3({ root: schema, defs: {} }), "Root");
        assert.strictEqual(normalized.properties?.id.pattern, undefined);
        assert.strictEqual(typeof parsed.properties?.id.pattern, "string");
    });

    it("walks an OpenAPI document once without duplicate definition or stacked normalizer passes", () => {
        const directPath = path.join(__dirname, "..", "webapp", "mockData", "scenarios", "openapi_v3_complex.json");
        const scenarioPath = fs.existsSync(directPath)
            ? directPath
            : path.resolve(__dirname, "..", "..", "..", "..", "test", "webapp", "mockData", "scenarios", "openapi_v3_complex.json");
        const scenario = JSON.parse(fs.readFileSync(scenarioPath, "utf8")) as { schema: JsonRecord; data: JsonRecord };
        const origWalk = SchemaWalker.walk.bind(SchemaWalker);
        let visits = 0;
        SchemaWalker.walk = (<TNode = JsonRecord>(
            root: TNode,
            visitor: Parameters<typeof SchemaWalker.walk<TNode>>[1],
            opts?: Parameters<typeof SchemaWalker.walk<TNode>>[2]
        ): void => {
            origWalk(
                root,
                (ctx) => {
                    visits++;
                    return visitor(ctx);
                },
                opts
            );
        }) as typeof SchemaWalker.walk;

        try {
            visits = 0;
            OpenApiBuilder.build(scenario.schema);
            const buildVisits = visits;
            assert.strictEqual(buildVisits, 58, `expected 58 single-walk visits in OpenApiBuilder.build, got ${buildVisits}`);

            visits = 0;
            const hostProps: Record<string, unknown> = {
                schemaDefinition: scenario.schema,
                data: scenario.data,
                schemaTarget: null,
                schemaBuilderRegistry: null,
                schemaDefinitions: null,
                debugMode: false
            };
            const mockHost = {
                getBaseProperty: (k: string) => hostProps[k],
                getProperty: (k: string) => hostProps[k],
                fireEvent: () => undefined,
                setBusy: () => undefined
            } as unknown as GeneratorHost;
            const delegate = new GenerationDelegate(mockHost);
            const prepared = delegate.prepareSchemaAndData( undefined );
            const hostTotalVisits = visits;
            assert.ok(prepared && prepared.normalizedSchema.properties?.ApplicationId);
            assert.strictEqual(
                hostTotalVisits,
                73,
                `expected 73 total SchemaWalker visits in GenerationDelegate.prepareSchemaAndData (58 build + 0 re-normalize + 15 validation), got ${hostTotalVisits}`
            );

            assert.strictEqual(
                SchemaNormalizer.PRODUCER_CONTRACT.extractPropertyMetadata({ type: "string", minLength: 3 }, "code", true).minLength,
                3
            );
            assert.strictEqual(
                OpenApiPropertyMapper.PRODUCER_CONTRACT.extractPropertyMetadata({ type: "string", minLength: 3 }, "code", true).minLength,
                3
            );
            assert.strictEqual(
                DataInferenceBuilder.PRODUCER_CONTRACT.extractPropertyMetadata("sample", "code", false).type,
                "string"
            );
        } finally {
            SchemaWalker.walk = origWalk;
        }
    });
});
