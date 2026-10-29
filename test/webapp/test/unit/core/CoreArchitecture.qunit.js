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
    "nz/co/siliconst/ui5/metaui/controls/host/delegates/PolicyDelegate",
    "nz/co/siliconst/ui5/metaui/core/PipelineManager",
    "nz/co/siliconst/ui5/metaui/controls/host/delegates/ODataDelegate",
    "nz/co/siliconst/ui5/metaui/controls/DynamicHost",
    "nz/co/siliconst/ui5/metaui/controls/host/GeneratorHost",
    "nz/co/siliconst/ui5/metaui/library",
    "sap/ui/core/Lib",
    "nz/co/siliconst/ui5/metaui/plugins/controls/BasePlugin",
    "nz/co/siliconst/ui5/metaui/layouts/FormLayout",
    "nz/co/siliconst/ui5/metaui/layouts/CompactLayout",
    "nz/co/siliconst/ui5/metaui/layouts/TableLayout",
    "nz/co/siliconst/ui5/metaui/layouts/WizardLayout",
    "nz/co/siliconst/ui5/metaui/core/Engine",
    "nz/co/siliconst/ui5/metaui/swagger/OpenApiExtractor",
    "nz/co/siliconst/ui5/metaui/controls/host/HostControlMetadata",
    "nz/co/siliconst/ui5/metaui/utils/Logger",
    "nz/co/siliconst/ui5/metaui/constants/MetaUIConstants",
    "sap/ui/core/Messaging",
    "sap/ui/core/message/Message",
    "sap/ui/core/message/MessageType",
    "sap/ui/core/Core",
    "sap/m/Table",
    "sap/m/Column",
    "sap/m/ColumnListItem",
    "sap/m/Text",
    "nz/co/siliconst/ui5/metaui/controls/VoiceInputControl",
    "nz/co/siliconst/ui5/metaui/controls/CameraControl",
    "nz/co/siliconst/ui5/metaui/controls/GeolocationControl",
    "sap/ui/model/odata/v4/ODataModel",
    "sap/ui/model/json/JSONModel"
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
    PolicyDelegateMod,
    PipelineManagerMod,
    ODataDelegateMod,
    DynamicHostMod,
    GeneratorHostMod,
    MetaUILibraryMod,
    Lib,
    BasePluginMod,
    FormLayoutMod,
    CompactLayoutMod,
    TableLayoutMod,
    WizardLayoutMod,
    EngineMod,
    OpenApiExtractorMod,
    HostControlMetadataMod,
    LoggerMod,
    MetaUIConstantsMod,
    Messaging,
    Message,
    MessageType,
    Core,
    Table,
    Column,
    ColumnListItem,
    Text,
    VoiceInputControlMod,
    CameraControlMod,
    GeolocationControlMod,
    ODataModelV4,
    JSONModel
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
    var PolicyDelegate = PolicyDelegateMod.PolicyDelegate;
    var PipelineManager = PipelineManagerMod.PipelineManager;
    var ODataDelegate = ODataDelegateMod.ODataDelegate;
    var DynamicHost = DynamicHostMod.default || DynamicHostMod.DynamicHost || DynamicHostMod;
    var GeneratorHost = GeneratorHostMod.default || GeneratorHostMod.GeneratorHost || GeneratorHostMod;
    var BasePlugin = BasePluginMod.BasePlugin;
    var FormLayout = FormLayoutMod.FormLayout;
    var CompactLayout = CompactLayoutMod.CompactLayout;
    var TableLayout = TableLayoutMod.TableLayout;
    var WizardLayout = WizardLayoutMod.WizardLayout;
    var Engine = EngineMod.Engine;
    var OpenApiExtractor = OpenApiExtractorMod.default || OpenApiExtractorMod.OpenApiExtractor || OpenApiExtractorMod;
    var extractConstructorJsonLiterals = HostControlMetadataMod.extractConstructorJsonLiterals;
    var Logger = LoggerMod.Logger;
    // Read the cap rather than restating it: these two tests assert where truncation starts,
    // and a hardcoded number here is the same defect [DEPTH_CONSTANT] forbids in src/.
    var MAX_SCHEMA_DEPTH = MetaUIConstantsMod.MAX_SCHEMA_DEPTH;
    var VoiceInputControl = VoiceInputControlMod.default || VoiceInputControlMod;
    var CameraControl = CameraControlMod.default || CameraControlMod;
    var GeolocationControl = GeolocationControlMod.default || GeolocationControlMod;

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

        var pluginReg = PluginRegistry.getInstance();
        assert.strictEqual(
            typeof pluginReg.hasPluginPath === "function" && pluginReg.hasPluginPath("string"),
            true,
            "PluginRegistry.hasPluginPath('string') returns true for built-in default string plugin"
        );
        assert.strictEqual(
            typeof pluginReg.hasPluginPath === "function" && pluginReg.hasPluginPath("string", "textArea"),
            true,
            "PluginRegistry.hasPluginPath('string', 'textArea') returns true for registered widget"
        );
        assert.strictEqual(
            typeof pluginReg.hasPluginPath === "function" ? pluginReg.hasPluginPath("string", "nonexistentWidget") : true,
            false,
            "PluginRegistry.hasPluginPath('string', 'nonexistentWidget') returns false for unregistered widget"
        );
        var stringWidgets = typeof pluginReg.getRegisteredWidgets === "function" ? pluginReg.getRegisteredWidgets("string") : [];
        assert.strictEqual(
            Array.isArray(stringWidgets) && stringWidgets.indexOf("textArea") !== -1 && stringWidgets.indexOf("password") !== -1,
            true,
            "PluginRegistry.getRegisteredWidgets('string') lists registered widget names for the given type"
        );
        assert.strictEqual(
            typeof pluginReg.hasLayoutPath === "function" && pluginReg.hasLayoutPath("form") && !pluginReg.hasLayoutPath("nonexistentLayout"),
            true,
            "PluginRegistry.hasLayoutPath checks whether a layout strategy is registered"
        );
        assert.deepEqual(
            typeof pluginReg.getRegisteredLayouts === "function" ? pluginReg.getRegisteredLayouts() : [],
            ["form", "table", "wizard", "compact"],
            "PluginRegistry.getRegisteredLayouts lists all registered layout strategy keys"
        );
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
        assert.strictEqual(findDelta(deltas1, "/Coupon", "enabled").value, false, "Disable policy disables target when IsNull is true");
        assert.strictEqual(findDelta(deltas1, "/ApplyBtn", "enabled").value, false, "Enable policy disables target when IsNotNull is false");

        var deltas2 = policyEngine.evaluate({ Role: "Admin", Amount: 2500, Age: 25, PromoCode: "SAVE20", PrimaryPhone: "+6421000" });

        assert.strictEqual(findDelta(deltas2, "/SecretField", "visibility").value, true, "Show policy reveals target when StringEquals is true");
        assert.strictEqual(findDelta(deltas2, "/PublicNote", "visibility").value, false, "Hide policy hides target when StringEquals is true");
        assert.strictEqual(findDelta(deltas2, "/TaxId", "required").value, true, "Require policy requires target when NumericGreaterThan is true");
        assert.strictEqual(findDelta(deltas2, "/BackupPhone", "required").value, false, "Optional policy marks optional when condition is true");
        assert.strictEqual(findDelta(deltas2, "/Age", "validity").value, true, "Invalidate policy clears invalid state when NumericLessThan is false");
        assert.strictEqual(findDelta(deltas2, "/Coupon", "enabled").value, true, "Disable policy re-enables target when IsNull is false");
        assert.strictEqual(findDelta(deltas2, "/ApplyBtn", "enabled").value, true, "Enable policy enables target when IsNotNull is true");
        assert.strictEqual(findDelta(deltas1, "/Coupon", "editable"), undefined, "Disable emits on the enabled axis only, never the editable one");
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
            // LayoutScorer no longer writes to the schema; LayoutMutator applies its decisions.
            LayoutMutator.apply(customScoreSchema);
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

    QUnit.test("PayloadValidator preserves a $ref definition's constraints (undefined-overwrite regression)", function (assert) {
        // Regression: the $ref merge was `{ ...resolved, ...local }`. SchemaNormalizer emits
        // every keyword as an own property, so an absent maxLength is present-and-undefined
        // and overwrote the definition's real constraint. Validation was silently disabled on
        // every $ref node -- i.e. on every OpenAPI-derived schema, since layoutBudget
        // defaults to 0 and $ref nodes are therefore never inlined.
        var raw = {
            type: "object",
            properties: { Code: { $ref: "#/definitions/Code" } },
            definitions: { Code: { type: "string", maxLength: 3, pattern: "^[A-Z]+$" } }
        };
        var normalized = SchemaNormalizer.normalize(raw);
        var codeMeta = normalized.properties.Code;

        assert.strictEqual(
            Object.prototype.hasOwnProperty.call(codeMeta, "maxLength") && codeMeta.maxLength === undefined,
            true,
            "Precondition: the normalized $ref node carries maxLength as an own undefined property"
        );

        function resolveDefinition(ref) {
            return normalized.definitions[ref.split("/").pop()] || null;
        }

        var tooLong = PayloadValidator.validateTree(codeMeta, "TOOLONG", resolveDefinition);
        assert.strictEqual(tooLong.isValid, false, "maxLength from the $ref definition is enforced");

        var lower = PayloadValidator.validateTree(codeMeta, "lower", resolveDefinition);
        assert.strictEqual(lower.isValid, false, "A value violating the definition's constraints is rejected");

        var ok = PayloadValidator.validateTree(codeMeta, "AB", resolveDefinition);
        assert.strictEqual(ok.isValid, true, "A conforming value still passes");

        // A sibling override on the local node must still win over the definition.
        var overridden = JSON.parse(JSON.stringify(codeMeta));
        overridden.maxLength = 10;
        var widened = PayloadValidator.validateTree(overridden, "TOOLONG", resolveDefinition);
        assert.strictEqual(widened.isValid, true, "An explicit local override still takes precedence over the definition");
    });

    QUnit.test("OpenApiPropertyMapper honours MAX_SCHEMA_DEPTH levels of nesting (depth accounting regression)", function (assert) {
        // Regression: mapProperties and mapPropertyMetadata are the two halves of one
        // nesting level, but both incremented depth, so the stated limit bit at half of it.
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

        // The documented limit must actually be reachable, not half of it. Read from the shared
        // constant, so moving MAX_SCHEMA_DEPTH can never leave this asserting a stale number.
        var atLimit = leafAt(OpenApiBuilder.build(nestedSpec(MAX_SCHEMA_DEPTH), "Root"), MAX_SCHEMA_DEPTH);
        assert.strictEqual(atLimit.type, "string", "Leaf at MAX_SCHEMA_DEPTH keeps its declared type");
        assert.strictEqual(atLimit.maxLength, 7, "Leaf at MAX_SCHEMA_DEPTH keeps its constraints");

        // The guard must still stop runaway nesting rather than recursing without bound.
        var beyond = MAX_SCHEMA_DEPTH + 4;
        var atBeyond = leafAt(OpenApiBuilder.build(nestedSpec(beyond), "Root"), beyond);
        assert.strictEqual(atBeyond, undefined, "Nesting beyond MAX_SCHEMA_DEPTH is still truncated, not unbounded");

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
        var diamondTable = LayoutScorer.apply(diamondRoot, 50, diamondDefs);
        var elapsedMs = Date.now() - t0;
        // LayoutScorer no longer writes to the schema; LayoutMutator applies its decisions.
        LayoutMutator.apply(diamondRoot, diamondTable);
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
                warnMessages.some(function (w) {
                    return String(w.msg).indexOf('{"path":"/foo"}') !== -1 && w.details === undefined && w.comp === "HostControlMetadata";
                }),
                true,
                "Row 4: Ambiguous constructor string '{\"path\":\"/foo\"}' emits a non-silent Logger.warn diagnostic in the message slot with component 'HostControlMetadata'"
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

    QUnit.test("OpenAPI ingestion hardening: allOf merge, OA2 parameter parity, closed objects and pointer round-trips", function (assert) {
        // --- Defect 1: deepMergeSchemas destroyed a user property literally NAMED "type" ---------------
        // The keyword rules were applied to the keys of a `properties` map, where keys are user property
        // names. With the textbook discriminator pattern the derived branch's whole definition for the
        // property called "type" was discarded, taking its enum with it.
        var discSpec = {
            openapi: "3.0.0",
            components: {
                schemas: {
                    Pet: {
                        type: "object",
                        discriminator: { propertyName: "type" },
                        properties: { type: { type: "string" }, name: { type: "string" } }
                    },
                    Dog: {
                        allOf: [
                            { $ref: "#/components/schemas/Pet" },
                            {
                                type: "object",
                                properties: {
                                    type: { type: "string", enum: ["dog"] },
                                    bark: { type: "boolean" }
                                }
                            }
                        ]
                    },
                    DogReversed: {
                        allOf: [
                            {
                                type: "object",
                                properties: { type: { type: "string", enum: ["dog"] } }
                            },
                            { $ref: "#/components/schemas/Pet" }
                        ]
                    }
                }
            }
        };
        var dog = OpenApiBuilder.build(discSpec, "Dog");
        assert.deepEqual(
            dog.properties.type.enum,
            ["dog"],
            "allOf merge keeps the narrowing enum of a property literally named 'type' (discriminator pattern)"
        );
        assert.strictEqual(
            dog.properties.type.ui.widget,
            "select",
            "the discriminator property named 'type' still renders as a select with its enum options"
        );
        assert.strictEqual(
            dog.properties.name.type,
            "string",
            "sibling properties inherited from the base $ref survive the same merge"
        );
        assert.deepEqual(
            OpenApiBuilder.build(discSpec, "DogReversed").properties.type.enum,
            ["dog"],
            "the same merge is order-independent: the narrowing branch first yields the same enum"
        );
        var namedKeywordProps = OpenApiConstraintMapper.resolveAllOf({
            allOf: [
                { type: "object", properties: { enum: { type: "string" }, pattern: { type: "string" } } },
                { type: "object", properties: { enum: { maxLength: 4 }, pattern: { maxLength: 6 } } }
            ]
        }, {});
        assert.strictEqual(
            namedKeywordProps.properties.enum.maxLength,
            4,
            "properties named after other keywords ('enum') merge as sub-schemas, not by the keyword rules"
        );
        assert.strictEqual(
            namedKeywordProps.properties.pattern.type,
            "string",
            "a property named 'pattern' keeps its own type instead of being regex-composed"
        );

        // --- Defect 2: OpenAPI 2.0 non-body parameters lost six keywords that 3.0 kept -----------------
        var oa2ParamSpec = {
            swagger: "2.0",
            paths: {
                "/items": {
                    get: {
                        parameters: [
                            {
                                name: "n", in: "query", type: "integer", multipleOf: 5,
                                minimum: 10, exclusiveMinimum: true, maximum: 100, exclusiveMaximum: true
                            },
                            {
                                name: "tags", in: "query", type: "array", items: { type: "string" },
                                maxItems: 7, minItems: 2, uniqueItems: true
                            }
                        ],
                        responses: { "200": { description: "ok" } }
                    }
                }
            },
            definitions: { Dummy: { type: "object", properties: { d: { type: "string" } } } }
        };
        var oa3ParamSpec = {
            openapi: "3.0.0",
            paths: {
                "/items": {
                    get: {
                        parameters: [
                            {
                                name: "n", in: "query",
                                schema: {
                                    type: "integer", multipleOf: 5,
                                    minimum: 10, exclusiveMinimum: true, maximum: 100, exclusiveMaximum: true
                                }
                            },
                            {
                                name: "tags", in: "query",
                                schema: { type: "array", items: { type: "string" }, maxItems: 7, minItems: 2, uniqueItems: true }
                            }
                        ],
                        responses: { "200": { description: "ok" } }
                    }
                }
            },
            components: { schemas: { Dummy: { type: "object", properties: { d: { type: "string" } } } } }
        };
        var oa2Params = OpenApiBuilder.build(oa2ParamSpec, "#/paths/~1items/get").properties;
        var oa3Params = OpenApiBuilder.build(oa3ParamSpec, "#/paths/~1items/get").properties;
        assert.deepEqual(
            oa2Params,
            oa3Params,
            "the same logical operation produces identical parameter metadata in OpenAPI 2.0 and 3.0"
        );
        assert.strictEqual(oa2Params.n.multipleOf, 5, "OA2 non-body parameter keeps multipleOf");
        assert.strictEqual(oa2Params.n.exclusiveMinimum, true, "OA2 non-body parameter keeps exclusiveMinimum");
        assert.strictEqual(oa2Params.n.exclusiveMaximum, true, "OA2 non-body parameter keeps exclusiveMaximum");
        assert.strictEqual(oa2Params.tags.maxItems, 7, "OA2 non-body parameter keeps maxItems");
        assert.strictEqual(oa2Params.tags.minItems, 2, "OA2 non-body parameter keeps minItems");
        assert.strictEqual(oa2Params.tags.uniqueItems, true, "OA2 non-body parameter keeps uniqueItems");

        // --- Defect 3: additionalProperties:false was dropped on the OpenAPI path ----------------------
        var closedSpec = {
            openapi: "3.0.0",
            components: {
                schemas: {
                    Closed: { type: "object", additionalProperties: false, properties: { a: { type: "string" } } },
                    Holder: {
                        type: "object",
                        properties: {
                            inner: { type: "object", additionalProperties: false, properties: { b: { type: "string" } } }
                        }
                    }
                }
            }
        };
        assert.strictEqual(
            OpenApiBuilder.build(closedSpec, "Closed").additionalProperties,
            false,
            "a root schema's additionalProperties:false reaches ISchema instead of being dropped"
        );
        var holder = OpenApiBuilder.build(closedSpec, "Holder");
        assert.strictEqual(
            holder.properties.inner.additionalProperties,
            false,
            "a nested property's additionalProperties:false reaches IPropertyMetadata"
        );
        var hybridMerged = DataInferenceBuilder.mergeHybridProperties(
            { inner: { type: "object", properties: { b: { type: "string" }, leaked: { type: "string" } } } },
            holder.properties
        );
        assert.strictEqual(
            hybridMerged.inner.properties.leaked,
            undefined,
            "DataInferenceBuilder's `=== false` guard now engages on OpenAPI schemas: inferred keys stay out of a closed object"
        );
        assert.strictEqual(
            Boolean(hybridMerged.inner.properties.b),
            true,
            "the closed object's own declared key survives the hybrid merge"
        );

        // --- Defect 4: a root schema typed ["array","null"] was classified as an object ----------------
        var unionArray = OpenApiBuilder.build({
            openapi: "3.0.0",
            components: { schemas: { Bag: { type: ["array", "null"], items: { type: "string" } } } }
        }, "Bag");
        assert.strictEqual(unionArray.type, "array", "root type ['array','null'] resolves to an array schema");
        assert.strictEqual(unionArray.layoutStrategy, "table", "root type ['array','null'] selects the table layout strategy");
        assert.strictEqual(unionArray.items && unionArray.items.type, "string", "root type ['array','null'] maps its items");
        assert.strictEqual(unionArray.properties, undefined, "root type ['array','null'] is not wrapped in a synthesized property");

        // --- Defect 5: allOf unioned sibling anyOf/oneOf arrays instead of intersecting ----------------
        var siblingAnyOf = OpenApiConstraintMapper.resolveAllOf({
            allOf: [{ anyOf: [{ type: "string" }] }, { anyOf: [{ type: "integer" }] }]
        }, {});
        assert.strictEqual(
            siblingAnyOf.anyOf.length,
            1,
            "allOf does not concatenate two sibling anyOf branch lists into an 'either' union"
        );
        assert.strictEqual(siblingAnyOf.anyOf[0].type, "string", "the surviving anyOf branch list is the first one declared");
        var siblingOneOf = OpenApiConstraintMapper.resolveAllOf({
            allOf: [{ oneOf: [{ type: "string" }] }, { oneOf: [{ type: "integer" }] }]
        }, {});
        assert.strictEqual(siblingOneOf.oneOf.length, 1, "allOf does not concatenate two sibling oneOf branch lists either");
        var unionedRequired = OpenApiConstraintMapper.resolveAllOf({
            allOf: [{ type: "object", required: ["a"] }, { type: "object", required: ["b"] }]
        }, {});
        assert.deepEqual(
            unionedRequired.required.slice().sort(),
            ["a", "b"],
            "no regression: 'required' is still unioned, which is the correct intersection for that keyword"
        );

        // --- Defect 6: the allOf pattern merge renumbered capture groups ------------------------------
        var patA = "(a)\\1";
        var patB = "(b)\\1";
        assert.strictEqual(new RegExp(patA).test("aabb"), true, "precondition: source pattern '(a)\\1' accepts 'aabb'");
        assert.strictEqual(new RegExp(patB).test("aabb"), true, "precondition: source pattern '(b)\\1' accepts 'aabb'");
        var backrefMerge = OpenApiConstraintMapper.resolveAllOf({
            allOf: [{ type: "string", pattern: patA }, { type: "string", pattern: patB }]
        }, {});
        assert.strictEqual(
            new RegExp(backrefMerge.pattern).test("aabb"),
            true,
            "the merged pattern still accepts a string that both source patterns accept (backreferences not rewired)"
        );
        var namedGroupMerge = OpenApiConstraintMapper.resolveAllOf({
            allOf: [{ type: "string", pattern: "(?<x>a)" }, { type: "string", pattern: "(?<x>b)" }]
        }, {});
        var namedGroupCompiles = true;
        try {
            new RegExp(namedGroupMerge.pattern);
        } catch (namedGroupError) {
            namedGroupCompiles = false;
        }
        assert.strictEqual(
            namedGroupCompiles,
            true,
            "merging two patterns that share a named capture group yields a regex that still compiles"
        );
        var safePatternMerge = OpenApiConstraintMapper.resolveAllOf({
            allOf: [{ type: "string", pattern: "[a-z]+" }, { type: "string", pattern: "[0-9]+" }]
        }, {});
        assert.strictEqual(
            new RegExp(safePatternMerge.pattern).test("ab12"),
            true,
            "no regression: group-free patterns still compose into a conjunction that accepts a conforming string"
        );
        assert.strictEqual(
            new RegExp(safePatternMerge.pattern).test("abcd"),
            false,
            "no regression: the composed group-free conjunction still rejects a string failing the second pattern"
        );

        // --- Defect 7: percent-encoding broke JSON Pointer round-trips --------------------------------
        var pctSpec = {
            openapi: "3.0.0",
            paths: {
                "/a%20b/{id}": {
                    get: {
                        responses: {
                            "200": {
                                content: {
                                    "application/json": {
                                        schema: { type: "object", properties: { escapedOnly: { type: "string" } } }
                                    }
                                }
                            }
                        }
                    }
                }
            },
            components: { schemas: { Unrelated: { type: "object", properties: { unrelated: { type: "string" } } } } }
        };
        var pctTargets = OpenApiExtractor.extractTargets(pctSpec);
        var pctTarget = pctTargets.filter(function (target) {
            return target.text.indexOf("/a%20b/{id}") >= 0;
        })[0];
        assert.strictEqual(Boolean(pctTarget), true, "precondition: the extractor offers the percent-containing operation");
        var pctBuilt = OpenApiBuilder.build(pctSpec, pctTarget.key);
        assert.strictEqual(
            Boolean(pctBuilt.properties && pctBuilt.properties.escapedOnly),
            true,
            "a key offered by extractTargets resolves back to its own operation schema, not an unrelated definition"
        );
        assert.strictEqual(
            pctBuilt.ui && pctBuilt.ui.options && pctBuilt.ui.options.targetFallbackWarning,
            undefined,
            "no silent fallback: the percent-containing operation target produces no targetFallbackWarning"
        );
        assert.strictEqual(
            OpenApiRefResolver.unescapePointerSegment(OpenApiRefResolver.escapePointerSegment("/a%20b/{id}")),
            "/a%20b/{id}",
            "escapePointerSegment and unescapePointerSegment are inverses for a segment containing '%'"
        );
        assert.strictEqual(
            OpenApiRefResolver.escapePointerSegment("/a~b/c"),
            "~1a~0b~1c",
            "no regression: '~' -> '~0' and '/' -> '~1' escaping is unchanged"
        );
        assert.strictEqual(
            OpenApiRefResolver.unescapePointerSegment(OpenApiRefResolver.escapePointerSegment("/a~b/c")),
            "/a~b/c",
            "no regression: the '~0'/'~1' round trip is still exact"
        );

        // --- Defect 8: a contradictory allOf enum intersection became unconstrained free text ----------
        var impossible = OpenApiBuilder.build({
            openapi: "3.0.0",
            components: {
                schemas: {
                    Impossible: {
                        type: "object",
                        properties: { x: { allOf: [{ type: "string", enum: ["a"] }, { type: "string", enum: ["b"] }] } }
                    }
                }
            }
        }, "Impossible");
        assert.deepEqual(
            impossible.properties.x.enum,
            [],
            "an allOf enum intersection that admits no value keeps the empty enum instead of dropping it"
        );
        assert.strictEqual(
            impossible.properties.x.ui.widget,
            "select",
            "an unsatisfiable enum renders as an empty selection, never as unconstrained free text"
        );
        assert.strictEqual(
            impossible.properties.x.ui.enabled,
            false,
            "an unsatisfiable enum renders disabled, so the contradiction is visible rather than silent"
        );
    });

    QUnit.module("Core Architecture: Core-Layer Defect Regressions (13.10)");

    QUnit.test("13.10.1: SchemaNormalizer charges recursion depth once per nesting level and warns when it truncates", function (assert) {
        // A leaf 8 levels down. Charging depth in both normalizeProperties and normalizePropertyMetadata
        // made the cap bite at level 5, so this leaf lost its type and every constraint.
        var i;
        var node = { type: "string", maxLength: 7, description: "Deep leaf" };
        for (i = 8; i >= 1; i--) {
            var wrapper = { type: "object", properties: {} };
            wrapper.properties["L" + i] = node;
            node = wrapper;
        }
        var deepSchema = SchemaNormalizer.normalize(node);
        var cursor = deepSchema.properties;
        var leafMeta;
        for (i = 1; i <= 8; i++) {
            leafMeta = cursor ? cursor["L" + i] : undefined;
            cursor = leafMeta ? leafMeta.properties : undefined;
        }
        assert.strictEqual(leafMeta ? leafMeta.type : undefined, "string", "A leaf nested 8 levels deep keeps its declared type");
        assert.strictEqual(leafMeta ? leafMeta.maxLength : undefined, 7, "A leaf nested 8 levels deep keeps its maxLength constraint");
        assert.strictEqual(leafMeta ? leafMeta.description : undefined, "Deep leaf", "A leaf nested 8 levels deep keeps its description");

        // oneOf/anyOf branch lists were halved by the same double increment.
        var polyNode = {
            type: "object",
            oneOf: [{ type: "object", title: "BranchA", properties: { Flag: { type: "boolean" } } }]
        };
        for (i = 5; i >= 1; i--) {
            var polyWrapper = { type: "object", properties: {} };
            polyWrapper.properties["P" + i] = polyNode;
            polyNode = polyWrapper;
        }
        var polySchema = SchemaNormalizer.normalize(polyNode);
        var polyCursor = polySchema.properties;
        var polyMeta;
        for (i = 1; i <= 5; i++) {
            polyMeta = polyCursor ? polyCursor["P" + i] : undefined;
            polyCursor = polyMeta ? polyMeta.properties : undefined;
        }
        assert.strictEqual(
            polyMeta && polyMeta.oneOf && polyMeta.oneOf.length ? polyMeta.oneOf[0].title : undefined,
            "BranchA",
            "A oneOf branch 5 levels deep is still normalized instead of collapsing to a placeholder"
        );

        // Genuine truncation must be audible, exactly like OpenApiPropertyMapper.
        var tooDeep = { type: "string" };
        for (i = MAX_SCHEMA_DEPTH + 4; i >= 1; i--) {
            var deepWrapper = { type: "object", properties: {} };
            deepWrapper.properties["D" + i] = tooDeep;
            tooDeep = deepWrapper;
        }
        var warnings = [];
        var origWarn = Logger.warn;
        Logger.warn = function (msg, details) {
            warnings.push(String(msg) + " " + String(details));
        };
        try {
            SchemaNormalizer.normalize(tooDeep);
        } finally {
            Logger.warn = origWarn;
        }
        assert.strictEqual(
            warnings.some(function (w) { return w.indexOf("MAX_SCHEMA_DEPTH") !== -1; }),
            true,
            "SchemaNormalizer logs a warning when it actually truncates, instead of degrading silently"
        );
    });

    QUnit.test("13.10.2: ValidationLedger treats the root array path '/' as a row prefix instead of wiping the ledger", function (assert) {
        var noPlugin = function () { return undefined; };
        var noPlugins = function () { return []; };
        var noHost = function () { return undefined; };

        var rootLedger = new ValidationLedger(false, noPlugin, noPlugins, noHost);
        rootLedger.reportSchemaError("/0/Name", "Row 0 invalid");
        rootLedger.reportSchemaError("/1/Name", "Row 1 invalid");
        rootLedger.reportCustomError("/Summary/Total", "Consumer custom error");

        var shifted = rootLedger.extractShiftedRowEntries("/", 0);
        assert.strictEqual(shifted.length, 1, "Deleting root-array row 0 extracts the surviving row-1 entry");
        assert.strictEqual(
            shifted.length ? shifted[0].key : undefined,
            "0/Name",
            "The surviving root-array row entry shifts from '1/Name' down to '0/Name'"
        );

        rootLedger.clearArrayEntries("/");
        rootLedger.restoreRowEntries(shifted);
        var rootKeys = rootLedger.validateAll(false).map(function (e) { return e.fieldKey; }).sort();
        assert.deepEqual(
            rootKeys,
            ["0/Name", "Summary/Total"],
            "A root-array row delete keeps the shifted row error and the consumer custom error"
        );
        assert.strictEqual(
            rootLedger.hasActiveErrors(),
            true,
            "hasActiveErrors() still reports an invalid root-array form after a row delete"
        );

        // Control case: a named array must behave identically.
        var namedLedger = new ValidationLedger(false, noPlugin, noPlugins, noHost);
        namedLedger.reportSchemaError("/Items/0/Name", "Row 0 invalid");
        namedLedger.reportSchemaError("/Items/1/Name", "Row 1 invalid");
        namedLedger.reportCustomError("/Summary/Total", "Consumer custom error");
        var namedShifted = namedLedger.extractShiftedRowEntries("/Items", 0);
        namedLedger.clearArrayEntries("/Items");
        namedLedger.restoreRowEntries(namedShifted);
        var namedKeys = namedLedger.validateAll(false).map(function (e) { return e.fieldKey; }).sort();
        assert.deepEqual(
            namedKeys,
            ["Items/0/Name", "Summary/Total"],
            "Named array '/Items' already behaved this way and is unchanged"
        );

        // The Clear Form action clears the whole ledger through the empty prefix; that must still work.
        namedLedger.clearArrayEntries("");
        assert.strictEqual(
            namedLedger.hasActiveErrors(),
            false,
            "clearArrayEntries('') still purges every ledger entry for the Clear Form action"
        );

        rootLedger.clear();
        namedLedger.clear();
    });

    QUnit.test("13.10.3: Policy Optional/Hide on a table cell never destroys a real schema error", function (assert) {
        var rowSchema = SchemaNormalizer.normalize({
            type: "object",
            properties: {
                Items: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: { Code: { type: "string", maxLength: 3 } },
                        required: ["Code"]
                    }
                }
            }
        });

        var badState = new StateManager({ Items: [{ Code: "TOO-LONG" }] }, rowSchema);
        var badHost = {
            activeModelName: "meta",
            generatedContent: null,
            getStateManager: function () { return badState; }
        };
        var badLedger = new ValidationLedger(
            false,
            function () { return undefined; },
            function () { return []; },
            function () { return badHost; }
        );
        badLedger.reportSchemaError("Items/0/Code", "Maximum length is 3.");
        badLedger.applyRowControlState("Items/0/Code", "required", false);
        assert.strictEqual(
            badLedger.hasActiveErrors(),
            true,
            "Policy 'Optional' keeps a maxLength failure because re-validation still rejects the value"
        );

        badLedger.applyRowControlState("Items/0/Code", "visibility", false);
        assert.strictEqual(
            badLedger.hasActiveErrors(),
            false,
            "Hiding the cell suppresses the error through isPathHidden() rather than deleting it"
        );
        badLedger.applyRowControlState("Items/0/Code", "visibility", true);
        assert.strictEqual(
            badLedger.hasActiveErrors(),
            true,
            "Re-showing the cell restores the suppressed maxLength failure"
        );

        // A pure 'required' failure must still clear when the policy makes the cell optional.
        var emptyState = new StateManager({ Items: [{ Code: "" }] }, rowSchema);
        var emptyHost = {
            activeModelName: "meta",
            generatedContent: null,
            getStateManager: function () { return emptyState; }
        };
        var emptyLedger = new ValidationLedger(
            false,
            function () { return undefined; },
            function () { return []; },
            function () { return emptyHost; }
        );
        emptyLedger.reportSchemaError("Items/0/Code", "This field is required.");
        emptyLedger.applyRowControlState("Items/0/Code", "required", false);
        assert.strictEqual(
            emptyLedger.hasActiveErrors(),
            false,
            "Policy 'Optional' still clears a required-only failure that now passes re-validation"
        );

        badLedger.clear();
        emptyLedger.clear();
        badState.destroy();
        emptyState.destroy();
    });

    QUnit.test("13.10.4: StateManager purges array messages on path-segment boundaries only", function (assert) {
        var sm = new StateManager({ Item: [{ Name: "a" }], ItemTotal: 1, Items: [{ Name: "b" }] }, { type: "object" });
        var model = sm.getModel();
        var targets = ["/Item", "/Item/0/Name", "/ItemTotal", "/Items/0/Name"];
        var messages = targets.map(function (target) {
            return new Message({ message: "err " + target, target: target, type: MessageType.Error, processor: model });
        });
        Messaging.addMessages(messages);
        sm.clearArrayMessages("/Item");
        var remaining = sm.getOwnMessages().map(function (m) { return m.getTarget(); }).sort();
        assert.deepEqual(
            remaining,
            ["/ItemTotal", "/Items/0/Name"],
            "Clearing '/Item' leaves the sibling '/ItemTotal' and the unrelated '/Items/0/Name' messages alone"
        );
        sm.destroy();

        var rootSm = new StateManager([{ Name: "a" }], { type: "array" });
        var rootModel = rootSm.getModel();
        Messaging.addMessages([
            new Message({ message: "root row", target: "/0/Name", type: MessageType.Error, processor: rootModel })
        ]);
        rootSm.clearArrayMessages("/");
        assert.strictEqual(
            rootSm.getOwnMessages().length,
            0,
            "The root array path '/' still purges every row message"
        );
        rootSm.destroy();
    });

    QUnit.test("13.10.5: PluginRegistry resolves nested uiLayout scopes when preloading widget plugins", function (assert) {
        var nestedReg = new PluginRegistry();
        var nestedSchema = SchemaNormalizer.normalize({
            type: "object",
            properties: { Header: { type: "object", properties: { Active: { type: "boolean" } } } },
            uiLayout: [
                {
                    type: "Group",
                    label: "Header",
                    elements: [{ type: "Control", scope: "#/properties/Header/properties/Active", widget: "switch" }]
                }
            ]
        });
        var nestedPaths = Array.from(nestedReg.getPathsToLoad(nestedSchema));
        assert.strictEqual(
            nestedPaths.indexOf("nz/co/siliconst/ui5/metaui/plugins/controls/SwitchPlugin") !== -1,
            true,
            "A nested scope resolves to type 'boolean' so the 'switch' widget's SwitchPlugin is preloaded"
        );
        assert.strictEqual(
            nestedPaths.indexOf("nz/co/siliconst/ui5/metaui/plugins/controls/StringPlugin") !== -1,
            false,
            "The nested scope no longer falls back to the default 'string' plugin"
        );
    });

    QUnit.test("13.10.6: PluginRegistry registers through Registry.register and exposes its action index", function (assert) {
        var dupReg = new PluginRegistry();
        // Registry.register reports an overwrite at ERROR level, not WARNING: Logger.warn maps to Log.warning,
        // which UI5 discards at its default ERROR log level, so the old warning was never observable in a
        // default-configured application. Both levels are captured here so a regression either way is caught.
        var overwrites = [];
        var origWarn = Logger.warn;
        var origError = Logger.error;
        Logger.warn = function (msg) { overwrites.push({ level: "warn", message: String(msg) }); };
        Logger.error = function (msg) { overwrites.push({ level: "error", message: String(msg) }); };
        try {
            dupReg.registerPluginPath("string", "regressionProbeWidget", "custom/test/ProbeA");
            dupReg.registerPluginPath("string", "regressionProbeWidget", "custom/test/ProbeB");
            dupReg.registerLayoutPath("regressionProbeLayout", "custom/test/LayoutA");
            dupReg.registerLayoutPath("regressionProbeLayout", "custom/test/LayoutB");
        } finally {
            Logger.warn = origWarn;
            Logger.error = origError;
        }
        var matched = function (indexName, key) {
            return overwrites.filter(function (o) {
                return o.message.indexOf(indexName) !== -1 && o.message.indexOf(key) !== -1;
            });
        };
        var fieldOverwrites = matched("FieldPluginIndex", "regressionProbeWidget");
        var layoutOverwrites = matched("LayoutIndex", "regressionProbeLayout");
        assert.strictEqual(
            fieldOverwrites.length,
            1,
            "registerPluginPath() goes through Registry.register, so replacing a mapping is not silent"
        );
        assert.strictEqual(
            fieldOverwrites[0].level,
            "error",
            "The overwrite is reported at error level, which survives UI5's default ERROR log level"
        );
        assert.strictEqual(
            layoutOverwrites.length,
            1,
            "registerLayoutPath() goes through Registry.register too"
        );
        assert.strictEqual(
            layoutOverwrites[0].level,
            "error",
            "A replaced layout strategy is reported at the same observable level"
        );
        assert.strictEqual(
            dupReg.fieldIndex.get("string:regressionProbeWidget"),
            "custom/test/ProbeB",
            "The last registration still wins after the diagnostic"
        );

        dupReg.registerActionPath("regressionProbeAction", "custom/test/ProbeAction");
        assert.strictEqual(
            typeof dupReg.getActionPath === "function" ? dupReg.getActionPath("regressionProbeAction") : undefined,
            "custom/test/ProbeAction",
            "registerActionPath() is wired up: the formerly write-only actionIndex is readable via getActionPath()"
        );

        var actionReg = new PluginRegistry();
        actionReg.registerActionPath(
            "customSubmitAction",
            "nz/co/siliconst/ui5/metaui/plugins/actions/SubmitFormActionPlugin"
        );
        var actionSchema = SchemaNormalizer.normalize({
            type: "object",
            properties: {
                Trigger: { type: "object", ui: { widget: "customSubmitAction", label: "Run Action" } }
            }
        });
        var pathsToLoad = actionReg.getPathsToLoad(actionSchema);
        assert.ok(
            pathsToLoad.has("nz/co/siliconst/ui5/metaui/plugins/actions/SubmitFormActionPlugin"),
            "getPathsToLoad() resolves a widget registered via registerActionPath() across any field type"
        );
        var actionEngine = new Engine(true, false, actionReg);
        var actionCtrl = actionEngine.generateField(
            actionSchema.properties.Trigger,
            "/Trigger",
            "meta",
            false
        );
        assert.strictEqual(
            actionCtrl.getIcon(),
            "sap-icon://accept",
            "Engine.generateField() instantiates the action plugin registered via registerActionPath() through getActionPlugin()"
        );
        actionEngine.destroy();
        actionCtrl.destroy();
    });

    QUnit.test("13.10.7: LayoutMutator emits one dialog Control per scope across sibling containers", function (assert) {
        var dialogSchema = SchemaNormalizer.normalize({
            type: "object",
            properties: {
                Address: {
                    type: "object",
                    ui: { renderMode: "dialog" },
                    properties: { Street: { type: "string" }, City: { type: "string" } }
                }
            },
            uiLayout: [
                {
                    type: "Group",
                    label: "G1",
                    elements: [{ type: "Control", scope: "#/properties/Address/properties/Street" }]
                },
                {
                    type: "Group",
                    label: "G2",
                    elements: [{ type: "Control", scope: "#/properties/Address/properties/City" }]
                }
            ]
        });
        LayoutMutator.apply(dialogSchema);
        var dialogControls = [];
        var collectDialogControls = function (elements) {
            if (!Array.isArray(elements)) {
                return;
            }
            elements.forEach(function (el) {
                if (el.type === "Control" && el.scope === "#/properties/Address") {
                    dialogControls.push(el);
                }
                collectDialogControls(el.elements);
            });
        };
        collectDialogControls(dialogSchema.uiLayout);
        assert.strictEqual(
            dialogControls.length,
            1,
            "A dialog-rendered property referenced from two sibling containers emits exactly one Control"
        );
    });

    QUnit.test("13.10.8: Engine.build() destroys the previous build's plugins instead of leaking them", function (assert) {
        var registry = PluginRegistry.getInstance();
        var origGetPlugin = registry.getPlugin;
        var created = [];
        registry.getPlugin = function (type, widgetName) {
            var instance = origGetPlugin.call(this, type, widgetName);
            created.push(instance);
            return instance;
        };
        var destroyed = 0;
        var spyDestroy = function (plugin) {
            var originalDestroy = plugin.destroy.bind(plugin);
            plugin.destroy = function () {
                destroyed++;
                originalDestroy();
            };
        };
        var formSchema = SchemaNormalizer.normalize({
            type: "object",
            properties: { A: { type: "string" }, B: { type: "string" } },
            uiLayout: [
                { type: "Control", scope: "#/properties/A" },
                { type: "Control", scope: "#/properties/B" }
            ]
        });
        var tableSchema = SchemaNormalizer.normalize({
            type: "array",
            layoutStrategy: "table",
            items: {
                type: "object",
                properties: { Code: { type: "string" } },
                uiLayout: [{ type: "Control", scope: "#/properties/Code" }]
            }
        });
        var formState = new StateManager({ A: "a", B: "b" }, formSchema);
        var tableState = new StateManager([{ Code: "c" }], tableSchema);
        var formEngine = new Engine(true, false, registry);
        var tableEngine = new Engine(true, false, registry);
        var firstFormRound = [];
        var firstTableRound = [];
        var builtControls = [];
        try {
            builtControls.push(formEngine.build(formSchema, formState.getModel(), "meta"));
            firstFormRound = created.slice();
            firstFormRound.forEach(spyDestroy);
            builtControls.push(formEngine.build(formSchema, formState.getModel(), "meta"));

            created.length = 0;
            builtControls.push(tableEngine.build(tableSchema, tableState.getModel(), "meta"));
            firstTableRound = created.slice();
            firstTableRound.forEach(spyDestroy);
            builtControls.push(tableEngine.build(tableSchema, tableState.getModel(), "meta"));
        } finally {
            registry.getPlugin = origGetPlugin;
        }
        assert.strictEqual(firstFormRound.length > 0, true, "The first form build instantiated at least one field plugin");
        assert.strictEqual(firstTableRound.length > 0, true, "The first table build instantiated at least one template plugin");
        assert.strictEqual(
            destroyed,
            firstFormRound.length + firstTableRound.length,
            "Engine.build() destroys every active and template plugin left over from the previous build"
        );
        builtControls.forEach(function (ctrl) {
            if (ctrl && !ctrl.bIsDestroyed) {
                ctrl.destroy();
            }
        });
        formEngine.destroy();
        tableEngine.destroy();
        formState.destroy();
        tableState.destroy();
    });

    QUnit.test("13.10.9: DataInferenceBuilder keeps DAG structure while still catching genuine cycles", function (assert) {
        var sharedObject = { Code: "A", Qty: 1 };
        var dagSchema = DataInferenceBuilder.inferSchemaFromData({ x: sharedObject, y: sharedObject });
        assert.strictEqual(dagSchema.properties.y.type, "object", "A sibling reference to the same object is not a cycle");
        assert.strictEqual(
            Boolean(dagSchema.properties.y.properties && dagSchema.properties.y.properties.Code),
            true,
            "The second reference to a shared object keeps its inferred structure"
        );

        var sharedRows = [{ Id: 1 }];
        var dagArraySchema = DataInferenceBuilder.inferSchemaFromData({ first: sharedRows, second: sharedRows });
        assert.strictEqual(
            dagArraySchema.properties.second.items.type,
            "object",
            "A sibling reference to the same array keeps its inferred row structure"
        );

        var selfCycle = { name: "root" };
        selfCycle.self = selfCycle;
        var selfSchema = DataInferenceBuilder.inferSchemaFromData(selfCycle);
        assert.strictEqual(selfSchema.properties.self.type, "string", "A genuine self-reference is still broken into a string");

        var nodeA = { label: "a" };
        var nodeB = { label: "b" };
        nodeA.child = nodeB;
        nodeB.parent = nodeA;
        var mutualSchema = DataInferenceBuilder.inferSchemaFromData(nodeA);
        assert.strictEqual(
            mutualSchema.properties.child.properties.parent.type,
            "string",
            "A genuine mutual reference cycle is still broken into a string"
        );

        var cyclicRows = [];
        cyclicRows.push({ list: cyclicRows });
        var cyclicArraySchema = DataInferenceBuilder.inferSchemaFromData(cyclicRows);
        assert.strictEqual(
            cyclicArraySchema.items.properties.list.items.type,
            "string",
            "A genuine array self-reference is still broken into a string"
        );
    });

    QUnit.module("Schema keywords: not, writeOnly, example and the withdrawn four");

    /** Normalizes a one-property document and returns that property's normalized metadata. */
    function normalizeOneField(raw) {
        return SchemaNormalizer.normalize({ type: "object", properties: { field: raw } }).properties.field;
    }

    /** Wraps a single property definition in the smallest OpenAPI 3.0 document that compiles. */
    function openApiWithField(raw) {
        return {
            openapi: "3.0.0",
            components: { schemas: { Probe: { type: "object", properties: { field: raw } } } }
        };
    }

    QUnit.test("'not' is enforced on both the JSON Schema and the OpenAPI path", function (assert) {
        var field = { type: "string", not: { const: "FORBIDDEN" } };

        var normalized = normalizeOneField(field);
        assert.strictEqual(
            PayloadValidator.validateTree(normalized, "FORBIDDEN").isValid,
            false,
            "A value matching the 'not' sub-schema is rejected (it was silently accepted before)"
        );
        assert.strictEqual(
            PayloadValidator.validateTree(normalized, "ALLOWED").isValid,
            true,
            "A value that does not match the 'not' sub-schema is accepted"
        );

        var fromOpenApi = OpenApiBuilder.build(openApiWithField(field), "Probe").properties.field;
        assert.strictEqual(
            PayloadValidator.validateTree(fromOpenApi, "FORBIDDEN").isValid,
            false,
            "The OpenAPI path reaches the same verdict: the two ingestion paths agree on 'not'"
        );
        assert.strictEqual(
            PayloadValidator.validateTree(fromOpenApi, "ALLOWED").isValid,
            true,
            "The OpenAPI path accepts a non-matching value"
        );

        var rangeField = normalizeOneField({ type: "integer", not: { minimum: 0, maximum: 9 } });
        assert.strictEqual(PayloadValidator.validateTree(rangeField, 5).isValid, false, "'not' inverts a range");
        assert.strictEqual(PayloadValidator.validateTree(rangeField, 50).isValid, true, "A value outside the negated range passes");

        var tableSchema = SchemaNormalizer.normalize({
            type: "array",
            items: { type: "object", properties: { code: { type: "string", not: { const: "FORBIDDEN" } } } }
        });
        var cellErrors = PayloadValidator.validatePayloadArrays(
            tableSchema,
            [{ code: "ok" }, { code: "FORBIDDEN" }],
            "",
            function () { return undefined; }
        ).filter(function (entry) { return !entry.isValid; });
        assert.deepEqual(
            cellErrors.map(function (entry) { return entry.fieldKey; }),
            ["1/code"],
            "A scalar table cell is validated through validateTree, so 'not' is enforced inside a table too"
        );

        var doubled = normalizeOneField({ type: "string", not: { not: { const: "KEEP" } } });
        assert.strictEqual(PayloadValidator.validateTree(doubled, "KEEP").isValid, true, "A 'not' inside a 'not' cancels out");
        assert.strictEqual(PayloadValidator.validateTree(doubled, "other").isValid, false, "Double negation still rejects the complement");
    });

    QUnit.test("'not' the engine cannot evaluate is reported, not silently honoured", function (assert) {
        var unevaluable = SchemaNormalizer.normalize({
            type: "object",
            properties: { field: { type: "string", not: { title: "nothing testable" } } }
        });
        assert.strictEqual(
            PayloadValidator.isEvaluableNot(unevaluable.properties.field.not),
            false,
            "A 'not' declaring no testable keyword is recognised as unevaluable"
        );
        var run = captureLogs(function () {
            return PayloadValidator.validateTree(unevaluable.properties.field, "anything");
        });
        assert.strictEqual(run.result.isValid, true, "An unevaluable 'not' accepts rather than rejecting everything");
        assert.strictEqual(
            run.warns.join(" | ").indexOf("no constraint this engine can evaluate") !== -1,
            true,
            "The unevaluable 'not' is reported through Logger rather than passing unnoticed"
        );

        var structural = SchemaValidator.validateSchemaStructure(unevaluable);
        assert.strictEqual(
            structural.join(" | ").indexOf("'not' sub-schema with no constraint") !== -1,
            true,
            "SchemaValidator reports the unenforceable 'not' once, before anything is rendered"
        );
        var enforceable = SchemaNormalizer.normalize({
            type: "object",
            properties: { field: { type: "string", not: { const: "FORBIDDEN" } } }
        });
        assert.deepEqual(
            SchemaValidator.validateSchemaStructure(enforceable),
            [],
            "An enforceable 'not' produces no structural complaint"
        );
    });

    QUnit.test("'writeOnly' values are stripped on ingestion and kept on write", function (assert) {
        var schema = SchemaNormalizer.normalize({
            type: "object",
            properties: {
                user: { type: "string" },
                password: { type: "string", writeOnly: true },
                profile: {
                    type: "object",
                    properties: { token: { type: "string", writeOnly: true }, nickname: { type: "string" } }
                },
                logins: {
                    type: "array",
                    items: { type: "object", properties: { secret: { type: "string", writeOnly: true }, at: { type: "string" } } }
                }
            }
        });
        assert.strictEqual(schema.properties.password.writeOnly, true, "writeOnly survives normalization for consumers to inspect");

        var inbound = {
            user: "rikardt",
            password: "came-back-from-the-server",
            profile: { token: "also-secret", nickname: "R" },
            logins: [{ secret: "s1", at: "2026-10-23" }]
        };
        var sm = new StateManager(inbound, schema);
        var seeded = sm.extractPayload();
        assert.strictEqual("password" in seeded, false, "A writeOnly value supplied as input never reaches the sandbox");
        assert.strictEqual("token" in seeded.profile, false, "The strip reaches nested objects");
        assert.strictEqual("secret" in seeded.logins[0], false, "The strip reaches array rows");
        assert.strictEqual(seeded.user, "rikardt", "Non-writeOnly siblings are untouched");
        assert.strictEqual(seeded.profile.nickname, "R", "Nested non-writeOnly siblings are untouched");
        assert.strictEqual(seeded.logins[0].at, "2026-10-23", "Row siblings are untouched");
        assert.strictEqual(
            inbound.password,
            "came-back-from-the-server",
            "The caller's own object is never mutated by the strip"
        );

        sm.setProperty("password", "typed-by-the-user");
        assert.strictEqual(
            sm.extractPayload().password,
            "typed-by-the-user",
            "A value the user types is still submitted - writeOnly suppresses the read, never the write"
        );
        sm.destroy();

        var dictSchema = SchemaNormalizer.normalize({
            type: "object",
            properties: { secrets: { type: "object", additionalProperties: { type: "string", writeOnly: true } } }
        });
        var dictSm = new StateManager({ secrets: { a: "x", b: "y" } }, dictSchema);
        assert.deepEqual(dictSm.extractPayload().secrets, {}, "A writeOnly additionalProperties schema strips every entry");
        dictSm.destroy();

        var fromOpenApi = OpenApiBuilder.build(openApiWithField({ type: "string", writeOnly: true }), "Probe");
        assert.strictEqual(
            fromOpenApi.properties.field.writeOnly,
            true,
            "The OpenAPI path marks writeOnly identically, so both paths strip the same fields"
        );
        var oaSm = new StateManager({ field: "secret" }, SchemaNormalizer.normalize(fromOpenApi));
        assert.strictEqual("field" in oaSm.extractPayload(), false, "An OpenAPI-declared writeOnly field is stripped too");
        oaSm.destroy();
    });

    QUnit.test("'example' supplies the placeholder when none is declared", function (assert) {
        assert.strictEqual(
            normalizeOneField({ type: "string", example: "ACME-123" }).ui.placeholder,
            "ACME-123",
            "A scalar example becomes the placeholder"
        );
        assert.strictEqual(
            normalizeOneField({ type: "integer", example: 42 }).ui.placeholder,
            "42",
            "A numeric example is stringified into the placeholder"
        );
        assert.strictEqual(
            normalizeOneField({ type: "string", example: "ACME-123", ui: { placeholder: "explicit" } }).ui.placeholder,
            "explicit",
            "An explicit ui.placeholder always wins over the example"
        );
        assert.strictEqual(
            normalizeOneField({ type: "object", example: { nested: true } }).ui.placeholder,
            undefined,
            "A non-scalar example is ignored rather than stringified into noise"
        );
        assert.strictEqual(
            normalizeOneField({ type: "string" }).ui.placeholder,
            undefined,
            "A field with no example and no placeholder keeps an undefined placeholder"
        );

        var built = OpenApiBuilder.build(openApiWithField({ type: "string", example: "ACME-123" }), "Probe");
        assert.strictEqual(
            built.properties.field.ui.placeholder,
            "ACME-123",
            "OpenApiBuilder alone produces the same placeholder as SchemaNormalizer"
        );
        assert.strictEqual(
            SchemaNormalizer.normalize(built).properties.field.ui.placeholder,
            "ACME-123",
            "Re-normalizing an OpenAPI-built schema keeps the placeholder stable (idempotent)"
        );
    });

    QUnit.test("'precision', 'scale' and 'deprecated' are withdrawn, not silently carried", function (assert) {
        var normalized = normalizeOneField({ type: "number", precision: 10, scale: 2, deprecated: true });
        assert.strictEqual("precision" in normalized, false, "'precision' is no longer emitted onto IPropertyMetadata");
        assert.strictEqual("scale" in normalized, false, "'scale' is no longer emitted onto IPropertyMetadata");
        assert.strictEqual("deprecated" in normalized, false, "'deprecated' is no longer emitted onto IPropertyMetadata");
        assert.strictEqual(normalized.type, "number", "Withdrawing the three keywords leaves the rest of the descriptor intact");

        var built = OpenApiBuilder.build(openApiWithField({ type: "number", deprecated: true, multipleOf: 0.01 }), "Probe");
        assert.strictEqual(
            built.properties.field.deprecated,
            undefined,
            "The OpenAPI mapper no longer carries 'deprecated' either, so the two paths still agree"
        );
        assert.strictEqual(built.properties.field.multipleOf, 0.01, "A keyword that is actually enforced is unaffected");
    });

    QUnit.module("Schema keywords: allOf intersects every keyword it merges");

    QUnit.test("allOf never admits a value one of its branches rejects", function (assert) {
        var merge = function (left, right) {
            return OpenApiConstraintMapper.resolveAllOf({ allOf: [left, right] }, {});
        };

        assert.strictEqual(
            merge({ type: "integer", multipleOf: 2 }, { type: "integer", multipleOf: 3 }).multipleOf,
            6,
            "multipleOf intersects to the least common multiple instead of letting the last branch win"
        );
        assert.strictEqual(
            merge({ type: "integer", multipleOf: 3 }, { type: "integer", multipleOf: 2 }).multipleOf,
            6,
            "multipleOf no longer depends on branch order"
        );

        assert.strictEqual(
            merge({ type: "integer", exclusiveMaximum: 0 }, { type: "integer", exclusiveMaximum: false }).exclusiveMaximum,
            0,
            "A draft-4 'false' no longer deletes the other branch's numeric exclusive bound"
        );
        assert.strictEqual(
            merge({ type: "integer", exclusiveMaximum: 10 }, { type: "integer", maximum: 3, exclusiveMaximum: true }).exclusiveMaximum,
            3,
            "A draft-4 'true' is rewritten as the sibling bound it stands for and then intersected"
        );

        assert.strictEqual(
            merge({ type: "array", uniqueItems: true }, { type: "array", uniqueItems: false }).uniqueItems,
            true,
            "uniqueItems intersects as a logical OR: 'false' asserts nothing and cannot cancel 'true'"
        );

        assert.strictEqual(
            merge({ type: "object", additionalProperties: false }, { type: "object", additionalProperties: true })
                .additionalProperties,
            false,
            "A closed object stays closed when a later branch re-opens it"
        );
        assert.strictEqual(
            merge({ type: "object", additionalProperties: true }, { type: "object", additionalProperties: false })
                .additionalProperties,
            false,
            "Closing an object is order-independent"
        );

        var contradiction = captureLogs(function () {
            return merge({ type: "string", const: "a" }, { type: "string", const: "b" });
        });
        assert.deepEqual(
            contradiction.result.enum,
            [],
            "Contradictory 'const' values publish an empty choice list, following the 'enum' precedent"
        );
        assert.strictEqual(
            contradiction.errors.join(" | ").indexOf("Contradictory 'const'") !== -1,
            true,
            "The contradiction is reported rather than resolved by whichever branch came last"
        );
        assert.strictEqual(
            merge({ type: "string", const: "a" }, { type: "string", const: "a" }).const,
            "a",
            "Two agreeing 'const' declarations are left alone"
        );
    });

    QUnit.module("Schema keywords: a payload whose shape contradicts its schema");

    QUnit.test("a shape mismatch is rejected exactly when it would skip a declared constraint", function (assert) {
        var constrained = { type: "object", properties: { inner: { type: "string", maxLength: 1 } } };
        assert.strictEqual(
            PayloadValidator.validateTree(constrained, "a plain string").isValid,
            false,
            "An object schema handed a string no longer reports valid after skipping every property check"
        );
        assert.strictEqual(PayloadValidator.validateTree(constrained, 42).isValid, false, "The same holds for a number");
        assert.strictEqual(
            PayloadValidator.validateTree({ type: "array", items: { type: "string", maxLength: 1 } }, "not an array").isValid,
            false,
            "An array schema handed a string is rejected rather than silently skipped"
        );
        assert.strictEqual(
            PayloadValidator.validateTree({ type: "string", maxLength: 1 }, { an: "object" }).isValid,
            false,
            "A scalar schema handed an object is rejected rather than bypassing maxLength"
        );

        assert.strictEqual(
            PayloadValidator.validateTree({ type: "object", properties: { alpha: { type: "string" } } }, "a plain string").isValid,
            true,
            "A purely structural node asserts nothing, so a shape mismatch on it skips no enforcement"
        );
        assert.strictEqual(
            PayloadValidator.validateTree({ type: "string" }, { an: "object" }).isValid,
            true,
            "An unconstrained scalar node likewise tolerates any shape - this is what keeps inference valid against its own data"
        );
        assert.strictEqual(
            PayloadValidator.validateTree({ type: "object", properties: { inner: { type: "string", maxLength: 1 } } }, []).isValid,
            true,
            "An empty value is exempt, exactly as the validator pipeline's own isEmptyValue short-circuit treats it"
        );
    });

    QUnit.module("Resilience: Degraded Policies, Crashed Validators & Silent Catches");

    // Logger.warn/error are always emitted, and the test runner fails the suite on any unexpected console error.
    // These probes deliberately drive the loud paths, so the severity is captured and asserted instead of printed.
    function captureLogs(fn) {
        var captured = { errors: [], warns: [], result: undefined };
        var origError = Logger.error;
        var origWarn = Logger.warn;
        Logger.error = function (msg, details) {
            captured.errors.push(String(msg) + " " + String(details));
        };
        Logger.warn = function (msg, details) {
            captured.warns.push(String(msg) + " " + String(details));
        };
        try {
            captured.result = fn();
        } finally {
            Logger.error = origError;
            Logger.warn = origWarn;
        }
        return captured;
    }

    // A minimal Engine stand-in for PolicyDelegate, backed by a real ValidationLedger so that
    // `ledger.hasActiveErrors()` is exactly what GeneratorHost.syncOverallValidity() reads for `isValid`.
    function makeLedgerBackedEngine() {
        var noPlugin = function () { return undefined; };
        var noPlugins = function () { return []; };
        var noHost = function () { return undefined; };
        var ledger = new ValidationLedger(false, noPlugin, noPlugins, noHost);
        return {
            ledger: ledger,
            getPluginByPath: noPlugin,
            reportSchemaError: function (path, msg) { ledger.reportSchemaError(path, msg); },
            reportPolicyError: function (path, msg) { ledger.reportPolicyError(path, msg); },
            applyRowPolicyState: function (path, prop, val) { ledger.applyRowControlState(path, prop, val); },
            refreshFieldValidationState: function () {}
        };
    }

    function submittedPayload(stateManager) {
        return JSON.parse(JSON.stringify(stateManager.extractPayload()));
    }

    QUnit.test("Resilience: a policy condition the engine cannot evaluate never prunes the user's value", function (assert) {
        var schema = { type: "object", properties: { Role: { type: "string" }, SecretField: { type: "string" } } };
        // One character wrong. "stringEqals" is not a registered operator, so the condition cannot be evaluated at all.
        var typoPolicy = { effect: "Show", targets: ["/SecretField"], condition: { stringEqals: { "/Role": "Admin" } } };
        var workingPolicy = { effect: "Show", targets: ["/SecretField"], condition: { StringEquals: { "/Role": "Admin" } } };

        var brokenSm = new StateManager({ Role: "Guest", SecretField: "KEEP-ME" }, schema);
        var brokenEngine = makeLedgerBackedEngine();
        var brokenDelegate = new PolicyDelegate();
        brokenDelegate.configure([typoPolicy]);
        var brokenRun = captureLogs(function () {
            brokenDelegate.evaluateNow(brokenSm, brokenEngine);
        });
        var brokenPayload = submittedPayload(brokenSm);

        assert.strictEqual(
            brokenPayload.SecretField,
            "KEEP-ME",
            "A typo'd condition operator leaves the user's value in the submitted payload instead of deleting it"
        );
        assert.strictEqual(
            Object.prototype.hasOwnProperty.call(brokenPayload, "SecretField"),
            true,
            "The key survives JSON.stringify, so the field is no longer missing from the submit body"
        );
        assert.strictEqual(
            brokenEngine.ledger.hasActiveErrors(),
            false,
            "isValid stays true because the field is genuinely valid - the engine no longer silently empties it instead"
        );
        assert.strictEqual(
            brokenRun.errors.join(" | ").indexOf("Unrecognized condition operator: stringEqals") !== -1,
            true,
            "An unrecognized condition operator is logged at error, the same severity as an unrecognized effect"
        );
        assert.strictEqual(
            brokenRun.warns.join(" | ").indexOf("stringEqals") !== -1,
            false,
            "The data-destroying case is no longer demoted to a warning"
        );

        var soloEngine = new PolicyEngine([typoPolicy]);
        var soloRun = captureLogs(function () {
            return soloEngine.evaluate({ Role: "Guest", SecretField: "KEEP-ME" });
        });
        assert.deepEqual(
            soloRun.result,
            [],
            "PolicyEngine emits no delta at all for a policy whose condition it could not evaluate"
        );

        // A broken rule alongside a working one: the working rule still decides, but the delta is flagged degraded.
        var mixedEngine = new PolicyEngine([typoPolicy, workingPolicy]);
        var mixedRun = captureLogs(function () {
            return mixedEngine.evaluate({ Role: "Guest", SecretField: "KEEP-ME" });
        });
        assert.strictEqual(mixedRun.result.length, 1, "A working sibling policy still resolves the target's visibility");
        assert.strictEqual(mixedRun.result[0].value, false, "The working Show policy resolves visibility to false");
        assert.strictEqual(
            mixedRun.result[0].degraded,
            true,
            "The delta carries degraded:true because a rule the engine could not evaluate also targets the field"
        );

        var mixedSm = new StateManager({ Role: "Guest", SecretField: "KEEP-ME" }, schema);
        var mixedDelegate = new PolicyDelegate();
        mixedDelegate.configure([typoPolicy, workingPolicy]);
        captureLogs(function () {
            mixedDelegate.evaluateNow(mixedSm, makeLedgerBackedEngine());
        });
        assert.strictEqual(
            submittedPayload(mixedSm).SecretField,
            "KEEP-ME",
            "applyDelta refuses a degraded visibility delta, so no value is pruned while any governing rule is broken"
        );

        // Control: an entirely healthy Show policy must still hide the field and still prune its value.
        var healthySm = new StateManager({ Role: "Guest", SecretField: "PRUNE-ME" }, schema);
        var healthyDelegate = new PolicyDelegate();
        healthyDelegate.configure([workingPolicy]);
        healthyDelegate.evaluateNow(healthySm, makeLedgerBackedEngine());
        assert.strictEqual(
            Object.prototype.hasOwnProperty.call(submittedPayload(healthySm), "SecretField"),
            false,
            "Control: a working Show policy still hides the field and prunes its value out of the payload"
        );

        brokenSm.destroy();
        mixedSm.destroy();
        healthySm.destroy();
    });

    QUnit.test("Resilience: one throwing condition plugin cannot disable every other policy in the form", function (assert) {
        var realRegistry = PluginRegistry.getInstance();
        var hostileRegistry = {
            getPolicyConditionPlugin: function (key) {
                if (key === "AlwaysThrows") {
                    return { evaluate: function () { throw new Error("condition plugin exploded"); } };
                }
                return realRegistry.getPolicyConditionPlugin(key);
            },
            getPolicyEffectPlugin: function (effect) {
                return realRegistry.getPolicyEffectPlugin(effect);
            }
        };
        var policies = [
            { effect: "Show", targets: ["/Alpha"], condition: { AlwaysThrows: { "/Mode": "X" } } },
            {
                effect: "Invalidate",
                targets: ["/Beta"],
                message: "Beta is out of range",
                condition: { StringEquals: { "/Beta": "BAD" } }
            }
        ];
        var payload = { Mode: "Y", Alpha: "keep", Beta: "BAD" };

        var engine = new PolicyEngine(policies, hostileRegistry);
        var run = captureLogs(function () {
            return engine.evaluate(payload);
        });
        assert.strictEqual(run.result.length, 1, "The sibling Invalidate policy still emits its delta when the first policy throws");
        assert.strictEqual(run.result[0].target, "/Beta", "The surviving delta belongs to the policy that did not throw");
        assert.strictEqual(run.result[0].property, "validity", "The surviving delta is the Invalidate effect's validity mutation");
        assert.strictEqual(run.result[0].value, false, "The surviving Invalidate policy still marks its target invalid");
        assert.strictEqual(
            run.result[0].errorMessage,
            "Beta is out of range",
            "The surviving policy keeps its message, so the user still sees why the field is rejected"
        );
        assert.strictEqual(
            run.errors.join(" | ").indexOf("condition plugin exploded") !== -1,
            true,
            "The throwing condition plugin is reported rather than swallowed"
        );

        var schema = {
            type: "object",
            properties: { Mode: { type: "string" }, Alpha: { type: "string" }, Beta: { type: "string" } }
        };
        var sm = new StateManager(payload, schema);
        var hostEngine = makeLedgerBackedEngine();
        var delegate = new PolicyDelegate();
        delegate.configure(policies, hostileRegistry);
        captureLogs(function () {
            delegate.evaluateNow(sm, hostEngine);
        });
        assert.strictEqual(
            hostEngine.ledger.hasActiveErrors(),
            true,
            "isValid is false: one throwing plugin no longer wipes out the policy error that should block submit"
        );
        assert.strictEqual(
            submittedPayload(sm).Alpha,
            "keep",
            "The throwing policy's own target keeps its value - a broken rule hides nothing and prunes nothing"
        );
        sm.destroy();
    });

    QUnit.test("Resilience: a plugin whose validate() throws fails the form closed", function (assert) {
        var noPlugin = function () { return undefined; };
        var noHost = function () { return undefined; };
        var crashingPlugin = {
            validate: function () { throw new Error("plugin validate exploded"); },
            isVisible: function () { return true; },
            getFieldLabel: function () { return "Crashing Field"; },
            setVisualValidationState: function () {}
        };
        var crashLedger = new ValidationLedger(
            false,
            noPlugin,
            function () { return [{ plugin: crashingPlugin, path: "Crash" }]; },
            noHost
        );
        var crashRun = captureLogs(function () {
            return crashLedger.validateAll(true);
        });
        assert.strictEqual(crashRun.result.length, 1, "A crashing plugin contributes a validation error instead of being skipped");
        assert.strictEqual(crashRun.result[0].isValid, false, "The contributed result is a failure, matching PipelineManager one layer down");
        assert.strictEqual(crashRun.result[0].fieldKey, "Crash", "The failure is attributed to the crashed plugin's field path");
        assert.strictEqual(
            crashLedger.hasActiveErrors(),
            true,
            "hasActiveErrors() is true, so triggerSubmit() can no longer fire 'submit' over a plugin that never validated"
        );

        var healthyPlugin = {
            validate: function () { return { isValid: true }; },
            isVisible: function () { return true; },
            getFieldLabel: function () { return "Healthy Field"; },
            setVisualValidationState: function () {}
        };
        var healthyLedger = new ValidationLedger(
            false,
            noPlugin,
            function () { return [{ plugin: healthyPlugin, path: "Healthy" }]; },
            noHost
        );
        assert.deepEqual(healthyLedger.validateAll(true), [], "Control: a plugin that validates cleanly still produces no errors");
        assert.strictEqual(healthyLedger.hasActiveErrors(), false, "Control: a clean validation pass still leaves the form valid");
    });

    QUnit.test("Resilience: an unregistered validator fails closed exactly like a crashing one", function (assert) {
        // A private PipelineManager: registering a hostile validator on the shared singleton would
        // break the registry-vs-TestOracle parity gate for every later test on the page.
        var isolated = new PipelineManager();
        isolated.validators.register("explodes", {
            validate: function () { throw new Error("validator exploded"); }
        });

        var crashed = captureLogs(function () {
            return isolated.executeValidation("abc", ["explodes"]);
        });
        var missing = captureLogs(function () {
            return isolated.executeValidation("abc", ["maxLenght"]);
        });

        assert.strictEqual(crashed.result.isValid, false, "Baseline contract: a validator that throws fails closed");
        assert.strictEqual(
            missing.result.isValid,
            false,
            "A typo in ui.validators now fails closed too, instead of silently disabling validation for the field"
        );
        assert.strictEqual(
            String(missing.result.errorMessage).indexOf("Schema configuration error") === 0,
            true,
            "The unregistered rule is reported as a schema configuration error the consumer can act on"
        );
        assert.strictEqual(
            missing.errors.join(" | ").indexOf("Requested validator 'maxLenght' is not registered") !== -1,
            true,
            "The unregistered rule is logged at error, matching the crashing-validator branch beside it"
        );
        assert.strictEqual(
            isolated.executeValidation("abc", ["maxLength"], { maxLength: 10 }).isValid,
            true,
            "Control: a correctly spelled, correctly configured validator still passes"
        );
    });

    QUnit.test("Resilience: a plugin that never rendered reports invalid, a hidden one still reports valid", function (assert) {
        var meta = { type: "string", required: true, ui: { label: "Never Rendered" } };

        var unrendered = Object.create(BasePlugin.prototype);
        unrendered.metadata = meta;
        unrendered.bindingPath = "/NeverRendered";
        unrendered.control = undefined;
        var unrenderedResult = unrendered.validate();
        assert.strictEqual(
            unrenderedResult.isValid,
            false,
            "A registered plugin whose render() threw reports invalid instead of claiming a required field is fine"
        );
        assert.strictEqual(
            String(unrenderedResult.errorMessage).indexOf("failed to render") !== -1,
            true,
            "The failure says the field never rendered rather than inventing a value-level complaint"
        );

        var hidden = Object.create(BasePlugin.prototype);
        hidden.metadata = meta;
        hidden.bindingPath = "/Hidden";
        hidden.control = { getVisible: function () { return false; } };
        assert.strictEqual(
            hidden.validate().isValid,
            true,
            "Control: the hidden-field arm is unchanged - a rendered but hidden control is still valid"
        );

        // This arm used to assert the opposite - that a plugin with no metadata is "unconfigured,
        // not failed", and reports valid. That was a rationalisation of a fail-open hole, not a
        // contract: Engine.generateField pushes a plugin onto activePlugins BEFORE calling render(),
        // so a render() that throws on its first statement leaves exactly this state, and the form
        // then submitted a required field that had visibly failed to draw.
        var threwBeforeInitialize = Object.create(BasePlugin.prototype);
        threwBeforeInitialize.metadata = undefined;
        threwBeforeInitialize.control = undefined;
        assert.strictEqual(
            threwBeforeInitialize.validate().isValid,
            false,
            "Control: a render that threw before initialize() leaves neither metadata nor control, and fails closed like the arm above"
        );
    });

    QUnit.test("Resilience: a validator whose configuration is malformed reports it instead of passing", function (assert) {
        var pipeline = PipelineManager.getInstance();

        assert.strictEqual(
            pipeline.executeValidation("abc", ["minLength"], { minLength: "3" }).isValid,
            false,
            "A non-numeric minLength is a schema configuration error, not a silent pass"
        );
        assert.strictEqual(
            pipeline.executeValidation("abc", ["maxLength"], { maxLength: "5" }).isValid,
            false,
            "A non-numeric maxLength is a schema configuration error, not a silent pass"
        );
        assert.strictEqual(
            pipeline.executeValidation([1, 2], ["arrayItems"], { arrayItems: "minItems=1" }).isValid,
            false,
            "A non-record arrayItems argument is a schema configuration error, not a silent pass"
        );
        assert.strictEqual(
            String(pipeline.executeValidation("abc", ["minLength"], { minLength: "3" }).errorMessage).indexOf(
                "Schema configuration error"
            ),
            0,
            "The message matches PatternValidatorPlugin, the correct sibling in the same package"
        );

        assert.strictEqual(
            pipeline.executeValidation("abc", ["minLength"], { minLength: 2 }).isValid,
            true,
            "Control: a well-configured minLength still passes a long-enough string"
        );
        assert.strictEqual(
            pipeline.executeValidation("a", ["minLength"], { minLength: 2 }).isValid,
            false,
            "Control: a well-configured minLength still rejects a too-short string"
        );
        assert.strictEqual(
            pipeline.executeValidation(42, ["maxLength"], { maxLength: 5 }).isValid,
            true,
            "Control: maxLength still ignores a non-string value, which is not a configuration error"
        );
        assert.strictEqual(
            pipeline.executeValidation([1, 2], ["arrayItems"], { arrayItems: { minItems: 1 } }).isValid,
            true,
            "Control: a well-configured arrayItems constraint still passes a satisfying array"
        );
    });

    QUnit.test("Resilience: DataSyncDelegate never resets or tears down the form silently", function (assert) {
        var revertSchema = { type: "object", properties: { A: { type: "string" } } };
        var revertSm = new StateManager({ A: "live edit" }, revertSchema);
        var revertProps = { data: null, dataJson: "{ this is not json", debugMode: false };
        var revertHost = {
            getProperty: function (k) { return revertProps[k]; },
            getBaseProperty: function (k) { return revertProps[k]; },
            setProperty: function (k, v) { revertProps[k] = v; return this; },
            setBaseProperty: function (k, v) { revertProps[k] = v; return this; },
            getBinding: function () { return null; },
            invalidate: function () {},
            getStateManager: function () { return revertSm; },
            getParsedSchema: function () { return revertSchema; },
            tearDownGeneratedLayout: function () {}
        };
        var revertRun = captureLogs(function () {
            new DataSyncDelegate(revertHost).revertToCommittedData();
        });
        assert.strictEqual(
            revertRun.errors.join(" | ").indexOf("Failed to parse dataJson string while reverting") !== -1,
            true,
            "Resetting the form to an empty payload is now audible instead of being swallowed by an empty catch"
        );
        assert.deepEqual(
            revertSm.extractPayload(),
            {},
            "The documented reset still happens - the defect was that nobody could find out why"
        );

        var swapProps = { data: null, dataJson: null, debugMode: false };
        var tearDowns = 0;
        var swapHost = {
            getProperty: function (k) { return swapProps[k]; },
            getBaseProperty: function (k) { return swapProps[k]; },
            setProperty: function (k, v) { swapProps[k] = v; return this; },
            setBaseProperty: function (k, v) { swapProps[k] = v; return this; },
            getBinding: function () { return null; },
            invalidate: function () {},
            getStateManager: function () { return null; },
            tearDownGeneratedLayout: function () { tearDowns++; }
        };
        var swapRun = captureLogs(function () {
            new DataSyncDelegate(swapHost).handleInputDataHotSwap("dataJson", "{ this is not json");
        });
        assert.strictEqual(
            swapRun.errors.join(" | ").indexOf("Failed to parse dataJson string") !== -1,
            true,
            "An unparseable live dataJson binding update is reported before the generated layout is torn down"
        );
        assert.strictEqual(tearDowns, 1, "Control: the tear-down behaviour on an unparseable live update is unchanged");

        revertSm.destroy();
    });

    QUnit.module("Platform: OpenUI5 Compatibility & Lazy Module Degradation");

    // The two UI5 libraries that only a lazily required plugin module ever touches:
    // sap.ui.unified  -> FileUploaderPlugin   (widget "fileUploader")
    // sap.ui.codeeditor -> CodeEditorPlugin   (widget "codeEditor")
    // Neither is in library.ts's eager import list, so neither is reachable at Core.initLibrary()
    // time. This list once also carried sap.ndc, which ships with SAPUI5 only: declaring it eagerly
    // made 'sap/ndc/library.js' a hard 404 on every OpenUI5 distribution, which aborted the whole
    // library factory so nothing rendered at all. Its one consumer, the barcode scanner widget, was
    // withdrawn in 2.0.0, so the library now has no SAPUI5-only dependency at all. Both survivors
    // ship with OpenUI5 too - the lazy declaration is about payload, not availability.
    var OPTIONAL_LIB_WIDGETS = [
        { lib: "sap.ui.unified", widget: "fileUploader", plugin: "FileUploaderPlugin" },
        { lib: "sap.ui.codeeditor", widget: "codeEditor", plugin: "CodeEditorPlugin" }
    ];

    function collectControls(control, out, depth) {
        if (!control || !control.getMetadata || depth > 16) return out;
        out.push(control);
        var aggregations = control.mAggregations || {};
        Object.keys(aggregations).forEach(function (key) {
            var value = aggregations[key];
            if (Array.isArray(value)) {
                value.forEach(function (child) { collectControls(child, out, depth + 1); });
            } else {
                collectControls(value, out, depth + 1);
            }
        });
        return out;
    }

    function controlNames(controls) {
        return controls.map(function (c) { return c.getMetadata().getName(); });
    }

    // Sampled while this file's factory runs - after library-preload.js has been fetched and applied,
    // but before any test has executed. All three are hardware plugins reached only through
    // PluginRegistry.preloadDependencies(); none is imported by src eagerly or by any test file as an
    // AMD dependency. If a future test imports one directly, re-point this list at another lazily
    // mapped plugin rather than deleting the assertion - it is what keeps the preload honest.
    var LAZY_PLUGIN_PATHS = [
        "nz/co/siliconst/ui5/metaui/plugins/controls/CameraPlugin",
        "nz/co/siliconst/ui5/metaui/plugins/controls/SignaturePlugin",
        "nz/co/siliconst/ui5/metaui/plugins/controls/VoiceInputPlugin"
    ];
    var LAZY_EXECUTED_AT_BOOTSTRAP = LAZY_PLUGIN_PATHS.map(function (p) { return !!sap.ui.require(p); });

    QUnit.test("Platform: this suite loads MetaUI the way the README tells consumers to", function (assert) {
        var done = assert.async();
        // UI5 fetches library-preload.js only when the library is named AS A LIBRARY - in
        // data-sap-ui-libs, or in an application manifest's sap.ui5.dependencies.libs. A page that
        // points data-sap-ui-resourceroots at MetaUI without also declaring it resolves every module
        // individually instead: measured on OpenUI5 1.120.50, 2 requests against 87.
        //
        // This suite's own page used to do exactly that, so the slow path was the only path anything
        // automated ever exercised while the README told consumers to use the fast one. These two
        // assertions fail if that regresses - which is the whole point of writing them down.
        var metaUiRequests = performance
            .getEntriesByType("resource")
            .map(function (entry) { return String(entry.name); })
            .filter(function (name) { return name.indexOf("/resources/nz/co/siliconst/ui5/metaui/") !== -1; });

        assert.strictEqual(
            metaUiRequests.some(function (name) { return name.indexOf("/library-preload.js") !== -1; }),
            true,
            "library-preload.js was fetched: this page declares nz.co.siliconst.ui5.metaui in data-sap-ui-libs"
        );

        // The converse signal. On the resource-root-only path this page pulled 173 separate module
        // files; on the preload path the only MetaUI resources are the preload and its message bundle.
        var individualModules = metaUiRequests.filter(function (name) {
            return /\.js(\?|$)/.test(name) && name.indexOf("/library-preload.js") === -1;
        });
        assert.strictEqual(
            individualModules.length < 20,
            true,
            "MetaUI arrived as one bundle, not " + individualModules.length + " individual module requests"
        );

        // The trap in moving onto the preload path: library-preload.js carries EVERY module, including
        // the hardware, action and datasource plugins that the lazy .library entries and
        // preloadDependencies() exist to keep off the wire. If the preload also *executed* them, the
        // suite would stop being able to observe a lazy-loading regression at all, because
        // GenerationDelegate.preloadIfNeeded() decides whether to preload by asking sap.ui.require()
        // whether each module is there yet. It does not: a preload only *defines* modules, so the
        // synchronous probe still reports them absent and the lazy path is still the path under test.
        assert.deepEqual(
            LAZY_EXECUTED_AT_BOOTSTRAP,
            [false, false, false],
            "The preload defines the lazy plugins without executing them, so lazy loading is still observable here"
        );

        // And the other half of the property: requiring one of them now resolves it straight out of
        // the bundle, with no request of its own. Together these two say the preload carried the
        // module without running it - which is exactly why moving this suite onto the preload path
        // cannot hide a lazy-loading regression.
        var probedModule = LAZY_PLUGIN_PATHS[0];
        var requestsBefore = performance
            .getEntriesByType("resource")
            .filter(function (e) { return String(e.name).indexOf(probedModule) !== -1; }).length;
        sap.ui.require([probedModule], function (loaded) {
            var requestsAfter = performance
                .getEntriesByType("resource")
                .filter(function (e) { return String(e.name).indexOf(probedModule) !== -1; }).length;
            assert.strictEqual(
                !!loaded && requestsAfter === requestsBefore,
                true,
                "Requiring a lazy plugin resolves it from the preload bundle without a network request of its own"
            );
            done();
        });
    });

    QUnit.test("Platform: Core.initLibrary declares no eager UI5 library that only a lazy plugin needs", function (assert) {
        var done = assert.async();
        assert.strictEqual(
            typeof MetaUILibraryMod,
            "object",
            "nz/co/siliconst/ui5/metaui/library loaded, so Core.initLibrary() has run with the shipped dependency list"
        );

        var entry = (typeof Lib.all === "function" ? Lib.all() : {})["nz.co.siliconst.ui5.metaui"];
        assert.strictEqual(
            !!(entry && Array.isArray(entry.dependencies)),
            true,
            "The library is registered with sap/ui/core/Lib, so its eager dependency list is readable at runtime"
        );
        var declared = (entry && entry.dependencies ? entry.dependencies : []).slice().sort();

        assert.deepEqual(
            declared,
            ["sap.m", "sap.ui.core", "sap.ui.layout"],
            "Core.initLibrary eagerly depends only on the three libraries the eagerly bundled plugins and layouts import"
        );

        // Capability is never removed: each optional library's widget still resolves to its plugin.
        // Collected into arrays and asserted once rather than asserted inside the loop, so the static
        // assertion count in scripts/run-tests.js stays equal to the live one.
        var registry = new PluginRegistry();
        var preloadedPlugins = OPTIONAL_LIB_WIDGETS.map(function (spec) {
            var paths = Array.from(
                registry.getPathsToLoad({
                    type: "object",
                    properties: { Probe: { type: "string", ui: { widget: spec.widget } } }
                })
            );
            return paths.filter(function (p) { return p.indexOf("/plugins/controls/") !== -1; }).join(",");
        });
        assert.deepEqual(
            preloadedPlugins,
            [
                "nz/co/siliconst/ui5/metaui/plugins/controls/FileUploaderPlugin",
                "nz/co/siliconst/ui5/metaui/plugins/controls/CodeEditorPlugin"
            ],
            "fileUploader and codeEditor each still preload their plugin on demand: the libraries went lazy, not away"
        );
        assert.deepEqual(
            OPTIONAL_LIB_WIDGETS.filter(function (spec) { return declared.indexOf(spec.lib) !== -1; }).map(function (s) { return s.lib; }),
            [],
            "Neither sap.ui.unified nor sap.ui.codeeditor is an eager dependency: only a lazily required plugin touches each"
        );

        // The shipped descriptor (.library -> manifest.json) and the runtime list must now agree.
        // No assertion on the rejection path: one that never runs would desync the static assertion
        // count, and a rejected fetch already fails this test through that same count gate.
        fetch(sap.ui.require.toUrl("nz/co/siliconst/ui5/metaui/manifest.json"))
            .then(function (response) { return response.json(); })
            .then(function (manifest) {
                var libs = manifest["sap.ui5"].dependencies.libs;
                var eagerInDescriptor = Object.keys(libs)
                    .filter(function (name) { return libs[name].lazy !== true; })
                    .sort();
                assert.deepEqual(
                    eagerInDescriptor,
                    declared,
                    "The .library descriptor's non-lazy dependencies match Core.initLibrary exactly - the two no longer contradict each other"
                );
                assert.deepEqual(
                    OPTIONAL_LIB_WIDGETS.map(function (spec) { return !!(libs[spec.lib] && libs[spec.lib].lazy === true); }),
                    [true, true],
                    "Both stay declared in the descriptor as lazy dependencies so UI5 Tooling and the App Index still see them"
                );
            })
            .then(done, done);
    });

    // Two modules that are registered with the AMD loader but export no constructor. Requiring one
    // takes exactly the rejection branch inside preloadDependencies() that a 404 module path takes,
    // and because they are predefined, neither costs a network request the harness would (correctly)
    // fail the suite over. They are unloaded until something requires them, which is what makes
    // GenerationDelegate.preloadIfNeeded() reach preloadDependencies() at all.
    var UNLOADABLE_PROBE_A = "metaui/sandbox/test/UnloadablePluginProbeA";
    var UNLOADABLE_PROBE_B = "metaui/sandbox/test/UnloadablePluginProbeB";
    sap.ui.predefine(UNLOADABLE_PROBE_A, [], function () { return { notAPluginConstructor: true }; });
    sap.ui.predefine(UNLOADABLE_PROBE_B, [], function () { return { notAPluginConstructor: true }; });

    // Registered with the loader but never required, so the synchronous sap.ui.require() inside the
    // policy getters sees nothing in the module cache - the "registered but not preloaded" case.
    var UNPRELOADED_POLICY_PROBE = "metaui/sandbox/test/NeverPreloadedPolicyProbe";
    sap.ui.predefine(UNPRELOADED_POLICY_PROBE, [], function () { return { SomePolicyPlugin: function () {} }; });

    QUnit.test("Platform: policy plugin lookup is memoised and a non-preloaded operator says so once", function (assert) {
        var done = assert.async();
        var memoRegistry = new PluginRegistry();

        // Resolve the policy modules the way a host does, rather than relying on an earlier test
        // happening to have loaded them - the exact ordering dependency this suite already suffers from.
        memoRegistry.preloadDependencies({
            type: "object",
            properties: { Role: { type: "string" }, Secret: { type: "string" } },
            uiPolicies: [{ effect: "Hide", targets: ["/Secret"], condition: { StringEquals: { "/Role": "Admin" } } }]
        }).then(function () {
            var firstEffect = memoRegistry.getPolicyEffectPlugin("Hide");
            assert.strictEqual(!!firstEffect, true, "A registered, preloaded effect still resolves");
            assert.strictEqual(
                firstEffect,
                memoRegistry.getPolicyEffectPlugin("Hide"),
                "The same effect instance comes back twice: PolicyEngine resolves this per target, per rule, per pass"
            );
            assert.strictEqual(
                memoRegistry.getPolicyConditionPlugin("StringEquals"),
                memoRegistry.getPolicyConditionPlugin("StringEquals"),
                "The same condition instance comes back twice"
            );
            assert.strictEqual(
                memoRegistry.getPolicyEffectPlugin("Hide").resolveState(true, "Hide").value,
                false,
                "The memoised instance still resolves state correctly, so caching did not change behaviour"
            );

            // Re-registering an operator must drop the stale instance, or a custom plugin would never win.
            // Registry.register reports the deliberate overwrite at error level, so it is captured rather
            // than left to reach the console, where the harness counts it as an unexpected failure.
            var origOverwriteError = Logger.error;
            var overwriteErrors = [];
            Logger.error = function (msg) { overwriteErrors.push(String(msg)); };
            try {
                memoRegistry.registerPolicyEffectPath(
                    "Hide",
                    "nz/co/siliconst/ui5/metaui/plugins/policies/effects/BinaryEffectPlugin"
                );
            } finally {
                Logger.error = origOverwriteError;
            }
            assert.strictEqual(
                overwriteErrors.length,
                1,
                "Replacing a registered policy effect is reported once, at the level UI5 actually prints"
            );
            assert.notStrictEqual(
                memoRegistry.getPolicyEffectPlugin("Hide"),
                firstEffect,
                "registerPolicyEffectPath() invalidates the memoised instance, so a replacement mapping takes effect"
            );

            // A key registered to a module nobody preloaded. PolicyEngine reports this per rule, per
            // target, per pass as "Unrecognized operator" - the wrong diagnosis, repeated into a flood.
            var warnings = [];
            var resolutions = [];
            var origWarn = Logger.warn;
            Logger.warn = function (msg) { warnings.push(String(msg)); };
            try {
                memoRegistry.registerPolicyConditionPath("NeverPreloadedProbe", UNPRELOADED_POLICY_PROBE);
                for (var i = 0; i < 5; i++) {
                    resolutions.push(memoRegistry.getPolicyConditionPlugin("NeverPreloadedProbe"));
                }
            } finally {
                Logger.warn = origWarn;
            }
            assert.deepEqual(
                resolutions,
                [undefined, undefined, undefined, undefined, undefined],
                "A registered-but-unloaded operator resolves to undefined every time, so a failure is never memoised"
            );
            var probeWarnings = warnings.filter(function (w) { return w.indexOf("NeverPreloadedProbe") !== -1; });
            assert.strictEqual(probeWarnings.length, 1, "Five lookups produce exactly one warning instead of one per lookup");
            assert.strictEqual(
                probeWarnings[0].indexOf("not ") !== -1 && probeWarnings[0].indexOf("preloadDependencies") !== -1,
                true,
                "The warning names the real cause - the module was never preloaded - not 'unrecognized operator'"
            );
        }).then(done, done);
    });

    QUnit.test("Platform: one unloadable plugin module costs one field, not the whole form", function (assert) {
        var done = assert.async();

        var brokenRegistry = new PluginRegistry();
        brokenRegistry.registerPluginPath("string", "unloadableProbeWidgetA", UNLOADABLE_PROBE_A);
        brokenRegistry.registerPluginPath("string", "unloadableProbeWidgetB", UNLOADABLE_PROBE_B);

        var schema = {
            type: "object",
            properties: {
                Alpha: { type: "string" },
                Broken: { type: "string", ui: { widget: "unloadableProbeWidgetB" } },
                Omega: { type: "string" }
            }
        };

        var loggedErrors = [];
        var origError = Logger.error;
        Logger.error = function (msg, details) { loggedErrors.push(String(msg) + " " + String(details)); };

        var host = new GeneratorHost({
            schemaDefinition: JSON.parse(JSON.stringify(schema)),
            data: { Alpha: "a", Broken: "b", Omega: "z" },
            pluginRegistry: brokenRegistry,
            layoutBudget: 0
        });

        brokenRegistry
            .preloadDependencies({
                type: "object",
                properties: {
                    Healthy: { type: "string" },
                    Unloadable: { type: "string", ui: { widget: "unloadableProbeWidgetA" } }
                }
            })
            .then(function () { return null; }, function (error) { return error || new Error("rejected"); })
            .then(function (preloadError) {
                assert.strictEqual(
                    preloadError,
                    null,
                    "preloadDependencies() settles instead of rejecting: one unresolvable module no longer poisons the batch"
                );
                assert.strictEqual(
                    !!sap.ui.require("nz/co/siliconst/ui5/metaui/plugins/controls/StringPlugin"),
                    true,
                    "The healthy modules in the same batch are still loaded, so the surviving fields have their plugins"
                );
                return host.generate().then(function () { return null; }, function (error) { return error || new Error("rejected"); });
            })
            .then(function (generateError) {
                Logger.error = origError;
                assert.strictEqual(
                    generateError,
                    null,
                    "generate() completes, so the host mounts a form instead of the whole-page 'UI Generation Failed' crash boundary"
                );

                var content = host.getAggregation("_content");
                assert.strictEqual(!!content, true, "The host mounted generated content");
                var tree = collectControls(content, [], 0);
                var names = controlNames(tree);

                assert.strictEqual(
                    names.indexOf("sap.m.IllustratedMessage") === -1,
                    true,
                    "The crash boundary did not replace the form"
                );

                var placeholders = tree.filter(function (c) {
                    if (c.getMetadata().getName() !== "sap.m.Text" || typeof c.getText !== "function") {
                        return false;
                    }
                    var text = String(c.getText());
                    return text.indexOf("[Error generating field") === 0 && text.indexOf("Broken") !== -1;
                });
                assert.strictEqual(
                    placeholders.length,
                    1,
                    "The unloadable field degrades to the same per-field '[Error generating field X]' placeholder the render path already produces"
                );

                var strips = tree.filter(function (c) { return c.getMetadata().getName() === "sap.m.MessageStrip"; });
                assert.strictEqual(
                    strips.length >= 1 &&
                        String(strips[0].getText()).indexOf("Some fields failed to generate") !== -1,
                    true,
                    "The form-level MessageStrip appears, so the failure is visible rather than a silently blank page"
                );

                assert.strictEqual(
                    !!host.engine && host.engine.hasPartialRenderingErrors === true,
                    true,
                    "The Engine recorded partial rendering errors"
                );
                assert.strictEqual(
                    !!host.engine.getPluginByPath("Alpha") && !!host.engine.getPluginByPath("Omega"),
                    true,
                    "The two healthy fields still rendered their plugins - the blast radius is one field"
                );
                assert.strictEqual(
                    loggedErrors.join(" | ").indexOf(UNLOADABLE_PROBE_B) !== -1,
                    true,
                    "Degrading stays loud: the unloadable module path is still reported through Logger.error"
                );

                host.destroy();
            })
            // No assertion on the failure path: one that never runs would desync the static assertion
            // count in scripts/run-tests.js, and that same count gate already fails this test if the
            // happy-path assertions above do not run.
            .catch(function () { Logger.error = origError; })
            .then(done, done);
    });

    QUnit.module("Core Architecture: LayoutScorer decision table, visibility and depth");

    // Builds a root schema with one nested object holding `hiddenCount` statically hidden fields
    // and `visibleCount` visible ones. The user experiences a form of `visibleCount` fields.
    function buildVisibilitySchema(hiddenCount, visibleCount) {
        var props = {};
        var i;
        for (i = 0; i < hiddenCount; i++) {
            props["Hidden" + i] = { type: "string", ui: { visible: false } };
        }
        for (i = 0; i < visibleCount; i++) {
            props["Visible" + i] = { type: "string" };
        }
        return SchemaNormalizer.normalize({
            type: "object",
            properties: { Details: { type: "object", properties: props } }
        });
    }

    QUnit.test("LayoutScorer: ui.visible false fields do not consume the layout budget", function (assert) {
        // Before: scoreNode summed getPluginScore for every property regardless of visibility, so 20
        // hidden fields plus 3 visible ones scored 23 against a budget of 5 and the form the user
        // experiences as three fields was pushed into a dialog. Eight other walkers skip
        // `ui.visible === false`; the scorer was one of only two that did not.
        var hiddenHeavy = buildVisibilitySchema(20, 3);
        var hiddenTable = LayoutScorer.apply(hiddenHeavy, 5);
        var hiddenDecision = hiddenTable.get("#/properties/Details");

        assert.strictEqual(hiddenDecision.score, 3, "Only the three visible fields are scored; the 20 hidden ones cost nothing");
        assert.strictEqual(
            hiddenDecision.renderMode,
            "inline",
            "A form of three visible fields fits a budget of 5 and renders inline"
        );

        // The control: the same shape with every field visible really is over budget.
        var visibleHeavy = buildVisibilitySchema(0, 23);
        var visibleDecision = LayoutScorer.apply(visibleHeavy, 5).get("#/properties/Details");
        assert.strictEqual(visibleDecision.score, 1, "23 visible fields exceed the budget, so the node reports a dialog footprint");
        assert.strictEqual(visibleDecision.renderMode, "dialog", "23 visible fields over a budget of 5 still overflow into a dialog");

        // End to end: the hidden-heavy form must render as an expanded Group, not a dialog trigger.
        DefaultLayoutGenerator.ensureLayout(hiddenHeavy);
        LayoutMutator.apply(hiddenHeavy, hiddenTable);
        assert.strictEqual(
            hiddenHeavy.uiLayout[0].elements[0].type,
            "Group",
            "LayoutMutator expands the hidden-heavy object inline instead of emitting a dialog Control"
        );
    });

    // Recursively wraps a value so that every attempted write, redefinition or delete anywhere in the
    // tree is recorded instead of applied. Proxies are memoised per target so object identity - which
    // the scorer's `visited` WeakSet depends on - is preserved.
    function writeTrappingProxy(value, attempts, cache) {
        if (!value || typeof value !== "object") {
            return value;
        }
        if (cache.has(value)) {
            return cache.get(value);
        }
        var proxy = new Proxy(value, {
            get: function (target, key, receiver) {
                return writeTrappingProxy(Reflect.get(target, key, receiver), attempts, cache);
            },
            set: function (target, key) {
                attempts.push("set " + String(key));
                return true;
            },
            defineProperty: function (target, key) {
                attempts.push("defineProperty " + String(key));
                return true;
            },
            deleteProperty: function (target, key) {
                attempts.push("delete " + String(key));
                return true;
            }
        });
        cache.set(value, proxy);
        return proxy;
    }

    function deepFreezeSchema(value) {
        if (value && typeof value === "object") {
            Object.freeze(value);
            Object.keys(value).forEach(function (key) { deepFreezeSchema(value[key]); });
        }
        return value;
    }

    function buildScorerFixture() {
        return {
            schema: SchemaNormalizer.normalize({
                type: "object",
                properties: {
                    Address: { $ref: "#/definitions/Address" },
                    Huge: { $ref: "#/definitions/Huge" },
                    Missing: { $ref: "#/definitions/NotThere" },
                    Lines: { type: "array", items: { type: "object", properties: { Sku: { type: "string" } } } },
                    Locked: { type: "object", readOnly: true, properties: { Code: { type: "string" } } }
                }
            }),
            definitions: {
                Address: SchemaNormalizer.normalizeDefinition(
                    { type: "object", properties: { Street: { type: "string" }, City: { type: "string" } } },
                    "Address"
                ),
                Huge: SchemaNormalizer.normalizeDefinition(
                    {
                        type: "object",
                        properties: {
                            A: { type: "string" }, B: { type: "string" }, C: { type: "string" },
                            D: { type: "string" }, E: { type: "string" }, F: { type: "string" }
                        }
                    },
                    "Huge"
                )
            }
        };
    }

    QUnit.test("LayoutScorer: scoring a normalized schema attempts no write to it", function (assert) {
        // The scorer used to use ISchema as its scratchpad - nine `ui.renderMode` writes, `ui.layoutBudget`,
        // a readOnly cascade and `delete node.$ref` - so the object GeneratorHost.getParsedSchema() hands to
        // DataSyncDelegate, PayloadValidator and ValidationLedger was the layout engine's working memory.
        var trapped = buildScorerFixture();
        var attempts = [];
        var cache = new WeakMap();
        var proxiedSchema = writeTrappingProxy(trapped.schema, attempts, cache);
        var proxiedDefs = writeTrappingProxy(trapped.definitions, attempts, cache);
        var proxiedTable = LayoutScorer.apply(proxiedSchema, 5, proxiedDefs);

        assert.deepEqual(attempts, [], "The scorer attempted no write, redefinition or delete anywhere in the schema or definitions");
        assert.strictEqual(proxiedTable.size > 0, true, "The same pass still produced decisions, so the run was not a no-op");

        // Freezing proves the same thing the way a consumer would hit it: the scorer's modules are
        // strict, so any surviving assignment would throw rather than silently no-op.
        var frozen = buildScorerFixture();
        deepFreezeSchema(frozen.schema);
        deepFreezeSchema(frozen.definitions);
        var snapshot = JSON.stringify(frozen.schema);
        var thrown = "";
        try {
            LayoutScorer.apply(frozen.schema, 5, frozen.definitions);
        } catch (e) {
            thrown = String(e && e.message);
        }
        assert.strictEqual(thrown, "", "A deep-frozen normalized schema survives a full scoring pass");
        assert.strictEqual(JSON.stringify(frozen.schema), snapshot, "The frozen schema is byte-identical after scoring");
    });

    QUnit.test("LayoutScorer: decisions are published as a side table keyed by scope", function (assert) {
        var fixture = buildScorerFixture();
        var table = LayoutScorer.apply(fixture.schema, 5, fixture.definitions);

        var address = table.get("#/properties/Address");
        assert.strictEqual(address.renderMode, "inline", "A two-field $ref fits the budget and is decided inline");
        assert.strictEqual(address.bindingPath, "Address", "Each decision carries the model binding path it addresses");
        assert.strictEqual(address.layoutBudget, 5, "Each decision carries the effective budget in force at the node");
        assert.strictEqual(
            !!(address.resolvedRef && address.resolvedRef.properties && address.resolvedRef.properties.Street),
            true,
            "An inlined $ref carries its resolved target in the decision rather than overwriting the node"
        );
        assert.strictEqual(table.get("#/properties/Huge").renderMode, "dialog", "A six-field $ref over a budget of 5 is decided dialog");
        assert.strictEqual(
            table.get("#/properties/Missing").widget,
            "reference",
            "An unresolvable $ref is decided dialog with the reference widget, instead of the widget being written onto the node"
        );
        assert.strictEqual(
            table.get("#/properties/Address/properties/Street"),
            undefined,
            "Leaf fields of an inlined $ref carry no decision: only container nodes are decided"
        );
        assert.strictEqual(
            fixture.schema.properties.Address.$ref,
            "#/definitions/Address",
            "The schema still holds the author's $ref after scoring: the scorer resolved nothing in place"
        );

        // The same table published for the schema root, so a consumer holding only the schema can read it.
        assert.strictEqual(
            LayoutScorer.getDecision(fixture.schema, "#/properties/Huge").renderMode,
            "dialog",
            "LayoutScorer.getDecision serves the decision from the side table keyed by the schema root"
        );

        // LayoutMutator is the single writer: it projects the decisions for the renderers that still
        // read them off the node (LayoutElementWalker, NestedDialogPlugin, SchemaNormalizer.resolveScope).
        LayoutMutator.apply(fixture.schema, table);
        assert.strictEqual(
            fixture.schema.properties.Address.$ref,
            undefined,
            "LayoutMutator materializes the inlined $ref, so child scopes resolve for the layout walker"
        );
        assert.strictEqual(
            fixture.schema.properties.Huge.ui.renderMode,
            "dialog",
            "LayoutMutator projects the dialog decision onto the node the renderers read"
        );
        assert.strictEqual(
            fixture.schema.properties.Locked.properties.Code.readOnly,
            true,
            "LayoutMutator applies the read-only cascade the scorer recorded instead of the scorer writing it"
        );
    });

    QUnit.test("LayoutScorer: an inlined $ref keeps the referencing node's own ui directives", function (assert) {
        // Materializing an inlined $ref ran `Object.assign(node, resolvedMeta)` and only then rebuilt
        // `node.ui` from `node.ui` - which the assign had already replaced with the definition's block.
        // Every directive the author wrote on the referencing node was dropped. `ui.readOnly` was in
        // that set: a collection the schema declares read-only rendered with its rows fully editable.
        // The read-only cascade hid this for object definitions, which is why it survived; an array
        // definition has no `properties` for the cascade to walk.
        var refSchema = SchemaNormalizer.normalize({
            type: "object",
            properties: {
                Tags: { $ref: "#/definitions/Tags", ui: { readOnly: true, enabled: false } },
                Address: { $ref: "#/definitions/Address", ui: { dialogButtonText: "Edit address", layoutBudget: 7 } },
                Code: { $ref: "#/definitions/Code" },
                Sealed: { $ref: "#/definitions/Sealed" }
            }
        });
        var refDefs = {
            Tags: SchemaNormalizer.normalizeDefinition({ type: "array", items: { type: "string" } }, "Tags"),
            Address: SchemaNormalizer.normalizeDefinition(
                { type: "object", properties: { Street: { type: "string" } } },
                "Address"
            ),
            Code: SchemaNormalizer.normalizeDefinition({ type: "string", maxLength: 3 }, "Code"),
            Sealed: SchemaNormalizer.normalizeDefinition({ type: "string", readOnly: true }, "Sealed")
        };
        LayoutMutator.apply(refSchema, LayoutScorer.apply(refSchema, 50, refDefs));

        assert.strictEqual(refSchema.properties.Tags.ui.readOnly, true, "An inlined array $ref keeps the node's ui.readOnly");
        assert.strictEqual(refSchema.properties.Tags.readOnly, true, "An inlined array $ref keeps the node's readOnly");
        assert.strictEqual(refSchema.properties.Tags.items.readOnly, true, "Read-only cascades onto an inlined array $ref's items");
        assert.strictEqual(refSchema.properties.Tags.items.ui.readOnly, true, "ui.readOnly cascades onto an inlined array $ref's items");
        assert.strictEqual(refSchema.properties.Tags.ui.enabled, false, "An inlined $ref keeps the node's ui.enabled");
        assert.strictEqual(
            refSchema.properties.Address.ui.dialogButtonText,
            "Edit address",
            "An inlined $ref keeps the node's ui.dialogButtonText"
        );
        assert.strictEqual(refSchema.properties.Address.ui.layoutBudget, 7, "An inlined $ref keeps the node's ui.layoutBudget");
        assert.strictEqual(refSchema.properties.Code.maxLength, 3, "The definition's own constraints are still materialized");
        assert.strictEqual(
            refSchema.properties.Code.ui.readOnly,
            false,
            "A $ref the author did not restrict stays writable: the merge adds no restriction of its own"
        );
        assert.strictEqual(
            refSchema.properties.Sealed.readOnly,
            true,
            "A read-only definition is not relaxed by the normalized 'readOnly: false' the referencing node carries"
        );
    });

    QUnit.test("LayoutScorer: the layouts and the nested dialog read decisions, not annotations", function (assert) {
        // Two of the three consumers that used to read the decision off the schema node now take it from
        // the side table and from an explicit parameter. Proven by making the node and the decision
        // disagree: the scorer runs, so the table says 'dialog', but LayoutMutator never runs, so the
        // node carries no renderMode at all. A walker still reading the node would build an inline table.
        var overflowSchema = SchemaNormalizer.normalize({
            type: "object",
            properties: {
                Lines: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            A: { type: "string" }, B: { type: "string" }, C: { type: "string" },
                            D: { type: "string" }, E: { type: "string" }, F: { type: "string" }
                        }
                    }
                }
            }
        });
        DefaultLayoutGenerator.ensureLayout(overflowSchema);
        var overflowTable = LayoutScorer.apply(overflowSchema, 2);

        assert.strictEqual(
            overflowTable.get("#/properties/Lines").renderMode,
            "dialog",
            "Precondition: the six-column collection overflows a budget of 2"
        );
        assert.strictEqual(
            overflowSchema.properties.Lines.ui.renderMode,
            undefined,
            "Precondition: no projection has run, so the node carries no render mode of its own"
        );

        var walkerEngine = new Engine(true, false, PluginRegistry.getInstance());
        var walkerCtrl = new FormLayout().render(overflowSchema, "meta", walkerEngine);
        assert.strictEqual(
            Boolean(walkerEngine.getPluginByPath("/Lines")),
            true,
            "LayoutElementWalker took the dialog decision from the side table and emitted the array trigger, not an inline table"
        );
        walkerCtrl.destroy();
        walkerEngine.destroy();

        // The nested dialog's budget now arrives as an explicit launch parameter sourced from the host,
        // instead of riding on `ui.layoutBudget` written into the consumer's schema.
        var dialogSchema = SchemaNormalizer.normalize({
            type: "object",
            properties: {
                Addr: { type: "object", ui: { renderMode: "dialog" }, properties: { Street: { type: "string" } } },
                Pinned: {
                    type: "object",
                    ui: { renderMode: "dialog", layoutBudget: 9 },
                    properties: { Street: { type: "string" } }
                }
            }
        });
        DefaultLayoutGenerator.ensureLayout(dialogSchema);
        LayoutMutator.apply(dialogSchema, LayoutScorer.apply(dialogSchema, 50));

        assert.strictEqual(
            dialogSchema.properties.Addr.ui.layoutBudget,
            undefined,
            "The effective budget is no longer written onto the schema node: that channel is closed"
        );

        var budgetEngine = new Engine(true, false, PluginRegistry.getInstance());
        budgetEngine.host = { getLayoutBudget: function () { return 42; } };
        var budgetCtrl = new FormLayout().render(dialogSchema, "meta", budgetEngine);
        var addrPlugin = budgetEngine.getPluginByPath("/Addr");
        var pinnedPlugin = budgetEngine.getPluginByPath("/Pinned");

        assert.strictEqual(
            addrPlugin.resolveNestedLayoutBudget(dialogSchema.properties.Addr),
            42,
            "A nested dialog inherits the host's budget through the engine context"
        );
        assert.strictEqual(
            pinnedPlugin.resolveNestedLayoutBudget(dialogSchema.properties.Pinned),
            9,
            "An author-declared ui.layoutBudget on the property still wins over the host's budget"
        );
        budgetCtrl.destroy();
        budgetEngine.destroy();
    });

    QUnit.test("LayoutScorer: a breadth-deep $ref chain stops at the shared depth cap", function (assert) {
        // The scorer was the only walker in the codebase with no depth cap: `visited` and `activeRefs`
        // catch cycles, and 45 distinct definitions chained one into the next are not a cycle. Each
        // link resolves and recurses, so the walk reaches depth 45 with nothing to stop it.
        var CHAIN_LENGTH = 45;
        var chainDefs = {};
        var i;
        for (i = 0; i < CHAIN_LENGTH; i++) {
            chainDefs["Def" + i] = SchemaNormalizer.normalizeDefinition(
                { type: "object", properties: { Next: { $ref: "#/definitions/Def" + (i + 1) } } },
                "Def" + i
            );
        }
        chainDefs["Def" + CHAIN_LENGTH] = SchemaNormalizer.normalizeDefinition(
            { type: "object", properties: { Leaf: { type: "string" } } },
            "Def" + CHAIN_LENGTH
        );
        var deepSchema = SchemaNormalizer.normalize({
            type: "object",
            properties: { Root: { $ref: "#/definitions/Def0" } }
        });

        var warnings = [];
        var origWarn = Logger.warn;
        Logger.warn = function (msg) { warnings.push(String(msg)); };
        var table;
        try {
            table = LayoutScorer.apply(deepSchema, 1000, chainDefs);
        } finally {
            Logger.warn = origWarn;
        }

        var depthWarnings = warnings.filter(function (msg) { return msg.indexOf("Maximum schema depth") !== -1; });
        assert.strictEqual(depthWarnings.length > 0, true, "Hitting the cap is reported, not silently truncated");
        assert.strictEqual(
            table.size < CHAIN_LENGTH,
            true,
            "The walk stops at the cap instead of descending all 46 links of the chain"
        );

        var deepest = Array.from(table.keys()).sort(function (a, b) { return b.split("/").length - a.split("/").length; })[0];
        assert.strictEqual(
            table.get(deepest).renderMode,
            "dialog",
            "The node at the cap is decided dialog, so the truncated branch renders in its own host rather than half-drawn"
        );
    });

    // =============================================================================================
    // Capacity: UI5 caps every list binding at Model#iSizeLimit contexts, 100 by default. The
    // sandbox model never set it, so a generated sap.m.Table bound to a larger collection drew the
    // first 100 rows and discarded the rest with no warning, no growing trigger and no gap in the UI.
    // The rows stayed in the payload and were still submitted, which is what made it invisible.
    // =============================================================================================

    /**
     * Builds a uniform collection of table rows.
     *
     * @param {number} count Number of rows to build.
     * @returns {object[]} The rows.
     */
    function buildRows(count) {
        var rows = [];
        for (var i = 0; i < count; i++) {
            rows.push({ Id: i, Name: "Row " + i });
        }
        return rows;
    }

    /**
     * Normalized schema for a payload holding one array of two-property rows.
     *
     * @returns {object} The normalized schema.
     */
    function rowCollectionSchema() {
        return SchemaNormalizer.normalize({
            type: "object",
            properties: {
                Rows: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: { Id: { type: "integer" }, Name: { type: "string" } }
                    }
                }
            }
        });
    }

    /**
     * Binds a throwaway `sap.m.Table` to a sandbox collection and reports how many rows it holds.
     * This is the user-visible end of the defect: the binding may know about 1000 rows while the
     * table shows 100.
     *
     * @param {object} model The sandbox model.
     * @param {string} path Absolute path of the collection.
     * @returns {number} The number of `ColumnListItem`s the table built.
     */
    function boundRowCount(model, path) {
        var table = new Table({ columns: [new Column({ header: new Text({ text: "Name" }) })] });
        table.setModel(model, "meta");
        table.bindItems({
            path: "meta>" + path,
            template: new ColumnListItem({ cells: [new Text({ text: "{meta>Name}" })] }),
            templateShareable: false
        });
        var count = table.getItems().length;
        table.destroy();
        return count;
    }

    QUnit.module("Capacity: sandbox list-binding size limit");

    QUnit.test("Capacity: a 1000-row collection reaches the table instead of stopping at UI5's default of 100", function (assert) {
        var state = new StateManager({ Rows: buildRows(1000) }, rowCollectionSchema());
        var model = state.getModel();
        var binding = model.bindList("/Rows");
        var contexts = binding.getContexts().length;
        var rendered = boundRowCount(model, "/Rows");
        // Read defensively so the row-count assertions below still report their numbers on a build
        // where the accessor does not exist yet, instead of the test dying before it measures anything.
        var capacity = typeof model.getListBindingCapacity === "function" ? model.getListBindingCapacity() : -1;
        binding.destroy();
        state.destroy();

        assert.strictEqual(
            capacity,
            1000,
            "The sandbox sized its list-binding capacity to the payload rather than leaving UI5's default of 100"
        );
        assert.strictEqual(
            contexts,
            1000,
            "The JSONListBinding hands out all 1000 contexts - it handed out 100 before the fix"
        );
        assert.strictEqual(
            rendered,
            1000,
            "A sap.m.Table bound to the sandbox holds 1000 items, so rows 101..1000 are no longer dropped in silence"
        );
    });

    QUnit.test("Capacity: a payload below UI5's default keeps the default, leaving headroom for rows the user adds", function (assert) {
        var state = new StateManager({ Rows: buildRows(5) }, rowCollectionSchema());
        var smallModel = state.getModel();
        var capacity = typeof smallModel.getListBindingCapacity === "function" ? smallModel.getListBindingCapacity() : -1;
        state.destroy();

        assert.strictEqual(
            capacity,
            100,
            "A five-row payload is bound exactly as before: the capacity is a floor of 100, never shrunk to the data"
        );
    });

    QUnit.test("Capacity: a collection written back larger than it loaded raises the capacity, so Add Row never falls off the end", function (assert) {
        var state = new StateManager({ Rows: buildRows(1000) }, rowCollectionSchema());
        var model = state.getModel();
        var readCapacity = function () {
            return typeof model.getListBindingCapacity === "function" ? model.getListBindingCapacity() : -1;
        };
        var before = readCapacity();
        var grown = buildRows(1000);
        grown.push({ Id: 1000, Name: "Added by the user" });
        model.setProperty("/Rows", grown);
        var after = readCapacity();
        var rendered = boundRowCount(model, "/Rows");
        state.destroy();

        assert.strictEqual(before, 1000, "The capacity starts at the loaded size");
        assert.strictEqual(
            after,
            1001,
            "Writing the grown array back through SandboxJSONModel.setProperty - the path TableRowHelper.addRow uses - raised it"
        );
        assert.strictEqual(rendered, 1001, "The row the user added is drawn, not accepted into the payload and hidden");
    });

    QUnit.test("Capacity: a collection past the hard ceiling is capped and reported at error level, never cut in silence", function (assert) {
        var ceiling = typeof SandboxJSONModel.getMaxListBindingCapacity === "function"
            ? SandboxJSONModel.getMaxListBindingCapacity()
            : 10000;
        var oversize = [];
        for (var i = 0; i <= ceiling; i++) {
            oversize.push(i);
        }
        var origError = Logger.error;
        var reported = [];
        var capacity = 0;
        Logger.error = function (message, details) {
            reported.push(String(message) + " " + String(details));
        };
        try {
            var state = new StateManager({ Rows: oversize }, rowCollectionSchema());
            var cappedModel = state.getModel();
            capacity = typeof cappedModel.getListBindingCapacity === "function" ? cappedModel.getListBindingCapacity() : -1;
            state.destroy();
        } finally {
            Logger.error = origError;
        }
        var joined = reported.join(" | ");

        assert.strictEqual(capacity, ceiling, "The capacity stops at the declared ceiling rather than growing without bound");
        assert.strictEqual(
            joined.indexOf(String(ceiling + 1)) !== -1,
            true,
            "The report names the real entry count, so the shortfall is quantified instead of implied"
        );
        assert.strictEqual(joined.indexOf("/Rows") !== -1, true, "The report names the collection that was capped");
        assert.strictEqual(
            joined.indexOf("still submitted") !== -1,
            true,
            "The report says the hidden entries remain in the payload, which is the part a reader cannot guess"
        );
    });

    // =============================================================================================
    // Capacity, second half: lifting the model cap made every row reachable and made a 1000-row
    // table paint all of them - 754 ms at 3 columns, 3782 ms at 15, measured. TableLayout now pages
    // the generated table at 100 rows so first paint is back to the cost of a 100-row table, with the
    // growing trigger's "[ 100 / 1000 ]" counter disclosing the remainder.
    //
    // sap.m.GrowingEnablement renders only the prefix [0, _iLimit) and recomputes that limit on Sort,
    // Filter and Context changes only - never on a plain data change. So an appended row lands outside
    // the window unless something widens it, which is the truncation defect again at a new boundary.
    // =============================================================================================

    /**
     * Renders a real `TableLayout` table over a sandbox collection and mounts it in the DOM.
     *
     * @param {number} rowCount Rows to put in the collection.
     * @param {string} sandboxId DOM id of the mounted container.
     * @returns {object} The table, its model, and a teardown function.
     */
    function buildLayoutTable(rowCount, sandboxId) {
        var engine = new Engine(true, false, PluginRegistry.getInstance());
        var schema = SchemaNormalizer.normalize({
            type: "array",
            layoutStrategy: "table",
            items: { type: "object", properties: { Name: { type: "string" } } }
        });
        var model = new SandboxJSONModel({ items: buildRows(rowCount) });
        var table = new TableLayout().render(schema, "meta", engine, undefined, "/items");
        table.setModel(model, "meta");
        table.placeAt(sandboxId);
        Core.applyChanges();
        return {
            table: table,
            model: model,
            destroy: function () {
                table.destroy();
                engine.destroy();
                model.destroy();
            }
        };
    }

    /**
     * Presses the generated "Add Row" button in a table's header toolbar.
     *
     * @param {object} table The generated `sap.m.Table`.
     */
    function pressAddRow(table) {
        var content = table.getHeaderToolbar().getContent();
        for (var i = 0; i < content.length; i++) {
            if (content[i].data && content[i].data("metauiTableAddBtn") === true) {
                content[i].firePress();
                return;
            }
        }
    }

    /**
     * Reads a table's growing counters, with a sentinel when the table has no growing delegate.
     *
     * @param {object} table The generated `sap.m.Table`.
     * @returns {object} `{ actual, total }` - rendered data rows and the collection's full size.
     */
    function growingCounters(table) {
        return table.getGrowingInfo() || { actual: -1, total: -1 };
    }

    /**
     * Widens a growing table's rendered window, as pressing its "More" trigger would.
     *
     * @param {object} table The generated `sap.m.Table`.
     * @param {number} extra Additional rows to render.
     * @returns {number} The rendered row count afterwards, or -1 when the table does not page.
     */
    function growToCover(table, extra) {
        if (!table.getGrowing()) {
            return -1;
        }
        table.requestItems(extra);
        return growingCounters(table).actual;
    }

    QUnit.test("Capacity: a generated table pages at 100 rows instead of painting the whole collection", function (assert) {
        var sandboxId = "sandbox-capacity-paging";
        createRenderSandbox(sandboxId);
        var built = buildLayoutTable(1000, sandboxId);
        var table = built.table;
        var growing = table.getGrowing();
        var threshold = table.getGrowingThreshold();
        var scrollToLoad = table.getGrowingScrollToLoad();
        var counters = growingCounters(table);
        var bindingLength = table.getBinding("items").getLength();
        // Paging is only acceptable if the pages actually lead somewhere: walk the window out to the
        // end the way the "More" trigger does and check every row can in fact be drawn.
        var reachable = growToCover(table, 900);
        built.destroy();

        assert.strictEqual(growing, true, "The generated table pages rather than painting every row on load");
        assert.strictEqual(threshold, 100, "One page is 100 rows - the window users already saw when UI5 was silently capping");
        assert.strictEqual(
            scrollToLoad,
            false,
            "An explicit trigger, not scroll-loading: inside a non-scrolling container scroll-loading never fires and says nothing"
        );
        assert.strictEqual(counters.actual, 100, "Exactly one page is painted, so first paint costs what a 100-row table costs");
        assert.strictEqual(
            counters.total,
            1000,
            "The trigger counter still reports all 1000, which is the disclosure that the remainder exists"
        );
        assert.strictEqual(bindingLength, 1000, "Every row is still bound - paged, not truncated");
        assert.strictEqual(
            reachable,
            1000,
            "Growing the window to the end renders all 1000 rows, so the pages lead to the whole collection"
        );
    });

    QUnit.test("Capacity: Add Row past the page boundary draws the row the user just created", function (assert) {
        var sandboxId = "sandbox-capacity-addrow-paged";
        createRenderSandbox(sandboxId);
        var built = buildLayoutTable(150, sandboxId);
        var before = growingCounters(built.table);
        pressAddRow(built.table);
        Core.applyChanges();
        var after = growingCounters(built.table);
        var storedRows = built.model.getProperty("/items").length;
        built.destroy();

        assert.strictEqual(before.actual, 100, "A 150-row table starts paged at one page");
        assert.strictEqual(storedRows, 151, "The new row reached the payload");
        assert.strictEqual(
            after.actual,
            151,
            "and the rendered window widened to include it - it stayed at 100 before the fix, hiding the row that was just created"
        );
        assert.strictEqual(after.total, 151, "The counter follows, so the table and the payload agree on how many rows exist");
    });

    QUnit.test("Capacity: a table that fits inside one page is untouched by paging when a row is added", function (assert) {
        var sandboxId = "sandbox-capacity-addrow-single";
        createRenderSandbox(sandboxId);
        var built = buildLayoutTable(5, sandboxId);
        var before = growingCounters(built.table);
        pressAddRow(built.table);
        Core.applyChanges();
        var after = growingCounters(built.table);
        built.destroy();

        assert.strictEqual(before.actual, 5, "A five-row table renders all five rows, exactly as before paging was enabled");
        assert.strictEqual(after.actual, 6, "The added row renders with no window growth needed - the common case costs nothing");
    });

    // =============================================================================================
    // Hardware: Firefox ships no Web Speech recognition and WebKit on Windows exposes no
    // navigator.mediaDevices. Pressing the microphone or camera button there changed nothing a user
    // or a test could observe - the only trace was a Logger.warn, which UI5's stock ERROR log level
    // discards. Chromium has both APIs, so these branches are unreachable unless the globals are
    // removed, which is why the defect survived until someone ran a second engine.
    // =============================================================================================

    /**
     * Creates a physical, laid-out container inside the QUnit fixture.
     *
     * @param {string} id DOM id to create.
     * @returns {HTMLElement} The container element.
     */
    function createRenderSandbox(id) {
        var existing = document.getElementById(id);
        if (existing && existing.parentNode) {
            existing.parentNode.removeChild(existing);
        }
        var div = document.createElement("div");
        div.id = id;
        div.style.width = "600px";
        document.getElementById("qunit-fixture").appendChild(div);
        return div;
    }

    /**
     * Shadows a global property with a fixed value, as an engine that lacks the API would present it.
     *
     * @param {object} target The object carrying the property (`window` or `navigator`).
     * @param {string} name The property name.
     * @param {*} value The replacement value.
     * @returns {Function} A function restoring the original descriptor.
     */
    function overrideGlobal(target, name, value) {
        var ownDescriptor = Object.getOwnPropertyDescriptor(target, name);
        Object.defineProperty(target, name, { value: value, configurable: true, writable: true });
        return function () {
            if (ownDescriptor) {
                Object.defineProperty(target, name, ownDescriptor);
            } else {
                delete target[name];
            }
        };
    }

    /**
     * Returns the items of a hardware control's hidden `_content` layout.
     *
     * @param {object} control The hardware control.
     * @returns {object[]} The inner controls.
     */
    function hardwareItems(control) {
        var content = control.getAggregation("_content");
        return content && typeof content.getItems === "function" ? content.getItems() : [];
    }

    /**
     * Collects everything a user or a consuming application could perceive on a hardware control.
     *
     * @param {object} control The hardware control.
     * @returns {object} The painted state and its DOM projection.
     */
    function perceivedState(control) {
        var domRef = control.getDomRef();
        var errEl = document.getElementById(control.getId() + "-err");
        return {
            valueState: String(control.getValueState()),
            valueStateText: control.getValueStateText(),
            ariaInvalid: domRef ? String(domRef.getAttribute("aria-invalid")) : "no-dom",
            errorLineVisible: Boolean(errEl) && errEl.style.display === "block",
            errorLineText: errEl ? errEl.textContent : ""
        };
    }

    QUnit.module("Hardware: unavailable device APIs are painted, not only logged");

    QUnit.test("Hardware: a browser without the Web Speech API paints a visible error on the voice control", function (assert) {
        var sandboxId = "sandbox-hardware-voice";
        createRenderSandbox(sandboxId);
        var restoreStd = overrideGlobal(window, "SpeechRecognition", undefined);
        var restoreWebkit = overrideGlobal(window, "webkitSpeechRecognition", undefined);
        var control = new VoiceInputControl();
        var seen = { valueState: "", valueStateText: "", ariaInvalid: "", errorLineVisible: false, errorLineText: "" };
        var innerInputState = "";

        try {
            control.placeAt(sandboxId);
            Core.applyChanges();
            var items = hardwareItems(control);
            items[1].firePress();
            Core.applyChanges();
            seen = perceivedState(control);
            innerInputState = String(items[0].getValueState());
        } finally {
            control.destroy();
            restoreWebkit();
            restoreStd();
        }

        assert.strictEqual(seen.valueState, "Error", "The control paints ValueState.Error instead of returning after a log");
        assert.strictEqual(
            seen.valueStateText.indexOf("Speech recognition") === 0,
            true,
            "The message names the capability that is missing: " + seen.valueStateText
        );
        assert.strictEqual(innerInputState, "Error", "The transcription Input the user is focused on mirrors the state");
        assert.strictEqual(seen.ariaInvalid, "true", "The wrapper is marked aria-invalid, so a screen reader announces it");
        assert.strictEqual(
            seen.errorLineVisible && seen.errorLineText.length > 0,
            true,
            "The inline error line is displayed with text, which is the DOM mutation that was absent before"
        );
    });

    QUnit.test("Hardware: a browser without navigator.mediaDevices paints a visible error on the camera control", function (assert) {
        var sandboxId = "sandbox-hardware-camera";
        createRenderSandbox(sandboxId);
        var restoreMedia = overrideGlobal(navigator, "mediaDevices", undefined);
        var control = new CameraControl();
        var seen = { valueState: "", valueStateText: "", ariaInvalid: "", errorLineVisible: false, errorLineText: "" };

        try {
            control.placeAt(sandboxId);
            Core.applyChanges();
            var buttonRow = hardwareItems(control)[2];
            buttonRow.getItems()[0].firePress();
            Core.applyChanges();
            seen = perceivedState(control);
        } finally {
            control.destroy();
            restoreMedia();
        }

        assert.strictEqual(seen.valueState, "Error", "The camera control paints ValueState.Error when the capture API is absent");
        assert.strictEqual(
            seen.valueStateText.indexOf("Camera") === 0,
            true,
            "The message names the camera: " + seen.valueStateText
        );
        assert.strictEqual(seen.ariaInvalid, "true", "The wrapper is marked aria-invalid");
        assert.strictEqual(
            seen.errorLineVisible && seen.errorLineText.length > 0,
            true,
            "The inline error line is displayed with text"
        );
    });

    QUnit.test("Hardware: a refused getUserMedia paints the actionable 'blocked' message rather than a bare failure", function (assert) {
        var done = assert.async();
        var sandboxId = "sandbox-hardware-camera-denied";
        createRenderSandbox(sandboxId);
        var denial = new Error("Permission denied");
        denial.name = "NotAllowedError";
        var restoreMedia = overrideGlobal(navigator, "mediaDevices", {
            getUserMedia: function () {
                return Promise.reject(denial);
            }
        });
        var control = new CameraControl();
        control.placeAt(sandboxId);
        Core.applyChanges();
        hardwareItems(control)[2].getItems()[0].firePress();

        window.setTimeout(function () {
            var seen = perceivedState(control);
            control.destroy();
            restoreMedia();

            assert.strictEqual(seen.valueState, "Error", "A refused camera paints ValueState.Error");
            assert.strictEqual(
                seen.valueStateText.indexOf("blocked") !== -1,
                true,
                "The message tells the user it was blocked and where to change it: " + seen.valueStateText
            );
            assert.strictEqual(seen.errorLineVisible, true, "The inline error line is displayed");
            done();
        }, 0);
    });

    QUnit.test("Hardware: device absence and device denial are reported at one severity, so neither is lost to the log level", function (assert) {
        var sandboxId = "sandbox-hardware-severity";
        createRenderSandbox(sandboxId);
        var origWarn = Logger.warn;
        var origError = Logger.error;
        var warned = [];
        var errored = [];
        Logger.warn = function (message, details) {
            warned.push(String(message) + " " + String(details));
        };
        Logger.error = function (message, details) {
            errored.push(String(message) + " " + String(details));
        };

        var restoreStd = overrideGlobal(window, "SpeechRecognition", undefined);
        var restoreWebkit = overrideGlobal(window, "webkitSpeechRecognition", undefined);
        var restoreMedia = overrideGlobal(navigator, "mediaDevices", undefined);
        var restoreGeo = overrideGlobal(navigator, "geolocation", undefined);
        var voice = new VoiceInputControl();
        var camera = new CameraControl();
        var geo = new GeolocationControl();

        try {
            voice.placeAt(sandboxId);
            camera.placeAt(sandboxId);
            geo.placeAt(sandboxId);
            Core.applyChanges();
            hardwareItems(voice)[1].firePress();
            hardwareItems(camera)[2].getItems()[0].firePress();
            hardwareItems(geo)[1].firePress();
            Core.applyChanges();
        } finally {
            voice.destroy();
            camera.destroy();
            geo.destroy();
            restoreGeo();
            restoreMedia();
            restoreWebkit();
            restoreStd();
            Logger.warn = origWarn;
            Logger.error = origError;
        }

        var absenceErrors = errored.filter(function (entry) {
            return entry.indexOf("is not available in this browser") !== -1;
        });
        var absenceWarnings = warned.filter(function (entry) {
            return entry.indexOf("not available") !== -1 || entry.indexOf("not supported") !== -1;
        });

        assert.strictEqual(
            absenceErrors.length,
            3,
            "All three absent capabilities report through Logger.error - the level that survives UI5's stock ERROR log level"
        );
        assert.strictEqual(
            absenceWarnings.length,
            0,
            "None of them is left at Logger.warn, which was discarded before the test harness could observe it"
        );
    });

    // =============================================================================================
    // Hardware (D3): getCurrentPosition was called with no options object, so timeout took its
    // specified default of 0xFFFFFFFF ms. A permission prompt that is dismissed rather than answered
    // invokes neither callback, and per the W3C Geolocation API the permission wait is excluded from
    // the timeout period, so no browser timer ever starts - the spinner never stops.
    // =============================================================================================

    QUnit.module("Hardware: geolocation never leaves the control busy");

    QUnit.test("Hardware: geolocation passes a bounded timeout and clears busy on the success path", function (assert) {
        var sandboxId = "sandbox-hardware-geo-success";
        createRenderSandbox(sandboxId);
        var captured = null;
        var restoreGeo = overrideGlobal(navigator, "geolocation", {
            getCurrentPosition: function (success, error, options) {
                captured = options;
                success({ coords: { latitude: -41.286461, longitude: 174.77623 } });
            }
        });
        var control = new GeolocationControl();
        var busyAfter = true;
        var value = null;
        var state = "";

        try {
            control.placeAt(sandboxId);
            Core.applyChanges();
            hardwareItems(control)[1].firePress();
            Core.applyChanges();
            busyAfter = hardwareItems(control)[1].getBusy();
            value = control.getProperty("value");
            state = String(control.getValueState());
        } finally {
            control.destroy();
            restoreGeo();
        }

        assert.strictEqual(
            captured ? typeof captured.timeout : "no options argument",
            "number",
            "An options object is passed at all - the call previously had only two arguments"
        );
        assert.strictEqual(
            Boolean(captured) && captured.timeout > 0 && captured.timeout <= 60000,
            true,
            "The timeout is bounded and in seconds, not the specified default of 0xFFFFFFFF ms"
        );
        assert.strictEqual(captured ? captured.maximumAge : -1, 0, "A cached fix is not accepted for a field the user just asked to fill");
        assert.strictEqual(busyAfter, false, "The success path clears busy");
        assert.strictEqual(
            Boolean(value) && value.lat === -41.286461 && value.lng === 174.77623,
            true,
            "The success path still stores the rounded coordinates, so the working path did not regress"
        );
        assert.strictEqual(state, "None", "A successful fix paints no error");
    });

    QUnit.test("Hardware: a refused geolocation clears busy and paints why", function (assert) {
        var sandboxId = "sandbox-hardware-geo-denied";
        createRenderSandbox(sandboxId);
        var restoreGeo = overrideGlobal(navigator, "geolocation", {
            getCurrentPosition: function (success, error) {
                error({ code: 1, message: "User denied Geolocation" });
            }
        });
        var control = new GeolocationControl();
        var busyAfter = true;
        var seen = { valueState: "", valueStateText: "", ariaInvalid: "", errorLineVisible: false, errorLineText: "" };

        try {
            control.placeAt(sandboxId);
            Core.applyChanges();
            hardwareItems(control)[1].firePress();
            Core.applyChanges();
            busyAfter = hardwareItems(control)[1].getBusy();
            seen = perceivedState(control);
        } finally {
            control.destroy();
            restoreGeo();
        }

        assert.strictEqual(busyAfter, false, "The error path clears busy");
        assert.strictEqual(seen.valueState, "Error", "The refusal is painted, not only logged");
        assert.strictEqual(
            seen.valueStateText.indexOf("blocked") !== -1,
            true,
            "PERMISSION_DENIED maps to the actionable 'blocked' message: " + seen.valueStateText
        );
    });

    QUnit.test("Hardware: a prompt that is dismissed rather than answered still ends the spinner", function (assert) {
        var sandboxId = "sandbox-hardware-geo-dismissed";
        createRenderSandbox(sandboxId);
        // Firefox's "dismiss" invokes neither callback, which is what this stub reproduces.
        var restoreGeo = overrideGlobal(navigator, "geolocation", {
            getCurrentPosition: function () {
                return undefined;
            }
        });
        var origSetTimeout = window.setTimeout;
        var watchdog = null;
        var watchdogDelay = -1;
        window.setTimeout = function (fn, delay) {
            if (typeof delay === "number" && delay >= 5000) {
                watchdog = fn;
                watchdogDelay = delay;
                return -1;
            }
            return origSetTimeout.apply(window, arguments);
        };
        var control = new GeolocationControl();
        var busyDuring = false;
        var busyAfter = true;
        var seen = { valueState: "", valueStateText: "", ariaInvalid: "", errorLineVisible: false, errorLineText: "" };

        try {
            control.placeAt(sandboxId);
            Core.applyChanges();
            hardwareItems(control)[1].firePress();
            busyDuring = hardwareItems(control)[1].getBusy();
            window.setTimeout = origSetTimeout;
            if (watchdog) {
                watchdog();
            }
            Core.applyChanges();
            busyAfter = hardwareItems(control)[1].getBusy();
            seen = perceivedState(control);
        } finally {
            window.setTimeout = origSetTimeout;
            control.destroy();
            restoreGeo();
        }

        assert.strictEqual(busyDuring, true, "The button goes busy while the request is outstanding");
        assert.strictEqual(
            watchdogDelay > 0 && watchdogDelay <= 30000,
            true,
            "A bounded watchdog is armed before the request (" + watchdogDelay + " ms); nothing armed one before the fix"
        );
        assert.strictEqual(
            busyAfter,
            false,
            "When neither callback ever runs the watchdog clears busy - previously the spinner ran until the page was closed"
        );
        assert.strictEqual(seen.valueState, "Error", "The dead request is reported rather than left as a silent spinner");
        assert.strictEqual(
            seen.valueStateText.indexOf("did not respond") !== -1,
            true,
            "The message says the device did not respond: " + seen.valueStateText
        );
    });

    QUnit.test("Hardware: the watchdog is cancelled when the control is destroyed", function (assert) {
        var sandboxId = "sandbox-hardware-geo-exit";
        createRenderSandbox(sandboxId);
        var restoreGeo = overrideGlobal(navigator, "geolocation", {
            getCurrentPosition: function () {
                return undefined;
            }
        });
        var origSetTimeout = window.setTimeout;
        var origClearTimeout = window.clearTimeout;
        var watchdogId = null;
        var cleared = [];
        window.setTimeout = function (fn, delay) {
            var id = origSetTimeout.apply(window, arguments);
            if (typeof delay === "number" && delay >= 5000) {
                watchdogId = id;
            }
            return id;
        };
        window.clearTimeout = function (id) {
            cleared.push(id);
            return origClearTimeout.apply(window, arguments);
        };
        var control = new GeolocationControl();

        try {
            control.placeAt(sandboxId);
            Core.applyChanges();
            hardwareItems(control)[1].firePress();
            window.setTimeout = origSetTimeout;
            cleared.length = 0;
            control.destroy();
        } finally {
            window.setTimeout = origSetTimeout;
            window.clearTimeout = origClearTimeout;
            restoreGeo();
        }

        assert.strictEqual(watchdogId !== null, true, "A real watchdog timer was armed by the request");
        assert.strictEqual(
            cleared.indexOf(watchdogId) !== -1,
            true,
            "destroy() clears that exact timer, so a torn-down control cannot be woken by its own watchdog"
        );
    });

    // ---------------------------------------------------------------------------------------
    // OData V4 is a production path for this library's consumers, and until now it carried one
    // assertion: that setProperty is still called when getProperty throws. Nothing exercised
    // detection, the read path, nested or collection paths, or a PATCH the service rejects.
    //
    // These doubles implement the exact slice of sap.ui.model.odata.v4.Context the delegate
    // calls - requestObject(), getProperty(), setProperty(), getPath(), getModel() - with the
    // real V4 semantics that matter here: getProperty THROWS for a property the model has not
    // requested (V4 does this; V2 returns undefined), and setProperty returns a Promise that
    // can reject. A double that returned undefined instead of throwing would let a broken
    // delegate pass.
    // ---------------------------------------------------------------------------------------
    // ---------------------------------------------------------------------------------------
    // openInDialog had no behavioural coverage. The existing dialog tests assert which controls
    // LayoutMutator emits for renderMode "dialog" - a different thing entirely. Nothing pinned
    // the transaction the user actually experiences: a dialog host edits a sandbox, so the edit
    // must stay out of `data` until they confirm, Cancel must discard it, and Confirm must keep
    // it. Those three are the whole contract, and a regression in any of them either loses the
    // user's work or commits work they cancelled.
    // ---------------------------------------------------------------------------------------
    // ---------------------------------------------------------------------------------------
    // The integration shape a real consumer runs: a sap.m.Table whose rows come from a genuine
    // OData V4 service, three ordinary scalar columns, and a fourth column holding a MetaUI
    // DynamicHost that edits a JSON document carried in an Edm.String field, driven by a schema.
    //
    // Everything else in this suite uses doubles for OData. This test uses the real
    // sap.ui.model.odata.v4.ODataModel against the harness's own HTTP server, so UI5 parses real
    // CSDL metadata, builds a real list binding, and issues a real PATCH over the wire. The
    // service records what arrived, and the test reads it back - so "the edit reached the
    // backend" is observed, not inferred.
    //
    // groupId "$direct" is deliberate: it makes the model send a plain PATCH per change instead
    // of wrapping everything in a $batch, which is what makes the request assertable here.
    // ---------------------------------------------------------------------------------------
    QUnit.module("OData V4 + table + embedded host: the shape a consumer actually builds");

    var WO_SERVICE = "/odata/v4/wo/";

    // Three fields, so the host is exercised over more than a single input.
    function detailsSchema() {
        return {
            type: "object",
            properties: {
                Priority: { type: "string", enum: ["Low", "Medium", "High"], ui: { label: "Priority" } },
                Quantity: { type: "integer", ui: { label: "Quantity" } },
                Notes: { type: "string", ui: { label: "Notes" } }
            }
        };
    }

    function probeService() {
        return fetch(WO_SERVICE + "__odata-probe").then(function (r) { return r.json(); });
    }

    function inputsUnder(ctrl) {
        var acc = [];
        (function walk(c, d) {
            if (!c || !c.getMetadata || d > 22) return;
            if (c.isA && (c.isA("sap.m.Input") || c.isA("sap.m.Select") || c.isA("sap.m.ComboBox") || c.isA("sap.m.StepInput"))) acc.push(c);
            var aggs = c.mAggregations || {};
            Object.keys(aggs).forEach(function (k) {
                var v = aggs[k];
                if (Array.isArray(v)) { v.forEach(function (x) { walk(x, d + 1); }); }
                else { walk(v, d + 1); }
            });
        })(ctrl, 0);
        return acc;
    }

    QUnit.test("A table bound to OData V4 renders a MetaUI host per row, and an edit in it reaches the service as a PATCH", function (assert) {
        var done = assert.async();

        fetch(WO_SERVICE + "__odata-reset").then(function () {
            var oModel = new ODataModelV4({ serviceUrl: WO_SERVICE, groupId: "$direct" });

            var oTable = new Table({
                columns: [
                    new Column({ header: new Text({ text: "Code" }) }),
                    new Column({ header: new Text({ text: "Status" }) }),
                    new Column({ header: new Text({ text: "Owner" }) }),
                    new Column({ header: new Text({ text: "Details (MetaUI)" }) })
                ]
            });
            oTable.setModel(oModel);

            var oHostTemplate = new DynamicHost({
                schemaDefinition: detailsSchema(),
                editable: true,
                liveUpdate: true
            });
            oHostTemplate.bindProperty("dataJson", { path: "DetailsJson" });

            oTable.bindItems({
                path: "/WorkOrders",
                template: new ColumnListItem({
                    cells: [
                        new Text({ text: "{Code}" }),
                        new Text({ text: "{Status}" }),
                        new Text({ text: "{Owner}" }),
                        oHostTemplate
                    ]
                })
            });

            oTable.placeAt("qunit-fixture");
            Core.applyChanges();

            // The V4 list binding resolves asynchronously, then each row's host generates.
            setTimeout(function () {
                Core.applyChanges();
                var items = oTable.getItems();
                assert.strictEqual(items.length, 3, "The table filled from the OData V4 service: three WorkOrder rows");

                var firstCells = items.length ? items[0].getCells() : [];
                assert.strictEqual(firstCells.length, 4, "Each row has the three scalar columns plus the MetaUI column");
                assert.strictEqual(
                    firstCells.length === 4 ? firstCells[0].getText() : "",
                    "PO-10021",
                    "A scalar column renders the OData value directly"
                );

                var hosts = items.map(function (it) {
                    return it.getCells().filter(function (c) {
                        return c && c.isA && c.isA("nz.co.siliconst.ui5.metaui.controls.DynamicHost");
                    })[0];
                }).filter(Boolean);
                assert.strictEqual(hosts.length, 3, "Every row got its own MetaUI host, one per OData row");

                var rowOneInputs = hosts.length ? inputsUnder(hosts[0]) : [];
                assert.ok(
                    rowOneInputs.length >= 3,
                    "The host generated a field per schema property from the row's JSON string (" + rowOneInputs.length + " controls)"
                );

                var notes = rowOneInputs.filter(function (c) { return c.isA("sap.m.Input") && c.getValue() === "Original"; })[0];
                assert.ok(notes, "The host rendered the JSON document's own value, so dataJson was parsed from the OData field");

                if (!notes) { oTable.destroy(); oModel.destroy(); done(); return; }

                notes.setValue("EDITED-VIA-METAUI");
                notes.fireChange({ value: "EDITED-VIA-METAUI" });
                Core.applyChanges();

                // liveUpdate writes the JSON back onto the bound OData property; "$direct" turns
                // that into an immediate PATCH.
                setTimeout(function () {
                    probeService().then(function (state) {
                        var patches = state.patches || [];
                        assert.ok(patches.length >= 1, "Editing inside the host produced at least one PATCH to the service (" + patches.length + ")");

                        var wo1 = patches.filter(function (p) { return p.id === "WO-1"; });
                        assert.ok(wo1.length >= 1, "The PATCH targeted the edited row's own entity, WO-1");

                        var carriedDetails = wo1.some(function (p) {
                            return p.body && typeof p.body.DetailsJson === "string" && p.body.DetailsJson.indexOf("EDITED-VIA-METAUI") !== -1;
                        });
                        assert.ok(carriedDetails, "The PATCH body carried the edited JSON document in DetailsJson");

                        var stored = (state.rows || []).filter(function (r) { return r.ID === "WO-1"; })[0];
                        assert.ok(
                            stored && String(stored.DetailsJson).indexOf("EDITED-VIA-METAUI") !== -1,
                            "The service now holds the edited document: the round trip completed"
                        );

                        var untouched = (state.rows || []).filter(function (r) { return r.ID === "WO-2"; })[0];
                        assert.ok(
                            untouched && String(untouched.DetailsJson).indexOf("EDITED-VIA-METAUI") === -1,
                            "A sibling row was not written to: each embedded host edits only its own entity"
                        );

                        oTable.destroy();
                        oModel.destroy();
                        done();
                    }).catch(function (e) {
                        assert.ok(false, "probe failed: " + (e && e.message));
                        oTable.destroy();
                        oModel.destroy();
                        done();
                    });
                }, 2500);
            }, 4000);
        });
    });

    QUnit.module("Dialog: the edit transaction a user actually performs");

    function dialogSchema() {
        return {
            type: "object",
            title: "Order",
            properties: {
                OrderCode: { type: "string", ui: { label: "Order Code" } },
                Quantity: { type: "integer", ui: { label: "Quantity" } }
            }
        };
    }

    function findOpenDialog() {
        var nodes = document.querySelectorAll(".sapMDialog");
        if (!nodes.length) return null;
        return sap.ui.getCore().byId(nodes[nodes.length - 1].id) || null;
    }

    function firstInputIn(ctrl) {
        var found = null;
        (function walk(c, d) {
            if (!c || !c.getMetadata || found || d > 20) return;
            if (c.isA && c.isA("sap.m.Input")) { found = c; return; }
            var aggs = c.mAggregations || {};
            Object.keys(aggs).forEach(function (k) {
                var v = aggs[k];
                if (Array.isArray(v)) { v.forEach(function (x) { walk(x, d + 1); }); }
                else { walk(v, d + 1); }
            });
        })(ctrl, 0);
        return found;
    }

    QUnit.test("Dialog: an edit is held until the user confirms, and Cancel discards it", function (assert) {
        var done = assert.async();
        var host = new DynamicHost({
            schemaDefinition: dialogSchema(),
            data: { OrderCode: "PO-1", Quantity: 2 },
            editable: true
        });
        host.placeAt("qunit-fixture");
        Core.applyChanges();

        host.openInDialog("Order", "OK", "Cancel").catch(function () { /* resolves on close */ });

        setTimeout(function () {
            Core.applyChanges();
            var dialog = findOpenDialog();
            assert.ok(dialog, "openInDialog puts a sap.m.Dialog on screen");

            var input = dialog ? firstInputIn(dialog) : null;
            assert.ok(input, "The dialog contains a generated input from the schema");

            if (!input) { host.destroy(); done(); return; }

            input.setValue("PO-EDITED");
            input.fireChange({ value: "PO-EDITED" });
            Core.applyChanges();

            var committedEarly = JSON.stringify(host.getProperty("data") || {}).indexOf("PO-EDITED") !== -1;
            assert.strictEqual(
                committedEarly,
                false,
                "Before the user confirms, the edit is in the sandbox and NOT in the host's committed data"
            );

            var cancelBtn = dialog.getEndButton && dialog.getEndButton();
            assert.ok(cancelBtn, "The dialog offers a cancel affordance");
            if (cancelBtn) { cancelBtn.firePress(); }

            setTimeout(function () {
                Core.applyChanges();
                assert.strictEqual(document.querySelectorAll(".sapMDialog").length, 0, "Cancel closes the dialog");

                // The host is reparented into the dialog and restored to its origin on close, so
                // after Cancel its own rendered field is the live view of the sandbox. A sandbox
                // that was not rolled back still shows the abandoned edit there.
                var restoredInput = firstInputIn(host);
                assert.ok(restoredInput, "The host is restored to the page after the dialog closes");
                assert.strictEqual(
                    restoredInput ? restoredInput.getValue() : "(no input)",
                    "PO-1",
                    "Cancel rolled the sandbox back: the restored field shows the original value, not the abandoned edit"
                );
                assert.strictEqual(
                    JSON.stringify(host.getProperty("data") || {}).indexOf("PO-EDITED"),
                    -1,
                    "...and the committed data never saw the abandoned edit either"
                );
                host.destroy();
                done();
            }, 600);
        }, 1200);
    });

    QUnit.test("Dialog: confirming commits the edit to the host payload", function (assert) {
        var done = assert.async();
        var host = new DynamicHost({
            schemaDefinition: dialogSchema(),
            data: { OrderCode: "PO-1", Quantity: 2 },
            editable: true
        });
        host.placeAt("qunit-fixture");
        Core.applyChanges();

        host.openInDialog("Order", "OK", "Cancel").catch(function () { /* resolves on close */ });

        setTimeout(function () {
            Core.applyChanges();
            var dialog = findOpenDialog();
            var input = dialog ? firstInputIn(dialog) : null;
            assert.ok(input, "The dialog rendered an input to edit");
            if (!input) { host.destroy(); done(); return; }

            input.setValue("PO-COMMITTED");
            input.fireChange({ value: "PO-COMMITTED" });
            Core.applyChanges();

            var okBtn = dialog.getBeginButton && dialog.getBeginButton();
            assert.ok(okBtn, "The dialog offers a confirm affordance");
            if (okBtn) { okBtn.firePress(); }

            setTimeout(function () {
                Core.applyChanges();
                assert.strictEqual(
                    JSON.stringify(host.getProperty("data") || {}).indexOf("PO-COMMITTED") !== -1,
                    true,
                    "Confirm commits the edit into the host's data, which is what the application reads"
                );
                host.destroy();
                done();
            }, 800);
        }, 1200);
    });

    QUnit.module("Host enabled: one switch that greys out the whole form");

    /**
     * Polls until `probe` returns a truthy value or the timeout passes, then calls `then` with the last result.
     */
    function waitUntil(probe, timeoutMs, then) {
        var start = Date.now();
        (function poll() {
            Core.applyChanges();
            var result = probe();
            if (result || Date.now() - start > timeoutMs) {
                then(result);
                return;
            }
            setTimeout(poll, 50);
        })();
    }

    /** Depth-first search of a control tree, hidden aggregations included, for the first match of `predicate`. */
    function findInTree(root, predicate) {
        var found = null;
        (function walk(c, d) {
            if (!c || !c.getMetadata || found || d > 30) return;
            if (predicate(c)) { found = c; return; }
            var aggs = c.mAggregations || {};
            Object.keys(aggs).forEach(function (k) {
                var v = aggs[k];
                if (Array.isArray(v)) { v.forEach(function (x) { walk(x, d + 1); }); }
                else { walk(v, d + 1); }
            });
        })(root, 0);
        return found;
    }

    QUnit.test("Host enabled: a table row clone is disabled at render, and follows enabled toggled at runtime", function (assert) {
        var done = assert.async();
        var host = new DynamicHost({
            schemaDefinition: {
                type: "array",
                layoutStrategy: "table",
                items: { type: "object", properties: { Sku: { type: "string" }, Qty: { type: "integer" } } }
            },
            data: [{ Sku: "A-1", Qty: 2 }, { Sku: "B-2", Qty: 5 }],
            enabled: false
        });
        host.placeAt("qunit-fixture");

        var secondRowInput = function () {
            var table = findInTree(host, function (c) { return c.isA && c.isA("sap.m.Table"); });
            var items = table ? table.getItems() : [];
            return items.length > 1 ? firstInputIn(items[1]) : null;
        };
        var addRowButton = function () {
            return findInTree(host, function (c) { return c.data && c.data("metauiTableAddBtn") === true; });
        };

        waitUntil(secondRowInput, 4000, function (cell) {
            assert.ok(cell, "The table rendered cloned rows with an input cell");
            if (!cell) { host.destroy(); done(); return; }
            assert.strictEqual(cell.getEnabled(), false, "A cloned row cell is disabled when the host renders with enabled=false");
            assert.strictEqual(cell.getEditable(), true, "...as a real widget, not the display text editable=false would give");
            assert.strictEqual(cell.getValue(), "B-2", "...still showing its own row's value");
            assert.strictEqual(addRowButton().getEnabled(), false, "...and Add Row is disabled with it");

            host.setEnabled(true);
            waitUntil(function () {
                var c = secondRowInput();
                return c && c !== cell && c.getEnabled() === true ? c : null;
            }, 4000, function (enabledCell) {
                assert.ok(enabledCell, "Setting enabled=true at runtime re-renders the row cells enabled");
                host.setEnabled(false);
                waitUntil(function () {
                    var c = secondRowInput();
                    return c && c !== enabledCell && c.getEnabled() === false ? c : null;
                }, 4000, function (disabledCell) {
                    assert.ok(disabledCell, "Setting enabled=false at runtime disables row cells that were already rendered enabled");
                    assert.strictEqual(disabledCell && disabledCell.getValue(), "B-2", "...and the payload survives the re-render");
                    host.destroy();
                    done();
                });
            });
        });
    });

    QUnit.test("Host enabled: a nested drill-down dialog opened from a disabled host is disabled too", function (assert) {
        var done = assert.async();
        var host = new DynamicHost({
            schemaDefinition: {
                type: "object",
                properties: {
                    Name: { type: "string" },
                    Address: {
                        type: "object",
                        ui: { label: "Address", renderMode: "dialog" },
                        properties: { Street: { type: "string" } }
                    }
                }
            },
            data: { Name: "Acme", Address: { Street: "1 Queen St" } },
            enabled: false
        });
        host.placeAt("qunit-fixture");

        var trigger = function () {
            return findInTree(host, function (c) {
                return c.isA && c.isA("sap.m.Button") && /Address/.test(String(c.data && c.data("metauiBindingPath")));
            });
        };
        var nestedInput = function () {
            var dialog = findOpenDialog();
            return dialog ? firstInputIn(dialog) : null;
        };

        waitUntil(trigger, 4000, function (btn) {
            assert.ok(btn, "The nested object renders its drill-down trigger");
            if (!btn) { host.destroy(); done(); return; }
            assert.strictEqual(btn.getEnabled(), false, "The drill-down trigger is disabled on a disabled host");

            // firePress bypasses the disabled state on purpose: it is how a consumer opening the dialog
            // programmatically reaches it, and the nested host must not come up live behind a disabled form.
            btn.firePress();
            waitUntil(nestedInput, 4000, function (input) {
                assert.ok(input, "The nested dialog host rendered its own input");
                assert.strictEqual(input && input.getEnabled(), false, "A control inside the nested dialog host is disabled");
                assert.strictEqual(input && input.getValue(), "1 Queen St", "...and still shows the nested value");
                var dialog = findOpenDialog();
                if (dialog) { dialog.close(); dialog.destroy(); }

                host.setEnabled(true);
                waitUntil(function () {
                    var b = trigger();
                    return b && b !== btn && b.getEnabled() === true ? b : null;
                }, 4000, function (liveBtn) {
                    assert.ok(liveBtn, "Setting enabled=true at runtime re-enables the trigger");
                    if (!liveBtn) { host.destroy(); done(); return; }
                    liveBtn.firePress();
                    waitUntil(function () {
                        var i = nestedInput();
                        return i && i !== input ? i : null;
                    }, 4000, function (liveInput) {
                        assert.strictEqual(liveInput && liveInput.getEnabled(), true, "...and the dialog it opens is enabled");
                        var d = findOpenDialog();
                        if (d) { d.close(); d.destroy(); }
                        host.destroy();
                        done();
                    });
                });
            });
        });
    });

    QUnit.module("Space: a host reads the width it is given");

    function spaceSchema() {
        return {
            type: "object",
            title: "Order",
            properties: {
                OrderCode: { type: "string", title: "Order Code" },
                DeliveryOn: { type: "string", format: "date", title: "Delivery Date" },
                Priority: { type: "string", title: "Priority", ui: { widget: "select" },
                    valueHelp: [{ key: "S", text: "Standard" }, { key: "E", text: "Express" }] },
                Quantity: { type: "integer", title: "Quantity" },
                Urgent: { type: "boolean", title: "Urgent" }
            }
        };
    }

    function spaceData() {
        return { OrderCode: "PO-1", DeliveryOn: "2026-11-30", Priority: "S", Quantity: 12, Urgent: true };
    }

    /** A sized box in the fixture for a host to live in. */
    function spaceBox(id, width) {
        var existing = document.getElementById(id);
        if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
        var div = document.createElement("div");
        div.id = id;
        div.style.width = width + "px";
        document.getElementById("qunit-fixture").appendChild(div);
        return div;
    }

    /** Reads what the host shows: the collapse button, or the form and where its first label sits. */
    function readSpace(host) {
        var dom = host.getDomRef();
        if (!dom) return null;
        var visible = function (el) { return el && el.offsetParent !== null; };
        var button = Array.prototype.slice.call(dom.querySelectorAll("button")).filter(function (b) {
            return visible(b) && /Order/.test(b.textContent);
        })[0];
        var label = Array.prototype.slice.call(dom.querySelectorAll("label")).filter(visible)[0];
        var input = Array.prototype.slice.call(dom.querySelectorAll("input")).filter(visible)[0];
        var banner = Array.prototype.slice.call(dom.querySelectorAll(".sapMMsgStrip")).filter(visible)[0];
        var placement = "none";
        if (label && input) {
            var lr = label.getBoundingClientRect();
            var ir = input.getBoundingClientRect();
            placement = Math.abs(lr.top - ir.top) < 16 && lr.right <= ir.left + 2 ? "beside" : "stacked";
        }
        return {
            collapsed: !!button,
            button: button || null,
            formShown: !!input,
            labels: placement,
            banner: !!banner,
            height: Math.round(dom.getBoundingClientRect().height)
        };
    }

    QUnit.test("Space: labels sit beside fields in a 545px container, stack at 292px, and a 148px host collapses to a button", function (assert) {
        var done = assert.async();
        var warnings = [];
        var originalWarn = Logger.warn;
        Logger.warn = function (message) {
            warnings.push(String(message));
            return originalWarn.apply(Logger, arguments);
        };
        var widths = [545, 292, 148];
        var hosts = widths.map(function (w) {
            spaceBox("space-" + w, w);
            var host = new DynamicHost({ schemaDefinition: spaceSchema(), data: spaceData() });
            host.placeAt("space-" + w);
            return host;
        });
        var settled = function () {
            var r = hosts.map(readSpace);
            return r[0] && r[0].formShown && r[1] && r[1].formShown && r[2] && r[2].collapsed ? r : null;
        };
        waitUntil(settled, 5000, function (r) {
            Logger.warn = originalWarn;
            r = r || hosts.map(readSpace);
            assert.strictEqual(r[0] && r[0].labels, "beside", "545px: labels sit beside their fields, not stacked as on a phone");
            assert.strictEqual(r[1] && r[1].labels, "stacked", "292px: labels stack, which is the readable choice at that width");
            assert.ok(r[2] && r[2].collapsed && !r[2].formShown, "148px: the form is replaced by a button rather than rendered mangled");
            assert.ok(r[2] && r[2].height < 80, "148px: the collapsed host stays one line tall (" + (r[2] && r[2].height) + "px)");
            assert.ok(
                warnings.some(function (w) { return /was given 148px/.test(w) && /collapsed/.test(w); }),
                "The collapse is logged with the host and the width it was given"
            );
            assert.ok(
                !warnings.some(function (w) { return /was given (545|292)px/.test(w); }),
                "...and nothing is logged for hosts that fit"
            );
            hosts.forEach(function (h) { h.destroy(); });
            done();
        });
    });

    QUnit.test("Space: a collapsed host comes back when its container widens, and opens the form in a dialog when pressed", function (assert) {
        var done = assert.async();
        var box = spaceBox("space-resize", 148);
        var host = new DynamicHost({ schemaDefinition: spaceSchema(), data: spaceData() });
        host.placeAt("space-resize");
        waitUntil(function () { var r = readSpace(host); return r && r.collapsed ? r : null; }, 5000, function (collapsed) {
            assert.ok(collapsed, "The host collapses at 148px");
            if (!collapsed) { host.destroy(); done(); return; }

            sap.ui.getCore().byId(collapsed.button.id).firePress();
            waitUntil(function () {
                var dialog = findOpenDialog();
                return dialog && firstInputIn(dialog) ? dialog : null;
            }, 5000, function (dialog) {
                assert.ok(dialog, "Pressing the button opens the form in a dialog");
                var inDialog = dialog ? readSpace(dialog.getContent()[0]) : null;
                assert.ok(inDialog && inDialog.formShown && !inDialog.collapsed, "...where the form is shown, not another button");
                if (dialog) { dialog.getEndButton().firePress(); }

                waitUntil(function () { var r = readSpace(host); return !findOpenDialog() && r && r.collapsed ? r : null; }, 5000, function (back) {
                    assert.ok(back, "After the dialog closes, the host in the narrow cell is collapsed again");
                    box.style.width = "545px";
                    waitUntil(function () { var r = readSpace(host); return r && r.formShown ? r : null; }, 5000, function (wide) {
                        assert.ok(wide && wide.formShown && !wide.collapsed, "Widening the container to 545px brings the form back");
                        assert.strictEqual(wide && wide.labels, "beside", "...with labels beside the fields");
                        host.destroy();
                        done();
                    });
                });
            });
        });
    });

    QUnit.test("Space: a too-narrow host already inside a dialog keeps its form and says why under a banner", function (assert) {
        var done = assert.async();
        sap.ui.require(["sap/m/Dialog", "sap/m/VBox"], function (Dialog, VBox) {
        var host = new DynamicHost({ schemaDefinition: spaceSchema(), data: spaceData() });
        var dialog = new Dialog({ content: [new VBox({ width: "150px", items: [host] })] });
        dialog.open();
        waitUntil(function () { var r = readSpace(host); return r && r.banner ? r : null; }, 5000, function (r) {
            assert.ok(r && r.banner, "A banner says the form has too little room");
            assert.ok(r && r.formShown && !r.collapsed, "The form stays, because a button opening a second dialog would help nobody");
            dialog.close();
            dialog.destroy();
            done();
        });
        });
    });

    QUnit.module("Payload: showPayload shows the live JSON on demand");

    function payloadSchema() {
        return { type: "object", properties: { Name: { type: "string", title: "Name" }, Qty: { type: "integer", title: "Quantity" } } };
    }

    /** The corner icon of a host when it is rendered and visible, otherwise null. */
    function payloadIcon(host) {
        var inner = host._innerHost;
        var icon = inner && inner.getAggregation("_payload");
        return icon && icon.getVisible() && icon.getDomRef() ? icon : null;
    }

    /** Opens the viewer from a host's icon and resolves with the dialog's code editor. */
    function openViewer(pressable, then) {
        pressable.firePress();
        waitUntil(function () {
            var dialog = findOpenDialog();
            var editor = dialog && findInTree(dialog, function (c) { return c.isA && c.isA("sap.ui.codeeditor.CodeEditor"); });
            return editor && editor.getValue() ? { dialog: dialog, editor: editor } : null;
        }, 6000, then);
    }

    function closeViewer(viewer) {
        if (!viewer) return;
        var buttons = viewer.dialog.getButtons();
        buttons[buttons.length - 1].firePress();
    }

    QUnit.test("Payload: the icon is absent by default, and present when set, bound, or defaulted app-wide", function (assert) {
        var done = assert.async();
        var appState = new JSONModel({ devMode: true });
        var plain = new DynamicHost({ schemaDefinition: payloadSchema(), data: { Name: "a", Qty: 1 } });
        var set = new DynamicHost({ schemaDefinition: payloadSchema(), data: { Name: "b", Qty: 2 }, showPayload: true });
        var bound = new DynamicHost({ schemaDefinition: payloadSchema(), data: { Name: "c", Qty: 3 }, showPayload: "{appState>/devMode}" });
        var optedOut = new DynamicHost({ schemaDefinition: payloadSchema(), data: { Name: "d", Qty: 4 }, showPayload: false });
        bound.setModel(appState, "appState");
        [plain, set, bound, optedOut].forEach(function (h, i) { spaceBox("payload-presence-" + i, 545); h.placeAt("payload-presence-" + i); });

        waitUntil(function () { return set._innerHost && payloadIcon(set) && payloadIcon(bound) && plain._innerHost && plain._innerHost.generatedContent ? true : null; }, 5000, function () {
            assert.strictEqual(payloadIcon(plain), null, "Absent by default");
            assert.ok(payloadIcon(set), "Present when showPayload is set");
            assert.ok(payloadIcon(bound), "Present when showPayload is bound to a true value");
            assert.strictEqual(plain._innerHost.getAggregation("_payload"), null, "A host that never shows it carries no icon control at all");

            DynamicHost.setShowPayloadDefault(true);
            waitUntil(function () { return payloadIcon(plain) ? true : null; }, 3000, function () {
                assert.ok(payloadIcon(plain), "The app-wide default turns it on for a host already rendered");
                assert.strictEqual(payloadIcon(optedOut), null, "...but an explicit showPayload: false still wins over the default");
                DynamicHost.setShowPayloadDefault(false);
                waitUntil(function () { return payloadIcon(plain) ? null : true; }, 3000, function () {
                    assert.strictEqual(payloadIcon(plain), null, "Clearing the default removes it again");
                    assert.ok(payloadIcon(set), "...from hosts relying on it, not from hosts that set it themselves");
                    [plain, set, bound, optedOut].forEach(function (h) { h.destroy(); });
                    appState.destroy();
                    done();
                });
            });
        });
    });

    QUnit.test("Payload: flipping the bound flag adds and removes the icon without touching an edit in progress", function (assert) {
        var done = assert.async();
        var appState = new JSONModel({ devMode: false });
        spaceBox("payload-flip", 545);
        var host = new DynamicHost({ schemaDefinition: payloadSchema(), data: { Name: "Acme", Qty: 3 }, showPayload: "{appState>/devMode}" });
        host.setModel(appState, "appState");
        host.placeAt("payload-flip");

        waitUntil(function () { return firstInputIn(host) && firstInputIn(host).getDomRef("inner") ? firstInputIn(host) : null; }, 5000, function (input) {
            var dom = input.getDomRef("inner");
            dom.focus();
            dom.value = "Acme Half-ty";
            dom.dispatchEvent(new Event("input", { bubbles: true }));
            assert.strictEqual(payloadIcon(host), null, "Off while the bound flag is false");

            appState.setProperty("/devMode", true);
            Core.applyChanges();
            var afterOn = input.getDomRef("inner");
            assert.ok(payloadIcon(host), "Setting the bound flag shows the icon");
            assert.strictEqual(afterOn, dom, "The field's DOM node is the same one: the form was not re-rendered from scratch");
            assert.strictEqual(afterOn.value, "Acme Half-ty", "The half-typed value is still there");
            assert.strictEqual(document.activeElement, afterOn, "...and the field still has focus");

            appState.setProperty("/devMode", false);
            Core.applyChanges();
            var afterOff = input.getDomRef("inner");
            assert.strictEqual(payloadIcon(host), null, "Clearing the bound flag hides the icon");
            assert.ok(afterOff === dom && afterOff.value === "Acme Half-ty", "The edit in progress survives turning it off as well");
            host.destroy();
            appState.destroy();
            done();
        });
    });

    QUnit.test("Payload: bound per row, the icon appears on the rows that allow it and not on the others", function (assert) {
        var done = assert.async();
        sap.ui.require(["sap/m/Table", "sap/m/Column", "sap/m/ColumnListItem"], function (Table, Column, ColumnListItem) {
            var rows = new JSONModel({ rows: [
                { CanInspect: true, Order: { Name: "row0", Qty: 1 } },
                { CanInspect: false, Order: { Name: "row1", Qty: 2 } },
                { CanInspect: true, Order: { Name: "row2", Qty: 3 } }
            ] });
            var table = new Table({ columns: [new Column({ width: "545px" })] });
            table.bindItems({
                path: "rows>/rows",
                template: new ColumnListItem({ cells: [new DynamicHost({
                    schemaDefinition: payloadSchema(),
                    data: "{rows>Order}",
                    showPayload: "{rows>CanInspect}"
                })] })
            });
            table.setModel(rows, "rows");
            spaceBox("payload-rows", 700);
            table.placeAt("payload-rows");
            var hosts = function () { return table.getItems().map(function (item) { return item.getCells()[0]; }); };
            waitUntil(function () {
                var h = hosts();
                return h.length === 3 && h.every(function (x) { return x._innerHost && x._innerHost.generatedContent; }) && payloadIcon(h[0]) ? h : null;
            }, 6000, function (h) {
                h = h || hosts();
                assert.deepEqual(
                    h.map(function (x) { return !!payloadIcon(x); }),
                    [true, false, true],
                    "Each row's host follows its own row's CanInspect"
                );
                rows.setProperty("/rows/1/CanInspect", true);
                Core.applyChanges();
                assert.ok(payloadIcon(hosts()[1]), "Changing one row's flag turns its icon on without touching the others");
                table.destroy();
                rows.destroy();
                done();
            });
        });
    });

    QUnit.test("Payload: the viewer shows the payload as it is now, formatted or raw, read-only", function (assert) {
        var done = assert.async();
        spaceBox("payload-live", 545);
        var host = new DynamicHost({ schemaDefinition: payloadSchema(), data: { Name: "Acme", Qty: 3 }, showPayload: true });
        host.placeAt("payload-live");
        waitUntil(function () { return payloadIcon(host) && firstInputIn(host) ? firstInputIn(host) : null; }, 5000, function (input) {
            input.setValue("Acme Edited");
            input.fireChange({ value: "Acme Edited" });
            Core.applyChanges();
            openViewer(payloadIcon(host), function (viewer) {
                assert.ok(viewer, "Pressing the icon opens a dialog holding a code editor");
                if (!viewer) { host.destroy(); done(); return; }
                var shown = JSON.parse(viewer.editor.getValue());
                assert.strictEqual(shown.Name, "Acme Edited", "The JSON includes the edit made since render, read when the icon was pressed");
                assert.strictEqual(viewer.editor.getValue(), JSON.stringify(shown, null, 2), "Formatted with two-space indentation");
                assert.strictEqual(viewer.editor.getEditable(), false, "The viewer is read-only");
                assert.strictEqual(
                    JSON.stringify(host.getProperty("data")).indexOf("Acme Edited"),
                    -1,
                    "...while the edit is still uncommitted to the host's data"
                );
                var footer = viewer.dialog.getButtons();
                assert.strictEqual(footer.length, 3, "The footer offers Raw, Copy and Close");
                footer[0].setPressed(true);
                footer[0].firePress();
                Core.applyChanges();
                assert.strictEqual(viewer.editor.getValue(), JSON.stringify(shown), "Raw shows the same JSON unindented");
                closeViewer(viewer);
                waitUntil(function () { return findOpenDialog() ? null : true; }, 3000, function () {
                    assert.ok(!findOpenDialog(), "Close closes the viewer");
                    host.destroy();
                    done();
                });
            });
        });
    });

    QUnit.test("Payload: the icon costs the form no width, wide or narrow, and only a strip of height", function (assert) {
        var done = assert.async();
        var measure = function (host) {
            var dom = host.getDomRef();
            var input = firstInputIn(host);
            var inner = input && input.getDomRef() ? input.getDomRef().getBoundingClientRect() : null;
            var r = dom.getBoundingClientRect();
            return { width: Math.round(r.width), height: Math.round(r.height), inputWidth: inner ? Math.round(inner.width) : null };
        };
        var hosts = [545, 148].map(function (w) {
            spaceBox("payload-width-" + w, w);
            var h = new DynamicHost({ schemaDefinition: payloadSchema(), data: { Name: "Acme", Qty: 3 } });
            h.placeAt("payload-width-" + w);
            return h;
        });
        waitUntil(function () {
            return hosts[0]._innerHost && firstInputIn(hosts[0]) && hosts[1]._innerHost && hosts[1]._innerHost.isSpaceCollapsed() ? true : null;
        }, 6000, function () {
            var off = hosts.map(measure);
            hosts.forEach(function (h) { h.setShowPayload(true); });
            Core.applyChanges();
            var on = hosts.map(measure);
            // Width is the axis that must not move: in a table column it is the scarce one, and a button
            // stealing a few rem would undo the narrow-container work. Height may grow, because the button
            // hangs from an anchor with its own strip rather than overlapping the first field - a
            // zero-height anchor put it 20px over the first input's right edge, on top of a dropdown's
            // arrow or a date picker's icon.
            assert.deepEqual(
                { width: on[0].width, inputWidth: on[0].inputWidth },
                { width: off[0].width, inputWidth: off[0].inputWidth },
                "545px: host width and the first field's width are identical with the icon on (" + JSON.stringify(on[0]) + ")"
            );
            assert.ok(
                on[0].height > off[0].height && on[0].height - off[0].height <= 40,
                "545px: the icon adds a strip of height and no more (" + off[0].height + " -> " + on[0].height + ")"
            );
            assert.strictEqual(
                on[1].width, off[1].width,
                "148px (collapsed): host width is identical with the payload affordance on (" + on[1].width + ")"
            );
            hosts.forEach(function (h) { h.destroy(); });
            done();
        });
    });

    QUnit.test("Payload: a host collapsed for lack of width offers the JSON beside its form button, and opens the JSON", function (assert) {
        var done = assert.async();
        spaceBox("payload-collapsed", 148);
        var host = new DynamicHost({ schemaDefinition: payloadSchema(), data: { Name: "Acme", Qty: 3 }, showPayload: true });
        host.placeAt("payload-collapsed");
        waitUntil(function () {
            var notice = host._innerHost && host._innerHost.getAggregation("_space");
            return notice && notice.getVisible() && notice.getDomRef() ? notice : null;
        }, 6000, function (notice) {
            assert.ok(notice, "The host collapses at 148px");
            if (!notice) { host.destroy(); done(); return; }
            var items = notice.getItems();
            assert.ok(items.length === 2 && items[1].getVisible(), "The collapsed state shows two affordances: the form and the JSON");
            assert.strictEqual(payloadIcon(host), null, "...and the corner icon gives way to the second button");
            openViewer(items[1], function (viewer) {
                assert.ok(viewer && JSON.parse(viewer.editor.getValue()).Name === "Acme", "Pressing it opens the JSON, not the form");
                closeViewer(viewer);
                waitUntil(function () { return findOpenDialog() ? null : true; }, 3000, function () {
                    host.destroy();
                    done();
                });
            });
        });
    });

    QUnit.module("OData V4: the path a V4 consumer actually exercises");

    function makeV4Context(entity, patched, options) {
        var opts = options || {};
        return {
            getPath: function () { return "/Employees('E100')"; },
            getModel: function () {
                return {
                    getMetadata: function () {
                        return { getName: function () { return "sap.ui.model.odata.v4.ODataModel"; } };
                    }
                };
            },
            requestObject: function () {
                return opts.rejectRead ? Promise.reject(new Error("read failed")) : Promise.resolve(entity);
            },
            getProperty: function (path) {
                if (opts.unrequested && opts.unrequested.indexOf(path) !== -1) {
                    throw new Error("Unexpected request for non-primitive value " + path);
                }
                return path.split("/").reduce(function (acc, seg) {
                    return acc === null || acc === undefined ? undefined : acc[seg];
                }, entity);
            },
            setProperty: function (path, value) {
                if (opts.rejectWrite) { return Promise.reject(new Error("409 Conflict")); }
                patched[path] = value;
                return Promise.resolve();
            }
        };
    }

    QUnit.test("OData V4: the entity reaches the form and OData annotations never do", function (assert) {
        var done = assert.async();
        var host = new DynamicHost();
        var entity = {
            "@odata.etag": "W/x1x",
            "@odata.context": "$metadata#Employees",
            "__metadata": { uri: "x" },
            ID: "E100",
            FirstName: "Alice",
            Address: { "@odata.type": "#Model.Address", City: "Wellington" },
            Items: [{ "@odata.etag": "W/x2x", Sku: "S1" }]
        };
        var del = new ODataDelegate(host, makeV4Context(entity, {}));
        del.syncToEngine();

        Promise.resolve().then(function () {
            var data = host.getProperty("data");
            assert.strictEqual(data && data.FirstName, "Alice", "The V4 entity's business data reaches the host");
            assert.strictEqual(data && data["@odata.etag"], undefined, "The '@odata.etag' annotation is stripped, not shown as a field");
            assert.strictEqual(data && data["__metadata"], undefined, "A '__metadata' key is stripped too");
            assert.strictEqual(data && data.Address && data.Address.City, "Wellington", "A nested complex type survives sanitisation");
            assert.strictEqual(
                data && data.Address && data.Address["@odata.type"],
                undefined,
                "An annotation nested inside a complex type is stripped as well, not only top-level ones"
            );
            assert.strictEqual(
                data && data.Items && data.Items[0] && data.Items[0]["@odata.etag"],
                undefined,
                "An annotation inside a collection entry is stripped"
            );
            del.destroy();
            host.destroy();
            done();
        });
    });

    QUnit.test("OData V4: an edit patches at the right path, and an unchanged value does not", function (assert) {
        var patched = {};
        var host = new DynamicHost();
        var entity = { FirstName: "Alice", Address: { City: "Wellington" }, Items: [{ Qty: 1 }] };
        var del = new ODataDelegate(host, makeV4Context(entity, patched));

        del.handleFieldChange("/FirstName", "Bob");
        assert.strictEqual(patched["FirstName"], "Bob", "A scalar edit patches through Context.setProperty");
        assert.strictEqual(
            Object.prototype.hasOwnProperty.call(patched, "/FirstName"),
            false,
            "The leading slash is stripped: V4 wants a context-relative path, not an absolute model path"
        );

        del.handleFieldChange("/Address/City", "Auckland");
        assert.strictEqual(patched["Address/City"], "Auckland", "A nested edit patches the complex-type path");

        host.fireEvent("submit", { payload: { Items: [{ Qty: 7 }] } });
        assert.strictEqual(patched["Items/0/Qty"], 7, "A collection entry patches element-wise, matching what a live edit emits");

        var before = Object.keys(patched).length;
        del.handleFieldChange("/FirstName", "Bob");
        assert.strictEqual(
            Object.keys(patched).length,
            before,
            "Re-submitting the value the context already holds writes nothing: a spurious PATCH bumps the ETag"
        );

        del.destroy();
        host.destroy();
    });

    QUnit.test("OData V4: a service that rejects the patch is reported, not swallowed", function (assert) {
        var done = assert.async();
        var host = new DynamicHost();
        var errors = [];
        host.attachEvent("error", function (e) { errors.push(e.getParameters()); });

        var del = new ODataDelegate(host, makeV4Context({ FirstName: "Alice" }, {}, { rejectWrite: true }));
        del.handleFieldChange("/FirstName", "Bob");

        Promise.resolve().then(function () {
            return Promise.resolve();
        }).then(function () {
            var first = errors.length === 1 ? String(errors[0].message) : "";
            assert.strictEqual(errors.length, 1, "The host fires exactly one error event when the service rejects the PATCH");
            assert.ok(/FirstName/.test(first), "The message names the property that failed, so the user is not told 'something went wrong'");
            assert.ok(/409 Conflict/.test(first), "The service's own reason is carried through rather than replaced with a generic one");
            del.destroy();
            host.destroy();
            done();
        });
    });

    QUnit.test("OData V4: a property the model has not requested yet still patches", function (assert) {
        var patched = {};
        var host = new DynamicHost();
        var ctx = makeV4Context({ FirstName: "Alice" }, patched, { unrequested: ["Department"] });
        var del = new ODataDelegate(host, ctx);

        del.handleFieldChange("/Department", "Engineering");
        assert.strictEqual(
            patched["Department"],
            "Engineering",
            "A throw from getProperty means 'not loaded', which is not a reason to skip the write"
        );
        del.destroy();
        host.destroy();
    });

    QUnit.module("Resilience: a field that failed to generate fails closed");

    QUnit.test("ValidationLedger records generation failures outside the data-driven entries", function (assert) {
        var ledger = new ValidationLedger(
            false,
            function () { return undefined; },
            function () { return []; },
            function () { return undefined; }
        );

        assert.strictEqual(ledger.hasActiveErrors(), false, "A ledger with nothing recorded reports no active errors");

        ledger.reportFieldGenerationFailure("/Street", "Field '/Street' failed to render, so its value could not be validated.");

        assert.strictEqual(
            ledger.hasActiveErrors(),
            true,
            "A recorded generation failure makes hasActiveErrors() true even though no plugin and no entry exist"
        );

        var results = ledger.validateAll(false);
        assert.strictEqual(results.length, 1, "validateAll() reports exactly one error for the one failed field");
        assert.strictEqual(results[0].fieldKey, "Street", "The reported fieldKey is the normalized binding path");
        assert.strictEqual(results[0].isValid, false, "The reported result is invalid");
        assert.ok(/failed to render/.test(results[0].errorMessage), "The message says the field failed to render");

        assert.strictEqual(
            ledger.hasActiveErrorsForPaths(["/Street"]),
            true,
            "A wizard step containing the failed field reports an active error, so it cannot be navigated past"
        );
        assert.strictEqual(
            ledger.hasActiveErrorsForPaths(["/Elsewhere"]),
            false,
            "A step that does not contain the failed field is unaffected"
        );

        // The regression that matters: clear() is the data-driven reset (hot-swap, form clear, policy reset).
        // It must not forget that a field is structurally unrenderable, because the data changing does not
        // repair a plugin module that would not load.
        ledger.clear(true);
        assert.strictEqual(
            ledger.hasActiveErrors(),
            true,
            "clear() purges data-driven entries but keeps the generation failure, which no data change can fix"
        );

        ledger.clearFieldGenerationFailures();
        assert.strictEqual(
            ledger.hasActiveErrors(),
            false,
            "clearFieldGenerationFailures() is the only thing that discards it, and the Engine calls it on rebuild"
        );

        // A render() that throws AFTER initialize() leaves a tracked plugin that BasePlugin.validate()
        // already fails closed on, and the Engine records a generation failure for the same path. The two
        // must converge on one error, not report the field twice.
        var failing = {
            isVisible: function () { return true; },
            getFieldLabel: function () { return "Street"; },
            validate: function () { return { isValid: false, errorMessage: "Field '/Street' failed to render." }; },
            setVisualValidationState: function () {}
        };
        var both = new ValidationLedger(
            false,
            function (p) { return p === "Street" ? failing : undefined; },
            function () { return [{ path: "/Street", plugin: failing }]; },
            function () { return undefined; }
        );
        both.reportFieldGenerationFailure("/Street", "Field '/Street' failed to render, so its value could not be validated.");
        var merged = both.validateAll(false).filter(function (e) { return e.fieldKey === "Street"; });
        assert.strictEqual(
            merged.length,
            1,
            "A path reported by both the plugin tier and the generation record yields one error, not a duplicate"
        );
    });

    QUnit.test("Engine fails closed when a plugin module cannot be resolved", function (assert) {
        var registry = new PluginRegistry();
        registry.registerPluginPath("string", "unresolvableWidget", "custom/test/NoSuchGenerationModule");
        var engine = new Engine(true, false, registry);

        // The failure is deliberate, so its Logger.error output is captured and asserted rather than
        // allowed to reach the console, where the harness counts it as an unexpected suite failure.
        var diagnostics = [];
        var origError = Logger.error;
        Logger.error = function (msg, detail) { diagnostics.push(String(msg) + " " + String(detail || "")); };
        var placeholder;
        try {
            placeholder = engine.generateField(
                { type: "string", ui: { widget: "unresolvableWidget" } },
                "/Street",
                "meta"
            );
        } finally {
            Logger.error = origError;
        }

        assert.strictEqual(
            diagnostics.some(function (d) { return d.indexOf("Failed to generate field at /Street") !== -1; }),
            true,
            "The unresolvable module is reported at error level, naming the field it cost"
        );
        assert.strictEqual(
            placeholder.getText(),
            "[Error generating field /Street]",
            "The field still degrades to its own inline placeholder rather than taking down the layout"
        );
        assert.strictEqual(engine.hasPartialRenderingErrors, true, "The form-level warning strip is still raised");

        var sibling = engine.generateField({ type: "string" }, "/Fine", "meta");
        assert.notStrictEqual(
            sibling.getText && sibling.getText(),
            "[Error generating field /Fine]",
            "Per-field degradation survives: a sibling field whose plugin resolves still renders normally"
        );

        assert.strictEqual(
            engine.hasActiveErrors(),
            true,
            "The unrenderable field makes the form invalid; it used to report valid and submit with the field unchecked"
        );
        var errors = engine.validateAll(true);
        assert.strictEqual(errors.length, 1, "Exactly the failed field is reported, not the sibling that rendered");
        assert.strictEqual(errors[0].fieldKey, "Street", "The error is attributed to the field that failed to generate");

        engine.destroy();
        registry = null;
    });

    QUnit.test("Engine fails closed when render() throws before initialize()", function (assert) {
        var done = assert.async();

        sap.ui.define("custom/test/ThrowingGenerationPlugin", [], function () {
            function ThrowingGenerationPlugin() {}
            var noop = function () {};
            ThrowingGenerationPlugin.prototype.setEditable = noop;
            ThrowingGenerationPlugin.prototype.setEngineContext = noop;
            ThrowingGenerationPlugin.prototype.setUseMessageManager = noop;
            ThrowingGenerationPlugin.prototype.setVisualValidationState = noop;
            ThrowingGenerationPlugin.prototype.setAssociatedLabel = noop;
            ThrowingGenerationPlugin.prototype.applyError = noop;
            ThrowingGenerationPlugin.prototype.clearError = noop;
            ThrowingGenerationPlugin.prototype.applyVisibility = noop;
            ThrowingGenerationPlugin.prototype.applyRequired = noop;
            ThrowingGenerationPlugin.prototype.applyEditable = noop;
            ThrowingGenerationPlugin.prototype.onStateChange = noop;
            ThrowingGenerationPlugin.prototype.setState = noop;
            ThrowingGenerationPlugin.prototype.destroy = noop;
            ThrowingGenerationPlugin.prototype.getControlId = function () { return undefined; };
            ThrowingGenerationPlugin.prototype.isVisible = function () { return true; };
            ThrowingGenerationPlugin.prototype.getFieldLabel = function () { return "Boom"; };
            // Mirrors the real shape of a render() that throws before initialize(): the plugin IS tracked,
            // but it has no metadata, so BasePlugin.validate() returns valid and nothing else can catch it.
            ThrowingGenerationPlugin.prototype.validate = function () { return { isValid: true }; };
            ThrowingGenerationPlugin.prototype.render = function () {
                throw new Error("deliberate render failure before initialize()");
            };
            return ThrowingGenerationPlugin;
        });

        var registry = new PluginRegistry();
        registry.registerPluginPath("string", "throwingGenerationWidget", "custom/test/ThrowingGenerationPlugin");
        var schema = SchemaNormalizer.normalize({
            type: "object",
            required: ["Boom"],
            properties: { Boom: { type: "string", ui: { widget: "throwingGenerationWidget" } } }
        });

        registry.preloadDependencies(schema).then(function () {
            var engine = new Engine(true, false, registry);
            var origError = Logger.error;
            try {
            // Deliberate failure: capture its error output instead of letting the harness count it.
            Logger.error = function () {};
            var placeholder = engine.generateField(
                { type: "string", ui: { widget: "throwingGenerationWidget" } },
                "/Boom",
                "meta"
            );
            Logger.error = origError;

            assert.strictEqual(
                placeholder.getText(),
                "[Error generating field /Boom]",
                "A throwing render() still degrades to the inline placeholder"
            );
            assert.strictEqual(
                engine.getActivePlugins().length,
                1,
                "The plugin is tracked, because generateField registers it before calling render()"
            );
            assert.strictEqual(
                engine.getActivePlugins()[0].plugin.validate().isValid,
                true,
                "That tracked plugin reports itself valid, which is why iterating plugins cannot catch this case"
            );
            assert.strictEqual(
                engine.hasActiveErrors(),
                true,
                "The generation failure is recorded independently, so the form is invalid anyway"
            );
            assert.strictEqual(
                engine.validateAll(true).some(function (e) { return e.fieldKey === "Boom"; }),
                true,
                "validateAll() names the required field that never rendered"
            );

            // A rebuild re-runs generation, so the previous build's failures must not outlive it.
            var model = new SandboxJSONModel({ F1: "v1" });
            var cleanSchema = SchemaNormalizer.normalize({ type: "object", properties: { F1: { type: "string" } } });
            var root = engine.build(cleanSchema, model, "meta");
            assert.strictEqual(
                engine.getFieldGenerationFailures().size,
                0,
                "build() clears the previous build's generation failures before regenerating"
            );
            assert.strictEqual(engine.hasActiveErrors(), false, "A clean rebuild reports the form valid again");

            root.destroy();
            } finally {
                Logger.error = origError;
                engine.destroy();
                done();
            }
        }, function (err) {
            assert.ok(false, "preloadDependencies rejected: " + (err && err.message));
            done();
        });
    });

    QUnit.test("Registry reports an overwritten key at error level, not warning", function (assert) {
        var logged = [];
        var origError = Logger.error;
        var origWarn = Logger.warn;
        Logger.error = function (message) { logged.push({ level: "error", message: message }); };
        Logger.warn = function (message) { logged.push({ level: "warn", message: message }); };

        try {
            var probe = new Registry("ProbeIndex");
            probe.register("boolean", "first");
            assert.strictEqual(logged.length, 0, "Registering a free key says nothing");
            probe.register("boolean", "second");
            assert.strictEqual(probe.get("boolean"), "second", "The replacement is honoured; overwriting stays legal");
        } finally {
            Logger.error = origError;
            Logger.warn = origWarn;
        }

        assert.strictEqual(logged.length, 1, "Overwriting an occupied key produces exactly one diagnostic");
        assert.strictEqual(
            logged[0].level,
            "error",
            "It is logged at error level: Logger.warn maps to Log.warning, which UI5 discards at its default " +
                "ERROR level, so replacing a built-in for a whole application produced no observable output at all"
        );
        assert.ok(
            /ProbeIndex: Overwriting existing key 'boolean'/.test(logged[0].message),
            "The diagnostic names the registry and the key that was replaced"
        );
    });

    QUnit.test("Stage 1: PayloadValidator and LayoutElementWalker cut cycles at their first repetition while preserving diamonds", function (assert) {
        var done = assert.async();
        sap.ui.require(["nz/co/siliconst/ui5/metaui/layouts/LayoutElementWalker"], function (WalkerMod) {
            var LayoutElementWalker = WalkerMod.LayoutElementWalker;
            var warnings = [];
            var origWarn = Logger.warn;
            Logger.warn = function (msg, details) {
                warnings.push((msg || "") + " " + (details || ""));
            };
            try {
                var cyclicNode = { type: "object", properties: { name: { type: "string", maxLength: 3 } } };
                cyclicNode.properties.self = cyclicNode;
                var cyclicValue = { name: "ok" };
                cyclicValue.self = cyclicValue;

                var objCycleRes = PayloadValidator.validateTree(cyclicNode, cyclicValue);
                assert.strictEqual(objCycleRes.isValid, true, "PayloadValidator terminates on an in-memory object cycle");
                assert.strictEqual(
                    warnings.some(function (w) { return w.indexOf("Circular") !== -1; }),
                    true,
                    "PayloadValidator logs a cycle warning on an in-memory object cycle"
                );
                assert.strictEqual(
                    warnings.some(function (w) { return w.indexOf("MAX_SCHEMA_DEPTH") !== -1; }),
                    false,
                    "PayloadValidator cuts the object cycle before reaching MAX_SCHEMA_DEPTH"
                );

                warnings.length = 0;
                var defs = {
                    A: { type: "object", properties: { b: { type: "object", $ref: "#/$defs/B" } } },
                    B: { type: "object", properties: { a: { type: "object", $ref: "#/$defs/A" } } },
                    Addr: { type: "object", properties: { zip: { type: "string", maxLength: 3 } } }
                };
                var resolveCount = 0;
                var resolve = function (ref) {
                    resolveCount++;
                    return defs[ref.split("/").pop()] || null;
                };
                var refCyclePayload = {};
                refCyclePayload.b = { a: refCyclePayload };
                var refCycleRes = PayloadValidator.validateTree({ type: "object", $ref: "#/$defs/A" }, refCyclePayload, resolve);
                assert.strictEqual(refCycleRes.isValid, true, "PayloadValidator terminates on a $ref cycle");
                assert.strictEqual(resolveCount <= 3, true, "PayloadValidator cuts the $ref cycle at its first repetition");
                assert.strictEqual(
                    warnings.some(function (w) { return w.indexOf("Circular") !== -1; }),
                    true,
                    "PayloadValidator logs a cycle warning on a $ref cycle"
                );

                warnings.length = 0;
                var diamondRes = PayloadValidator.validateTree(
                    {
                        type: "object",
                        properties: {
                            billing: { type: "object", $ref: "#/$defs/Addr" },
                            shipping: { type: "object", $ref: "#/$defs/Addr" }
                        }
                    },
                    { billing: { zip: "123" }, shipping: { zip: "TOOLONG" } },
                    resolve
                );
                assert.strictEqual(diamondRes.isValid, false, "PayloadValidator validates both sibling branches of a diamond $ref");

                warnings.length = 0;
                var groupA = { type: "Group", label: "A", elements: [{ type: "Control", scope: "#/properties/name" }] };
                var groupB = { type: "Group", label: "B", elements: [groupA] };
                groupA.elements.push(groupB);
                var count = LayoutElementWalker.walk(
                    [groupA],
                    { type: "object", properties: { name: { type: "string" } } },
                    { hasPartialRenderingErrors: false },
                    { onScalarField: function () { return undefined; } },
                    "FormLayout"
                );
                assert.strictEqual(count, 1, "LayoutElementWalker cuts a layout element cycle at its first repetition");
                assert.strictEqual(
                    warnings.some(function (w) { return w.indexOf("Circular") !== -1; }),
                    true,
                    "LayoutElementWalker logs a cycle warning on a layout cycle"
                );
            } finally {
                Logger.warn = origWarn;
                done();
            }
        });
    });

    QUnit.test("Stage 2: SchemaWalker walks properties, items, diamonds, $refs, hidden nodes, and cuts cycles and deep chains", function (assert) {
        var done = assert.async();
        sap.ui.require(["nz/co/siliconst/ui5/metaui/core/SchemaWalker"], function (SchemaWalkerMod) {
            var SchemaWalker = SchemaWalkerMod.SchemaWalker;
            var warnings = [];
            var origWarn = Logger.warn;
            Logger.warn = function (msg, details) {
                warnings.push((msg || "") + " " + (details || ""));
            };
            try {
                var visited = [];
                var truncations = [];
                var schema = {
                    type: "object",
                    definitions: {
                        Shared: {
                            type: "object",
                            properties: {
                                Leaf: { type: "string" },
                                HiddenLeaf: { type: "string", ui: { visible: false } },
                                Loop: { $ref: "#/definitions/Shared" }
                            }
                        }
                    },
                    properties: {
                        First: { $ref: "#/definitions/Shared" },
                        Second: { $ref: "#/definitions/Shared" },
                        Lines: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: { Sku: { type: "string" } }
                            }
                        }
                    }
                };
                SchemaWalker.walk(
                    schema,
                    function (ctx) {
                        visited.push(ctx.scope + "::" + ctx.bindingPath + "::" + String(ctx.isArrayItem));
                    },
                    {
                        skipHidden: true,
                        onTruncate: function (scope, reason) {
                            truncations.push(scope + ":" + reason);
                        }
                    }
                );
                assert.deepEqual(
                    visited,
                    [
                        "#/properties/First::First::false",
                        "#/properties/First/properties/Leaf::First/Leaf::false",
                        "#/properties/Second::Second::false",
                        "#/properties/Second/properties/Leaf::Second/Leaf::false",
                        "#/properties/Lines::Lines::false",
                        "#/properties/Lines/items::Lines/items::true",
                        "#/properties/Lines/items/properties/Sku::Lines/items/Sku::false"
                    ],
                    "SchemaWalker visits diamond branches, array items, and skips hidden nodes in pre-order"
                );
                assert.deepEqual(
                    truncations,
                    [
                        "#/properties/First/properties/Loop:cycle",
                        "#/properties/Second/properties/Loop:cycle"
                    ],
                    "SchemaWalker cuts cycle on each branch while preserving diamond sibling"
                );
                assert.strictEqual(
                    warnings.some(function (w) { return w.indexOf("Circular") !== -1; }),
                    true,
                    "SchemaWalker logs cycle truncation warnings"
                );
            } finally {
                Logger.warn = origWarn;
                done();
            }
        });
    });

    QUnit.test("ValidationDelegate.normalizeFieldPath and event fieldPath contract emit leading-slash JSON Pointer or empty string", function (assert) {
        var done = assert.async();
        sap.ui.require([
            "nz/co/siliconst/ui5/metaui/controls/host/delegates/ValidationDelegate",
            "nz/co/siliconst/ui5/metaui/controls/host/delegates/DialogDelegate"
        ], function (ValidationDelegateMod, DialogDelegateMod) {
            var ValidationDelegate = ValidationDelegateMod.ValidationDelegate;
            var DialogDelegate = DialogDelegateMod.DialogDelegate;
            assert.strictEqual(ValidationDelegate.normalizeFieldPath(undefined), "", "Undefined fieldKey normalizes to empty string");
            assert.strictEqual(ValidationDelegate.normalizeFieldPath(""), "", "Empty fieldKey normalizes to empty string");
            assert.strictEqual(ValidationDelegate.normalizeFieldPath("/"), "", "Bare slash normalizes to empty string");
            assert.strictEqual(ValidationDelegate.normalizeFieldPath("Email"), "/Email", "Bare field key receives leading slash");
            assert.strictEqual(ValidationDelegate.normalizeFieldPath("/Email"), "/Email", "Leading-slash field key is idempotent");
            assert.strictEqual(ValidationDelegate.normalizeFieldPath("Address/City"), "/Address/City", "Nested path receives leading slash");
            assert.strictEqual(ValidationDelegate.normalizeFieldPath("//Address/City"), "/Address/City", "Redundant leading slashes collapse to one");

            // 1. ValidationDelegate (field-level and whole-form validationError / validationSuccess)
            var fired = [];
            var mockHost = {
                getStateManager: function () { return undefined; },
                getValidationLedger: function () { return { isFormValid: function () { return false; } }; },
                getEngine: function () { return undefined; },
                getProperty: function (name) { return name === "isValid" ? false : false; },
                setProperty: function () {},
                fireEvent: function (name, params) { if (name !== "validationStateChanged") { fired.push({ name: name, params: params }); } }
            };
            var delegate = new ValidationDelegate(mockHost);
            delegate.notifyFieldValidation(false, "Email", "Invalid email");
            delegate.notifyFieldValidation(true, "Email", undefined);
            delegate.notifyFieldValidation(false, undefined, "Whole-form failure");
            assert.strictEqual(fired[0].params.fieldPath, "/Email", "validationError normalizes bare fieldKey to '/Email'");
            assert.strictEqual(fired[1].params.fieldPath, "/Email", "validationSuccess normalizes bare fieldKey to '/Email'");
            assert.strictEqual(fired[2].params.fieldPath, "", "whole-form validationError normalizes missing fieldKey to ''");

            // 2. GeneratorHost (fieldChange)
            var genHost = new GeneratorHost();
            var fieldChanges = [];
            genHost.attachEvent("fieldChange", function (e) { fieldChanges.push(e.getParameters()); });
            genHost.onInternalFieldChange(true, "Address/City", undefined);
            assert.strictEqual(fieldChanges[0].fieldPath, "/Address/City", "fieldChange emits leading-slash JSON Pointer '/Address/City'");
            genHost.destroy();

            // 3. DialogDelegate (catastrophic dialog-level validationError) & 4. ODataDelegate (error)
            var origError = Logger.error;
            Logger.error = function () {};
            var dialogEvents = [];
            var dialogHost = new GeneratorHost();
            dialogHost.generate = function () { return Promise.resolve(); };
            dialogHost.triggerSubmit = function () { throw new Error("submit pipeline exploded"); };
            dialogHost.attachEvent("validationError", function (e) { dialogEvents.push(e.getParameters()); });
            var dialogDel = new DialogDelegate(dialogHost);
            dialogDel.openInDialog("Test", "Save");

            var odataErrors = [];
            var odataHost = new DynamicHost();
            odataHost.attachEvent("error", function (e) { odataErrors.push(e.getParameters()); });
            var odataDel = new ODataDelegate(odataHost, makeV4Context({ FirstName: "Alice" }, {}, { rejectWrite: true }));
            odataDel.handleFieldChange("/FirstName", "Bob");

            Promise.resolve().then(function () {
                return Promise.resolve();
            }).then(function () {
                try {
                    var activeDialog = dialogDel.activeDialog;
                    activeDialog.getBeginButton().firePress();
                    assert.strictEqual(dialogEvents[0].fieldPath, "", "DialogDelegate catastrophic validationError emits empty-string fieldPath ''");
                    assert.strictEqual(odataErrors[0].fieldPath, "/FirstName", "ODataDelegate error event emits leading-slash JSON Pointer '/FirstName'");
                } finally {
                    Logger.error = origError;
                    dialogDel.destroy();
                    dialogHost.destroy();
                    odataDel.destroy();
                    odataHost.destroy();
                    done();
                }
            });
        });
    });
});
