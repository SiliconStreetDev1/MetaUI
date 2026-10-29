/**
 * @file nested-caption.spec.ts
 * @description Properties for `NestedCaption`, the read-only caption of a nested drill-down button.
 *
 * The caption names what the button opens; it does not preview the record. Previewing the object's
 * own values was tried and withdrawn, so these properties mainly pin the absence of a preview: for
 * any nested payload at all, an object yields the plain caption and only an array adds anything,
 * its entry count.
 */

import * as assert from "assert";
import { fc } from "./fc-config";
import { NestedCaption } from "../../src/nz/co/siliconst/ui5/metaui/utils/NestedCaption";
import { I18n, TEXT_KEY } from "../../src/nz/co/siliconst/ui5/metaui/utils/I18n";

const LABEL = "Order";
const PLAIN_CAPTION = I18n.getText(TEXT_KEY.nestedView, [LABEL]);

/** A string that may carry line breaks and runs of whitespace, as a `textArea` value does. */
const textArb: fc.Arbitrary<string> = fc.oneof(
    fc.string({ maxLength: 30 }),
    fc.array(fc.constantFrom("Acme", "Ltd", "\n", "\r\n", "\t", "  ", "Smith, John", "PO-1"), { maxLength: 8 })
        .map((parts) => parts.join(""))
);

/** Arbitrary nested payloads: scalars, nulls, arrays and objects, mixed at every level. */
const { payload: payloadArb } = fc.letrec((tie) => ({
    leaf: fc.oneof(
        textArb,
        fc.double(),
        fc.integer(),
        fc.boolean(),
        fc.constant(null),
        fc.constant(undefined)
    ),
    payload: fc.oneof(
        { depthSize: "small", withCrossShrink: true },
        tie("leaf"),
        fc.array(tie("payload"), { maxLength: 5 }),
        fc.dictionary(fc.string({ maxLength: 6 }), tie("payload"), { maxKeys: 12 })
    )
}));

/** Any object, however deeply nested — none of them may contribute a preview. */
const objectArb: fc.Arbitrary<Record<string, unknown>> = fc.dictionary(
    fc.string({ maxLength: 6 }),
    payloadArb,
    { maxKeys: 40 }
);

describe("NestedCaption — read-only drill-down button caption", () => {
    it("never renders [object Object] for any nested payload", () => {
        fc.assert(
            fc.property(payloadArb, (payload) => {
                const caption = NestedCaption.build(LABEL, payload);
                assert.ok(!caption.includes("[object Object]"), `caption was '${caption}'`);
            })
        );
    });

    it("gives an object the plain caption, whatever it holds", () => {
        fc.assert(
            fc.property(objectArb, (record) => {
                assert.strictEqual(NestedCaption.build(LABEL, record), PLAIN_CAPTION);
            })
        );
    });

    it("never truncates, never spans lines, and is never empty", () => {
        fc.assert(
            fc.property(payloadArb, (payload) => {
                const caption = NestedCaption.build(LABEL, payload);
                assert.ok(caption.trim().length > 0, "caption is empty");
                assert.ok(!caption.includes("…"), `caption was truncated: '${caption}'`);
                assert.ok(!/[\r\n\t]/.test(caption), `caption spans lines: '${JSON.stringify(caption)}'`);
            })
        );
    });

    it("summarizes an array by its entry count, and nothing else", () => {
        fc.assert(
            fc.property(fc.array(payloadArb, { maxLength: 30 }), (items) => {
                assert.strictEqual(
                    NestedCaption.build(LABEL, items),
                    I18n.getText(TEXT_KEY.nestedViewSummary, [LABEL, items.length])
                );
            })
        );
    });

    it("handles the edge payloads explicitly", () => {
        assert.strictEqual(NestedCaption.build(LABEL, {}), PLAIN_CAPTION, "{}");
        assert.strictEqual(NestedCaption.build(LABEL, null), PLAIN_CAPTION, "null");
        assert.strictEqual(NestedCaption.build(LABEL, undefined), PLAIN_CAPTION, "undefined");
        assert.strictEqual(NestedCaption.build(LABEL, "a string"), PLAIN_CAPTION, "a scalar where an object belongs");
        assert.strictEqual(
            NestedCaption.build(LABEL, [{ Sku: "A" }, { Sku: "B" }]),
            I18n.getText(TEXT_KEY.nestedViewSummary, [LABEL, 2]),
            "an array of objects keeps its count form"
        );
        assert.strictEqual(
            NestedCaption.build(LABEL, {
                Code: "PO-1",
                Customer: { Name: "Acme", Addr: { City: "Auckland" } },
                Lines: [{ Sku: "A" }, { Sku: "B" }],
                Notes: "Expedite"
            }),
            PLAIN_CAPTION,
            "the payload that first exposed this shows no preview at all"
        );
    });
});
