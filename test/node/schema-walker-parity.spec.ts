/**
 * @file schema-walker-parity.spec.ts
 * @description Stage 3 differential parity harness and adversarial schema corpus.
 * Exercises SchemaWalker and all 13 walkers against pre-migration reference oracles
 * over fast-check generated schemas/payloads and the 9 hand-written adversarial cases.
 */

import assert from "node:assert/strict";
import { fc, withLogCapture, logText } from "./fc-config";
import { SchemaWalker, ISchemaVisitContext } from "../../src/nz/co/siliconst/ui5/metaui/core/SchemaWalker";
import { ISchema, IPropertyMetadata, ILayoutElement, FieldType } from "../../src/nz/co/siliconst/ui5/metaui/interfaces/ISchema";
import {
    MAX_SCHEMA_DEPTH,
    MAX_LAYOUT_DEPTH,
    MAX_CLONE_DEPTH,
    SCHEMA_TYPE,
    RENDER_MODE,
    WIDGET_TYPE,
    LAYOUT_STRATEGY
} from "../../src/nz/co/siliconst/ui5/metaui/constants/MetaUIConstants";
import {
    JsonRecord,
    isRecord,
    readString,
    readNumber,
    readBoolean,
    readRecord,
    readStringArray,
    deepClone
} from "../../src/nz/co/siliconst/ui5/metaui/utils/TypeGuards";
import { SchemaValidator } from "../../src/nz/co/siliconst/ui5/metaui/core/SchemaValidator";
import { OpenApiRefResolver } from "../../src/nz/co/siliconst/ui5/metaui/openapi/OpenApiRefResolver";
import { LayoutScorer, ILayoutDecision } from "../../src/nz/co/siliconst/ui5/metaui/core/LayoutScorer";
import { LayoutElementWalker } from "../../src/nz/co/siliconst/ui5/metaui/layouts/LayoutElementWalker";
import { OpenApiConstraintMapper } from "../../src/nz/co/siliconst/ui5/metaui/openapi/parsers/OpenApiConstraintMapper";
import { DataSyncDelegate } from "../../src/nz/co/siliconst/ui5/metaui/controls/host/delegates/DataSyncDelegate";
import { ODataDelegate } from "../../src/nz/co/siliconst/ui5/metaui/controls/host/delegates/ODataDelegate";
import { GenerationDelegate } from "../../src/nz/co/siliconst/ui5/metaui/controls/host/delegates/GenerationDelegate";
import { PayloadValidator } from "../../src/nz/co/siliconst/ui5/metaui/core/PayloadValidator";
import { DataInferenceBuilder } from "../../src/nz/co/siliconst/ui5/metaui/core/DataInferenceBuilder";
import { OpenApiPropertyMapper } from "../../src/nz/co/siliconst/ui5/metaui/openapi/parsers/OpenApiPropertyMapper";
import { SchemaNormalizer } from "../../src/nz/co/siliconst/ui5/metaui/core/SchemaNormalizer";
import { SchemaDirectiveNormalizer } from "../../src/nz/co/siliconst/ui5/metaui/core/SchemaDirectiveNormalizer";
import { OpenApiUIMapper } from "../../src/nz/co/siliconst/ui5/metaui/openapi/OpenApiUIMapper";
import { PluginRegistry } from "../../src/nz/co/siliconst/ui5/metaui/core/PluginRegistry";
import { DefaultLayoutGenerator } from "../../src/nz/co/siliconst/ui5/metaui/core/DefaultLayoutGenerator";
import { PipelineManager } from "../../src/nz/co/siliconst/ui5/metaui/core/PipelineManager";
import { PolymorphicUtil } from "../../src/nz/co/siliconst/ui5/metaui/utils/PolymorphicUtil";
import { Logger } from "../../src/nz/co/siliconst/ui5/metaui/utils/Logger";
import { I18n, TEXT_KEY } from "../../src/nz/co/siliconst/ui5/metaui/utils/I18n";
import { IEngineHost } from "../../src/nz/co/siliconst/ui5/metaui/interfaces/IEngineHost";
import { Engine } from "../../src/nz/co/siliconst/ui5/metaui/core/Engine";
import { ILayoutWalkerSink, IResolvedLayoutControl, ArraySubSchemaFactory } from "../../src/nz/co/siliconst/ui5/metaui/layouts/LayoutElementWalker";

// ============================================================================
// 1. Hand-written Adversarial Corpus (§9)
// ============================================================================

/**
 * Builds the 9 hand-written adversarial schemas required by the engineering brief:
 * 1. Mutual recursion three levels deep (A -> B -> C -> A)
 * 2. A $ref to a definition that itself only contains a $ref
 * 3. An array of arrays of objects
 * 4. A node that is both a diamond target and a cycle participant
 * 5. allOf combined with $ref
 * 6. A 40-level chain against a cap of 30 (MAX_SCHEMA_DEPTH)
 * 7. An empty properties: {}
 * 8. items with no type
 * 9. A property literally named 'items' or 'properties'
 */
export function buildAdversarialSchemas(): Array<{ name: string; schema: ISchema; sampleData: JsonRecord }> {
    // 1. Mutual recursion three levels deep: A -> B -> C -> A
    const mutualRecursion: ISchema = {
        type: "object",
        definitions: {
            NodeA: {
                type: "object",
                properties: {
                    titleA: { type: "string", minLength: 2, default: "A-def" },
                    toB: { type: "object", $ref: "#/definitions/NodeB" }
                }
            },
            NodeB: {
                type: "object",
                properties: {
                    countB: { type: "number", minimum: 1, default: 5 },
                    toC: { type: "object", $ref: "#/definitions/NodeC" }
                }
            },
            NodeC: {
                type: "object",
                properties: {
                    flagC: { type: "boolean", default: true },
                    backToA: { type: "object", $ref: "#/definitions/NodeA" }
                }
            }
        },
        properties: {
            rootA: { type: "object", $ref: "#/definitions/NodeA" }
        }
    };

    // 2. A $ref to a definition that itself only contains a $ref
    const refToRefOnly: ISchema = {
        type: "object",
        definitions: {
            Hop1: { $ref: "#/definitions/Hop2" } as unknown as ISchema,
            Hop2: {
                type: "object",
                properties: {
                    resolvedLeaf: { type: "string", maxLength: 10, default: "hop-val" }
                }
            }
        },
        properties: {
            chained: { type: "object", $ref: "#/definitions/Hop1" }
        }
    };

    // 3. An array of arrays of objects
    const arrayOfArraysOfObjects: ISchema = {
        type: "object",
        properties: {
            matrix: {
                type: "array",
                items: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            cellId: { type: "string", minLength: 1, default: "C0" },
                            weight: { type: "number", maximum: 100, default: 10 }
                        }
                    }
                }
            }
        }
    };

    // 4. A node that is both a diamond target and a cycle participant
    const diamondAndCycle: ISchema = {
        type: "object",
        definitions: {
            SharedCyclic: {
                type: "object",
                properties: {
                    code: { type: "string", maxLength: 5, default: "SH" },
                    selfLoop: { type: "object", $ref: "#/definitions/SharedCyclic" }
                }
            }
        },
        properties: {
            branchLeft: { type: "object", $ref: "#/definitions/SharedCyclic" },
            branchRight: { type: "object", $ref: "#/definitions/SharedCyclic" }
        }
    };

    // 5. allOf combined with $ref
    const allOfWithRef: ISchema = {
        type: "object",
        definitions: {
            Auditable: {
                type: "object",
                required: ["createdBy"],
                properties: {
                    createdBy: { type: "string", minLength: 2, default: "system" }
                }
            }
        },
        properties: {
            record: {
                type: "object",
                allOf: [
                    { $ref: "#/definitions/Auditable" } as unknown as IPropertyMetadata,
                    {
                        type: "object",
                        properties: {
                            amount: { type: "number", minimum: 0, default: 42 }
                        }
                    }
                ],
                properties: {
                    createdBy: { type: "string", minLength: 2, default: "system" },
                    amount: { type: "number", minimum: 0, default: 42 }
                }
            }
        }
    };

    // 6. A 40-level chain against a cap of 30 (MAX_SCHEMA_DEPTH)
    let deepNode: IPropertyMetadata = {
        type: "string",
        minLength: 1,
        default: "bottom",
        additionalProperties: true
    };
    let deepData: JsonRecord = { lv40: "bottom" };
    for (let i = 39; i >= 0; i--) {
        deepNode = {
            type: "object",
            properties: {
                [`lv${i}`]: deepNode
            }
        };
        deepData = { [`lv${i}`]: deepData };
    }
    const fortyLevelChain: ISchema = {
        type: "object",
        properties: {
            deepRoot: deepNode
        }
    };

    // 7. An empty properties: {}
    const emptyProperties: ISchema = {
        type: "object",
        properties: {
            emptyContainer: {
                type: "object",
                properties: {}
            }
        }
    };

    // 8. items with no type
    const itemsWithNoType: ISchema = {
        type: "object",
        properties: {
            untypedItemsArr: {
                type: "array",
                items: {
                    properties: {
                        implicitObjField: { type: "string", default: "imp" }
                    }
                } as unknown as IPropertyMetadata
            }
        }
    };

    // 9. A property literally named 'items' or 'properties'
    const literalKeywordNames: ISchema = {
        type: "object",
        properties: {
            items: {
                type: "string",
                minLength: 2,
                default: "literal-items"
            },
            properties: {
                type: "object",
                properties: {
                    items: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                properties: { type: "number", minimum: 0, default: 7 }
                            }
                        }
                    }
                }
            }
        }
    };

    return [
        {
            name: "1. mutual recursion 3 levels deep (A -> B -> C -> A)",
            schema: mutualRecursion,
            sampleData: { rootA: { titleA: "ok", toB: { countB: 2, toC: { flagC: false } } } }
        },
        {
            name: "2. $ref to a definition that itself only contains a $ref",
            schema: refToRefOnly,
            sampleData: { chained: {} }
        },
        {
            name: "3. array of arrays of objects",
            schema: arrayOfArraysOfObjects,
            sampleData: { matrix: [[{ cellId: "A1" }, {}]] }
        },
        {
            name: "4. node that is both a diamond target and a cycle participant",
            schema: diamondAndCycle,
            sampleData: { branchLeft: { code: "OK" }, branchRight: { code: "TOOLONG_ERROR" } }
        },
        {
            name: "5. allOf combined with $ref",
            schema: allOfWithRef,
            sampleData: { record: {} }
        },
        {
            name: "6. 40-level chain against MAX_SCHEMA_DEPTH (30)",
            schema: fortyLevelChain,
            sampleData: { deepRoot: deepData }
        },
        {
            name: "7. empty properties: {}",
            schema: emptyProperties,
            sampleData: { emptyContainer: {} }
        },
        {
            name: "8. items with no type",
            schema: itemsWithNoType,
            sampleData: { untypedItemsArr: [{}] }
        },
        {
            name: "9. property literally named 'items' or 'properties'",
            schema: literalKeywordNames,
            sampleData: { items: "ok", properties: { items: [{}] } }
        }
    ];
}

// ============================================================================
// 2. fast-check Arbitraries for Schemas, Payloads, and OpenAPI Specs
// ============================================================================

const arbPropKey = fc.constantFrom(
    "alpha",
    "beta",
    "gamma",
    "items",
    "properties",
    "Order/Item",
    "Flag~0Key",
    "count",
    "nested"
);

const arbLeafProperty: fc.Arbitrary<IPropertyMetadata> = fc
    .record({
        type: fc.constantFrom<FieldType>("string", "number", "integer", "boolean"),
        minLength: fc.option(fc.integer({ min: 0, max: 5 }), { nil: undefined }),
        maxLength: fc.option(fc.integer({ min: 5, max: 20 }), { nil: undefined }),
        minimum: fc.option(fc.integer({ min: 0, max: 10 }), { nil: undefined }),
        maximum: fc.option(fc.integer({ min: 10, max: 100 }), { nil: undefined }),
        readOnly: fc.option(fc.boolean(), { nil: undefined }),
        writeOnly: fc.option(fc.boolean(), { nil: undefined }),
        nullable: fc.option(fc.boolean(), { nil: undefined }),
        visible: fc.option(fc.boolean(), { nil: undefined }),
        defaultVal: fc.option(fc.oneof(fc.string({ maxLength: 6 }), fc.integer({ min: 1, max: 50 }), fc.boolean()), {
            nil: undefined
        }),
        addProps: fc.option(fc.boolean(), { nil: undefined })
    })
    .map((r) => {
        const meta: IPropertyMetadata = { type: r.type };
        if (r.type === "string") {
            if (r.minLength !== undefined) meta.minLength = r.minLength;
            if (r.maxLength !== undefined) meta.maxLength = r.maxLength;
            if (typeof r.defaultVal === "string") meta.default = r.defaultVal;
        } else if (r.type === "number" || r.type === "integer") {
            if (r.minimum !== undefined) meta.minimum = r.minimum;
            if (r.maximum !== undefined) meta.maximum = r.maximum;
            if (typeof r.defaultVal === "number") meta.default = r.defaultVal;
        } else if (r.type === "boolean" && typeof r.defaultVal === "boolean") {
            meta.default = r.defaultVal;
        }
        if (r.readOnly !== undefined) meta.readOnly = r.readOnly;
        if (r.writeOnly !== undefined) meta.writeOnly = r.writeOnly;
        if (r.nullable !== undefined) meta.nullable = r.nullable;
        if (r.addProps !== undefined) meta.additionalProperties = r.addProps;
        if (r.visible !== undefined) meta.ui = { visible: r.visible };
        return meta;
    });

const arbPropertyTree: fc.Arbitrary<IPropertyMetadata> = fc.letrec((tie) => ({
    node: fc.oneof(
        { depthSize: "small", withCrossShrink: true },
        arbLeafProperty,
        fc.record({
            type: fc.constant<FieldType>("object"),
            properties: fc.dictionary(arbPropKey, tie("node") as fc.Arbitrary<IPropertyMetadata>, {
                minKeys: 0,
                maxKeys: 3
            }),
            readOnly: fc.option(fc.boolean(), { nil: undefined }),
            additionalProperties: fc.option(fc.boolean(), { nil: undefined }),
            ui: fc.option(
                fc.record({
                    visible: fc.option(fc.boolean(), { nil: undefined }),
                    renderMode: fc.option(fc.constantFrom(RENDER_MODE.INLINE, RENDER_MODE.DIALOG), { nil: undefined }),
                    layoutBudget: fc.option(fc.integer({ min: 1, max: 30 }), { nil: undefined })
                }),
                { nil: undefined }
            )
        }),
        fc.record({
            type: fc.constant<FieldType>("array"),
            items: tie("node") as fc.Arbitrary<IPropertyMetadata>,
            ui: fc.option(
                fc.record({
                    visible: fc.option(fc.boolean(), { nil: undefined }),
                    renderMode: fc.option(fc.constantFrom(RENDER_MODE.INLINE, RENDER_MODE.DIALOG), { nil: undefined })
                }),
                { nil: undefined }
            )
        }),
        fc.record({
            type: fc.constant<FieldType>("object"),
            $ref: fc.constantFrom("#/definitions/SharedDef", "#/definitions/CyclicA", "#/definitions/MissingDef")
        })
    )
})).node;

export const arbGeneratedSchema: fc.Arbitrary<ISchema> = fc
    .record({
        sharedDefProps: fc.dictionary(arbPropKey, arbLeafProperty, { minKeys: 1, maxKeys: 3 }),
        includeCyclicDefs: fc.boolean(),
        properties: fc.dictionary(arbPropKey, arbPropertyTree, { minKeys: 1, maxKeys: 4 }),
        diamondSibling: fc.boolean(),
        layoutBudget: fc.integer({ min: 5, max: 40 })
    })
    .map((spec) => {
        const definitions: Record<string, ISchema> = {
            SharedDef: {
                type: "object",
                properties: spec.sharedDefProps
            }
        };
        if (spec.includeCyclicDefs) {
            definitions.CyclicA = {
                type: "object",
                properties: {
                    stepB: { type: "object", $ref: "#/definitions/CyclicB" },
                    leafA: { type: "string", default: "a" }
                }
            };
            definitions.CyclicB = {
                type: "object",
                properties: {
                    backA: { type: "object", $ref: "#/definitions/CyclicA" }
                }
            };
        }
        const props: Record<string, IPropertyMetadata> = { ...spec.properties };
        if (spec.diamondSibling) {
            props.diamond1 = { type: "object", $ref: "#/definitions/SharedDef" };
            props.diamond2 = { type: "object", $ref: "#/definitions/SharedDef" };
        }
        return {
            type: "object",
            ui: { layoutBudget: spec.layoutBudget },
            definitions,
            properties: props
        };
    });

export const arbArbitraryPayload: fc.Arbitrary<unknown> = fc.letrec((tie) => ({
    val: fc.oneof(
        { depthSize: "small" },
        fc.string({ maxLength: 12 }),
        fc.integer({ min: -100, max: 100 }),
        fc.boolean(),
        fc.constant(null),
        fc.date({ min: new Date("2020-01-01T00:00:00.000Z"), max: new Date("2030-01-01T00:00:00.000Z"), noInvalidDate: true }),
        fc.array(tie("val"), { maxLength: 3 }),
        fc.dictionary(
            fc.constantFrom("alpha", "beta", "gamma", "@odata.etag", "__metadata", "__deferred", "items", "properties"),
            tie("val"),
            { maxKeys: 4 }
        )
    )
})).val;

// ============================================================================
// 3. Pre-Migration Reference Oracles (*Legacy) for All 13 Walkers
// ============================================================================

/** Oracle 1: TypeGuards.deepClone legacy implementation. */
function deepCloneLegacy<T>(value: T, seen: WeakMap<object, unknown> = new WeakMap(), depth: number = 0): T {
    if (value === undefined || value === null || typeof value !== "object") {
        return value;
    }
    if (value instanceof Date) {
        return new Date(value.getTime()) as unknown as T;
    }
    if (seen.has(value)) {
        return seen.get(value) as T;
    }
    if (depth >= MAX_CLONE_DEPTH) {
        Logger.warn(
            "[MetaUI TypeGuards]",
            `deepClone exceeded MAX_CLONE_DEPTH (${MAX_CLONE_DEPTH}); the payload below this level was ` +
                `replaced with an empty ${Array.isArray(value) ? "array" : "object"} and its data is lost.`
        );
        return (Array.isArray(value) ? [] : {}) as unknown as T;
    }
    if (Array.isArray(value)) {
        const copy: unknown[] = [];
        seen.set(value, copy);
        for (let i = 0; i < value.length; i++) {
            copy[i] = deepCloneLegacy(value[i], seen, depth + 1);
        }
        return copy as unknown as T;
    }
    const source = value as Record<string, unknown>;
    const copy: Record<string, unknown> = {};
    seen.set(value, copy);
    for (const key of Object.keys(source)) {
        const clonedVal = deepCloneLegacy(source[key], seen, depth + 1);
        if (key === "__proto__") {
            Object.defineProperty(copy, key, {
                value: clonedVal,
                writable: true,
                enumerable: true,
                configurable: true
            });
        } else {
            copy[key] = clonedVal;
        }
    }
    return copy as unknown as T;
}

const ALLOWED_TYPES_LEGACY: readonly string[] = [
    SCHEMA_TYPE.STRING,
    SCHEMA_TYPE.NUMBER,
    SCHEMA_TYPE.INTEGER,
    SCHEMA_TYPE.BOOLEAN,
    SCHEMA_TYPE.DATE,
    SCHEMA_TYPE.OBJECT,
    SCHEMA_TYPE.ARRAY
];

function checkNotSubSchemaLegacy(node: Record<string, unknown>, label: string): string[] {
    if (node.not === undefined) {
        return [];
    }
    if (!isRecord(node.not)) {
        return [`${label} declares a 'not' that is not a schema object; it cannot be enforced.`];
    }
    if (!PayloadValidator.isEvaluableNot(node.not)) {
        return [
            `${label} declares a 'not' sub-schema with no constraint this engine can evaluate, ` +
                `so it is not enforced. Declare a testable keyword inside it (for example 'const', ` +
                `'enum', 'pattern', a length or a numeric bound).`
        ];
    }
    return [];
}

/** Oracle 2: SchemaValidator.validateSchemaStructure legacy implementation. */
function validateSchemaStructureLegacy(schema: unknown, depth: number = 0): string[] {
    const errors: string[] = [];
    if (!isRecord(schema)) {
        return ["Root schema must be an object."];
    }
    if (depth > MAX_SCHEMA_DEPTH) {
        Logger.warn(
            "[MetaUI SchemaValidator]",
            `Schema nesting exceeded MAX_SCHEMA_DEPTH (${MAX_SCHEMA_DEPTH}); this subtree was reported ` +
                `structurally valid without being checked.`
        );
        return errors;
    }
    const rootType = readString(schema, "type");
    if (rootType !== SCHEMA_TYPE.OBJECT && rootType !== SCHEMA_TYPE.ARRAY) {
        errors.push(`Root schema must have type 'object' or 'array'. Found: '${String(schema.type)}'`);
    }
    const properties = readRecord(schema, "properties");
    const hasAlternativeObjectStructure =
        schema.additionalProperties !== undefined ||
        Array.isArray(schema.oneOf) ||
        Array.isArray(schema.anyOf) ||
        Array.isArray(schema.allOf) ||
        typeof schema.$ref === "string";
    if (rootType === SCHEMA_TYPE.OBJECT && !properties && !hasAlternativeObjectStructure) {
        errors.push("Object schema is missing the 'properties' node.");
    }
    if (rootType === SCHEMA_TYPE.ARRAY) {
        const items = readRecord(schema, "items");
        if (!items && typeof schema.$ref !== "string") {
            errors.push("Array schema is missing the 'items' node.");
        } else if (items) {
            const itemsType = readString(items, "type");
            if (itemsType === SCHEMA_TYPE.OBJECT || itemsType === SCHEMA_TYPE.ARRAY) {
                errors.push(...validateSchemaStructureLegacy(items, depth + 1));
            } else if (itemsType && !ALLOWED_TYPES_LEGACY.includes(itemsType)) {
                errors.push(`Array items has invalid type '${itemsType}'. Allowed: ${ALLOWED_TYPES_LEGACY.join(", ")}`);
            }
        }
    }
    errors.push(...checkNotSubSchemaLegacy(schema, "Root schema"));
    if (properties) {
        for (const key of Object.keys(properties)) {
            const prop = properties[key];
            if (!isRecord(prop)) {
                errors.push(`Property '${key}' must be an object.`);
                continue;
            }
            errors.push(...checkNotSubSchemaLegacy(prop, `Property '${key}'`));
            const propType = readString(prop, "type");
            if (!propType) {
                errors.push(`Property '${key}' is missing 'type'.`);
            } else if (!ALLOWED_TYPES_LEGACY.includes(propType)) {
                errors.push(`Property '${key}' has invalid type '${propType}'. Allowed: ${ALLOWED_TYPES_LEGACY.join(", ")}`);
            } else if (
                propType === SCHEMA_TYPE.ARRAY &&
                !isRecord(prop.items) &&
                typeof prop.$ref !== "string" &&
                !Array.isArray(prop.enum) &&
                prop.valueHelp === undefined &&
                !(isRecord(prop.ui) && prop.ui.valueHelp !== undefined)
            ) {
                errors.push(`Array property '${key}' is missing 'items'.`);
            } else if (propType === SCHEMA_TYPE.OBJECT && isRecord(prop.properties)) {
                errors.push(...validateSchemaStructureLegacy(prop, depth + 1));
            }
        }
    }
    return errors;
}

/** Oracle 3: OpenApiRefResolver.resolve legacy implementation. */
function resolveRefLegacy(
    refUrl: string,
    openApiRoot: unknown,
    depth: number = 0,
    activeRefs: Set<string> = new Set()
): unknown {
    if (!refUrl || !refUrl.startsWith("#/")) {
        Logger.debug(`[MetaUI OpenApiBuilder] Ignoring non-local or empty $ref: ${refUrl}`, "OpenApiBuilder");
        return null;
    }
    if (depth > MAX_SCHEMA_DEPTH || activeRefs.has(refUrl)) {
        Logger.error(
            `[MetaUI OpenApiBuilder] Circular or overly deep $ref detected: ${refUrl}`,
            undefined,
            "OpenApiBuilder"
        );
        return null;
    }
    const pathSegments = refUrl
        .substring(2)
        .split("/")
        .map((segment) => OpenApiRefResolver.unescapePointerSegment(segment));

    let current: unknown = openApiRoot;
    let found = true;
    for (const segment of pathSegments) {
        if (Array.isArray(current)) {
            const idx = Number(segment);
            if (segment !== "" && Number.isInteger(idx) && idx >= 0 && idx < current.length) {
                current = current[idx];
            } else {
                found = false;
                break;
            }
        } else if (isRecord(current) && segment in current) {
            current = current[segment];
        } else {
            found = false;
            break;
        }
    }
    if (!found && isRecord(openApiRoot)) {
        const refName = OpenApiRefResolver.extractRefName(refUrl);
        const fallbackDefs = readRecord(openApiRoot, "definitions") || readRecord(openApiRoot, "$defs");
        if (fallbackDefs && refName in fallbackDefs) {
            current = fallbackDefs[refName];
            found = true;
        }
    }
    if (!found) {
        Logger.error(`[MetaUI OpenApiBuilder] Failed to resolve local $ref: ${refUrl}`, undefined, "OpenApiBuilder");
        return null;
    }
    const nestedRef = isRecord(current) ? readString(current, "$ref") : undefined;
    if (nestedRef) {
        const nextRefs = new Set(activeRefs);
        nextRefs.add(refUrl);
        return resolveRefLegacy(nestedRef, openApiRoot, depth + 1, nextRefs);
    }
    return current;
}

/** Oracle 9: GenerationDelegate.containsAdditionalProperties legacy implementation. */
function containsAdditionalPropertiesLegacy(node: unknown, depth: number = 0): boolean {
    if (depth > MAX_SCHEMA_DEPTH) {
        Logger.warn(
            "[MetaUI GenerationDelegate]",
            `Schema nesting exceeded MAX_SCHEMA_DEPTH (${MAX_SCHEMA_DEPTH}) while scanning for ` +
                `'additionalProperties'; hybrid inference was not considered below this level.`
        );
        return false;
    }
    if (!isRecord(node)) return false;
    if (node.additionalProperties === true) return true;
    if (isRecord(node.properties)) {
        for (const key of Object.keys(node.properties)) {
            if (containsAdditionalPropertiesLegacy(node.properties[key], depth + 1)) {
                return true;
            }
        }
    }
    if (isRecord(node.items) && containsAdditionalPropertiesLegacy(node.items, depth + 1)) {
        return true;
    }
    return false;
}

/** Oracle 8: ODataDelegate.sanitizeODataPayload legacy implementation. */
function sanitizeODataPayloadLegacy(value: unknown, depth: number = 0): unknown {
    if (depth > MAX_SCHEMA_DEPTH) {
        Logger.warn(
            `OData payload nesting exceeded MAX_SCHEMA_DEPTH (${MAX_SCHEMA_DEPTH}); '@'/'__' annotation keys ` +
                `below this level were left in the payload instead of being stripped.`,
            undefined,
            "ODataDelegate"
        );
        return value;
    }
    if (value === null || value === undefined || typeof value !== "object") {
        return value;
    }
    if (value instanceof Date) {
        return value.toISOString();
    }
    if (Array.isArray(value)) {
        return value.map((item) => sanitizeODataPayloadLegacy(item, depth + 1));
    }
    if (isRecord(value)) {
        const cleanObj: Record<string, unknown> = {};
        for (const key of Object.keys(value)) {
            if (key.startsWith("@") || key.startsWith("__")) {
                continue;
            }
            const propVal = value[key];
            if (isRecord(propVal)) {
                const propKeys = Object.keys(propVal);
                if (propKeys.length > 0 && propKeys.every((k) => k.startsWith("__") || k.startsWith("@"))) {
                    continue;
                }
            }
            cleanObj[key] = sanitizeODataPayloadLegacy(propVal, depth + 1);
        }
        return cleanObj;
    }
    return value;
}

/** Oracle 7: DataSyncDelegate.injectSchemaDefaults legacy implementation. */
function injectSchemaDefaultsLegacy(
    schema: ISchema | IPropertyMetadata | null | undefined,
    rootData: unknown,
    depth: number = 0,
    definitions?: Record<string, ISchema>
): void {
    if (!schema || !rootData || typeof rootData !== "object") return;
    if (depth > MAX_SCHEMA_DEPTH) {
        Logger.warn(
            "[MetaUI]",
            `Schema nesting exceeded MAX_SCHEMA_DEPTH (${MAX_SCHEMA_DEPTH}); schema defaults below this ` +
                `level were not injected, so those fields start empty rather than at their declared default.`,
            "DataSyncDelegate"
        );
        return;
    }
    let effectiveSchema = schema;
    const schemaRef = "$ref" in schema ? schema.$ref : undefined;
    if (schemaRef && !schema.properties && definitions) {
        const refKey = OpenApiRefResolver.extractRefName(schemaRef);
        if (refKey && definitions[refKey]) {
            effectiveSchema = definitions[refKey];
        }
    }
    if (effectiveSchema.type === "object" && effectiveSchema.properties && isRecord(rootData)) {
        for (const key of Object.keys(effectiveSchema.properties)) {
            const rawPropSchema = effectiveSchema.properties[key];
            const refKey =
                rawPropSchema.$ref && !rawPropSchema.properties
                    ? OpenApiRefResolver.extractRefName(rawPropSchema.$ref)
                    : undefined;
            const propSchema: ISchema | IPropertyMetadata = (refKey && definitions?.[refKey]) || rawPropSchema;
            const propDefault = "default" in propSchema ? propSchema.default : undefined;

            if (rootData[key] === undefined) {
                if (rawPropSchema.default !== undefined) {
                    rootData[key] = deepClone(rawPropSchema.default);
                } else if (propDefault !== undefined) {
                    rootData[key] = deepClone(propDefault);
                } else if (propSchema.type === "object") {
                    const tempObj: Record<string, unknown> = {};
                    injectSchemaDefaultsLegacy(propSchema, tempObj, depth + 1, definitions);
                    if (Object.keys(tempObj).length > 0) {
                        rootData[key] = tempObj;
                    }
                }
            } else if (typeof rootData[key] === "object" && rootData[key] !== null) {
                injectSchemaDefaultsLegacy(propSchema, rootData[key], depth + 1, definitions);
            }
        }
    } else if (effectiveSchema.type === "array" && effectiveSchema.items) {
        const targetArray = Array.isArray(rootData)
            ? rootData
            : isRecord(rootData) && Array.isArray(rootData.items)
              ? rootData.items
              : null;
        if (targetArray) {
            for (let i = 0; i < targetArray.length; i++) {
                if (typeof targetArray[i] === "object" && targetArray[i] !== null) {
                    injectSchemaDefaultsLegacy(effectiveSchema.items, targetArray[i], depth + 1, definitions);
                }
            }
        }
    }
}

/** Oracle 6: OpenApiConstraintMapper.resolveAllOf legacy implementation. */
function resolveAllOfLegacy(
    currentProp: JsonRecord,
    openApiRoot: unknown,
    depth: number = 0,
    activeRefs: Set<string> = new Set()
): JsonRecord {
    if (!Array.isArray(currentProp.allOf)) {
        return currentProp;
    }
    if (depth > MAX_SCHEMA_DEPTH) {
        Logger.warn(
            `[MetaUI OpenApiConstraintMapper] allOf nesting exceeded MAX_SCHEMA_DEPTH (${MAX_SCHEMA_DEPTH}); ` +
                `${currentProp.allOf.length} branch(es) were not merged, so their properties and ` +
                `constraints are missing from this schema.`
        );
        return currentProp;
    }
    let accumulatedBase: JsonRecord = {};
    for (const subSchema of currentProp.allOf) {
        if (!isRecord(subSchema)) {
            continue;
        }
        let resolvedSub: JsonRecord = subSchema;
        const refPath = readString(resolvedSub, "$ref");
        const nextRefs = new Set(activeRefs);
        if (refPath) {
            if (nextRefs.has(refPath)) {
                continue;
            }
            nextRefs.add(refPath);
            const resolved = OpenApiRefResolver.resolve(refPath, openApiRoot);
            resolvedSub = isRecord(resolved) ? { ...resolved, ...resolvedSub } : { ...resolvedSub };
            delete resolvedSub.$ref;
        }
        if (Array.isArray(resolvedSub.allOf)) {
            resolvedSub = resolveAllOfLegacy(resolvedSub, openApiRoot, depth + 1, nextRefs);
        }
        const mergedSub = OpenApiConstraintMapper.deepMergeSchemas(accumulatedBase, resolvedSub);
        if (isRecord(mergedSub)) {
            accumulatedBase = mergedSub;
        }
    }
    const ownProps: JsonRecord = { ...currentProp };
    delete ownProps.allOf;
    const finalMerged = OpenApiConstraintMapper.deepMergeSchemas(accumulatedBase, ownProps);
    return isRecord(finalMerged) ? finalMerged : ownProps;
}

/** Oracle 4: LayoutScorer.apply legacy implementation. */
function layoutScorerApplyLegacy(
    schema: ISchema | null,
    budget: number,
    schemaDefinitions?: Record<string, ISchema>,
    registry: PluginRegistry = PluginRegistry.getInstance()
): Map<string, ILayoutDecision> {
    const table = new Map<string, ILayoutDecision>();
    if (!schema) return table;
    const effectiveBudget =
        budget > 0 ? budget : schema.ui?.layoutBudget && schema.ui.layoutBudget > 0 ? schema.ui.layoutBudget : 0;
    if (effectiveBudget <= 0) return table;

    interface ILegacyMemo {
        readonly score: number;
        readonly renderMode: "inline" | "dialog";
        readonly resolvedMeta: IPropertyMetadata;
        readonly subTable: ReadonlyArray<readonly [string, ILayoutDecision]>;
    }
    const ctx = {
        visited: new WeakSet<object>(),
        activeRefs: new Set<string>(),
        refMemo: new Map<string, ILegacyMemo>(),
        definitions: schemaDefinitions,
        registry,
        table
    };

    const toBindingPath = (s: string): string => s.replace(/^#\/(properties\/)?/, "").split("/properties/").join("/");
    const decide = (explicit: "inline" | "dialog" | undefined, score: number, b: number): "inline" | "dialog" => {
        if (explicit === RENDER_MODE.DIALOG) return RENDER_MODE.DIALOG;
        if (score <= b || explicit === RENDER_MODE.INLINE) return RENDER_MODE.INLINE;
        return RENDER_MODE.DIALOG;
    };
    const record = (scope: string, d: Omit<ILayoutDecision, "scope" | "bindingPath">): void => {
        ctx.table.set(scope, { ...d, scope, bindingPath: toBindingPath(scope) });
    };

    const scoreNode = (node: IPropertyMetadata, scope: string, b: number, depth: number): number => {
        if (!node || typeof node !== "object") return 0;
        if (node.ui?.visible === false) return 0;
        const effB = node.ui?.layoutBudget && node.ui.layoutBudget > 0 ? node.ui.layoutBudget : b;
        const explicitMode = node.ui?.renderMode;
        if (depth > MAX_SCHEMA_DEPTH) {
            Logger.warn(
                `[MetaUI LayoutScorer] Maximum schema depth (${MAX_SCHEMA_DEPTH}) exceeded at '${scope}'. ` +
                    "Forcing dialog mode; the remainder of this branch is not scored.",
                "",
                "LayoutScorer"
            );
            record(scope, { renderMode: RENDER_MODE.DIALOG, score: 1, layoutBudget: effB });
            return 1;
        }
        if (ctx.visited.has(node)) {
            Logger.warn(
                `[MetaUI LayoutScorer] Circular reference detected at '${scope}'. Forcing dialog mode to prevent crash.`,
                "",
                "LayoutScorer"
            );
            record(scope, { renderMode: RENDER_MODE.DIALOG, score: 1, layoutBudget: effB });
            return 1;
        }
        ctx.visited.add(node);
        if (node.$ref) {
            const key = OpenApiRefResolver.extractRefName(node.$ref || "");
            if (ctx.activeRefs.has(key)) {
                Logger.warn(
                    `[MetaUI LayoutScorer] Circular OpenAPI $ref detected at '${scope}' for '${key}'. Forcing dialog mode to prevent crash.`,
                    "",
                    "LayoutScorer"
                );
                record(scope, { renderMode: RENDER_MODE.DIALOG, score: 1 });
                ctx.visited.delete(node);
                return 1;
            }
            const resolvedOriginal = ctx.definitions ? ctx.definitions[key] : undefined;
            if (!resolvedOriginal) {
                record(scope, {
                    renderMode: RENDER_MODE.DIALOG,
                    score: 1,
                    layoutBudget: effB,
                    widget: node.ui?.widget || WIDGET_TYPE.REFERENCE
                });
                ctx.visited.delete(node);
                return 1;
            }
            const memoKey = `${key}::${effB}`;
            const cached = ctx.refMemo.get(memoKey);
            let resolvedMeta: IPropertyMetadata;
            let resolvedScore: number;
            let resolvedMode: "inline" | "dialog";
            let subTable: ReadonlyArray<readonly [string, ILayoutDecision]>;
            if (cached) {
                resolvedMeta = deepClone(cached.resolvedMeta);
                resolvedScore = cached.score;
                resolvedMode = cached.renderMode;
                subTable = cached.subTable;
            } else {
                ctx.activeRefs.add(key);
                const resolvedClone = deepClone(resolvedOriginal);
                resolvedMeta = { ...resolvedClone, type: resolvedClone.type || SCHEMA_TYPE.OBJECT };
                const outerTable = ctx.table;
                const privateTable = new Map<string, ILayoutDecision>();
                ctx.table = privateTable;
                resolvedScore = scoreNode(resolvedMeta, scope, effB, depth);
                ctx.table = outerTable;
                resolvedMode = privateTable.get(scope)?.renderMode || resolvedMeta.ui?.renderMode || RENDER_MODE.INLINE;
                const prefix = `${scope}/`;
                const snap: (readonly [string, ILayoutDecision])[] = [];
                for (const [k, dec] of privateTable) {
                    if (k.startsWith(prefix)) snap.push([k.slice(scope.length), dec] as const);
                }
                subTable = snap;
                ctx.activeRefs.delete(key);
                ctx.refMemo.set(memoKey, {
                    score: resolvedScore,
                    renderMode: resolvedMode,
                    resolvedMeta: deepClone(resolvedMeta),
                    subTable
                });
            }
            ctx.visited.delete(node);
            if (explicitMode === RENDER_MODE.DIALOG) {
                record(scope, { renderMode: RENDER_MODE.DIALOG, score: 1, layoutBudget: effB });
                return 1;
            }
            if ((resolvedMode !== RENDER_MODE.DIALOG && resolvedScore <= effB) || explicitMode === RENDER_MODE.INLINE) {
                const cascadeReadOnly =
                    (node.readOnly === true ||
                        node.ui?.readOnly === true ||
                        resolvedMeta.readOnly === true ||
                        resolvedMeta.ui?.readOnly === true) &&
                    !!(resolvedMeta.properties || resolvedMeta.items);
                for (const [relScope, dec] of subTable) {
                    const abs = `${scope}${relScope}`;
                    ctx.table.set(abs, {
                        ...dec,
                        scope: abs,
                        bindingPath: toBindingPath(abs),
                        resolvedRef: dec.resolvedRef ? deepClone(dec.resolvedRef) : undefined
                    });
                }
                record(scope, {
                    renderMode: RENDER_MODE.INLINE,
                    score: resolvedScore,
                    layoutBudget: effB,
                    resolvedRef: resolvedMeta,
                    cascadeReadOnly: cascadeReadOnly || undefined
                });
                return resolvedScore;
            }
            record(scope, { renderMode: RENDER_MODE.DIALOG, score: 1, layoutBudget: effB });
            return 1;
        }
        if (node.type === SCHEMA_TYPE.ARRAY) {
            let arrayScore = ctx.registry.getPluginScore(SCHEMA_TYPE.ARRAY, node.ui?.widget);
            const itemsScope = `${scope}/items`;
            const itemsMeta = node.items;
            if (itemsMeta && (itemsMeta.type === SCHEMA_TYPE.OBJECT || itemsMeta.type === SCHEMA_TYPE.ARRAY || itemsMeta.$ref)) {
                arrayScore += scoreNode(itemsMeta, itemsScope, effB, depth + 1);
            }
            ctx.visited.delete(node);
            const itemsMode = ctx.table.get(itemsScope)?.renderMode || itemsMeta?.ui?.renderMode;
            const cascadeReadOnly = (node.readOnly === true || node.ui?.readOnly === true) && !!node.items;
            if (explicitMode === RENDER_MODE.DIALOG || itemsMode === RENDER_MODE.DIALOG) {
                record(scope, {
                    renderMode: RENDER_MODE.DIALOG,
                    score: 1,
                    layoutBudget: effB,
                    cascadeReadOnly: cascadeReadOnly || undefined
                });
                return 1;
            }
            const mode = decide(explicitMode, arrayScore, effB);
            record(scope, {
                renderMode: mode,
                score: mode === RENDER_MODE.INLINE ? arrayScore : 1,
                layoutBudget: effB,
                cascadeReadOnly: cascadeReadOnly || undefined
            });
            return mode === RENDER_MODE.INLINE ? arrayScore : 1;
        }
        let totalScore = 0;
        if (node.properties) {
            for (const key of Object.keys(node.properties)) {
                const child = node.properties[key];
                if (child.ui?.visible === false) continue;
                if (child.type === SCHEMA_TYPE.OBJECT || child.type === SCHEMA_TYPE.ARRAY || child.$ref) {
                    totalScore += scoreNode(child, `${scope}/properties/${key}`, effB, depth + 1);
                } else {
                    totalScore += ctx.registry.getPluginScore(child.type || SCHEMA_TYPE.STRING, child.ui?.widget);
                }
            }
        } else {
            totalScore += ctx.registry.getPluginScore(SCHEMA_TYPE.OBJECT, node.ui?.widget);
        }
        ctx.visited.delete(node);
        const cascadeReadOnly =
            (node.readOnly === true || node.ui?.readOnly === true) && !!(node.properties || node.items);
        const mode = decide(explicitMode, totalScore, effB);
        record(scope, {
            renderMode: mode,
            score: mode === RENDER_MODE.INLINE ? totalScore : 1,
            layoutBudget: effB,
            cascadeReadOnly: cascadeReadOnly || undefined
        });
        return mode === RENDER_MODE.INLINE ? totalScore : 1;
    };

    if (schema.properties) {
        for (const key of Object.keys(schema.properties)) {
            const prop = schema.properties[key];
            if (prop.type === SCHEMA_TYPE.OBJECT || prop.type === SCHEMA_TYPE.ARRAY || prop.$ref) {
                scoreNode(prop, `#/properties/${key}`, effectiveBudget, 0);
            }
        }
    }
    if (schema.type === SCHEMA_TYPE.ARRAY && schema.items) {
        scoreNode(schema.items, "#/items", effectiveBudget, 0);
    }
    return table;
}

/** Oracle 5: LayoutElementWalker.walk legacy implementation (with Stage 1 path-scoped cycle detection). */
function resolveControlElementLegacy(
    element: ILayoutElement,
    schema: ISchema,
    engine: Engine,
    layoutName: string,
    activeNodes?: WeakSet<object>,
    activeRefs?: Set<string>
): { meta: IPropertyMetadata; bindingPath: string; propKey: string } | null {
    if (!element.scope || !element.scope.startsWith("#/properties/")) {
        Logger.error(`[MetaUI] Invalid scope '${element.scope}' in uiLayout Control.`, "", layoutName);
        engine.hasPartialRenderingErrors = true;
        return null;
    }
    const host = engine?.host;
    const resolveDef =
        host && typeof host.getSchemaDefinition === "function"
            ? (ref: string) => host.getSchemaDefinition?.(ref) ?? null
            : undefined;
    const pathSegments = element.scope
        .replace("#/properties/", "")
        .split("/properties/")
        .map((segment) => OpenApiRefResolver.unescapePointerSegment(segment));
    const bindingPath = pathSegments.join("/");
    const propKey = pathSegments.join("/properties/");
    const pathNodes = new WeakSet<object>([schema]);
    const pathRefs = new Set<string>();
    let current: Record<string, IPropertyMetadata> | undefined = schema.properties;
    let meta: IPropertyMetadata | undefined;
    for (let i = 0; i < pathSegments.length; i++) {
        const segment = pathSegments[i];
        if (!current) {
            meta = undefined;
            break;
        }
        meta = current[segment];
        if (!meta) {
            break;
        }
        if (pathNodes.has(meta) || activeNodes?.has(meta)) {
            Logger.warn(
                "[MetaUI SchemaNormalizer]",
                `Circular schema reference detected while resolving scope '${element.scope}'; stopping recursion.`
            );
            meta = undefined;
            break;
        }
        pathNodes.add(meta);
        let resolvedDef: ISchema | null | undefined;
        if (meta.$ref) {
            if (pathRefs.has(meta.$ref) || activeRefs?.has(meta.$ref)) {
                Logger.warn(
                    "[MetaUI SchemaNormalizer]",
                    `Circular $ref detected (${meta.$ref}) while resolving scope '${element.scope}'; stopping recursion.`
                );
                meta = undefined;
                break;
            }
            pathRefs.add(meta.$ref);
            resolvedDef =
                resolveDef?.(meta.$ref) ?? schema.definitions?.[OpenApiRefResolver.extractRefName(meta.$ref)];
            if (resolvedDef) {
                if (pathNodes.has(resolvedDef) || activeNodes?.has(resolvedDef)) {
                    Logger.warn(
                        "[MetaUI SchemaNormalizer]",
                        `Circular $ref definition detected (${meta.$ref}) while resolving scope '${element.scope}'; stopping recursion.`
                    );
                    meta = undefined;
                    break;
                }
                pathNodes.add(resolvedDef);
            }
        }
        if (i < pathSegments.length - 1) {
            current = meta.properties || resolvedDef?.properties;
        }
    }
    if (!meta) {
        Logger.warn("[MetaUI SchemaNormalizer]", `Scope '${element.scope}' does not resolve to a schema property.`);
        Logger.error(`[MetaUI] Property '${propKey}' not found in schema definitions.`, "", layoutName);
        engine.hasPartialRenderingErrors = true;
        return null;
    }
    return { meta, bindingPath, propKey };
}

function walkLayoutElementsLegacy(
    elements: ILayoutElement[],
    schema: ISchema,
    engine: Engine,
    sink: ILayoutWalkerSink,
    layoutName: string,
    depth: number = 0,
    activeNodes: WeakSet<object> = new WeakSet<object>(),
    activeRefs: Set<string> = new Set<string>()
): number {
    if (depth > MAX_LAYOUT_DEPTH) {
        Logger.warn(`[MetaUI ${layoutName}] Max layout nesting depth (${MAX_LAYOUT_DEPTH}) exceeded.`, "", layoutName);
        return 0;
    }
    let controlCount = 0;
    for (const element of elements) {
        if (activeNodes.has(element)) {
            Logger.warn(
                `[MetaUI ${layoutName}] Circular layout element reference detected; stopping recursion.`,
                "",
                layoutName
            );
            continue;
        }
        activeNodes.add(element);
        try {
            if (element.type === "HorizontalLayout") {
                if (element.label) {
                    sink.onSectionHeader?.(element.label, element.type);
                }
                if (sink.onHorizontalControls) {
                    const directControls = (element.elements || []).filter((e) => e.type === "Control");
                    const nonControls = (element.elements || []).filter((e) => e.type !== "Control");
                    const resolvedControls: IResolvedLayoutControl[] = [];
                    for (const ctrlEl of directControls) {
                        const resolved = resolveControlElementLegacy(
                            ctrlEl,
                            schema,
                            engine,
                            layoutName,
                            activeNodes,
                            activeRefs
                        );
                        if (resolved) {
                            resolvedControls.push({ element: ctrlEl, ...resolved });
                        }
                    }
                    controlCount += resolvedControls.length;
                    if (resolvedControls.length > 0) {
                        sink.onHorizontalControls(resolvedControls);
                    }
                    if (nonControls.length > 0) {
                        controlCount += walkLayoutElementsLegacy(
                            nonControls,
                            schema,
                            engine,
                            sink,
                            layoutName,
                            depth + 1,
                            activeNodes,
                            activeRefs
                        );
                    }
                } else {
                    sink.onEnterContainer?.(element);
                    if (Array.isArray(element.elements) && element.elements.length > 0) {
                        controlCount += walkLayoutElementsLegacy(
                            element.elements,
                            schema,
                            engine,
                            sink,
                            layoutName,
                            depth + 1,
                            activeNodes,
                            activeRefs
                        );
                    }
                    sink.onExitContainer?.(element);
                }
            } else if (
                element.type === "Group" ||
                element.type === "WizardStep" ||
                element.type === "VerticalLayout"
            ) {
                sink.onEnterContainer?.(element);
                if (element.label) {
                    sink.onSectionHeader?.(element.label, element.type);
                }
                if (Array.isArray(element.elements) && element.elements.length > 0) {
                    controlCount += walkLayoutElementsLegacy(
                        element.elements,
                        schema,
                        engine,
                        sink,
                        layoutName,
                        depth + 1,
                        activeNodes,
                        activeRefs
                    );
                }
                sink.onExitContainer?.(element);
            } else if (element.type === "Control") {
                const resolved = resolveControlElementLegacy(
                    element,
                    schema,
                    engine,
                    layoutName,
                    activeNodes,
                    activeRefs
                );
                if (!resolved) {
                    continue;
                }
                controlCount++;
                const decision = LayoutScorer.getDecision(schema, element.scope);
                activeNodes.add(resolved.meta);
                if (resolved.meta.$ref) {
                    activeRefs.add(resolved.meta.$ref);
                }
                try {
                    if (sink.onTableSubLayout && ArraySubSchemaFactory.isTableSubLayout(resolved.meta, decision)) {
                        sink.onTableSubLayout(element, resolved.bindingPath, resolved.propKey, resolved.meta);
                    } else {
                        sink.onScalarField(element, resolved.bindingPath, resolved.meta);
                    }
                } finally {
                    activeNodes.delete(resolved.meta);
                    if (resolved.meta.$ref) {
                        activeRefs.delete(resolved.meta.$ref);
                    }
                }
            } else {
                Logger.warn(`[MetaUI] Unsupported layout element type '${element.type}'.`, "", layoutName);
            }
        } finally {
            activeNodes.delete(element);
        }
    }
    return controlCount;
}

/** Oracle 10: PayloadValidator.validateTree legacy implementation (with Stage 1 path-scoped cycle detection). */
function mergeResolvedDefinitionLegacy<T extends IPropertyMetadata | ISchema>(resolved: T, local: T): T {
    const merged: Record<string, unknown> = { ...(resolved as Record<string, unknown>) };
    for (const [key, value] of Object.entries(local as Record<string, unknown>)) {
        if (value !== undefined) {
            merged[key] = value;
        }
    }
    const resolvedRec = resolved as Record<string, unknown>;
    const localRec = local as Record<string, unknown>;
    merged.type = resolvedRec.type || localRec.type || "object";
    merged.properties = resolvedRec.properties || localRec.properties;
    merged.items = resolvedRec.items || localRec.items;
    return merged as T;
}

function validateTreeLegacy(
    metadata: IPropertyMetadata,
    value: unknown,
    resolveDefinition?: (ref: string) => ISchema | null,
    depth: number = 0,
    isDynamicallyRequired?: boolean,
    activeNodes: WeakSet<object> = new WeakSet<object>(),
    activeRefs: Set<string> = new Set<string>()
): { isValid: boolean; errorMessage?: string } {
    if (depth > MAX_SCHEMA_DEPTH) {
        Logger.warn(
            "[MetaUI PayloadValidator]",
            `Payload nesting exceeded MAX_SCHEMA_DEPTH (${MAX_SCHEMA_DEPTH}); this subtree was reported ` +
                `valid without being validated.`,
            "PayloadValidator"
        );
        return { isValid: true };
    }
    if (metadata.ui?.visible === false) {
        return { isValid: true };
    }
    if (activeNodes.has(metadata)) {
        Logger.warn(
            "[MetaUI PayloadValidator]",
            "Circular schema reference detected; stopping recursion to prevent infinite loop.",
            "PayloadValidator"
        );
        return { isValid: true };
    }
    if (metadata.$ref && activeRefs.has(metadata.$ref)) {
        Logger.warn(
            "[MetaUI PayloadValidator]",
            `Circular $ref detected (${metadata.$ref}); stopping recursion to prevent infinite loop.`,
            "PayloadValidator"
        );
        return { isValid: true };
    }

    let effectiveMeta: IPropertyMetadata = metadata;
    let resolved: ISchema | null = null;
    let resolvedRequiredList: string[] | undefined;
    if (metadata.$ref && resolveDefinition) {
        resolved = resolveDefinition(metadata.$ref);
        if (resolved) {
            if (activeNodes.has(resolved)) {
                Logger.warn(
                    "[MetaUI PayloadValidator]",
                    `Circular $ref definition detected (${metadata.$ref}); stopping recursion to prevent infinite loop.`,
                    "PayloadValidator"
                );
                return { isValid: true };
            }
            effectiveMeta = mergeResolvedDefinitionLegacy(resolved as IPropertyMetadata, metadata);
            if (Array.isArray(resolved.required)) {
                resolvedRequiredList = resolved.required;
            }
        }
    }

    activeNodes.add(metadata);
    if (metadata.$ref) {
        activeRefs.add(metadata.$ref);
    }
    if (resolved) {
        activeNodes.add(resolved);
    }

    try {
        const selfResult = PipelineManager.getInstance().runValidators(value, effectiveMeta, isDynamicallyRequired);
        if (!selfResult.isValid) {
            return selfResult;
        }
        if (value === undefined || value === null) {
            return { isValid: true };
        }
        if (!PayloadValidator.matchesStructuralType(effectiveMeta, value)) {
            return { isValid: false, errorMessage: I18n.getText(TEXT_KEY.invalidValue) };
        }
        if (effectiveMeta.not) {
            if (!PayloadValidator.isEvaluableNot(effectiveMeta.not)) {
                Logger.warn(
                    "[MetaUI PayloadValidator]",
                    "A 'not' sub-schema declares no constraint this engine can evaluate; it is not enforced. " +
                        "Give it one of: const, enum, pattern, format, maxLength, minLength, minimum, maximum, " +
                        "exclusiveMinimum, exclusiveMaximum, multipleOf, maxItems, minItems, uniqueItems, " +
                        "maxProperties, minProperties, properties, items, not."
                );
            } else {
                const matches = validateTreeLegacy(
                    effectiveMeta.not,
                    value,
                    resolveDefinition,
                    depth + 1,
                    undefined,
                    activeNodes,
                    activeRefs
                ).isValid;
                if (matches) {
                    return { isValid: false, errorMessage: I18n.getText(TEXT_KEY.invalidValue) };
                }
            }
        }
        if (effectiveMeta.type === "object" && isRecord(value)) {
            if (effectiveMeta.properties) {
                for (const [propKey, rawPropMeta] of Object.entries(effectiveMeta.properties)) {
                    if (rawPropMeta.ui?.visible === false) {
                        continue;
                    }
                    const needsReqOverride =
                        Boolean(resolvedRequiredList && resolvedRequiredList.includes(propKey)) &&
                        rawPropMeta.required === undefined &&
                        !activeNodes.has(rawPropMeta);
                    const propMeta: IPropertyMetadata = needsReqOverride
                        ? { ...rawPropMeta, required: true }
                        : rawPropMeta;
                    if (needsReqOverride) {
                        activeNodes.add(rawPropMeta);
                    }
                    let childResult: { isValid: boolean; errorMessage?: string };
                    try {
                        childResult = validateTreeLegacy(
                            propMeta,
                            value[propKey],
                            resolveDefinition,
                            depth + 1,
                            undefined,
                            activeNodes,
                            activeRefs
                        );
                    } finally {
                        if (needsReqOverride) {
                            activeNodes.delete(rawPropMeta);
                        }
                    }
                    if (!childResult.isValid) {
                        const label = propMeta.ui?.label || propKey;
                        return {
                            isValid: false,
                            errorMessage: I18n.getText(TEXT_KEY.fieldPrefix, [
                                label,
                                childResult.errorMessage || I18n.getText(TEXT_KEY.invalidValue)
                            ])
                        };
                    }
                }
            }
            if (effectiveMeta.additionalProperties && typeof effectiveMeta.additionalProperties === "object") {
                const valueMeta = effectiveMeta.additionalProperties;
                for (const [entryKey, entryVal] of Object.entries(value)) {
                    if (effectiveMeta.properties && entryKey in effectiveMeta.properties) {
                        continue;
                    }
                    const entryResult = validateTreeLegacy(
                        valueMeta,
                        entryVal,
                        resolveDefinition,
                        depth + 1,
                        undefined,
                        activeNodes,
                        activeRefs
                    );
                    if (!entryResult.isValid) {
                        return {
                            isValid: false,
                            errorMessage: I18n.getText(TEXT_KEY.fieldPrefix, [
                                entryKey,
                                entryResult.errorMessage || I18n.getText(TEXT_KEY.invalidValue)
                            ])
                        };
                    }
                }
            }
        }
        if (effectiveMeta.type === "array" && Array.isArray(value) && effectiveMeta.items) {
            const itemMeta = effectiveMeta.items;
            for (let i = 0; i < value.length; i++) {
                const itemResult = validateTreeLegacy(
                    itemMeta,
                    value[i],
                    resolveDefinition,
                    depth + 1,
                    undefined,
                    activeNodes,
                    activeRefs
                );
                if (!itemResult.isValid) {
                    return {
                        isValid: false,
                        errorMessage: I18n.getText(TEXT_KEY.rowPrefix, [
                            i + 1,
                            itemResult.errorMessage || I18n.getText(TEXT_KEY.invalidItem)
                        ])
                    };
                }
            }
        }
        return { isValid: true };
    } finally {
        activeNodes.delete(metadata);
        if (metadata.$ref) {
            activeRefs.delete(metadata.$ref);
        }
        if (resolved) {
            activeNodes.delete(resolved);
        }
    }
}

/** Oracle 11: DataInferenceBuilder.inferPropertiesFromObject legacy implementation. */
function isValidIsoDateStringLegacy(value: string): boolean {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) {
        return false;
    }
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) {
        return false;
    }
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return (
        parsed.getUTCFullYear() === year &&
        parsed.getUTCMonth() === month - 1 &&
        parsed.getUTCDate() === day
    );
}

function inferPrimitiveTypeLegacy(value: unknown): FieldType {
    if (value instanceof Date) return SCHEMA_TYPE.DATE;
    if (typeof value === "number") return SCHEMA_TYPE.NUMBER;
    if (typeof value === "boolean") return SCHEMA_TYPE.BOOLEAN;
    if (typeof value === "string" && isValidIsoDateStringLegacy(value)) return SCHEMA_TYPE.DATE;
    return SCHEMA_TYPE.STRING;
}

function inferPropertiesFromObjectLegacy(
    obj: JsonRecord,
    depth: number = 0,
    seen: WeakSet<object> = new WeakSet()
): Record<string, IPropertyMetadata> {
    if (depth >= MAX_SCHEMA_DEPTH) {
        Logger.warn(
            "[MetaUI DataInferenceBuilder]",
            `Maximum inference depth (${MAX_SCHEMA_DEPTH}) reached; truncating nested inference.`,
            "DataInferenceBuilder"
        );
        return {};
    }
    seen.add(obj);
    const properties: Record<string, IPropertyMetadata> = {};
    for (const key of Object.keys(obj)) {
        const val = obj[key];
        let type: FieldType = SCHEMA_TYPE.STRING;
        let items: IPropertyMetadata | undefined;
        let nestedProps: Record<string, IPropertyMetadata> | undefined;
        if (Array.isArray(val)) {
            type = SCHEMA_TYPE.ARRAY;
            if (seen.has(val) || depth + 1 >= MAX_SCHEMA_DEPTH) {
                if (depth + 1 >= MAX_SCHEMA_DEPTH) {
                    Logger.warn(
                        "[MetaUI DataInferenceBuilder]",
                        `Maximum inference depth (${MAX_SCHEMA_DEPTH}) reached on array '${key}'; truncating nested inference.`,
                        "DataInferenceBuilder"
                    );
                }
                items = { type: SCHEMA_TYPE.STRING };
            } else {
                seen.add(val);
                const firstNonNull: unknown = val.find((el) => el !== null && el !== undefined);
                if (val.length === 0 || firstNonNull === undefined) {
                    items = { type: SCHEMA_TYPE.STRING };
                } else if (!isRecord(firstNonNull)) {
                    items = { type: inferPrimitiveTypeLegacy(firstNonNull) };
                } else {
                    let merged: Record<string, IPropertyMetadata> = {};
                    const limit = Math.min(val.length, 50);
                    for (let i = 0; i < limit; i++) {
                        const row = val[i];
                        if (isRecord(row) && !seen.has(row)) {
                            merged = DataInferenceBuilder.mergeInferredProperties(
                                merged,
                                inferPropertiesFromObjectLegacy(row, depth + 1, seen)
                            );
                        }
                    }
                    items = { type: SCHEMA_TYPE.OBJECT, properties: merged };
                }
                seen.delete(val);
            }
        } else if (isRecord(val)) {
            if (seen.has(val)) {
                type = SCHEMA_TYPE.STRING;
            } else if (depth + 1 >= MAX_SCHEMA_DEPTH) {
                Logger.warn(
                    "[MetaUI DataInferenceBuilder]",
                    `Maximum inference depth (${MAX_SCHEMA_DEPTH}) reached on object '${key}'; truncating nested inference.`,
                    "DataInferenceBuilder"
                );
                type = SCHEMA_TYPE.OBJECT;
                nestedProps = {};
            } else {
                type = SCHEMA_TYPE.OBJECT;
                nestedProps = inferPropertiesFromObjectLegacy(val, depth + 1, seen);
            }
        } else if (val !== null && val !== undefined) {
            type = inferPrimitiveTypeLegacy(val);
        }
        properties[key] = {
            type,
            items,
            properties: nestedProps,
            nullable: val === null || val === undefined ? true : undefined,
            ui: {
                label: DataInferenceBuilder.generateLabel(key),
                isKey: false,
                readOnly: false,
                widget:
                    type === SCHEMA_TYPE.ARRAY && items?.type !== SCHEMA_TYPE.OBJECT
                        ? WIDGET_TYPE.MULTI_INPUT
                        : undefined
            }
        };
    }
    seen.delete(obj);
    return properties;
}

/** Oracle 12: OpenApiPropertyMapper.mapProperties legacy implementation. */
function mapOpenApiPropertiesLegacy(
    properties: unknown,
    requiredKeys: string[],
    openApiRoot: unknown,
    depth: number = 0,
    activeRefs: Set<string> = new Set()
): Record<string, IPropertyMetadata> {
    const normalizedProps: Record<string, IPropertyMetadata> = {};
    if (depth > MAX_SCHEMA_DEPTH) {
        Logger.warn(
            `Nested schema exceeded MAX_SCHEMA_DEPTH (${MAX_SCHEMA_DEPTH}); ` +
                `${isRecord(properties) ? Object.keys(properties).length : 0} propert(ies) were dropped.`,
            undefined,
            "OpenApiPropertyMapper"
        );
        return normalizedProps;
    }
    if (!isRecord(properties)) {
        return normalizedProps;
    }
    for (const key of Object.keys(properties)) {
        const isRequired = requiredKeys.includes(key);
        const rawProp = properties[key];
        const propDef: JsonRecord = isRecord(rawProp) ? rawProp : {};
        normalizedProps[key] = mapOpenApiPropertyMetadataLegacy(propDef, key, isRequired, openApiRoot, depth, activeRefs);
    }
    return normalizedProps;
}

function mapOpenApiPropertyMetadataLegacy(
    swaggerProp: unknown,
    keyName: string,
    isRequired: boolean,
    openApiRoot: unknown,
    depth: number = 0,
    activeRefs: Set<string> = new Set()
): IPropertyMetadata {
    if (depth > MAX_SCHEMA_DEPTH) {
        Logger.warn(
            `Property '${keyName}' exceeded MAX_SCHEMA_DEPTH (${MAX_SCHEMA_DEPTH}); ` +
                `its type and constraints were not mapped.`,
            undefined,
            "OpenApiPropertyMapper"
        );
        return {
            type: "object",
            ui: { label: DataInferenceBuilder.generateLabel(keyName) }
        };
    }
    let currentProp: JsonRecord = isRecord(swaggerProp) ? swaggerProp : {};
    const refPath = readString(currentProp, "$ref");
    if (refPath) {
        const uiDirective = OpenApiUIMapper.build(currentProp, keyName);
        if (activeRefs.has(refPath)) {
            return {
                type: "object",
                $ref: refPath,
                title: readString(currentProp, "title"),
                description: readString(currentProp, "description"),
                required: isRequired,
                nullable: readBoolean(currentProp, "nullable"),
                readOnly: readBoolean(currentProp, "readOnly"),
                ui: { ...uiDirective, widget: WIDGET_TYPE.REFERENCE }
            };
        }
        const resolvedRaw = OpenApiRefResolver.resolve(refPath, openApiRoot);
        const resolved = isRecord(resolvedRaw) ? resolvedRaw : undefined;
        const resolvedType = readString(currentProp, "type") || (resolved ? readString(resolved, "type") : undefined);
        const isPolymorphicRef =
            resolved !== undefined &&
            (Array.isArray(resolved.oneOf) || Array.isArray(resolved.anyOf) || resolved.discriminator !== undefined);
        if (
            (resolvedType && ["string", "number", "integer", "boolean"].includes(resolvedType)) ||
            isPolymorphicRef ||
            keyName === "items"
        ) {
            const inlineProp: JsonRecord = { ...(resolved || {}), ...currentProp };
            delete inlineProp.$ref;
            const nextRefs = new Set(activeRefs);
            nextRefs.add(refPath);
            const mapped = mapOpenApiPropertyMetadataLegacy(inlineProp, keyName, isRequired, openApiRoot, depth + 1, nextRefs);
            if (keyName === "items") {
                mapped.$ref = refPath;
            }
            return mapped;
        }
        return {
            type: "object",
            $ref: refPath,
            title: readString(currentProp, "title") || (resolved ? readString(resolved, "title") : undefined),
            description: readString(currentProp, "description") || (resolved ? readString(resolved, "description") : undefined),
            required: isRequired,
            nullable: readBoolean(currentProp, "nullable"),
            readOnly: readBoolean(currentProp, "readOnly"),
            ui: { ...uiDirective, widget: WIDGET_TYPE.REFERENCE }
        };
    }

    currentProp = OpenApiConstraintMapper.resolveAllOf(currentProp, openApiRoot, 0, activeRefs);
    const { type } = SchemaDirectiveNormalizer.resolveSchemaType(currentProp);
    const metaProp: IPropertyMetadata = {
        type,
        title: readString(currentProp, "title"),
        description: readString(currentProp, "description"),
        format: readString(currentProp, "format"),
        required: isRequired
    };
    const uiDirective = OpenApiUIMapper.build(currentProp, keyName);
    if (Object.keys(uiDirective).length > 0) {
        metaProp.ui = uiDirective;
    }
    OpenApiConstraintMapper.applyConstraints(metaProp, currentProp);
    OpenApiConstraintMapper.applyStateModifiers(metaProp, currentProp);
    const mappedLayout = SchemaDirectiveNormalizer.normalizeLayout(currentProp.uiLayout);
    if (mappedLayout) {
        metaProp.uiLayout = mappedLayout;
    }
    const enumValues = SchemaDirectiveNormalizer.normalizeEnum(currentProp.enum);
    if (enumValues) {
        metaProp.enum = enumValues;
        metaProp.valueHelp = enumValues.map((val) => ({ key: String(val), text: String(val) }));
        metaProp.ui = { ...(metaProp.ui || {}), widget: WIDGET_TYPE.SELECT, valueHelp: metaProp.valueHelp };
    } else if (Array.isArray(currentProp.enum)) {
        Logger.error(
            `Property '${keyName}' has an empty 'enum': no value satisfies it. ` +
                `Rendering it as a disabled, empty selection rather than as unconstrained free text.`,
            undefined,
            "OpenApiPropertyMapper"
        );
        metaProp.enum = [];
        metaProp.valueHelp = [];
        metaProp.ui = { ...(metaProp.ui || {}), widget: WIDGET_TYPE.SELECT, valueHelp: [], enabled: false };
    }
    OpenApiConstraintMapper.applyDiscriminator(metaProp, currentProp);
    if (Array.isArray(currentProp.oneOf)) {
        metaProp.oneOf = currentProp.oneOf.map((item, i) =>
            mapOpenApiPolymorphicBranchLegacy(item, `Variant${i}`, openApiRoot, depth + 1, activeRefs)
        );
    }
    if (Array.isArray(currentProp.anyOf)) {
        metaProp.anyOf = currentProp.anyOf.map((item, i) =>
            mapOpenApiPolymorphicBranchLegacy(item, `AnyVariant${i}`, openApiRoot, depth + 1, activeRefs)
        );
    }
    if (isRecord(currentProp.not)) {
        metaProp.not = mapOpenApiPropertyMetadataLegacy(currentProp.not, "NotVariant", false, openApiRoot, depth + 1, activeRefs);
    }
    if (metaProp.oneOf || metaProp.anyOf || metaProp.discriminator) {
        metaProp.ui = { ...(metaProp.ui || {}), widget: WIDGET_TYPE.POLYMORPHIC };
    }
    if (type === "object") {
        const rawProps = readRecord(currentProp, "properties");
        if (rawProps) {
            const childRequired = readStringArray(currentProp, "required") || [];
            metaProp.properties = mapOpenApiPropertiesLegacy(rawProps, childRequired, openApiRoot, depth + 1, activeRefs);
        }
        if (currentProp.additionalProperties === true) {
            metaProp.additionalProperties = true;
        } else if (currentProp.additionalProperties === false) {
            metaProp.additionalProperties = false;
        } else if (isRecord(currentProp.additionalProperties)) {
            metaProp.additionalProperties = mapOpenApiPropertyMetadataLegacy(
                currentProp.additionalProperties,
                "value",
                false,
                openApiRoot,
                depth + 1,
                activeRefs
            );
            metaProp.ui = { ...(metaProp.ui || {}), widget: WIDGET_TYPE.DICTIONARY_MAP };
        }
        if (
            !rawProps &&
            !currentProp.additionalProperties &&
            !metaProp.oneOf &&
            !metaProp.anyOf &&
            !metaProp.enum &&
            !metaProp.format &&
            !metaProp.ui?.widget
        ) {
            metaProp.ui = { ...(metaProp.ui || {}), widget: WIDGET_TYPE.CODE_EDITOR };
        }
    } else if (type === "array" && isRecord(currentProp.items)) {
        metaProp.items = mapOpenApiPropertyMetadataLegacy(currentProp.items, "items", false, openApiRoot, depth + 1, activeRefs);
        if (metaProp.items.type !== "object") {
            const itemEnum = metaProp.items.enum;
            metaProp.ui = {
                ...(metaProp.ui || {}),
                widget: itemEnum && itemEnum.length > 0 ? WIDGET_TYPE.MULTI_SELECT : WIDGET_TYPE.MULTI_INPUT
            };
        }
    }
    return metaProp;
}

function mapOpenApiPolymorphicBranchLegacy(
    rawItem: unknown,
    fallbackName: string,
    openApiRoot: unknown,
    depth: number,
    activeRefs: Set<string>
): IPropertyMetadata {
    if (!isRecord(rawItem)) {
        return mapOpenApiPropertyMetadataLegacy({}, fallbackName, false, openApiRoot, depth, activeRefs);
    }
    const refPath = readString(rawItem, "$ref");
    if (refPath && !activeRefs.has(refPath)) {
        const refName = OpenApiRefResolver.extractRefName(refPath);
        const resolved = OpenApiRefResolver.resolve(refPath, openApiRoot);
        if (isRecord(resolved)) {
            const inlined: JsonRecord = {
                ...resolved,
                ...rawItem,
                title: readString(rawItem, "title") || readString(resolved, "title") || refName
            };
            delete inlined.$ref;
            const nextRefs = new Set(activeRefs);
            nextRefs.add(refPath);
            const mapped = mapOpenApiPropertyMetadataLegacy(inlined, refName, false, openApiRoot, depth, nextRefs);
            mapped.$ref = refPath;
            mapped.title = readString(inlined, "title") || refName;
            const resolvedReq = readStringArray(inlined, "required");
            if (resolvedReq) {
                mapped.required = resolvedReq;
            }
            return mapped;
        }
    }
    const explicitTitle = readString(rawItem, "title");
    const mapped = mapOpenApiPropertyMetadataLegacy(rawItem, explicitTitle || "", false, openApiRoot, depth, activeRefs);
    if (!explicitTitle && mapped.ui && !mapped.ui.label) {
        delete mapped.ui.label;
    }
    const branchReq = readStringArray(rawItem, "required");
    if (branchReq) {
        mapped.required = branchReq;
    }
    return mapped;
}

/** Oracle 13: SchemaNormalizer.stripWriteOnlyValues legacy implementation. */
function stripWriteOnlyValuesLegacy(
    meta: ISchema | IPropertyMetadata | undefined,
    data: unknown,
    definitions: Record<string, ISchema> | undefined,
    depth: number = 0
): void {
    if (depth > MAX_SCHEMA_DEPTH) {
        Logger.warn(
            "[MetaUI SchemaNormalizer]",
            `Payload nesting exceeded MAX_SCHEMA_DEPTH (${MAX_SCHEMA_DEPTH}) while stripping writeOnly values; ` +
                `any writeOnly field below this level was left in the outbound payload.`
        );
        return;
    }
    if (!meta || data === null || typeof data !== "object") {
        return;
    }
    const ref = "$ref" in meta ? meta.$ref : undefined;
    const node = ref && definitions ? definitions[OpenApiRefResolver.extractRefName(ref)] || meta : meta;
    if (Array.isArray(data)) {
        for (const entry of data) {
            stripWriteOnlyValuesLegacy(node.items, entry, definitions, depth + 1);
        }
        return;
    }
    const record = data as JsonRecord;
    const declared = node.properties;
    if (declared) {
        for (const key of Object.keys(declared)) {
            if (!(key in record)) {
                continue;
            }
            if (declared[key].writeOnly === true) {
                delete record[key];
            } else {
                stripWriteOnlyValuesLegacy(declared[key], record[key], definitions, depth + 1);
            }
        }
    }
    const additional = node.additionalProperties;
    if (typeof additional !== "object" || additional === null) {
        return;
    }
    for (const key of Object.keys(record)) {
        if (declared && key in declared) {
            continue;
        }
        if (additional.writeOnly === true) {
            delete record[key];
        } else {
            stripWriteOnlyValuesLegacy(additional, record[key], definitions, depth + 1);
        }
    }
}

function normalizeSchemaListLegacy(
    raw: unknown,
    rootSchema?: JsonRecord,
    depth: number = 0,
    activeRefs: Set<string> = new Set()
): IPropertyMetadata[] | undefined {
    if (!Array.isArray(raw)) {
        return undefined;
    }
    if (depth > MAX_SCHEMA_DEPTH) {
        Logger.warn(
            "[MetaUI SchemaNormalizer]",
            `A polymorphic branch list exceeded MAX_SCHEMA_DEPTH (${MAX_SCHEMA_DEPTH}); ` +
                `${raw.length} branch(es) were dropped.`
        );
        return undefined;
    }
    return raw.filter(isRecord).map((entry) => {
        let sourceEntry: JsonRecord = entry;
        const refPath = readString(entry, "$ref");
        let fallbackKey = readString(entry, "title") || "";
        const nextRefs = new Set(activeRefs);
        if (refPath && rootSchema) {
            const refName = OpenApiRefResolver.extractRefName(refPath);
            fallbackKey = fallbackKey || refName;
            if (nextRefs.has(refPath)) {
                return {
                    type: SCHEMA_TYPE.OBJECT,
                    $ref: refPath,
                    title: fallbackKey,
                    ui: { label: fallbackKey, widget: WIDGET_TYPE.REFERENCE }
                };
            }
            nextRefs.add(refPath);
            const resolved = OpenApiRefResolver.resolve(refPath, rootSchema);
            if (isRecord(resolved)) {
                sourceEntry = {
                    ...resolved,
                    ...entry,
                    title: readString(entry, "title") || readString(resolved, "title") || refName
                };
                delete sourceEntry.$ref;
            }
        }
        const normalizedBranch = normalizePropertyMetadataLegacy(
            sourceEntry,
            fallbackKey,
            false,
            rootSchema,
            undefined,
            depth,
            nextRefs
        );
        if (refPath) {
            normalizedBranch.$ref = refPath;
        }
        const branchReq = readStringArray(sourceEntry, "required");
        if (branchReq) {
            normalizedBranch.required = branchReq;
        }
        return normalizedBranch;
    });
}

function normalizePropertyMetadataLegacy(
    rawProp: JsonRecord,
    keyName: string,
    isRequired: boolean,
    rootSchema?: JsonRecord,
    data?: unknown,
    depth: number = 0,
    activeRefs: Set<string> = new Set()
): IPropertyMetadata {
    if (depth > MAX_SCHEMA_DEPTH) {
        Logger.warn(
            "[MetaUI SchemaNormalizer]",
            `Property '${keyName}' exceeded MAX_SCHEMA_DEPTH (${MAX_SCHEMA_DEPTH}); ` +
                `its type and constraints were not normalized.`
        );
        return { type: SCHEMA_TYPE.OBJECT, ui: { label: DataInferenceBuilder.generateLabel(keyName) } };
    }
    const rawAllOf = rawProp.allOf;
    const prop: JsonRecord = Array.isArray(rawAllOf)
        ? OpenApiConstraintMapper.resolveAllOf(rawProp, rootSchema, 0, activeRefs)
        : rawProp;
    const { type, hasNullType } = SchemaDirectiveNormalizer.resolveSchemaType(prop, keyName);
    const rawUi = readRecord(prop, "ui") || {};
    const valueHelp = SchemaDirectiveNormalizer.normalizeValueHelp(prop.valueHelp ?? rawUi.valueHelp);
    const enumValues = SchemaDirectiveNormalizer.normalizeEnum(prop.enum);
    const itemsRecord = readRecord(prop, "items");
    const itemsEnum = itemsRecord ? SchemaDirectiveNormalizer.normalizeEnum(itemsRecord.enum) : undefined;
    const hasChoices = Array.isArray(valueHelp) || !!enumValues || !!itemsEnum;

    const normalized: IPropertyMetadata = {
        type,
        $ref: readString(prop, "$ref"),
        title: readString(prop, "title"),
        description: readString(prop, "description"),
        format: readString(prop, "format"),
        const: prop.const === undefined ? undefined : deepClone(prop.const),
        ui: SchemaDirectiveNormalizer.normalizeUI(rawUi, prop, keyName, type, hasChoices),
        required: isRequired || prop.required === true,
        maxLength: readNumber(prop, "maxLength"),
        minLength: readNumber(prop, "minLength"),
        minimum: readNumber(prop, "minimum"),
        maximum: readNumber(prop, "maximum"),
        pattern: readString(prop, "pattern"),
        multipleOf: readNumber(prop, "multipleOf"),
        valueHelp,
        enum: enumValues,
        default: prop.default === undefined ? undefined : deepClone(prop.default),
        nullable: readBoolean(prop, "nullable") ?? (hasNullType ? true : undefined),
        writeOnly: readBoolean(prop, "writeOnly"),
        readOnly: readBoolean(prop, "readOnly"),
        example: prop.example === undefined ? undefined : deepClone(prop.example),
        exclusiveMinimum: readBoolean(prop, "exclusiveMinimum") ?? readNumber(prop, "exclusiveMinimum"),
        exclusiveMaximum: readBoolean(prop, "exclusiveMaximum") ?? readNumber(prop, "exclusiveMaximum"),
        maxItems: readNumber(prop, "maxItems"),
        minItems: readNumber(prop, "minItems"),
        uniqueItems: readBoolean(prop, "uniqueItems"),
        maxProperties: readNumber(prop, "maxProperties"),
        minProperties: readNumber(prop, "minProperties"),
        oneOf: normalizeSchemaListLegacy(prop.oneOf, rootSchema, depth + 1, activeRefs),
        anyOf: normalizeSchemaListLegacy(prop.anyOf, rootSchema, depth + 1, activeRefs),
        allOf: normalizeSchemaListLegacy(rawAllOf, rootSchema, depth + 1, activeRefs),
        not: isRecord(prop.not)
            ? normalizePropertyMetadataLegacy(prop.not, keyName, false, rootSchema, undefined, depth + 1, activeRefs)
            : undefined,
        discriminator: SchemaDirectiveNormalizer.normalizeDiscriminator(prop.discriminator),
        uiLayout: SchemaDirectiveNormalizer.normalizeLayout(prop.uiLayout)
    };

    const additional = prop.additionalProperties;
    if (typeof additional === "boolean") {
        normalized.additionalProperties = additional;
    } else if (isRecord(additional)) {
        normalized.additionalProperties = normalizePropertyMetadataLegacy(
            additional,
            "value",
            false,
            rootSchema,
            undefined,
            depth + 1,
            activeRefs
        );
    }

    let rawProperties = readRecord(prop, "properties");
    const rawItems = readRecord(prop, "items");

    if (type === SCHEMA_TYPE.OBJECT) {
        if (additional === true && isRecord(data)) {
            const inferredChild = DataInferenceBuilder.inferPropertiesFromObject(data);
            rawProperties = DataInferenceBuilder.mergeHybridProperties(inferredChild, rawProperties || {});
        }
        if (rawProperties) {
            normalized.properties = normalizePropertiesLegacy(
                rawProperties,
                readStringArray(prop, "required") || [],
                rootSchema,
                data,
                depth + 1,
                activeRefs
            );
        }
    } else if (type === SCHEMA_TYPE.ARRAY) {
        let itemsSource: JsonRecord | undefined =
            rawItems ||
            (rawProperties ? { type: SCHEMA_TYPE.OBJECT, properties: rawProperties, required: prop.required } : undefined);
        if (itemsSource) {
            if (itemsSource.additionalProperties === true && Array.isArray(data)) {
                const inferredItemProps = DataInferenceBuilder.inferPropertiesFromRows(data);
                itemsSource = {
                    ...itemsSource,
                    properties: DataInferenceBuilder.mergeHybridProperties(
                        inferredItemProps,
                        readRecord(itemsSource, "properties") || {}
                    )
                };
            }
            const sampleRow = Array.isArray(data) ? data.find(isRecord) : undefined;
            normalized.items = normalizePropertyMetadataLegacy(
                itemsSource,
                "items",
                false,
                rootSchema,
                sampleRow,
                depth + 1,
                activeRefs
            );
        }
    }

    return normalized;
}

function normalizePropertiesLegacy(
    properties: JsonRecord,
    requiredKeys: string[],
    rootSchema?: JsonRecord,
    data?: unknown,
    depth: number = 0,
    activeRefs: Set<string> = new Set()
): Record<string, IPropertyMetadata> {
    const normalizedProps: Record<string, IPropertyMetadata> = {};
    if (depth > MAX_SCHEMA_DEPTH) {
        Logger.warn(
            "[MetaUI SchemaNormalizer]",
            `Nested schema exceeded MAX_SCHEMA_DEPTH (${MAX_SCHEMA_DEPTH}); ` +
                `${Object.keys(properties).length} propert(ies) were dropped.`
        );
        return normalizedProps;
    }
    for (const key of Object.keys(properties)) {
        const raw = properties[key];
        if (!isRecord(raw)) {
            Logger.warn(
                "[MetaUI SchemaNormalizer]",
                `Property '${key}' is not a schema object; treating it as a plain string field.`
            );
        }
        const childData = isRecord(data) ? data[key] : undefined;
        normalizedProps[key] = normalizePropertyMetadataLegacy(
            isRecord(raw) ? raw : {},
            key,
            requiredKeys.includes(key),
            rootSchema,
            childData,
            depth,
            activeRefs
        );
    }
    return normalizedProps;
}

// ============================================================================
// 4. Stage 3 Differential Parity Suites
// ============================================================================

describe("SchemaWalker Differential Parity — Adversarial Corpus & Stage 1 Cross-Check", () => {
    const adversarialCases = buildAdversarialSchemas();

    it("walks all 9 hand-written adversarial schemas deterministically without hanging or dropping diamond branches", () => {
        for (const testCase of adversarialCases) {
            const visitedScopes: string[] = [];
            const truncations: Array<{ scope: string; reason: "depth" | "cycle" }> = [];
            SchemaWalker.walk(
                testCase.schema,
                (ctx: ISchemaVisitContext) => {
                    visitedScopes.push(ctx.scope);
                },
                {
                    onTruncate: (scope, reason) => truncations.push({ scope, reason })
                }
            );

            if (testCase.name.startsWith("1.")) {
                assert.ok(visitedScopes.includes("#/properties/rootA/properties/toB/properties/toC"));
                assert.deepEqual(truncations, [
                    { scope: "#/properties/rootA/properties/toB/properties/toC/properties/backToA", reason: "cycle" }
                ]);
            } else if (testCase.name.startsWith("2.")) {
                assert.ok(visitedScopes.includes("#/properties/chained/properties/resolvedLeaf"));
                assert.equal(truncations.length, 0);
            } else if (testCase.name.startsWith("3.")) {
                assert.ok(visitedScopes.includes("#/properties/matrix/items/items/properties/cellId"));
                assert.equal(truncations.length, 0);
            } else if (testCase.name.startsWith("4.")) {
                assert.ok(visitedScopes.includes("#/properties/branchLeft/properties/code"));
                assert.ok(visitedScopes.includes("#/properties/branchRight/properties/code"));
                assert.equal(truncations.length, 2);
            } else if (testCase.name.startsWith("6.")) {
                assert.equal(truncations.length, 1);
                assert.equal(truncations[0].reason, "depth");
            } else if (testCase.name.startsWith("7.")) {
                assert.deepEqual(visitedScopes, ["#/properties/emptyContainer"]);
            } else if (testCase.name.startsWith("8.")) {
                assert.ok(visitedScopes.includes("#/properties/untypedItemsArr/items/properties/implicitObjField"));
            } else if (testCase.name.startsWith("9.")) {
                assert.ok(visitedScopes.includes("#/properties/items"));
                assert.ok(visitedScopes.includes("#/properties/properties/properties/items/items/properties/properties"));
            }
        }
    });

    it("cross-checks Stage 1 cycle fixes (PayloadValidator and LayoutElementWalker) against SchemaWalker over the generated corpus", () => {
        fc.assert(
            fc.property(arbGeneratedSchema, (schema) => {
                const walkerTruncations: Array<{ scope: string; reason: "depth" | "cycle" }> = [];
                const walkerScopes: string[] = [];
                SchemaWalker.walk(
                    schema,
                    (ctx) => {
                        walkerScopes.push(ctx.scope);
                    },
                    {
                        onTruncate: (scope, reason) => walkerTruncations.push({ scope, reason })
                    }
                );

                const resolveDef = (ref: string): ISchema | null => {
                    const key = OpenApiRefResolver.extractRefName(ref);
                    return schema.definitions?.[key] || null;
                };
                const { value: valRes, entries: valLogs } = withLogCapture(() =>
                    PayloadValidator.validateTree(schema, {}, resolveDef)
                );
                assert.equal(typeof valRes.isValid, "boolean");
                // Any cycle detected by SchemaWalker on a root object without missing data must never cause PayloadValidator to hit MAX_SCHEMA_DEPTH
                const hasDepthOverflowInValidator = valLogs.some((e) => logText(e).includes("MAX_SCHEMA_DEPTH"));
                assert.equal(hasDepthOverflowInValidator, false, "PayloadValidator must cut cycles before MAX_SCHEMA_DEPTH");

                const elements: ILayoutElement[] = walkerScopes
                    .filter((s) => !s.includes("/items"))
                    .slice(0, 12)
                    .map((scope) => ({ type: "Control" as const, scope }));
                const engineStub = {
                    hasPartialRenderingErrors: false,
                    getSchemaDefinitions: () => schema.definitions
                } as unknown as Engine;
                const scalarScopes: string[] = [];
                LayoutElementWalker.walk(
                    elements,
                    schema,
                    engineStub,
                    {
                        onScalarField: (el) => {
                            if (el.scope) scalarScopes.push(el.scope);
                        }
                    },
                    "FormLayout"
                );
                assert.ok(scalarScopes.length <= elements.length);
            })
        );
    });
});

describe("SchemaWalker Differential Parity — All 13 Walkers", () => {
    const adversarialCases = buildAdversarialSchemas();

    it("Parity 1 (utils/TypeGuards.ts): deepClone matches deepCloneLegacy on generated and deep/cyclic payloads", () => {
        fc.assert(
            fc.property(arbArbitraryPayload, (payload) => {
                const { value: actual, entries: actualLogs } = withLogCapture(() => deepClone(payload));
                const { value: expected, entries: expectedLogs } = withLogCapture(() => deepCloneLegacy(payload));
                assert.deepEqual(actual, expected);
                assert.deepEqual(actualLogs.map(logText), expectedLogs.map(logText));
            })
        );
    });

    it("Parity 2 (core/SchemaValidator.ts): validateSchemaStructure matches validateSchemaStructureLegacy", () => {
        for (const adv of adversarialCases) {
            const { value: actual, entries: actualLogs } = withLogCapture(() =>
                SchemaValidator.validateSchemaStructure(adv.schema)
            );
            const { value: expected, entries: expectedLogs } = withLogCapture(() =>
                validateSchemaStructureLegacy(adv.schema)
            );
            assert.deepEqual(actual, expected, `Adversarial case failed: ${adv.name}`);
            assert.deepEqual(actualLogs.map(logText), expectedLogs.map(logText));
        }
        fc.assert(
            fc.property(arbGeneratedSchema, (schema) => {
                const { value: actual, entries: actualLogs } = withLogCapture(() =>
                    SchemaValidator.validateSchemaStructure(schema)
                );
                const { value: expected, entries: expectedLogs } = withLogCapture(() =>
                    validateSchemaStructureLegacy(schema)
                );
                assert.deepEqual(actual, expected);
                assert.deepEqual(actualLogs.map(logText), expectedLogs.map(logText));
            })
        );
    });

    it("Parity 3 (openapi/OpenApiRefResolver.ts): resolve matches resolveRefLegacy on generated and adversarial $refs", () => {
        for (const adv of adversarialCases) {
            const refs = ["#/definitions/NodeA", "#/definitions/Hop1", "#/definitions/SharedCyclic", "#/definitions/Missing"];
            for (const ref of refs) {
                const { value: actual, entries: actualLogs } = withLogCapture(() =>
                    OpenApiRefResolver.resolve(ref, adv.schema)
                );
                const { value: expected, entries: expectedLogs } = withLogCapture(() =>
                    resolveRefLegacy(ref, adv.schema)
                );
                assert.deepEqual(actual, expected);
                assert.deepEqual(actualLogs.map(logText), expectedLogs.map(logText));
            }
        }
        fc.assert(
            fc.property(
                arbGeneratedSchema,
                fc.constantFrom("#/definitions/SharedDef", "#/definitions/CyclicA", "#/definitions/MissingDef", "http://ext/ref"),
                (schema, ref) => {
                    const { value: actual, entries: actualLogs } = withLogCapture(() =>
                        OpenApiRefResolver.resolve(ref, schema)
                    );
                    const { value: expected, entries: expectedLogs } = withLogCapture(() =>
                        resolveRefLegacy(ref, schema)
                    );
                    assert.deepEqual(actual, expected);
                    assert.deepEqual(actualLogs.map(logText), expectedLogs.map(logText));
                }
            )
        );
    });

    it("Parity 4 (core/LayoutScorer.ts): apply matches layoutScorerApplyLegacy across generated and adversarial schemas", () => {
        for (const adv of adversarialCases) {
            const { value: actual, entries: actualLogs } = withLogCapture(() =>
                LayoutScorer.apply(adv.schema, 15, adv.schema.definitions)
            );
            const { value: expected, entries: expectedLogs } = withLogCapture(() =>
                layoutScorerApplyLegacy(adv.schema, 15, adv.schema.definitions)
            );
            assert.deepEqual(Array.from(actual.entries()), Array.from(expected.entries()), `Adversarial: ${adv.name}`);
            assert.deepEqual(actualLogs.map(logText), expectedLogs.map(logText));
        }
        fc.assert(
            fc.property(arbGeneratedSchema, fc.integer({ min: 1, max: 35 }), (schema, budget) => {
                const { value: actual, entries: actualLogs } = withLogCapture(() =>
                    LayoutScorer.apply(schema, budget, schema.definitions)
                );
                const { value: expected, entries: expectedLogs } = withLogCapture(() =>
                    layoutScorerApplyLegacy(schema, budget, schema.definitions)
                );
                assert.deepEqual(Array.from(actual.entries()), Array.from(expected.entries()));
                assert.deepEqual(actualLogs.map(logText), expectedLogs.map(logText));
            })
        );
    });

    it("Parity 5 (layouts/LayoutElementWalker.ts): walk and resolveScope match walkLayoutElementsLegacy on generated and adversarial layouts", () => {
        for (const adv of adversarialCases) {
            const scopes = Object.keys(adv.schema.properties || {}).map((k) => `#/properties/${k}`);
            const elements: ILayoutElement[] = [
                {
                    type: "Group",
                    label: "Main",
                    elements: [
                        ...scopes.map((s) => ({ type: "Control" as const, scope: s })),
                        { type: "Control" as const, scope: "#/properties/nonExistentScope" }
                    ]
                }
            ];
            const visitedActual: string[] = [];
            const visitedExpected: string[] = [];
            const engineA = { hasPartialRenderingErrors: false, getSchemaDefinitions: () => adv.schema.definitions } as unknown as Engine;
            const engineB = { hasPartialRenderingErrors: false, getSchemaDefinitions: () => adv.schema.definitions } as unknown as Engine;
            const { value: countA, entries: logsA } = withLogCapture(() =>
                LayoutElementWalker.walk(
                    elements,
                    adv.schema,
                    engineA,
                    { onScalarField: (_el, bp) => visitedActual.push(bp) },
                    "FormLayout"
                )
            );
            const { value: countB, entries: logsB } = withLogCapture(() =>
                walkLayoutElementsLegacy(
                    elements,
                    adv.schema,
                    engineB,
                    { onScalarField: (_el, bp) => visitedExpected.push(bp) },
                    "FormLayout"
                )
            );
            assert.equal(countA, countB);
            assert.deepEqual(visitedActual, visitedExpected);
            assert.equal(engineA.hasPartialRenderingErrors, engineB.hasPartialRenderingErrors);
            assert.deepEqual(logsA.map(logText), logsB.map(logText));
        }
        fc.assert(
            fc.property(arbGeneratedSchema, (schema) => {
                const scopes = Object.keys(schema.properties || {}).map((k) => `#/properties/${k}`);
                const elements: ILayoutElement[] = [
                    {
                        type: "Group",
                        label: "Group1",
                        elements: scopes.map((s) => ({ type: "Control" as const, scope: s }))
                    }
                ];
                const visitedActual: string[] = [];
                const visitedExpected: string[] = [];
                const engineA = { hasPartialRenderingErrors: false, getSchemaDefinitions: () => schema.definitions } as unknown as Engine;
                const engineB = { hasPartialRenderingErrors: false, getSchemaDefinitions: () => schema.definitions } as unknown as Engine;
                const { value: countA, entries: logsA } = withLogCapture(() =>
                    LayoutElementWalker.walk(
                        elements,
                        schema,
                        engineA,
                        { onScalarField: (_el, bp) => visitedActual.push(bp) },
                        "FormLayout"
                    )
                );
                const { value: countB, entries: logsB } = withLogCapture(() =>
                    walkLayoutElementsLegacy(
                        elements,
                        schema,
                        engineB,
                        { onScalarField: (_el, bp) => visitedExpected.push(bp) },
                        "FormLayout"
                    )
                );
                assert.equal(countA, countB);
                assert.deepEqual(visitedActual, visitedExpected);
                assert.equal(engineA.hasPartialRenderingErrors, engineB.hasPartialRenderingErrors);
                assert.deepEqual(logsA.map(logText), logsB.map(logText));
            })
        );
    });

    it("Parity 6 (openapi/parsers/OpenApiConstraintMapper.ts): resolveAllOf matches resolveAllOfLegacy", () => {
        for (const adv of adversarialCases) {
            for (const prop of Object.values(adv.schema.properties || {})) {
                const rawRecord = deepClone(prop) as unknown as JsonRecord;
                const { value: actual, entries: actualLogs } = withLogCapture(() =>
                    OpenApiConstraintMapper.resolveAllOf(rawRecord, adv.schema)
                );
                const { value: expected, entries: expectedLogs } = withLogCapture(() =>
                    resolveAllOfLegacy(rawRecord, adv.schema)
                );
                assert.deepEqual(actual, expected);
                assert.deepEqual(actualLogs.map(logText), expectedLogs.map(logText));
            }
        }
        fc.assert(
            fc.property(arbGeneratedSchema, (schema) => {
                const candidate: JsonRecord = {
                    type: "object",
                    allOf: [
                        { $ref: "#/definitions/SharedDef" },
                        ...(schema.definitions?.CyclicA ? [{ $ref: "#/definitions/CyclicA" }] : []),
                        { type: "object", properties: schema.properties || {} }
                    ]
                };
                const { value: actual, entries: actualLogs } = withLogCapture(() =>
                    OpenApiConstraintMapper.resolveAllOf(candidate, schema)
                );
                const { value: expected, entries: expectedLogs } = withLogCapture(() =>
                    resolveAllOfLegacy(candidate, schema)
                );
                assert.deepEqual(actual, expected);
                assert.deepEqual(actualLogs.map(logText), expectedLogs.map(logText));
            })
        );
    });

    it("Parity 7 (controls/host/delegates/DataSyncDelegate.ts): injectSchemaDefaults matches injectSchemaDefaultsLegacy", () => {
        const delegate = new DataSyncDelegate({} as unknown as IEngineHost);
        for (const adv of adversarialCases) {
            const dataActual = deepClone(adv.sampleData);
            const dataExpected = deepClone(adv.sampleData);
            const { entries: actualLogs } = withLogCapture(() =>
                delegate.injectSchemaDefaults(adv.schema, dataActual, 0, adv.schema.definitions)
            );
            const { entries: expectedLogs } = withLogCapture(() =>
                injectSchemaDefaultsLegacy(adv.schema, dataExpected, 0, adv.schema.definitions)
            );
            assert.deepEqual(dataActual, dataExpected, `Adversarial: ${adv.name}`);
            assert.deepEqual(actualLogs.map(logText), expectedLogs.map(logText));
        }
        fc.assert(
            fc.property(arbGeneratedSchema, (schema) => {
                const dataActual: JsonRecord = {};
                const dataExpected: JsonRecord = {};
                const { entries: actualLogs } = withLogCapture(() =>
                    delegate.injectSchemaDefaults(schema, dataActual, 0, schema.definitions)
                );
                const { entries: expectedLogs } = withLogCapture(() =>
                    injectSchemaDefaultsLegacy(schema, dataExpected, 0, schema.definitions)
                );
                assert.deepEqual(dataActual, dataExpected);
                assert.deepEqual(actualLogs.map(logText), expectedLogs.map(logText));
            })
        );
    });

    it("Parity 8 (controls/host/delegates/ODataDelegate.ts): sanitizeODataPayload matches sanitizeODataPayloadLegacy", () => {
        const sanitizeActual = (
            ODataDelegate.prototype as unknown as {
                sanitizeODataPayload(value: unknown, depth: number): unknown;
            }
        ).sanitizeODataPayload.bind(ODataDelegate.prototype);
        fc.assert(
            fc.property(arbArbitraryPayload, (payload) => {
                const { value: actual, entries: actualLogs } = withLogCapture(() =>
                    sanitizeActual(payload, 0)
                );
                const { value: expected, entries: expectedLogs } = withLogCapture(() =>
                    sanitizeODataPayloadLegacy(payload, 0)
                );
                assert.deepEqual(actual, expected);
                assert.deepEqual(actualLogs.map(logText), expectedLogs.map(logText));
            })
        );
    });

    it("Parity 9 (controls/host/delegates/GenerationDelegate.ts): containsAdditionalProperties matches containsAdditionalPropertiesLegacy", () => {
        const genDelegate = new GenerationDelegate({} as unknown as IEngineHost) as unknown as {
            containsAdditionalProperties(node: unknown, depth?: number): boolean;
        };
        for (const adv of adversarialCases) {
            const { value: actual, entries: actualLogs } = withLogCapture(() =>
                genDelegate.containsAdditionalProperties(adv.schema)
            );
            const { value: expected, entries: expectedLogs } = withLogCapture(() =>
                containsAdditionalPropertiesLegacy(adv.schema)
            );
            assert.equal(actual, expected, `Adversarial: ${adv.name}`);
            assert.deepEqual(actualLogs.map(logText), expectedLogs.map(logText));
        }
        fc.assert(
            fc.property(arbGeneratedSchema, (schema) => {
                const { value: actual, entries: actualLogs } = withLogCapture(() =>
                    genDelegate.containsAdditionalProperties(schema)
                );
                const { value: expected, entries: expectedLogs } = withLogCapture(() =>
                    containsAdditionalPropertiesLegacy(schema)
                );
                assert.equal(actual, expected);
                assert.deepEqual(actualLogs.map(logText), expectedLogs.map(logText));
            })
        );
    });

    it("Parity 10 (core/PayloadValidator.ts): validateTree matches validateTreeLegacy on generated and adversarial cases", () => {
        for (const adv of adversarialCases) {
            const resolveDef = (ref: string): ISchema | null =>
                adv.schema.definitions?.[OpenApiRefResolver.extractRefName(ref)] || null;
            const { value: actual, entries: actualLogs } = withLogCapture(() =>
                PayloadValidator.validateTree(adv.schema, adv.sampleData, resolveDef)
            );
            const { value: expected, entries: expectedLogs } = withLogCapture(() =>
                validateTreeLegacy(adv.schema, adv.sampleData, resolveDef)
            );
            assert.deepEqual(actual, expected, `Adversarial: ${adv.name}`);
            assert.deepEqual(actualLogs.map(logText), expectedLogs.map(logText));
        }
        fc.assert(
            fc.property(arbGeneratedSchema, arbArbitraryPayload, (schema, payload) => {
                const resolveDef = (ref: string): ISchema | null =>
                    schema.definitions?.[OpenApiRefResolver.extractRefName(ref)] || null;
                const { value: actual, entries: actualLogs } = withLogCapture(() =>
                    PayloadValidator.validateTree(schema, payload, resolveDef)
                );
                const { value: expected, entries: expectedLogs } = withLogCapture(() =>
                    validateTreeLegacy(schema, payload, resolveDef)
                );
                assert.deepEqual(actual, expected);
                assert.deepEqual(actualLogs.map(logText), expectedLogs.map(logText));
            })
        );
    });

    it("Parity 11 (core/DataInferenceBuilder.ts): inferPropertiesFromObject matches inferPropertiesFromObjectLegacy", () => {
        fc.assert(
            fc.property(fc.dictionary(arbPropKey, arbArbitraryPayload, { maxKeys: 5 }), (obj) => {
                const { value: actual, entries: actualLogs } = withLogCapture(() =>
                    DataInferenceBuilder.inferPropertiesFromObject(obj)
                );
                const { value: expected, entries: expectedLogs } = withLogCapture(() =>
                    inferPropertiesFromObjectLegacy(obj)
                );
                assert.deepEqual(actual, expected);
                assert.deepEqual(actualLogs.map(logText), expectedLogs.map(logText));
            })
        );
    });

    it("Parity 12 (openapi/parsers/OpenApiPropertyMapper.ts): mapProperties matches mapOpenApiPropertiesLegacy", () => {
        for (const adv of adversarialCases) {
            const { value: actual, entries: actualLogs } = withLogCapture(() =>
                OpenApiPropertyMapper.mapProperties(adv.schema.properties, adv.schema.required || [], adv.schema)
            );
            const { value: expected, entries: expectedLogs } = withLogCapture(() =>
                mapOpenApiPropertiesLegacy(adv.schema.properties, adv.schema.required || [], adv.schema)
            );
            assert.deepEqual(actual, expected, `Adversarial: ${adv.name}`);
            assert.deepEqual(actualLogs.map(logText), expectedLogs.map(logText));
        }
        fc.assert(
            fc.property(arbGeneratedSchema, (schema) => {
                const { value: actual, entries: actualLogs } = withLogCapture(() =>
                    OpenApiPropertyMapper.mapProperties(schema.properties, schema.required || [], schema)
                );
                const { value: expected, entries: expectedLogs } = withLogCapture(() =>
                    mapOpenApiPropertiesLegacy(schema.properties, schema.required || [], schema)
                );
                assert.deepEqual(actual, expected);
                assert.deepEqual(actualLogs.map(logText), expectedLogs.map(logText));
            })
        );
    });

    it("Parity 13 (core/SchemaNormalizer.ts): stripWriteOnlyValues and normalize match legacy reference behaviour", () => {
        for (const adv of adversarialCases) {
            const payloadA = deepClone(adv.sampleData);
            const payloadB = deepClone(adv.sampleData);
            const { entries: actualLogs } = withLogCapture(() =>
                SchemaNormalizer.stripWriteOnlyValues(adv.schema, payloadA)
            );
            const { entries: expectedLogs } = withLogCapture(() =>
                stripWriteOnlyValuesLegacy(adv.schema, payloadB, adv.schema.definitions)
            );
            assert.deepEqual(payloadA, payloadB, `Adversarial stripWriteOnlyValues: ${adv.name}`);
            assert.deepEqual(actualLogs.map(logText), expectedLogs.map(logText));

            const rawProps = (adv.schema.properties || {}) as unknown as JsonRecord;
            const { value: normA, entries: normLogsA } = withLogCapture(() =>
                SchemaNormalizer.normalize({
                    type: "object",
                    properties: rawProps,
                    definitions: adv.schema.definitions
                }).properties
            );
            const { value: normB, entries: normLogsB } = withLogCapture(() => {
                // SchemaNormalizer.normalize normalizes definitions first before properties
                const rootRec = {
                    type: "object",
                    properties: rawProps,
                    definitions: adv.schema.definitions
                } as unknown as JsonRecord;
                if (adv.schema.definitions) {
                    for (const defKey of Object.keys(adv.schema.definitions)) {
                        SchemaNormalizer.normalizeDefinition(adv.schema.definitions[defKey], defKey, rootRec);
                    }
                }
                return normalizePropertiesLegacy(rawProps, [], rootRec);
            });
            assert.deepEqual(normA, normB, `Adversarial normalize: ${adv.name}`);
            assert.deepEqual(normLogsA.map(logText), normLogsB.map(logText));
        }
        fc.assert(
            fc.property(arbGeneratedSchema, arbArbitraryPayload, (schema, payload) => {
                const payloadA = deepClone(payload);
                const payloadB = deepClone(payload);
                const { entries: actualLogs } = withLogCapture(() =>
                    SchemaNormalizer.stripWriteOnlyValues(schema, payloadA)
                );
                const { entries: expectedLogs } = withLogCapture(() =>
                    stripWriteOnlyValuesLegacy(schema, payloadB, schema.definitions)
                );
                assert.deepEqual(payloadA, payloadB);
                assert.deepEqual(actualLogs.map(logText), expectedLogs.map(logText));

                const rawProps = (schema.properties || {}) as unknown as JsonRecord;
                const { value: normA, entries: normLogsA } = withLogCapture(() =>
                    SchemaNormalizer.normalize({
                        type: "object",
                        properties: rawProps,
                        definitions: schema.definitions
                    }).properties
                );
                const { value: normB, entries: normLogsB } = withLogCapture(() => {
                    const rootRec = {
                        type: "object",
                        properties: rawProps,
                        definitions: schema.definitions
                    } as unknown as JsonRecord;
                    if (schema.definitions) {
                        for (const defKey of Object.keys(schema.definitions)) {
                            SchemaNormalizer.normalizeDefinition(schema.definitions[defKey], defKey, rootRec);
                        }
                    }
                    return normalizePropertiesLegacy(rawProps, [], rootRec);
                });
                assert.deepEqual(normA, normB);
                assert.deepEqual(normLogsA.map(logText), normLogsB.map(logText));
            })
        );
        void PolymorphicUtil;
    });

    it("Parity 14 (core/PluginRegistry.ts): getPathsToLoad matches getPathsToLoadLegacy on generated, adversarial, and cyclic/polymorphic schemas", () => {
        const registry = PluginRegistry.getInstance();
        for (const adv of adversarialCases) {
            const { value: actual, entries: actualLogs } = withLogCapture(() =>
                registry.getPathsToLoad(adv.schema, adv.schema.definitions)
            );
            const { value: expected, entries: expectedLogs } = withLogCapture(() =>
                getPathsToLoadLegacy(adv.schema, adv.schema.definitions, registry)
            );
            assert.deepEqual(Array.from(actual), Array.from(expected), `Adversarial: ${adv.name}`);
            assert.deepEqual(actualLogs.map(logText), expectedLogs.map(logText), `Adversarial logs: ${adv.name}`);
        }
        fc.assert(
            fc.property(
                arbGeneratedSchema,
                fc.boolean(),
                fc.boolean(),
                (schema, withCombinators, withAddPropObj) => {
                    const candidate: ISchema = deepClone(schema);
                    if (withCombinators && candidate.properties) {
                        candidate.properties.combProp = {
                            type: "object",
                            oneOf: [{ type: "boolean", ui: { widget: WIDGET_TYPE.SWITCH } }],
                            anyOf: [{ type: "number", ui: { widget: WIDGET_TYPE.SLIDER } }],
                            allOf: [{ type: "string", ui: { widget: WIDGET_TYPE.EMAIL } }]
                        };
                    }
                    if (withAddPropObj && candidate.properties) {
                        candidate.properties.dictProp = {
                            type: "object",
                            additionalProperties: {
                                type: "object",
                                properties: {
                                    innerDate: { type: "date" }
                                }
                            }
                        };
                    }
                    const { value: actual, entries: actualLogs } = withLogCapture(() =>
                        registry.getPathsToLoad(candidate, candidate.definitions)
                    );
                    const { value: expected, entries: expectedLogs } = withLogCapture(() =>
                        getPathsToLoadLegacy(candidate, candidate.definitions, registry)
                    );
                    assert.deepEqual(Array.from(actual), Array.from(expected));
                    assert.deepEqual(actualLogs.map(logText), expectedLogs.map(logText));
                }
            )
        );
    });
});

/** Oracle 14: PluginRegistry.getPathsToLoad legacy implementation (with path-scoped cycle detection and depth cap). */
function getPathsToLoadLegacy(
    schema: ISchema,
    normalizedDefinitions?: Record<string, ISchema>,
    registry: PluginRegistry = PluginRegistry.getInstance()
): Set<string> {
    const regInternal = registry as unknown as {
        getLayoutPath(strategy: string): string;
        getFieldPath(type: FieldType, widgetName?: string): string;
        warnOnce(key: string, message: string): void;
        policyConditionIndex: { get(key: string): string | undefined };
        policyEffectIndex: { get(key: string): string | undefined };
    };
    const pathsToLoad = new Set<string>();
    const strategy = DefaultLayoutGenerator.resolveLayoutStrategy(schema);
    pathsToLoad.add(regInternal.getLayoutPath(strategy));

    const scanLayoutElements = (
        elements: ILayoutElement[] | undefined,
        propsContext?: Record<string, IPropertyMetadata>,
        depth: number = 0,
        activeElements: WeakSet<object> = new WeakSet<object>()
    ): void => {
        if (!Array.isArray(elements)) return;
        if (depth > MAX_LAYOUT_DEPTH) {
            Logger.warn(
                `[MetaUI PluginRegistry] uiLayout nesting exceeded MAX_LAYOUT_DEPTH (${MAX_LAYOUT_DEPTH}); ` +
                    `layout elements below this level were not scanned for plugin preloading.`
            );
            return;
        }
        for (const el of elements) {
            if (!el || typeof el !== "object") continue;
            if (activeElements.has(el)) {
                Logger.warn(
                    "[MetaUI PluginRegistry] Circular uiLayout element reference detected; stopping recursion."
                );
                continue;
            }
            activeElements.add(el);
            try {
                if (el.widget) {
                    let resolvedType: FieldType = SCHEMA_TYPE.STRING;
                    if (el.scope && propsContext) {
                        const { meta } = SchemaNormalizer.resolveScope(
                            { type: "object", properties: propsContext },
                            el.scope
                        );
                        if (meta?.type) {
                            resolvedType = meta.type;
                        }
                    }
                    try {
                        pathsToLoad.add(regInternal.getFieldPath(resolvedType, el.widget));
                    } catch (e) {
                        regInternal.warnOnce(
                            `unpreloadable-layout-widget:${resolvedType}:${el.widget}`,
                            `[MetaUI PluginRegistry] Skipping preload for uiLayout widget '${el.widget}' on type ` +
                                `'${resolvedType}': ${(e as Error).message} (Reported once per registry.)`
                        );
                    }
                }
                if (el.elements) {
                    scanLayoutElements(el.elements, propsContext, depth + 1, activeElements);
                }
            } finally {
                activeElements.delete(el);
            }
        }
    };

    const scanProperty = (
        prop: IPropertyMetadata,
        key: string,
        scope: string,
        depth: number,
        activeNodes: WeakSet<object>
    ): void => {
        if (!prop || typeof prop !== "object") return;
        if (activeNodes.has(prop)) {
            Logger.warn(
                "[MetaUI PluginRegistry]",
                `Circular schema reference detected at '${scope}'; stopping plugin preload recursion.`
            );
            return;
        }
        if (depth > MAX_SCHEMA_DEPTH) {
            Logger.warn(
                "[MetaUI PluginRegistry]",
                `Schema nesting exceeded MAX_SCHEMA_DEPTH (${MAX_SCHEMA_DEPTH}) at '${scope}'; ` +
                    `plugins below this level were not preloaded.`
            );
            return;
        }
        activeNodes.add(prop);
        try {
            if (prop.type || prop.ui?.widget) {
                try {
                    pathsToLoad.add(regInternal.getFieldPath(prop.type || SCHEMA_TYPE.STRING, prop.ui?.widget));
                } catch (e) {
                    const msg = `[MetaUI LazyLoad] Could not find mapped plugin for field ${key}: ${(e as Error).message}`;
                    Logger.error(msg);
                    throw new Error(msg);
                }
            }
            if (prop.properties) scanProperties(prop.properties, scope, depth + 1, activeNodes);
            if (prop.items && typeof prop.items === "object" && !Array.isArray(prop.items)) {
                const itemScope = `${scope}/items`;
                if (activeNodes.has(prop.items)) {
                    Logger.warn(
                        "[MetaUI PluginRegistry]",
                        `Circular schema reference detected at '${itemScope}'; stopping plugin preload recursion.`
                    );
                } else if (depth + 1 > MAX_SCHEMA_DEPTH) {
                    Logger.warn(
                        "[MetaUI PluginRegistry]",
                        `Schema nesting exceeded MAX_SCHEMA_DEPTH (${MAX_SCHEMA_DEPTH}) at '${itemScope}'; ` +
                            `plugins below this level were not preloaded.`
                    );
                } else {
                    activeNodes.add(prop.items);
                    try {
                        if (prop.items.properties || prop.items.$ref) {
                            pathsToLoad.add(regInternal.getLayoutPath(LAYOUT_STRATEGY.TABLE));
                            if (prop.items.properties) {
                                scanProperties(prop.items.properties, itemScope, depth + 2, activeNodes);
                            }
                        }
                        if (prop.items.type || prop.items.ui?.widget) {
                            try {
                                pathsToLoad.add(
                                    regInternal.getFieldPath(prop.items.type || SCHEMA_TYPE.STRING, prop.items.ui?.widget)
                                );
                            } catch (e) {
                                const msg =
                                    `[MetaUI LazyLoad] Could not find mapped plugin for array item type ` +
                                    `${prop.items.type}: ${(e as Error).message}`;
                                Logger.error(msg);
                                throw new Error(msg);
                            }
                        }
                        if (prop.items.oneOf) {
                            prop.items.oneOf.forEach((b, idx) =>
                                scanProperty(
                                    b,
                                    `${key}.items.oneOf[${idx}]`,
                                    `${itemScope}/oneOf/${idx}`,
                                    depth + 2,
                                    activeNodes
                                )
                            );
                        }
                        if (prop.items.anyOf) {
                            prop.items.anyOf.forEach((b, idx) =>
                                scanProperty(
                                    b,
                                    `${key}.items.anyOf[${idx}]`,
                                    `${itemScope}/anyOf/${idx}`,
                                    depth + 2,
                                    activeNodes
                                )
                            );
                        }
                        if (prop.items.allOf) {
                            prop.items.allOf.forEach((b, idx) =>
                                scanProperty(
                                    b,
                                    `${key}.items.allOf[${idx}]`,
                                    `${itemScope}/allOf/${idx}`,
                                    depth + 2,
                                    activeNodes
                                )
                            );
                        }
                    } finally {
                        activeNodes.delete(prop.items);
                    }
                }
            }
            if (isRecord(prop.additionalProperties) && typeof prop.additionalProperties.type === "string") {
                const addProp = prop.additionalProperties as IPropertyMetadata;
                const addScope = `${scope}/additionalProperties`;
                if (activeNodes.has(addProp)) {
                    Logger.warn(
                        "[MetaUI PluginRegistry]",
                        `Circular schema reference detected at '${addScope}'; stopping plugin preload recursion.`
                    );
                } else if (depth + 1 > MAX_SCHEMA_DEPTH) {
                    Logger.warn(
                        "[MetaUI PluginRegistry]",
                        `Schema nesting exceeded MAX_SCHEMA_DEPTH (${MAX_SCHEMA_DEPTH}) at '${addScope}'; ` +
                            `plugins below this level were not preloaded.`
                    );
                } else {
                    activeNodes.add(addProp);
                    try {
                        try {
                            pathsToLoad.add(regInternal.getFieldPath(addProp.type, addProp.ui?.widget));
                        } catch (e) {
                            Logger.warn(
                                `[MetaUI LazyLoad] Could not preload additionalProperties plugin for '${key}': ${(e as Error).message}`
                            );
                        }
                        if (addProp.properties) scanProperties(addProp.properties, addScope, depth + 2, activeNodes);
                    } finally {
                        activeNodes.delete(addProp);
                    }
                }
            }
            if (prop.oneOf) {
                prop.oneOf.forEach((b, idx) =>
                    scanProperty(b, `${key}.oneOf[${idx}]`, `${scope}/oneOf/${idx}`, depth + 1, activeNodes)
                );
            }
            if (prop.anyOf) {
                prop.anyOf.forEach((b, idx) =>
                    scanProperty(b, `${key}.anyOf[${idx}]`, `${scope}/anyOf/${idx}`, depth + 1, activeNodes)
                );
            }
            if (prop.allOf) {
                prop.allOf.forEach((b, idx) =>
                    scanProperty(b, `${key}.allOf[${idx}]`, `${scope}/allOf/${idx}`, depth + 1, activeNodes)
                );
            }
            if (prop.uiLayout) scanLayoutElements(prop.uiLayout, prop.properties);
        } finally {
            activeNodes.delete(prop);
        }
    };

    const scanProperties = (
        props: Record<string, IPropertyMetadata>,
        parentScope: string,
        depth: number,
        activeNodes: WeakSet<object>
    ): void => {
        for (const key of Object.keys(props)) {
            scanProperty(props[key], key, `${parentScope}/properties/${key}`, depth, activeNodes);
        }
    };

    if (schema.properties) {
        scanProperties(schema.properties, "#", 0, new WeakSet<object>());
    }
    if (schema.items) {
        scanProperty({ type: SCHEMA_TYPE.ARRAY, items: schema.items }, "items", "#/items", 0, new WeakSet<object>());
    }
    if (schema.uiLayout) {
        scanLayoutElements(schema.uiLayout, schema.properties || schema.items?.properties);
    }

    const allDefs: Record<string, ISchema> = {
        ...(schema.definitions || {}),
        ...(normalizedDefinitions || {})
    };
    for (const defKey of Object.keys(allDefs)) {
        const defSchema = allDefs[defKey];
        scanProperty(
            {
                type: defSchema.type || SCHEMA_TYPE.OBJECT,
                properties: defSchema.properties,
                items: defSchema.items,
                oneOf: defSchema.oneOf,
                anyOf: defSchema.anyOf,
                allOf: defSchema.allOf,
                additionalProperties: defSchema.additionalProperties,
                ui: defSchema.ui
            },
            defKey,
            `#/definitions/${defKey}`,
            0,
            new WeakSet<object>()
        );
    }

    if (schema.uiPolicies) {
        for (const policy of schema.uiPolicies) {
            if (policy.condition) {
                for (const key of Object.keys(policy.condition)) {
                    const condPath = regInternal.policyConditionIndex.get(key);
                    if (condPath) {
                        pathsToLoad.add(condPath);
                    }
                }
            }
            if (policy.effect) {
                const effPath = regInternal.policyEffectIndex.get(policy.effect);
                if (effPath) {
                    pathsToLoad.add(effPath);
                }
            }
        }
    }

    return pathsToLoad;
}
