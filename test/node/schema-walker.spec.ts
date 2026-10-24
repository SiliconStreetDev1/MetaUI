/**
 * @file schema-walker.spec.ts
 * @description Direct unit tests for SchemaWalker (Stage 2): ordering, depth capping,
 * object and $ref cycles, diamonds, $ref resolution, skipHidden, arrays, empty objects, and null nodes.
 */

import assert from "node:assert/strict";
import { withLogCapture, reported } from "./fc-config";
import {
    SchemaWalker,
    ISchemaVisitContext,
    SchemaShape,
    RawRecordShape,
    LayoutElementShape,
    JsonPayloadShape
} from "../../src/nz/co/siliconst/ui5/metaui/core/SchemaWalker";
import { PluginRegistry } from "../../src/nz/co/siliconst/ui5/metaui/core/PluginRegistry";
import { DialogDelegate, IHostDialog } from "../../src/nz/co/siliconst/ui5/metaui/controls/host/delegates/DialogDelegate";
import { LayoutMutator } from "../../src/nz/co/siliconst/ui5/metaui/core/LayoutMutator";
import { LayoutDecisionTable, LayoutScorer } from "../../src/nz/co/siliconst/ui5/metaui/core/LayoutScorer";
import { TableRowHelper } from "../../src/nz/co/siliconst/ui5/metaui/layouts/TableRowHelper";
import { SchemaDirectiveNormalizer } from "../../src/nz/co/siliconst/ui5/metaui/core/SchemaDirectiveNormalizer";
import { DataInferenceBuilder } from "../../src/nz/co/siliconst/ui5/metaui/core/DataInferenceBuilder";
import { OpenApiConstraintMapper } from "../../src/nz/co/siliconst/ui5/metaui/openapi/parsers/OpenApiConstraintMapper";
import { SchemaNormalizer } from "../../src/nz/co/siliconst/ui5/metaui/core/SchemaNormalizer";
import { ISchema, IPropertyMetadata, ILayoutElement } from "../../src/nz/co/siliconst/ui5/metaui/interfaces/ISchema";
import { MAX_SCHEMA_DEPTH, MAX_LAYOUT_DEPTH } from "../../src/nz/co/siliconst/ui5/metaui/constants/MetaUIConstants";
import { Logger } from "../../src/nz/co/siliconst/ui5/metaui/utils/Logger";

describe("SchemaWalker — Stage 2 direct unit tests", () => {
    it("walks properties and nested objects in pre-order depth-first sequence with exact scope, bindingPath, depth, and parent", () => {
        const cityMeta: IPropertyMetadata = { type: "string" };
        const zipMeta: IPropertyMetadata = { type: "number" };
        const addressMeta: IPropertyMetadata = {
            type: "object",
            properties: {
                City: cityMeta,
                Zip: zipMeta
            }
        };
        const activeMeta: IPropertyMetadata = { type: "boolean" };
        const schema: ISchema = {
            type: "object",
            properties: {
                Address: addressMeta,
                Active: activeMeta
            }
        };

        const visited: Array<{
            key: string;
            scope: string;
            bindingPath: string;
            depth: number;
            parentKey: string | null;
            isArrayItem: boolean;
        }> = [];

        SchemaWalker.walk(schema, (ctx) => {
            visited.push({
                key: ctx.key,
                scope: ctx.scope,
                bindingPath: ctx.bindingPath,
                depth: ctx.depth,
                parentKey: ctx.parent === addressMeta ? "Address" : ctx.parent === null ? null : "other",
                isArrayItem: ctx.isArrayItem
            });
        });

        assert.deepEqual(visited, [
            {
                key: "Address",
                scope: "#/properties/Address",
                bindingPath: "Address",
                depth: 0,
                parentKey: null,
                isArrayItem: false
            },
            {
                key: "City",
                scope: "#/properties/Address/properties/City",
                bindingPath: "Address/City",
                depth: 1,
                parentKey: "Address",
                isArrayItem: false
            },
            {
                key: "Zip",
                scope: "#/properties/Address/properties/Zip",
                bindingPath: "Address/Zip",
                depth: 1,
                parentKey: "Address",
                isArrayItem: false
            },
            {
                key: "Active",
                scope: "#/properties/Active",
                bindingPath: "Active",
                depth: 0,
                parentKey: null,
                isArrayItem: false
            }
        ]);
    });

    it("honours 'skip-subtree' and 'stop' visitor return values", () => {
        const schema: ISchema = {
            type: "object",
            properties: {
                SkipMe: {
                    type: "object",
                    properties: {
                        Inner: { type: "string" }
                    }
                },
                KeepMe: {
                    type: "object",
                    properties: {
                        Child: { type: "string" }
                    }
                },
                AfterStop: { type: "boolean" }
            }
        };

        const scopes: string[] = [];
        SchemaWalker.walk(schema, (ctx) => {
            scopes.push(ctx.scope);
            if (ctx.key === "SkipMe") return "skip-subtree";
            if (ctx.key === "Child") return "stop";
        });

        assert.deepEqual(scopes, [
            "#/properties/SkipMe",
            "#/properties/KeepMe",
            "#/properties/KeepMe/properties/Child"
        ]);
    });

    it("enforces MAX_SCHEMA_DEPTH by default and custom maxDepth, invoking onTruncate(scope, 'depth') and logging a warning", () => {
        let rootProp: IPropertyMetadata = { type: "string" };
        for (let i = MAX_SCHEMA_DEPTH + 3; i >= 0; i--) {
            rootProp = {
                type: "object",
                properties: {
                    [`level${i}`]: rootProp
                }
            };
        }
        const deepSchema: ISchema = {
            type: "object",
            properties: {
                start: rootProp
            }
        };

        const truncations: Array<{ scope: string; reason: "depth" | "cycle" }> = [];
        const visitedDepths: number[] = [];

        const { entries } = withLogCapture(() => {
            SchemaWalker.walk(
                deepSchema,
                (ctx) => {
                    visitedDepths.push(ctx.depth);
                },
                {
                    onTruncate: (scope, reason) => {
                        truncations.push({ scope, reason });
                    }
                }
            );
        });

        assert.equal(Math.max(...visitedDepths), MAX_SCHEMA_DEPTH, "Must visit up to MAX_SCHEMA_DEPTH and no deeper");
        assert.equal(truncations.length, 1, "Must report exactly one truncation at the first level past MAX_SCHEMA_DEPTH");
        assert.equal(truncations[0].reason, "depth");
        assert.ok(reported(entries, String(MAX_SCHEMA_DEPTH)), "Must log a warning naming the depth limit");

        // Also test custom maxDepth = 1
        const customTruncations: Array<{ scope: string; reason: "depth" | "cycle" }> = [];
        const customScopes: string[] = [];
        SchemaWalker.walk(
            deepSchema,
            (ctx) => {
                customScopes.push(ctx.scope);
            },
            {
                maxDepth: 1,
                onTruncate: (scope, reason) => customTruncations.push({ scope, reason })
            }
        );
        assert.deepEqual(customScopes, ["#/properties/start", "#/properties/start/properties/level0"]);
        assert.deepEqual(customTruncations, [
            { scope: "#/properties/start/properties/level0/properties/level1", reason: "depth" }
        ]);
    });

    it("cuts in-memory object cycles and $ref cycles at their first repetition with reason 'cycle'", () => {
        const nodeA: IPropertyMetadata = { type: "object", properties: { label: { type: "string" } } };
        const nodeB: IPropertyMetadata = { type: "object", properties: { backToA: nodeA } };
        nodeA.properties!.toB = nodeB;

        const memSchema: ISchema = {
            type: "object",
            properties: {
                entry: nodeA
            }
        };

        const memTruncations: Array<{ scope: string; reason: "depth" | "cycle" }> = [];
        const memScopes: string[] = [];
        const { entries: memLogs } = withLogCapture(() => {
            SchemaWalker.walk(
                memSchema,
                (ctx) => {
                    memScopes.push(ctx.scope);
                },
                {
                    onTruncate: (scope, reason) => memTruncations.push({ scope, reason })
                }
            );
        });

        assert.deepEqual(memScopes, [
            "#/properties/entry",
            "#/properties/entry/properties/label",
            "#/properties/entry/properties/toB"
        ]);
        assert.deepEqual(memTruncations, [
            { scope: "#/properties/entry/properties/toB/properties/backToA", reason: "cycle" }
        ]);
        assert.ok(reported(memLogs, "#/properties/entry/properties/toB/properties/backToA"));

        // $ref cycle: A -> B -> A and chained $ref-only definitions
        const refSchema: ISchema = {
            type: "object",
            definitions: {
                A: {
                    type: "object",
                    properties: {
                        b: { $ref: "#/definitions/B" }
                    }
                },
                B: {
                    type: "object",
                    properties: {
                        a: { $ref: "#/definitions/A" }
                    }
                },
                Alias1: { $ref: "#/definitions/Alias2" } as unknown as ISchema,
                Alias2: { $ref: "#/definitions/Alias1" } as unknown as ISchema
            },
            properties: {
                start: { $ref: "#/definitions/A" },
                aliasLoop: { $ref: "#/definitions/Alias1" }
            }
        };

        const refTruncations: Array<{ scope: string; reason: "depth" | "cycle" }> = [];
        const refScopes: string[] = [];
        SchemaWalker.walk(
            refSchema,
            (ctx) => {
                refScopes.push(ctx.scope);
            },
            {
                onTruncate: (scope, reason) => refTruncations.push({ scope, reason })
            }
        );

        assert.deepEqual(refScopes, [
            "#/properties/start",
            "#/properties/start/properties/b"
        ]);
        assert.deepEqual(refTruncations, [
            { scope: "#/properties/start/properties/b/properties/a", reason: "cycle" },
            { scope: "#/properties/aliasLoop", reason: "cycle" }
        ]);
    });

    it("preserves diamond $ref and diamond in-memory objects across sibling branches, including a diamond target that also participates in a cycle", () => {
        const sharedLeaf: IPropertyMetadata = { type: "string", minLength: 2 };
        const diamondSchema: ISchema = {
            type: "object",
            definitions: {
                SharedNode: {
                    type: "object",
                    properties: {
                        code: sharedLeaf,
                        selfRef: { $ref: "#/definitions/SharedNode" }
                    }
                }
            },
            properties: {
                left: { $ref: "#/definitions/SharedNode" },
                right: { $ref: "#/definitions/SharedNode" }
            }
        };

        const visitedScopes: string[] = [];
        const truncations: Array<{ scope: string; reason: "depth" | "cycle" }> = [];
        SchemaWalker.walk(
            diamondSchema,
            (ctx) => {
                visitedScopes.push(ctx.scope);
            },
            {
                onTruncate: (scope, reason) => truncations.push({ scope, reason })
            }
        );

        assert.deepEqual(visitedScopes, [
            "#/properties/left",
            "#/properties/left/properties/code",
            "#/properties/right",
            "#/properties/right/properties/code"
        ]);
        assert.deepEqual(truncations, [
            { scope: "#/properties/left/properties/selfRef", reason: "cycle" },
            { scope: "#/properties/right/properties/selfRef", reason: "cycle" }
        ]);
    });

    it("resolves $ref through OpenApiRefResolver (including RFC 6901 escaped keys and chained refs) and honours skipHidden", () => {
        const schema: ISchema = {
            type: "object",
            definitions: {
                "Order/Item": {
                    type: "object",
                    properties: {
                        VisibleField: { type: "string" },
                        HiddenField: { type: "string", ui: { visible: false } }
                    }
                },
                HiddenDef: {
                    type: "object",
                    ui: { visible: false },
                    properties: {
                        Secret: { type: "string" }
                    }
                }
            },
            properties: {
                line: { $ref: "#/definitions/Order~1Item", title: "Local Line" },
                hiddenByDef: { $ref: "#/definitions/HiddenDef" },
                hiddenDirectly: {
                    type: "object",
                    ui: { visible: false },
                    properties: {
                        NeverSeen: { type: "number" }
                    }
                }
            }
        };

        const visibleContexts: ISchemaVisitContext[] = [];
        SchemaWalker.walk(
            schema,
            (ctx) => {
                visibleContexts.push(ctx);
            },
            { skipHidden: true }
        );

        assert.deepEqual(
            visibleContexts.map((c) => c.scope),
            ["#/properties/line", "#/properties/line/properties/VisibleField"]
        );
        assert.equal(visibleContexts[0].node.title, "Local Line");
        assert.equal(visibleContexts[0].rawNode.$ref, "#/definitions/Order~1Item");
    });

    it("walks array items (single schema, nested array of arrays, tuple items, and root array) and distinguishes #/items from #/properties/items", () => {
        const rootArraySchema: ISchema = {
            type: "array",
            properties: {
                items: { type: "string" }
            },
            items: {
                type: "array",
                items: {
                    type: "object",
                    properties: {
                        Sku: { type: "string" }
                    }
                }
            }
        };

        const records: Array<{ key: string; scope: string; bindingPath: string; isArrayItem: boolean }> = [];
        SchemaWalker.walk(rootArraySchema, (ctx) => {
            records.push({
                key: ctx.key,
                scope: ctx.scope,
                bindingPath: ctx.bindingPath,
                isArrayItem: ctx.isArrayItem
            });
        });

        assert.deepEqual(records, [
            { key: "items", scope: "#/properties/items", bindingPath: "items", isArrayItem: false },
            { key: "items", scope: "#/items", bindingPath: "items", isArrayItem: true },
            { key: "items", scope: "#/items/items", bindingPath: "items/items", isArrayItem: true },
            {
                key: "Sku",
                scope: "#/items/items/properties/Sku",
                bindingPath: "items/items/Sku",
                isArrayItem: false
            }
        ]);
        // Notice bindingPath is "items" for both the property named "items" and root array items,
        // while scope uniquely distinguishes "#/properties/items" from "#/items".
        assert.equal(records[0].bindingPath, records[1].bindingPath);
        assert.notEqual(records[0].scope, records[1].scope);
    });

    it("handles empty objects, null/undefined schemas, and null property entries without throwing", () => {
        const visited: string[] = [];
        SchemaWalker.walk(null, (ctx) => {
            visited.push(ctx.scope);
        });
        SchemaWalker.walk(undefined, (ctx) => {
            visited.push(ctx.scope);
        });
        SchemaWalker.walk({ type: "object", properties: {} }, (ctx) => {
            visited.push(ctx.scope);
        });
        SchemaWalker.walk(
            {
                type: "object",
                properties: {
                    badNull: null as unknown as IPropertyMetadata,
                    valid: { type: "string" }
                }
            },
            (ctx) => {
                visited.push(ctx.scope);
            }
        );

        assert.deepEqual(visited, ["#/properties/valid"]);
    });

    it("supports tuple items, visitRoot, visitCombinators, onLeave, custom resolveRef, resolveRefs:false, and toBindingPath", () => {
        const tupleAndCombSchema: ISchema = {
            type: "object",
            properties: {
                tupleArr: {
                    type: "array",
                    items: [{ type: "string" }, null as unknown as IPropertyMetadata, { type: "number" }] as unknown as IPropertyMetadata
                },
                combField: {
                    type: "string",
                    not: { type: "number" },
                    oneOf: [{ type: "string", minLength: 1 }, null as unknown as IPropertyMetadata],
                    anyOf: [{ type: "string", maxLength: 5 }],
                    allOf: [{ type: "string" }]
                }
            }
        };

        const enterOrder: string[] = [];
        const leaveOrder: string[] = [];
        SchemaWalker.walk(
            tupleAndCombSchema,
            (ctx) => {
                enterOrder.push(ctx.scope);
            },
            {
                visitRoot: true,
                visitCombinators: true,
                onLeave: (ctx) => {
                    leaveOrder.push(ctx.scope);
                }
            }
        );

        assert.deepEqual(enterOrder, [
            "#",
            "#/properties/tupleArr",
            "#/properties/tupleArr/items/0",
            "#/properties/tupleArr/items/2",
            "#/properties/combField",
            "#/properties/combField/not",
            "#/properties/combField/oneOf/0",
            "#/properties/combField/anyOf/0",
            "#/properties/combField/allOf/0"
        ]);
        assert.equal(leaveOrder[leaveOrder.length - 1], "#", "Root must be the last node to leave in post-order");

        // Custom resolveRef and resolveRefs: false
        const refSchema: ISchema = {
            type: "object",
            properties: {
                custom: { $ref: "urn:custom:Target" }
            }
        };
        const rawVisited: ISchemaVisitContext[] = [];
        SchemaWalker.walk(refSchema, (ctx) => { rawVisited.push(ctx); }, { resolveRefs: false });
        assert.equal(rawVisited[0].node.$ref, "urn:custom:Target");

        const customResolved: ISchemaVisitContext[] = [];
        SchemaWalker.walk(
            refSchema,
            (ctx) => { customResolved.push(ctx); },
            {
                resolveRef: (r) => (r === "urn:custom:Target" ? { type: "boolean", title: "FromCustomResolver" } : undefined)
            }
        );
        assert.equal(customResolved[0].node.type, "boolean");
        assert.equal(customResolved[0].node.title, "FromCustomResolver");

        assert.equal(SchemaWalker.toBindingPath("#/properties/A/properties/B"), "A/B");
        assert.equal(SchemaWalker.toBindingPath("#/items"), "items");
        assert.equal(SchemaWalker.toBindingPath("#"), "");
        assert.equal(SchemaWalker.toBindingPath("prefix#/properties/A"), "prefix#/A");
    });

    it("covers resolveScope edge cases, stop propagation across all sub-walk branches, shouldVisitChild, and activeNodes vs activeRefs cycles", () => {
        // 1. resolveScope edge cases and warning tags
        assert.deepEqual(SchemaWalker.resolveScope({ type: "object" }, ""), {
            meta: undefined,
            bindingPath: "",
            propKey: ""
        });
        assert.deepEqual(SchemaWalker.resolveScope({ type: "object" }, "#/items/0"), {
            meta: undefined,
            bindingPath: "#/items/0",
            propKey: "#/items/0"
        });

        const warnLogs: Array<{ msg: string; details?: unknown; component?: string }> = [];
        const origWarn = Logger.warn;
        Logger.warn = (msg: string, details?: unknown, component?: string) => {
            warnLogs.push({ msg, details, component });
        };
        try {
            // Root cycle: property points to root schema itself
            const rootCycleSchema: ISchema = { type: "object", properties: {} };
            rootCycleSchema.properties!.selfRoot = rootCycleSchema as unknown as IPropertyMetadata;
            const resRootCycle = SchemaWalker.resolveScope(rootCycleSchema, "#/properties/selfRoot");
            assert.deepEqual(resRootCycle, { meta: undefined, bindingPath: "selfRoot", propKey: "selfRoot" });
            assert.equal(warnLogs[warnLogs.length - 1].component, "SchemaNormalizer");

            // External activeNodes hit
            const extNode: IPropertyMetadata = { type: "string" };
            const extSchema: ISchema = { type: "object", properties: { ext: extNode } };
            const resExtNode = SchemaWalker.resolveScope(
                extSchema,
                "#/properties/ext",
                undefined,
                new WeakSet<object>([extNode])
            );
            assert.deepEqual(resExtNode, { meta: undefined, bindingPath: "ext", propKey: "ext" });

            // Cyclic $ref in resolveScope (pathRefs and external activeRefs)
            const refCycleSchema: ISchema = {
                type: "object",
                definitions: {
                    LoopDef: {
                        type: "object",
                        properties: {
                            again: { $ref: "#/definitions/LoopDef" }
                        }
                    }
                },
                properties: {
                    first: { $ref: "#/definitions/LoopDef" }
                }
            };
            const resRefCycle = SchemaWalker.resolveScope(
                refCycleSchema,
                "#/properties/first/properties/again/properties/again"
            );
            assert.deepEqual(resRefCycle, {
                meta: undefined,
                bindingPath: "first/again/again",
                propKey: "first/properties/again/properties/again"
            });
            assert.equal(warnLogs[warnLogs.length - 1].component, "SchemaNormalizer");

            const resExtRef = SchemaWalker.resolveScope(
                refCycleSchema,
                "#/properties/first",
                undefined,
                undefined,
                new Set<string>(["#/definitions/LoopDef"])
            );
            assert.deepEqual(resExtRef, { meta: undefined, bindingPath: "first", propKey: "first" });

            // 2. visitRoot context fields, baseBindingPath, explicit options.definitions
            const rootCtxs: ISchemaVisitContext[] = [];
            SchemaWalker.walk(
                {
                    type: "object",
                    properties: {
                        fromOptDef: { $ref: "#/definitions/OptTarget" }
                    }
                },
                (ctx) => {
                    rootCtxs.push(ctx);
                },
                {
                    visitRoot: true,
                    baseScope: "#/root",
                    baseBindingPath: "basePath",
                    definitions: {
                        OptTarget: { type: "number", minimum: 10 }
                    }
                }
            );
            assert.equal(rootCtxs.length, 2);
            assert.equal(rootCtxs[0].key, "");
            assert.equal(rootCtxs[0].isArrayItem, false);
            assert.equal(rootCtxs[0].bindingPath, "basePath");
            assert.equal(rootCtxs[1].bindingPath, "basePath/fromOptDef");
            assert.equal(rootCtxs[1].node.minimum, 10);

            // 3. shouldVisitChild for properties, single items, and tuple items
            const childFilterChecks: Array<{ key: string; isArrayItem: boolean }> = [];
            const filteredScopes: string[] = [];
            SchemaWalker.walk(
                {
                    type: "object",
                    properties: {
                        keepProp: {
                            type: "array",
                            items: { type: "string" }
                        },
                        skipProp: { type: "string" },
                        tupleProp: {
                            type: "array",
                            items: [{ type: "string" }, { type: "number" }] as unknown as IPropertyMetadata
                        }
                    }
                },
                (ctx) => {
                    filteredScopes.push(ctx.scope);
                },
                {
                    shouldVisitChild: (_child, key, _parent, isArrayItem) => {
                        childFilterChecks.push({ key, isArrayItem });
                        return key !== "skipProp" && key !== "1";
                    }
                }
            );
            assert.deepEqual(filteredScopes, [
                "#/properties/keepProp",
                "#/properties/keepProp/items",
                "#/properties/tupleProp",
                "#/properties/tupleProp/items/0"
            ]);
            assert.ok(childFilterChecks.some((c) => c.key === "items" && c.isArrayItem === true));
            assert.ok(childFilterChecks.some((c) => c.key === "0" && c.isArrayItem === true));
            assert.ok(childFilterChecks.some((c) => c.key === "skipProp" && c.isArrayItem === false));

            // 4. visitAdditionalProperties (without visitCombinators) and early "stop" across branches
            const apCtxs: ISchemaVisitContext[] = [];
            SchemaWalker.walk(
                {
                    type: "object",
                    not: { type: "string" },
                    additionalProperties: {
                        type: "object",
                        additionalProperties: { type: "boolean" }
                    },
                    oneOf: [{ type: "number" }]
                },
                (ctx) => {
                    apCtxs.push(ctx);
                    if (ctx.bindingPath === "additionalProperties/additionalProperties") {
                        return "stop";
                    }
                },
                { visitAdditionalProperties: true }
            );
            assert.deepEqual(
                apCtxs.map((c) => ({ key: c.key, bindingPath: c.bindingPath, isArrayItem: c.isArrayItem })),
                [
                    { key: "additionalProperties", bindingPath: "additionalProperties", isArrayItem: false },
                    { key: "additionalProperties", bindingPath: "additionalProperties/additionalProperties", isArrayItem: false }
                ]
            );

            // Stop inside root tuple items, single items, not, and root oneOf
            const tupleStop: Array<{ bindingPath: string; isArrayItem: boolean }> = [];
            SchemaWalker.walk(
                {
                    type: "array",
                    items: [{ type: "string" }, { type: "number" }] as unknown as IPropertyMetadata
                },
                (ctx) => {
                    tupleStop.push({ bindingPath: ctx.bindingPath, isArrayItem: ctx.isArrayItem });
                    return "stop";
                }
            );
            assert.deepEqual(tupleStop, [{ bindingPath: "items/0", isArrayItem: true }]);

            const nestedTupleStop: string[] = [];
            SchemaWalker.walk(
                {
                    type: "object",
                    properties: {
                        arr: {
                            type: "array",
                            items: [{ type: "string" }, { type: "number" }] as unknown as IPropertyMetadata
                        },
                        afterArr: { type: "boolean" }
                    }
                },
                (ctx) => {
                    nestedTupleStop.push(ctx.bindingPath);
                    if (ctx.bindingPath === "arr/items/0") {
                        return "stop";
                    }
                }
            );
            assert.deepEqual(nestedTupleStop, ["arr", "arr/items/0"]);

            const singleItemStop: string[] = [];
            SchemaWalker.walk(
                {
                    type: "array",
                    items: { type: "string" },
                    not: { type: "number" }
                },
                (ctx) => {
                    singleItemStop.push(ctx.bindingPath);
                    if (ctx.bindingPath === "items") {
                        return "stop";
                    }
                },
                { visitCombinators: true }
            );
            assert.deepEqual(singleItemStop, ["items"]);

            const notStop: Array<{ bindingPath: string; isArrayItem: boolean }> = [];
            SchemaWalker.walk(
                {
                    type: "object",
                    properties: {
                        holder: {
                            type: "string",
                            not: { type: "number" },
                            oneOf: [{ type: "string" }]
                        }
                    }
                },
                (ctx) => {
                    notStop.push({ bindingPath: ctx.bindingPath, isArrayItem: ctx.isArrayItem });
                    if (ctx.bindingPath === "holder/not") {
                        return "stop";
                    }
                },
                { visitCombinators: true }
            );
            assert.deepEqual(notStop, [
                { bindingPath: "holder", isArrayItem: false },
                { bindingPath: "holder/not", isArrayItem: false }
            ]);

            const oneOfStop: Array<{ bindingPath: string; isArrayItem: boolean }> = [];
            SchemaWalker.walk(
                {
                    type: "object",
                    oneOf: [{ type: "string" }, { type: "number" }],
                    anyOf: [{ type: "boolean" }]
                },
                (ctx) => {
                    oneOfStop.push({ bindingPath: ctx.bindingPath, isArrayItem: ctx.isArrayItem });
                    if (ctx.bindingPath === "oneOf/0") {
                        return "stop";
                    }
                },
                { visitCombinators: true }
            );
            assert.deepEqual(oneOfStop, [{ bindingPath: "oneOf/0", isArrayItem: false }]);

            const nestedOneOfStop: string[] = [];
            SchemaWalker.walk(
                {
                    type: "object",
                    properties: {
                        poly: {
                            type: "object",
                            oneOf: [{ type: "string" }, { type: "number" }]
                        },
                        afterPoly: { type: "boolean" }
                    }
                },
                (ctx) => {
                    nestedOneOfStop.push(ctx.bindingPath);
                    if (ctx.bindingPath === "poly/oneOf/0") {
                        return "stop";
                    }
                },
                { visitCombinators: true }
            );
            assert.deepEqual(nestedOneOfStop, ["poly", "poly/oneOf/0"]);

            // 5. Distinct activeRefs cycle (fresh target objects) vs activeNodes cycle ($ref resolving to root)
            const freshRefTruncations: string[] = [];
            SchemaWalker.walk(
                {
                    type: "object",
                    properties: {
                        freshLoop: { $ref: "urn:fresh:A" }
                    }
                },
                () => {},
                {
                    resolveRef: () => ({ $ref: "urn:fresh:A" }),
                    onTruncate: (s, r) => freshRefTruncations.push(`${s}:${r}`)
                }
            );
            assert.deepEqual(freshRefTruncations, ["#/properties/freshLoop:cycle"]);

            const rootTargetSchema: ISchema = {
                type: "object",
                properties: {
                    pointsToRoot: { $ref: "urn:root:Self" }
                }
            };
            const rootTargetTruncations: string[] = [];
            SchemaWalker.walk(
                rootTargetSchema,
                () => {},
                {
                    resolveRef: () => rootTargetSchema,
                    onTruncate: (s, r) => rootTargetTruncations.push(`${s}:${r}`)
                }
            );
            assert.deepEqual(rootTargetTruncations, ["#/properties/pointsToRoot:cycle"]);

            // 6. Calling SchemaWalker.walk without options when cycle and depth truncation occur
            warnLogs.length = 0;
            const bareCycle: ISchema = { type: "object", properties: {} };
            bareCycle.properties!.self = bareCycle as unknown as IPropertyMetadata;
            SchemaWalker.walk(bareCycle, () => {});
            assert.ok(
                warnLogs.some(
                    (w) => w.component === "SchemaWalker" && w.msg.includes("Circular schema reference detected")
                )
            );
        } finally {
            Logger.warn = origWarn;
        }
    });

    it("Stage A: PluginRegistry.getPathsToLoad cuts in-memory cycles and enforces depth caps while preserving diamonds", () => {
        const registry = PluginRegistry.getInstance();

        // 1. Exact Stage A repro from docs/PHASE_WalkerFollowUp.md: cyclic node <-> b
        const node = { type: "object", properties: {} } as IPropertyMetadata;
        const b = { type: "object", properties: { backToA: node, count: { type: "number" } } } as IPropertyMetadata;
        (node.properties as Record<string, IPropertyMetadata>)["toB"] = b;
        const cyclicSchema = { type: "object", properties: { root: node } } as unknown as ISchema;

        const { value: cyclicPaths, entries: cycleLogs } = withLogCapture(() =>
            registry.getPathsToLoad(cyclicSchema)
        );
        assert.ok(cyclicPaths.has("nz/co/siliconst/ui5/metaui/plugins/controls/NumberPlugin"));
        assert.ok(
            reported(cycleLogs, "Circular schema reference detected"),
            "Must log a cycle truncation warning when cutting the cycle in getPathsToLoad"
        );

        // 2. Diamond preservation: shared object referenced from two branches must preload plugins on both paths
        const sharedLeaf: IPropertyMetadata = {
            type: "object",
            properties: {
                onlyInShared: { type: "boolean" }
            }
        };
        const diamondSchema: ISchema = {
            type: "object",
            properties: {
                firstRef: sharedLeaf,
                secondRef: {
                    type: "object",
                    properties: {
                        nestedShared: sharedLeaf,
                        afterDiamond: { type: "date" }
                    }
                }
            }
        };
        const { value: diamondPaths, entries: diamondLogs } = withLogCapture(() =>
            registry.getPathsToLoad(diamondSchema)
        );
        assert.ok(diamondPaths.has("nz/co/siliconst/ui5/metaui/plugins/controls/BooleanPlugin"));
        assert.ok(diamondPaths.has("nz/co/siliconst/ui5/metaui/plugins/controls/DatePlugin"));
        assert.equal(
            reported(diamondLogs, "Circular schema reference detected"),
            false,
            "Genuine diamond must not be reported as a cycle"
        );

        // 3. Depth cap: chain deeper than MAX_SCHEMA_DEPTH must truncate with a warning and omit deeper plugins
        let deepProp: IPropertyMetadata = { type: "date" };
        for (let i = MAX_SCHEMA_DEPTH + 3; i >= 0; i--) {
            deepProp = {
                type: "object",
                properties: {
                    [`lv${i}`]: deepProp
                }
            };
        }
        const deepSchema: ISchema = {
            type: "object",
            properties: {
                start: deepProp
            }
        };
        const { value: deepPaths, entries: deepLogs } = withLogCapture(() =>
            registry.getPathsToLoad(deepSchema)
        );
        assert.equal(
            deepPaths.has("nz/co/siliconst/ui5/metaui/plugins/controls/DatePlugin"),
            false,
            "Leaf beyond MAX_SCHEMA_DEPTH must be truncated"
        );
        assert.ok(
            reported(deepLogs, String(MAX_SCHEMA_DEPTH)),
            "Depth truncation in getPathsToLoad must log MAX_SCHEMA_DEPTH"
        );

        // 4. Cyclic and overly deep uiLayout elements in getPathsToLoad
        const cyclicGroup: ILayoutElement = { type: "Group", elements: [] };
        cyclicGroup.elements!.push(cyclicGroup, {
            type: "Control",
            scope: "#/properties/code",
            widget: "textArea"
        });
        let deepLayout: ILayoutElement[] = [
            { type: "Control", scope: "#/properties/code", widget: "password" }
        ];
        for (let i = 0; i <= MAX_LAYOUT_DEPTH + 2; i++) {
            deepLayout = [{ type: "Group", elements: deepLayout }];
        }
        const layoutSchema: ISchema = {
            type: "object",
            properties: {
                code: { type: "string" }
            },
            uiLayout: [cyclicGroup, ...deepLayout]
        };
        const { value: layoutPaths, entries: layoutLogs } = withLogCapture(() =>
            registry.getPathsToLoad(layoutSchema)
        );
        assert.ok(layoutPaths.has("nz/co/siliconst/ui5/metaui/plugins/controls/TextAreaPlugin"));
        assert.equal(layoutPaths.has("nz/co/siliconst/ui5/metaui/plugins/controls/PasswordPlugin"), false);
        assert.ok(reported(layoutLogs, String(MAX_LAYOUT_DEPTH)));
    });

    it("Stage B: walkers surfaced by widened [SINGLE_WALKER] cut cycles and enforce depth caps while preserving diamonds", () => {
        // 1. LayoutMutator.cascadeReadOnly & expandElements on cyclic object and cyclic uiLayout
        const cycNode: IPropertyMetadata = {
            type: "object",
            readOnly: true,
            ui: { readOnly: true },
            properties: {
                leaf: { type: "string" }
            }
        };
        cycNode.properties!.self = cycNode;
        const cycGroup: ILayoutElement = { type: "Group", elements: [] };
        cycGroup.elements!.push(cycGroup, { type: "Control", scope: "#/properties/rootObj/properties/leaf" });
        const mutSchema: ISchema = {
            type: "object",
            properties: { rootObj: cycNode },
            uiLayout: [cycGroup]
        };
        const decisions: LayoutDecisionTable = new Map([
            [
                "#/properties/rootObj",
                {
                    scope: "#/properties/rootObj",
                    bindingPath: "rootObj",
                    renderMode: "inline",
                    score: 1,
                    cascadeReadOnly: true
                }
            ]
        ]);
        const { entries: mutLogs } = withLogCapture(() => {
            LayoutMutator.apply(mutSchema, decisions);
        });
        assert.equal(cycNode.properties!.leaf.readOnly, true);
        assert.equal(cycNode.properties!.leaf.ui?.readOnly, true);
        assert.ok(reported(mutLogs, "Circular"));

        // 2. TableRowHelper.createSkeleton on cyclic and diamond object schemas
        const sharedSub: IPropertyMetadata = {
            type: "object",
            properties: {
                code: { type: "string", default: "D1" }
            }
        };
        const cycRowMeta: IPropertyMetadata = {
            type: "object",
            properties: {
                left: sharedSub,
                right: sharedSub,
                qty: { type: "number" }
            }
        };
        cycRowMeta.properties!.loop = cycRowMeta;
        const { value: skeleton, entries: skelLogs } = withLogCapture(() =>
            TableRowHelper.createSkeleton(cycRowMeta)
        );
        assert.deepEqual(skeleton, {
            left: { code: "D1" },
            right: { code: "D1" },
            qty: 0,
            loop: {}
        });
        assert.ok(reported(skelLogs, "Circular"));

        // 3. DialogDelegate.calculateOptimalDialogWidth on deep / cyclic schema
        const dlgDelegate = new DialogDelegate({
            generate: () => {},
            triggerSubmit: () => true,
            fireEvent: () => {}
        } as IHostDialog) as unknown as {
            calculateOptimalDialogWidth(schema: ISchema | null): string;
        };
        let deepWide: IPropertyMetadata = { type: "string", ui: { fullWidth: true } };
        for (let i = MAX_SCHEMA_DEPTH + 3; i >= 0; i--) {
            deepWide = { type: "object", properties: { [`lv${i}`]: deepWide } };
        }
        const { value: widthRes, entries: dlgLogs } = withLogCapture(() =>
            dlgDelegate.calculateOptimalDialogWidth({ type: "object", properties: { top: deepWide } })
        );
        assert.equal(widthRes, "auto", "fullWidth beyond MAX_SCHEMA_DEPTH must be truncated");
        assert.ok(reported(dlgLogs, String(MAX_SCHEMA_DEPTH)));

        // 4. SchemaDirectiveNormalizer.normalizeLayout on cyclic and overly deep uiLayout
        const rawCyclicEl: Record<string, unknown> = { type: "Group", label: "G", elements: [] };
        (rawCyclicEl.elements as unknown[]).push(rawCyclicEl, { type: "Control", scope: "#/properties/a" });
        const { value: normLayout, entries: normLayoutLogs } = withLogCapture(() =>
            SchemaDirectiveNormalizer.normalizeLayout([rawCyclicEl])
        );
        assert.equal(normLayout?.length, 1);
        assert.equal(normLayout?.[0].elements?.length, 1);
        assert.ok(reported(normLayoutLogs, "Circular"));

        // 5. DataInferenceBuilder.mergeInferredProperties & mergeHybridProperties on cyclic property maps
        const mapA: Record<string, IPropertyMetadata> = {};
        const propA: IPropertyMetadata = { type: "object", properties: mapA };
        mapA.self = propA;
        const mapB: Record<string, IPropertyMetadata> = {};
        const propB: IPropertyMetadata = { type: "object", properties: mapB };
        mapB.self = propB;
        mapB.extra = { type: "boolean" };
        const { value: mergedInf, entries: infLogs } = withLogCapture(() =>
            DataInferenceBuilder.mergeInferredProperties(mapA, mapB)
        );
        assert.equal(mergedInf.extra.type, "boolean");
        assert.ok(reported(infLogs, "Circular"));

        const { value: mergedHyb, entries: hybLogs } = withLogCapture(() =>
            DataInferenceBuilder.mergeHybridProperties(
                mapA as unknown as Record<string, unknown>,
                mapB as unknown as Record<string, unknown>
            )
        );
        assert.ok(mergedHyb.extra);
        assert.ok(reported(hybLogs, "Circular"));

        // 6. OpenApiConstraintMapper.deepMergeSchemas on cyclic property maps
        const targetSchema: Record<string, unknown> = { type: "object", properties: {} };
        (targetSchema.properties as Record<string, unknown>).self = targetSchema;
        const sourceSchema: Record<string, unknown> = {
            type: "object",
            properties: { self: null, added: { type: "number" } }
        };
        (sourceSchema.properties as Record<string, unknown>).self = sourceSchema;
        const { value: mergedSchema, entries: mergeLogs } = withLogCapture(() =>
            OpenApiConstraintMapper.deepMergeSchemas(targetSchema, sourceSchema)
        );
        assert.ok(mergedSchema);
        assert.ok(reported(mergeLogs, "Circular"));

        // 7. SchemaNormalizer.normalize on cyclic nested definitions
        const cycDef: Record<string, unknown> = {
            type: "object",
            properties: { name: { type: "string" } },
            definitions: {}
        };
        (cycDef.definitions as Record<string, unknown>).SelfDef = cycDef;
        const { value: normSchema, entries: normDefLogs } = withLogCapture(() =>
            SchemaNormalizer.normalize({
                type: "object",
                properties: { field: { type: "string" } },
                definitions: { SelfDef: cycDef }
            })
        );
        assert.ok(normSchema.definitions?.SelfDef);
        assert.ok(reported(normDefLogs, "Circular"));
    });

    it("Stage E.1: readOnly and ui.readOnly descend into array items and nested item properties", () => {
        const refSchema = SchemaNormalizer.normalize({
            type: "object",
            properties: {
                Tags: { $ref: "#/definitions/Tags", ui: { readOnly: true, enabled: false } },
                DirectList: {
                    type: "array",
                    ui: { readOnly: true },
                    items: {
                        type: "object",
                        properties: {
                            Sku: { type: "string" }
                        }
                    }
                },
                LockedGroup: {
                    type: "object",
                    readOnly: true,
                    properties: {
                        NestedTags: {
                            type: "array",
                            items: { type: "string" }
                        }
                    }
                }
            }
        });
        const refDefs = {
            Tags: SchemaNormalizer.normalizeDefinition({ type: "array", items: { type: "string" } }, "Tags")
        };

        LayoutMutator.apply(refSchema, LayoutScorer.apply(refSchema, 50, refDefs));

        assert.strictEqual(refSchema.properties?.Tags.readOnly, true);
        assert.strictEqual(refSchema.properties?.Tags.ui?.readOnly, true);
        assert.strictEqual(
            refSchema.properties?.Tags.items?.readOnly,
            true,
            "Tags.ui.readOnly must descend onto Tags.items.readOnly"
        );
        assert.strictEqual(
            refSchema.properties?.Tags.items?.ui?.readOnly,
            true,
            "Tags.ui.readOnly must descend onto Tags.items.ui.readOnly"
        );

        assert.strictEqual(refSchema.properties?.DirectList.readOnly, true);
        assert.strictEqual(refSchema.properties?.DirectList.items?.readOnly, true);
        assert.strictEqual(refSchema.properties?.DirectList.items?.ui?.readOnly, true);
        assert.strictEqual(refSchema.properties?.DirectList.items?.properties?.Sku.readOnly, true);
        assert.strictEqual(refSchema.properties?.DirectList.items?.properties?.Sku.ui?.readOnly, true);

        assert.strictEqual(refSchema.properties?.LockedGroup.properties?.NestedTags.readOnly, true);
        assert.strictEqual(refSchema.properties?.LockedGroup.properties?.NestedTags.items?.readOnly, true);
        assert.strictEqual(refSchema.properties?.LockedGroup.properties?.NestedTags.items?.ui?.readOnly, true);
    });

    it("TraversalPrimitive §3.1: supports pluggable ITreeShape (SchemaShape, RawRecordShape, LayoutElementShape, JsonPayloadShape) and resolveDynamicChildren", () => {
        // 1. LayoutElementShape over root array and nested elements with MAX_LAYOUT_DEPTH default and cycle detection
        const cyclicLayout: ILayoutElement = { type: "Group", label: "RootGroup", elements: [] };
        const controlLeaf: ILayoutElement = { type: "Control", scope: "#/properties/Name" };
        cyclicLayout.elements!.push(cyclicLayout, controlLeaf);

        const layoutScopes: string[] = [];
        const layoutLeaves: string[] = [];
        const layoutTruncations: Array<{ scope: string; reason: "depth" | "cycle" }> = [];
        SchemaWalker.walk<ILayoutElement>(
            [cyclicLayout],
            (ctx) => {
                layoutScopes.push(`${ctx.kind}:${ctx.scope}:${ctx.node.type}`);
            },
            {
                shape: LayoutElementShape,
                onLeave: (ctx) => layoutLeaves.push(ctx.scope),
                onTruncate: (scope, reason) => layoutTruncations.push({ scope, reason })
            }
        );
        assert.deepEqual(layoutScopes, [
            "element:#/elements/0:Group",
            "element:#/elements/0/elements/1:Control"
        ]);
        assert.deepEqual(layoutLeaves, ["#/elements/0/elements/1", "#/elements/0"]);
        assert.deepEqual(layoutTruncations, [{ scope: "#/elements/0/elements/0", reason: "cycle" }]);

        // 2. resolveDynamicChildren synthesizes children during LayoutElementShape walk
        const expandedScopes: string[] = [];
        SchemaWalker.walk<ILayoutElement>(
            [{ type: "Control", scope: "#/properties/Addr" }],
            (ctx) => {
                expandedScopes.push(ctx.node.scope || ctx.node.type);
            },
            {
                shape: LayoutElementShape,
                resolveDynamicChildren: (node) => {
                    if (node.scope === "#/properties/Addr") {
                        return [
                            {
                                key: "0",
                                node: { type: "Control", scope: "#/properties/Addr/properties/City" },
                                kind: "element",
                                scopeSegment: "elements/0",
                                bindingSegment: "0"
                            }
                        ];
                    }
                    return undefined;
                }
            }
        );
        assert.deepEqual(expandedScopes, ["#/properties/Addr", "#/properties/Addr/properties/City"]);

        // 3. RawRecordShape with visitDefinitions, visitCombinators, and invalid property callback
        const rawDoc: Record<string, unknown> = {
            type: "object",
            definitions: {
                DefA: { type: "string" }
            },
            $defs: {
                DefB: { type: "number" }
            },
            properties: {
                validProp: {
                    type: "array",
                    items: { type: "boolean" },
                    oneOf: [{ type: "boolean" }],
                    not: { type: "null" },
                    additionalProperties: { type: "string" }
                },
                invalidProp: 42
            }
        };
        const rawVisited: Array<{ scope: string; kind: string; branchKeyword?: string }> = [];
        const invalidKeys: string[] = [];
        SchemaWalker.walk<Record<string, unknown>>(
            rawDoc,
            (ctx) => {
                rawVisited.push({ scope: ctx.scope, kind: ctx.kind, branchKeyword: ctx.branchKeyword });
            },
            {
                shape: RawRecordShape,
                visitCombinators: true,
                visitDefinitions: true,
                onInvalidProperty: (k) => invalidKeys.push(k)
            }
        );
        assert.deepEqual(invalidKeys, ["invalidProp"]);
        assert.deepEqual(rawVisited, [
            { scope: "#/properties/validProp", kind: "property", branchKeyword: undefined },
            { scope: "#/properties/validProp/items", kind: "item", branchKeyword: undefined },
            { scope: "#/properties/validProp/not", kind: "branch", branchKeyword: "not" },
            {
                scope: "#/properties/validProp/additionalProperties",
                kind: "additional",
                branchKeyword: "additionalProperties"
            },
            { scope: "#/properties/validProp/oneOf/0", kind: "branch", branchKeyword: "oneOf" },
            { scope: "#/definitions/DefA", kind: "branch", branchKeyword: "definitions" },
            { scope: "#/$defs/DefB", kind: "branch", branchKeyword: "$defs" }
        ]);

        // 4. JsonPayloadShape with maxArrayItems and post-order assembly
        const payload = {
            header: { id: 1 },
            primField: "ignored",
            rows: [{ a: 1 }, "primItem", { a: 2 }, { a: 3 }]
        };
        const payloadScopes: string[] = [];
        const payloadKinds: string[] = [];
        SchemaWalker.walk<unknown>(
            payload,
            (ctx) => {
                payloadScopes.push(ctx.scope);
                payloadKinds.push(ctx.kind);
            },
            {
                shape: JsonPayloadShape,
                visitRoot: true,
                maxArrayItems: 3
            }
        );
        assert.deepEqual(payloadScopes, [
            "#",
            "#/properties/header",
            "#/properties/rows",
            "#/properties/rows/items/0",
            "#/properties/rows/items/2"
        ]);
        assert.deepEqual(payloadKinds, ["property", "property", "property", "item", "item"]);
        assert.equal(SchemaShape.defaultMaxDepth, MAX_SCHEMA_DEPTH);
        assert.equal(LayoutElementShape.defaultMaxDepth, MAX_LAYOUT_DEPTH);

        // 5. LayoutElementShape onInvalidProperty callback and maxDepth > MAX_SCHEMA_DEPTH cap
        const invalidLayoutIdx: string[] = [];
        SchemaWalker.walk<ILayoutElement>(
            [null as unknown as ILayoutElement, { type: "Control", scope: "#/properties/Ok" }],
            () => {},
            {
                shape: LayoutElementShape,
                onInvalidProperty: (idx) => invalidLayoutIdx.push(idx)
            }
        );
        assert.deepEqual(invalidLayoutIdx, ["0"]);

        let overMaxSchema: ISchema = { type: "object", properties: { leaf: { type: "string" } } };
        for (let i = 0; i <= MAX_SCHEMA_DEPTH + 1; i++) {
            overMaxSchema = { type: "object", properties: { [`d${i}`]: overMaxSchema } };
        }
        const overMaxTrunc: string[] = [];
        SchemaWalker.walk(overMaxSchema, () => {}, {
            maxDepth: MAX_SCHEMA_DEPTH + 50,
            silentTruncationLog: true,
            onTruncate: (s, r) => overMaxTrunc.push(`${s}:${r}`)
        });
        assert.equal(overMaxTrunc.length, 1);
        assert.ok(overMaxTrunc[0].endsWith(":depth"));

        // 6. visitDefinitions skips non-record entries and sets bindingPath; resolveScope edge cases
        const defBindings: string[] = [];
        SchemaWalker.walk<Record<string, unknown>>(
            {
                definitions: {
                    badDef: null,
                    goodDef: { type: "string" }
                }
            },
            (ctx) => {
                defBindings.push(`${ctx.key}:${ctx.bindingPath}`);
            },
            {
                shape: RawRecordShape,
                visitDefinitions: true
            }
        );
        assert.deepEqual(defBindings, ["goodDef:definitions/goodDef"]);

        assert.deepEqual(SchemaWalker.resolveScope({ type: "object", properties: { "": { type: "string" } } }, ""), {
            meta: undefined,
            bindingPath: "",
            propKey: ""
        });
        assert.deepEqual(SchemaWalker.resolveScope({ type: "object" }, "#/items/0"), {
            meta: undefined,
            bindingPath: "#/items/0",
            propKey: "#/items/0"
        });
        assert.deepEqual(SchemaWalker.resolveScope({ type: "object" }, "#/items/properties/a"), {
            meta: undefined,
            bindingPath: "#/items/properties/a",
            propKey: "#/items/properties/a"
        });
        assert.deepEqual(SchemaWalker.resolveScope({ type: "object" }, "invalid/properties/path"), {
            meta: undefined,
            bindingPath: "invalid/properties/path",
            propKey: "invalid/properties/path"
        });

        // Verify SchemaShape.resolveRef preserves undefined ui when neither referrer nor target has ui,
        // and extractDefinitions rejects non-record definitions (e.g. arrays)
        const noUiDefs: ISchema = {
            type: "object",
            definitions: {
                Plain: { type: "string" }
            },
            properties: {
                plainRef: { $ref: "#/definitions/Plain" }
            }
        };
        let resolvedUi: unknown = "unset";
        SchemaWalker.walk(noUiDefs, (ctx) => {
            resolvedUi = ctx.node.ui;
        });
        assert.equal(resolvedUi, undefined);

        const arrayDefsSchema = {
            type: "object",
            definitions: [{ type: "string", label: "FromArray" }] as unknown as Record<string, ISchema>,
            properties: {
                arrRef: { $ref: "#/definitions/0" }
            }
        } as ISchema;
        let resolvedLabel: unknown = "unset";
        SchemaWalker.walk(arrayDefsSchema, (ctx) => {
            resolvedLabel = ctx.node.label;
        });
        assert.equal(resolvedLabel, undefined);
    });

    it("TraversalPrimitive §3.2: SchemaWalker.walkPaired steps properties, arrays, additionalProperties, combinators, replaceOther, and detectOtherCycles", () => {
        const schema: ISchema = {
            type: "object",
            properties: {
                user: {
                    type: "object",
                    properties: {
                        name: { type: "string", default: "Anon" }
                    }
                },
                tags: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            code: { type: "string" }
                        }
                    }
                },
                dict: {
                    type: "object",
                    properties: {
                        declared: { type: "number" }
                    },
                    additionalProperties: {
                        type: "string"
                    }
                },
                guarded: {
                    type: "string",
                    not: { type: "string", enum: ["forbidden"] }
                }
            }
        };

        const data: Record<string, unknown> = {
            // user is missing — pre-order replaceOther will materialize it
            tags: [{ code: "T1" }, { code: "T2" }],
            dict: { declared: 10, extra1: "v1", extra2: "v2" },
            guarded: "ok"
        };

        const pairedTrace: Array<{
            scope: string;
            bindingPath: string;
            key: string;
            kind: string;
            otherVal: unknown;
        }> = [];

        SchemaWalker.walkPaired<IPropertyMetadata, unknown>(
            schema,
            data,
            {
                stepProperty: (other, key) =>
                    typeof other === "object" && other !== null ? (other as Record<string, unknown>)[key] : undefined,
                stepArray: (other) =>
                    Array.isArray(other)
                        ? other.map((item, idx) => ({ key: String(idx), value: item }))
                        : undefined,
                stepAdditional: (other, _childNode, parentNode) => {
                    if (typeof other !== "object" || other === null || Array.isArray(other)) {
                        return undefined;
                    }
                    const rec = other as Record<string, unknown>;
                    const declaredProps = parentNode.properties || {};
                    return Object.keys(rec)
                        .filter((k) => !(k in declaredProps))
                        .map((k) => ({ key: k, value: rec[k] }));
                },
                stepBranch: (other) => other
            },
            (ctx) => {
                if (ctx.scope === "#/properties/user" && ctx.other === undefined) {
                    const materialized: Record<string, unknown> = {};
                    (ctx.parentOther as Record<string, unknown>)[ctx.key] = materialized;
                    ctx.replaceOther(materialized);
                }
                if (ctx.scope === "#/properties/user/properties/name" && ctx.other === undefined) {
                    (ctx.parentOther as Record<string, unknown>)[ctx.key] = ctx.node.default;
                    ctx.replaceOther(ctx.node.default);
                }
                pairedTrace.push({
                    scope: ctx.scope,
                    bindingPath: ctx.bindingPath,
                    key: ctx.key,
                    kind: ctx.kind,
                    otherVal: ctx.other
                });
            },
            {
                visitCombinators: true
            }
        );

        assert.deepEqual((data.user as Record<string, unknown>).name, "Anon");
        assert.deepEqual(
            pairedTrace.map((t) => `${t.kind}:${t.bindingPath}=${JSON.stringify(t.otherVal)}`),
            [
                'property:user={"name":"Anon"}',
                'property:user/name="Anon"',
                'property:tags=[{"code":"T1"},{"code":"T2"}]',
                'item:tags/0={"code":"T1"}',
                'property:tags/0/code="T1"',
                'item:tags/1={"code":"T2"}',
                'property:tags/1/code="T2"',
                'property:dict={"declared":10,"extra1":"v1","extra2":"v2"}',
                "property:dict/declared=10",
                'additional:dict/extra1="v1"',
                'additional:dict/extra2="v2"',
                'property:guarded="ok"',
                'branch:guarded/not="ok"'
            ]
        );

        // Verify detectOtherCycles catches a cycle on the paired right-hand tree while preserving diamonds
        const nonCyclicLeft: ISchema = {
            type: "object",
            properties: {
                a: {
                    type: "object",
                    properties: {
                        b: {
                            type: "object",
                            properties: {
                                c: { type: "string" }
                            }
                        }
                    }
                },
                sibling: {
                    type: "object",
                    properties: {
                        c: { type: "string" }
                    }
                }
            }
        };
        const sharedRightLeaf = { c: "hello" };
        const cyclicRight: Record<string, unknown> = { sibling: sharedRightLeaf };
        cyclicRight.a = { b: cyclicRight };

        const otherTruncations: Array<{ scope: string; reason: "depth" | "cycle" }> = [];
        const visitedPairedScopes: string[] = [];
        SchemaWalker.walkPaired<IPropertyMetadata, unknown>(
            nonCyclicLeft,
            cyclicRight,
            {
                stepProperty: (other, key) =>
                    typeof other === "object" && other !== null ? (other as Record<string, unknown>)[key] : undefined
            },
            (ctx) => {
                visitedPairedScopes.push(ctx.scope);
            },
            {
                detectOtherCycles: true,
                onTruncate: (scope, reason) => otherTruncations.push({ scope, reason })
            }
        );
        assert.deepEqual(otherTruncations, [{ scope: "#/properties/a/properties/b", reason: "cycle" }]);
        assert.deepEqual(visitedPairedScopes, [
            "#/properties/a",
            "#/properties/sibling",
            "#/properties/sibling/properties/c"
        ]);

        // Verify detectOtherCycles defaults to false (does not truncate cyclic right-hand object when left is finite)
        const defaultOtherTruncations: string[] = [];
        SchemaWalker.walkPaired<IPropertyMetadata, unknown>(
            nonCyclicLeft,
            cyclicRight,
            {
                stepProperty: (other, key) =>
                    typeof other === "object" && other !== null ? (other as Record<string, unknown>)[key] : undefined
            },
            () => {},
            {
                onTruncate: (scope, reason) => defaultOtherTruncations.push(`${scope}:${reason}`)
            }
        );
        assert.deepEqual(defaultOtherTruncations, []);

        // Verify diamond on other (sharedRightLeaf visited under a/b first, then under sibling) is NOT truncated
        const diamondRight: Record<string, unknown> = {
            a: { b: sharedRightLeaf },
            sibling: sharedRightLeaf
        };
        const diamondTruncations: string[] = [];
        const diamondVisited: string[] = [];
        SchemaWalker.walkPaired<IPropertyMetadata, unknown>(
            nonCyclicLeft,
            diamondRight,
            {
                stepProperty: (other, key) =>
                    typeof other === "object" && other !== null ? (other as Record<string, unknown>)[key] : undefined
            },
            (ctx) => {
                diamondVisited.push(ctx.scope);
            },
            {
                detectOtherCycles: true,
                onTruncate: (scope, reason) => diamondTruncations.push(`${scope}:${reason}`)
            }
        );
        assert.deepEqual(diamondTruncations, []);
        assert.deepEqual(diamondVisited, [
            "#/properties/a",
            "#/properties/a/properties/b",
            "#/properties/a/properties/b/properties/c",
            "#/properties/sibling",
            "#/properties/sibling/properties/c"
        ]);

        // Verify activeNodes and activeOthers are cleaned up after walkPaired returns,
        // and replaceOther participates in detectOtherCycles
        const sharedActiveNodes = new WeakSet<object>();
        const sharedActiveOthers = new WeakSet<object>();
        const otherRootObj = { a: null };
        const replacedCyclic: Record<string, unknown> = {};
        replacedCyclic.b = replacedCyclic;
        const replaceTruncations: string[] = [];
        SchemaWalker.walkPaired<IPropertyMetadata, unknown>(
            nonCyclicLeft,
            otherRootObj,
            {
                stepProperty: (other, key) =>
                    typeof other === "object" && other !== null ? (other as Record<string, unknown>)[key] : undefined
            },
            (ctx) => {
                if (ctx.scope === "#/properties/a") {
                    ctx.replaceOther(replacedCyclic);
                }
            },
            {
                detectOtherCycles: true,
                activeNodes: sharedActiveNodes,
                activeOthers: sharedActiveOthers,
                silentTruncationLog: true,
                onTruncate: (scope, reason) => replaceTruncations.push(`${scope}:${reason}`)
            }
        );
        assert.deepEqual(replaceTruncations, ["#/properties/a/properties/b:cycle"]);
        assert.equal(sharedActiveNodes.has(nonCyclicLeft), false);
        assert.equal(sharedActiveOthers.has(otherRootObj), false);
        assert.equal(sharedActiveOthers.has(replacedCyclic), false);

        // Verify cursor callbacks are not invoked when currentOther is undefined
        const undefinedOtherVisited: string[] = [];
        SchemaWalker.walkPaired<IPropertyMetadata, unknown>(
            schema,
            {},
            {
                stepProperty: (other, key) => (other as Record<string, unknown>)[key],
                stepArray: (other) => (other as unknown[]).map((v, i) => ({ key: String(i), value: v })),
                stepAdditional: (other) =>
                    Object.keys(other as Record<string, unknown>).map((k) => ({
                        key: k,
                        value: (other as Record<string, unknown>)[k]
                    }))
            },
            (ctx) => {
                undefinedOtherVisited.push(`${ctx.bindingPath}:${String(ctx.other)}`);
            },
            { visitAdditionalProperties: true }
        );
        assert.ok(undefinedOtherVisited.includes("user/name:undefined"));

        // Verify 'stop' propagation in walkPaired across stepArray, stepAdditional, and stepProperty
        const stopArrVisited: string[] = [];
        SchemaWalker.walkPaired<IPropertyMetadata, unknown>(
            schema,
            data,
            {
                stepProperty: (other, key) =>
                    typeof other === "object" && other !== null ? (other as Record<string, unknown>)[key] : undefined,
                stepArray: (other) =>
                    Array.isArray(other) ? other.map((item, idx) => ({ key: String(idx), value: item })) : undefined
            },
            (ctx) => {
                stopArrVisited.push(ctx.bindingPath);
                if (ctx.bindingPath === "tags/0") {
                    return "stop";
                }
                return;
            }
        );
        assert.deepEqual(stopArrVisited, ["user", "user/name", "tags", "tags/0"]);

        const stopAddVisited: string[] = [];
        SchemaWalker.walkPaired<IPropertyMetadata, unknown>(
            schema,
            data,
            {
                stepProperty: (other, key) =>
                    typeof other === "object" && other !== null ? (other as Record<string, unknown>)[key] : undefined,
                stepAdditional: (other, _childNode, parentNode) => {
                    if (typeof other !== "object" || other === null || Array.isArray(other)) {
                        return undefined;
                    }
                    const rec = other as Record<string, unknown>;
                    const declaredProps = parentNode.properties || {};
                    return Object.keys(rec)
                        .filter((k) => !(k in declaredProps))
                        .map((k) => ({ key: k, value: rec[k] }));
                }
            },
            (ctx) => {
                stopAddVisited.push(ctx.bindingPath);
                if (ctx.bindingPath === "dict/extra1") {
                    return "stop";
                }
                return;
            },
            { visitAdditionalProperties: true }
        );
        assert.deepEqual(stopAddVisited, [
            "user",
            "user/name",
            "tags",
            "tags/items",
            "tags/items/code",
            "dict",
            "dict/declared",
            "dict/extra1"
        ]);
    });
});
