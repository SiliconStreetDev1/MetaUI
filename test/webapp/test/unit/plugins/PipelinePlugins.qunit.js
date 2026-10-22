sap.ui.define([
    "metaui/sandbox/test/TestOracle",
    "nz/co/siliconst/ui5/metaui/core/PipelineManager"
], function (TestOracle, PipelineManagerMod) {
    "use strict";

    var PipelineManager = PipelineManagerMod.PipelineManager;
    var GlobalPipeline = PipelineManagerMod.GlobalPipeline;

    QUnit.module("Pipeline Plugins: All 14 Validators & Polymorphic Rule Extraction");

    QUnit.test("All 14 Validator Plugins are registered and enforce exact schema constraints", function (assert) {
        var pm = PipelineManager.getInstance();

        TestOracle.VALIDATOR_LIST.forEach(function (validatorName) {
            assert.strictEqual(
                pm.validators.has(validatorName),
                true,
                "Validator '" + validatorName + "' is registered in PipelineManager"
            );
        });

        // 1. required
        assert.strictEqual(GlobalPipeline.assembleAndExecute({ type: "string", required: true }, "").isValid, false, "Required rejects empty string");
        assert.strictEqual(GlobalPipeline.assembleAndExecute({ type: "string", required: true }, "ok").isValid, true, "Required accepts non-empty string");
        assert.strictEqual(GlobalPipeline.assembleAndExecute({ type: "array", required: true }, []).isValid, false, "Required rejects empty array");

        // 2. minLength
        assert.strictEqual(GlobalPipeline.assembleAndExecute({ type: "string", minLength: 4 }, "abc").isValid, false, "minLength rejects short string");
        assert.strictEqual(GlobalPipeline.assembleAndExecute({ type: "string", minLength: 4 }, "abcd").isValid, true, "minLength accepts valid length");

        // 3. maxLength
        assert.strictEqual(GlobalPipeline.assembleAndExecute({ type: "string", maxLength: 3 }, "abcd").isValid, false, "maxLength rejects long string");
        assert.strictEqual(GlobalPipeline.assembleAndExecute({ type: "string", maxLength: 3 }, "abc").isValid, true, "maxLength accepts valid length");

        // 4. pattern
        assert.strictEqual(GlobalPipeline.assembleAndExecute({ type: "string", pattern: "^[A-Z]{3}-\\d{4}$" }, "abc-1234").isValid, false, "pattern rejects non-matching string");
        assert.strictEqual(GlobalPipeline.assembleAndExecute({ type: "string", pattern: "^[A-Z]{3}-\\d{4}$" }, "ABC-1234").isValid, true, "pattern accepts matching string");

        // 5. range (minimum / maximum)
        assert.strictEqual(GlobalPipeline.assembleAndExecute({ type: "number", minimum: 10, maximum: 20 }, 9).isValid, false, "range rejects below minimum");
        assert.strictEqual(GlobalPipeline.assembleAndExecute({ type: "number", minimum: 10, maximum: 20 }, 21).isValid, false, "range rejects above maximum");
        assert.strictEqual(GlobalPipeline.assembleAndExecute({ type: "number", minimum: 10, maximum: 20 }, 15).isValid, true, "range accepts within bounds");

        // 6. multipleOf
        assert.strictEqual(GlobalPipeline.assembleAndExecute({ type: "number", multipleOf: 0.25 }, 1.1).isValid, false, "multipleOf rejects non-multiple");
        assert.strictEqual(GlobalPipeline.assembleAndExecute({ type: "number", multipleOf: 0.25 }, 1.75).isValid, true, "multipleOf accepts exact float multiple");

        // 7. arrayItems (minItems / maxItems)
        assert.strictEqual(GlobalPipeline.assembleAndExecute({ type: "array", minItems: 2, maxItems: 3 }, ["one"]).isValid, false, "arrayItems rejects below minItems");
        assert.strictEqual(GlobalPipeline.assembleAndExecute({ type: "array", minItems: 2, maxItems: 3 }, ["a", "b", "c", "d"]).isValid, false, "arrayItems rejects above maxItems");
        assert.strictEqual(GlobalPipeline.assembleAndExecute({ type: "array", minItems: 2, maxItems: 3 }, ["a", "b"]).isValid, true, "arrayItems accepts valid item count");

        // 8. email (via ui.format and ui.validators)
        assert.strictEqual(GlobalPipeline.assembleAndExecute({ type: "string", ui: { format: "email" } }, "not-an-email").isValid, false, "email validator rejects invalid email");
        assert.strictEqual(GlobalPipeline.assembleAndExecute({ type: "string", ui: { format: "email" } }, "dev@siliconst.com").isValid, true, "email validator accepts valid email");

        // 9. url
        assert.strictEqual(GlobalPipeline.assembleAndExecute({ type: "string", ui: { validators: ["url"] } }, "ftp://invalid").isValid, false, "url validator rejects non-http URL");
        assert.strictEqual(GlobalPipeline.assembleAndExecute({ type: "string", ui: { validators: ["url"] } }, "https://www.siliconst.com").isValid, true, "url validator accepts valid https URL");

        // 10. iban
        assert.strictEqual(GlobalPipeline.assembleAndExecute({ type: "string", ui: { validators: ["iban"] } }, "INVALID-IBAN").isValid, false, "iban validator rejects invalid IBAN");
        assert.strictEqual(GlobalPipeline.assembleAndExecute({ type: "string", ui: { validators: ["iban"] } }, "DE89370400440532013000").isValid, true, "iban validator accepts valid IBAN");
        assert.strictEqual(GlobalPipeline.assembleAndExecute({ type: "string", ui: { format: "iban" } }, "DE00370400440532013000").isValid, false, "iban validator rejects IBAN with failed mod-97 checksum");

        // 11. Edge cases: exclusiveMinimum, exclusiveMaximum, uniqueItems, invalid regex pattern
        assert.strictEqual(
            GlobalPipeline.assembleAndExecute({ type: "number", exclusiveMinimum: 10, exclusiveMaximum: 20 }, 10).isValid,
            false,
            "range validator rejects boundary value when exclusiveMinimum is numeric (Draft-07)"
        );
        assert.strictEqual(
            GlobalPipeline.assembleAndExecute({ type: "number", exclusiveMinimum: 10, exclusiveMaximum: 20 }, 20).isValid,
            false,
            "range validator rejects boundary value when exclusiveMaximum is numeric (Draft-07)"
        );
        assert.strictEqual(
            GlobalPipeline.assembleAndExecute({ type: "number", minimum: 10, exclusiveMinimum: true }, 10).isValid,
            false,
            "range validator rejects boundary value when exclusiveMinimum is boolean true (Draft-04)"
        );
        assert.strictEqual(
            GlobalPipeline.assembleAndExecute({ type: "array", uniqueItems: true }, ["dup", "dup"]).isValid,
            false,
            "arrayItems validator rejects duplicate array elements when uniqueItems=true"
        );
        assert.strictEqual(
            GlobalPipeline.assembleAndExecute({ type: "string", pattern: "[unclosed" }, "test").isValid,
            false,
            "pattern validator safely reports malformed regular expression without crashing"
        );
        assert.strictEqual(
            GlobalPipeline.assembleAndExecute({ type: "string", maxLength: 2 }, "😀😀").isValid,
            true,
            "maxLength counts Unicode code points (2 astral emojis = 2 code points)"
        );
        assert.strictEqual(
            GlobalPipeline.assembleAndExecute({ type: "string", minLength: 3 }, "😀😀").isValid,
            false,
            "minLength counts Unicode code points (2 astral emojis < 3 code points)"
        );

        // 12. enum, const, integer, objectProperties, nullable, and large multipleOf / structural uniqueItems
        assert.strictEqual(
            GlobalPipeline.assembleAndExecute({ type: "string", enum: ["A", "B"] }, "C").isValid,
            false,
            "enum validator rejects value outside allowed enum list"
        );
        assert.strictEqual(
            GlobalPipeline.assembleAndExecute({ type: "string", enum: ["A", "B"] }, "B").isValid,
            true,
            "enum validator accepts value in allowed enum list"
        );
        assert.strictEqual(
            GlobalPipeline.assembleAndExecute({ type: "string", const: "FIXED" }, "OTHER").isValid,
            false,
            "const validator rejects value not matching const"
        );
        assert.strictEqual(
            GlobalPipeline.assembleAndExecute({ type: "string", const: "FIXED" }, "FIXED").isValid,
            true,
            "const validator accepts exact const value"
        );
        assert.strictEqual(
            GlobalPipeline.assembleAndExecute({ type: "integer" }, 1.5).isValid,
            false,
            "integer validator rejects fractional number"
        );
        assert.strictEqual(
            GlobalPipeline.assembleAndExecute({ type: "integer" }, 42).isValid,
            true,
            "integer validator accepts whole integer"
        );
        assert.strictEqual(
            GlobalPipeline.assembleAndExecute({ type: "object", minProperties: 2, maxProperties: 3 }, { a: 1 }).isValid,
            false,
            "objectProperties validator rejects object below minProperties"
        );
        assert.strictEqual(
            GlobalPipeline.assembleAndExecute({ type: "object", minProperties: 2, maxProperties: 3 }, { a: 1, b: 2, c: 3, d: 4 }).isValid,
            false,
            "objectProperties validator rejects object above maxProperties"
        );
        assert.strictEqual(
            GlobalPipeline.assembleAndExecute({ type: "object", minProperties: 2, maxProperties: 3 }, { a: 1, b: 2 }).isValid,
            true,
            "objectProperties validator accepts object within property count bounds"
        );
        assert.strictEqual(
            GlobalPipeline.assembleAndExecute({ type: "string", nullable: false }, null).isValid,
            false,
            "required/nullable validator rejects null when nullable is false"
        );
        assert.strictEqual(
            GlobalPipeline.assembleAndExecute({ type: "string", nullable: true }, null).isValid,
            true,
            "required/nullable validator accepts null when nullable is true and not required"
        );
        assert.strictEqual(
            GlobalPipeline.assembleAndExecute({ type: "number", multipleOf: 2 }, 1000000001).isValid,
            false,
            "multipleOf validator accurately rejects large quotient non-multiple (1e9 + 1 / 2)"
        );
        assert.strictEqual(
            GlobalPipeline.assembleAndExecute({ type: "array", uniqueItems: true }, [{ a: 1, b: 2 }, { b: 2, a: 1 }]).isValid,
            false,
            "arrayItems validator rejects structurally identical objects with different key orders when uniqueItems=true"
        );
        assert.strictEqual(
            GlobalPipeline.assembleAndExecute({ type: "string", ui: { format: "email" } }, "a..b@siliconst.com").isValid,
            false,
            "email validator rejects consecutive dots in local part"
        );
        assert.strictEqual(
            GlobalPipeline.assembleAndExecute({ type: "object", enum: [{ a: 1, b: 2 }] }, { b: 2, a: 1 }).isValid,
            true,
            "enum validator accepts structurally equal object with different key order"
        );
        assert.strictEqual(
            GlobalPipeline.assembleAndExecute({ type: "string", format: "uri" }, "just-a-word").isValid,
            false,
            "url validator rejects scheme-less string for format: uri"
        );
        assert.strictEqual(
            GlobalPipeline.assembleAndExecute({ type: "number", minimum: 10, exclusiveMinimum: true }, 10).isValid,
            false,
            "range validator rejects boundary value when exclusiveMinimum is true"
        );
        assert.strictEqual(
            GlobalPipeline.assembleAndExecute({ type: "number", exclusiveMaximum: 20 }, 20).isValid,
            false,
            "range validator rejects boundary value when numeric exclusiveMaximum is matched"
        );
    });

    QUnit.module("Pipeline Plugins: All 4 Formatters & Chained Execution");

    QUnit.test("All 4 Formatter Plugins are registered and transform values deterministically", function (assert) {
        var pm = PipelineManager.getInstance();

        TestOracle.FORMATTER_LIST.forEach(function (formatterName) {
            assert.strictEqual(
                pm.formatters.has(formatterName),
                true,
                "Formatter '" + formatterName + "' is registered in PipelineManager"
            );
        });

        assert.strictEqual(pm.runFormatters("hello world", ["textCase"]), "HELLO WORLD", "textCase formatter defaults to uppercase");
        assert.strictEqual(pm.runFormatters("HELLO WORLD", ["textCase"], "lower"), "hello world", "textCase formatter supports lowercase mode");
        assert.strictEqual(pm.runFormatters("hello world", ["textCase"], "title"), "Hello World", "textCase formatter supports titlecase mode");
        assert.strictEqual(pm.runFormatters("HELLO WORLD", ["textCase"], { case: "lower" }), "hello world", "textCase formatter supports object args { case: 'lower' }");
        assert.strictEqual(pm.runFormatters(1234.5, ["currency"]).indexOf("1,234.50") !== -1, true, "currency formatter formats decimals");
        assert.strictEqual(pm.runFormatters("1234.5", ["currency"], "NZ$").indexOf("NZ$1,234.50") !== -1, true, "currency formatter supports custom prefix symbol and numeric strings");
        assert.strictEqual(pm.runFormatters("", ["currency"]), "", "currency formatter returns empty string for blank input");
        assert.strictEqual(typeof pm.runFormatters("2026-12-31", ["date"]), "string", "date formatter returns formatted date string");
        assert.strictEqual(pm.runFormatters("2026-12-31", ["date"]).indexOf("31") !== -1, true, "date formatter parses YYYY-MM-DD in local time without day shift");
        assert.strictEqual(pm.runFormatters(new Date(2026, 11, 31), ["date"]).indexOf("2026") !== -1, true, "date formatter accepts native Date instances");
        assert.strictEqual(pm.runFormatters("not-a-valid-date", ["date"]), "not-a-valid-date", "date formatter falls back to raw string when given an invalid date");
        assert.strictEqual(pm.runFormatters("5551234567", ["phone"]), "(555) 123-4567", "phone formatter formats 10-digit US phone");
        assert.strictEqual(pm.runFormatters("+6491234567", ["phone"]), "+64 91234567", "phone formatter formats international E.164 phone number");

        // 13.11.1: Presentational parser registration & round-trip verification (phone, currency, date vs transforming textCase)
        var runParsersSafe = function (val, names, args) {
            return typeof pm.runParsers === "function" ? pm.runParsers(val, names, args) : undefined;
        };
        assert.strictEqual(pm.parsers.has("phone"), true, "Phone parser is registered in PipelineManager.parsers");
        assert.strictEqual(pm.parsers.has("currency"), true, "Currency parser is registered in PipelineManager.parsers");
        assert.strictEqual(pm.parsers.has("date"), true, "Date parser is registered in PipelineManager.parsers");
        assert.strictEqual(pm.parsers.has("textCase"), false, "textCase is transforming and has no parser in PipelineManager.parsers");

        // Phone round-trip cases: parse(format(x)) === x
        assert.strictEqual(
            runParsersSafe(pm.runFormatters("5551234567", ["phone"]), ["phone"]),
            "5551234567",
            "phone parser round-trips 10-digit number (5551234567)"
        );
        assert.strictEqual(
            runParsersSafe(pm.runFormatters("+15551234567", ["phone"]), ["phone"]),
            "+15551234567",
            "phone parser round-trips +1 US international number (+15551234567) preserving leading +"
        );
        assert.strictEqual(
            runParsersSafe(pm.runFormatters("+64211234567", ["phone"]), ["phone"]),
            "+64211234567",
            "phone parser round-trips 2-digit country code number (+64211234567) preserving leading +"
        );
        assert.strictEqual(
            runParsersSafe(pm.runFormatters("ext-12345", ["phone"]), ["phone"]),
            "ext-12345",
            "phone parser passes through unformatted value unchanged"
        );
        assert.strictEqual(
            runParsersSafe("15551234567", ["phone"]),
            "15551234567",
            "phone parser preserves raw 11-digit number without leading + (15551234567)"
        );
        assert.strictEqual(
            runParsersSafe(pm.runFormatters("15551234567", ["phone"]), ["phone"]),
            "+15551234567",
            "phone parser parses +1 (555) 123-4567 to +15551234567 (preserving leading + emitted by format)"
        );

        // Currency round-trip & total parser checks
        assert.strictEqual(
            runParsersSafe(pm.runFormatters(1234.56, ["currency"]), ["currency"]),
            1234.56,
            "currency parser round-trips formatted currency back to number 1234.56"
        );
        assert.strictEqual(
            runParsersSafe(pm.runFormatters(-1234.56, ["currency"]), ["currency"]),
            -1234.56,
            "currency parser round-trips negative formatted currency back to number -1234.56"
        );
        assert.strictEqual(
            runParsersSafe(pm.runFormatters(1234.5, ["currency"], "NZ$"), ["currency"], "NZ$"),
            1234.5,
            "currency parser round-trips custom symbol currency (NZ$) back to number 1234.5"
        );
        assert.strictEqual(
            runParsersSafe("not-a-currency", ["currency"]),
            "not-a-currency",
            "currency parser is total and returns unparseable input unchanged"
        );

        // Date round-trip & total parser checks
        assert.strictEqual(
            runParsersSafe(pm.runFormatters("2026-10-15", ["date"]), ["date"]),
            "2026-10-15",
            "date parser round-trips formatted medium date back to ISO YYYY-MM-DD (2026-10-15)"
        );
        assert.strictEqual(
            runParsersSafe("not-a-valid-date", ["date"]),
            "not-a-valid-date",
            "date parser is total and returns unparseable input unchanged"
        );

        // Chained parsers execute in reverse order of runFormatters
        var traceOrder = [];
        pm.parsers.register("_testChainA", {
            parse: function (v) {
                traceOrder.push("A");
                return String(v).replace(/^A:/, "");
            }
        });
        pm.parsers.register("_testChainB", {
            parse: function (v) {
                traceOrder.push("B");
                return String(v).replace(/^B:/, "");
            }
        });
        assert.strictEqual(
            runParsersSafe("B:A:raw", ["_testChainA", "_testChainB"]) + "|" + traceOrder.join(","),
            "raw|B,A",
            "runParsers executes chained parsers in reverse order (B then A)"
        );
        pm.parsers.items.delete("_testChainA");
        pm.parsers.items.delete("_testChainB");
    });
});
