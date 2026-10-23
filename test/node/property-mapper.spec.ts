/**
 * @file property-mapper.spec.ts
 * @description Absolute restatements of what `OpenApiPropertyMapper` produces.
 *
 * `dialect-parity.spec.ts` compares the 2.0 and 3.0 pipelines against each other. That is a
 * differential property: it moves both sides together, so a mutation that changes the mapper
 * changes both answers and survives. The properties here instead state, for a named OpenAPI input,
 * the descriptor MetaUI must publish for it.
 *
 * The expected descriptors come from the OpenAPI 2.0/3.0 specifications and from the mapping table
 * MetaUI documents in `docs/wiki/OpenAPIIntegration.md`:
 *
 *  - a `$ref` to an object definition becomes the `reference` widget; a `$ref` to a primitive is
 *    inlined;
 *  - `oneOf` / `anyOf` / `discriminator` become the `polymorphic` widget with a normalized branch
 *    array;
 *  - `additionalProperties: true` enables hybrid inference, a schema-valued `additionalProperties`
 *    becomes the `dictionaryMap` widget;
 *  - an object with neither `properties` nor `additionalProperties` becomes the `codeEditor`
 *    widget rather than a blank sub-form;
 *  - an array of primitives becomes `multiInput`, an array of enumerated primitives `multiSelect`;
 *  - truncation at the recursion limit is reported, never silent (engineering rule 2).
 *
 * Widget names are written as the literals the documentation uses, so a test fails if a widget is
 * renamed without the documentation following it.
 */

import * as assert from "assert";
import { fc } from "./fc-config";
import { withLogCapture, reported } from "./fc-config";
import { IPropertyMetadata } from "../../src/nz/co/siliconst/ui5/metaui/interfaces/ISchema";
import {
    OpenApiPropertyMapper
} from "../../src/nz/co/siliconst/ui5/metaui/openapi/parsers/OpenApiPropertyMapper";
import { MAX_SCHEMA_DEPTH } from "../../src/nz/co/siliconst/ui5/metaui/constants/MetaUIConstants";

/** The single published nesting cap: levels 0..MAX are mapped, the level after it is refused. */
const MAX_MAPPING_DEPTH = MAX_SCHEMA_DEPTH;

/** A 3.0 document whose `components.schemas` holds the given definitions. */
const root3 = (schemas: Record<string, unknown>): Record<string, unknown> => ({
    openapi: "3.0.0",
    components: { schemas }
});

/** Maps one property definition at the document root, with no `$ref` context. */
const map = (prop: unknown, key: string = "field", required: boolean = false, root: unknown = {}): IPropertyMetadata =>
    OpenApiPropertyMapper.mapPropertyMetadata(prop, key, required, root);

describe("OpenApiPropertyMapper — scalar properties", () => {
    it("a typed scalar keeps its type, title, description, format and required flag", () => {
        const meta = map(
            { type: "string", title: "Given name", description: "The person's first name", format: "date" },
            "givenName",
            true
        );
        assert.strictEqual(meta.type, "string");
        assert.strictEqual(meta.title, "Given name");
        assert.strictEqual(meta.description, "The person's first name");
        assert.strictEqual(meta.format, "date");
        assert.strictEqual(meta.required, true);
    });

    it("an absent title, description or format is absent on the descriptor, not an empty string", () => {
        const meta = map({ type: "integer" }, "count");
        assert.strictEqual(meta.title, undefined);
        assert.strictEqual(meta.description, undefined);
        assert.strictEqual(meta.format, undefined);
        assert.strictEqual(meta.required, false);
    });

    it("a non-string title or description is dropped rather than coerced", () => {
        const meta = map({ type: "string", title: 7, description: ["a"] }, "field");
        assert.strictEqual(meta.title, undefined);
        assert.strictEqual(meta.description, undefined);
    });

    it("a property that is not an object at all still yields a usable descriptor", () => {
        for (const raw of [null, undefined, 42, "string", ["a"], true]) {
            const meta = map(raw, "weird");
            assert.strictEqual(typeof meta.type, "string", `${JSON.stringify(raw)} produced no type`);
            assert.strictEqual(meta.ui?.label, "Weird");
        }
    });

    it("the label is derived from the key when the schema carries no title", () => {
        assert.strictEqual(map({ type: "string" }, "firstName").ui?.label, "First Name");
        assert.strictEqual(map({ type: "string" }, "order_id").ui?.label, "Order Id");
        assert.strictEqual(map({ type: "string", title: "Explicit" }, "firstName").ui?.label, "Explicit");
    });

    it("readOnly reaches both the descriptor and its ui block", () => {
        const meta = map({ type: "string", readOnly: true }, "field");
        assert.strictEqual(meta.readOnly, true);
        assert.strictEqual(meta.ui?.readOnly, true);
        const writable = map({ type: "string", readOnly: false }, "field");
        assert.strictEqual(writable.readOnly, undefined);
        assert.strictEqual(writable.ui?.readOnly, undefined);
    });

    it("declared constraints are carried onto the descriptor unchanged", () => {
        const meta = map(
            {
                type: "string",
                minLength: 2,
                maxLength: 9,
                pattern: "^[a-z]+$"
            },
            "field"
        );
        assert.strictEqual(meta.minLength, 2);
        assert.strictEqual(meta.maxLength, 9);
        assert.strictEqual(meta.pattern, "^[a-z]+$");
    });
});

describe("OpenApiPropertyMapper — enum and value help", () => {
    it("an enum becomes a select whose value help is one entry per member", () => {
        const meta = map({ type: "string", enum: ["RED", "GREEN"] }, "colour");
        assert.deepStrictEqual(meta.enum, ["RED", "GREEN"]);
        assert.deepStrictEqual(meta.valueHelp, [
            { key: "RED", text: "RED" },
            { key: "GREEN", text: "GREEN" }
        ]);
        assert.strictEqual(meta.ui?.widget, "select");
        assert.deepStrictEqual(meta.ui?.valueHelp, meta.valueHelp);
    });

    it("non-string enum members keep their JSON type on the descriptor and are stringified for value help", () => {
        const meta = map({ type: "integer", enum: [1, 2, 3] }, "level");
        assert.deepStrictEqual(meta.enum, [1, 2, 3]);
        assert.deepStrictEqual(meta.valueHelp, [
            { key: "1", text: "1" },
            { key: "2", text: "2" },
            { key: "3", text: "3" }
        ]);
    });

    it("an empty enum is published as a disabled, empty select and reported as unsatisfiable", () => {
        // Engineering rule 2: an unsatisfiable field must not degrade into free text.
        const { value: meta, entries } = withLogCapture(() => map({ type: "string", enum: [] }, "colour"));
        assert.deepStrictEqual(meta.enum, []);
        assert.deepStrictEqual(meta.valueHelp, []);
        assert.strictEqual(meta.ui?.widget, "select");
        assert.strictEqual(meta.ui?.enabled, false);
        assert.ok(reported(entries, "colour"), `the contradiction was not reported: ${entries.length} entries`);
    });

    it("an enum of only undefined members is unsatisfiable in the same way", () => {
        const meta = map({ type: "string", enum: [undefined] }, "colour");
        assert.deepStrictEqual(meta.enum, []);
        assert.strictEqual(meta.ui?.enabled, false);
    });

    it("a property with no enum keyword carries neither enum nor value help", () => {
        const meta = map({ type: "string" }, "colour");
        assert.strictEqual(meta.enum, undefined);
        assert.strictEqual(meta.valueHelp, undefined);
        assert.notStrictEqual(meta.ui?.widget, "select");
    });
});

describe("OpenApiPropertyMapper — $ref resolution", () => {
    const root = root3({
        Address: {
            type: "object",
            title: "Postal address",
            description: "Where post is delivered",
            properties: { city: { type: "string" }, zip: { type: "string" } },
            required: ["city"]
        },
        Email: { type: "string", format: "email", maxLength: 64 },
        Count: { type: "integer", minimum: 0 },
        Flag: { type: "boolean" },
        Shape: { oneOf: [{ type: "object", title: "Square" }, { type: "object", title: "Circle" }] },
        Tagged: { type: "object", discriminator: { propertyName: "kind" } }
    });

    it("a $ref to an object definition becomes the reference widget and keeps the pointer", () => {
        const meta = map({ $ref: "#/components/schemas/Address" }, "home", true, root);
        assert.strictEqual(meta.type, "object");
        assert.strictEqual(meta.$ref, "#/components/schemas/Address");
        assert.strictEqual(meta.ui?.widget, "reference");
        assert.strictEqual(meta.required, true);
    });

    it("an object $ref inherits the definition's title and description when the site has none", () => {
        const meta = map({ $ref: "#/components/schemas/Address" }, "home", false, root);
        assert.strictEqual(meta.title, "Postal address");
        assert.strictEqual(meta.description, "Where post is delivered");
    });

    it("a title or description at the reference site wins over the definition's", () => {
        const meta = map(
            { $ref: "#/components/schemas/Address", title: "Billing", description: "For invoices" },
            "billing",
            false,
            root
        );
        assert.strictEqual(meta.title, "Billing");
        assert.strictEqual(meta.description, "For invoices");
    });

    it("an object $ref does not inline the target's properties", () => {
        const meta = map({ $ref: "#/components/schemas/Address" }, "home", false, root);
        assert.strictEqual(meta.properties, undefined, "the sub-form is rendered from the definition, not inlined");
    });

    it("nullable and readOnly at the reference site reach the descriptor", () => {
        const meta = map(
            { $ref: "#/components/schemas/Address", nullable: true, readOnly: true },
            "home",
            false,
            root
        );
        assert.strictEqual(meta.nullable, true);
        assert.strictEqual(meta.readOnly, true);
        const plain = map({ $ref: "#/components/schemas/Address" }, "home", false, root);
        assert.strictEqual(plain.nullable, undefined);
        assert.strictEqual(plain.readOnly, undefined);
    });

    it("a $ref to a primitive definition is inlined, carrying the target's type and constraints", () => {
        const meta = map({ $ref: "#/components/schemas/Email" }, "contact", true, root);
        assert.strictEqual(meta.type, "string");
        assert.strictEqual(meta.format, "email");
        assert.strictEqual(meta.maxLength, 64);
        assert.strictEqual(meta.required, true);
        assert.notStrictEqual(meta.ui?.widget, "reference");
    });

    it("every primitive target type is inlined, and an object target is not", () => {
        for (const [name, expected] of [["Email", "string"], ["Count", "integer"], ["Flag", "boolean"]] as const) {
            const meta = map({ $ref: `#/components/schemas/${name}` }, "x", false, root);
            assert.strictEqual(meta.type, expected, name);
            assert.strictEqual(meta.$ref, undefined, `${name} should be inlined, not referenced`);
        }
        assert.strictEqual(map({ $ref: "#/components/schemas/Address" }, "x", false, root).$ref !== undefined, true);
    });

    it("keywords beside the $ref override the definition they are merged with", () => {
        const meta = map({ $ref: "#/components/schemas/Email", maxLength: 8, title: "Short" }, "contact", false, root);
        assert.strictEqual(meta.maxLength, 8);
        assert.strictEqual(meta.title, "Short");
    });

    it("a declared primitive type at the reference site forces inlining of an object target", () => {
        const meta = map({ $ref: "#/components/schemas/Address", type: "string" }, "home", false, root);
        assert.strictEqual(meta.type, "string");
        assert.strictEqual(meta.$ref, undefined);
    });

    it("a $ref to a polymorphic definition is inlined so its branches are mapped", () => {
        const meta = map({ $ref: "#/components/schemas/Shape" }, "shape", false, root);
        assert.strictEqual(meta.ui?.widget, "polymorphic");
        assert.strictEqual(Array.isArray(meta.oneOf), true);
        assert.strictEqual(meta.oneOf?.length, 2);
    });

    it("a $ref to a definition carrying a discriminator is inlined too", () => {
        const meta = map({ $ref: "#/components/schemas/Tagged" }, "thing", false, root);
        assert.strictEqual(meta.discriminator?.propertyName, "kind");
        assert.strictEqual(meta.discriminator?.mapping, undefined);
        assert.strictEqual(meta.ui?.widget, "polymorphic");
    });

    it("an array's items $ref is inlined and the pointer is preserved on the item descriptor", () => {
        const meta = map(
            { type: "array", items: { $ref: "#/components/schemas/Address" } },
            "addresses",
            false,
            root
        );
        assert.strictEqual(meta.items?.type, "object");
        assert.strictEqual(meta.items?.$ref, "#/components/schemas/Address");
        assert.deepStrictEqual(Object.keys(meta.items?.properties || {}), ["city", "zip"]);
    });

    it("a $ref that resolves nowhere still produces a reference descriptor rather than nothing", () => {
        const meta = map({ $ref: "#/components/schemas/Missing" }, "gap", false, root);
        assert.strictEqual(meta.type, "object");
        assert.strictEqual(meta.$ref, "#/components/schemas/Missing");
        assert.strictEqual(meta.ui?.widget, "reference");
        assert.strictEqual(meta.title, undefined, "no definition means no inherited title");
    });

    it("a self-referential definition terminates as a reference node instead of recursing", () => {
        const recursive = root3({
            Node: {
                type: "object",
                title: "Tree node",
                properties: {
                    label: { type: "string" },
                    child: { $ref: "#/components/schemas/Node" }
                }
            }
        });
        const meta = map({ $ref: "#/components/schemas/Node" }, "tree", false, recursive);
        assert.strictEqual(meta.ui?.widget, "reference");
        assert.strictEqual(meta.$ref, "#/components/schemas/Node");
    });

    it("a cycle entered through an array terminates with a reference node and no inherited title", () => {
        const recursive = root3({
            Node: {
                type: "array",
                items: { $ref: "#/components/schemas/Node" }
            }
        });
        const meta = map({ $ref: "#/components/schemas/Node" }, "items", false, recursive);
        // Reached a second time, the pointer is already on the stack: the descriptor is a
        // reference stub built from the *site*, so the definition's title is not inherited.
        const inner = meta.items;
        assert.strictEqual(inner?.$ref, "#/components/schemas/Node");
        assert.strictEqual(inner?.ui?.widget, "reference");
        assert.strictEqual(inner?.title, undefined);
    });

    it("a $ref to a number definition is inlined like the other primitives", () => {
        const numeric = root3({ Price: { type: "number", minimum: 0, multipleOf: 0.01 } });
        const meta = map({ $ref: "#/components/schemas/Price" }, "price", false, numeric);
        assert.strictEqual(meta.type, "number");
        assert.strictEqual(meta.minimum, 0);
        assert.strictEqual(meta.multipleOf, 0.01);
        assert.strictEqual(meta.$ref, undefined);
    });

    it("the reference stub for a cycle is built from the reference site, not from the definition", () => {
        const recursive = root3({
            Node: {
                type: "object",
                title: "Definition title",
                description: "Definition description",
                properties: {
                    child: {
                        $ref: "#/components/schemas/Node",
                        title: "Site title",
                        description: "Site description",
                        nullable: true,
                        readOnly: true
                    }
                }
            }
        });
        const inner = map({ $ref: "#/components/schemas/Node" }, "tree", false, recursive).properties?.child;
        assert.strictEqual(inner, undefined, "an object $ref is not inlined, so there is nothing below it");
        const direct = OpenApiPropertyMapper.mapPropertyMetadata(
            {
                $ref: "#/components/schemas/Node",
                title: "Site title",
                description: "Site description",
                nullable: true,
                readOnly: true
            },
            "child",
            true,
            recursive,
            1,
            new Set(["#/components/schemas/Node"])
        );
        assert.strictEqual(direct.type, "object");
        assert.strictEqual(direct.$ref, "#/components/schemas/Node");
        assert.strictEqual(direct.ui?.widget, "reference");
        assert.strictEqual(direct.title, "Site title");
        assert.strictEqual(direct.description, "Site description");
        assert.strictEqual(direct.nullable, true);
        assert.strictEqual(direct.readOnly, true);
        assert.strictEqual(direct.required, true);
    });

    it("a cycle stub inherits nothing from the definition it cannot expand", () => {
        const recursive = root3({ Node: { type: "object", title: "Definition title" } });
        const stub = OpenApiPropertyMapper.mapPropertyMetadata(
            { $ref: "#/components/schemas/Node" },
            "child",
            false,
            recursive,
            1,
            new Set(["#/components/schemas/Node"])
        );
        assert.strictEqual(stub.title, undefined);
        assert.strictEqual(stub.description, undefined);
        assert.strictEqual(stub.nullable, undefined);
        assert.strictEqual(stub.readOnly, undefined);
    });

    it("a $ref whose value is not a string is not treated as a reference", () => {
        const meta = map({ $ref: 7, type: "string" }, "field", false, root);
        assert.strictEqual(meta.$ref, undefined);
        assert.strictEqual(meta.type, "string");
    });
});

describe("OpenApiPropertyMapper — nested objects", () => {
    it("an object's properties are mapped recursively and its required list is honoured", () => {
        const meta = map(
            {
                type: "object",
                properties: { city: { type: "string" }, zip: { type: "string" } },
                required: ["zip"]
            },
            "address"
        );
        assert.deepStrictEqual(Object.keys(meta.properties || {}), ["city", "zip"]);
        assert.strictEqual(meta.properties?.city.required, false);
        assert.strictEqual(meta.properties?.zip.required, true);
        assert.strictEqual(meta.properties?.city.type, "string");
    });

    it("a required list that is not an array of strings marks nothing required", () => {
        const meta = map({ type: "object", properties: { a: { type: "string" } }, required: true }, "o");
        assert.strictEqual(meta.properties?.a.required, false);
    });

    it("additionalProperties: true is carried through as true", () => {
        const meta = map({ type: "object", properties: { a: { type: "string" } }, additionalProperties: true }, "o");
        assert.strictEqual(meta.additionalProperties, true);
    });

    it("additionalProperties: false is carried through as false, closing the object", () => {
        const meta = map({ type: "object", properties: { a: { type: "string" } }, additionalProperties: false }, "o");
        assert.strictEqual(meta.additionalProperties, false);
    });

    it("a schema-valued additionalProperties becomes a dictionaryMap over that value type", () => {
        const meta = map({ type: "object", additionalProperties: { type: "integer", minimum: 0 } }, "scores");
        assert.strictEqual(meta.ui?.widget, "dictionaryMap");
        const value = meta.additionalProperties;
        assert.strictEqual(typeof value, "object");
        assert.notStrictEqual(value, true);
        assert.notStrictEqual(value, false);
        assert.strictEqual((value as IPropertyMetadata).type, "integer");
        assert.strictEqual((value as IPropertyMetadata).minimum, 0);
    });

    it("an object with neither properties nor additionalProperties renders as a code editor", () => {
        const meta = map({ type: "object" }, "payload");
        assert.strictEqual(meta.ui?.widget, "codeEditor");
        assert.strictEqual(meta.properties, undefined, "an opaque object has no empty properties dictionary");
    });

    it("with no required list, no child property is required", () => {
        const meta = map({ type: "object", properties: { a: { type: "string" }, b: { type: "string" } } }, "o");
        assert.strictEqual(meta.properties?.a.required, false);
        assert.strictEqual(meta.properties?.b.required, false);
    });

    it("the dictionaryMap value descriptor is labelled 'Value' and is not required", () => {
        const meta = map({ type: "object", additionalProperties: { type: "string" } }, "scores");
        const value = meta.additionalProperties as IPropertyMetadata;
        assert.strictEqual(value.ui?.label, "Value");
        assert.strictEqual(value.required, false);
    });

    it("an object with properties is a sub-form, not a code editor", () => {
        const meta = map({ type: "object", properties: { a: { type: "string" } } }, "payload");
        assert.notStrictEqual(meta.ui?.widget, "codeEditor");
    });

    it("an opaque object that already carries a widget or a format keeps it", () => {
        assert.strictEqual(map({ type: "object", ui: { widget: "location" } }, "p").ui?.widget, "location");
        assert.notStrictEqual(map({ type: "object", format: "geo" }, "p").ui?.widget, "codeEditor");
    });

    it("an empty properties block is still a sub-form rather than a code editor", () => {
        assert.notStrictEqual(map({ type: "object", properties: {} }, "payload").ui?.widget, "codeEditor");
    });

    it("an object implied by its properties alone is mapped as an object", () => {
        const meta = map({ properties: { a: { type: "string" } } }, "implied");
        assert.strictEqual(meta.type, "object");
        assert.deepStrictEqual(Object.keys(meta.properties || {}), ["a"]);
    });
});

describe("OpenApiPropertyMapper — arrays", () => {
    it("an array of primitives becomes a multiInput over the item type", () => {
        const meta = map({ type: "array", items: { type: "string", maxLength: 4 } }, "tags");
        assert.strictEqual(meta.type, "array");
        assert.strictEqual(meta.items?.type, "string");
        assert.strictEqual(meta.items?.maxLength, 4);
        assert.strictEqual(meta.ui?.widget, "multiInput");
    });

    it("an array of enumerated primitives becomes a multiSelect", () => {
        const meta = map({ type: "array", items: { type: "string", enum: ["a", "b"] } }, "tags");
        assert.strictEqual(meta.ui?.widget, "multiSelect");
        assert.deepStrictEqual(meta.items?.enum, ["a", "b"]);
    });

    it("an array of objects is neither multiInput nor multiSelect", () => {
        const meta = map({ type: "array", items: { type: "object", properties: { a: { type: "string" } } } }, "rows");
        assert.strictEqual(meta.items?.type, "object");
        assert.notStrictEqual(meta.ui?.widget, "multiInput");
        assert.notStrictEqual(meta.ui?.widget, "multiSelect");
    });

    it("an array whose items are an empty enum is a multiInput, since no value can be selected", () => {
        const meta = map({ type: "array", items: { type: "string", enum: [] } }, "tags");
        assert.strictEqual(meta.ui?.widget, "multiInput");
    });

    it("an array with no items block carries no item descriptor", () => {
        const meta = map({ type: "array" }, "tags");
        assert.strictEqual(meta.items, undefined);
        const nonRecordItems = map({ type: "array", items: ["string"] }, "tags");
        assert.strictEqual(nonRecordItems.items, undefined);
    });

    it("an items block on a non-array property is not mapped as an item type", () => {
        assert.strictEqual(map({ type: "string", items: { type: "integer" } }, "s").items, undefined);
        assert.strictEqual(map({ type: "integer", items: { type: "integer" } }, "n").items, undefined);
    });

    it("the item descriptor is labelled 'Items' and is not itself required", () => {
        const meta = map({ type: "array", items: { type: "string" } }, "tags", true);
        assert.strictEqual(meta.required, true);
        assert.strictEqual(meta.items?.required, false);
        assert.strictEqual(meta.items?.ui?.label, "Items");
    });

    it("array cardinality constraints survive onto the descriptor", () => {
        const meta = map({ type: "array", items: { type: "string" }, minItems: 1, maxItems: 5, uniqueItems: true }, "t");
        assert.strictEqual(meta.minItems, 1);
        assert.strictEqual(meta.maxItems, 5);
        assert.strictEqual(meta.uniqueItems, true);
    });
});

describe("OpenApiPropertyMapper — polymorphism", () => {
    const root = root3({
        Dog: { type: "object", title: "A dog", properties: { bark: { type: "boolean" } }, required: ["bark"] },
        Cat: { type: "object", properties: { purr: { type: "boolean" } } }
    });

    it("oneOf produces one branch per member, in order, under the polymorphic widget", () => {
        const meta = map(
            { oneOf: [{ type: "object", title: "A" }, { type: "object", title: "B" }, { type: "string" }] },
            "shape",
            false,
            root
        );
        assert.strictEqual(meta.ui?.widget, "polymorphic");
        assert.strictEqual(meta.oneOf?.length, 3);
        assert.strictEqual(meta.oneOf?.[0].title, "A");
        assert.strictEqual(meta.oneOf?.[1].title, "B");
        assert.strictEqual(meta.oneOf?.[2].type, "string");
    });

    it("anyOf produces its own branch array and the same widget", () => {
        const meta = map({ anyOf: [{ type: "string" }, { type: "integer" }] }, "value", false, root);
        assert.strictEqual(meta.ui?.widget, "polymorphic");
        assert.strictEqual(meta.anyOf?.length, 2);
        assert.strictEqual(meta.anyOf?.[0].type, "string");
        assert.strictEqual(meta.anyOf?.[1].type, "integer");
        assert.strictEqual(meta.oneOf, undefined);
    });

    it("oneOf and anyOf together are both mapped", () => {
        const meta = map({ oneOf: [{ type: "string" }], anyOf: [{ type: "integer" }] }, "value", false, root);
        assert.strictEqual(meta.oneOf?.length, 1);
        assert.strictEqual(meta.anyOf?.length, 1);
    });

    it("a discriminator alone selects the polymorphic widget", () => {
        const meta = map(
            { type: "object", properties: { kind: { type: "string" } }, discriminator: { propertyName: "kind" } },
            "pet",
            false,
            root
        );
        assert.strictEqual(meta.discriminator?.propertyName, "kind");
        assert.strictEqual(meta.ui?.widget, "polymorphic");
    });

    it("a 2.0 string discriminator means the same as the 3.0 object form", () => {
        const two = map({ type: "object", discriminator: "kind" }, "pet", false, root);
        assert.deepStrictEqual(two.discriminator, { propertyName: "kind" });
        assert.strictEqual(two.ui?.widget, "polymorphic");
    });

    it("an object with neither composition nor discriminator is not polymorphic", () => {
        assert.notStrictEqual(map({ type: "object", properties: { a: { type: "string" } } }, "p").ui?.widget,
            "polymorphic");
    });

    it("a oneOf that is not an array is ignored", () => {
        const meta = map({ type: "object", properties: { a: { type: "string" } }, oneOf: { type: "string" } }, "p");
        assert.strictEqual(meta.oneOf, undefined);
        assert.notStrictEqual(meta.ui?.widget, "polymorphic");
    });

    it("a not schema is mapped onto the descriptor", () => {
        const meta = map({ type: "object", not: { type: "string", maxLength: 3 } }, "p", false, root);
        assert.strictEqual(meta.not?.type, "string");
        assert.strictEqual(meta.not?.maxLength, 3);
    });

    it("a not that is not an object is ignored", () => {
        assert.strictEqual(map({ type: "object", not: true }, "p").not, undefined);
    });

    it("a branch given as a $ref is titled after the definition and keeps its pointer", () => {
        const meta = map({ oneOf: [{ $ref: "#/components/schemas/Dog" }] }, "pet", false, root);
        const branch = meta.oneOf?.[0];
        assert.strictEqual(branch?.$ref, "#/components/schemas/Dog");
        assert.strictEqual(branch?.title, "A dog", "the definition's own title names the variant");
        assert.deepStrictEqual(Object.keys(branch?.properties || {}), ["bark"]);
    });

    it("a $ref branch whose definition has no title is named after the definition key", () => {
        const meta = map({ oneOf: [{ $ref: "#/components/schemas/Cat" }] }, "pet", false, root);
        assert.strictEqual(meta.oneOf?.[0].title, "Cat");
    });

    it("a title on the branch site wins over the definition's", () => {
        const meta = map(
            { oneOf: [{ $ref: "#/components/schemas/Dog", title: "Good boy" }] },
            "pet",
            false,
            root
        );
        assert.strictEqual(meta.oneOf?.[0].title, "Good boy");
    });

    it("a $ref branch carries the definition's required list as the branch's required keys", () => {
        const meta = map({ oneOf: [{ $ref: "#/components/schemas/Dog" }] }, "pet", false, root);
        assert.deepStrictEqual(meta.oneOf?.[0].required, ["bark"]);
    });

    it("an inline branch carries its own required list", () => {
        const meta = map(
            { oneOf: [{ type: "object", properties: { a: { type: "string" } }, required: ["a"] }] },
            "pet",
            false,
            root
        );
        assert.deepStrictEqual(meta.oneOf?.[0].required, ["a"]);
    });

    it("an inline branch without a title gets no synthesized label", () => {
        const meta = map({ oneOf: [{ type: "object", properties: { a: { type: "string" } } }] }, "pet", false, root);
        assert.strictEqual(meta.oneOf?.[0].ui?.label, undefined, "a nameless variant must not be labelled 'Variant0'");
    });

    it("an inline branch with a title is labelled with it", () => {
        const meta = map({ oneOf: [{ type: "object", title: "Square", properties: { s: { type: "number" } } }] }, "p");
        assert.strictEqual(meta.oneOf?.[0].ui?.label, "Square");
        assert.strictEqual(meta.oneOf?.[0].title, "Square");
    });

    it("a branch that is not an object at all still yields a descriptor", () => {
        const meta = map({ oneOf: [null, 42, "x"] }, "pet", false, root);
        assert.strictEqual(meta.oneOf?.length, 3);
        for (const branch of meta.oneOf || []) {
            assert.strictEqual(typeof branch.type, "string");
        }
    });

    it("an unusable branch is labelled by its position, so the selector is never blank", () => {
        const one = map({ oneOf: [null, 42] }, "pet", false, root);
        assert.strictEqual(one.oneOf?.[0].ui?.label, "Variant0");
        assert.strictEqual(one.oneOf?.[1].ui?.label, "Variant1");
        const any = map({ anyOf: [null, 42] }, "pet", false, root);
        assert.strictEqual(any.anyOf?.[0].ui?.label, "Any Variant0");
        assert.strictEqual(any.anyOf?.[1].ui?.label, "Any Variant1");
    });

    it("a branch is never itself marked required", () => {
        const meta = map({ oneOf: [{ type: "string" }] }, "pet", true, root);
        assert.strictEqual(meta.required, true, "the property is required");
        assert.strictEqual(meta.oneOf?.[0].required, false, "the variant is not");
    });

    it("a $ref branch whose definition declares no required list is not marked required", () => {
        const meta = map({ oneOf: [{ $ref: "#/components/schemas/Cat" }] }, "pet", false, root);
        assert.strictEqual(meta.oneOf?.[0].required, false);
    });

    it("the not schema is labelled and is not itself required", () => {
        const meta = map({ type: "object", not: { type: "string" } }, "p", true, root);
        assert.strictEqual(meta.not?.ui?.label, "Not Variant");
        assert.strictEqual(meta.not?.required, false);
    });

    it("a $ref branch that resolves nowhere falls back to mapping the branch site itself", () => {
        const meta = map({ oneOf: [{ $ref: "#/components/schemas/Ghost" }] }, "pet", false, root);
        assert.strictEqual(meta.oneOf?.length, 1);
        assert.strictEqual(meta.oneOf?.[0].$ref, "#/components/schemas/Ghost");
    });

    it("a recursive oneOf branch terminates", () => {
        const recursive = root3({
            Node: { oneOf: [{ $ref: "#/components/schemas/Node" }, { type: "string" }] }
        });
        const meta = map({ $ref: "#/components/schemas/Node" }, "node", false, recursive);
        assert.strictEqual(meta.oneOf?.length, 2);
        assert.strictEqual(meta.oneOf?.[1].type, "string");
    });
});

describe("OpenApiPropertyMapper — mapProperties", () => {
    it("every key of the properties block appears in the result, in order", () => {
        const mapped = OpenApiPropertyMapper.mapProperties(
            { a: { type: "string" }, b: { type: "integer" }, c: { type: "boolean" } },
            ["b"],
            {}
        );
        assert.deepStrictEqual(Object.keys(mapped), ["a", "b", "c"]);
        assert.strictEqual(mapped.a.type, "string");
        assert.strictEqual(mapped.b.type, "integer");
        assert.strictEqual(mapped.c.type, "boolean");
    });

    it("exactly the keys named in the required array are marked required", () => {
        fc.assert(
            fc.property(
                fc.uniqueArray(fc.constantFrom("a", "b", "c", "d"), { minLength: 1, maxLength: 4 }),
                fc.uniqueArray(fc.constantFrom("a", "b", "c", "d", "e"), { maxLength: 5 }),
                (keys, required) => {
                    const properties: Record<string, unknown> = {};
                    for (const key of keys) {
                        properties[key] = { type: "string" };
                    }
                    const mapped = OpenApiPropertyMapper.mapProperties(properties, [...required], {});
                    for (const key of keys) {
                        assert.strictEqual(mapped[key].required, required.includes(key), key);
                    }
                }
            ),
            { numRuns: 300 }
        );
    });

    it("a properties block that is not a record maps to no properties at all", () => {
        for (const raw of [undefined, null, 42, "a", ["a"], true]) {
            assert.deepStrictEqual(OpenApiPropertyMapper.mapProperties(raw, [], {}), {});
        }
    });

    it("a property whose definition is not an object is still given a descriptor", () => {
        const mapped = OpenApiPropertyMapper.mapProperties({ a: "nonsense", b: null }, [], {});
        assert.deepStrictEqual(Object.keys(mapped), ["a", "b"]);
        assert.strictEqual(mapped.a.ui?.label, "A");
    });
});

describe("OpenApiPropertyMapper — recursion limit", () => {
    /** A chain of `depth` nested object properties, innermost leaf named `leaf`. */
    const nest = (depth: number): Record<string, unknown> => {
        let node: Record<string, unknown> = { type: "string", title: "Leaf" };
        for (let i = depth; i > 0; i--) {
            node = { type: "object", properties: { child: node } };
        }
        return node;
    };

    /** Walks `depth` levels of `properties.child`. */
    const descend = (meta: IPropertyMetadata, depth: number): IPropertyMetadata | undefined => {
        let node: IPropertyMetadata | undefined = meta;
        for (let i = 0; i < depth; i++) {
            node = node?.properties?.child;
        }
        return node;
    };

    it("a chain at the documented limit is mapped in full", () => {
        const meta = map(nest(MAX_MAPPING_DEPTH), "root");
        const leaf = descend(meta, MAX_MAPPING_DEPTH);
        assert.strictEqual(leaf?.type, "string");
        assert.strictEqual(leaf?.title, "Leaf");
    });

    it("mapPropertyMetadata past the limit returns a placeholder and reports the truncation", () => {
        const { value: meta, entries } = withLogCapture(() =>
            OpenApiPropertyMapper.mapPropertyMetadata(
                { type: "string", maxLength: 5, title: "Dropped" },
                "tooDeep",
                true,
                {},
                MAX_MAPPING_DEPTH + 1
            )
        );
        assert.strictEqual(meta.type, "object", "the placeholder is an object node");
        assert.strictEqual(meta.ui?.label, "Too Deep");
        assert.strictEqual(meta.maxLength, undefined, "constraints past the limit are not mapped");
        assert.strictEqual(meta.title, undefined);
        assert.ok(reported(entries, "tooDeep"), "the truncation was not reported");
    });

    it("mapPropertyMetadata exactly at the limit is still mapped", () => {
        const meta = OpenApiPropertyMapper.mapPropertyMetadata(
            { type: "string", maxLength: 5 },
            "atLimit",
            false,
            {},
            MAX_MAPPING_DEPTH
        );
        assert.strictEqual(meta.type, "string");
        assert.strictEqual(meta.maxLength, 5);
    });

    it("mapProperties past the limit drops every property and says how many", () => {
        const { value: mapped, entries } = withLogCapture(() =>
            OpenApiPropertyMapper.mapProperties(
                { a: { type: "string" }, b: { type: "string" }, c: { type: "string" } },
                [],
                {},
                MAX_MAPPING_DEPTH + 1
            )
        );
        assert.deepStrictEqual(mapped, {});
        assert.ok(reported(entries, "3"), `the dropped count was not reported: ${entries.map((e) => e.details)}`);
    });

    it("mapProperties exactly at the limit still maps its properties", () => {
        const mapped = OpenApiPropertyMapper.mapProperties({ a: { type: "string" } }, [], {}, MAX_MAPPING_DEPTH);
        assert.deepStrictEqual(Object.keys(mapped), ["a"]);
    });

    it("a chain deeper than the limit is truncated and reported, never silently emptied", () => {
        const { value: meta, entries } = withLogCapture(() => map(nest(MAX_MAPPING_DEPTH + 3), "root"));
        const atLimit = descend(meta, MAX_MAPPING_DEPTH);
        assert.notStrictEqual(atLimit, undefined, "the supported levels must still be present");
        assert.ok(entries.length > 0, "truncation happened with no diagnostic at all");
        assert.ok(reported(entries, "MAX_SCHEMA_DEPTH"), "the truncation did not name the limit");
    });

    it("nesting through array items is also bounded, and the truncation is reported", () => {
        let node: Record<string, unknown> = { type: "string", title: "Leaf" };
        for (let i = 0; i < MAX_MAPPING_DEPTH + 4; i++) {
            node = { type: "array", items: node };
        }
        const { value: meta, entries } = withLogCapture(() => map(node, "deepArray"));
        let cursor: IPropertyMetadata | undefined = meta;
        for (let i = 0; i < MAX_MAPPING_DEPTH + 4; i++) {
            cursor = cursor?.items;
        }
        assert.notStrictEqual(cursor?.type, "string", "the chain was not truncated at all");
        assert.ok(reported(entries, "MAX_SCHEMA_DEPTH"), "the array truncation was not reported");
    });

    it("nesting through oneOf branches is bounded, and the truncation is reported", () => {
        let node: Record<string, unknown> = { type: "string", title: "Leaf" };
        for (let i = 0; i < MAX_MAPPING_DEPTH + 4; i++) {
            node = { oneOf: [node] };
        }
        const { value: meta, entries } = withLogCapture(() => map(node, "deepOneOf"));
        let cursor: IPropertyMetadata | undefined = meta;
        for (let i = 0; i < MAX_MAPPING_DEPTH + 4; i++) {
            cursor = cursor?.oneOf?.[0];
        }
        assert.notStrictEqual(cursor?.type, "string", "the chain was not truncated at all");
        assert.ok(reported(entries, "MAX_SCHEMA_DEPTH"), "the oneOf truncation was not reported");
    });

    it("nesting through anyOf branches is bounded too", () => {
        let node: Record<string, unknown> = { type: "string", title: "Leaf" };
        for (let i = 0; i < MAX_MAPPING_DEPTH + 4; i++) {
            node = { anyOf: [node] };
        }
        const { entries } = withLogCapture(() => map(node, "deepAnyOf"));
        assert.ok(reported(entries, "MAX_SCHEMA_DEPTH"), "the anyOf truncation was not reported");
    });

    it("nesting through not is bounded too", () => {
        let node: Record<string, unknown> = { type: "string", title: "Leaf" };
        for (let i = 0; i < MAX_MAPPING_DEPTH + 4; i++) {
            node = { type: "object", not: node };
        }
        const { entries } = withLogCapture(() => map(node, "deepNot"));
        assert.ok(reported(entries, "MAX_SCHEMA_DEPTH"), "the not truncation was not reported");
    });

    it("nesting through additionalProperties is bounded too", () => {
        let node: Record<string, unknown> = { type: "string", title: "Leaf" };
        for (let i = 0; i < MAX_MAPPING_DEPTH + 4; i++) {
            node = { type: "object", additionalProperties: node };
        }
        const { entries } = withLogCapture(() => map(node, "deepMap"));
        assert.ok(reported(entries, "MAX_SCHEMA_DEPTH"), "the dictionary truncation was not reported");
    });

    it("a chain of $ref hops through array items is bounded, and the truncation is reported", () => {
        const schemas: Record<string, unknown> = {};
        const levels = MAX_MAPPING_DEPTH + 6;
        for (let i = 0; i < levels; i++) {
            schemas[`L${i}`] = { type: "array", items: { $ref: `#/components/schemas/L${i + 1}` } };
        }
        schemas[`L${levels}`] = { type: "string", title: "Leaf" };
        const { entries } = withLogCapture(() => map({ $ref: "#/components/schemas/L0" }, "items", false,
            root3(schemas)));
        assert.ok(reported(entries, "MAX_SCHEMA_DEPTH"), "the $ref chain was not truncated");
    });

    it("the two halves of a level cost one unit between them, not two", () => {
        // mapProperties -> mapPropertyMetadata -> applyNestedTypes -> mapProperties is one level.
        // Charging both halves would halve the effective limit, so the leaf at level 8 would be a
        // placeholder rather than the declared string.
        const meta = map(nest(MAX_MAPPING_DEPTH), "root");
        assert.strictEqual(descend(meta, MAX_MAPPING_DEPTH)?.type, "string");
        assert.strictEqual(descend(meta, MAX_MAPPING_DEPTH - 1)?.type, "object");
    });
});
