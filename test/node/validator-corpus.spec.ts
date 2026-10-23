/**
 * @file validator-corpus.spec.ts
 * @description Accept/reject corpora for the format validators.
 *
 * `pipeline.spec.ts` proves these validators are *total* — they return a verdict and never throw.
 * Totality says nothing about correctness: a validator that returns `{ isValid: true }` for every
 * input satisfies it. The properties here state, independently of the implementation, which values
 * each format admits and which message a rejection carries.
 *
 * Every expected value below is derived from the governing specification, never from the plugin:
 *
 *  - IBAN: ISO 13616 structure plus the ISO 7064 MOD 97-10 checksum, re-implemented here with
 *    `BigInt` arithmetic. The plugin computes the same remainder digit by digit; agreeing with an
 *    independent arithmetic is the point. The fixed corpus is the published IBAN-registry example
 *    set, which is external data.
 *  - URL: WHATWG URL parsing restricted to the `http`/`https` schemes with a non-empty host, which
 *    is what `UrlValidatorPlugin`'s contract states.
 *  - Email: a corpus every reasonable address syntax agrees on. Addresses where RFC 5322 and common
 *    practice disagree (quoted local parts, bare `user@localhost`, IP-literal domains) are left out
 *    deliberately — pinning them would assert a policy the library has never stated.
 *  - minProperties / maxProperties: JSON Schema draft 2020-12 §6.5.1-2, inclusive bounds.
 *  - `enum`: JSON Schema draft 2020-12 §6.1.2, extended by MetaUI's documented `{ key, text }`
 *    value-help entries and its item-level enum for array values.
 *
 * Which message a rejection carries is contract, not prose: `metaui.validation.iban` and
 * `metaui.validation.iban.checksum` tell a user two different things, so the assertions compare
 * against `I18n.getText(TEXT_KEY.*)` rather than against literal text. The bundle wording is free
 * to change; which key is selected is not.
 */

import * as assert from "assert";
import { fc } from "./fc-config";
import { IValidationResult } from "../../src/nz/co/siliconst/ui5/metaui/interfaces/IPipeline";
import { IPropertyMetadata } from "../../src/nz/co/siliconst/ui5/metaui/interfaces/ISchema";
import { EmailValidatorPlugin } from "../../src/nz/co/siliconst/ui5/metaui/plugins/validators/EmailValidatorPlugin";
import { EnumValidatorPlugin } from "../../src/nz/co/siliconst/ui5/metaui/plugins/validators/EnumValidatorPlugin";
import { IbanValidatorPlugin } from "../../src/nz/co/siliconst/ui5/metaui/plugins/validators/IbanValidatorPlugin";
import {
    ObjectPropertiesValidatorPlugin
} from "../../src/nz/co/siliconst/ui5/metaui/plugins/validators/ObjectPropertiesValidatorPlugin";
import { UrlValidatorPlugin } from "../../src/nz/co/siliconst/ui5/metaui/plugins/validators/UrlValidatorPlugin";
import { TextCaseFormatterPlugin } from "../../src/nz/co/siliconst/ui5/metaui/plugins/formatters/TextCaseFormatterPlugin";
import { I18n, TEXT_KEY } from "../../src/nz/co/siliconst/ui5/metaui/utils/I18n";

/** A descriptor literal, typed as the metadata the validators receive. */
const asMeta = (literal: Record<string, unknown>): IPropertyMetadata =>
    literal as unknown as IPropertyMetadata;

/** Asserts a verdict is "accepted". */
function expectValid(result: IValidationResult, context: string): void {
    assert.strictEqual(result.isValid, true, `${context}: expected accepted, got ${result.errorMessage}`);
}

/** Asserts a verdict is "rejected" and carries exactly the message `key` names. */
function expectRejectedWith(
    result: IValidationResult,
    key: (typeof TEXT_KEY)[keyof typeof TEXT_KEY],
    context: string
): void {
    assert.strictEqual(result.isValid, false, `${context}: expected rejected, was accepted`);
    assert.strictEqual(result.errorMessage, I18n.getText(key), `${context}: wrong rejection message`);
}

// ---------------------------------------------------------------------------------------------
// IBAN — ISO 13616 + ISO 7064 MOD 97-10
// ---------------------------------------------------------------------------------------------

/** ISO 7064 letter expansion: A=10 … Z=35, digits unchanged. */
function expandIso7064(text: string): string {
    let out = "";
    for (const char of text) {
        out += char >= "A" && char <= "Z" ? String(char.charCodeAt(0) - 55) : char;
    }
    return out;
}

/**
 * The ISO 7064 MOD 97-10 remainder of a normalized IBAN, computed as one big integer rather than
 * digit by digit. Independent of the plugin's incremental arithmetic by construction.
 *
 * @param iban An uppercase, space-free IBAN.
 * @returns {number} The remainder; exactly 1 for a valid IBAN.
 */
function referenceMod97(iban: string): number {
    return Number(BigInt(expandIso7064(iban.slice(4) + iban.slice(0, 4))) % 97n);
}

/**
 * The two ISO 13616 check digits for a country code and BBAN.
 *
 * @param country The two-letter ISO 3166 country code.
 * @param bban The basic bank account number.
 * @returns {string} The two check digits, zero-padded.
 */
function checkDigitsFor(country: string, bban: string): string {
    const remainder = Number(BigInt(expandIso7064(`${bban}${country}00`)) % 97n);
    return String(98 - remainder).padStart(2, "0");
}

/**
 * The published IBAN-registry example accounts. Each one is external data: the suite re-derives
 * nothing from the plugin, and `referenceMod97` confirms every entry independently below.
 */
const REGISTRY_IBANS: readonly string[] = [
    "AL35202111090000000001234567",
    "AD1400080001001234567890",
    "AT483200000012345864",
    "BA393385804800211234",
    "BE71096123456769",
    "BG18RZBB91550123456789",
    "CH5604835012345678009",
    "CY21002001950000357001234567",
    "CZ5508000000001234567899",
    "DE75512108001245126199",
    "DK9520000123456789",
    "EE471000001020145685",
    "ES7921000813610123456789",
    "FI1410093000123458",
    "FR7630006000011234567890189",
    "GB33BUKB20201555555555",
    "GR9608100010000001234567890",
    "HR1723600001101234565",
    "HU93116000060000000012345676",
    "IE64IRCE92050112345678",
    "IT60X0542811101000000123456",
    "LT601010012345678901",
    "LU120010001234567891",
    "LV97HABA0012345678910",
    "MT31MALT01100000000000000000123",
    "NL02ABNA0123456789",
    "NO8330001234567",
    "PL50860000020000000000093122",
    "PT50002700000001234567833",
    "RO09BCYP0000001234567890",
    "RS35105008123123123173",
    "SA4420000001234567891234",
    "SE7280000810340009783242",
    "SI56192001234567892",
    "SK8975000000000012345671",
    "TR320010009999901234567890",
    "GB82WEST12345698765432",
    "DE89370400440532013000",
    "FR1420041010050500013M02606",
    "SA0380000000608010167519",
    "CH9300762011623852957",
    "BE68539007547034",
    "NL91ABNA0417164300",
    "NO9386011117947"
];

const upperAlpha = fc.constantFrom(..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split(""));
const alphaNum = fc.constantFrom(..."ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".split(""));

const countryArb: fc.Arbitrary<string> = fc.tuple(upperAlpha, upperAlpha).map(([a, b]) => a + b);

const bbanArb: fc.Arbitrary<string> = fc
    .array(alphaNum, { minLength: 11, maxLength: 30 })
    .map((chars) => chars.join(""));

describe("IbanValidatorPlugin — ISO 13616 corpus", () => {
    const iban = new IbanValidatorPlugin();

    it("the registry corpus is internally consistent under the reference checksum", () => {
        for (const account of REGISTRY_IBANS) {
            assert.ok(
                /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(account),
                `${account} is not structurally an IBAN — the corpus is wrong, not the library`
            );
            assert.strictEqual(referenceMod97(account), 1, `${account} fails ISO 7064 in the reference`);
        }
    });

    it("every published registry IBAN is accepted", () => {
        for (const account of REGISTRY_IBANS) {
            expectValid(iban.validate(account), account);
        }
    });

    it("printed grouping and lower case are accepted, exactly as the printed form is written", () => {
        for (const account of REGISTRY_IBANS) {
            const grouped = (account.match(/.{1,4}/g) || []).join(" ");
            expectValid(iban.validate(grouped), `grouped ${grouped}`);
            expectValid(iban.validate(account.toLowerCase()), `lower ${account}`);
            expectValid(iban.validate(`\t${grouped.toLowerCase()}\n`), `mixed whitespace ${account}`);
        }
    });

    it("whitespace is stripped before the structure is checked, wherever it falls", () => {
        // ISO 13616 only prescribes grouping in fours, but the plugin documents that spaces are
        // ignored outright, so a country code split across a space is still an IBAN.
        expectValid(iban.validate("G B82WEST12345698765432"), "split country code");
        expectValid(iban.validate("GB 82 WEST12345698765432"), "irregular grouping");
    });

    it("accepts a generated IBAN exactly when ISO 7064 gives remainder 1", () => {
        fc.assert(
            fc.property(countryArb, bbanArb, fc.integer({ min: 0, max: 99 }), (country, bban, claimed) => {
                const digits = String(claimed).padStart(2, "0");
                const candidate = `${country}${digits}${bban}`;
                const shouldAccept = referenceMod97(candidate) === 1;
                const result = iban.validate(candidate);
                assert.strictEqual(
                    result.isValid,
                    shouldAccept,
                    `${candidate}: ISO 7064 remainder is ${referenceMod97(candidate)}`
                );
                if (!shouldAccept) {
                    assert.strictEqual(result.errorMessage, I18n.getText(TEXT_KEY.ibanChecksum));
                }
            }),
            { numRuns: 600 }
        );
    });

    it("the computed check digits always produce an accepted IBAN", () => {
        fc.assert(
            fc.property(countryArb, bbanArb, (country, bban) => {
                const account = `${country}${checkDigitsFor(country, bban)}${bban}`;
                assert.strictEqual(referenceMod97(account), 1, "the reference construction is wrong");
                expectValid(iban.validate(account), account);
            }),
            { numRuns: 400 }
        );
    });

    it("altering a single character of a valid IBAN is rejected as a checksum failure", () => {
        fc.assert(
            fc.property(
                fc.constantFrom(...REGISTRY_IBANS),
                fc.nat(),
                fc.constantFrom(..."0123456789".split("")),
                (account, rawIndex, replacement) => {
                    // Confine the edit to the digits after the country code so the structural
                    // pattern still matches and only the checksum can fail.
                    const index = 2 + (rawIndex % (account.length - 2));
                    if (account[index] === replacement) {
                        return;
                    }
                    const tampered = account.slice(0, index) + replacement + account.slice(index + 1);
                    if (referenceMod97(tampered) === 1) {
                        return; // a collision; ISO 7064 admits it and so must the plugin
                    }
                    expectRejectedWith(iban.validate(tampered), TEXT_KEY.ibanChecksum, tampered);
                }
            ),
            { numRuns: 500 }
        );
    });

    it("structurally malformed input is rejected as a structure failure, not a checksum failure", () => {
        const malformed: ReadonlyArray<readonly [string, string]> = [
            ["GB82", "too short for any BBAN"],
            ["GB82WEST1234", "BBAN shorter than 11 characters"],
            ["1282WEST12345698765432", "country code is not two letters"],
            ["GBX2WEST12345698765432", "check digits are not two digits"],
            ["GB82WEST-1234-5698-7654-32", "punctuation other than spaces"],
            [`GB82${"A".repeat(31)}`, "BBAN longer than 30 characters"],
            ["GB82WEST1234569876543é", "a non-ASCII character in the BBAN"]
        ];
        for (const [candidate, why] of malformed) {
            expectRejectedWith(iban.validate(candidate), TEXT_KEY.iban, `${candidate} (${why})`);
        }
    });

    it("a non-string value is rejected as a structure failure", () => {
        for (const value of [42, true, ["GB82WEST12345698765432"], { iban: "GB82WEST12345698765432" }]) {
            expectRejectedWith(iban.validate(value), TEXT_KEY.iban, JSON.stringify(value));
        }
    });

    it("null, undefined and the empty string are deferred to the required validator", () => {
        for (const value of [null, undefined, ""]) {
            expectValid(iban.validate(value), String(value));
        }
    });

    it("activates on ui.format or format 'iban' and on nothing else", () => {
        assert.strictEqual(iban.extractRule(asMeta({ format: "iban" })).active, true);
        assert.strictEqual(iban.extractRule(asMeta({ ui: { format: "iban" } })).active, true);
        assert.strictEqual(iban.extractRule(asMeta({ ui: { format: "iban" }, format: "email" })).active, true);
        assert.strictEqual(iban.extractRule(asMeta({ format: "IBAN" })).active, false);
        assert.strictEqual(iban.extractRule(asMeta({ format: "email" })).active, false);
        assert.strictEqual(iban.extractRule(asMeta({})).active, false);
    });
});

// ---------------------------------------------------------------------------------------------
// URL
// ---------------------------------------------------------------------------------------------

describe("UrlValidatorPlugin — scheme and host corpus", () => {
    const url = new UrlValidatorPlugin();

    it("accepts http and https URLs that carry a host", () => {
        const accepted = [
            "http://example.com",
            "https://example.com",
            "https://example.com/path?q=1#frag",
            "http://user:pass@host.example:8080/p",
            "https://sub.domain.example.co.uk/",
            "http://192.168.0.1",
            "http://[::1]/",
            "https://example.com:8443",
            "HTTP://EXAMPLE.COM",
            "https://xn--r8jz45g.xn--zckzah",
            "  https://example.com  "
        ];
        for (const candidate of accepted) {
            expectValid(url.validate(candidate), candidate);
        }
    });

    it("rejects a parseable URL on another scheme with the protocol message", () => {
        const wrongScheme = [
            "ftp://example.com",
            "ws://example.com",
            "file:///etc/passwd",
            "mailto:someone@example.com",
            "javascript:alert(1)",
            "data:text/plain,hi",
            "tel:+15551234567"
        ];
        for (const candidate of wrongScheme) {
            expectRejectedWith(url.validate(candidate), TEXT_KEY.urlProtocol, candidate);
        }
    });

    it("rejects input the URL grammar cannot parse at all with the generic message", () => {
        const unparseable = ["not a url", "http://", "https://", "example.com", "//example.com", "http://exa mple.com"];
        for (const candidate of unparseable) {
            expectRejectedWith(url.validate(candidate), TEXT_KEY.url, candidate);
        }
    });

    it("a non-string value is rejected", () => {
        for (const value of [42, true, ["http://example.com"], { href: "http://example.com" }]) {
            expectRejectedWith(url.validate(value), TEXT_KEY.url, JSON.stringify(value));
        }
    });

    it("null, undefined and the empty string are deferred to the required validator", () => {
        for (const value of [null, undefined, ""]) {
            expectValid(url.validate(value), String(value));
        }
    });

    it("agrees with WHATWG URL parsing over generated scheme/host combinations", () => {
        fc.assert(
            fc.property(
                fc.constantFrom("http", "https", "ftp", "ws", "gopher", "HTTPS", "Http"),
                fc.constantFrom("example.com", "a.b.c", "127.0.0.1", "localhost", "[::1]"),
                fc.constantFrom("", "/", "/a/b", "/a?x=1", "/a#f"),
                (scheme, host, path) => {
                    const candidate = `${scheme}://${host}${path}`;
                    const lower = scheme.toLowerCase();
                    const expected = lower === "http" || lower === "https";
                    const result = url.validate(candidate);
                    assert.strictEqual(result.isValid, expected, candidate);
                    if (!expected) {
                        assert.strictEqual(result.errorMessage, I18n.getText(TEXT_KEY.urlProtocol), candidate);
                    }
                }
            ),
            { numRuns: 400 }
        );
    });

    it("activates on format 'url' and 'uri' and on nothing else", () => {
        assert.strictEqual(url.extractRule(asMeta({ format: "url" })).active, true);
        assert.strictEqual(url.extractRule(asMeta({ format: "uri" })).active, true);
        assert.strictEqual(url.extractRule(asMeta({ ui: { format: "uri" } })).active, true);
        assert.strictEqual(url.extractRule(asMeta({ format: "iri" })).active, false);
        assert.strictEqual(url.extractRule(asMeta({ format: "uri-reference" })).active, false);
        assert.strictEqual(url.extractRule(asMeta({ ui: { widget: "url" } })).active, false);
        assert.strictEqual(url.extractRule(asMeta({})).active, false);
    });
});

// ---------------------------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------------------------

describe("EmailValidatorPlugin — address corpus", () => {
    const email = new EmailValidatorPlugin();

    it("accepts ordinary addresses", () => {
        const accepted = [
            "a@b.co",
            "user@example.com",
            "user.name@example.com",
            "first.middle.last@example.com",
            "user+tag@example.com",
            "user-name@example.co.uk",
            "user_name@example.com",
            "UPPER@EXAMPLE.COM",
            "user123@sub.domain.example.org",
            "'quoted'@example.com"
        ];
        for (const candidate of accepted) {
            expectValid(email.validate(candidate), candidate);
        }
    });

    it("rejects addresses that are malformed by any reading", () => {
        const rejected = [
            "plainaddress",
            "@example.com",
            "user@",
            "user@.com",
            "user@example.",
            ".user@example.com",
            "user.@example.com",
            "user..name@example.com",
            "user@example..com",
            "user name@example.com",
            "user@exa mple.com",
            "user@@example.com",
            "user@example@com",
            "us er@exa mple.com",
            "\tuser@example.com",
            "user@example.com\n"
        ];
        for (const candidate of rejected) {
            expectRejectedWith(email.validate(candidate), TEXT_KEY.email, candidate);
        }
    });

    it("rejects a domain with no dot, because the plugin requires a labelled domain", () => {
        // JSON Schema's `idn-email` would admit `user@localhost`; this library's contract is a
        // dotted domain. Stated here so the choice is visible rather than accidental.
        for (const candidate of ["user@localhost", "user@com", "root@127"]) {
            expectRejectedWith(email.validate(candidate), TEXT_KEY.email, candidate);
        }
    });

    it("a non-string value is rejected", () => {
        for (const value of [42, true, ["a@b.co"], { mail: "a@b.co" }]) {
            expectRejectedWith(email.validate(value), TEXT_KEY.email, JSON.stringify(value));
        }
    });

    it("values the required validator owns are deferred, including whitespace-only strings", () => {
        for (const value of [null, undefined, "", "   ", "\t", [], Number.NaN]) {
            expectValid(email.validate(value), JSON.stringify(value));
        }
    });

    it("an address is accepted exactly when its local part and every domain label are non-empty", () => {
        const label = fc.stringMatching(/^[A-Za-z0-9_+-]{1,6}$/);
        fc.assert(
            fc.property(
                fc.array(label, { minLength: 1, maxLength: 3 }),
                fc.array(label, { minLength: 1, maxLength: 3 }),
                fc.boolean(),
                fc.boolean(),
                (localParts, domainParts, emptyLocalLabel, emptyDomainLabel) => {
                    const local = (emptyLocalLabel ? [...localParts, ""] : localParts).join(".");
                    const domain = (emptyDomainLabel ? [...domainParts, ""] : domainParts).join(".");
                    const candidate = `${local}@${domain}`;
                    // A dotted domain is required, so a single-label domain is rejected too.
                    const expected =
                        !emptyLocalLabel && !emptyDomainLabel && domainParts.length >= 2;
                    assert.strictEqual(email.validate(candidate).isValid, expected, candidate);
                }
            ),
            { numRuns: 500 }
        );
    });

    it("activates on format 'email' or widget 'email' and on nothing else", () => {
        assert.strictEqual(email.extractRule(asMeta({ format: "email" })).active, true);
        assert.strictEqual(email.extractRule(asMeta({ ui: { format: "email" } })).active, true);
        assert.strictEqual(email.extractRule(asMeta({ ui: { widget: "email" } })).active, true);
        assert.strictEqual(email.extractRule(asMeta({ format: "idn-email" })).active, false);
        assert.strictEqual(email.extractRule(asMeta({ ui: { widget: "text" } })).active, false);
        assert.strictEqual(email.extractRule(asMeta({})).active, false);
    });
});

// ---------------------------------------------------------------------------------------------
// minProperties / maxProperties
// ---------------------------------------------------------------------------------------------

describe("ObjectPropertiesValidatorPlugin — JSON Schema property-count bounds", () => {
    const objectProps = new ObjectPropertiesValidatorPlugin();

    /** An object with exactly `count` own keys. */
    const objectWith = (count: number): Record<string, number> => {
        const out: Record<string, number> = {};
        for (let i = 0; i < count; i++) {
            out[`k${i}`] = i;
        }
        return out;
    };

    it("minProperties is an inclusive lower bound", () => {
        fc.assert(
            fc.property(fc.integer({ min: 0, max: 8 }), fc.integer({ min: 0, max: 10 }), (min, count) => {
                const result = objectProps.validate(objectWith(count), { minProperties: min });
                assert.strictEqual(result.isValid, count >= min, `${count} keys against minProperties ${min}`);
                if (count < min) {
                    assert.strictEqual(
                        result.errorMessage,
                        I18n.getText(TEXT_KEY.objectMinProperties, [min]),
                        "the rejection did not name the violated bound"
                    );
                }
            })
        );
    });

    it("maxProperties is an inclusive upper bound", () => {
        fc.assert(
            fc.property(fc.integer({ min: 0, max: 8 }), fc.integer({ min: 0, max: 10 }), (max, count) => {
                const result = objectProps.validate(objectWith(count), { maxProperties: max });
                assert.strictEqual(result.isValid, count <= max, `${count} keys against maxProperties ${max}`);
                if (count > max) {
                    assert.strictEqual(
                        result.errorMessage,
                        I18n.getText(TEXT_KEY.objectMaxProperties, [max]),
                        "the rejection did not name the violated bound"
                    );
                }
            })
        );
    });

    it("both bounds together admit exactly the closed interval", () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 0, max: 5 }),
                fc.integer({ min: 0, max: 5 }),
                fc.integer({ min: 0, max: 8 }),
                (min, span, count) => {
                    const max = min + span;
                    const result = objectProps.validate(objectWith(count), {
                        minProperties: min,
                        maxProperties: max
                    });
                    assert.strictEqual(result.isValid, count >= min && count <= max, `${count} in [${min},${max}]`);
                }
            )
        );
    });

    it("the boundaries themselves: min-1 rejects, min accepts, max accepts, max+1 rejects", () => {
        const bounds = { minProperties: 2, maxProperties: 4 };
        assert.strictEqual(objectProps.validate(objectWith(1), bounds).isValid, false);
        assert.strictEqual(objectProps.validate(objectWith(2), bounds).isValid, true);
        assert.strictEqual(objectProps.validate(objectWith(3), bounds).isValid, true);
        assert.strictEqual(objectProps.validate(objectWith(4), bounds).isValid, true);
        assert.strictEqual(objectProps.validate(objectWith(5), bounds).isValid, false);
    });

    it("a lower bound of zero admits the empty object", () => {
        expectValid(objectProps.validate({}, { minProperties: 0 }), "{} against minProperties 0");
        expectValid(objectProps.validate({}, { maxProperties: 0 }), "{} against maxProperties 0");
        assert.strictEqual(objectProps.validate(objectWith(1), { maxProperties: 0 }).isValid, false);
    });

    it("only own enumerable keys count, and inherited ones do not", () => {
        const base = { inherited: 1 };
        const derived = Object.create(base) as Record<string, unknown>;
        derived.own = 1;
        assert.strictEqual(objectProps.validate(derived, { maxProperties: 1 }).isValid, true);
        assert.strictEqual(objectProps.validate(derived, { minProperties: 2 }).isValid, false);
    });

    it("non-object values are not this validator's concern", () => {
        for (const value of ["abc", 7, true, null, undefined, [1, 2, 3]]) {
            expectValid(objectProps.validate(value, { minProperties: 5 }), JSON.stringify(value));
        }
    });

    it("a non-numeric bound is ignored rather than coerced", () => {
        expectValid(objectProps.validate(objectWith(1), { minProperties: "5" }), "string bound");
        expectValid(objectProps.validate(objectWith(1), { minProperties: true }), "boolean bound");
        expectValid(objectProps.validate(objectWith(1), {}), "no bounds at all");
        expectValid(objectProps.validate(objectWith(1), undefined), "no args at all");
    });

    it("extractRule activates only when a numeric bound is present, and forwards both", () => {
        assert.deepStrictEqual(objectProps.extractRule(asMeta({ minProperties: 1 })), {
            active: true,
            args: { minProperties: 1, maxProperties: undefined }
        });
        assert.deepStrictEqual(objectProps.extractRule(asMeta({ maxProperties: 3 })), {
            active: true,
            args: { minProperties: undefined, maxProperties: 3 }
        });
        assert.deepStrictEqual(objectProps.extractRule(asMeta({ minProperties: 0, maxProperties: 0 })), {
            active: true,
            args: { minProperties: 0, maxProperties: 0 }
        });
        assert.deepStrictEqual(objectProps.extractRule(asMeta({})), { active: false });
        assert.deepStrictEqual(objectProps.extractRule(asMeta({ minProperties: "2" })), { active: false });
        assert.deepStrictEqual(objectProps.extractRule(asMeta({ minProperties: null })), { active: false });
    });

    it("what extractRule produces is what validate consumes", () => {
        fc.assert(
            fc.property(fc.integer({ min: 0, max: 5 }), fc.integer({ min: 0, max: 5 }), fc.integer({ min: 0, max: 8 }),
                (min, span, count) => {
                    const max = min + span;
                    const rule = objectProps.extractRule(asMeta({ minProperties: min, maxProperties: max }));
                    assert.strictEqual(rule.active, true);
                    const verdict = objectProps.validate(objectWith(count), rule.args);
                    assert.strictEqual(verdict.isValid, count >= min && count <= max);
                }
            ),
            { numRuns: 300 }
        );
    });
});

// ---------------------------------------------------------------------------------------------
// enum
// ---------------------------------------------------------------------------------------------

describe("EnumValidatorPlugin — membership, value-help entries and item enums", () => {
    const enumValidator = new EnumValidatorPlugin();

    it("a primitive enum admits exactly its members", () => {
        fc.assert(
            fc.property(
                fc.uniqueArray(fc.constantFrom("a", "b", "c", "d", 1, 2, true, false), {
                    minLength: 1,
                    maxLength: 5
                }),
                fc.constantFrom("a", "b", "c", "d", "z", 1, 2, 9, true, false),
                (members, probe) => {
                    const result = enumValidator.validate(probe, { enum: members });
                    assert.strictEqual(
                        result.isValid,
                        members.includes(probe),
                        `${JSON.stringify(probe)} against ${JSON.stringify(members)}`
                    );
                }
            ),
            { numRuns: 500 }
        );
    });

    it("args may be the bare array as well as { enum }", () => {
        expectValid(enumValidator.validate("a", ["a", "b"]), "bare array, member");
        assert.strictEqual(enumValidator.validate("z", ["a", "b"]).isValid, false);
        expectValid(enumValidator.validate("a", { enum: ["a", "b"] }), "wrapped, member");
    });

    it("a { key, text } value-help entry is matched on its key, not on the whole entry", () => {
        const valueHelp = [
            { key: "RED", text: "Red" },
            { key: "GREEN", text: "Green" }
        ];
        expectValid(enumValidator.validate("RED", { enum: valueHelp }), "RED");
        expectValid(enumValidator.validate("GREEN", { enum: valueHelp }), "GREEN");
        assert.strictEqual(enumValidator.validate("Red", { enum: valueHelp }).isValid, false, "the text is not a key");
        assert.strictEqual(enumValidator.validate("BLUE", { enum: valueHelp }).isValid, false);
    });

    it("a numeric value-help key matches the string the control submits, and the reverse", () => {
        const valueHelp = [
            { key: 1, text: "One" },
            { key: 2, text: "Two" }
        ];
        expectValid(enumValidator.validate("1", { enum: valueHelp }), "'1' against key 1");
        expectValid(enumValidator.validate(1, { enum: valueHelp }), "1 against key 1");
        assert.strictEqual(enumValidator.validate("3", { enum: valueHelp }).isValid, false);
        expectValid(enumValidator.validate(true, { enum: [{ key: true, text: "Yes" }] }), "true against key true");
        expectValid(enumValidator.validate("true", { enum: [{ key: true, text: "Yes" }] }), "'true' against key true");
    });

    it("an entry needs both key and text to be read as a value-help entry", () => {
        assert.strictEqual(enumValidator.validate("RED", { enum: [{ key: "RED" }] }).isValid, false);
        assert.strictEqual(enumValidator.validate("RED", { enum: [{ text: "RED" }] }).isValid, false);
        expectValid(enumValidator.validate({ key: "RED" }, { enum: [{ key: "RED" }] }), "structural match instead");
    });

    it("the rejection message lists the keys of value-help entries, not their JSON", () => {
        const valueHelp = [
            { key: "RED", text: "Red" },
            { key: "GREEN", text: "Green" }
        ];
        const result = enumValidator.validate("BLUE", { enum: valueHelp });
        assert.strictEqual(result.isValid, false);
        assert.strictEqual(result.errorMessage, I18n.getText(TEXT_KEY.enumMembership, ["RED, GREEN"]));
    });

    it("the rejection message lists primitive members verbatim and object members as JSON", () => {
        const primitives = enumValidator.validate("z", { enum: ["a", 2, true] });
        assert.strictEqual(primitives.errorMessage, I18n.getText(TEXT_KEY.enumMembership, ["a, 2, true"]));
        const objects = enumValidator.validate({ z: 1 }, { enum: [{ a: 1 }] });
        assert.strictEqual(objects.errorMessage, I18n.getText(TEXT_KEY.enumMembership, ['{"a":1}']));
    });

    it("object members match structurally, independently of key order", () => {
        expectValid(enumValidator.validate({ a: 1, b: 2 }, { enum: [{ b: 2, a: 1 }] }), "reordered keys");
        assert.strictEqual(enumValidator.validate({ a: 1, b: 3 }, { enum: [{ b: 2, a: 1 }] }).isValid, false);
        expectValid(enumValidator.validate({ a: { c: [1, 2] } }, { enum: [{ a: { c: [1, 2] } }] }), "nested");
    });

    it("with an item-level enum every element of the array must be a member", () => {
        const args = { enum: ["a", "b", "c"], isItemEnum: true };
        expectValid(enumValidator.validate(["a"], args), "single member");
        expectValid(enumValidator.validate(["a", "b", "a"], args), "repeats are fine");
        assert.strictEqual(enumValidator.validate(["a", "z"], args).isValid, false, "one non-member fails the array");
        assert.strictEqual(enumValidator.validate(["z"], args).isValid, false);
    });

    it("a scalar enum applied to an array value is still checked element-wise", () => {
        const args = { enum: ["a", "b"], isItemEnum: false };
        expectValid(enumValidator.validate(["a", "b"], args), "all members");
        assert.strictEqual(enumValidator.validate(["a", "z"], args).isValid, false);
    });

    it("an enum whose members are themselves arrays is matched whole, not element-wise", () => {
        const args = { enum: [["a", "b"], ["c"]] };
        expectValid(enumValidator.validate(["a", "b"], args), "the whole array is a member");
        expectValid(enumValidator.validate(["c"], args), "the second member");
        assert.strictEqual(enumValidator.validate(["a"], args).isValid, false, "'a' alone is not a member");
        assert.strictEqual(enumValidator.validate(["a", "c"], args).isValid, false);
    });

    it("one array member is enough to make the enum a whole-value enum", () => {
        // A mixed list such as `[["a"], "b"]` still describes whole values, so `["a"]` is a member
        // and the bare element "a" is not.
        const args = { enum: [["a"], "b"] };
        expectValid(enumValidator.validate(["a"], args), "the array member matches whole");
        assert.strictEqual(enumValidator.validate(["b"], args).isValid, false, "'b' is a value, not an element");
    });

    it("an item enum wins over array members: isItemEnum forces element-wise checking", () => {
        const args = { enum: [["a", "b"], "a"], isItemEnum: true };
        expectValid(enumValidator.validate(["a", "a"], args), "every element is the member 'a'");
    });

    it("every element must satisfy the enum, so an empty array is vacuously accepted", () => {
        // An empty array is also "empty" by the pipeline's own definition, so required owns it.
        expectValid(enumValidator.validate([], { enum: ["a"], isItemEnum: true }), "[]");
    });

    it("values the required validator owns are deferred, and so is an absent enum", () => {
        for (const value of [null, undefined, ""]) {
            expectValid(enumValidator.validate(value, { enum: ["a"] }), String(value));
        }
        expectValid(enumValidator.validate("z", { enum: [] }), "empty enum list");
        expectValid(enumValidator.validate("z", undefined), "no args");
        expectValid(enumValidator.validate("z", { enum: "a" }), "enum is not an array");
    });

    it("extractRule reads a property enum as a value enum and an items enum as an item enum", () => {
        assert.deepStrictEqual(enumValidator.extractRule(asMeta({ enum: ["a", "b"] })), {
            active: true,
            args: { enum: ["a", "b"], isItemEnum: false }
        });
        assert.deepStrictEqual(enumValidator.extractRule(asMeta({ items: { enum: ["a"] } })), {
            active: true,
            args: { enum: ["a"], isItemEnum: true }
        });
        assert.deepStrictEqual(
            enumValidator.extractRule(asMeta({ enum: ["x"], items: { enum: ["a"] } })),
            { active: true, args: { enum: ["x"], isItemEnum: false } },
            "a property-level enum takes precedence over the item-level one"
        );
        assert.deepStrictEqual(enumValidator.extractRule(asMeta({ enum: [] })), { active: false });
        assert.deepStrictEqual(enumValidator.extractRule(asMeta({ items: { enum: [] } })), { active: false });
        assert.deepStrictEqual(enumValidator.extractRule(asMeta({ enum: "a" })), { active: false });
        assert.deepStrictEqual(enumValidator.extractRule(asMeta({})), { active: false });
    });

    it("what extractRule produces for an array schema accepts exactly the conforming arrays", () => {
        fc.assert(
            fc.property(
                fc.uniqueArray(fc.constantFrom("a", "b", "c"), { minLength: 1, maxLength: 3 }),
                fc.array(fc.constantFrom("a", "b", "c", "z"), { minLength: 1, maxLength: 4 }),
                (members, value) => {
                    const rule = enumValidator.extractRule(asMeta({ type: "array", items: { enum: members } }));
                    assert.strictEqual(rule.active, true);
                    const allowed: readonly string[] = members;
                    assert.strictEqual(
                        enumValidator.validate(value, rule.args).isValid,
                        value.every((element) => allowed.includes(element)),
                        `${JSON.stringify(value)} against items.enum ${JSON.stringify(members)}`
                    );
                }
            ),
            { numRuns: 400 }
        );
    });
});

// ---------------------------------------------------------------------------------------------
// text case
// ---------------------------------------------------------------------------------------------

describe("TextCaseFormatterPlugin — every documented mode", () => {
    const textCase = new TextCaseFormatterPlugin();

    it("'upper' uppercases, 'lower' lowercases, and the default is upper", () => {
        assert.strictEqual(textCase.format("MiXeD cAsE", "upper"), "MIXED CASE");
        assert.strictEqual(textCase.format("MiXeD cAsE", "lower"), "mixed case");
        assert.strictEqual(textCase.format("MiXeD cAsE", "lowercase"), "mixed case");
        assert.strictEqual(textCase.format("MiXeD cAsE"), "MIXED CASE", "no mode means upper");
        assert.strictEqual(textCase.format("MiXeD cAsE", "nonsense"), "MIXED CASE", "an unknown mode means upper");
        assert.strictEqual(textCase.format("MiXeD cAsE", ""), "MIXED CASE", "an empty mode means upper");
    });

    it("'title' capitalises the first letter of every word and lowercases the rest", () => {
        assert.strictEqual(textCase.format("hello world", "title"), "Hello World");
        assert.strictEqual(textCase.format("HELLO WORLD", "title"), "Hello World");
        assert.strictEqual(textCase.format("hELLO wORLD", "titlecase"), "Hello World");
        assert.strictEqual(textCase.format("foo-bar baz", "title"), "Foo-Bar Baz");
        assert.strictEqual(textCase.format("o'neill", "title"), "O'Neill");
        assert.strictEqual(textCase.format("  padded  words  ", "title"), "  Padded  Words  ");
    });

    it("the mode name is case-insensitive", () => {
        for (const mode of ["LOWER", "Lower", "lOwEr"]) {
            assert.strictEqual(textCase.format("ABC", mode), "abc", mode);
        }
        for (const mode of ["TITLE", "Title", "TitleCase"]) {
            assert.strictEqual(textCase.format("ab cd", mode), "Ab Cd", mode);
        }
        assert.strictEqual(textCase.format("ab", "UPPER"), "AB");
    });

    it("the mode may arrive as case, mode or format on an options object, in that precedence", () => {
        assert.strictEqual(textCase.format("Ab", { case: "lower" }), "ab");
        assert.strictEqual(textCase.format("Ab", { mode: "lower" }), "ab");
        assert.strictEqual(textCase.format("Ab", { format: "lower" }), "ab");
        assert.strictEqual(textCase.format("Ab", { case: "lower", mode: "upper" }), "ab", "case wins over mode");
        assert.strictEqual(textCase.format("Ab", { mode: "lower", format: "upper" }), "ab", "mode wins over format");
        assert.strictEqual(textCase.format("Ab", { case: "", mode: "lower" }), "ab", "an empty case falls through");
        assert.strictEqual(textCase.format("Ab", { other: "lower" }), "AB", "an unrecognised key means upper");
        assert.strictEqual(textCase.format("Ab", { case: 1 }), "AB", "a non-string mode means upper");
    });

    it("null and undefined render as the empty string, not as 'NULL'", () => {
        assert.strictEqual(textCase.format(null, "upper"), "");
        assert.strictEqual(textCase.format(undefined, "upper"), "");
        assert.strictEqual(textCase.format(null, "title"), "");
        assert.strictEqual(textCase.format(undefined, "lower"), "");
    });

    it("a non-string value is stringified before casing", () => {
        assert.strictEqual(textCase.format(42, "upper"), "42");
        assert.strictEqual(textCase.format(true, "upper"), "TRUE");
        assert.strictEqual(textCase.format(false, "lower"), "false");
        assert.strictEqual(textCase.format(["a", "b"], "upper"), "A,B");
        assert.strictEqual(textCase.format(0, "upper"), "0", "zero is a value, not an absence");
        assert.strictEqual(textCase.format("", "upper"), "", "the empty string stays empty");
    });

    it("upper and lower are idempotent and mutually inverse over ASCII letters", () => {
        fc.assert(
            fc.property(fc.string({ maxLength: 24 }), (raw) => {
                const upper = textCase.format(raw, "upper");
                const lower = textCase.format(raw, "lower");
                assert.strictEqual(upper, raw.toUpperCase());
                assert.strictEqual(lower, raw.toLowerCase());
                assert.strictEqual(textCase.format(upper, "upper"), upper);
                assert.strictEqual(textCase.format(lower, "lower"), lower);
            })
        );
    });

    it("title case is idempotent", () => {
        fc.assert(
            fc.property(fc.string({ maxLength: 24 }), (raw) => {
                const once = textCase.format(raw, "title");
                assert.strictEqual(textCase.format(once, "title"), once);
            })
        );
    });
});
