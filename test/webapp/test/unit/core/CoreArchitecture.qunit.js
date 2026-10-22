sap.ui.define([
    "metaui/sandbox/test/TestOracle",
    "nz/co/siliconst/ui5/metaui/core/Registry",
    "nz/co/siliconst/ui5/metaui/core/PluginRegistry",
    "nz/co/siliconst/ui5/metaui/core/SchemaNormalizer",
    "nz/co/siliconst/ui5/metaui/core/DataInferenceBuilder",
    "nz/co/siliconst/ui5/metaui/core/SchemaValidator",
    "nz/co/siliconst/ui5/metaui/core/PayloadValidator",
    "nz/co/siliconst/ui5/metaui/core/StateManager",
    "nz/co/siliconst/ui5/metaui/core/LayoutScorer",
    "nz/co/siliconst/ui5/metaui/core/LayoutMutator",
    "nz/co/siliconst/ui5/metaui/core/DefaultLayoutGenerator",
    "nz/co/siliconst/ui5/metaui/core/PolicyEngine",
    "nz/co/siliconst/ui5/metaui/utils/ExpressionBuilder",
    "nz/co/siliconst/ui5/metaui/openapi/OpenApiBuilder",
    "nz/co/siliconst/ui5/metaui/openapi/OpenApiParserFactory",
    "nz/co/siliconst/ui5/metaui/openapi/OpenApiRefResolver",
    "nz/co/siliconst/ui5/metaui/openapi/parsers/OpenApiConstraintMapper",
    "nz/co/siliconst/ui5/metaui/core/SchemaDirectiveNormalizer",
    "nz/co/siliconst/ui5/metaui/core/ValidationLedger",
    "nz/co/siliconst/ui5/metaui/core/SandboxJSONModel",
    "nz/co/siliconst/ui5/metaui/controls/host/delegates/DataSyncDelegate",
    "nz/co/siliconst/ui5/metaui/controls/host/delegates/ODataDelegate",
    "nz/co/siliconst/ui5/metaui/controls/DynamicHost",
    "nz/co/siliconst/ui5/metaui/plugins/controls/BasePlugin",
    "nz/co/siliconst/ui5/metaui/layouts/FormLayout",
    "nz/co/siliconst/ui5/metaui/layouts/CompactLayout",
    "nz/co/siliconst/ui5/metaui/layouts/TableLayout",
    "nz/co/siliconst/ui5/metaui/layouts/WizardLayout",
    "nz/co/siliconst/ui5/metaui/core/Engine",
    "nz/co/siliconst/ui5/metaui/swagger/OpenApiExtractor",
    "nz/co/siliconst/ui5/metaui/controls/host/HostControlMetadata",
    "nz/co/siliconst/ui5/metaui/utils/Logger"
], function (
    TestOracle,
    RegistryMod,
    PluginRegistryMod,
    SchemaNormalizerMod,
    DataInferenceBuilderMod,
    SchemaValidatorMod,
    PayloadValidatorMod,
    StateManagerMod,
    LayoutScorerMod,
    LayoutMutatorMod,
    DefaultLayoutGeneratorMod,
    PolicyEngineMod,
    ExpressionBuilderMod,
    OpenApiBuilderMod,
    OpenApiParserFactoryMod,
    OpenApiRefResolverMod,
    OpenApiConstraintMapperMod,
    SchemaDirectiveNormalizerMod,
    ValidationLedgerMod,
    SandboxJSONModelMod,
    DataSyncDelegateMod,
    ODataDelegateMod,
    DynamicHostMod,
    BasePluginMod,
    FormLayoutMod,
    CompactLayoutMod,
    TableLayoutMod,
    WizardLayoutMod,
    EngineMod,
    OpenApiExtractorMod,
    HostControlMetadataMod,
    LoggerMod
) {
    "use strict";

    var Registry = RegistryMod.Registry;
    var PluginRegistry = PluginRegistryMod.PluginRegistry;
    var SchemaNormalizer = SchemaNormalizerMod.SchemaNormalizer;
    var DataInferenceBuilder = DataInferenceBuilderMod.DataInferenceBuilder;
    var SchemaValidator = SchemaValidatorMod.SchemaValidator;
    var PayloadValidator = PayloadValidatorMod.PayloadValidator;
    var StateManager = StateManagerMod.StateManager;
    var LayoutScorer = LayoutScorerMod.LayoutScorer;
    var LayoutMutator = LayoutMutatorMod.LayoutMutator;
    var DefaultLayoutGenerator = DefaultLayoutGeneratorMod.DefaultLayoutGenerator;
    var PolicyEngine = PolicyEngineMod.PolicyEngine;
    var ExpressionBuilder = ExpressionBuilderMod.ExpressionBuilder;
    var OpenApiBuilder = OpenApiBuilderMod.OpenApiBuilder;
    var OpenApiParserFactory = OpenApiParserFactoryMod.OpenApiParserFactory;
    var OpenApiRefResolver = OpenApiRefResolverMod.OpenApiRefResolver;
    var OpenApiConstraintMapper = OpenApiConstraintMapperMod.OpenApiConstraintMapper;
    var SchemaDirectiveNormalizer = SchemaDirectiveNormalizerMod.SchemaDirectiveNormalizer;
    var ValidationLedger = ValidationLedgerMod.ValidationLedger;
    var SandboxJSONModel = SandboxJSONModelMod.default || SandboxJSONModelMod.SandboxJSONModel || SandboxJSONModelMod;
    var DataSyncDelegate = DataSyncDelegateMod.DataSyncDelegate;
    var ODataDelegate = ODataDelegateMod.ODataDelegate;
    var DynamicHost = DynamicHostMod.default || DynamicHostMod.DynamicHost || DynamicHostMod;
    var BasePlugin = BasePluginMod.BasePlugin;
    var FormLayout = FormLayoutMod.FormLayout;
    var CompactLayout = CompactLayoutMod.CompactLayout;
    var TableLayout = TableLayoutMod.TableLayout;
    var WizardLayout = WizardLayoutMod.WizardLayout;
    var Engine = EngineMod.Engine;
    var OpenApiExtractor = OpenApiExtractorMod.default || OpenApiExtractorMod.OpenApiExtractor || OpenApiExtractorMod;
    var extractConstructorJsonLiterals = HostControlMetadataMod.extractConstructorJsonLiterals;
    var Logger = LoggerMod.Logger;

    QUnit.module("Core Architecture: Registry & Double-Entry Verification");

    QUnit.test("Generic Registry<T> enforces registration, retrieval, existence, and clear contracts", function (assert) {
        var reg = new Registry();
        assert.strictEqual(reg.has("alpha"), false, "Initially empty");
        reg.register("alpha", { id: 101 });
        assert.strictEqual(reg.has("alpha"), true, "Key 'alpha' registered");
        assert.deepEqual(reg.get("alpha"), { id: 101 }, "Exact object retrieved");
        assert.strictEqual(reg.items.size, 1, "ReadonlyMap exposes registered items");
        reg.clear();
        assert.strictEqual(reg.has("alpha"), false, "Cleared registry removes entries");
    });

    QUnit.test("Double-Entry Rule: PluginRegistry 100% matches TestOracle.PLUGIN_MAP, LAYOUT_MAP, and POLICY_MAPs", function (assert) {
        var done = assert.async();
        var registry = PluginRegistry.getInstance();
        var oracleKeys = Object.keys(TestOracle.PLUGIN_MAP);

        assert.strictEqual(
            registry.fieldIndex.getKeys().length,
            oracleKeys.length,
            "PluginRegistry fieldIndex count matches TestOracle.PLUGIN_MAP count (" + oracleKeys.length + ")"
        );

        oracleKeys.forEach(function (key) {
            assert.strictEqual(
                registry.fieldIndex.get(key),
                TestOracle.PLUGIN_MAP[key].modulePath,
                "Exact modulePath match for '" + key + "'"
            );
        });

        Object.keys(TestOracle.LAYOUT_MAP).forEach(function (layoutKey) {
            assert.strictEqual(
                registry.layoutIndex.get(layoutKey),
                TestOracle.LAYOUT_MAP[layoutKey],
                "Exact layout modulePath match for '" + layoutKey + "'"
            );
        });

        Object.keys(TestOracle.POLICY_CONDITION_MAP).forEach(function (condKey) {
            assert.strictEqual(
                registry.policyConditionIndex.get(condKey),
                TestOracle.POLICY_CONDITION_MAP[condKey],
                "Exact policy condition modulePath match for '" + condKey + "'"
            );
        });

        Object.keys(TestOracle.POLICY_EFFECT_MAP).forEach(function (effKey) {
            assert.strictEqual(
                registry.policyEffectIndex.get(effKey),
                TestOracle.POLICY_EFFECT_MAP[effKey],
                "Exact policy effect modulePath match for '" + effKey + "'"
            );
        });

        // Build a synthetic schema referencing every oracle key to verify preloadDependencies
        var props = {};
        oracleKeys.forEach(function (key, idx) {
            props["Field_" + idx] = JSON.parse(JSON.stringify(TestOracle.PLUGIN_MAP[key].sampleMeta));
        });
        var syntheticSchema = SchemaNormalizer.normalize({
            type: "object",
            layoutStrategy: "form",
            properties: props,
            uiPolicies: [
                { effect: "Show", targets: ["/Field_0"], condition: { StringEquals: { "/Field_0": "A" } } },
                { effect: "Invalidate", targets: ["/Field_1"], condition: { NumericLessThan: { "/Field_1": 5 } } },
                { effect: "Require", targets: ["/Field_2"], condition: { NumericGreaterThan: { "/Field_2": 10 } } },
                { effect: "Disable", targets: ["/Field_3"], condition: { IsNull: "/Field_3" } },
                { effect: "Enable", targets: ["/Field_4"], condition: { IsNotNull: "/Field_4" } },
                { effect: "Validate", targets: ["/Field_0"], condition: { DateLessThan: { "/Field_0": "2026-01-01" } } }
            ]
        });

        registry.preloadDependencies(syntheticSchema).then(function () {
            oracleKeys.forEach(function (key) {
                var parts = key.split(":");
                var instanceA = registry.getPlugin(parts[0], parts[1]);
                var instanceB = registry.getPlugin(parts[0], parts[1]);
                assert.strictEqual(instanceA instanceof BasePlugin, true, "Plugin '" + key + "' inherits from BasePlugin");
                assert.notStrictEqual(instanceA, instanceB, "PluginRegistry returns isolated instances for '" + key + "'");
                instanceA.destroy();
                instanceB.destroy();
            });
            done();
        });
    });

    QUnit.module("Core Architecture: SchemaNormalizer, DataInferenceBuilder & Validators");

    QUnit.test("SchemaNormalizer is pure, idempotent, and supports Full and Hybrid Inference", function (assert) {
        var rawInput = {
            title: "Invoice",
            type: "object",
            required: ["InvoiceNo"],
            additionalProperties: true,
            properties: {
                InvoiceNo: { type: "string", minLength: 3, maxLength: 12 },
                Amount: { type: "number", minimum: 0, maximum: 10000, multipleOf: 0.5 }
            }
        };
        var rawSnapshot = JSON.stringify(rawInput);
        var dataPayload = {
            InvoiceNo: "INV-100",
            Amount: 250.5,
            InferredFlag: true,
            InferredDate: "2026-10-21",
            InferredTags: ["urgent", "paid"]
        };

        var normalizedOnce = SchemaNormalizer.normalize(rawInput, dataPayload);
        assert.strictEqual(JSON.stringify(rawInput), rawSnapshot, "Raw input schema was not mutated");
        assert.strictEqual(normalizedOnce.properties.InvoiceNo.required, true, "Required array flag normalized onto property");
        assert.strictEqual(normalizedOnce.properties.InferredFlag.type, "boolean", "Hybrid inference added boolean property");
        assert.strictEqual(normalizedOnce.properties.InferredDate.type, "date", "Hybrid inference detected ISO date string");
        assert.strictEqual(normalizedOnce.properties.InferredTags.type, "array", "Hybrid inference detected string array");
        assert.strictEqual(normalizedOnce.properties.InferredTags.ui.widget, "multiInput", "Primitive array defaults to multiInput widget");

        var normalizedTwice = SchemaNormalizer.normalize(normalizedOnce, dataPayload);
        assert.deepEqual(normalizedTwice, normalizedOnce, "SchemaNormalizer is strictly idempotent");

        var fullInferred = DataInferenceBuilder.inferSchemaFromData({
            Username: "alice",
            Score: 95,
            Active: true,
            Created: "2026-05-01"
        });
        assert.strictEqual(fullInferred.properties.Username.type, "string", "Full inference string");
        assert.strictEqual(fullInferred.properties.Score.type, "number", "Full inference number");
        assert.strictEqual(fullInferred.properties.Active.type, "boolean", "Full inference boolean");
        assert.strictEqual(fullInferred.properties.Created.type, "date", "Full inference date");

        // Draft-07 / 2020-12 type arrays and $defs support
        var draft2020 = SchemaNormalizer.normalize({
            type: "object",
            $defs: {
                TagItem: { type: "object", properties: { Code: { type: "string" } } }
            },
            properties: {
                NullableRate: { type: ["number", "null"], description: "Tax rate tooltip" }
            }
        });
        assert.strictEqual(draft2020.properties.NullableRate.type, "number", "Draft-07/2020-12 type array ['number', 'null'] resolves to 'number'");
        assert.strictEqual(draft2020.properties.NullableRate.nullable, true, "Draft-07/2020-12 type array ['number', 'null'] sets nullable=true");
        assert.strictEqual(draft2020.properties.NullableRate.description, "Tax rate tooltip", "SchemaNormalizer preserves property description");
        assert.strictEqual(!!draft2020.definitions.TagItem, true, "Draft 2020-12 $defs normalized into schema.definitions");
    });

    QUnit.test("SchemaValidator, PayloadValidator, StateManager, ExpressionBuilder & Layout Scorer/Mutator", function (assert) {
        var validSchema = SchemaNormalizer.normalize({
            type: "object",
            properties: {
                Price: { type: "number", minimum: 10, maximum: 100 },
                Quantity: { type: "integer", minimum: 1 },
                Notes: { type: "string", visibleOn: "$root.Price > 50" },
                Shipping: {
                    type: "object",
                    properties: {
                        City: { type: "string" }
                    }
                }
            }
        });

        assert.strictEqual(SchemaValidator.validateSchemaStructure(validSchema).length, 0, "Valid schema has 0 structural errors");

        var defaultGenerated = DefaultLayoutGenerator.ensureLayout(validSchema);
        assert.strictEqual(defaultGenerated, true, "DefaultLayoutGenerator synthesized default uiLayout");
        assert.strictEqual(validSchema.uiLayout.length, 1, "Root Group layout container generated");
        assert.strictEqual(validSchema.uiLayout[0].label, undefined, "Synthesized root Group has undefined label to prevent duplicating schema.title");
        assert.strictEqual(validSchema.uiLayout[0].elements.length, 4, "Four layout controls generated inside root Group");

        LayoutScorer.apply(validSchema, 50);
        LayoutMutator.apply(validSchema);
        assert.strictEqual(
            validSchema.uiLayout[0].elements.some(function (el) { return el.type === "Group"; }),
            true,
            "LayoutMutator expanded inline nested object Control into a Group"
        );

        var expr = ExpressionBuilder.build("$root.Price > 50 && Quantity >= 2", "/Item/Notes", "meta");
        assert.strictEqual(expr, "{= ${meta>/Price} > 50 && ${meta>/Item/Quantity} >= 2 }", "ExpressionBuilder resolves absolute and relative paths");
        var quotedExpr = ExpressionBuilder.build("$root.Status === 'Active $root.Price'", "/Item/Notes", "meta");
        assert.strictEqual(quotedExpr, "{= ${meta>/Status} === 'Active $root.Price' }", "ExpressionBuilder preserves single-quoted string literals without corrupting inner identifiers");

        var callerInitial = { Price: 75, Quantity: 2, Notes: "Bulk", Shipping: { City: "Auckland" } };
        var sm = new StateManager(callerInitial, validSchema);
        callerInitial.Price = 9999;
        callerInitial.Shipping.City = "MutatedInPlace";
        assert.strictEqual(sm.getProperty("Price"), 75, "StateManager deep-clones initialData so caller mutations do not leak in");
        assert.strictEqual(sm.getProperty("Shipping/City"), "Auckland", "StateManager deep-clones nested objects in initialData");
        sm.setProperty("Price", 90);
        var extracted = sm.extractPayload();
        assert.strictEqual(extracted.Price, 90, "StateManager extracts updated payload");
        extracted.Shipping.City = "MutatedAfterExtract";
        assert.strictEqual(sm.getProperty("Shipping/City"), "Auckland", "Extracted payload is deep-cloned and isolated from live StateManager");

        var horizSchema = SchemaNormalizer.normalize({
            type: "object",
            properties: {
                Nested: { type: "object", properties: { Code: { type: "string" } } }
            },
            uiLayout: [
                {
                    type: "HorizontalLayout",
                    elements: [{ type: "Control", scope: "#/properties/Nested" }]
                }
            ]
        });
        LayoutScorer.apply(horizSchema, 50);
        LayoutMutator.apply(horizSchema);
        assert.strictEqual(
            horizSchema.uiLayout[0].elements[0].type,
            "Group",
            "LayoutMutator expands inline object inside HorizontalLayout container"
        );

        var validTree = PayloadValidator.validateTree(validSchema, { Price: 50, Quantity: 3, Shipping: { City: "Auckland" } });
        assert.strictEqual(validTree.isValid, true, "PayloadValidator passes valid payload");
        var invalidTree = PayloadValidator.validateTree(validSchema, { Price: 5, Quantity: 3, Shipping: { City: "Auckland" } });
        assert.strictEqual(invalidTree.isValid, false, "PayloadValidator catches out-of-range Price");
        assert.strictEqual(
            PayloadValidator.validateTree({ type: "string", const: "FIXED" }, "WRONG").isValid,
            false,
            "PayloadValidator enforces const constraint"
        );
        assert.strictEqual(
            PayloadValidator.validateTree({ type: "string", enum: ["A", "B"] }, "C").isValid,
            false,
            "PayloadValidator enforces enum constraint"
        );
        assert.strictEqual(
            PayloadValidator.validateTree({ type: "object", minProperties: 2 }, { onlyOne: 1 }).isValid,
            false,
            "PayloadValidator enforces minProperties constraint"
        );
        sm.destroy();
    });

    QUnit.test("PolicyEngine evaluates all 6 Condition Plugins and applies all 8 Effect Actions", function (assert) {
        var policies = [
            { effect: "Show", targets: ["/SecretField"], condition: { StringEquals: { "/Role": "Admin" } } },
            { effect: "Hide", targets: ["/PublicNote"], condition: { StringEquals: { "/Role": "Admin" } } },
            { effect: "Require", targets: ["/TaxId"], condition: { NumericGreaterThan: { "/Amount": 1000 } } },
            { effect: "Optional", targets: ["/BackupPhone"], condition: { IsNotNull: "/PrimaryPhone" } },
            { effect: "Invalidate", targets: ["/Age"], message: "Must be 18+", condition: { NumericLessThan: { "/Age": 18 } } },
            { effect: "Disable", targets: ["/Coupon"], condition: { IsNull: "/PromoCode" } },
            { effect: "Enable", targets: ["/ApplyBtn"], condition: { IsNotNull: "/PromoCode" } }
        ];

        var policyEngine = new PolicyEngine(policies);
        var deltas1 = policyEngine.evaluate({ Role: "Guest", Amount: 500, Age: 16, PromoCode: null, PrimaryPhone: null });

        var findDelta = function (deltas, target, prop) {
            return deltas.find(function (d) { return d.target === target && d.property === prop; });
        };

        assert.strictEqual(findDelta(deltas1, "/SecretField", "visibility").value, false, "Show policy hides target when StringEquals is false");
        assert.strictEqual(findDelta(deltas1, "/PublicNote", "visibility").value, true, "Hide policy shows target when StringEquals is false");
        assert.strictEqual(findDelta(deltas1, "/TaxId", "required").value, false, "Require policy marks optional when NumericGreaterThan is false");
        assert.strictEqual(findDelta(deltas1, "/BackupPhone", "required").value, true, "Optional policy marks required when condition is false (symmetrical reversal)");
        assert.strictEqual(findDelta(deltas1, "/Age", "validity").value, false, "Invalidate policy marks invalid when NumericLessThan is true");
        assert.strictEqual(findDelta(deltas1, "/Age", "validity").errorMessage, "Must be 18+", "Invalidate policy attaches message when NumericLessThan is true");
        assert.strictEqual(findDelta(deltas1, "/Coupon", "editable").value, false, "Disable policy disables target when IsNull is true");
        assert.strictEqual(findDelta(deltas1, "/ApplyBtn", "editable").value, false, "Enable policy disables target when IsNotNull is false");

        var deltas2 = policyEngine.evaluate({ Role: "Admin", Amount: 2500, Age: 25, PromoCode: "SAVE20", PrimaryPhone: "+6421000" });

        assert.strictEqual(findDelta(deltas2, "/SecretField", "visibility").value, true, "Show policy reveals target when StringEquals is true");
        assert.strictEqual(findDelta(deltas2, "/PublicNote", "visibility").value, false, "Hide policy hides target when StringEquals is true");
        assert.strictEqual(findDelta(deltas2, "/TaxId", "required").value, true, "Require policy requires target when NumericGreaterThan is true");
        assert.strictEqual(findDelta(deltas2, "/BackupPhone", "required").value, false, "Optional policy marks optional when condition is true");
        assert.strictEqual(findDelta(deltas2, "/Age", "validity").value, true, "Invalidate policy clears invalid state when NumericLessThan is false");
        assert.strictEqual(findDelta(deltas2, "/Coupon", "editable").value, true, "Disable policy re-enables target when IsNull is false");
        assert.strictEqual(findDelta(deltas2, "/ApplyBtn", "editable").value, true, "Enable policy enables target when IsNotNull is true");
        assert.strictEqual(findDelta(deltas1, "/SecretField", "required"), undefined, "Show policy does not emit unrelated required delta on /SecretField");
        assert.strictEqual(findDelta(deltas1, "/SecretField", "editable"), undefined, "Show policy does not emit unrelated editable delta on /SecretField");

        // Differential no-op on unchanged payload and reset() re-emission
        assert.strictEqual(policyEngine.evaluate({ Role: "Admin", Amount: 2500, Age: 25, PromoCode: "SAVE20", PrimaryPhone: "+6421000" }).length, 0, "PolicyEngine emits 0 deltas when state is unchanged");
        policyEngine.reset();
        assert.strictEqual(policyEngine.evaluate({ Role: "Admin", Amount: 2500, Age: 25, PromoCode: "SAVE20", PrimaryPhone: "+6421000" }).length, 7, "PolicyEngine.reset() clears differential cache and re-emits full deltas");

        // RFC 6901 tilde escaping (~1 -> /, ~0 -> ~), DateLessThan, multi-policy OR aggregation, and $row expansion + cleanup
        var rfcEngine = new PolicyEngine([
            { effect: "Show", targets: ["/EscapedTarget"], condition: { StringEquals: { "/a~1b~0c": "OK" } } },
            { effect: "Show", targets: ["/EscapedTarget"], condition: { StringEquals: { "/AltRole": "Admin" } } },
            { effect: "Invalidate", targets: ["/ExpiryDate"], message: "Date must be 2026+", condition: { DateLessThan: { "/ExpiryDate": "2026-01-01" } } },
            { effect: "Validate", targets: ["/CheckCode"], message: "Code must be VALID", condition: { StringEquals: { "/CheckCode": "VALID" } } },
            { effect: "Require", targets: ["/Items/$row/Code"], condition: { NumericGreaterThan: { "/Items/$row/Qty": 10 } } }
        ]);
        var rfcDeltas = rfcEngine.evaluate({
            "a/b~c": "OK",
            AltRole: "User",
            ExpiryDate: "2025-06-15",
            CheckCode: "BAD",
            Items: [{ Qty: 5 }, { Qty: 20 }]
        });
        assert.strictEqual(findDelta(rfcDeltas, "/EscapedTarget", "visibility").value, true, "PolicyEngine unescapes RFC 6901 ~1/~0 tokens and OR-aggregates multiple Show policies");
        assert.strictEqual(findDelta(rfcDeltas, "/ExpiryDate", "validity").value, false, "PolicyEngine evaluates DateLessThan condition plugin");
        assert.strictEqual(findDelta(rfcDeltas, "/CheckCode", "validity").value, false, "Validate policy marks invalid when condition is false");
        assert.strictEqual(findDelta(rfcDeltas, "/CheckCode", "validity").errorMessage, "Code must be VALID", "Validate policy preserves policy.message when condition is false");
        assert.strictEqual(findDelta(rfcDeltas, "/Items/0/Code", "required").value, false, "PolicyEngine expands $row for index 0");
        assert.strictEqual(findDelta(rfcDeltas, "/Items/1/Code", "required").value, true, "PolicyEngine expands $row for index 1");

        var shrinkDeltas = rfcEngine.evaluate({
            "a/b~c": "OK",
            AltRole: "User",
            ExpiryDate: "2026-06-15",
            CheckCode: "VALID",
            Items: [{ Qty: 5 }]
        });
        assert.strictEqual(findDelta(shrinkDeltas, "/Items/1/Code", "required").value, false, "PolicyEngine emits cleanup delta when $row array shrinks");

        // 13.2.3: All 6 Condition Plugins fail closed (false) and warn on malformed payloads
        var reg = PluginRegistry.getInstance();
        var dummyResolve = function () { return "Admin"; };
        assert.strictEqual(
            reg.getPolicyConditionPlugin("NumericGreaterThan").evaluate("malformed", {}, dummyResolve),
            false,
            "NumericGreaterThan fails closed (false) on malformed non-record payload"
        );
        assert.strictEqual(
            reg.getPolicyConditionPlugin("NumericLessThan").evaluate(123, {}, dummyResolve),
            false,
            "NumericLessThan fails closed (false) on malformed non-record payload"
        );
        assert.strictEqual(
            reg.getPolicyConditionPlugin("StringEquals").evaluate("Admin", {}, dummyResolve),
            false,
            "StringEquals fails closed (false) on malformed bare string payload"
        );
        assert.strictEqual(
            reg.getPolicyConditionPlugin("DateLessThan").evaluate(null, {}, dummyResolve),
            false,
            "DateLessThan fails closed (false) on malformed null payload"
        );
        assert.strictEqual(
            reg.getPolicyConditionPlugin("IsNull").evaluate([123], {}, dummyResolve),
            false,
            "IsNull fails closed (false) on malformed non-string array payload"
        );
        assert.strictEqual(
            reg.getPolicyConditionPlugin("IsNotNull").evaluate({}, {}, dummyResolve),
            false,
            "IsNotNull fails closed (false) on malformed object payload"
        );
    });

    QUnit.test("OpenApiBuilder & OpenApiExtractor parse OpenAPI v2 and v3 specs", function (assert) {
        var oa3Spec = {
            openapi: "3.0.0",
            paths: {
                "/orders": {
                    post: {
                        summary: "Create Order",
                        requestBody: {
                            content: {
                                "application/json": {
                                    schema: { $ref: "#/components/schemas/Order" }
                                }
                            }
                        }
                    }
                }
            },
            components: {
                schemas: {
                    Order: {
                        type: "object",
                        required: ["orderId"],
                        properties: {
                            orderId: { type: "string", minLength: 4, description: "Unique order identifier" },
                            customerEmail: { type: "string", format: "email" },
                            notes: { type: ["string", "null"], description: "Optional notes" },
                            OrderStatus: { type: "object", properties: { Value: { type: "string" } } }
                        }
                    }
                }
            }
        };

        var targets = OpenApiExtractor.extractTargets(oa3Spec);
        assert.strictEqual(targets.length >= 2, true, "OpenApiExtractor extracts operation and component schema targets");

        var builder = new OpenApiBuilder();
        assert.strictEqual(builder.canHandle(oa3Spec), true, "OpenApiBuilder detects OpenAPI 3.0 spec");

        var built = OpenApiBuilder.build(oa3Spec, "Order");
        assert.strictEqual(built.properties.orderId.required, true, "Required property preserved");
        assert.strictEqual(built.properties.orderId.minLength, 4, "minLength constraint preserved");
        assert.strictEqual(built.properties.orderId.description, "Unique order identifier", "OpenAPI description preserved on property metadata");
        assert.strictEqual(built.properties.notes.nullable, true, "OpenAPI 3.1 type array ['string', 'null'] mapped to nullable: true");
        assert.strictEqual(built.properties.customerEmail.ui.format, "email", "format: email mapped to ui.format");

        var builtOp = OpenApiBuilder.build(oa3Spec, "#/paths/~1orders/post");
        assert.strictEqual(!!builtOp.properties.orderId, true, "OpenApiBuilder resolves operation path target #/paths/~1orders/post");

        var oa2Spec = {
            swagger: "2.0",
            paths: {
                "/items": {
                    summary: "Non-method path metadata",
                    parameters: [{ name: "limit", in: "query" }],
                    get: {
                        responses: {
                            "200": {
                                schema: { $ref: "#/definitions/AttributeValue" }
                            }
                        }
                    }
                }
            },
            definitions: {
                AttributeValue: {
                    type: "object",
                    properties: {
                        string_value: { type: "string" },
                        int_value: { type: "integer" }
                    }
                }
            }
        };
        var oa2Targets = OpenApiExtractor.extractTargets(oa2Spec);
        assert.strictEqual(
            oa2Targets.some(function (t) { return t.key.indexOf("parameters") > -1 || t.key.indexOf("summary") > -1; }),
            false,
            "OpenApiExtractor ignores non-HTTP-method keys (parameters, summary) on Path Item Objects"
        );
        var builtOa2 = OpenApiBuilder.build(oa2Spec, "AttributeValue");
        assert.strictEqual(
            !!builtOa2 && !!builtOa2.properties.string_value && !!builtOa2.properties.int_value,
            true,
            "ProtobufVariantHeuristic converted *_value union into synthesized polymorphic properties"
        );
        assert.strictEqual(
            oa2Spec.definitions.AttributeValue.oneOf,
            undefined,
            "OpenApiBuilder.build preserves caller input immutability without mutating oa2Spec in-place"
        );

        // Round 2 Regressions: SchemaNormalizer.normalizeDefinition, root-level $ref/oneOf/primitive, ExpressionBuilder relative context, DataInferenceBuilder Date/null
        var polyDef = SchemaNormalizer.normalizeDefinition(
            {
                type: "object",
                oneOf: [
                    { title: "VariantA", properties: { A: { type: "string", minLength: 2 } } },
                    { title: "VariantB", properties: { B: { type: "integer" } } }
                ]
            },
            "PolyDef"
        );
        assert.strictEqual(Array.isArray(polyDef.oneOf) && polyDef.oneOf.length === 2, true, "SchemaNormalizer.normalizeDefinition preserves oneOf branches on definitions");

        var rootRefSchema = SchemaNormalizer.normalize({
            $ref: "#/definitions/TargetRoot",
            definitions: {
                TargetRoot: {
                    type: "object",
                    properties: { RootField: { type: "string", required: true } }
                }
            }
        });
        assert.strictEqual(!!rootRefSchema.properties.RootField, true, "SchemaNormalizer resolves root-level $ref to definition properties");

        var primRootSchema = SchemaNormalizer.normalize({
            type: "string",
            enum: ["Draft", "Published"]
        });
        assert.strictEqual(!!primRootSchema.properties.value, true, "SchemaNormalizer wraps standalone primitive/enum root schema into properties.value");

        var relExpr = ExpressionBuilder.build("{= ${Status} === 'Active' && $root.Mode === 'Edit' }", "Status", "meta");
        assert.strictEqual(
            relExpr.indexOf("${meta>Status}") !== -1 && relExpr.indexOf("${meta>/Mode}") !== -1,
            true,
            "ExpressionBuilder preserves relative paths in row context while prefixing '/' on $root.<path>"
        );

        var inferredWithDatesAndNulls = DataInferenceBuilder.inferPropertiesFromRows([
            { CreatedOn: new Date(2026, 0, 15), Nested: { KeepMe: "yes" }, NullArr: [null] },
            { CreatedOn: null, Nested: null, NullArr: [null] }
        ]);
        assert.strictEqual(inferredWithDatesAndNulls.CreatedOn.type, "date", "DataInferenceBuilder infers Date instances as 'date'");
        assert.strictEqual(!!inferredWithDatesAndNulls.Nested.properties.KeepMe, true, "DataInferenceBuilder preserves accumulated nested object properties across null rows");
        assert.strictEqual(inferredWithDatesAndNulls.NullArr.items.type, "string", "DataInferenceBuilder defaults all-null array items to type 'string'");

        // 13.3.1 & 13.3.7(l): Cyclic data, 20,000-deep chain, and invalid date-shaped string widening
        var cyclicNode = { name: "root" };
        cyclicNode.parent = cyclicNode;
        var cyclicInferred = SchemaNormalizer.normalize(null, cyclicNode);
        assert.strictEqual(cyclicInferred.properties.name.type, "string", "DataInferenceBuilder handles self-referencing cyclic objects without stack overflow");
        assert.strictEqual(cyclicInferred.properties.parent.type, "string", "Cyclic back-reference emits terminal property without recursing");

        var deepHead = { value: "leaf" };
        var cursor = deepHead;
        for (var d = 0; d < 20000; d++) {
            cursor.next = { level: d };
            cursor = cursor.next;
        }
        var deepInferred = DataInferenceBuilder.inferSchemaFromData(deepHead);
        assert.strictEqual(deepInferred.properties.value.type, "string", "DataInferenceBuilder truncates 20,000-deep chain safely at MAX_INFERENCE_DEPTH");

        var dateCodeRows = DataInferenceBuilder.inferPropertiesFromRows([
            { Code: "1234-56-78", Mixed: "2026-05-01" },
            { Code: "9999-99-99", Mixed: "not-a-date" }
        ]);
        assert.strictEqual(dateCodeRows.Code.type, "string", "Invalid calendar date '1234-56-78' is not misclassified as 'date'");
        assert.strictEqual(dateCodeRows.Mixed.type, "string", "Mixed date and non-date rows widen from 'date' to 'string'");

        // 13.3.2: Injected PluginRegistry is honoured by LayoutScorer and width detection
        var done1332 = assert.async();
        sap.ui.define("custom/test/CustomWidePlugin", [], function () {
            function CustomWidePlugin() {}
            CustomWidePlugin.layoutScore = 8;
            CustomWidePlugin.isNativelyWide = true;
            return CustomWidePlugin;
        });
        var customReg = new PluginRegistry();
        customReg.registerPluginPath("string", "customWideWidget", "custom/test/CustomWidePlugin");
        var customScoreSchema = SchemaNormalizer.normalize({
            type: "object",
            properties: {
                NestedCustom: {
                    type: "object",
                    properties: {
                        CustomField: { type: "string", ui: { widget: "customWideWidget" } }
                    }
                }
            }
        });
        customReg.preloadDependencies(customScoreSchema).then(function () {
            LayoutScorer.apply(customScoreSchema, 5, undefined, customReg);
            assert.strictEqual(
                customScoreSchema.properties.NestedCustom.ui.renderMode,
                "dialog",
                "LayoutScorer uses injected PluginRegistry (CustomWidePlugin layoutScore 8 > budget 5 => dialog)"
            );
            assert.strictEqual(
                customReg.isPluginNativelyWide("string", "customWideWidget"),
                true,
                "Custom PluginRegistry width detection resolves registered custom wide widget to true"
            );
            done1332();
        });

        // 13.3.3: allOf merge intersects constraints instead of last-writer-wins
        var mergedMaxLength = OpenApiConstraintMapper.resolveAllOf({
            allOf: [{ type: "string", maxLength: 10 }, { type: "string", maxLength: 50 }]
        }, {});
        assert.strictEqual(mergedMaxLength.maxLength, 10, "allOf [{maxLength:10},{maxLength:50}] intersects to 10");

        var mergedMin = OpenApiConstraintMapper.resolveAllOf({
            allOf: [{ type: "number", minimum: 5 }, { type: "number", minimum: 1 }]
        }, {});
        assert.strictEqual(mergedMin.minimum, 5, "allOf [{minimum:5},{minimum:1}] intersects to 5");

        var mergedTypeConflict = OpenApiConstraintMapper.resolveAllOf({
            allOf: [{ type: "string" }, { type: "integer" }]
        }, {});
        assert.strictEqual(mergedTypeConflict.type, "string", "allOf [{type:'string'},{type:'integer'}] logs error and preserves first type");

        var mergedEnum = OpenApiConstraintMapper.resolveAllOf({
            allOf: [{ type: "string", enum: ["A", "B", "C"] }, { type: "string", enum: ["B"] }]
        }, {});
        assert.deepEqual(mergedEnum.enum, ["B"], "allOf enum arrays intersect to ['B']");

        // 13.3.4: Unified OpenAPI version detection for "2.0", "2.0.0", numeric 2.0, "3.0.0", "3.1.0"
        ["2.0", "2.0.0", 2.0].forEach(function (ver) {
            var spec2 = {
                swagger: ver,
                definitions: {
                    Widget: { type: "object", properties: { id: { type: "string" } } }
                }
            };
            assert.strictEqual(OpenApiParserFactory.detectSpecVersion(spec2), "2.0", "detectSpecVersion recognizes swagger=" + JSON.stringify(ver));
            var built2 = OpenApiBuilder.build(spec2, "Widget");
            assert.strictEqual(!!built2.properties && !!built2.properties.id, true, "OpenApiBuilder parses non-empty properties for swagger=" + JSON.stringify(ver));
        });
        ["3.0.0", "3.1.0"].forEach(function (ver) {
            var spec3 = {
                openapi: ver,
                components: {
                    schemas: {
                        Widget: { type: "object", properties: { id: { type: "string" } } }
                    }
                }
            };
            assert.strictEqual(OpenApiParserFactory.detectSpecVersion(spec3), "3.0", "detectSpecVersion recognizes openapi=" + ver);
            var built3 = OpenApiBuilder.build(spec3, "Widget");
            assert.strictEqual(!!built3.properties && !!built3.properties.id, true, "OpenApiBuilder parses non-empty properties for openapi=" + ver);
        });

        // 13.3.7(b, c, d, e, f): Pointer unescaping, array-index $ref, co-declared exclusiveMaximum+maximum, mixed enum
        assert.strictEqual(
            OpenApiRefResolver.unescapePointerSegment("a~1b~0c%25d"),
            "a/b~c%d",
            "OpenApiRefResolver.unescapePointerSegment decodes percent-encoding then ~1 then ~0 per RFC 6901"
        );
        var arrRefRoot = {
            definitions: {
                Matrix: {
                    items: [
                        { type: "string", minLength: 7 },
                        { type: "integer", minimum: 10 }
                    ]
                },
                EscapedDef: {
                    "a/b": { type: "string", maxLength: 9 }
                }
            }
        };
        var resolvedArrItem = OpenApiRefResolver.resolve("#/definitions/Matrix/items/0", arrRefRoot);
        assert.strictEqual(
            resolvedArrItem && resolvedArrItem.minLength,
            7,
            "OpenApiRefResolver.resolve traverses numeric array segments (#/definitions/Matrix/items/0)"
        );
        var resolvedPct = OpenApiRefResolver.resolve("#/definitions/EscapedDef/a%7E1b", arrRefRoot);
        assert.strictEqual(
            resolvedPct && resolvedPct.maxLength,
            9,
            "OpenApiRefResolver.resolve decodes percent-encoded ~1 (%7E1) segment"
        );

        var coMaxMeta = { type: "number" };
        OpenApiConstraintMapper.applyConstraints(coMaxMeta, { maximum: 100, exclusiveMaximum: 50, minimum: 0, exclusiveMinimum: 5 });
        assert.strictEqual(coMaxMeta.maximum, 100, "OpenApiConstraintMapper preserves co-declared maximum: 100");
        assert.strictEqual(coMaxMeta.exclusiveMaximum, 50, "OpenApiConstraintMapper preserves numeric exclusiveMaximum: 50 without overwriting maximum");
        assert.strictEqual(coMaxMeta.minimum, 0, "OpenApiConstraintMapper preserves co-declared minimum: 0");
        assert.strictEqual(coMaxMeta.exclusiveMinimum, 5, "OpenApiConstraintMapper preserves numeric exclusiveMinimum: 5");

        assert.deepEqual(
            SchemaDirectiveNormalizer.normalizeEnum(["A", 1, false, null]),
            ["A", 1, false, null],
            "SchemaDirectiveNormalizer.normalizeEnum preserves string, number, boolean, and null member types"
        );
        assert.strictEqual(
            SchemaDirectiveNormalizer.normalizeEnum([]),
            undefined,
            "SchemaDirectiveNormalizer.normalizeEnum treats empty [] as undefined"
        );
    });

    QUnit.test("OpenApiPropertyMapper honours MAX_MAPPING_DEPTH levels of nesting (depth accounting regression)", function (assert) {
        // Regression: mapProperties and mapPropertyMetadata are the two halves of one
        // nesting level, but both incremented depth, so the stated limit of 8 bit at 4.
        // A type:"string" leaf five levels down silently became type:"object" and lost
        // every constraint. Found by crawling the real GitHub OpenAPI 3.0 description.
        function nestedSpec(depth) {
            var leaf = { type: "string", nullable: true, maxLength: 7 };
            for (var i = depth; i > 0; i--) {
                var wrapper = { type: "object", properties: {} };
                wrapper.properties["lvl" + i] = leaf;
                leaf = wrapper;
            }
            return { openapi: "3.0.0", components: { schemas: { Root: leaf } } };
        }

        function leafAt(built, depth) {
            var cur = built;
            for (var i = 1; i <= depth; i++) {
                if (!cur || !cur.properties) { return undefined; }
                cur = cur.properties["lvl" + i];
            }
            return cur;
        }

        // Five levels is the shallowest depth that failed before the fix.
        var atFive = leafAt(OpenApiBuilder.build(nestedSpec(5), "Root"), 5);
        assert.strictEqual(atFive.type, "string", "Depth 5 leaf keeps its declared type (was 'object')");
        assert.strictEqual(atFive.nullable, true, "Depth 5 leaf keeps nullable (was dropped)");
        assert.strictEqual(atFive.maxLength, 7, "Depth 5 leaf keeps maxLength (was dropped)");

        // The documented limit must actually be reachable, not half of it.
        var atEight = leafAt(OpenApiBuilder.build(nestedSpec(8), "Root"), 8);
        assert.strictEqual(atEight.type, "string", "Depth 8 leaf keeps its declared type");
        assert.strictEqual(atEight.maxLength, 7, "Depth 8 leaf keeps its constraints");

        // The guard must still stop runaway nesting rather than recursing without bound.
        var atTwelve = leafAt(OpenApiBuilder.build(nestedSpec(12), "Root"), 12);
        assert.strictEqual(atTwelve, undefined, "Nesting beyond the limit is still truncated, not unbounded");

        // Shallow schemas must be unaffected by the depth accounting change.
        var atOne = leafAt(OpenApiBuilder.build(nestedSpec(1), "Root"), 1);
        assert.strictEqual(atOne.type, "string", "Depth 1 leaf unchanged");
        assert.strictEqual(atOne.nullable, true, "Depth 1 nullable unchanged");
    });

    QUnit.test("ValidationLedger, SandboxJSONModel, DataSyncDelegate, Layout Edge Cases & 13.3.8 Regressions", function (assert) {
        // 1. ValidationLedger three-tier priority (customError > policyError > schemaError) & visibility suppression
        var visualStates = {};
        var mockPlugin = {
            visible: true,
            isVisible: function () { return this.visible; },
            getFieldLabel: function () { return "Code Label"; },
            validate: function () { return { isValid: false, errorMessage: "Schema fail" }; },
            setVisualValidationState: function (isValid, msg) {
                visualStates["Code"] = { isValid: isValid, msg: msg || null };
            }
        };
        var ledger = new ValidationLedger(
            false,
            function (p) { return p === "Code" ? mockPlugin : undefined; },
            function () { return [{ path: "Code", plugin: mockPlugin }]; },
            function () { return undefined; }
        );

        ledger.reportSchemaError("/Code", "Schema error");
        assert.deepEqual(visualStates["Code"], { isValid: false, msg: "Schema error" }, "ValidationLedger applies schemaError when alone");

        ledger.reportPolicyError("/Code", "Policy error");
        assert.deepEqual(visualStates["Code"], { isValid: false, msg: "Policy error" }, "ValidationLedger prioritizes policyError over schemaError");

        ledger.reportCustomError("/Code", "Custom error");
        assert.deepEqual(visualStates["Code"], { isValid: false, msg: "Custom error" }, "ValidationLedger prioritizes customError over policyError and schemaError");

        // Hide plugin: schema & policy errors are suppressed, but customError still counts unless cleared
        mockPlugin.visible = false;
        ledger.reportCustomError("/Code", null);
        assert.strictEqual(ledger.hasActiveErrors(), false, "ValidationLedger suppresses schema and policy errors on hidden fields");

        mockPlugin.visible = true;
        assert.strictEqual(ledger.hasActiveErrors(), true, "ValidationLedger restores active error state when field is visible");
        ledger.clear(true);
        assert.strictEqual(ledger.hasActiveErrors(), false, "ValidationLedger.clear(true) purges all errors and resets visuals");
        assert.strictEqual(visualStates["Code"].isValid, true, "ValidationLedger.clear(true) resets plugin visual state to valid");

        // 2. SandboxJSONModel relative context resolution
        var observedWrites = [];
        var sModel = new SandboxJSONModel({ Lines: [{ Qty: 1 }] });
        sModel.setPropertyChangeHook(function (absPath, val) {
            observedWrites.push({ path: absPath, val: val });
        });
        var rowCtx = sModel.createBindingContext("/Lines/0");
        sModel.setProperty("Qty", 9, rowCtx);
        assert.deepEqual(
            observedWrites,
            [{ path: "/Lines/0/Qty", val: 9 }],
            "SandboxJSONModel resolves relative context path 'Qty' + '/Lines/0' to '/Lines/0/Qty'"
        );
        sModel.destroy();

        // 3. DataSyncDelegate: runWithSyncLock drops re-entrant hot-swap echo, injectSchemaDefaults populates defaults
        var baseProps = { data: { A: "init" }, dataJson: null, debugMode: false };
        var tearDownCalls = 0;
        var syncHost = {
            getProperty: function (k) { return baseProps[k]; },
            getBaseProperty: function (k) { return baseProps[k]; },
            setProperty: function (k, v) { baseProps[k] = v; return this; },
            setBaseProperty: function (k, v) { baseProps[k] = v; return this; },
            getBinding: function () { return null; },
            invalidate: function () {},
            getStateManager: function () { return null; },
            tearDownGeneratedLayout: function () { tearDownCalls++; }
        };
        var dsd = new DataSyncDelegate(syncHost);
        dsd.runWithSyncLock(function () {
            dsd.handleInputDataHotSwap("data", { A: "echoed" });
        });
        assert.strictEqual(tearDownCalls, 0, "DataSyncDelegate.runWithSyncLock drops re-entrant hot-swap without tearing down layout");

        var defTarget = {};
        dsd.injectSchemaDefaults(
            {
                type: "object",
                properties: {
                    Status: { type: "string", default: "DRAFT" },
                    Nested: {
                        type: "object",
                        properties: {
                            Count: { type: "integer", default: 3 }
                        }
                    }
                }
            },
            defTarget
        );
        assert.deepEqual(
            defTarget,
            { Status: "DRAFT", Nested: { Count: 3 } },
            "DataSyncDelegate.injectSchemaDefaults recursively populates scalar and nested object defaults"
        );

        // 4. 13.3.7(n) & 13.3.7(o): CompactLayout VerticalLayout VBox wrapper and TableLayout empty uiLayout fallback
        var compactEngine = new Engine(true, false, PluginRegistry.getInstance());
        var compactSchema = SchemaNormalizer.normalize({
            type: "object",
            layoutStrategy: "compact",
            properties: {
                F1: { type: "string" },
                F2: { type: "string" }
            },
            uiLayout: [
                {
                    type: "HorizontalLayout",
                    elements: [
                        {
                            type: "VerticalLayout",
                            elements: [
                                { type: "Control", scope: "#/properties/F1" },
                                { type: "Control", scope: "#/properties/F2" }
                            ]
                        }
                    ]
                }
            ]
        });
        var compactModel = new SandboxJSONModel({ F1: "v1", F2: "v2" });
        var compactRoot = new CompactLayout().render(compactSchema, "meta", compactEngine);
        var hBoxChild = compactRoot.getItems()[0];
        var vBoxChild = hBoxChild.getItems()[0];
        assert.strictEqual(
            vBoxChild.getMetadata().getName(),
            "sap.m.VBox",
            "CompactLayout wraps VerticalLayout elements inside a nested sap.m.VBox"
        );
        compactRoot.destroy();
        compactEngine.destroy();
        compactModel.destroy();

        var tableEngine = new Engine(true, false, PluginRegistry.getInstance());
        var tableSchema = SchemaNormalizer.normalize({
            type: "array",
            layoutStrategy: "table",
            items: {
                type: "object",
                properties: {
                    ColA: { type: "string" },
                    ColB: { type: "number" }
                },
                uiLayout: [{ type: "Group", label: "Empty Group", elements: [] }]
            }
        });
        var tableModel = new SandboxJSONModel({ items: [{ ColA: "X", ColB: 1 }] });
        var renderedTable = new TableLayout().render(tableSchema, "meta", tableEngine);
        assert.strictEqual(
            renderedTable.getColumns().length,
            2,
            "TableLayout falls back to item properties when items.uiLayout yields 0 Control elements"
        );
        renderedTable.destroy();
        tableEngine.destroy();
        tableModel.destroy();

        // 5. 13.3.8(p) & 13.3.8(q): ODataDelegate V4 getProperty throw tolerance and V2 array skip on submit
        var v4Patched = {};
        var v4HostMock = new DynamicHost();
        var v4ThrowCtx = {
            getPath: function () { return "/Orders('1')"; },
            requestObject: function () { return Promise.resolve({}); },
            getProperty: function () { throw new Error("Not a primitive property"); },
            setProperty: function (p, v) { v4Patched[p] = v; }
        };
        var v4Del = new ODataDelegate(v4HostMock, v4ThrowCtx);
        v4Del.handleFieldChange("/Billing/City", "Wellington");
        assert.strictEqual(
            v4Patched["Billing/City"],
            "Wellington",
            "13.3.8(p): ODataDelegate V4 still invokes setProperty when getProperty throws on structural path"
        );
        v4Del.destroy();
        v4HostMock.destroy();

        var v2Patched = {};
        var v2HostMock = new DynamicHost();
        var v2Ctx = {
            getPath: function () { return "/Orders('2')"; },
            getObject: function () { return { OrderNo: "O-2", Lines: [{ Sku: "S1" }] }; },
            getModel: function () {
                return {
                    getMetadata: function () { return { getName: function () { return "sap.ui.model.odata.v2.ODataModel"; } }; },
                    setProperty: function (p, v) { v2Patched[p] = v; return true; }
                };
            }
        };
        var v2Del = new ODataDelegate(v2HostMock, v2Ctx);
        v2HostMock.fireEvent("submit", {
            payload: {
                OrderNo: "O-2-UPD",
                Lines: [{ Sku: "S1" }, { Sku: "S2" }]
            }
        });
        assert.strictEqual(v2Patched["OrderNo"], "O-2-UPD", "13.3.8(q): ODataDelegate V2 patches scalar property on submit");
        assert.strictEqual(v2Patched["Lines"], undefined, "13.3.8(q): ODataDelegate V2 skips array property on submit instead of patching as scalar");
        v2Del.destroy();
        v2HostMock.destroy();

        // 6. 13.3.8(s): WizardLayout resumeNavigation() sync veto and stale async resume after Previous
        var staleResumeFn = null;
        var wizardMode = "syncVetoAfterResume";
        var wizEngine = new Engine(true, false, PluginRegistry.getInstance());
        var wizSchema = SchemaNormalizer.normalize({
            type: "object",
            layoutStrategy: "wizard",
            properties: {
                S1: { type: "string" },
                S2: { type: "string" },
                S3: { type: "string" }
            },
            uiLayout: [
                { type: "WizardStep", label: "Step 1", elements: [{ type: "Control", scope: "#/properties/S1" }] },
                { type: "WizardStep", label: "Step 2", elements: [{ type: "Control", scope: "#/properties/S2" }] },
                { type: "WizardStep", label: "Step 3", elements: [{ type: "Control", scope: "#/properties/S3" }] }
            ]
        });
        var wizSm = new StateManager({ S1: "A", S2: "B", S3: "C" }, wizSchema);
        wizEngine.host = {
            getStateManager: function () { return wizSm; },
            fireEvent: function (_name, params) {
                if (wizardMode === "syncVetoAfterResume") {
                    params.resumeNavigation();
                    params.preventDefault();
                } else if (wizardMode === "captureAsyncResume") {
                    params.preventDefault();
                    staleResumeFn = params.resumeNavigation;
                }
                return true;
            }
        };
        var wizBox = new WizardLayout().render(wizSchema, "meta", wizEngine);
        var stepCounter = wizBox.getItems()[0].getItems()[0].getItems()[1];
        var navBar = wizBox.getItems()[2];
        var prevBtn = navBar.getItems()[0];
        var nextBtn = navBar.getItems()[1];

        nextBtn.firePress();
        assert.strictEqual(
            stepCounter.getText(),
            "Step 1 of 3",
            "13.3.8(s): Synchronous preventDefault() called after resumeNavigation() blocks step transition"
        );

        // Advance cleanly to Step 2
        wizardMode = "allow";
        nextBtn.firePress();
        assert.strictEqual(stepCounter.getText(), "Step 2 of 3", "Wizard advanced to Step 2");

        // On Step 2 -> Step 3, defer navigation asynchronously, then user clicks Previous (back to Step 1), then stale resume fires
        wizardMode = "captureAsyncResume";
        nextBtn.firePress();
        assert.strictEqual(stepCounter.getText(), "Step 2 of 3", "Async preventDefault() holds wizard on Step 2");
        prevBtn.firePress();
        assert.strictEqual(stepCounter.getText(), "Step 1 of 3", "Previous button navigates back to Step 1");
        staleResumeFn();
        assert.strictEqual(
            stepCounter.getText(),
            "Step 1 of 3",
            "13.3.8(s): Stale async resumeNavigation() from Step 2 is ignored after user navigated back to Step 1"
        );
        wizBox.destroy();
        wizEngine.destroy();
        wizSm.destroy();

        // 7. 13.3.8(t): DynamicHost.exit() detaches _onElementBindingChange from tracked element binding
        var bindHost = new DynamicHost();
        var bindModel = new SandboxJSONModel({ Row: { Name: "Test" } });
        bindHost.setModel(bindModel);
        bindHost.bindElement("/Row");
        var elemBinding = bindHost.getElementBinding();
        assert.strictEqual(bindHost._trackedElementBindings.size, 1, "DynamicHost tracks attached element binding");
        var detachSpyCount = 0;
        var origDetach = elemBinding.detachChange.bind(elemBinding);
        elemBinding.detachChange = function (fn) {
            if (fn === bindHost._onElementBindingChange) {
                detachSpyCount++;
            }
            return origDetach(fn);
        };
        bindHost.destroy();
        assert.strictEqual(detachSpyCount, 1, "13.3.8(t): DynamicHost.exit() detaches _onElementBindingChange from element binding");
        bindModel.destroy();

        // 8. 13.3.8(u): LayoutScorer memoizes diamond $ref definitions instead of exponential 2^N re-scoring
        var diamondDefs = {};
        for (var level = 0; level < 18; level++) {
            diamondDefs["Node_" + level] = SchemaNormalizer.normalizeDefinition({
                type: "object",
                properties: {
                    left: { $ref: "#/definitions/Node_" + (level + 1) },
                    right: { $ref: "#/definitions/Node_" + (level + 1) }
                }
            }, "Node_" + level);
        }
        diamondDefs["Node_18"] = SchemaNormalizer.normalizeDefinition({
            type: "object",
            properties: { leaf: { type: "string" } }
        }, "Node_18");
        var diamondRoot = SchemaNormalizer.normalize({
            type: "object",
            properties: {
                root: { $ref: "#/definitions/Node_0" }
            }
        });
        var t0 = Date.now();
        LayoutScorer.apply(diamondRoot, 50, diamondDefs);
        var elapsedMs = Date.now() - t0;
        assert.strictEqual(
            elapsedMs < 500 && diamondRoot.properties.root.ui.renderMode === "dialog",
            true,
            "13.3.8(u): 18-level diamond $ref schema (262,144 paths) scored in " + elapsedMs + "ms via refMemo"
        );
    });

    QUnit.test("13.9.2: extractConstructorJsonLiterals Disambiguation Matrix (7 cases + ambiguous logging)", function (assert) {
        // Row 1: '{"field":"val"}' -> literal
        var h1 = new DynamicHost({ dataJson: '{"field":"val"}' });
        assert.strictEqual(h1.getProperty("dataJson"), '{"field":"val"}', "Row 1: '{\"field\":\"val\"}' is preserved as a literal JSON string");
        assert.strictEqual(Boolean(h1.getBindingInfo("dataJson")), false, "Row 1: '{\"field\":\"val\"}' does not create a UI5 property binding");
        h1.destroy();

        // Row 2: '[1,2,3]' -> literal
        var h2 = new DynamicHost({ dataJson: "[1,2,3]" });
        assert.strictEqual(h2.getProperty("dataJson"), "[1,2,3]", "Row 2: '[1,2,3]' is preserved as a literal JSON array string");
        assert.strictEqual(Boolean(h2.getBindingInfo("dataJson")), false, "Row 2: '[1,2,3]' does not create a UI5 property binding");
        h2.destroy();

        // Row 3: "{path: '/foo'}" (UI5 syntax, invalid JSON) -> binding
        var h3 = new DynamicHost({ dataJson: "{path: '/foo'}" });
        var b3 = h3.getBindingInfo("dataJson");
        assert.strictEqual(Boolean(b3 && b3.parts && b3.parts[0].path === "/foo"), true, "Row 3: \"{path: '/foo'}\" is parsed as a UI5 binding to '/foo'");
        h3.destroy();

        // Row 4: '{"path":"/foo"}' -> decided as binding descriptor with non-silent Logger warning/debug
        var warnMessages = [];
        var origWarn = Logger.warn;
        Logger.warn = function (msg, details, comp) {
            warnMessages.push({ msg: msg, details: details, comp: comp });
            return origWarn.apply(Logger, arguments);
        };
        try {
            var h4 = new DynamicHost({ dataJson: '{"path":"/foo"}' });
            var b4 = h4.getBindingInfo("dataJson");
            assert.strictEqual(
                Boolean(b4 && b4.parts && b4.parts[0].path === "/foo"),
                true,
                "Row 4: '{\"path\":\"/foo\"}' resolves as a UI5 binding descriptor to '/foo'"
            );
            assert.strictEqual(
                warnMessages.some(function (w) { return String(w.details).indexOf('{"path":"/foo"}') !== -1; }),
                true,
                "Row 4: Ambiguous constructor string '{\"path\":\"/foo\"}' emits a non-silent Logger.warn diagnostic"
            );
            h4.destroy();
        } finally {
            Logger.warn = origWarn;
        }

        // Row 5: '{"path":"/foo","extra":1}' -> literal (extra is not a UI5 binding descriptor key)
        var h5 = new DynamicHost({ dataJson: '{"path":"/foo","extra":1}' });
        assert.strictEqual(
            h5.getProperty("dataJson"),
            '{"path":"/foo","extra":1}',
            "Row 5: '{\"path\":\"/foo\",\"extra\":1}' is preserved as a literal JSON string because 'extra' is not a binding key"
        );
        assert.strictEqual(Boolean(h5.getBindingInfo("dataJson")), false, "Row 5: '{\"path\":\"/foo\",\"extra\":1}' does not create a UI5 property binding");
        h5.destroy();

        // Row 6: 'not json at all' -> literal string, untouched
        var extracted6 = extractConstructorJsonLiterals({ dataJson: "not json at all" });
        assert.strictEqual(extracted6.literalDataJson, undefined, "Row 6: 'not json at all' is untouched by extractConstructorJsonLiterals");
        var h6 = new DynamicHost({ dataJson: "not json at all" });
        assert.strictEqual(h6.getProperty("dataJson"), "not json at all", "Row 6: 'not json at all' survives on DynamicHost as literal string");
        assert.strictEqual(Boolean(h6.getBindingInfo("dataJson")), false, "Row 6: 'not json at all' does not create a UI5 property binding");
        h6.destroy();

        // Row 7: { path: "/foo" } (real descriptor object) -> binding, unchanged
        var extracted7 = extractConstructorJsonLiterals({ dataJson: { path: "/foo" } });
        assert.strictEqual(extracted7.literalDataJson, undefined, "Row 7: Real descriptor object { path: '/foo' } is untouched by extractConstructorJsonLiterals");
        var h7 = new DynamicHost({ dataJson: { path: "/foo" } });
        var b7 = h7.getBindingInfo("dataJson");
        assert.strictEqual(Boolean(b7 && b7.parts && b7.parts[0].path === "/foo"), true, "Row 7: Real descriptor object { path: '/foo' } binds to '/foo'");
        h7.destroy();
    });

    QUnit.test("13.9.3: LayoutElementWalker shared scope resolution across FormLayout, CompactLayout, WizardLayout, and TableLayout", function (assert) {
        var objSchema = SchemaNormalizer.normalize({
            type: "object",
            properties: { FieldA: { type: "string" } },
            uiLayout: [
                {
                    type: "WizardStep",
                    label: "Step 1",
                    elements: [{ type: "Control", scope: "#/properties/FieldA" }]
                }
            ]
        });

        var formEngine = new Engine(true, false, PluginRegistry.getInstance());
        var formCtrl = new FormLayout().render(objSchema, "meta", formEngine);
        assert.strictEqual(
            Boolean(formEngine.getPluginByPath("/FieldA")),
            true,
            "13.9.3 [FormLayout]: resolves Control scope via LayoutElementWalker and registers /FieldA plugin"
        );
        formCtrl.destroy();
        formEngine.destroy();

        var compactEngine = new Engine(true, false, PluginRegistry.getInstance());
        var compactCtrl = new CompactLayout().render(objSchema, "meta", compactEngine);
        assert.strictEqual(
            Boolean(compactEngine.getPluginByPath("/FieldA")),
            true,
            "13.9.3 [CompactLayout]: resolves Control scope via LayoutElementWalker and registers /FieldA plugin"
        );
        compactCtrl.destroy();
        compactEngine.destroy();

        var wizEngine = new Engine(true, false, PluginRegistry.getInstance());
        var wizCtrl = new WizardLayout().render(objSchema, "meta", wizEngine);
        assert.strictEqual(
            Boolean(wizEngine.getPluginByPath("/FieldA")),
            true,
            "13.9.3 [WizardLayout]: resolves Control scope via LayoutElementWalker and registers /FieldA plugin"
        );
        wizCtrl.destroy();
        wizEngine.destroy();

        var tblSchema = SchemaNormalizer.normalize({
            type: "array",
            layoutStrategy: "table",
            items: {
                type: "object",
                properties: { ColA: { type: "string" }, ColB: { type: "string" } },
                uiLayout: [{ type: "Control", scope: "#/properties/ColA" }]
            }
        });
        var tblEngine = new Engine(true, false, PluginRegistry.getInstance());
        var tblCtrl = new TableLayout().render(tblSchema, "meta", tblEngine);
        assert.strictEqual(
            tblCtrl.getColumns().length,
            1,
            "13.9.3 [TableLayout]: resolves Control scope via LayoutElementWalker and builds 1 table column"
        );
        tblCtrl.destroy();
        tblEngine.destroy();
    });
});
