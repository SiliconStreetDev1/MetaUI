sap.ui.define([
    "metaui/sandbox/test/TestOracle",
    "nz/co/siliconst/ui5/metaui/core/PipelineManager",
    "nz/co/siliconst/ui5/metaui/core/PluginRegistry",
    "nz/co/siliconst/ui5/metaui/plugins/datasources/RemoteDropdownPlugin",
    "nz/co/siliconst/ui5/metaui/plugins/controls/ObjectPlugin",
    "nz/co/siliconst/ui5/metaui/plugins/controls/ArrayPlugin",
    "nz/co/siliconst/ui5/metaui/openapi/OpenApiBuilder",
    "nz/co/siliconst/ui5/metaui/utils/ControlDirectiveUtil",
    "nz/co/siliconst/ui5/metaui/utils/ExpressionBuilder",
    "nz/co/siliconst/ui5/metaui/utils/UrlValidator",
    "nz/co/siliconst/ui5/metaui/utils/I18n",
    "nz/co/siliconst/ui5/metaui/utils/Logger",
    "nz/co/siliconst/ui5/metaui/core/PayloadValidator",
    "sap/base/i18n/Localization",
    "sap/ui/model/json/JSONModel",
    "sap/m/Button",
    "sap/m/FormattedText",
    "sap/m/Input",
    "sap/m/Link",
    // The i18n caption tests call PluginRegistry.getPlugin() directly, which resolves
    // through a synchronous sap.ui.require and therefore needs the module already in
    // the AMD cache. Production reaches these through preloadDependencies(); a unit
    // test that bypasses the engine has to declare them, as ObjectPlugin and
    // ArrayPlugin above already do.
    "nz/co/siliconst/ui5/metaui/plugins/actions/ClearFormActionPlugin",
    "nz/co/siliconst/ui5/metaui/plugins/actions/SubmitFormActionPlugin",
    "nz/co/siliconst/ui5/metaui/plugins/actions/UrlNavigationActionPlugin",
    "nz/co/siliconst/ui5/metaui/plugins/controls/PasswordPlugin",
    "nz/co/siliconst/ui5/metaui/plugins/controls/MultiInputPlugin",
    "nz/co/siliconst/ui5/metaui/plugins/controls/DictionaryMapPlugin",
    "nz/co/siliconst/ui5/metaui/plugins/datasources/ODataListBindingPlugin",
    "nz/co/siliconst/ui5/metaui/plugins/datasources/LiveSearchPlugin",
    "nz/co/siliconst/ui5/metaui/plugins/datasources/RemoteValueHelpPlugin"
], function (
    TestOracle,
    PipelineManagerMod,
    PluginRegistryMod,
    RemoteDropdownPluginMod,
    /* ObjectPlugin: loaded so PluginRegistry can resolve it synchronously in the i18n tests */
    /* eslint-disable-next-line no-unused-vars */
    ObjectPluginMod,
    /* ArrayPlugin: loaded for the same reason */
    /* eslint-disable-next-line no-unused-vars */
    ArrayPluginMod,
    OpenApiBuilderMod,
    ControlDirectiveUtilMod,
    ExpressionBuilderMod,
    UrlValidatorMod,
    I18nMod,
    LoggerMod,
    PayloadValidatorMod,
    Localization,
    JSONModel,
    Button,
    FormattedText,
    Input,
    Link
    /* The nine plugin modules above are required for their registration side effect
       only, so they take no parameters here. */
) {
    "use strict";

    var PipelineManager = PipelineManagerMod.PipelineManager;
    var GlobalPipeline = PipelineManagerMod.GlobalPipeline;
    var PluginRegistry = PluginRegistryMod.PluginRegistry;
    var RemoteDropdownPlugin = RemoteDropdownPluginMod.RemoteDropdownPlugin;
    var OpenApiBuilder = OpenApiBuilderMod.OpenApiBuilder;
    var ControlDirectiveUtil = ControlDirectiveUtilMod.ControlDirectiveUtil;
    var vetControlProperty = ControlDirectiveUtilMod.vetControlProperty;
    var ExpressionBuilder = ExpressionBuilderMod.ExpressionBuilder;
    var UrlValidator = UrlValidatorMod.UrlValidator;
    var I18n = I18nMod.I18n;
    var TEXT_KEY = I18nMod.TEXT_KEY;
    var Logger = LoggerMod.Logger;
    var PayloadValidator = PayloadValidatorMod.PayloadValidator;

    /**
     * Applies a `ui` directive block to a bare UI5 control through the production code path used by
     * every plugin, so the security tests exercise ControlDirectiveUtil exactly as BasePlugin does.
     */
    function applyUiDirectives(control, uiBlock, bindingPath) {
        ControlDirectiveUtil.applyCommonDirectives(
            control,
            control,
            { type: "string", ui: uiBlock },
            bindingPath,
            true,
            "meta"
        );
        return control;
    }

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

    QUnit.module("Security Hardening: schema-supplied directives are untrusted input");

    QUnit.test("Security hardening: ui.controlProps cannot inject markup or unsafe URIs", function (assert) {
        // 1. Zero-click XSS: a raw-markup sink is refused outright, so setProperty can never bypass
        //    sap.m.FormattedText's own sanitizing setter.
        var richText = new FormattedText({ htmlText: "<p>original</p>" });
        applyUiDirectives(richText, {
            controlProps: { htmlText: "<img src=x onerror=\"window.__metauiXssFlag = true\">" }
        }, "/Rich");
        assert.strictEqual(richText.getHtmlText(), "<p>original</p>", "controlProps 'htmlText' is refused and the bound value survives");
        assert.strictEqual(richText.getHtmlText().indexOf("onerror"), -1, "No event-handler attribute reaches sap.m.FormattedText.htmlText");
        richText.destroy();

        // 2. One-click XSS: a literal javascript: URI on a sap.ui.core.URI property is refused.
        var hostileLink = new Link();
        applyUiDirectives(hostileLink, { controlProps: { href: "javascript:window.__metauiXssFlag = true" } }, "/Url");
        assert.strictEqual(hostileLink.getHref(), "", "controlProps 'href' rejects a javascript: URI");
        hostileLink.destroy();

        // 3. The same protection applies when the unsafe URI arrives through a model binding.
        var uriModel = new JSONModel({ Evil: "javascript:alert(1)", Good: "https://www.siliconst.com/docs" });
        var boundEvilLink = new Link();
        applyUiDirectives(boundEvilLink, { controlProps: { href: "{/Evil}" } }, "/Url");
        boundEvilLink.setModel(uriModel, "meta");
        assert.strictEqual(boundEvilLink.getHref(), "", "A bound javascript: URI is sanitized to an empty href");
        boundEvilLink.destroy();

        var boundSafeLink = new Link();
        applyUiDirectives(boundSafeLink, { controlProps: { href: "{/Good}" } }, "/Url");
        boundSafeLink.setModel(uriModel, "meta");
        assert.strictEqual(boundSafeLink.getHref(), "https://www.siliconst.com/docs", "A bound https: URI still binds normally");
        boundSafeLink.destroy();
        uriModel.destroy();

        // 4. Legitimate controlProps keep working (static scalars, CSSSize, int, boolean and sap-icon URIs).
        var legitInput = new Input();
        applyUiDirectives(legitInput, {
            controlProps: { placeholder: "Search something...", maxLength: 42, showClearIcon: true, width: "320px" }
        }, "/Query");
        assert.strictEqual(legitInput.getPlaceholder(), "Search something...", "controlProps still applies a string placeholder");
        assert.strictEqual(legitInput.getMaxLength(), 42, "controlProps still applies an int maxLength");
        assert.strictEqual(legitInput.getShowClearIcon(), true, "controlProps still applies a boolean showClearIcon");
        assert.strictEqual(legitInput.getWidth(), "320px", "controlProps still applies a sap.ui.core.CSSSize width");
        legitInput.destroy();

        var iconButton = new Button();
        applyUiDirectives(iconButton, { controlProps: { icon: "sap-icon://search", text: "Go" } }, "/Action");
        assert.strictEqual(iconButton.getIcon(), "sap-icon://search", "controlProps still applies a sap-icon:// URI");
        assert.strictEqual(iconButton.getText(), "Go", "controlProps still applies a plain text property");
        iconButton.destroy();

        // 5. Recorded UI5 behaviour: ManagedObject.validateProperty throws for an out-of-range enum and
        //    for a mistyped scalar. The type gate cannot prevent either, so the write must contain them.
        var enumThrew = false;
        try {
            new Input().setType("NotAValidInputType");
        } catch (enumError) {
            enumThrew = true;
        }
        assert.strictEqual(enumThrew, true, "UI5's generated setter throws on an out-of-range enum value (recorded behaviour)");

        var scalarThrew = false;
        try {
            new Input().setMaxLength("not-a-number");
        } catch (scalarError) {
            scalarThrew = true;
        }
        assert.strictEqual(scalarThrew, true, "UI5's generated setter throws on a mistyped scalar value (recorded behaviour)");

        // 6. A hostile value that UI5 rejects is refused, not propagated: the render survives and the
        //    remaining controlProps entries on the same control are still applied.
        var hostileValueInput = new Input();
        applyUiDirectives(hostileValueInput, {
            controlProps: { type: "NotAValidInputType", maxLength: "not-a-number", placeholder: "still applied" }
        }, "/Survives");
        assert.strictEqual(hostileValueInput.getType(), "Text", "An out-of-range enum controlProp leaves the UI5 default in place");
        assert.strictEqual(hostileValueInput.getMaxLength(), 0, "A mistyped scalar controlProp leaves the UI5 default in place");
        assert.strictEqual(
            hostileValueInput.getPlaceholder(),
            "still applied",
            "A controlProps entry UI5 rejects does not abort the remaining entries or the render"
        );
        hostileValueInput.destroy();

        // 7. The gate itself: allowlist over UI5 property types, not a list of dangerous names.
        var probe = new Input();
        assert.strictEqual(vetControlProperty(probe, "placeholder").allowed, true, "vetControlProperty accepts a declared scalar property");
        assert.strictEqual(vetControlProperty(probe, "value").allowed, false, "vetControlProperty refuses a MetaUI-owned core state property");
        assert.strictEqual(vetControlProperty(probe, "htmlText").allowed, false, "vetControlProperty refuses a raw-markup sink");
        assert.strictEqual(vetControlProperty(probe, "notAUi5Property").allowed, false, "vetControlProperty refuses an undeclared property");
        assert.strictEqual(vetControlProperty(undefined, "placeholder").allowed, false, "vetControlProperty refuses when no control declares the property");
        probe.destroy();
    });

    QUnit.test("Security hardening: visibleOn and enabledOn refuse raw UI5 complex-binding syntax", function (assert) {
        var probeHits = [];
        window.__metauiFormatterProbe = function (value) {
            probeHits.push(value);
            return true;
        };

        // 1. Single-token complex binding carrying a named global formatter.
        var hostileToken = "{path:'/CreditCard', formatter:'__metauiFormatterProbe', z:'>'}";
        assert.strictEqual(
            ExpressionBuilder.buildChecked(hostileToken, "/Field", "meta"),
            undefined,
            "buildChecked refuses a single-token complex binding carrying formatter:"
        );
        assert.strictEqual(
            ExpressionBuilder.build(hostileToken, "/Field", "meta").indexOf("formatter"),
            -1,
            "build never emits a formatter reference for a hostile token"
        );
        assert.strictEqual(
            ExpressionBuilder.build(hostileToken, "/Field", "meta"),
            "{= false }",
            "The total build() entry point fails closed on a refused rule instead of resolving it to visible"
        );
        assert.strictEqual(
            ExpressionBuilder.build("", "/Field", "meta"),
            "{= true }",
            "An absent rule is still unconstrained — only a refused rule fails closed"
        );

        // 2. The same payload smuggled through masked string literals inside an expression binding.
        var hostileExpression = "{= ${meta>/CreditCard', formatter:'__metauiFormatterProbe', z:'} }";
        assert.strictEqual(
            ExpressionBuilder.buildChecked(hostileExpression, "/Field", "meta"),
            undefined,
            "buildChecked refuses complex-binding syntax hidden behind masked string literals"
        );

        // 3. End to end: no global is resolved and no field value is handed to it.
        var secretModel = new JSONModel({ CreditCard: "4111111111111111", ShowField: true });
        var victim = new Input();
        applyUiDirectives(victim, { visibleOn: hostileToken, enabledOn: hostileToken }, "/Field");
        victim.setModel(secretModel, "meta");
        victim.getVisible();
        victim.getEnabled();
        assert.strictEqual(probeHits.length, 0, "A named global formatter is never resolved or invoked from visibleOn/enabledOn");
        assert.strictEqual(victim.getVisible(), true, "The refused visibleOn directive is skipped rather than bound");
        victim.destroy();

        // 4. Model paths are refused on structure, not on alphabet: an OData key predicate carries
        //    quotes, parentheses, '=' and ',' but has no top-level complex-binding syntax, so it binds.
        assert.strictEqual(
            ExpressionBuilder.buildChecked("{odata>/Employees('E100')/Active}", "/Field", "meta"),
            "{odata>/Employees('E100')/Active}",
            "A single-key OData predicate is accepted as a plain model path"
        );
        assert.strictEqual(
            ExpressionBuilder.buildChecked("{odata>/Items(ID=1,Name='x')/Qty}", "/Field", "meta"),
            "{odata>/Items(ID=1,Name='x')/Qty}",
            "A multi-key OData predicate keeps its parenthesised comma"
        );
        assert.strictEqual(
            ExpressionBuilder.buildChecked("{/My Field}", "/Field", "meta"),
            "{meta>/My Field}",
            "A model path containing a space is accepted"
        );
        assert.strictEqual(
            ExpressionBuilder.buildChecked("{path:'/X'}", "/Field", "meta"),
            undefined,
            "A complex-binding object is refused even when it carries no formatter"
        );
        assert.strictEqual(
            ExpressionBuilder.buildChecked("{'path':'/X','formatter':'__metauiFormatterProbe'}", "/Field", "meta"),
            undefined,
            "A quoted-key complex-binding object is refused"
        );
        assert.strictEqual(
            ExpressionBuilder.buildChecked("{= ${odata>/Employees('E100')/Active} === true }", "/Field", "meta"),
            "{= ${odata>/Employees('E100')/Active} === true }",
            "An OData predicate inside an expression binding keeps its quoted key"
        );
        assert.strictEqual(
            ExpressionBuilder.buildChecked("{= ${odata>/Items(ID=1,Name='x')/Qty} > 5 }", "/Field", "meta"),
            "{= ${odata>/Items(ID=1,Name='x')/Qty} > 5 }",
            "A multi-key OData predicate inside an expression binding is accepted"
        );
        assert.strictEqual(
            ExpressionBuilder.buildChecked("{= ${meta>/X'}{formatter:'__metauiFormatterProbe'} }", "/Field", "meta"),
            undefined,
            "A literal used to break out of the token and open a complex binding is refused"
        );
        assert.strictEqual(
            ExpressionBuilder.buildChecked("{= ${meta>/X('}{formatter:'__metauiFormatterProbe')} }", "/Field", "meta"),
            undefined,
            "The same break-out attempted from inside a key predicate, where literals are restored, is refused"
        );

        // 5. End to end on the OData shape: the predicate resolves against the model and no global is hit.
        var odataModel = new JSONModel({ "Employees('E100')": { Active: false } });
        var odataTarget = new Input();
        applyUiDirectives(odataTarget, { visibleOn: "{odata>/Employees('E100')/Active}" }, "/Field");
        odataTarget.setModel(odataModel, "odata");
        assert.strictEqual(odataTarget.getVisible(), false, "An OData key-predicate visibleOn actually resolves against the model");
        odataModel.setProperty("/Employees('E100')/Active", true);
        assert.strictEqual(odataTarget.getVisible(), true, "An OData key-predicate visibleOn reacts to model changes");

        var odataExprTarget = new Input();
        applyUiDirectives(odataExprTarget, { visibleOn: "{= ${odata>/Employees('E100')/Active} === false }" }, "/Field");
        odataExprTarget.setModel(odataModel, "odata");
        assert.strictEqual(odataExprTarget.getVisible(), false, "An OData predicate inside an expression binding resolves against the model");
        odataModel.setProperty("/Employees('E100')/Active", false);
        assert.strictEqual(odataExprTarget.getVisible(), true, "An OData predicate inside an expression binding reacts to model changes");
        assert.strictEqual(probeHits.length, 0, "No global reference was resolved while binding either OData predicate");
        odataExprTarget.destroy();
        odataTarget.destroy();
        odataModel.destroy();

        // 6. Documented expression forms keep working unchanged.
        assert.strictEqual(
            ExpressionBuilder.build("{= ${/ShowField} === true }", "/Field", "meta"),
            "{= ${meta>/ShowField} === true }",
            "Absolute model-path expression bindings are unchanged"
        );
        assert.strictEqual(
            ExpressionBuilder.build("{/DynamicPh}", "/Field", "meta"),
            "{meta>/DynamicPh}",
            "Single-token absolute property bindings are unchanged"
        );
        assert.strictEqual(
            ExpressionBuilder.build("{settings>/liveUpdate}", "/Field", "meta"),
            "{settings>/liveUpdate}",
            "Single-token external-model bindings are unchanged"
        );
        assert.strictEqual(
            ExpressionBuilder.build("$root.Status === 'NEW'", "/Items/0/Category", "meta"),
            "{= ${meta>/Status} === 'NEW' }",
            "$root shorthand rules are unchanged"
        );

        var liveModel = new JSONModel({ ShowField: false });
        var liveTarget = new Input();
        applyUiDirectives(liveTarget, { visibleOn: "{= ${/ShowField} === true }" }, "/Field");
        liveTarget.setModel(liveModel, "meta");
        assert.strictEqual(liveTarget.getVisible(), false, "A legitimate visibleOn still hides the control");
        liveModel.setProperty("/ShowField", true);
        assert.strictEqual(liveTarget.getVisible(), true, "A legitimate visibleOn still reacts to model changes");
        liveTarget.destroy();
        liveModel.destroy();
        secretModel.destroy();
        delete window.__metauiFormatterProbe;
    });

    QUnit.test("Security hardening: catastrophic-backtracking patterns are refused before execution", function (assert) {
        var evilInput = new Array(29).join("a") + "!";

        var startedAt = Date.now();
        var nestedQuantifier = GlobalPipeline.assembleAndExecute({ type: "string", pattern: "(a+)+$" }, evilInput);
        var elapsed = Date.now() - startedAt;
        assert.strictEqual(nestedQuantifier.isValid, false, "A nested-quantifier pattern fails validation");
        assert.strictEqual(
            String(nestedQuantifier.errorMessage).indexOf("unsafe") !== -1,
            true,
            "A nested-quantifier pattern is reported as an unsafe schema configuration"
        );
        assert.strictEqual(elapsed < 250, true, "The nested-quantifier pattern is refused without being evaluated (" + elapsed + "ms)");

        var ambiguous = GlobalPipeline.assembleAndExecute({ type: "string", pattern: "^(a|a)*$" }, evilInput);
        assert.strictEqual(
            String(ambiguous.errorMessage).indexOf("unsafe") !== -1,
            true,
            "An ambiguous quantified alternation is refused"
        );

        var allOptional = GlobalPipeline.assembleAndExecute({ type: "string", pattern: "^(\\w+\\s?)*$" }, evilInput);
        assert.strictEqual(
            String(allOptional.errorMessage).indexOf("unsafe") !== -1,
            true,
            "A group built only from variable-length elements is refused"
        );

        // A star-height-2 group that the analysis cannot prove safe but that is anchored by a fixed
        // element is ALLOWED and carried by the evaluation budget, so a domain pattern is not bricked.
        assert.strictEqual(
            GlobalPipeline.assembleAndExecute({ type: "string", pattern: "^(?:[a-z]+\\.)+[a-z]{2,}$" }, "example.com").isValid,
            true,
            "An anchored star-height-2 domain pattern still accepts a matching value"
        );
        assert.strictEqual(
            GlobalPipeline.assembleAndExecute({ type: "string", pattern: "^(?:[a-z]+\\.)+[a-z]{2,}$" }, "EXAMPLE").isValid,
            false,
            "An anchored star-height-2 domain pattern still rejects a non-matching value"
        );
        assert.strictEqual(
            String(GlobalPipeline.assembleAndExecute({ type: "string", pattern: "^(?:[a-z]+\\.)+[a-z]{2,}$" }, "EXAMPLE").errorMessage)
                .indexOf("unsafe"),
            -1,
            "An anchored star-height-2 domain pattern is not reported as unsafe"
        );
        assert.strictEqual(
            GlobalPipeline.assembleAndExecute({ type: "string", pattern: "^([A-Z]+-)+\\d+$" }, "AB-CD-12").isValid,
            true,
            "An anchored star-height-2 reference pattern still validates normally"
        );

        var overLong = GlobalPipeline.assembleAndExecute({ type: "string", pattern: new Array(600).join("a") }, "aaa");
        assert.strictEqual(
            String(overLong.errorMessage).indexOf("unsafe") !== -1,
            true,
            "A pattern longer than the 512-character cap is refused"
        );

        // Legitimate patterns, including quantified fixed-length groups, keep working.
        assert.strictEqual(
            GlobalPipeline.assembleAndExecute({ type: "string", pattern: "^[A-Z]{3}-\\d{4}$" }, "ABC-1234").isValid,
            true,
            "A bounded anchored pattern still accepts a matching value"
        );
        assert.strictEqual(
            GlobalPipeline.assembleAndExecute({ type: "string", pattern: "^\\d{5}(-\\d{4})?$" }, "12345-6789").isValid,
            true,
            "An optional fixed-length group still accepts a matching value"
        );
        assert.strictEqual(
            GlobalPipeline.assembleAndExecute({ type: "string", pattern: "^(abc|def)+$" }, "abcdef").isValid,
            true,
            "A repeated fixed-length unambiguous alternation is still accepted and still matches"
        );
        assert.strictEqual(
            GlobalPipeline.assembleAndExecute({ type: "string", pattern: "^(abc|def)+$" }, "abcxyz").isValid,
            false,
            "A repeated fixed-length unambiguous alternation still rejects a non-matching value"
        );
        assert.strictEqual(
            GlobalPipeline.assembleAndExecute({ type: "string", ui: { format: "email" } }, "dev@siliconst.com").isValid,
            true,
            "The built-in email validator is unaffected by the pattern guard"
        );
    });

    QUnit.test("Security hardening: redundant grouping does not smuggle a backtracking pattern past the screen", function (assert) {
        // The screen used to read `(a+)+` as "a quantifier over a variable group" and `((a+))+` as
        // "a quantifier over a fixed group", because a group with no quantifier of its own
        // contributed nothing to its parent. One pair of parentheses defeated the control, and the
        // 50 ms budget did not help: it is measured after RegExp.test returns, so the first
        // keystroke blocked the thread for the whole blow-up (53 s on a 31-character value).
        var evilInput = new Array(45).join("a") + "!";
        var nested = [
            "^((a+))+$",
            "^(?:(a+))+$",
            "^(((a+)))+$",
            "^((a*))*$",
            "^((a|a))+$",
            "^(x(a|a))+$",
            // The fixed element only anchors a repeat if the variable one cannot eat it.
            "^(a+a)+$",
            "^([\\w.]+\\.)+$"
        ];
        for (var i = 0; i < nested.length; i++) {
            var startedAt = Date.now();
            var result = GlobalPipeline.assembleAndExecute({ type: "string", pattern: nested[i] }, evilInput);
            var elapsed = Date.now() - startedAt;
            assert.strictEqual(
                String(result.errorMessage).indexOf("unsafe") !== -1,
                true,
                nested[i] + " is refused as an unsafe schema configuration"
            );
            assert.strictEqual(elapsed < 1000, true, nested[i] + " is refused without being evaluated (" + elapsed + "ms)");
        }

        // A pattern the screen cannot prove linear is still allowed to run, but only against a
        // value short enough that its first evaluation cannot be the one that freezes the thread.
        var unproven = { type: "string", pattern: "^(?:[a-z]+\\.)+[a-z]{2,}$" };
        assert.strictEqual(
            GlobalPipeline.assembleAndExecute(unproven, new Array(253).join("a") + ".com").isValid,
            true,
            "An unprovable pattern still runs against a value inside the 256-character cap"
        );
        var overCap = GlobalPipeline.assembleAndExecute(unproven, new Array(400).join("a") + ".com");
        assert.strictEqual(overCap.isValid, false, "An unprovable pattern refuses a value past the cap");
        assert.strictEqual(
            String(overCap.errorMessage).indexOf("unproven") !== -1,
            true,
            "The refusal names the unproven running time rather than a value mismatch"
        );
        assert.strictEqual(
            GlobalPipeline.assembleAndExecute({ type: "string", pattern: "^[a-z]+$" }, new Array(4000).join("a")).isValid,
            true,
            "A pattern the screen proved linear is not capped"
        );
    });

    QUnit.test("Security hardening: consecutive quantifiers cannot redistribute the same characters without bound", function (assert) {
        // Nesting is not the only route to a frozen thread. ^.*.*.*.*.*x$ has no repeated group at
        // all, yet its five .* atoms split one run of characters between them: 13.9 s on a
        // 200-character value. The quarantine is keyed on the pattern, so a schema could stall the
        // thread once per distinct pattern and never be stopped.
        var longInput = new Array(2000).join("a") + "!";
        var sequential = [
            "^.*.*.*x$",
            "^.*.*.*.*.*x$",
            "^\\w*\\w*\\w*y$",
            // Redundant grouping must not smuggle the same shape past the screen.
            "^(?:a*)(?:a*)(?:a*)x$",
            "^((a*))((a*))((a*))x$",
            // Finite spans, but 10^7 combinations between them.
            "^a{0,9}a{0,9}a{0,9}a{0,9}a{0,9}a{0,9}a{0,9}b$",
            // Classes that meet only outside ASCII: an ASCII-only overlap probe missed these.
            "^[\\u0400-\\u0450a]*[\\u0440-\\u04ffb]*[\\u0400-\\u04ffc]*x$"
        ];
        for (var i = 0; i < sequential.length; i++) {
            var startedAt = Date.now();
            var refused = GlobalPipeline.assembleAndExecute({ type: "string", pattern: sequential[i] }, longInput);
            var elapsed = Date.now() - startedAt;
            assert.strictEqual(
                String(refused.errorMessage).indexOf("unsafe") !== -1,
                true,
                sequential[i] + " is refused as an unsafe schema configuration"
            );
            assert.strictEqual(elapsed < 1000, true, sequential[i] + " is refused without being evaluated (" + elapsed + "ms)");
        }

        // The disjoint element between the quantifiers pins the split, so ordinary patterns are
        // untouched. Refusing these would be the blunt screen the carve-out exists to avoid.
        var legitimate = [
            ["^\\d+-\\d+$", "12-34", true],
            ["^[a-z]+[0-9]+[A-Z]+$", "ab12CD", true],
            ["^\\w+\\.\\w+\\.\\w+\\.\\w+$", "a.b.c.d", true],
            ["^a*b*c*$", "abc", true],
            ["^(?:a*b)(?:a*b)(?:a*b)x$", "abababx", true],
            ["^[\\w.-]+@[\\w.-]+\\.[a-z]{2,}$", "dev@siliconst.com", true],
            ["^.*foo.*$", "a foo b", true],
            ["^.*foo.*$", "a bar b", false]
        ];
        for (var j = 0; j < legitimate.length; j++) {
            var result = GlobalPipeline.assembleAndExecute({ type: "string", pattern: legitimate[j][0] }, legitimate[j][1]);
            assert.strictEqual(
                String(result.errorMessage).indexOf("unsafe"),
                -1,
                legitimate[j][0] + " is not reported as unsafe"
            );
            assert.strictEqual(result.isValid, legitimate[j][2], legitimate[j][0] + " still decides '" + legitimate[j][1] + "' correctly");
        }
    });

    QUnit.test("Resilience: a payload value with no primitive conversion cannot take the render", function (assert) {
        // JSON.parse('{"toString":0}') is valid JSON, so a server can send an object whose
        // String(...) conversion throws TypeError. A formatter runs inside a UI5 property binding,
        // where that error takes the whole render, not one field.
        var hostile = JSON.parse('{"toString":0}');
        assert.throws(function () { return String(hostile); }, TypeError, "String() on the payload value still throws");

        var formatterNames = ["date", "phone", "textCase", "currency"];
        for (var i = 0; i < formatterNames.length; i++) {
            var rendered = GlobalPipeline.runFormatters(hostile, formatterNames[i]);
            assert.strictEqual(
                typeof rendered,
                "string",
                "The " + formatterNames[i] + " formatter renders it as a string instead of throwing"
            );
        }
        assert.strictEqual(
            typeof GlobalPipeline.runFormatters(hostile, formatterNames),
            "string",
            "A whole formatter chain survives it"
        );

        var constResult = GlobalPipeline.assembleAndExecute({ type: "string", const: hostile }, "abc");
        assert.strictEqual(constResult.isValid, false, "The const validator still rejects a mismatching value");
        assert.strictEqual(
            String(constResult.errorMessage).indexOf("System validation error"),
            -1,
            "The const validator builds its message instead of crashing into the pipeline's guard"
        );

        // A formatter that crashes for any other reason degrades to a display value, and says so.
        var crashing = {
            format: function () { throw new Error("formatter exploded"); }
        };
        GlobalPipeline.formatters.register("metauiCrashProbe", crashing);
        var captured = [];
        var originalError = Logger.error;
        Logger.error = function (message, details) { captured.push(String(message) + " " + String(details)); };
        try {
            var degraded = GlobalPipeline.runFormatters("abc", "metauiCrashProbe");
            assert.strictEqual(degraded, "abc", "A crashing formatter degrades to the safe string form of its input");
        } finally {
            Logger.error = originalError;
            GlobalPipeline.formatters.items.delete("metauiCrashProbe");
        }
        assert.strictEqual(captured.length > 0, true, "The crashing formatter is reported");
        assert.strictEqual(
            captured.join(" ").indexOf("formatter exploded") !== -1,
            true,
            "The report carries the underlying error"
        );
    });

    QUnit.test("Security hardening: data source URLs are scheme-checked and origin-policed", function (assert) {
        assert.strictEqual(UrlValidator.isSafeDataSourceUrl("javascript:fetch('https://evil.example.com')"), false, "javascript: endpoints are refused");
        assert.strictEqual(UrlValidator.isSafeDataSourceUrl("data:text/html,<script>alert(1)</script>"), false, "data: endpoints are refused");
        assert.strictEqual(UrlValidator.isSafeDataSourceUrl("//evil.example.com/collect"), false, "Protocol-relative endpoints are refused");
        assert.strictEqual(UrlValidator.isSafeDataSourceUrl("file:///etc/passwd"), false, "file: endpoints are refused");
        assert.strictEqual(UrlValidator.isSafeDataSourceUrl("mockData/users.json"), true, "Relative same-origin endpoints are permitted");

        UrlValidator.setDataSourceOriginPolicy("same-origin");
        assert.strictEqual(UrlValidator.isSafeDataSourceUrl("https://evil.example.com/collect"), false, "same-origin mode refuses a cross-origin endpoint");
        assert.strictEqual(UrlValidator.isSafeDataSourceUrl("mockData/users.json"), true, "same-origin mode still permits relative endpoints");

        UrlValidator.setDataSourceOriginPolicy("allowlist", ["https://api.example.com"]);
        assert.strictEqual(UrlValidator.isSafeDataSourceUrl("https://api.example.com/v1/users"), true, "allowlist mode permits a registered origin");
        assert.strictEqual(UrlValidator.isSafeDataSourceUrl("https://evil.example.com/collect"), false, "allowlist mode refuses an unregistered origin");

        UrlValidator.setDataSourceOriginPolicy("any");
        assert.strictEqual(UrlValidator.isSafeDataSourceUrl("https://api.example.com/v1/users"), true, "The default 'any' mode keeps cross-origin endpoints working");
        assert.strictEqual(UrlValidator.getDataSourceOriginPolicy().mode, "any", "The installed policy is readable");

        // End to end: the dropdown plugin never issues the request for a refused endpoint.
        var attempted = [];
        var originalFetch = window.fetch;
        window.fetch = function (requestedUrl) {
            attempted.push(String(requestedUrl));
            return Promise.resolve({
                ok: true,
                status: 200,
                json: function () {
                    return Promise.resolve([]);
                }
            });
        };
        var hostileDropdown = new RemoteDropdownPlugin();
        hostileDropdown.render(
            { type: "string", ui: { widget: "remoteDropdown", dataSource: { url: "javascript:alert(1)", keyField: "id", textField: "name" } } },
            "/HostilePick",
            "meta",
            "secHostileScope"
        );
        var safeDropdown = new RemoteDropdownPlugin();
        safeDropdown.render(
            { type: "string", ui: { widget: "remoteDropdown", dataSource: { url: "mockData/users.json", keyField: "id", textField: "name" } } },
            "/SafePick",
            "meta",
            "secSafeScope"
        );
        window.fetch = originalFetch;
        assert.strictEqual(
            attempted.join("|").indexOf("javascript:"),
            -1,
            "RemoteDropdownPlugin never calls fetch for a javascript: dataSource URL"
        );
        assert.strictEqual(
            attempted.filter(function (u) { return u.indexOf("mockData/users.json") !== -1; }).length,
            1,
            "RemoteDropdownPlugin still fetches a legitimate relative dataSource URL"
        );
        hostileDropdown.destroy();
        safeDropdown.destroy();
    });

    QUnit.test("Security hardening: OpenApiBuilder.fetchAndBuild honours the data source URL policy", function (assert) {
        var done = assert.async();
        var attempted = [];
        var originalFetch = window.fetch;
        window.fetch = function (requestedUrl) {
            attempted.push(String(requestedUrl));
            return Promise.resolve({
                ok: true,
                status: 200,
                json: function () {
                    return Promise.resolve({ swagger: "2.0", definitions: { Thing: { type: "object", properties: {} } } });
                }
            });
        };

        UrlValidator.setDataSourceOriginPolicy("same-origin");
        OpenApiBuilder.fetchAndBuild("https://evil.example.com/openapi.json")
            .then(function () {
                return "resolved";
            }, function (err) {
                return String(err && err.message);
            })
            .then(function (crossOriginOutcome) {
                assert.strictEqual(
                    crossOriginOutcome.indexOf("blocked by the data source URL policy") !== -1,
                    true,
                    "fetchAndBuild rejects a cross-origin URL once the policy is narrowed to same-origin"
                );
                assert.strictEqual(
                    attempted.join("|").indexOf("evil.example.com"),
                    -1,
                    "fetchAndBuild never issues the request for a policy-blocked URL"
                );
                return OpenApiBuilder.fetchAndBuild("javascript:alert(1)").then(function () {
                    return "resolved";
                }, function (err) {
                    return String(err && err.message);
                });
            })
            .then(function (schemeOutcome) {
                assert.strictEqual(
                    schemeOutcome.indexOf("blocked by the data source URL policy") !== -1,
                    true,
                    "fetchAndBuild rejects a javascript: URL"
                );
                assert.strictEqual(
                    attempted.join("|").indexOf("javascript:"),
                    -1,
                    "fetchAndBuild never issues the request for a javascript: URL"
                );
                return OpenApiBuilder.fetchAndBuild("mockData/openapi-policy-probe.json").then(function () {
                    return "resolved";
                }, function (err) {
                    return String(err && err.message);
                });
            })
            .then(function (sameOriginOutcome) {
                assert.strictEqual(
                    sameOriginOutcome.indexOf("blocked by the data source URL policy"),
                    -1,
                    "fetchAndBuild does not block a legitimate same-origin URL"
                );
                assert.strictEqual(
                    attempted.filter(function (u) { return u.indexOf("openapi-policy-probe.json") !== -1; }).length,
                    1,
                    "fetchAndBuild issued exactly one request for the permitted URL"
                );
                UrlValidator.setDataSourceOriginPolicy("any");
                window.fetch = originalFetch;
                done();
            });
    });

    // ------------------------------------------------------------------------------------------
    // Internationalisation
    //
    // Every end-user sentence MetaUI emits is read from the library resource bundle
    // src/nz/co/siliconst/ui5/metaui/messagebundle*.properties via utils/I18n. There is no English
    // copy of those sentences in TypeScript, so these tests are the only thing standing between a
    // mis-packaged bundle and a form that shows raw keys. German expectations are written with
    // \uXXXX escapes so this file stays ASCII and cannot be corrupted by an editor or a server
    // charset header.
    // ------------------------------------------------------------------------------------------

    /**
     * Parses a Java/UI5 .properties file into { texts, keysWithoutTextType }.
     * A key "carries a text type" when the nearest non-blank line above it is a SAP translator
     * context comment such as `#XMSG: ...` or `#XFLD: ...`.
     */
    function parseProperties(source) {
        var texts = {};
        var keysWithoutTextType = [];
        var lastNonBlank = "";
        source.split(/\r?\n/).forEach(function (line) {
            var trimmed = line.trim();
            if (trimmed === "") {
                return;
            }
            if (trimmed.charAt(0) === "#") {
                lastNonBlank = trimmed;
                return;
            }
            var eq = trimmed.indexOf("=");
            var key = trimmed.slice(0, eq);
            texts[key] = trimmed.slice(eq + 1);
            if (!/^#[XY][A-Z]{3}/.test(lastNonBlank)) {
                keysWithoutTextType.push(key);
            }
            lastNonBlank = trimmed;
        });
        return { texts: texts, keysWithoutTextType: keysWithoutTextType };
    }

    QUnit.module("i18n: Library Resource Bundle");

    QUnit.test("i18n: every declared text key resolves through the library resource bundle", function (assert) {
        var unresolved = I18n.getDeclaredKeys().filter(function (key) {
            return !I18n.hasText(key);
        });

        assert.ok(
            I18n.getBundle(),
            "Lib.getResourceBundleFor('nz.co.siliconst.ui5.metaui') returns a bundle, so messagebundle.properties is reachable at runtime"
        );
        assert.strictEqual(
            I18n.getDeclaredKeys().length,
            67,
            "TEXT_KEY declares 67 end-user texts (bump this number and the bundles together when adding one)"
        );
        assert.deepEqual(
            unresolved,
            [],
            "every key in TEXT_KEY resolves to a text in the shipped bundle"
        );
        assert.strictEqual(
            I18n.getText(TEXT_KEY.required),
            "This field is required.",
            "the English text comes back from the bundle (no hardcoded TypeScript copy exists to mask a load failure)"
        );
        assert.notStrictEqual(
            I18n.getText(TEXT_KEY.maxLength, [3]),
            TEXT_KEY.maxLength,
            "a resolved key never renders as the key name"
        );
    });

    QUnit.test("i18n: an unknown key is reported through Logger and never silently rendered", function (assert) {
        var ABSENT_KEY = "metaui.validation.__key_that_does_not_exist__";
        var originalError = Logger.error;
        var logged = [];
        var rendered;

        Logger.error = function (message, details) {
            logged.push(String(message) + " " + String(details));
        };
        try {
            rendered = I18n.getText(ABSENT_KEY);
        } finally {
            Logger.error = originalError;
        }

        assert.strictEqual(
            I18n.hasText(ABSENT_KEY),
            false,
            "hasText reports an absent key as absent rather than resolving it to its own name"
        );
        assert.strictEqual(
            I18n.hasText(TEXT_KEY.required),
            true,
            "hasText reports a shipped key as present, so the false above is not a blanket failure"
        );
        assert.strictEqual(
            rendered,
            ABSENT_KEY,
            "getText renders the key verbatim, which is visibly wrong on screen rather than plausibly English"
        );
        assert.strictEqual(
            logged.length,
            1,
            "getText reports the unresolvable key through Logger.error instead of degrading silently"
        );
    });

    QUnit.test("i18n: values are substituted into the translated sentence, never concatenated onto it", function (assert) {
        var pipeline = GlobalPipeline;

        [
            [{ type: "string", maxLength: 3 }, "abcd", "Maximum length is 3 characters.", "maxLength"],
            [{ type: "string", minLength: 4 }, "abc", "Minimum length is 4 characters.", "minLength"],
            [{ type: "number", minimum: 5 }, 4, "Value must be greater than or equal to 5.", "minimum"],
            [{ type: "number", minimum: 5, exclusiveMinimum: true }, 5, "Value must be greater than 5.", "exclusiveMinimum draft-4 flag"],
            [{ type: "number", maximum: 10 }, 11, "Value must be less than or equal to 10.", "maximum"],
            [{ type: "number", exclusiveMaximum: 10 }, 10, "Value must be less than 10.", "exclusiveMaximum draft-6 bound"],
            [{ type: "number", multipleOf: 3 }, 7, "Value must be a multiple of 3.", "multipleOf"],
            [{ type: "string", const: "ABC" }, "zz", "Value must equal 'ABC'.", "const, whose doubled apostrophes survive formatMessage"],
            [{ type: "string", enum: ["A", "B"] }, "C", "Value must be one of: A, B.", "enum"],
            [{ type: "array", minItems: 2 }, [1], "At least 2 item(s) required.", "minItems"],
            [{ type: "array", maxItems: 1 }, [1, 2], "At most 1 item(s) allowed.", "maxItems"],
            [{ type: "array", uniqueItems: true }, [1, 1], "All items must be unique.", "uniqueItems"],
            [{ type: "object", minProperties: 2 }, { a: 1 }, "At least 2 properties required.", "minProperties"],
            [{ type: "object", maxProperties: 1 }, { a: 1, b: 2 }, "At most 1 properties allowed.", "maxProperties"],
            [{ type: "string", required: true }, "", "This field is required.", "required"],
            [{ type: "string", required: false, nullable: false }, null, "Value cannot be null.", "nullable false"],
            [{ type: "integer" }, 1.5, "Value must be a whole integer.", "integer"],
            [{ type: "string", pattern: "^[0-9]+$" }, "abc", "Input does not match the required pattern.", "pattern"],
            [{ type: "string", ui: { format: "email" } }, "nope", "Please enter a valid email address.", "email"],
            [{ type: "string", ui: { format: "url" } }, "nope", "Please enter a valid URL.", "url"],
            [{ type: "string", ui: { format: "url" } }, "ftp://example.com/x", "URL must use http or https protocol.", "url protocol"],
            [{ type: "string", ui: { format: "iban" } }, "XX", "Please enter a valid IBAN.", "iban"],
            [{ type: "string", ui: { format: "iban" } }, "DE89370400440532013001", "IBAN checksum is invalid.", "iban checksum"]
        ].forEach(function (testCase) {
            assert.strictEqual(
                pipeline.assembleAndExecute(testCase[0], testCase[1]).errorMessage,
                testCase[2],
                "English wording is unchanged for " + testCase[3]
            );
        });

        [
            [
                { type: "object", properties: { Name: { type: "string", required: true, ui: { label: "Full Name" } } } },
                {},
                "Full Name: This field is required.",
                "nested field prefix uses the '{0}: {1}' frame"
            ],
            [
                { type: "array", items: { type: "string", minLength: 3 } },
                ["ab"],
                "Row 1: Minimum length is 3 characters.",
                "array row prefix uses the 'Row {0}: {1}' frame"
            ]
        ].forEach(function (treeCase) {
            assert.strictEqual(
                PayloadValidator.validateTree(treeCase[0], treeCase[1]).errorMessage,
                treeCase[2],
                "English wording is unchanged: " + treeCase[3]
            );
        });
    });

    QUnit.test("i18n: a German session locale renders the same messages in German", function (assert) {
        var pipeline = GlobalPipeline;
        var originalLanguage = Localization.getLanguage();

        try {
            Localization.setLanguage("de");

            [
                [{ type: "string", maxLength: 3 }, "abcd", "Die maximale L\u00e4nge betr\u00e4gt 3 Zeichen.", "maxLength"],
                [{ type: "number", minimum: 5, exclusiveMinimum: true }, 5, "Der Wert muss gr\u00f6\u00dfer als 5 sein.", "exclusiveMinimum, where German moves the verb to the end"],
                [{ type: "string", required: true }, "", "Dieses Feld ist ein Pflichtfeld.", "required"],
                [{ type: "array", uniqueItems: true }, [1, 1], "Alle Eintr\u00e4ge m\u00fcssen eindeutig sein.", "uniqueItems"],
                [{ type: "string", ui: { format: "email" } }, "nope", "Bitte geben Sie eine g\u00fcltige E-Mail-Adresse ein.", "email"]
            ].forEach(function (testCase) {
                assert.strictEqual(
                    pipeline.assembleAndExecute(testCase[0], testCase[1]).errorMessage,
                    testCase[2],
                    "messagebundle_de.properties supplies the German text for " + testCase[3]
                );
            });

            assert.strictEqual(
                PayloadValidator.validateTree({ type: "array", items: { type: "string", minLength: 3 } }, ["ab"]).errorMessage,
                "Zeile 1: Die Mindestl\u00e4nge betr\u00e4gt 3 Zeichen.",
                "the row frame is translated too, so a nested message is German end to end"
            );
        } finally {
            Localization.setLanguage(originalLanguage);
        }

        assert.strictEqual(
            pipeline.assembleAndExecute({ type: "string", maxLength: 3 }, "abcd").errorMessage,
            "Maximum length is 3 characters.",
            "restoring the session locale restores the English text, so the bundle follows the locale instead of latching"
        );
    });

    QUnit.test("i18n: the message bundles are packaged in dist and agree with one another", function (assert) {
        var done = assert.async();
        var base = sap.ui.require.toUrl("nz/co/siliconst/ui5/metaui/");
        var urls = [
            base + "messagebundle.properties",
            base + "messagebundle_en.properties",
            base + "messagebundle_de.properties",
            base + "manifest.json"
        ];
        var statuses = [];

        Promise.all(urls.map(function (url) {
            return window.fetch(url).then(function (response) {
                statuses.push(response.status);
                return response.text();
            });
        })).then(function (bodies) {
            var raw = parseProperties(bodies[0]);
            var en = parseProperties(bodies[1]);
            var de = parseProperties(bodies[2]);
            var manifest = JSON.parse(bodies[3]);
            var rawKeys = Object.keys(raw.texts);

            var enDrift = rawKeys.filter(function (key) {
                return en.texts[key] !== raw.texts[key];
            });
            var deMissing = rawKeys.filter(function (key) {
                return de.texts[key] === undefined;
            });
            var deUntranslated = rawKeys.filter(function (key) {
                return de.texts[key] === raw.texts[key];
            });

            assert.deepEqual(
                statuses,
                [200, 200, 200, 200],
                "both locale bundles, the raw bundle and the generated manifest are served from the built library folder"
            );
            assert.deepEqual(
                rawKeys.slice().sort(),
                I18n.getDeclaredKeys().slice().sort(),
                "messagebundle.properties declares exactly the keys TEXT_KEY can emit - no orphans, no gaps"
            );
            assert.deepEqual(
                enDrift,
                [],
                "messagebundle_en.properties carries the same text as the raw bundle for every key"
            );
            assert.deepEqual(
                deMissing,
                [],
                "messagebundle_de.properties covers every key, so no German user falls back to English mid-form"
            );
            assert.deepEqual(
                deUntranslated,
                ["metaui.validation.field", "metaui.nested.object.label"],
                "the only texts identical in German are the bare placeholder frame and the word 'Details', " +
                    "which German spells the same way; every other text is actually translated"
            );
            assert.deepEqual(
                manifest["sap.ui5"].library.i18n.supportedLocales,
                ["", "de", "en"],
                "the generated manifest lists exactly the shipped locales, so UI5 requests no bundle that would 404"
            );
            assert.deepEqual(
                raw.keysWithoutTextType,
                [],
                "every key carries a SAP text-type comment (#XMSG) on the line above, which is the context a translator works from"
            );
            done();
        });
    });

    // ------------------------------------------------------------------------------------------
    // Internationalisation: control, action and data source plugins
    //
    // The validators above were internationalised first; these blocks cover the rest of the text a
    // person filling in a form can read - field parse errors, button captions, dialog titles,
    // placeholder defaults, empty states and image alternative texts. Developer diagnostics
    // (Logger output, "REFUSED ..." URL-policy warnings, schema-configuration errors addressed to
    // whoever wrote the schema) are deliberately NOT in the bundle and stay English.
    //
    // The English column of the tables below is the byte-for-byte wording these plugins emitted
    // before the bundle existed, so any drift in it is a visible change for an English user. The
    // tables are written inline rather than shared between the two tests because the static
    // assertion counter in scripts/run-tests.js resolves a forEach target only when it is an array
    // literal; a shared variable would be counted as one iteration and trip the metrics gate.
    //
    // A field label supplied by the schema is caller data, not library text, so it is substituted
    // into the sentence untranslated: "Edit Address" becomes "Address bearbeiten" in German. The
    // library's own words are translated and reordered around the caller's word, which is exactly
    // what a concatenation could not do.
    // ------------------------------------------------------------------------------------------

    /**
     * English string literals that must no longer appear in the plugin TypeScript sources, keyed by the
     * source file that used to hold them. The sources are fetched from the built library folder, which
     * ships the same .ts files as the npm package, so this asserts against what consumers actually get.
     */
    var RETIRED_LITERALS = {
        "plugins/controls/DatePlugin.ts": ["\"Please enter a valid date.\""],
        "plugins/controls/TimePlugin.ts": ["\"Please enter a valid time.\""],
        "plugins/controls/DateTimePlugin.ts": ["\"Please enter a valid date and time.\""],
        "plugins/controls/NumberPlugin.ts": ["\"Please enter a valid number.\"", "\"Please enter a valid whole number.\""],
        "plugins/controls/DictionaryMapPlugin.ts": [
            "\"Dictionary\"", "\"Add Entry\"", "\"No entries defined.\"", "\"Dictionary contains empty or duplicate keys.\""
        ],
        "plugins/controls/FileUploaderPlugin.ts": [
            "\"No file uploaded\"", "\"Uploaded Image\"", "\"Choose a file...\"", "\"Browse...\""
        ],
        "plugins/controls/CameraPlugin.ts": ["\"Image\""],
        "plugins/controls/SignaturePlugin.ts": ["\"Signature\""],
        "plugins/controls/GeolocationPlugin.ts": ["Lat: ${"],
        "plugins/controls/MultiInputPlugin.ts": ["\"Type a value and press Enter\""],
        "plugins/controls/PasswordPlugin.ts": ["\"Enter password\""],
        "plugins/controls/TextLikeInputPlugin.ts": ["\"Expand Editor\"", "\"Edit\"", "\"Close\""],
        "plugins/controls/NestedDialogPlugin.ts": ["Edit ${label}", "View ${label}"],
        "plugins/controls/ArrayPlugin.ts": ["\"Items\"", "\"Invalid nested array\""],
        "plugins/controls/ObjectPlugin.ts": ["\"Details\"", "\"Object Details\"", "\"Invalid nested object\""],
        "plugins/controls/ReferencePlugin.ts": ["\"Referenced Entity\"", "\"Invalid referenced entity\""],
        "plugins/controls/PolymorphicPlugin.ts": ["\"Invalid value\""],
        "plugins/actions/ClearFormActionPlugin.ts": ["\"Clear Form\""],
        "plugins/actions/SubmitFormActionPlugin.ts": ["\"Submit\""],
        "plugins/actions/UrlNavigationActionPlugin.ts": ["\"Open Link\""],
        "plugins/datasources/LiveSearchPlugin.ts": ["\"Type to search...\""],
        "plugins/datasources/ODataListBindingPlugin.ts": ["\"Select...\""],
        "plugins/datasources/RemoteValueHelpPlugin.ts": ["\"Select a value...\"", "\"Select Value\""]
    };

    /**
     * Renders one registered plugin against a throwaway JSONModel, the way DynamicHost drives it, and
     * returns { control, plugin, model } so the caption a user would read can be asserted.
     */
    function renderI18nPlugin(type, widget, metadata, bindingPath, data, editable) {
        var plugin = PluginRegistry.getInstance().getPlugin(type, widget);
        var model = new JSONModel(data);
        if (editable === false) {
            plugin.setEditable(false);
        }
        var scope = "i18nScope_" + type + "_" + (widget || "default") + "_" + (editable === false ? "ro" : "rw");
        var control = plugin.render(metadata, bindingPath, "meta", scope);
        control.setModel(model, "meta");
        return { control: control, plugin: plugin, model: model };
    }

    /** Destroys everything renderI18nPlugin created, so one case cannot leak a control id into the next. */
    function disposeI18nPlugin(rendered) {
        rendered.plugin.destroy();
        rendered.model.destroy();
    }

    QUnit.module("i18n: Control, Action and Data Source Texts");

    QUnit.test("i18n: every control, action and datasource text keeps its exact English wording", function (assert) {
        [
            [TEXT_KEY.dateParseError, "Please enter a valid date."],
            [TEXT_KEY.timeParseError, "Please enter a valid time."],
            [TEXT_KEY.dateTimeParseError, "Please enter a valid date and time."],
            [TEXT_KEY.numberParseError, "Please enter a valid number."],
            [TEXT_KEY.integerParseError, "Please enter a valid whole number."],
            [TEXT_KEY.dictionaryLabel, "Dictionary"],
            [TEXT_KEY.dictionaryAddEntry, "Add Entry"],
            [TEXT_KEY.dictionaryEmpty, "No entries defined."],
            [TEXT_KEY.dictionaryInvalidKeys, "Dictionary contains empty or duplicate keys."],
            [TEXT_KEY.fileUploadNoFile, "No file uploaded"],
            [TEXT_KEY.fileUploadImageAlt, "Uploaded Image"],
            [TEXT_KEY.fileUploadPlaceholder, "Choose a file..."],
            [TEXT_KEY.fileUploadBrowse, "Browse..."],
            [TEXT_KEY.hardwareImageAlt, "Image"],
            [TEXT_KEY.hardwareSignatureAlt, "Signature"],
            [TEXT_KEY.geolocationCoordinates, "Lat: -36.8485, Lng: 174.7633", ["-36.8485", "174.7633"]],
            [TEXT_KEY.multiInputPlaceholder, "Type a value and press Enter"],
            [TEXT_KEY.passwordPlaceholder, "Enter password"],
            [TEXT_KEY.editorExpand, "Expand Editor"],
            [TEXT_KEY.editorDialogTitle, "Edit"],
            [TEXT_KEY.editorClose, "Close"],
            [TEXT_KEY.nestedEdit, "Edit Address", ["Address"]],
            [TEXT_KEY.nestedView, "View Address", ["Address"]],
            [TEXT_KEY.nestedViewSummary, "View Address (3)", ["Address", 3]],
            [TEXT_KEY.nestedArrayLabel, "Items"],
            [TEXT_KEY.nestedArrayInvalid, "Invalid nested array"],
            [TEXT_KEY.nestedObjectLabel, "Details"],
            [TEXT_KEY.nestedObjectTitle, "Object Details"],
            [TEXT_KEY.nestedObjectInvalid, "Invalid nested object"],
            [TEXT_KEY.nestedReferenceLabel, "Referenced Entity"],
            [TEXT_KEY.nestedReferenceInvalid, "Invalid referenced entity"],
            [TEXT_KEY.actionClearForm, "Clear Form"],
            [TEXT_KEY.actionSubmit, "Submit"],
            [TEXT_KEY.actionOpenLink, "Open Link"],
            [TEXT_KEY.dataSourceSearchPlaceholder, "Type to search..."],
            [TEXT_KEY.dataSourceSelectPlaceholder, "Select..."],
            [TEXT_KEY.dataSourceValueHelpPlaceholder, "Select a value..."],
            [TEXT_KEY.dataSourceValueHelpTitle, "Select Value"]
        ].forEach(function (testCase) {
            assert.strictEqual(I18n.hasText(testCase[0]), true, "'" + testCase[0] + "' resolves in the shipped bundle");
            assert.strictEqual(
                I18n.getText(testCase[0], testCase[2]),
                testCase[1],
                "English wording is byte-identical to the pre-i18n literal for '" + testCase[0] + "'"
            );
        });
    });

    QUnit.test("i18n: plugins read their captions from the bundle rather than a TypeScript copy", function (assert) {
        var done = assert.async();

        [
            ["string", "clearButton", {}, "/Act", {}, "getText", "Clear Form"],
            ["string", "submitButton", {}, "/Act", {}, "getText", "Submit"],
            ["string", "urlButton", {}, "/Act", {}, "getText", "Open Link"],
            ["string", "password", {}, "/Secret", {}, "getPlaceholder", "Enter password"],
            ["string", "odataSelect", {}, "/Odata", {}, "getPlaceholder", "Select..."],
            ["string", "liveSearch", {}, "/Search", {}, "getPlaceholder", "Type to search..."],
            ["string", "valueHelp", {}, "/Help", {}, "getPlaceholder", "Select a value..."],
            ["array", "multiInput", { items: { type: "string" } }, "/Tags", { Tags: [] }, "getPlaceholder",
                "Type a value and press Enter"]
        ].forEach(function (testCase) {
            var metadata = Object.assign({ type: testCase[0], ui: { widget: testCase[1] } }, testCase[2]);
            var rendered = renderI18nPlugin(testCase[0], testCase[1], metadata, testCase[3], testCase[4], true);
            var target = rendered.plugin.mainControl || rendered.control;
            assert.strictEqual(target[testCase[5]](), testCase[6], testCase[1] + " renders the bundle text '" + testCase[6] + "'");
            disposeI18nPlugin(rendered);
        });

        var dict = renderI18nPlugin(
            "object",
            "dictionaryMap",
            { type: "object", additionalProperties: { type: "string" }, ui: { widget: "dictionaryMap" } },
            "/Map",
            { Map: {} },
            true
        );
        assert.strictEqual(
            dict.control.getItems()[0].getItems()[1].getText(),
            "Add Entry",
            "DictionaryMapPlugin reads its add button caption from the bundle"
        );
        disposeI18nPlugin(dict);

        // The nested dialog trigger is the case concatenation cannot express: the label sits inside the
        // sentence as {0}, so a language that orders the two parts differently can still render it.
        var objEdit = renderI18nPlugin("object", undefined, { type: "object", properties: {} }, "/Address", { Address: {} }, true);
        assert.strictEqual(objEdit.control.getText(), "Edit Details", "ObjectPlugin fills {0} of 'Edit {0}' with its default label");
        disposeI18nPlugin(objEdit);

        var objView = renderI18nPlugin("object", undefined, { type: "object", properties: {} }, "/Address", { Address: {} }, false);
        assert.strictEqual(objView.control.getText(), "View Details", "ObjectPlugin in display mode renders 'View {0}'");
        disposeI18nPlugin(objView);

        var arrView = renderI18nPlugin(
            "array",
            undefined,
            { type: "array", items: { type: "string" } },
            "/Tags",
            { Tags: ["a", "b", "c"] },
            false
        );
        assert.strictEqual(arrView.control.getText(), "View Items (3)", "ArrayPlugin renders 'View {0} ({1})' with label and count");
        disposeI18nPlugin(arrView);

        // No English copy of any of these sentences may survive in the shipped TypeScript.
        var base = sap.ui.require.toUrl("nz/co/siliconst/ui5/metaui/");
        var files = Object.keys(RETIRED_LITERALS);
        Promise.all(files.map(function (file) {
            return window.fetch(base + file).then(function (response) {
                return response.ok ? response.text() : "";
            });
        })).then(function (sources) {
            var survivors = [];
            var unreadable = [];
            files.forEach(function (file, i) {
                if (sources[i] === "") {
                    unreadable.push(file);
                    return;
                }
                RETIRED_LITERALS[file].forEach(function (literal) {
                    if (sources[i].indexOf(literal) !== -1) {
                        survivors.push(file + " still contains " + literal);
                    }
                });
            });
            assert.deepEqual(unreadable, [], "every internationalised plugin source is served from the built library folder");
            assert.deepEqual(survivors, [], "no plugin source keeps an English copy of a text that now lives in the bundle");
            done();
        });
    });

    QUnit.test("i18n: a German session locale renders the control, action and datasource texts in German", function (assert) {
        var originalLanguage = Localization.getLanguage();

        try {
            Localization.setLanguage("de");

            [
                [TEXT_KEY.dateParseError, "Bitte geben Sie ein gültiges Datum ein."],
                [TEXT_KEY.timeParseError, "Bitte geben Sie eine gültige Uhrzeit ein."],
                [TEXT_KEY.dateTimeParseError, "Bitte geben Sie ein gültiges Datum mit Uhrzeit ein."],
                [TEXT_KEY.numberParseError, "Bitte geben Sie eine gültige Zahl ein."],
                [TEXT_KEY.integerParseError, "Bitte geben Sie eine gültige ganze Zahl ein."],
                [TEXT_KEY.dictionaryLabel, "Zuordnung"],
                [TEXT_KEY.dictionaryAddEntry, "Eintrag hinzufügen"],
                [TEXT_KEY.dictionaryEmpty, "Keine Einträge vorhanden."],
                [TEXT_KEY.dictionaryInvalidKeys, "Die Zuordnung enthält leere oder doppelte Schlüssel."],
                [TEXT_KEY.fileUploadNoFile, "Keine Datei hochgeladen"],
                [TEXT_KEY.fileUploadImageAlt, "Hochgeladenes Bild"],
                [TEXT_KEY.fileUploadPlaceholder, "Datei auswählen ..."],
                [TEXT_KEY.fileUploadBrowse, "Durchsuchen ..."],
                [TEXT_KEY.hardwareImageAlt, "Bild"],
                [TEXT_KEY.hardwareSignatureAlt, "Unterschrift"],
                [TEXT_KEY.geolocationCoordinates, "Breite: -36.8485, Länge: 174.7633", ["-36.8485", "174.7633"]],
                [TEXT_KEY.multiInputPlaceholder, "Wert eingeben und Eingabetaste drücken"],
                [TEXT_KEY.passwordPlaceholder, "Kennwort eingeben"],
                [TEXT_KEY.editorExpand, "Editor vergrößern"],
                [TEXT_KEY.editorDialogTitle, "Bearbeiten"],
                [TEXT_KEY.editorClose, "Schließen"],
                [TEXT_KEY.nestedEdit, "Address bearbeiten", ["Address"]],
                [TEXT_KEY.nestedView, "Address anzeigen", ["Address"]],
                [TEXT_KEY.nestedViewSummary, "Address anzeigen (3)", ["Address", 3]],
                [TEXT_KEY.nestedArrayLabel, "Einträge"],
                [TEXT_KEY.nestedArrayInvalid, "Ungültige verschachtelte Liste"],
                [TEXT_KEY.nestedObjectLabel, "Details"],
                [TEXT_KEY.nestedObjectTitle, "Objektdetails"],
                [TEXT_KEY.nestedObjectInvalid, "Ungültiges verschachteltes Objekt"],
                [TEXT_KEY.nestedReferenceLabel, "Referenzierte Entität"],
                [TEXT_KEY.nestedReferenceInvalid, "Ungültige referenzierte Entität"],
                [TEXT_KEY.actionClearForm, "Formular leeren"],
                [TEXT_KEY.actionSubmit, "Senden"],
                [TEXT_KEY.actionOpenLink, "Link öffnen"],
                [TEXT_KEY.dataSourceSearchPlaceholder, "Zum Suchen tippen ..."],
                [TEXT_KEY.dataSourceSelectPlaceholder, "Auswählen ..."],
                [TEXT_KEY.dataSourceValueHelpPlaceholder, "Wert auswählen ..."],
                [TEXT_KEY.dataSourceValueHelpTitle, "Wert auswählen"]
            ].forEach(function (testCase) {
                assert.strictEqual(
                    I18n.getText(testCase[0], testCase[2]),
                    testCase[1],
                    "messagebundle_de.properties supplies the German text for '" + testCase[0] + "'"
                );
            });

            var objEdit = renderI18nPlugin("object", undefined, { type: "object", properties: {} }, "/Address", { Address: {} }, true);
            assert.strictEqual(
                objEdit.control.getText(),
                "Details bearbeiten",
                "the nested trigger is German end to end, with the verb after the label - which concatenation could not produce"
            );
            disposeI18nPlugin(objEdit);

            var arrView = renderI18nPlugin(
                "array",
                undefined,
                { type: "array", items: { type: "string" } },
                "/Tags",
                { Tags: ["a", "b"] },
                false
            );
            assert.strictEqual(
                arrView.control.getText(),
                "Einträge anzeigen (2)",
                "both placeholders of 'View {0} ({1})' survive the reordering German applies to them"
            );
            disposeI18nPlugin(arrView);
        } finally {
            Localization.setLanguage(originalLanguage);
        }

        var english = renderI18nPlugin("string", "clearButton", { type: "string", ui: { widget: "clearButton" } }, "/Act", {}, true);
        assert.strictEqual(
            english.control.getText(),
            "Clear Form",
            "restoring the session locale restores the English caption, so the bundle follows the locale instead of latching"
        );
        disposeI18nPlugin(english);
    });
});
