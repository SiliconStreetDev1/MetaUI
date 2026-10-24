/**
 * @file formatters.spec.ts
 * @description The documented input/output table of each presentational formatter.
 *
 * `pipeline.spec.ts` states the round-trip law: `parse(format(v)) === v`. A round-trip holds just
 * as well for a pair of functions that both do nothing, so it says nothing about which display
 * form a value takes, or which shapes a two-way binding accepts without rewriting the model.
 *
 * Each plugin's own contract is the reference here, and each one is a documented example in the
 * class JSDoc:
 *  - phone: `"5551234567"` ↔ `"(555) 123-4567"`, `"+15551234567"` ↔ `"+1 (555) 123-4567"`;
 *  - currency: a symbol prefix, `"$"` by default, with the sign outside the symbol;
 *  - date: ISO `YYYY-MM-DD` ↔ the locale's medium style.
 *
 * All three are *total*: an input they do not recognise comes back unchanged rather than blanked,
 * because these run in two-way bindings where rewriting an unrecognised value silently corrupts
 * the model. That totality is the property most of the cases below are really about.
 *
 * `sap.ui.core.format.*` is stubbed for Node by `test/node/ui5-stub.js` as an exactly invertible
 * en-US pair (grouped thousands, two fraction digits; `MMM d, yyyy`), so the expected display
 * strings below describe the plugin's own pre- and post-processing, not a locale.
 */

import * as assert from "assert";
import { fc } from "./fc-config";
import { PhoneFormatterPlugin } from "../../src/nz/co/siliconst/ui5/metaui/plugins/formatters/PhoneFormatterPlugin";
import {
    CurrencyFormatterPlugin
} from "../../src/nz/co/siliconst/ui5/metaui/plugins/formatters/CurrencyFormatterPlugin";
import { DateFormatterPlugin } from "../../src/nz/co/siliconst/ui5/metaui/plugins/formatters/DateFormatterPlugin";
import { safeToString, safeToNumber } from "../../src/nz/co/siliconst/ui5/metaui/core/SafeConvert";

describe("PhoneFormatterPlugin — format", () => {
    const phone = new PhoneFormatterPlugin();

    it("a ten-digit national number takes the documented national mask", () => {
        assert.strictEqual(phone.format("5551234567"), "(555) 123-4567");
        assert.strictEqual(phone.format(5551234567), "(555) 123-4567", "a numeric model value too");
        assert.strictEqual(phone.format("(555) 123-4567"), "(555) 123-4567", "already masked, unchanged");
        assert.strictEqual(phone.format("555-123-4567"), "(555) 123-4567");
        assert.strictEqual(phone.format("555.123.4567"), "(555) 123-4567");
        assert.strictEqual(phone.format("  5551234567  "), "(555) 123-4567");
    });

    it("an E.164 US number takes the documented international mask", () => {
        assert.strictEqual(phone.format("+15551234567"), "+1 (555) 123-4567");
        assert.strictEqual(phone.format("+1 (555) 123-4567"), "+1 (555) 123-4567");
        assert.strictEqual(phone.format("+1-555-123-4567"), "+1 (555) 123-4567");
    });

    it("a non-US international number is split after a leading country-code group", () => {
        // The plugin carries no country-code table: it splits after two digits for a 9-to-12 digit
        // number and after three for a 13-digit one. See finding P1 below for what that costs.
        assert.strictEqual(phone.format("+442071234567"), "+44 2071234567");
        assert.strictEqual(phone.format("+6421234567"), "+64 21234567");
        assert.strictEqual(phone.format("+2641234567890"), "+264 1234567890");
    });

    it("P1 (finding): a three-digit country code of ordinary length is split after two digits", () => {
        // +358 is Finland; the display reads "+35 8...". Only the 13-digit case reaches the
        // three-digit rule, because the two-digit rule is tried first and matches 9-12 digits.
        // Harmless for a round-trip — `parse` strips the spacing either way — but the rendered
        // country code is wrong. Delete this test if the plugin gains a country-code table.
        assert.strictEqual(phone.format("+3581234567"), "+35 81234567");
        assert.strictEqual(phone.parse(phone.format("+3581234567")), "+3581234567");
    });

    it("an international number too short or too long for any rule is left as written", () => {
        assert.strictEqual(phone.format("+1"), "+1");
        assert.strictEqual(phone.format("+123456"), "+123456");
        assert.strictEqual(phone.format("+1234567890123456"), "+1234567890123456");
        assert.strictEqual(phone.format("+"), "+");
    });

    it("a national number of the wrong length is left as written, not partially masked", () => {
        for (const raw of ["555123456", "55512345678", "12345", "abc", "555 123 456"]) {
            assert.strictEqual(phone.format(raw), raw.trim(), raw);
        }
    });

    it("an empty model value renders as the empty string", () => {
        assert.strictEqual(phone.format(null), "");
        assert.strictEqual(phone.format(undefined), "");
        assert.strictEqual(phone.format(""), "");
    });

    it("a value that is neither a string nor a number is stringified, not masked", () => {
        assert.strictEqual(phone.format(true), "true");
        assert.strictEqual(phone.format(["5551234567"]), "5551234567");
        assert.strictEqual(phone.format({}), "[object Object]");
    });

    it("zero is a value, not an absence", () => {
        assert.strictEqual(phone.format(0), "0");
    });
});

describe("PhoneFormatterPlugin — parse", () => {
    const phone = new PhoneFormatterPlugin();

    it("a masked national number parses back to bare digits", () => {
        assert.strictEqual(phone.parse("(555) 123-4567"), "5551234567");
        assert.strictEqual(phone.parse("555-123-4567"), "5551234567");
        assert.strictEqual(phone.parse("5551234567"), "5551234567");
        assert.strictEqual(phone.parse("  (555) 123-4567  "), "5551234567");
    });

    it("a masked international number parses back to E.164, keeping the plus", () => {
        assert.strictEqual(phone.parse("+1 (555) 123-4567"), "+15551234567");
        assert.strictEqual(phone.parse("+44 2071234567"), "+442071234567");
        assert.strictEqual(phone.parse("+358 1234567"), "+3581234567");
    });

    it("an eleven-digit national number parses to digits, keeping the leading 1", () => {
        assert.strictEqual(phone.parse("1 (555) 123-4567"), "15551234567");
    });

    it("an input the formatter never produces comes back untouched", () => {
        for (const raw of ["not a phone", "ext. 42", "555-1234", "+12", "(555) 123-456"]) {
            assert.strictEqual(phone.parse(raw), raw, raw);
        }
    });

    it("the untouched input keeps its original spacing, not the trimmed form", () => {
        assert.strictEqual(phone.parse("  12345  "), "  12345  ");
    });

    it("a blank or non-string value is passed straight through", () => {
        assert.strictEqual(phone.parse(""), "");
        assert.strictEqual(phone.parse("   "), "");
        assert.strictEqual(phone.parse(null), null);
        assert.strictEqual(phone.parse(undefined), undefined);
        assert.strictEqual(phone.parse(5551234567), 5551234567);
        const value = { a: 1 };
        assert.strictEqual(phone.parse(value), value);
    });

    it("parse is idempotent, so a second read never changes the model again", () => {
        fc.assert(
            fc.property(fc.string({ maxLength: 20 }), (raw) => {
                const once = phone.parse(raw);
                assert.deepStrictEqual(phone.parse(once), once);
            })
        );
    });
});

describe("CurrencyFormatterPlugin — format", () => {
    const currency = new CurrencyFormatterPlugin();

    it("a positive amount is prefixed with the symbol and grouped to two decimals", () => {
        assert.strictEqual(currency.format(0), "$0.00");
        assert.strictEqual(currency.format(5), "$5.00");
        assert.strictEqual(currency.format(1234.5), "$1,234.50");
        assert.strictEqual(currency.format(1234567.89), "$1,234,567.89");
    });

    it("a negative amount puts the sign outside the symbol, as accounting convention requires", () => {
        assert.strictEqual(currency.format(-5), "-$5.00");
        assert.strictEqual(currency.format(-1234.5), "-$1,234.50");
    });

    it("the symbol can be overridden, and whitespace around it is trimmed", () => {
        assert.strictEqual(currency.format(5, "€"), "€5.00");
        assert.strictEqual(currency.format(5, " £ "), "£5.00");
        assert.strictEqual(currency.format(5, "USD"), "USD5.00");
        assert.strictEqual(currency.format(-5, "€"), "-€5.00");
    });

    it("an argument that is not a usable symbol falls back to the dollar sign", () => {
        for (const args of [undefined, null, "", "   ", 7, true, { symbol: "€" }, ["€"]]) {
            assert.strictEqual(currency.format(5, args), "$5.00", JSON.stringify(args));
        }
    });

    it("a numeric string is formatted as the number it denotes", () => {
        assert.strictEqual(currency.format("5"), "$5.00");
        assert.strictEqual(currency.format("1234.5"), "$1,234.50");
        assert.strictEqual(currency.format("-5"), "-$5.00");
    });

    it("an empty model value renders as the empty string", () => {
        for (const raw of [null, undefined, "", "   "]) {
            assert.strictEqual(currency.format(raw), "", JSON.stringify(raw));
        }
    });

    it("a value with no finite numeric reading is shown as written, not as a bogus amount", () => {
        for (const raw of ["abc", "12abc", Number.NaN, Number.POSITIVE_INFINITY, {}]) {
            const rendered = currency.format(raw);
            assert.strictEqual(typeof rendered, "string");
            assert.ok(!rendered.startsWith("$"), `${String(raw)} rendered as the amount ${rendered}`);
        }
    });

    it("a boolean is shown as itself and never coerced to 1 or 0", () => {
        assert.strictEqual(currency.format(true), "true");
        assert.strictEqual(currency.format(false), "false");
    });
});

describe("CurrencyFormatterPlugin — parse", () => {
    const currency = new CurrencyFormatterPlugin();

    it("a formatted amount parses back to its number", () => {
        assert.strictEqual(currency.parse("$5.00"), 5);
        assert.strictEqual(currency.parse("$1,234.50"), 1234.5);
        assert.strictEqual(currency.parse("-$1,234.50"), -1234.5);
        assert.strictEqual(currency.parse("$0.00"), 0);
    });

    it("the same amount parses under the symbol it was formatted with", () => {
        assert.strictEqual(currency.parse("€5.00", "€"), 5);
        assert.strictEqual(currency.parse("-€5.00", "€"), -5);
        assert.strictEqual(currency.parse("USD5.00", "USD"), 5);
    });

    it("a bare number, typed or already parsed, is taken as it is", () => {
        assert.strictEqual(currency.parse("5"), 5);
        assert.strictEqual(currency.parse("-5.25"), -5.25);
        assert.strictEqual(currency.parse(" 42 "), 42);
        assert.strictEqual(currency.parse(42), 42);
        assert.strictEqual(currency.parse(-0.5), -0.5);
    });

    it("a leading plus is accepted and does not change the sign", () => {
        assert.strictEqual(currency.parse("+$5.00"), 5);
    });

    it("a minus written after the symbol is still a negative amount", () => {
        assert.strictEqual(currency.parse("$-5.00"), -5);
    });

    it("an input that denotes no amount comes back untouched", () => {
        for (const raw of ["abc", "$", "$abc", "five dollars", "$1.2.3"]) {
            assert.strictEqual(currency.parse(raw), raw, raw);
        }
    });

    it("a blank or non-string value is passed straight through", () => {
        assert.strictEqual(currency.parse(""), "");
        assert.strictEqual(currency.parse("   "), "");
        assert.strictEqual(currency.parse(null), null);
        assert.strictEqual(currency.parse(undefined), undefined);
        assert.strictEqual(currency.parse(true), true);
    });

    it("format and parse invert each other over two-decimal amounts under any symbol", () => {
        fc.assert(
            fc.property(
                fc.integer({ min: -10_000_000, max: 10_000_000 }),
                fc.constantFrom("$", "€", "£", "USD", "NZ$"),
                (cents, symbol) => {
                    const amount = Number((cents / 100).toFixed(2));
                    assert.strictEqual(currency.parse(currency.format(amount, symbol), symbol), amount);
                }
            ),
            { numRuns: 400 }
        );
    });
});

describe("DateFormatterPlugin — format", () => {
    const dateFormatter = new DateFormatterPlugin();

    it("an ISO date renders in the locale's medium style", () => {
        assert.strictEqual(dateFormatter.format("2026-10-15"), "Oct 15, 2026");
        assert.strictEqual(dateFormatter.format("2024-02-29"), "Feb 29, 2024");
        assert.strictEqual(dateFormatter.format("2000-01-01"), "Jan 1, 2000");
        assert.strictEqual(dateFormatter.format("2026-12-31"), "Dec 31, 2026");
    });

    it("surrounding whitespace is ignored", () => {
        assert.strictEqual(dateFormatter.format("  2026-10-15  "), "Oct 15, 2026");
    });

    it("a Date instance renders the same as its ISO spelling", () => {
        assert.strictEqual(dateFormatter.format(new Date(2026, 9, 15)), "Oct 15, 2026");
    });

    it("an invalid Date renders as the empty string rather than 'Invalid Date'", () => {
        assert.strictEqual(dateFormatter.format(new Date("nonsense")), "");
    });

    it("an ISO-shaped string that is not a real calendar date is shown as written", () => {
        for (const raw of ["2023-02-29", "2026-13-01", "2026-00-10", "2026-04-31", "2026-01-32"]) {
            assert.strictEqual(dateFormatter.format(raw), raw, raw);
        }
    });

    it("a string that is not a date at all is shown as written", () => {
        for (const raw of ["not a date", "15/10/2026", "2026"]) {
            assert.strictEqual(typeof dateFormatter.format(raw), "string", raw);
        }
        assert.strictEqual(dateFormatter.format("not a date"), "not a date");
    });

    it("an empty model value renders as the empty string", () => {
        for (const raw of [null, undefined, "", 0, false, Number.NaN]) {
            assert.strictEqual(dateFormatter.format(raw), "", String(raw));
        }
    });
});

describe("DateFormatterPlugin — parse", () => {
    const dateFormatter = new DateFormatterPlugin();

    it("a medium-style display string parses back to its ISO date", () => {
        assert.strictEqual(dateFormatter.parse("Oct 15, 2026"), "2026-10-15");
        assert.strictEqual(dateFormatter.parse("Feb 29, 2024"), "2024-02-29");
        assert.strictEqual(dateFormatter.parse("Jan 1, 2000"), "2000-01-01");
    });

    it("an ISO date the user typed is kept as it is", () => {
        assert.strictEqual(dateFormatter.parse("2026-10-15"), "2026-10-15");
        assert.strictEqual(dateFormatter.parse("  2026-10-15  "), "2026-10-15", "the trimmed form is stored");
    });

    it("the parsed ISO date is always zero-padded to the documented width", () => {
        const iso = dateFormatter.parse("Jan 1, 2000");
        assert.strictEqual(iso, "2000-01-01");
        assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(String(iso)));
    });

    it("an ISO-shaped string that is not a real calendar date comes back untouched", () => {
        for (const raw of ["2023-02-29", "2026-13-01", "2026-00-10", "2026-04-31"]) {
            assert.strictEqual(dateFormatter.parse(raw), raw, raw);
        }
    });

    it("an unparseable display string comes back untouched", () => {
        for (const raw of ["not a date", "Xyz 1, 2000", "Oct 32, 2026", "15/10/2026"]) {
            assert.strictEqual(dateFormatter.parse(raw), raw, raw);
        }
    });

    it("a blank or non-string value is passed straight through", () => {
        assert.strictEqual(dateFormatter.parse(""), "");
        assert.strictEqual(dateFormatter.parse("   "), "");
        assert.strictEqual(dateFormatter.parse(null), null);
        assert.strictEqual(dateFormatter.parse(undefined), undefined);
        const when = new Date(0);
        assert.strictEqual(dateFormatter.parse(when), when);
    });

    it("format and parse invert each other over every calendar date in range", () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 1000, max: 9999 }),
                fc.integer({ min: 1, max: 12 }),
                fc.integer({ min: 1, max: 28 }),
                (year, month, day) => {
                    const iso = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(
                        day
                    ).padStart(2, "0")}`;
                    assert.strictEqual(dateFormatter.parse(dateFormatter.format(iso)), iso);
                }
            ),
            { numRuns: 400 }
        );
    });

    it("parse is idempotent, so a second read never rewrites the model", () => {
        fc.assert(
            fc.property(fc.string({ maxLength: 16 }), (raw) => {
                const once = dateFormatter.parse(raw);
                assert.deepStrictEqual(dateFormatter.parse(once), once);
            })
        );
    });
});

describe("SafeConvert ? total primitive conversions", () => {
    it("safeToString matches String(value) for ordinary values and falls back cleanly when ToPrimitive throws", () => {
        assert.strictEqual(safeToString("hello"), "hello");
        assert.strictEqual(safeToString(42), "42");
        assert.strictEqual(safeToString(null), "null");
        assert.strictEqual(safeToString(undefined), "undefined");

        // Object whose ToPrimitive throws TypeError, falling back to JSON.stringify
        const hostileJson = { a: 1, toString: 0, valueOf: 0 };
        assert.strictEqual(safeToString(hostileJson), JSON.stringify(hostileJson));

        // Object whose ToPrimitive throws AND whose JSON.stringify returns undefined, falling back to Object.prototype.toString
        const hostileUndefinedJson = { toString: 0, valueOf: 0, toJSON: () => undefined };
        assert.strictEqual(safeToString(hostileUndefinedJson), "[object Object]");

        // Circular object whose ToPrimitive throws AND whose JSON.stringify throws, falling back to Object.prototype.toString
        const hostileCircular: Record<string, unknown> = { toString: 0, valueOf: 0 };
        hostileCircular.self = hostileCircular;
        assert.strictEqual(safeToString(hostileCircular), "[object Object]");
    });

    it("safeToNumber matches Number(value) for ordinary values and returns NaN when ToPrimitive throws", () => {
        assert.strictEqual(safeToNumber(42), 42);
        assert.strictEqual(safeToNumber("12.5"), 12.5);
        assert.ok(Number.isNaN(safeToNumber("not-a-number")));
        assert.ok(Number.isNaN(safeToNumber({ toString: 0, valueOf: 0 })));
    });
});

describe("CurrencyFormatterPlugin & DateFormatterPlugin ? edge-case coverage", () => {
    const currency = new CurrencyFormatterPlugin();
    const dateFormatter = new DateFormatterPlugin();

    it("CurrencyFormatterPlugin handles trimmed symbols, sign placement before/after symbol, scientific notation, and malformed strings", () => {
        assert.strictEqual(currency.format("123.45"), "$123.45");
        assert.strictEqual(currency.parse("1e3"), 1000);
        assert.strictEqual(currency.parse(".5"), 0.5);
        assert.strictEqual(currency.parse("? 12.50", "  ?  "), 12.5);
        assert.strictEqual(currency.parse("$12.50", "   "), 12.5);
        assert.strictEqual(currency.parse("$ -12.50"), -12.5);
        assert.strictEqual(currency.parse("- $12.50"), -12.5);
        assert.strictEqual(currency.parse("$ - 12.50"), -12.5);
        assert.strictEqual(currency.parse("+ $12.50"), 12.5);
        assert.strictEqual(currency.parse("$ +12.50"), 12.5);
        assert.strictEqual(currency.parse("-$ +12.50"), -12.5);
        assert.strictEqual(currency.parse("$ 12.50-"), "$ 12.50-");
        assert.strictEqual(currency.parse("$123"), 123);
        assert.strictEqual(currency.parse("$123.45"), 123.45);
        assert.strictEqual(currency.parse("$12.34.56"), "$12.34.56");
        assert.strictEqual(currency.parse("$abc.12"), "$abc.12");
        assert.strictEqual(currency.parse("$12.ab"), "$12.ab");
    });

    it("DateFormatterPlugin handles non-ISO parseable dates, anchored ISO strings, and 3-digit years", () => {
        assert.strictEqual(dateFormatter.format("October 15, 2026"), "Oct 15, 2026");
        assert.strictEqual(dateFormatter.format("99:99 2026-10-15"), "99:99 2026-10-15");
        assert.strictEqual(dateFormatter.format("2026-10-15 99:99"), "2026-10-15 99:99");
        assert.strictEqual(dateFormatter.parse("prefix 2026-10-15"), "prefix 2026-10-15");
        assert.strictEqual(dateFormatter.parse("2026-10-15 suffix"), "2026-10-15 suffix");
        assert.strictEqual(dateFormatter.parse("Jan 2, 500"), "0500-01-02");
        assert.strictEqual(dateFormatter.format("  2023-02-29  "), "2023-02-29");
        assert.strictEqual(dateFormatter.format("0050-05-10"), "0050-05-10");
        assert.strictEqual(dateFormatter.parse("  2023-02-29  "), "  2023-02-29  ");
        assert.strictEqual(dateFormatter.parse("  2026-13-01  "), "  2026-13-01  ");
        assert.strictEqual(dateFormatter.parse("  0050-05-10  "), "  0050-05-10  ");
        assert.strictEqual(dateFormatter.parse("  99:99 2026-10-15  "), "  99:99 2026-10-15  ");
        assert.strictEqual(dateFormatter.parse("  2026-10-15 99:99  "), "  2026-10-15 99:99  ");
    });
});
