sap.ui.define([
    "nz/co/siliconst/ui5/metaui/controls/DynamicHost",
    "nz/co/siliconst/ui5/metaui/controls/host/delegates/ODataDelegate",
    "nz/co/siliconst/ui5/metaui/swagger/OpenApiExtractor",
    "metaui/sandbox/util/ScenarioManager",
    "sap/ui/model/json/JSONModel",
    "sap/ui/core/Core",
    "sap/base/Log"
], function (DynamicHost, ODataDelegateMod, OpenApiExtractorMod, ScenarioManager, JSONModel, Core, Log) {
    "use strict";

    var ODataDelegate = ODataDelegateMod.ODataDelegate || ODataDelegateMod;
    var OpenApiExtractor = OpenApiExtractorMod.OpenApiExtractor || OpenApiExtractorMod;

    function createIntegrationSandbox(id) {
        var existing = document.getElementById(id);
        if (existing && existing.parentNode) {
            existing.parentNode.removeChild(existing);
        }
        var div = document.createElement("div");
        div.id = id;
        document.getElementById("qunit-fixture").appendChild(div);
        return div;
    }

    // "Host hardening" helpers. Several of the hardening tests deliberately drive code paths whose whole point
    // is to log loudly (a rejected OData write, a throwing policy). The headless runner treats unexpected
    // console.error output as a suite failure, so those expected errors are muted per UI5 log component for the
    // duration of the assertion window only, and restored immediately afterwards.
    function hhMuteLogComponent(component) {
        var previous = typeof Log.getLevel === "function" ? Log.getLevel(component) : Log.Level.ERROR;
        Log.setLevel(Log.Level.NONE, component);
        return previous;
    }

    function hhRestoreLogComponent(component, previousLevel) {
        Log.setLevel(previousLevel, component);
    }

    function hhWait(ms) {
        return new Promise(function (resolve) {
            setTimeout(resolve, ms);
        });
    }

    function hhReadEntityPath(root, path) {
        var parts = String(path).split("/");
        var current = root;
        for (var i = 0; i < parts.length; i++) {
            if (current === null || current === undefined) {
                return undefined;
            }
            current = current[parts[i]];
        }
        return current;
    }

    QUnit.module("E2E Matrix: DynamicHost Scenarios, Bindings, Render Targets & Mutations");

    QUnit.test("Kitchen Sink Scenario: Exhaustive property binding loop, validation gate, and custom error lifecycle", function (assert) {
        var done = assert.async();
        createIntegrationSandbox("e2e-kitchen-sink");

        ScenarioManager.getScenario("kitchen_sink").then(function (scenario) {
            // Override remote URLs to local mock endpoint so offline sandbox succeeds without external network
            var clonedSchema = JSON.parse(JSON.stringify(scenario.schema));
            ["RemoteDropVal", "LiveSearchVal", "RemoteValHelpVal"].forEach(function (k) {
                if (clonedSchema.properties[k] && clonedSchema.properties[k].valueHelp) {
                    clonedSchema.properties[k].valueHelp.url = "/mockData/scenarios/index.json";
                    clonedSchema.properties[k].valueHelp.keyPath = "category";
                    clonedSchema.properties[k].valueHelp.textPath = "category";
                }
            });

            var extractedPayload = null;
            var host = new DynamicHost({
                schemaDefinition: clonedSchema,
                data: JSON.parse(JSON.stringify(scenario.data)),
                editable: true,
                liveUpdate: true,
                useMessageManager: true,
                submit: function (oEvent) {
                    extractedPayload = oEvent.getParameter("payload");
                }
            });

            host.placeAt("e2e-kitchen-sink");
            Core.applyChanges();

            host.generate().then(function () {
                Core.applyChanges();

                var stateManager = host.getStateManager();
                assert.strictEqual(!!stateManager, true, "Kitchen Sink host initialized StateManager");

                var expectedData = scenario.data;
                var schemaKeys = Object.keys(clonedSchema.properties);
                assert.strictEqual(schemaKeys.length >= 37, true, "Kitchen Sink schema contains all 37+ properties");

                // Exhaustive loop verifying exact value bindings for every property in kitchen_sink.json
                schemaKeys.forEach(function (propKey) {
                    if (expectedData[propKey] !== undefined) {
                        assert.deepEqual(
                            stateManager.getProperty(propKey),
                            expectedData[propKey],
                            "Exact initial binding verified for Kitchen Sink property '" + propKey + "'"
                        );
                    }
                });

                var domMetadata = host.getDebugDomMetadata();
                assert.strictEqual(domMetadata.length >= 30, true, "Active plugins rendered and registered in Engine");

                // Valid submission succeeds
                var submitPassed = host.triggerSubmit();
                assert.strictEqual(submitPassed, true, "triggerSubmit() succeeds with valid Kitchen Sink dataset");
                assert.deepEqual(extractedPayload.Str, expectedData.Str, "Extracted payload matches bound state");

                // Dynamic mutation: violate required field & minimum number constraint
                stateManager.setProperty("RequiredString", "");
                stateManager.setProperty("Num", 5);
                var invalidSubmit = host.triggerSubmit();
                assert.strictEqual(invalidSubmit, false, "triggerSubmit() blocks submission when schema validation fails");

                // Restore valid values, test addCustomError / clearCustomError gate
                stateManager.setProperty("RequiredString", "Restored Mandatory String");
                stateManager.setProperty("Num", 500);
                host.addCustomError("Str", "Backend rejected Str");
                assert.strictEqual(host.triggerSubmit(), false, "Custom error blocks triggerSubmit()");

                host.clearCustomError("Str");
                assert.strictEqual(host.triggerSubmit(), true, "clearCustomError() unblocks triggerSubmit()");

                host.destroy();
                done();
            });
        });
    });

    QUnit.test("Tri-Binding & Transactional Sandbox Isolation (liveUpdate: false vs true, object vs string dataJson)", function (assert) {
        var done = assert.async();
        createIntegrationSandbox("e2e-bindings");

        ScenarioManager.getScenario("hybrid_inference").then(function (scenario) {
            var parentModel = new JSONModel({
                objData: JSON.parse(JSON.stringify(scenario.data)),
                strData: JSON.stringify(scenario.data),
                schema: JSON.parse(JSON.stringify(scenario.schema))
            });

            // 1. Transactional Mode (liveUpdate: false) with Object Binding
            var hostTransactional = new DynamicHost({
                liveUpdate: false,
                editable: true
            });
            hostTransactional.setModel(parentModel);
            hostTransactional.bindProperty("data", { path: "/objData" });
            hostTransactional.bindProperty("schemaDefinition", { path: "/schema" });
            hostTransactional.placeAt("e2e-bindings");
            Core.applyChanges();

            hostTransactional.generate().then(function () {
                var originalKeys = Object.keys(scenario.data);
                var firstStringKey = originalKeys.find(function (k) {
                    return typeof scenario.data[k] === "string";
                });
                var originalVal = scenario.data[firstStringKey];

                // Mutate internal state directly through Engine's StateManager + onInternalFieldChange
                hostTransactional.getStateManager().setProperty(firstStringKey, "UNVALIDATED_EDIT");
                hostTransactional._innerHost.onInternalFieldChange(true, firstStringKey);

                assert.strictEqual(
                    parentModel.getProperty("/objData/" + firstStringKey),
                    originalVal,
                    "Transactional sandbox (liveUpdate=false) shields parent model from unsubmitted edits"
                );
                assert.strictEqual(
                    hostTransactional.getProperty("outputData")[firstStringKey],
                    "UNVALIDATED_EDIT",
                    "On-demand getProperty('outputData') extracts latest sandbox payload without mutating parent model"
                );

                var submitted = hostTransactional.triggerSubmit();
                assert.strictEqual(submitted, true, "triggerSubmit() succeeds on transactional host");
                assert.strictEqual(
                    parentModel.getProperty("/objData/" + firstStringKey),
                    "UNVALIDATED_EDIT",
                    "triggerSubmit() pushes validated payload to parent object binding"
                );

                // 2. String Binding Mode (dataJson) with liveUpdate: true
                var hostString = new DynamicHost({
                    liveUpdate: true,
                    editable: true
                });
                hostString.setModel(parentModel);
                hostString.bindProperty("dataJson", { path: "/strData" });
                hostString.bindProperty("schemaDefinition", { path: "/schema" });
                hostString.placeAt("e2e-bindings");
                Core.applyChanges();

                return hostString.generate().then(function () {
                    hostString.getStateManager().setProperty(firstStringKey, "LIVE_STRING_SYNC");
                    hostString._innerHost.onInternalFieldChange(true, firstStringKey);

                    var parsedStrData = JSON.parse(parentModel.getProperty("/strData"));
                    assert.strictEqual(
                        parsedStrData[firstStringKey],
                        "LIVE_STRING_SYNC",
                        "liveUpdate=true continuously synchronizes outbound JSON string binding (dataJson)"
                    );

                    hostTransactional.destroy();
                    hostString.destroy();
                    parentModel.destroy();
                    done();
                });
            });
        });
    });

    QUnit.test("Policy-Based Rule Engine (pbre_scenario.json), Wizard Layout (wizard.json), Full Inference & Dialog Target", function (assert) {
        var done = assert.async();
        createIntegrationSandbox("e2e-layouts");

        Promise.all([
            ScenarioManager.getScenario("pbre_scenario"),
            ScenarioManager.getScenario("wizard"),
            ScenarioManager.getScenario("full_inference")
        ]).then(function (results) {
            var pbre = results[0];
            var wizard = results[1];
            var fullInf = results[2];

            var pbreHost = new DynamicHost({
                schemaDefinition: pbre.schema,
                data: JSON.parse(JSON.stringify(pbre.data)),
                editable: true,
                liveUpdate: true
            });
            pbreHost.placeAt("e2e-layouts");
            Core.applyChanges();

            return pbreHost.generate().then(function () {
                var sm = pbreHost.getStateManager();
                assert.strictEqual(sm.getProperty("VisitorInfo/Nationality"), "South African", "PBRE initial nationality bound");

                // Mutate Age below 18 to trigger NumericLessThan -> Invalidate policy
                sm.setProperty("VisitorInfo/Age", 15);
                assert.strictEqual(pbreHost.triggerSubmit(), false, "PBRE policy blocks submission when VisitorInfo/Age < 18");

                // Fix Age and required fields
                sm.setProperty("VisitorInfo/Age", 30);
                sm.setProperty("VisitorInfo/SADIDNumber", "9001015009087");
                assert.strictEqual(pbreHost.triggerSubmit(), true, "PBRE policy allows submission when VisitorInfo/Age >= 18 and SA ID provided");

                // Test hidden field validation gate: when ChildrenCount=2 and IncludeActivities='Yes', MorningWalk is visible & invalidated
                sm.setProperty("BookingDetails/Guests/ChildrenCount", 2);
                sm.setProperty("Activities/IncludeActivities", "Yes");
                assert.strictEqual(pbreHost.triggerSubmit(), false, "PBRE blocks submission when visible MorningWalk field is invalidated by ChildrenCount > 0");

                // Hide Activities section (IncludeActivities='No'): hidden MorningWalk must not block submission
                sm.setProperty("Activities/IncludeActivities", "No");
                assert.strictEqual(pbreHost.triggerSubmit(), true, "PBRE allows submission when invalidated MorningWalk field is hidden by Visibility policy");
                pbreHost.destroy();

                // Test Wizard Layout including step navigation and beforeLayoutSectionChange veto
                var vetoNextStep = true;
                var sectionChanges = [];
                var wizardHost = new DynamicHost({
                    schemaDefinition: wizard.schema,
                    data: JSON.parse(JSON.stringify(wizard.data)),
                    editable: true,
                    beforeLayoutSectionChange: function (oEvent) {
                        sectionChanges.push({
                            oldIdx: oEvent.getParameter("currentSectionIndex"),
                            newIdx: oEvent.getParameter("newSectionIndex")
                        });
                        if (vetoNextStep) {
                            oEvent.preventDefault();
                        }
                    }
                });
                wizardHost.placeAt("e2e-layouts");
                Core.applyChanges();

                return wizardHost.generate().then(function () {
                    Core.applyChanges();
                    var wizDom = wizardHost.getDomRef();
                    var wizRect = wizDom ? wizDom.getBoundingClientRect() : { width: 0, height: 0 };
                    assert.strictEqual(
                        wizRect.width > 0 && wizRect.height > 0,
                        true,
                        "Wizard layout rendered with non-zero DOM geometry (" + Math.round(wizRect.width) + "x" + Math.round(wizRect.height) + ")"
                    );

                    // Satisfy Step 0 required field so WizardLayout proceeds to beforeLayoutSectionChange
                    wizardHost.getStateManager().setProperty("PropertyAddress", "123 Queen St, Auckland");
                    Core.applyChanges();

                    // Find the Next Step and Previous buttons inside wizardHost
                    var wizardRootVBox = wizardHost._innerHost.getAggregation("_content");
                    var navBar = wizardRootVBox.getItems()[wizardRootVBox.getItems().length - 1];
                    var prevBtn = navBar.getItems()[0];
                    var nextBtn = navBar.getItems()[1];

                    // 1. Vetoed navigation
                    nextBtn.firePress();
                    Core.applyChanges();
                    assert.strictEqual(sectionChanges.length, 1, "beforeLayoutSectionChange fired on Next Step press");
                    assert.strictEqual(sectionChanges[0].oldIdx, 0, "beforeLayoutSectionChange passed currentSectionIndex=0");
                    assert.strictEqual(sectionChanges[0].newIdx, 1, "beforeLayoutSectionChange passed newSectionIndex=1");
                    assert.strictEqual(prevBtn.getEnabled(), false, "Vetoed navigation kept wizard on initial step (Previous disabled)");

                    // 2. Allowed navigation
                    vetoNextStep = false;
                    nextBtn.firePress();
                    Core.applyChanges();
                    assert.strictEqual(sectionChanges.length, 2, "beforeLayoutSectionChange fired again and advanced step");
                    assert.strictEqual(prevBtn.getEnabled(), true, "Allowed navigation advanced wizard to step 2 (Previous enabled)");

                    wizardHost.destroy();

                    // Test Full Inference inside Popup Dialog (openInDialog) with configurable submitButtonText
                    var dialogHost = new DynamicHost({
                        data: JSON.parse(JSON.stringify(fullInf.data)),
                        editable: true
                    });

                    var closePromise = dialogHost.openInDialog("E2E Inferred Dialog", "Extract E2E Payload");
                    return dialogHost.generate().then(function () {
                        return new Promise(function (resolveWait) {
                            setTimeout(resolveWait, 50);
                        });
                    }).then(function () {
                        Core.applyChanges();
                        var innerDialog = dialogHost._innerHost.dialogDelegate.activeDialog;
                        assert.strictEqual(!!innerDialog, true, "DialogDelegate created sap.m.Dialog instance");
                        assert.strictEqual(
                            innerDialog.getBeginButton().getText(),
                            "Extract E2E Payload",
                            "Configurable submitButtonText mounted on dialog beginButton"
                        );
                        innerDialog.close();
                        return closePromise;
                    }).then(function () {
                        assert.strictEqual(dialogHost.isDestroyed(), false, "Host survives dialog close without being destroyed");
                        dialogHost.destroy();
                        done();
                    });
                });
            });
        });
    });

    QUnit.test("Remaining Scenarios (deep_structure, ultra_complex_structure, control_props, openapi_v2/v3, odata_v4), ODataDelegate & Runtime Toggles", function (assert) {
        var done = assert.async();
        createIntegrationSandbox("e2e-remaining");

        var remainingKeys = [
            "deep_structure",
            "ultra_complex_structure",
            "control_props",
            "openapi_v2_complex",
            "openapi_v3_complex",
            "odata_v4"
        ];

        Promise.all(remainingKeys.map(function (key) {
            return ScenarioManager.getScenario(key);
        })).then(function (scenarios) {
            var chain = Promise.resolve();

            scenarios.forEach(function (scenario, idx) {
                var key = remainingKeys[idx];
                chain = chain.then(function () {
                    var host = new DynamicHost({
                        schemaDefinition: scenario.schema ? JSON.parse(JSON.stringify(scenario.schema)) : null,
                        data: scenario.data ? JSON.parse(JSON.stringify(scenario.data)) : {},
                        layoutBudget: 50,
                        editable: true,
                        debugMode: true
                    });
                    host.placeAt("e2e-remaining");
                    Core.applyChanges();

                    return host.generate().then(function () {
                        Core.applyChanges();
                        var sm = host.getStateManager();
                        var domEl = host.getDomRef();
                        var rect = domEl ? domEl.getBoundingClientRect() : { width: 0, height: 0 };
                        var dataKeys = scenario.data && typeof scenario.data === "object" ? Object.keys(scenario.data) : [];
                        var allDataBound = dataKeys.every(function (dk) {
                            return JSON.stringify(sm.getProperty("/" + dk)) === JSON.stringify(scenario.data[dk]);
                        });
                        assert.strictEqual(
                            Boolean(sm) && rect.width > 0 && rect.height > 0 && allDataBound,
                            true,
                            "Scenario '" + key + "' mounted with geometry (" + Math.round(rect.width) + "x" + Math.round(rect.height) + ") and bound all " + dataKeys.length + " root payload keys"
                        );

                        // If this is an OpenAPI scenario, exhaustively test every selectable schemaTarget
                        var targets = OpenApiExtractor.extractTargets(scenario.schema);
                        var targetChain = Promise.resolve();
                        targets.forEach(function (targetItem) {
                            targetChain = targetChain.then(function () {
                                host.setProperty("schemaTarget", targetItem.key);
                                return host.generate().then(function () {
                                    Core.applyChanges();
                                    var tDom = host.getDomRef();
                                    var tRect = tDom ? tDom.getBoundingClientRect() : { width: 0, height: 0 };
                                    var activePlugins = host._innerHost.engine.getActivePlugins();
                                    assert.strictEqual(
                                        tRect.width > 0 && tRect.height > 0 && activePlugins.length > 0,
                                        true,
                                        "Scenario '" + key + "' target '" + targetItem.key + "' rendered " + activePlugins.length + " active plugins with non-zero geometry"
                                    );
                                });
                            });
                        });

                        return targetChain.then(function () {
                            // Toggle runtime properties (editable, useMessageManager, debugMode)
                            host.setProperty("editable", false);
                            host.setProperty("useMessageManager", true);
                            host.setProperty("debugMode", false);
                            return host.generate().then(function () {
                                assert.strictEqual(host.getProperty("editable"), false, "Scenario '" + key + "' toggled editable=false");
                                host.destroy();
                            });
                        });
                    });
                });
            });

            // Test ODataDelegate context binding & context replacement
            chain = chain.then(function () {
                var odataWrites = {};
                var mockODataModel = new JSONModel({});
                var mockCtx1 = {
                    getModel: function () { return mockODataModel; },
                    getPath: function () { return "/Orders('100')"; },
                    requestObject: function () {
                        return Promise.resolve({
                            "@odata.context": "$metadata#Orders/$entity",
                            OrderId: "100",
                            Customer: "Acme Corp",
                            Details: { "__metadata": { type: "OrderDetails" }, Priority: "High" }
                        });
                    },
                    setProperty: function (relPath, val) {
                        odataWrites["ctx1:" + relPath] = val;
                    }
                };
                var mockCtx2 = {
                    getModel: function () { return mockODataModel; },
                    getPath: function () { return "/Orders('200')"; },
                    requestObject: function () {
                        return Promise.resolve({ OrderId: "200", Customer: "Beta Ltd" });
                    },
                    setProperty: function (relPath, val) {
                        odataWrites["ctx2:" + relPath] = val;
                    }
                };

                var odataHost = new DynamicHost({
                    schemaDefinition: {
                        type: "object",
                        properties: {
                            OrderId: { type: "string" },
                            Customer: { type: "string" }
                        }
                    },
                    editable: true
                });
                odataHost.placeAt("e2e-remaining");
                odataHost.setBindingContext(mockCtx1, "odata");
                Core.applyChanges();

                return new Promise(function (r) { setTimeout(r, 30); }).then(function () {
                    return odataHost.generate();
                }).then(function () {
                    assert.strictEqual(odataHost.getStateManager().getProperty("Customer"), "Acme Corp", "ODataDelegate synced context 1 into engine");
                    assert.strictEqual(
                        odataHost.getStateManager().getProperty("Details/__metadata"),
                        undefined,
                        "ODataDelegate recursively strips nested __metadata and @odata annotations"
                    );
                    assert.strictEqual(
                        odataHost.getStateManager().getProperty("Details/Priority"),
                        "High",
                        "ODataDelegate preserves nested business properties"
                    );

                    // Replace OData context
                    odataHost.setBindingContext(mockCtx2, "odata");
                    return new Promise(function (r) { setTimeout(r, 30); });
                }).then(function () {
                    assert.strictEqual(odataHost.getStateManager().getProperty("Customer"), "Beta Ltd", "ODataDelegate replaced on context change and synced context 2");

                    // Verify transactional OData shielding + on-demand triggerSubmit() flush
                    odataHost.getStateManager().setProperty("Customer", "Gamma Corp");
                    odataHost._innerHost.onInternalFieldChange(true, "Customer");
                    assert.strictEqual(odataWrites["ctx2:Customer"], undefined, "ODataDelegate shields context when liveUpdate=false");
                    assert.strictEqual(odataHost.triggerSubmit(), true, "ODataDelegate triggerSubmit() succeeds");
                    assert.strictEqual(odataWrites["ctx2:Customer"], "Gamma Corp", "ODataDelegate flushes committed payload to OData context on triggerSubmit()");

                    // Verify liveUpdate=true continuous OData two-way sync
                    odataHost.setProperty("liveUpdate", true);
                    odataHost.getStateManager().setProperty("Customer", "Delta Live Corp");
                    odataHost._innerHost.onInternalFieldChange(true, "Customer");
                    assert.strictEqual(odataWrites["ctx2:Customer"], "Delta Live Corp", "ODataDelegate patches OData context continuously when liveUpdate=true");

                    odataHost.destroy();
                    mockODataModel.destroy();

                    // Test CompactLayout + HorizontalLayout + Inline TableLayout + Input Immutability
                    var callerSchema = {
                        type: "object",
                        layoutStrategy: "compact",
                        properties: {
                            FirstName: { type: "string", ui: { label: "First Name" } },
                            LastName: { type: "string", ui: { label: "Last Name" } },
                            Items: {
                                type: "array",
                                items: {
                                    type: "object",
                                    properties: {
                                        Code: { type: "string", ui: { label: "Code" } }
                                    }
                                }
                            }
                        },
                        uiLayout: [
                            {
                                type: "Group",
                                label: "Compact Group",
                                elements: [
                                    {
                                        type: "HorizontalLayout",
                                        elements: [
                                            { type: "Control", scope: "#/properties/FirstName" },
                                            { type: "Control", scope: "#/properties/LastName" }
                                        ]
                                    },
                                    { type: "Control", scope: "#/properties/Items" }
                                ]
                            }
                        ]
                    };
                    var callerSchemaSnapshot = JSON.stringify(callerSchema);
                    var callerData = { FirstName: "Ada", LastName: "Lovelace", Items: [{ Code: "A1" }] };
                    var callerDataSnapshot = JSON.stringify(callerData);

                    var compactHost = new DynamicHost({
                        schemaDefinition: callerSchema,
                        data: callerData,
                        editable: true,
                        liveUpdate: false
                    });
                    compactHost.placeAt("e2e-remaining");
                    Core.applyChanges();

                    return compactHost.generate().then(function () {
                        Core.applyChanges();
                        var cDom = compactHost.getDomRef();
                        var cRect = cDom ? cDom.getBoundingClientRect() : { width: 0, height: 0 };
                        var fnCtrl = compactHost._innerHost.engine.getPluginByPath("FirstName").control;
                        var lnCtrl = compactHost._innerHost.engine.getPluginByPath("LastName").control;
                        assert.strictEqual(
                            cRect.width > 0 && cRect.height > 0 && fnCtrl.getValue() === "Ada" && lnCtrl.getValue() === "Lovelace",
                            true,
                            "CompactLayout with Group, HorizontalLayout, and inline TableLayout mounted with geometry and bound control values"
                        );
                        compactHost.getStateManager().setProperty("FirstName", "Grace");
                        assert.strictEqual(JSON.stringify(callerSchema), callerSchemaSnapshot, "Caller schema object was not mutated in-place");
                        assert.strictEqual(JSON.stringify(callerData), callerDataSnapshot, "Caller data object was not mutated in-place during transactional editing");
                        compactHost.destroy();
                        done();
                    });
                });
            });

            return chain;
        });
    });

    QUnit.test("Host Events (beforeSubmit, validationError, validationSuccess, validationStateChanged, cancel), Inline Table minItems Gate & Lifecycle Stress Test", function (assert) {
        var done = assert.async();
        createIntegrationSandbox("e2e-lifecycle");

        var vetoBeforeSubmit = true;
        var firedEvents = {
            beforeSubmit: 0,
            validationError: 0,
            validationSuccess: 0,
            validationStateChanged: 0,
            cancel: 0
        };

        var eventHost = new DynamicHost({
            engineScopeId: "stressScope",
            layoutBudget: 50,
            schemaDefinition: {
                type: "object",
                required: ["Code"],
                properties: {
                    Code: { type: "string", minLength: 3, ui: { label: "Order Code" } },
                    Lines: {
                        type: "array",
                        minItems: 1,
                        items: {
                            type: "object",
                            properties: {
                                Sku: { type: "string", required: true }
                            }
                        }
                    }
                }
            },
            data: { Code: "ORD-100", Lines: [{ Sku: "SKU-1" }] },
            editable: true,
            beforeSubmit: function (oEvent) {
                firedEvents.beforeSubmit++;
                if (vetoBeforeSubmit) {
                    oEvent.getParameter("addError")("Code", "Vetoed by beforeSubmit hook");
                }
            },
            validationError: function () {
                firedEvents.validationError++;
            },
            validationSuccess: function () {
                firedEvents.validationSuccess++;
            },
            validationStateChanged: function () {
                firedEvents.validationStateChanged++;
            },
            cancel: function () {
                firedEvents.cancel++;
            }
        });
        eventHost.placeAt("e2e-lifecycle");
        Core.applyChanges();

        eventHost.generate().then(function () {
            // 1. beforeSubmit addError veto (13.2.1: per-attempt scoping vs permanent addCustomError)
            assert.strictEqual(eventHost.triggerSubmit(), false, "beforeSubmit addError() vetoes submission");
            assert.strictEqual(firedEvents.beforeSubmit, 1, "beforeSubmit event fired");

            vetoBeforeSubmit = false;
            assert.strictEqual(
                eventHost.triggerSubmit(),
                true,
                "Event-scoped addError() from beforeSubmit clears on next attempt without permanently bricking triggerSubmit()"
            );

            // Consumer-called addCustomError remains persistent until clearCustomError is called
            eventHost.addCustomError("Code", "Persistent consumer custom error");
            assert.strictEqual(
                eventHost.triggerSubmit(),
                false,
                "Consumer addCustomError() persists across triggerSubmit() attempts"
            );
            eventHost.clearCustomError("Code");
            assert.strictEqual(eventHost.triggerSubmit(), true, "Clearing custom error and allowing beforeSubmit succeeds");

            // 2. Inline TableLayout array-level minItems: 1 enforcement via ValidationLedger
            eventHost.getStateManager().setProperty("Lines", []);
            assert.strictEqual(eventHost.triggerSubmit(), false, "ValidationLedger enforces minItems: 1 on inline TableLayout array");
            eventHost.getStateManager().setProperty("Lines", [{ Sku: "SKU-1" }]);
            assert.strictEqual(eventHost.triggerSubmit(), true, "Restoring inline TableLayout row satisfies minItems: 1");

            // 3. Field validation error & recovery events
            eventHost._innerHost.onInternalFieldChange(false, "Code", "Too short");
            assert.strictEqual(firedEvents.validationError >= 1, true, "validationError event fired on invalid field change");
            assert.strictEqual(firedEvents.validationStateChanged >= 1, true, "validationStateChanged event fired");
            eventHost._innerHost.onInternalFieldChange(true, "Code");
            assert.strictEqual(firedEvents.validationSuccess >= 1, true, "validationSuccess event fired on valid field change");

            // 4. Rapid re-generation & destruction stress test with fixed engineScopeId (zero duplicate ID errors)
            return eventHost.generate();
        }).then(function () {
            return eventHost.generate();
        }).then(function () {
            assert.strictEqual(eventHost.isDestroyed(), false, "Repeated generate() with fixed engineScopeId succeeds without duplicate UI5 ID collisions");
            eventHost.destroy();

            // 5. Recreate a new host with the exact same engineScopeId after destroy() to prove deterministic cleanup
            var recreatedHost = new DynamicHost({
                engineScopeId: "stressScope",
                schemaDefinition: {
                    type: "object",
                    properties: { Code: { type: "string" } }
                },
                data: { Code: "RECREATED" }
            });
            recreatedHost.placeAt("e2e-lifecycle");
            Core.applyChanges();
            return recreatedHost.generate().then(function () {
                assert.strictEqual(
                    recreatedHost.getStateManager().getProperty("Code"),
                    "RECREATED",
                    "Recreating DynamicHost with identical engineScopeId after destroy() succeeds cleanly"
                );
                recreatedHost.destroy();
                done();
            });
        });
    });

    QUnit.test("Holistic Framework Verification: Root Array Dialogs, Cloned Table Cell Live Validation, Picker Parse Gate, Zero Parent Invalidation & Single-Authority Messaging Cleanup", function (assert) {
        var done = assert.async();
        createIntegrationSandbox("e2e-holistic");

        // 1. Root Array Schema with wrapped { items: [...] } data (as used by ArrayPlugin modal dialogs)
        var arrayExtracted = null;
        var rootArrayHost = new DynamicHost({
            schemaDefinition: {
                type: "array",
                layoutStrategy: "table",
                minItems: 1,
                items: {
                    type: "object",
                    required: ["Sku", "Qty"],
                    properties: {
                        Sku: { type: "string", minLength: 3, ui: { label: "SKU" } },
                        Qty: { type: "integer", minimum: 1, ui: { label: "Quantity" } }
                    }
                }
            },
            data: { items: [{ Sku: "SKU-100", Qty: 2 }] },
            editable: true,
            liveUpdate: false,
            useMessageManager: true,
            submit: function (oEvent) {
                arrayExtracted = oEvent.getParameter("payload");
            }
        });
        rootArrayHost.placeAt("e2e-holistic");
        Core.applyChanges();

        rootArrayHost.generate().then(function () {
            Core.applyChanges();

            var table = rootArrayHost._innerHost.generatedContent;
            assert.strictEqual(table.getMetadata().getName(), "sap.m.Table", "Root array schema rendered sap.m.Table");
            assert.strictEqual(table.getItems().length, 1, "TableLayout bound wrapped /items array and rendered initial row");

            // Click Add Row button in table headerToolbar
            var toolbar = table.getHeaderToolbar();
            var addRowBtn = toolbar.getContent().find(function (c) {
                return c.getMetadata().getName() === "sap.m.Button";
            });
            addRowBtn.firePress();
            Core.applyChanges();

            assert.strictEqual(table.getItems().length, 2, "Add Row appended second row to /items without overwriting first row");
            assert.strictEqual(
                rootArrayHost.getStateManager().getProperty("items/0/Sku"),
                "SKU-100",
                "First row Sku preserved after Add Row"
            );

            // New row has Sku="" and Qty=0, which violates required/minLength and minimum: 1
            assert.strictEqual(
                rootArrayHost.triggerSubmit(),
                false,
                "ValidationLedger blocks triggerSubmit() when wrapped /items array row has invalid cells"
            );

            // Simulate user editing the cloned table row cells directly via UI5 change events
            var secondRowCells = table.getItems()[1].getCells();
            var skuCellInput = secondRowCells[0];
            var qtyCellInput = secondRowCells[1];

            skuCellInput.setValue("AB");
            skuCellInput.fireChange({ value: "AB" });
            assert.strictEqual(
                skuCellInput.getValueState(),
                "Error",
                "Cloned table cell StringPlugin validates live input ('AB' < minLength 3) and sets ValueState.Error"
            );

            skuCellInput.setValue("SKU-200");
            skuCellInput.fireChange({ value: "SKU-200" });
            assert.strictEqual(
                skuCellInput.getValueState(),
                "None",
                "Cloned table cell StringPlugin clears ValueState.Error when valid 'SKU-200' is entered"
            );
            assert.strictEqual(
                rootArrayHost.getStateManager().getProperty("items/1/Sku"),
                "SKU-200",
                "Cloned table cell StringPlugin synchronized live value to /items/1/Sku"
            );

            qtyCellInput.setValue("1.5");
            qtyCellInput.fireChange({ value: "1.5" });
            assert.strictEqual(
                qtyCellInput.getValueState(),
                "Error",
                "Cloned table cell NumberPlugin rejects non-integer '1.5' for integer column"
            );
            assert.strictEqual(
                rootArrayHost.triggerSubmit(),
                false,
                "ValidationLedger blocks triggerSubmit() while cloned table cell has unparseable integer input"
            );

            qtyCellInput.setValue("5");
            qtyCellInput.fireChange({ value: "5" });
            assert.strictEqual(
                qtyCellInput.getValueState(),
                "None",
                "Cloned table cell NumberPlugin clears error when valid integer '5' is entered"
            );

            assert.strictEqual(
                rootArrayHost.triggerSubmit(),
                true,
                "ValidationLedger allows triggerSubmit() after all cloned table cells in /items are valid"
            );
            assert.strictEqual(
                rootArrayHost.getStateManager().getOwnMessages().length,
                0,
                "Single-Authority Messaging cleanup leaves 0 stuck or summary messages after table errors are resolved"
            );
            assert.strictEqual(
                Array.isArray(arrayExtracted.items) && arrayExtracted.items.length === 2,
                true,
                "Submitted payload contains both rows in items array"
            );

            rootArrayHost.destroy();

            // 2. Dependent Dialog Host Invalidation Isolation Test
            var parentContainer = new sap.m.VBox();
            parentContainer.placeAt("e2e-holistic");
            Core.applyChanges();

            var parentInvalidateCount = 0;
            var origParentInvalidate = parentContainer.invalidate.bind(parentContainer);
            parentContainer.invalidate = function (oOrigin) {
                parentInvalidateCount++;
                origParentInvalidate(oOrigin);
            };

            var depDialogHost = new DynamicHost({
                schemaDefinition: {
                    type: "object",
                    required: ["Title"],
                    properties: {
                        Title: { type: "string", minLength: 3, ui: { label: "Title" } },
                        DueDate: { type: "date", ui: { label: "Due Date" } }
                    }
                },
                data: { Title: "Initial Title", DueDate: "2026-10-22" },
                editable: true,
                useMessageManager: true
            });
            parentContainer.addAggregation("dependents", depDialogHost, true);

            var dialogClosePromise = depDialogHost.openInDialog("Isolation Dialog", "Save", "Cancel", "auto", parentContainer);
            return depDialogHost.generate().then(function () {
                return new Promise(function (r) { setTimeout(r, 50); });
            }).then(function () {
                Core.applyChanges();
                assert.strictEqual(
                    parentInvalidateCount,
                    0,
                    "Opening DynamicHost in dialog via dependents caused 0 parent container invalidations"
                );

                // Test DatePicker unparseable input blocking dialog submit
                var datePlugin = depDialogHost._innerHost.engine.getPluginByPath("DueDate");
                var datePicker = datePlugin.control;
                datePicker.fireChange({ value: "invalid-date", valid: false });
                assert.strictEqual(
                    depDialogHost.triggerSubmit(),
                    false,
                    "Unparseable DatePicker input blocks dialog triggerSubmit()"
                );

                datePicker.fireChange({ value: "2026-11-01", valid: true });
                assert.strictEqual(
                    depDialogHost.triggerSubmit(),
                    true,
                    "Fixing DatePicker input unblocks dialog triggerSubmit()"
                );
                assert.strictEqual(
                    depDialogHost.getStateManager().getOwnMessages().length,
                    0,
                    "0 messages remain in Messaging after fixing DatePicker error"
                );

                var activeDialog = depDialogHost._innerHost.dialogDelegate.activeDialog;
                activeDialog.getBeginButton().firePress();
                return dialogClosePromise;
            }).then(function () {
                Core.applyChanges();
                assert.strictEqual(
                     buildCheck(parentInvalidateCount),
                    0,
                    "Closing DynamicHost dialog and restoring to dependents caused 0 parent container invalidations"
                );
                depDialogHost.destroy();
                parentContainer.destroy();

                // 3. Forensic Regression Verification: Hot-Swap Defaults/Policies, Custom modelName, isValid Proxy, & Table $row Policies
                var hotSwapHost = new DynamicHost({
                    modelName: "customMeta",
                    schemaDefinition: {
                        type: "object",
                        required: ["Code"],
                        properties: {
                            Code: { type: "string", minLength: 3, default: "DEF-100" },
                            Status: { type: "string", default: "OPEN" },
                            Lines: {
                                type: "array",
                                items: {
                                    type: "object",
                                    properties: {
                                        Qty: { type: "integer", minimum: 1 },
                                        Reason: { type: "string" }
                                    }
                                }
                            }
                        },
                        uiPolicies: [
                            {
                                effect: "Require",
                                targets: ["/Lines/$row/Reason"],
                                condition: { NumericGreaterThan: { "/Lines/$row/Qty": 10 } }
                            }
                        ]
                    },
                    data: { Code: "INIT-1", Lines: [{ Qty: 20, Reason: "" }] },
                    editable: true
                });
                hotSwapHost.placeAt("e2e-holistic");
                Core.applyChanges();

                return hotSwapHost.generate().then(function () {
                    Core.applyChanges();
                    assert.strictEqual(
                        hotSwapHost.getStateManager().getProperty("Status"),
                        "OPEN",
                        "Initial generation injected schema default 'OPEN' using custom modelName 'customMeta'"
                    );
                    assert.strictEqual(
                        hotSwapHost.triggerSubmit(),
                        false,
                        "Table $row Require policy blocks triggerSubmit() when Qty > 10 and Reason is empty"
                    );
                    assert.strictEqual(
                        hotSwapHost.getProperty("isValid"),
                        false,
                        "DynamicHost.getProperty('isValid') proxies false when validation fails"
                    );

                    // Hot-swap data at runtime: omit Status (should re-inject default 'OPEN') and set Qty=5 (should satisfy $row policy)
                    hotSwapHost.addCustomError("Code", "Stale error before hot-swap");
                    hotSwapHost.setProperty("data", { Code: "SWAPPED", Lines: [{ Qty: 5, Reason: "" }] });
                    Core.applyChanges();

                    assert.strictEqual(
                        hotSwapHost.getStateManager().getProperty("Status"),
                        "OPEN",
                        "Runtime data hot-swap re-injects schema default 'OPEN'"
                    );
                    assert.strictEqual(
                        hotSwapHost.triggerSubmit(),
                        true,
                        "Runtime data hot-swap clears stale errors and re-evaluates $row policy to allow triggerSubmit()"
                    );
                    assert.strictEqual(
                        hotSwapHost.getProperty("isValid"),
                        true,
                        "DynamicHost.getProperty('isValid') proxies true after valid submission"
                    );

                    hotSwapHost.destroy();

                    // Round 2 E2E Check: InferredGeneratorHost root-array hot-swap & transactional dialog Cancel rollback
                    var rootArrHost = new DynamicHost({
                        data: [{ Code: "A1" }],
                        liveUpdate: true,
                        editable: true
                    });
                    rootArrHost.placeAt("qunit-fixture");
                    Core.applyChanges();

                    rootArrHost.generate().then(function () {
                        Core.applyChanges();
                        rootArrHost.setProperty("data", [{ Code: "B2", ExtraCol: "NewVal" }]);
                        return rootArrHost.generate();
                    }).then(function () {
                        Core.applyChanges();
                        var extractedArr = rootArrHost.getProperty("outputData");
                        assert.strictEqual(
                            Array.isArray(extractedArr) && extractedArr[0].Code === "B2" && extractedArr[0].ExtraCol === "NewVal",
                            true,
                            "InferredGeneratorHost preserves root-array schema and extracts array payload after structural hot-swap"
                        );
                        rootArrHost.destroy();

                        // 13.2.1 (Wizard beforeLayoutSectionChange addError per-attempt scoping),
                        // 13.2.2 (unresolvable scope banner), and 13.2.4 (OData V4 setProperty rejection handling)
                        var vetoStep = true;
                        var wizardVetoHost = new DynamicHost({
                            schemaDefinition: {
                                type: "object",
                                layoutStrategy: "wizard",
                                properties: {
                                    Email: { type: "string", ui: { label: "Email" } },
                                    FinishNote: { type: "string", ui: { label: "Finish Note" } }
                                },
                                uiLayout: [
                                    {
                                        type: "WizardStep",
                                        label: "Step 1",
                                        elements: [
                                            { type: "Control", scope: "#/properties/Email" },
                                            { type: "Control", scope: "#/properties/MissingScopeField" }
                                        ]
                                    },
                                    {
                                        type: "WizardStep",
                                        label: "Step 2",
                                        elements: [{ type: "Control", scope: "#/properties/FinishNote" }]
                                    }
                                ]
                            },
                            data: { Email: "taken@example.com", FinishNote: "Done" },
                            editable: true,
                            beforeLayoutSectionChange: function (oEvt) {
                                if (vetoStep) {
                                    oEvt.getParameter("addError")("/Email", "Email already taken");
                                }
                            }
                        });
                        wizardVetoHost.placeAt("qunit-fixture");
                        Core.applyChanges();

                        return wizardVetoHost.generate().then(function () {
                            Core.applyChanges();
                            assert.strictEqual(
                                wizardVetoHost._innerHost.engine.hasPartialRenderingErrors,
                                true,
                                "Unresolvable uiLayout scope (#/properties/MissingScopeField) sets engine.hasPartialRenderingErrors = true"
                            );
                            var wrapperItems = wizardVetoHost._innerHost.getAggregation("_content").getItems();
                            var hasWarningBanner = wrapperItems.some(function (ctrl) {
                                return ctrl.getMetadata().getName() === "sap.m.MessageStrip" &&
                                    ctrl.getText().indexOf("Layout partially rendered") !== -1;
                            });
                            assert.strictEqual(hasWarningBanner, true, "Host renders 'Layout partially rendered' warning banner on bad scope");

                            // Find Next Step button in WizardLayout
                            var wizardRoot = wizardVetoHost._innerHost.generatedContent;
                            var navBar = wizardRoot.getItems()[2];
                            var nextBtn = navBar.getItems()[1];
                            var stepCounter = wizardRoot.getItems()[0].getItems()[0].getItems()[1];

                            nextBtn.firePress();
                            assert.strictEqual(stepCounter.getText(), "Step 1 of 2", "Wizard step advance blocked by beforeLayoutSectionChange addError()");

                            vetoStep = false;
                            wizardVetoHost.getStateManager().setProperty("Email", "available@example.com");
                            nextBtn.firePress();
                            assert.strictEqual(
                                stepCounter.getText(),
                                "Step 2 of 2",
                                "Wizard advances on next attempt after fixing field without permanent deadlock"
                            );
                            wizardVetoHost.destroy();

                            // 13.2.4: OData V4 setProperty promise rejection fires host error event
                            var odataErrorEvents = [];
                            var v4RejectHost = new DynamicHost({
                                schemaDefinition: {
                                    type: "object",
                                    properties: { Name: { type: "string" } }
                                },
                                data: { Name: "Ada" },
                                liveUpdate: true,
                                error: function (oEvt) {
                                    odataErrorEvents.push(oEvt.getParameter("message"));
                                }
                            });
                            var rejectingV4Context = {
                                getModel: function () {
                                    return {
                                        getMetadata: function () {
                                            return { getName: function () { return "sap.ui.model.odata.v4.ODataModel"; } };
                                        }
                                    };
                                },
                                getPath: function () { return "/Employees('E100')"; },
                                getProperty: function () { return "Ada"; },
                                requestObject: function () { return Promise.resolve({ Name: "Ada" }); },
                                setProperty: function () {
                                    return Promise.reject(new Error("Simulated 409 Conflict"));
                                }
                            };
                            var v4Delegate = new ODataDelegate(v4RejectHost, rejectingV4Context);
                            v4Delegate.handleFieldChange("/Name", "Grace");
                            return new Promise(function (resolve) { setTimeout(resolve, 20); }).then(function () {
                                assert.strictEqual(
                                    odataErrorEvents.length === 1 && odataErrorEvents[0].indexOf("Simulated 409 Conflict") !== -1,
                                    true,
                                    "OData V4 setProperty rejection logs error and fires host 'error' event"
                                );
                                v4Delegate.destroy();
                                v4RejectHost.destroy();

                                // 13.3.5: Destroying parent host while nested dialog is open settles promise and destroys nested host
                                var parentWithNested = new DynamicHost({
                                    schemaDefinition: {
                                        type: "object",
                                        properties: {
                                            Details: {
                                                type: "object",
                                                ui: { renderMode: "dialog", label: "Details" },
                                                properties: { SubField: { type: "string" } }
                                            }
                                        }
                                    },
                                    data: { Details: { SubField: "Val" } },
                                    editable: true
                                });
                                parentWithNested.placeAt("qunit-fixture");
                                Core.applyChanges();

                                return parentWithNested.generate().then(function () {
                                    Core.applyChanges();
                                    var objPluginEntry = parentWithNested._innerHost.engine.getActivePlugins()[0];
                                    var openBtn = objPluginEntry.plugin.control;
                                    openBtn.firePress();

                                    return new Promise(function (resolve) { setTimeout(resolve, 60); }).then(function () {
                                        var nestedHosts = Array.from(objPluginEntry.plugin.activeNestedHosts || []);
                                        assert.strictEqual(nestedHosts.length, 1, "Opening nested ObjectPlugin dialog registers nested DynamicHost");
                                        var nestedHost = nestedHosts[0];
                                        parentWithNested.destroy();
                                        assert.strictEqual(
                                            nestedHost.isDestroyed(),
                                            true,
                                            "Destroying parent DynamicHost while nested dialog is open deterministically destroys nested DynamicHost"
                                        );

                                        // 13.3.6: Inlined optional $ref preserves children's required when populated, does not block when absent
                                        var optionalRefHost = new DynamicHost({
                                            layoutBudget: 50,
                                            schemaDefinition: {
                                                type: "object",
                                                definitions: {
                                                    Address: {
                                                        type: "object",
                                                        required: ["street", "city"],
                                                        properties: {
                                                            street: { type: "string", ui: { label: "Street" } },
                                                            city: { type: "string", ui: { label: "City" } }
                                                        }
                                                    }
                                                },
                                                properties: {
                                                    Name: { type: "string", required: true },
                                                    address: { $ref: "#/definitions/Address" }
                                                }
                                            },
                                            data: { Name: "Acme Corp" },
                                            editable: true
                                        });
                                        optionalRefHost.placeAt("qunit-fixture");
                                        Core.applyChanges();

                                        return optionalRefHost.generate().then(function () {
                                            Core.applyChanges();
                                            var parsedAddr = optionalRefHost._innerHost.getParsedSchema().properties.address;
                                            assert.strictEqual(
                                                parsedAddr.properties.street.required,
                                                true,
                                                "LayoutScorer preserves required=true on inlined optional $ref child 'street'"
                                            );
                                            assert.strictEqual(
                                                optionalRefHost.triggerSubmit(),
                                                true,
                                                "Absent optional parent object 'address' does not block submit"
                                            );
                                            optionalRefHost.getStateManager().setProperty("address", { street: "100 Main St", city: "" });
                                            assert.strictEqual(
                                                optionalRefHost.triggerSubmit(),
                                                false,
                                                "Populated optional parent object 'address' enforces required child 'city'"
                                            );
                                            optionalRefHost.getStateManager().setProperty("address/city", "Wellington");
                                            assert.strictEqual(
                                                optionalRefHost.triggerSubmit(),
                                                true,
                                                "Satisfying required children of populated optional 'address' allows submit"
                                            );
                                            optionalRefHost.destroy();
                                            done();
                                        });
                                    });
                                });
                            });
                        });
                    });
                });
            });
        });

        function buildCheck(v) {
            return v;
        }
    });

    QUnit.test("Layout x Binding x Render-Target x Display Covering Set (13.7.5): All 6 cells render with geometry and bound control values", function (assert) {
        var done = assert.async();
        createIntegrationSandbox("e2e-covering-set");

        // Cell 1: form x object x embedded x editable
        var cell1Host = new DynamicHost({
            schemaDefinition: {
                type: "object",
                layoutStrategy: "form",
                properties: {
                    Title: { type: "string", ui: { label: "Title" } },
                    Count: { type: "integer", ui: { label: "Count" } }
                }
            },
            data: { Title: "Form Object", Count: 7 },
            editable: true,
            liveUpdate: true
        });
        cell1Host.placeAt("e2e-covering-set");
        Core.applyChanges();

        cell1Host.generate().then(function () {
            Core.applyChanges();
            var c1Ctrl = cell1Host._innerHost.engine.getPluginByPath("Title").control;
            var c1Rect = c1Ctrl.getDomRef().getBoundingClientRect();
            assert.strictEqual(
                c1Rect.width > 0 && c1Rect.height > 0 && c1Ctrl.getValue() === "Form Object",
                true,
                "[13.7.5 Cell 1: form x object x embedded x editable] Rendered Input with bound value 'Form Object' and geometry"
            );
            cell1Host.destroy();

            // Cell 2: form x dataJson x programmatic x display
            var progBox2 = new sap.m.VBox();
            var cell2Host = new DynamicHost({
                schemaDefinition: {
                    type: "object",
                    layoutStrategy: "form",
                    properties: {
                        Title: { type: "string", ui: { label: "Title" } },
                        Secret: { type: "string", ui: { label: "Secret", widget: "password" } }
                    }
                },
                dataJson: JSON.stringify({ Title: "ReadOnly JSON", Secret: "topsecret" }),
                editable: false
            });
            progBox2.addItem(cell2Host);
            progBox2.placeAt("e2e-covering-set");
            Core.applyChanges();

            return cell2Host.generate().then(function () {
                Core.applyChanges();
                var c2Title = cell2Host._innerHost.engine.getPluginByPath("Title").control;
                var c2Secret = cell2Host._innerHost.engine.getPluginByPath("Secret").control;
                var c2Rect = c2Title.getDomRef().getBoundingClientRect();
                assert.strictEqual(
                    c2Rect.width > 0 &&
                        c2Rect.height > 0 &&
                        c2Title.getMetadata().getName() === "sap.m.Text" &&
                        c2Title.getText() === "ReadOnly JSON" &&
                        c2Secret.getText() === "********",
                    true,
                    "[13.7.5 Cell 2: form x dataJson x programmatic x display] Rendered sap.m.Text with 'ReadOnly JSON' and masked password"
                );
                progBox2.destroy();

                // Cell 3: table x object x dialog x editable
                var cell3Host = new DynamicHost({
                    schemaDefinition: {
                        type: "array",
                        layoutStrategy: "table",
                        items: {
                            type: "object",
                            properties: {
                                Code: { type: "string", ui: { label: "Code" } },
                                Qty: { type: "integer", ui: { label: "Qty" } }
                            }
                        }
                    },
                    data: [
                        { Code: "R1", Qty: 3 },
                        { Code: "R2", Qty: 8 }
                    ],
                    editable: true
                });
                var c3ClosePromise = cell3Host.openInDialog("Cell 3 Table Dialog", "Save Table");
                return cell3Host.generate().then(function () {
                    return new Promise(function (r) { setTimeout(r, 50); });
                }).then(function () {
                    Core.applyChanges();
                    var c3Dialog = cell3Host._innerHost.dialogDelegate.activeDialog;
                    var c3Table = cell3Host._innerHost.generatedContent;
                    var c3Rows = c3Table.getItems();
                    var r0Cell = c3Rows[0].getCells()[0];
                    var r1Cell = c3Rows[1].getCells()[0];
                    var r0Rect = r0Cell.getDomRef().getBoundingClientRect();
                    assert.strictEqual(
                        r0Rect.width > 0 &&
                            r0Rect.height > 0 &&
                            r0Cell.getValue() === "R1" &&
                            r1Cell.getValue() === "R2",
                        true,
                        "[13.7.5 Cell 3: table x object x dialog x editable] Dialog table rendered 2 editable rows with 'R1' and 'R2'"
                    );
                    c3Dialog.close();
                    return c3ClosePromise;
                }).then(function () {
                    cell3Host.destroy();

                    // Cell 4: table x OData x embedded x display
                    var mockODataTblModel = new JSONModel({});
                    var mockODataTblCtx = {
                        getModel: function () { return mockODataTblModel; },
                        getPath: function () { return "/Shipments('S1')"; },
                        requestObject: function () {
                            return Promise.resolve({
                                items: [
                                    { SKU: "SKU-100" },
                                    { SKU: "SKU-200" }
                                ]
                            });
                        },
                        setProperty: function () {}
                    };
                    var cell4Host = new DynamicHost({
                        schemaDefinition: {
                            type: "array",
                            layoutStrategy: "table",
                            items: {
                                type: "object",
                                properties: {
                                    SKU: { type: "string", ui: { label: "SKU" } }
                                }
                            }
                        },
                        editable: false
                    });
                    cell4Host.placeAt("e2e-covering-set");
                    cell4Host.setBindingContext(mockODataTblCtx, "odata");
                    Core.applyChanges();

                    return new Promise(function (r) { setTimeout(r, 40); }).then(function () {
                        return cell4Host.generate();
                    }).then(function () {
                        Core.applyChanges();
                        var c4Table = cell4Host._innerHost.generatedContent;
                        var c4Rows = c4Table.getItems();
                        var c4Cell0 = c4Rows[0].getCells()[0];
                        var c4Cell1 = c4Rows[1].getCells()[0];
                        var c4Rect = c4Cell0.getDomRef().getBoundingClientRect();
                        assert.strictEqual(
                            c4Rect.width > 0 &&
                                c4Rect.height > 0 &&
                                c4Cell0.getMetadata().getName() === "sap.m.Text" &&
                                c4Cell0.getText() === "SKU-100" &&
                                c4Cell1.getText() === "SKU-200",
                            true,
                            "[13.7.5 Cell 4: table x OData x embedded x display] OData table rendered sap.m.Text cells with 'SKU-100' and 'SKU-200'"
                        );
                        cell4Host.destroy();
                        mockODataTblModel.destroy();

                        // Cell 5: wizard x dataJson x embedded x editable
                        var cell5Host = new DynamicHost({
                            schemaDefinition: {
                                type: "object",
                                layoutStrategy: "wizard",
                                properties: {
                                    StepOneName: { type: "string", ui: { label: "Step 1 Name" } },
                                    StepTwoCode: { type: "string", ui: { label: "Step 2 Code" } }
                                },
                                uiLayout: [
                                    {
                                        type: "WizardStep",
                                        label: "Step 1",
                                        elements: [{ type: "Control", scope: "#/properties/StepOneName" }]
                                    },
                                    {
                                        type: "WizardStep",
                                        label: "Step 2",
                                        elements: [{ type: "Control", scope: "#/properties/StepTwoCode" }]
                                    }
                                ]
                            },
                            dataJson: JSON.stringify({ StepOneName: "Wizard JSON Step 1", StepTwoCode: "WIZ-2" }),
                            editable: true
                        });
                        cell5Host.placeAt("e2e-covering-set");
                        Core.applyChanges();

                        return cell5Host.generate().then(function () {
                            Core.applyChanges();
                            var s1Ctrl = cell5Host._innerHost.engine.getPluginByPath("StepOneName").control;
                            var s1Rect = s1Ctrl.getDomRef().getBoundingClientRect();
                            var wizRoot = cell5Host._innerHost.generatedContent;
                            var navBar = wizRoot.getItems()[wizRoot.getItems().length - 1];
                            var nextBtn = navBar.getItems()[1];
                            nextBtn.firePress();
                            Core.applyChanges();
                            var s2Ctrl = cell5Host._innerHost.engine.getPluginByPath("StepTwoCode").control;
                            var s2Rect = s2Ctrl.getDomRef().getBoundingClientRect();
                            assert.strictEqual(
                                s1Rect.width > 0 &&
                                    s2Rect.width > 0 &&
                                    s1Ctrl.getValue() === "Wizard JSON Step 1" &&
                                    s2Ctrl.getValue() === "WIZ-2",
                                true,
                                "[13.7.5 Cell 5: wizard x dataJson x embedded x editable] Wizard rendered Step 1 and Step 2 bound values from dataJson"
                            );
                            cell5Host.destroy();

                            // Cell 6: compact x object x programmatic x display
                            var progBox6 = new sap.m.VBox();
                            var cell6Host = new DynamicHost({
                                schemaDefinition: {
                                    type: "object",
                                    layoutStrategy: "compact",
                                    properties: {
                                        First: { type: "string", ui: { label: "First" } },
                                        Last: { type: "string", ui: { label: "Last" } }
                                    }
                                },
                                data: { First: "CompactAda", Last: "CompactLovelace" },
                                editable: false
                            });
                            progBox6.addItem(cell6Host);
                            progBox6.placeAt("e2e-covering-set");
                            Core.applyChanges();

                            return cell6Host.generate().then(function () {
                                Core.applyChanges();
                                var c6First = cell6Host._innerHost.engine.getPluginByPath("First").control;
                                var c6Last = cell6Host._innerHost.engine.getPluginByPath("Last").control;
                                var c6Rect = c6First.getDomRef().getBoundingClientRect();
                                assert.strictEqual(
                                    c6Rect.width > 0 &&
                                        c6Rect.height > 0 &&
                                        c6First.getMetadata().getName() === "sap.m.Text" &&
                                        c6First.getText() === "CompactAda" &&
                                        c6Last.getText() === "CompactLovelace",
                                    true,
                                    "[13.7.5 Cell 6: compact x object x programmatic x display] CompactLayout rendered display sap.m.Text controls with bound values"
                                );
                                progBox6.destroy();
                                done();
                            });
                        });
                    });
                });
            });
        });
    });

    QUnit.test("Host Sizing & Containment (Phase 15: T1-T6): Wide fixture never overflows fixed containers, viewport, or sap.m.Table columns, and honours height:auto + explicit width/height", function (assert) {
        var done = assert.async();
        var contentRoot = document.getElementById("content") || document.body;

        function buildWideFixtureSchema() {
            return {
                type: "object",
                layoutStrategy: "form",
                properties: {
                    FieldAlpha: {
                        type: "string",
                        ui: { label: "Primary_Enterprise_Configuration_Identifier_And_Global_Namespace_Path" }
                    },
                    FieldBeta: {
                        type: "string",
                        ui: { label: "Secondary_Organisational_Unit_Distribution_Channel_Reference_Code" }
                    },
                    FieldGamma: {
                        type: "string",
                        ui: { label: "Tertiary_Cross_System_Integration_Endpoint_Reconciliation_Token" }
                    },
                    FieldDelta: {
                        type: "string",
                        ui: { label: "Quaternary_Financial_Ledger_Cost_Center_Allocation_Segment_Key" }
                    },
                    FieldEpsilon: {
                        type: "number",
                        ui: { label: "Quinary_Maximum_Concurrent_Transaction_Throughput_Threshold_Limit" }
                    },
                    CodeSnippet: {
                        type: "string",
                        ui: {
                            widget: "codeEditor",
                            label: "Embedded_JSON_Configuration_Payload_And_Transformation_Script_Editor",
                            options: { language: "json", height: "120px" }
                        }
                    },
                    RichNotes: {
                        type: "string",
                        ui: {
                            widget: "richText",
                            label: "Comprehensive_Executive_Audit_Trail_And_Compliance_Documentation_Notes"
                        }
                    },
                    LineItems: {
                        type: "array",
                        ui: { label: "Enterprise_Line_Item_Allocation_Schedule_And_Settlement_Breakdown_Table" },
                        items: {
                            type: "object",
                            properties: {
                                Col1: {
                                    type: "string",
                                    ui: {
                                        isKey: true,
                                        label: "Column_01_Enterprise_Resource_Allocation_Identifier_Key"
                                    }
                                },
                                Col2: {
                                    type: "string",
                                    ui: {
                                        isKey: true,
                                        label: "Column_02_Global_Distribution_Warehouse_Location_Code"
                                    }
                                },
                                Col3: {
                                    type: "string",
                                    ui: {
                                        isKey: true,
                                        label: "Column_03_Intercompany_Settlement_Clearing_Account_Ref"
                                    }
                                },
                                Col4: {
                                    type: "string",
                                    ui: {
                                        isKey: true,
                                        label: "Column_04_Regulatory_Compliance_Classification_Segment"
                                    }
                                },
                                Col5: {
                                    type: "string",
                                    ui: {
                                        isKey: true,
                                        label: "Column_05_Material_Master_Harmonised_Tariff_Schedule_ID"
                                    }
                                },
                                Col6: {
                                    type: "string",
                                    ui: {
                                        isKey: true,
                                        label: "Column_06_Automated_Reconciliation_Verification_Digest"
                                    }
                                }
                            }
                        }
                    }
                },
                uiLayout: [
                    {
                        type: "HorizontalLayout",
                        elements: [
                            { type: "Control", scope: "#/properties/FieldAlpha" },
                            { type: "Control", scope: "#/properties/FieldBeta" },
                            { type: "Control", scope: "#/properties/FieldGamma" },
                            { type: "Control", scope: "#/properties/FieldDelta" }
                        ]
                    },
                    { type: "Control", scope: "#/properties/FieldEpsilon" },
                    { type: "Control", scope: "#/properties/CodeSnippet" },
                    { type: "Control", scope: "#/properties/RichNotes" },
                    { type: "Control", scope: "#/properties/LineItems" }
                ]
            };
        }

        function buildWideFixtureData() {
            return {
                FieldAlpha: "ALPHA_LONG_UNBREAKABLE_VALUE_TOKEN_0123456789_ABCDEFGHIJKLMNOPQRSTUVWXYZ",
                FieldBeta: "BETA_LONG_UNBREAKABLE_VALUE_TOKEN_0123456789_ABCDEFGHIJKLMNOPQRSTUVWXYZ",
                FieldGamma: "GAMMA_LONG_UNBREAKABLE_VALUE_TOKEN_0123456789_ABCDEFGHIJKLMNOPQRSTUVWXYZ",
                FieldDelta: "DELTA_LONG_UNBREAKABLE_VALUE_TOKEN_0123456789_ABCDEFGHIJKLMNOPQRSTUVWXYZ",
                FieldEpsilon: 987654321,
                CodeSnippet: JSON.stringify({ enterpriseConfigKey: "UNBREAKABLE_JSON_VALUE_0123456789_ABCDEFG" }),
                RichNotes: "<p>Audit trail notes for wide containment verification.</p>",
                LineItems: [
                    {
                        Col1: "ROW1_COL1_UNBREAKABLE_TOKEN_0123456789",
                        Col2: "ROW1_COL2_UNBREAKABLE_TOKEN_0123456789",
                        Col3: "ROW1_COL3_UNBREAKABLE_TOKEN_0123456789",
                        Col4: "ROW1_COL4_UNBREAKABLE_TOKEN_0123456789",
                        Col5: "ROW1_COL5_UNBREAKABLE_TOKEN_0123456789",
                        Col6: "ROW1_COL6_UNBREAKABLE_TOKEN_0123456789"
                    }
                ]
            };
        }

        var t1Chain = Promise.resolve();

        [200, 400, 800].forEach(function (w) {
            t1Chain = t1Chain.then(function () {
                var box = document.createElement("div");
                box.style.display = "grid";
                box.style.gridTemplateColumns = "1fr";
                box.style.width = w + "px";
                contentRoot.appendChild(box);

                var host = new DynamicHost({
                    schemaDefinition: buildWideFixtureSchema(),
                    data: buildWideFixtureData(),
                    editable: true
                });
                host.placeAt(box);
                Core.applyChanges();

                return host.generate().then(function () {
                    Core.applyChanges();
                    var hostRect = host.getDomRef().getBoundingClientRect();
                    assert.strictEqual(
                        hostRect.width <= w + 0.5,
                        true,
                        "[T1 width=" + w + "px] host rendered width (" + Math.round(hostRect.width) + "px) <= container width (" + w + "px)"
                    );
                    assert.strictEqual(
                        box.scrollWidth <= box.clientWidth + 1,
                        true,
                        "[T1 width=" + w + "px] container.scrollWidth (" + box.scrollWidth + "px) <= container.clientWidth (" + box.clientWidth + "px)"
                    );
                    host.destroy();
                    if (box.parentNode) {
                        box.parentNode.removeChild(box);
                    }
                });
            });
        });

        t1Chain
            .then(function () {
                // T2: No document-level horizontal overflow when wide fixture is mounted in a constrained container
                var docBox = document.createElement("div");
                docBox.style.display = "grid";
                docBox.style.gridTemplateColumns = "1fr";
                docBox.style.width = "400px";
                contentRoot.appendChild(docBox);

                var docHost = new DynamicHost({
                    schemaDefinition: buildWideFixtureSchema(),
                    data: buildWideFixtureData(),
                    editable: true
                });
                docHost.placeAt(docBox);
                Core.applyChanges();

                return docHost.generate().then(function () {
                    Core.applyChanges();
                    var docEl = document.documentElement;
                    assert.strictEqual(
                        docEl.scrollWidth <= docEl.clientWidth + 1,
                        true,
                        "[T2] document.documentElement.scrollWidth (" + docEl.scrollWidth + "px) <= clientWidth (" + docEl.clientWidth + "px)"
                    );
                    docHost.destroy();
                    if (docBox.parentNode) {
                        docBox.parentNode.removeChild(docBox);
                    }
                });
            })
            .then(function () {
                // T3: Containment inside a real sap.m.Table with a narrow 250px column
                var tableParent = document.createElement("div");
                tableParent.style.width = "600px";
                contentRoot.appendChild(tableParent);

                var cellHost = new DynamicHost({
                    schemaDefinition: buildWideFixtureSchema(),
                    data: buildWideFixtureData(),
                    editable: true
                });
                var outerTable = new sap.m.Table({
                    columns: [
                        new sap.m.Column({
                            width: "250px",
                            header: new sap.m.Label({ text: "Embedded Host Column" })
                        }),
                        new sap.m.Column({
                            header: new sap.m.Label({ text: "Status" })
                        })
                    ],
                    items: [
                        new sap.m.ColumnListItem({
                            cells: [
                                new sap.m.HBox({
                                    renderType: "Bare",
                                    items: [cellHost]
                                }),
                                new sap.m.Text({ text: "Active" })
                            ]
                        })
                    ]
                });
                outerTable.placeAt(tableParent);
                Core.applyChanges();
                // Measured, not assumed: inside a sap.m.Table cell the containment below comes
                // from the table's own fixed layout algorithm, NOT from the host. Stripping the
                // host's min-width:0 / max-width:100% leaves every width in this arrangement
                // unchanged (234px host in a 258px <td> either way), which is why the two
                // geometry assertions alone could not see the regression they were written for.
                // T1/T2 cover the behaviour (a 1fr grid track blows out to 2358px without the
                // fix); the third assertion here pins the contract on the element that is
                // actually rendered in the cell, so deleting either style fails this test too.

                return cellHost.generate().then(function () {
                    Core.applyChanges();
                    var tableRect = outerTable.getDomRef().getBoundingClientRect();
                    var cellHostDom = cellHost.getDomRef();
                    var cellHostRect = cellHostDom.getBoundingClientRect();
                    var cellHostStyle = window.getComputedStyle(cellHostDom);
                    assert.strictEqual(
                        tableRect.width <= 600.5 && cellHostRect.width <= 250.5,
                        true,
                        "[T3] sap.m.Table rendered width (" + Math.round(tableRect.width) + "px <= 600px) and cell host width (" + Math.round(cellHostRect.width) + "px <= 250px)"
                    );
                    assert.strictEqual(
                        tableParent.scrollWidth <= tableParent.clientWidth + 1,
                        true,
                        "[T3] sap.m.Table parent container has no horizontal scroll (scrollWidth=" + tableParent.scrollWidth + "px <= clientWidth=" + tableParent.clientWidth + "px)"
                    );
                    assert.strictEqual(
                        cellHostStyle.minWidth === "0px" && cellHostStyle.maxWidth !== "none",
                        true,
                        "[T3] Embedded host keeps its shrink-to-fit contract (computed min-width='" + cellHostStyle.minWidth + "' must be 0px, max-width='" + cellHostStyle.maxWidth + "' must not be none)"
                    );
                    outerTable.destroy();
                    if (tableParent.parentNode) {
                        tableParent.parentNode.removeChild(tableParent);
                    }
                });
            })
            .then(function () {
                // T4: height:auto behaves in an auto-height container
                var autoBox = document.createElement("div");
                autoBox.style.width = "500px";
                contentRoot.appendChild(autoBox);

                var autoHost = new DynamicHost({
                    schemaDefinition: {
                        type: "object",
                        layoutStrategy: "form",
                        properties: {
                            ShortName: { type: "string", ui: { label: "Short Name" } },
                            ShortCode: { type: "string", ui: { label: "Short Code" } }
                        }
                    },
                    data: { ShortName: "Ada", ShortCode: "A1" },
                    editable: true
                });
                autoHost.placeAt(autoBox);
                Core.applyChanges();

                return autoHost.generate().then(function () {
                    Core.applyChanges();
                    var hostDom = autoHost.getDomRef();
                    var innerDom = autoHost._innerHost.getAggregation("_content").getDomRef();
                    var hostRect = hostDom.getBoundingClientRect();
                    var innerRect = innerDom.getBoundingClientRect();
                    assert.strictEqual(
                        hostDom.style.height === "auto" &&
                            hostRect.height > 0 &&
                            hostRect.height < window.innerHeight * 0.8 &&
                            Math.abs(hostRect.height - innerRect.height) <= 4,
                        true,
                        "[T4] Default height is 'auto' (style.height='" + hostDom.style.height + "'), non-zero (" + Math.round(hostRect.height) + "px), and matches inner content height (" + Math.round(innerRect.height) + "px)"
                    );
                    autoHost.destroy();
                    if (autoBox.parentNode) {
                        autoBox.parentNode.removeChild(autoBox);
                    }
                });
            })
            .then(function () {
                // T5: Explicit sizing is honoured (width="250px", height="120px")
                var explicitBox = document.createElement("div");
                explicitBox.style.width = "600px";
                contentRoot.appendChild(explicitBox);

                var sizedHost = new DynamicHost({
                    width: "250px",
                    height: "120px",
                    schemaDefinition: {
                        type: "object",
                        layoutStrategy: "form",
                        properties: {
                            Title: { type: "string", ui: { label: "Title" } }
                        }
                    },
                    data: { Title: "Sized" },
                    editable: true
                });
                sizedHost.placeAt(explicitBox);
                Core.applyChanges();

                return sizedHost.generate().then(function () {
                    Core.applyChanges();
                    var sizedRect = sizedHost.getDomRef().getBoundingClientRect();
                    assert.strictEqual(
                        Math.abs(sizedRect.width - 250) <= 2 && Math.abs(sizedRect.height - 120) <= 2,
                        true,
                        "[T5] Explicit width='250px' and height='120px' honoured (rendered " + Math.round(sizedRect.width) + "px x " + Math.round(sizedRect.height) + "px)"
                    );
                    sizedHost.destroy();
                    if (explicitBox.parentNode) {
                        explicitBox.parentNode.removeChild(explicitBox);
                    }
                });
            })
            .then(function () {
                // T6: Defaults unchanged where they already worked (fills a normal 700px container)
                var fullBox = document.createElement("div");
                fullBox.style.width = "700px";
                contentRoot.appendChild(fullBox);

                var defaultHost = new DynamicHost({
                    schemaDefinition: {
                        type: "object",
                        layoutStrategy: "form",
                        properties: {
                            Title: { type: "string", ui: { label: "Title" } }
                        }
                    },
                    data: { Title: "FullWidth" },
                    editable: true
                });
                defaultHost.placeAt(fullBox);
                Core.applyChanges();

                return defaultHost.generate().then(function () {
                    Core.applyChanges();
                    var defRect = defaultHost.getDomRef().getBoundingClientRect();
                    assert.strictEqual(
                        Math.abs(defRect.width - 700) <= 2,
                        true,
                        "[T6] Default width='100%' fills normal 700px container (rendered " + Math.round(defRect.width) + "px)"
                    );
                    defaultHost.destroy();
                    if (fullBox.parentNode) {
                        fullBox.parentNode.removeChild(fullBox);
                    }
                    done();
                });
            });
    });

    QUnit.test("Phase 17.1: Schema title renders once (not duplicated by DefaultLayoutGenerator Group wrapper)", function (assert) {
        var done = assert.async();
        var contentRoot = document.getElementById("content") || document.body;

        function countExactTextNodesIn(rootEl, targetText) {
            if (!rootEl) {
                return 0;
            }
            var count = 0;
            var all = rootEl.querySelectorAll("*");
            for (var i = 0; i < all.length; i++) {
                var el = all[i];
                if (el.children.length === 0 && (el.textContent || "").trim() === targetText) {
                    count++;
                }
            }
            return count;
        }

        // Test 1: Schema with title and NO uiLayout -> exactly 1 occurrence of title in rendered host DOM
        var box1 = document.createElement("div");
        box1.style.width = "600px";
        contentRoot.appendChild(box1);

        var host1 = new DynamicHost({
            schemaDefinition: {
                title: "Purchase Order",
                type: "object",
                properties: {
                    OrderCode: { type: "string", ui: { label: "Order Code" } }
                }
            },
            data: { OrderCode: "PO-100" },
            editable: true
        });
        host1.placeAt(box1);
        Core.applyChanges();

        host1
            .generate()
            .then(function () {
                Core.applyChanges();
                var host1TitleCount = countExactTextNodesIn(host1.getDomRef(), "Purchase Order");
                assert.strictEqual(
                    host1TitleCount,
                    1,
                    "[17.1 Test 1] Schema with title and no uiLayout renders 'Purchase Order' exactly once in host DOM (found " + host1TitleCount + ")"
                );
                host1.destroy();
                if (box1.parentNode) {
                    box1.parentNode.removeChild(box1);
                }

                // Test 2: Schema with title AND explicit uiLayout containing a labelled Group -> both strings render once
                var box2 = document.createElement("div");
                box2.style.width = "600px";
                contentRoot.appendChild(box2);

                var host2 = new DynamicHost({
                    schemaDefinition: {
                        title: "Purchase Order",
                        type: "object",
                        properties: {
                            OrderCode: { type: "string", ui: { label: "Order Code" } }
                        },
                        uiLayout: [
                            {
                                type: "Group",
                                label: "Order Header Section",
                                elements: [{ type: "Control", scope: "#/properties/OrderCode" }]
                            }
                        ]
                    },
                    data: { OrderCode: "PO-200" },
                    editable: true
                });
                host2.placeAt(box2);
                Core.applyChanges();

                return host2.generate().then(function () {
                    Core.applyChanges();
                    var formTitleCount = countExactTextNodesIn(host2.getDomRef(), "Purchase Order");
                    var groupLabelCount = countExactTextNodesIn(host2.getDomRef(), "Order Header Section");
                    assert.strictEqual(
                        formTitleCount === 1 && groupLabelCount === 1,
                        true,
                        "[17.1 Test 2] Schema with title and explicit Group label renders both form title (" + formTitleCount + ") and group label (" + groupLabelCount + ")"
                    );
                    host2.destroy();
                    if (box2.parentNode) {
                        box2.parentNode.removeChild(box2);
                    }
                });
            })
            .then(function () {
                // Test 3: Schema with title rendered via openInDialog("Purchase Order", ...) -> dialog header + 1 in-form occurrence
                var dlgHost = new DynamicHost({
                    schemaDefinition: {
                        title: "Purchase Order",
                        type: "object",
                        properties: {
                            OrderCode: { type: "string", ui: { label: "Order Code" } }
                        }
                    },
                    data: { OrderCode: "PO-300" },
                    editable: true
                });
                var closePromise = dlgHost.openInDialog("Purchase Order", "Save", "Cancel", "500px");
                return dlgHost.generate().then(function () {
                    return new Promise(function (resolve) {
                        setTimeout(resolve, 80);
                    }).then(function () {
                        Core.applyChanges();
                        var activeDialog = dlgHost._innerHost.dialogDelegate.activeDialog;
                        var dlgDom = activeDialog ? activeDialog.getDomRef() : null;
                        var inFormCount = countExactTextNodesIn(dlgHost._innerHost.getDomRef(), "Purchase Order");
                        var totalDialogCount = countExactTextNodesIn(dlgDom, "Purchase Order");
                        assert.strictEqual(
                            inFormCount,
                            1,
                            "[17.1 Test 3] openInDialog('Purchase Order') renders title once inside form DOM (found " + inFormCount + ")"
                        );
                        assert.strictEqual(
                            totalDialogCount,
                            2,
                            "[17.1 Test 3] openInDialog('Purchase Order') renders title twice total (1 dialog header + 1 form title; found " + totalDialogCount + ")"
                        );
                        if (activeDialog && activeDialog.getEndButton()) {
                            activeDialog.getEndButton().firePress();
                        }
                        return closePromise.then(function () {
                            Core.applyChanges();
                            dlgHost.destroy();
                        });
                    });
                });
            })
            .then(function () {
                // Test 4: Schema with NO title -> no empty heading element emitted
                var box4 = document.createElement("div");
                box4.style.width = "600px";
                contentRoot.appendChild(box4);

                var host4 = new DynamicHost({
                    schemaDefinition: {
                        type: "object",
                        properties: {
                            OrderCode: { type: "string", ui: { label: "Order Code" } }
                        }
                    },
                    data: { OrderCode: "PO-400" },
                    editable: true
                });
                host4.placeAt(box4);
                Core.applyChanges();

                return host4.generate().then(function () {
                    Core.applyChanges();
                    var headingNodes = host4.getDomRef().querySelectorAll(".sapUiFormTitle, .sapMTitle");
                    assert.strictEqual(
                        headingNodes.length,
                        0,
                        "[17.1 Test 4] Schema with no title emits 0 heading elements (found " + headingNodes.length + ")"
                    );
                    host4.destroy();
                    if (box4.parentNode) {
                        box4.parentNode.removeChild(box4);
                    }
                    done();
                });
            });
    });

    QUnit.test("Phase 17.2: Configurable root ui.labelSpan / ui.controlProps renders compact rows in 340px container while preserving default labelSpanS:12", function (assert) {
        var done = assert.async();
        var contentRoot = document.getElementById("content") || document.body;

        function makeThreeFieldSchema(rootUi) {
            var s = {
                type: "object",
                layoutStrategy: "form",
                properties: {
                    Sku: { type: "string", ui: { label: "SKU" } },
                    Qty: { type: "integer", ui: { label: "Qty" } },
                    Rush: { type: "boolean", ui: { label: "Rush" } }
                }
            };
            if (rootUi) {
                s.ui = rootUi;
            }
            return s;
        }
        var sampleData = { Sku: "SKU-01", Qty: 5, Rush: true };

        var boxDefault = document.createElement("div");
        boxDefault.style.width = "340px";
        contentRoot.appendChild(boxDefault);

        var boxBaseline = document.createElement("div");
        boxBaseline.style.width = "340px";
        contentRoot.appendChild(boxBaseline);

        var boxCompact = document.createElement("div");
        boxCompact.style.width = "340px";
        contentRoot.appendChild(boxCompact);

        var boxNoLabels = document.createElement("div");
        boxNoLabels.style.width = "340px";
        contentRoot.appendChild(boxNoLabels);

        var hostDefault = new DynamicHost({
            schemaDefinition: makeThreeFieldSchema(undefined),
            data: sampleData,
            editable: true
        });
        var hostBaseline = new DynamicHost({
            schemaDefinition: makeThreeFieldSchema({}),
            data: sampleData,
            editable: true
        });
        var hostCompact = new DynamicHost({
            schemaDefinition: makeThreeFieldSchema({ labelSpan: 4 }),
            data: sampleData,
            editable: true
        });
        var hostNoLabels = new DynamicHost({
            schemaDefinition: makeThreeFieldSchema({ labelSpan: 0 }),
            data: sampleData,
            editable: true
        });

        hostDefault.placeAt(boxDefault);
        hostBaseline.placeAt(boxBaseline);
        hostCompact.placeAt(boxCompact);
        hostNoLabels.placeAt(boxNoLabels);
        Core.applyChanges();

        Promise.all([
            hostDefault.generate(),
            hostBaseline.generate(),
            hostCompact.generate(),
            hostNoLabels.generate()
        ]).then(function () {
            Core.applyChanges();
            var defaultRect = hostDefault.getDomRef().getBoundingClientRect();
            var baselineRect = hostBaseline.getDomRef().getBoundingClientRect();
            var compactRect = hostCompact.getDomRef().getBoundingClientRect();
            var noLabelsRect = hostNoLabels.getDomRef().getBoundingClientRect();

            // Test 1: Three-field host in 340px container with compact setting renders measurably shorter than default
            assert.strictEqual(
                compactRect.height > 0 && compactRect.height < defaultRect.height - 40,
                true,
                "[17.2 Test 1a] Root ui.labelSpan=4 in 340px container renders measurably shorter (" + Math.round(compactRect.height) + "px) than default stacked form (" + Math.round(defaultRect.height) + "px)"
            );
            assert.strictEqual(
                noLabelsRect.height > 0 && noLabelsRect.height < defaultRect.height - 40,
                true,
                "[17.2 Test 1b] Root ui.labelSpan=0 (no labels) in 340px container renders measurably shorter (" + Math.round(noLabelsRect.height) + "px) than default stacked form (" + Math.round(defaultRect.height) + "px)"
            );

            // Test 2: Containment still holds (no container overflow and no page horizontal scrollbar)
            assert.strictEqual(
                compactRect.width <= 340.5 &&
                    boxCompact.scrollWidth <= boxCompact.clientWidth + 1 &&
                    noLabelsRect.width <= 340.5 &&
                    boxNoLabels.scrollWidth <= boxNoLabels.clientWidth + 1,
                true,
                "[17.2 Test 2a] Narrow 340px container has no horizontal overflow with labelSpan=4 (" + boxCompact.scrollWidth + "<=" + boxCompact.clientWidth + ") or labelSpan=0 (" + boxNoLabels.scrollWidth + "<=" + boxNoLabels.clientWidth + ")"
            );
            assert.strictEqual(
                document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
                true,
                "[17.2 Test 2b] Viewport has no horizontal scrollbar (scrollWidth=" + document.documentElement.scrollWidth + " <= clientWidth=" + document.documentElement.clientWidth + ")"
            );

            // Test 3: Default rendering is unchanged (labelSpanS=12, stacked height preserved)
            var defaultSimpleForm = hostDefault._innerHost.getAggregation("_content").getItems()[0];
            assert.strictEqual(
                defaultSimpleForm.getLabelSpanS() === 12 &&
                    defaultSimpleForm.getLabelSpanM() === 4 &&
                    defaultSimpleForm.getLabelSpanL() === 4 &&
                    defaultSimpleForm.getLabelSpanXL() === 4 &&
                    Math.abs(defaultRect.height - baselineRect.height) <= 1,
                true,
                "[17.2 Test 3] Default form preserves labelSpanS=12 (M/L/XL=4) and identical stacked height (" + Math.round(defaultRect.height) + "px vs " + Math.round(baselineRect.height) + "px)"
            );

            hostDefault.destroy();
            hostBaseline.destroy();
            hostCompact.destroy();
            hostNoLabels.destroy();
            [boxDefault, boxBaseline, boxCompact, boxNoLabels].forEach(function (b) {
                if (b.parentNode) {
                    b.parentNode.removeChild(b);
                }
            });
            done();
        });
    });

    QUnit.test("Host hardening 1: writing 'data' on the facade retires a stale literal 'dataJson'", function (assert) {
        var done = assert.async();
        createIntegrationSandbox("hh-datajson");

        function hhCodeSchema() {
            return { type: "object", properties: { Code: { type: "string", ui: { label: "Code" } } } };
        }

        // Both hosts receive their payloads before the first render, i.e. while the inner GeneratorHost does
        // not exist yet. This is exactly the window ODataDelegate.syncToEngine() writes 'data' in.
        var hostJsonFirst = new DynamicHost({ schemaDefinition: hhCodeSchema(), editable: true });
        hostJsonFirst.setDataJson(JSON.stringify({ Code: "FROM_DATAJSON" }));
        hostJsonFirst.setData({ Code: "FROM_DATA" });
        hostJsonFirst.placeAt("hh-datajson");

        var hostDataFirst = new DynamicHost({ schemaDefinition: hhCodeSchema(), editable: true });
        hostDataFirst.setData({ Code: "FROM_DATA" });
        hostDataFirst.setDataJson(JSON.stringify({ Code: "FROM_DATAJSON" }));
        hostDataFirst.placeAt("hh-datajson");

        Core.applyChanges();

        hostJsonFirst.generate().then(function () {
            return hostDataFirst.generate();
        }).then(function () {
            Core.applyChanges();

            var staleJson = hostJsonFirst.getBaseProperty("dataJson");
            assert.strictEqual(
                typeof staleJson === "string" && staleJson.length > 0,
                false,
                "Host hardening 1: setData() retired the facade's stale literal dataJson (now " + JSON.stringify(staleJson) + ")"
            );
            assert.strictEqual(
                hostJsonFirst.getStateManager().getProperty("Code"),
                "FROM_DATA",
                "Host hardening 1: setDataJson() then setData() renders the newer 'data' payload, not the stale dataJson"
            );
            assert.strictEqual(
                hostDataFirst.getStateManager().getProperty("Code"),
                "FROM_DATAJSON",
                "Host hardening 1: the reverse order (setData() then setDataJson()) still honours the newer dataJson payload"
            );

            hostJsonFirst.destroy();
            hostDataFirst.destroy();
            done();
        });
    });

    QUnit.test("Host hardening 2: a second openInDialog() during generation supersedes the first instead of orphaning a modal", function (assert) {
        var done = assert.async();
        createIntegrationSandbox("hh-dialog-race");

        var raceHost = new DynamicHost({
            schemaDefinition: {
                type: "object",
                required: ["Code"],
                properties: { Code: { type: "string", minLength: 2, ui: { label: "Code" } } }
            },
            data: { Code: "RACE-1" },
            editable: true
        });
        raceHost.placeAt("hh-dialog-race");
        Core.applyChanges();

        var firstSettled = false;
        var firstPromise = raceHost.openInDialog("HH Race Dialog A", "Save A");
        firstPromise.then(function () {
            firstSettled = true;
        });
        var secondPromise = raceHost.openInDialog("HH Race Dialog B", "Save B");

        hhWait(300).then(function () {
            Core.applyChanges();
            var raceDialogs = Array.prototype.filter.call(document.querySelectorAll(".sapMDialog"), function (el) {
                return el.textContent.indexOf("HH Race Dialog") > -1;
            });
            assert.strictEqual(
                raceDialogs.length,
                1,
                "Host hardening 2: two overlapping openInDialog() calls left exactly 1 modal in the DOM (found " + raceDialogs.length + ")"
            );
            assert.strictEqual(
                firstSettled,
                true,
                "Host hardening 2: the superseded openInDialog() promise settled instead of hanging forever"
            );
            assert.strictEqual(
                raceHost._innerHost.dialogDelegate.activeDialog.getTitle(),
                "HH Race Dialog B",
                "Host hardening 2: the surviving dialog is the most recent request"
            );

            raceHost._innerHost.dialogDelegate.activeDialog.getEndButton().firePress();
            return secondPromise;
        }).then(function () {
            Core.applyChanges();
            assert.strictEqual(
                raceHost._innerHost.getParent() === raceHost,
                true,
                "Host hardening 2: closing the surviving dialog restored the inner host to the facade, not to an orphan"
            );
            assert.strictEqual(
                raceHost.getDomRef().querySelectorAll("input").length > 0,
                true,
                "Host hardening 2: the DynamicHost on the page renders its form again after the dialog closes"
            );
            raceHost.destroy();
            done();
        });
    });

    QUnit.test("Host hardening 3: destroying the dialog's dependents owner releases the inner host instead of destroying it", function (assert) {
        var done = assert.async();
        createIntegrationSandbox("hh-owner-destroy");

        var ownerView = new sap.m.VBox();
        ownerView.placeAt("hh-owner-destroy");

        var ownedHost = new DynamicHost({
            schemaDefinition: {
                type: "object",
                required: ["Code"],
                properties: { Code: { type: "string", minLength: 2, ui: { label: "Code" } } }
            },
            data: { Code: "OWNED-1" },
            editable: true
        });
        ownedHost.placeAt("hh-owner-destroy");
        Core.applyChanges();

        var dialogSettled = false;
        var capturedInner = null;
        var ownerDialogPromise = ownedHost.openInDialog("HH Owner Dialog", "Save", "Cancel", "auto", ownerView);
        ownerDialogPromise.then(function () {
            dialogSettled = true;
        });

        hhWait(300).then(function () {
            Core.applyChanges();
            capturedInner = ownedHost._innerHost;
            // Simulates navigating away: the owning view is destroyed while its dependent dialog is open.
            ownerView.destroy();
            return hhWait(100);
        }).then(function () {
            Core.applyChanges();
            assert.strictEqual(
                capturedInner.isDestroyed(),
                false,
                "Host hardening 3: destroying the dialog's dependents owner left the inner GeneratorHost alive"
            );
            assert.strictEqual(
                ownedHost._innerHost === capturedInner,
                true,
                "Host hardening 3: the facade still owns the very same inner host after its owner view was destroyed"
            );
            assert.strictEqual(
                dialogSettled,
                true,
                "Host hardening 3: the pending openInDialog() promise settled when its owner was destroyed"
            );

            ownedHost.setData({ Code: "AFTER-NAV" });
            return ownedHost.generate();
        }).then(function () {
            Core.applyChanges();
            var survivingState = ownedHost.getStateManager();
            assert.strictEqual(
                survivingState ? survivingState.getProperty("Code") : null,
                "AFTER-NAV",
                "Host hardening 3: the facade still accepts and renders new data after the owner view was destroyed"
            );
            assert.strictEqual(
                ownedHost.triggerSubmit(),
                true,
                "Host hardening 3: triggerSubmit() still succeeds after the owner view was destroyed"
            );
            assert.strictEqual(
                ownedHost.getDomRef().querySelectorAll("input").length > 0,
                true,
                "Host hardening 3: the DynamicHost is not left permanently blank"
            );
            ownedHost.destroy();
            done();
        });
    });

    QUnit.test("Host hardening 4-6: OData V2 write-back reports rejections, flushes collection edits, and leaves untouched Dates alone", function (assert) {
        var done = assert.async();
        createIntegrationSandbox("hh-odata-v2");

        var previousLogLevel = hhMuteLogComponent("ODataDelegate");
        var v2Writes = [];
        var rejectedPaths = { Code: true };
        var entity = {
            Code: "C-1",
            When: new Date(Date.UTC(2026, 0, 15, 9, 30, 0)),
            Items: [{ Qty: 1 }]
        };
        var v2Model = {
            getMetadata: function () {
                return {
                    getName: function () {
                        return "sap.ui.model.odata.v2.ODataModel";
                    }
                };
            },
            setProperty: function (path, value) {
                if (rejectedPaths[path]) {
                    return false;
                }
                v2Writes.push({ path: path, value: value });
                return true;
            }
        };
        var v2Context = {
            getModel: function () {
                return v2Model;
            },
            getPath: function () {
                return "/Orders('C-1')";
            },
            getObject: function () {
                return entity;
            },
            getProperty: function (path) {
                return hhReadEntityPath(entity, path);
            }
        };

        var v2Errors = [];
        var v2Host = new DynamicHost({
            schemaDefinition: {
                type: "object",
                properties: {
                    Code: { type: "string", ui: { label: "Code" } },
                    When: { type: "string", ui: { label: "When" } },
                    Items: {
                        type: "array",
                        items: { type: "object", properties: { Qty: { type: "integer", ui: { label: "Qty" } } } }
                    }
                }
            },
            editable: true,
            liveUpdate: false,
            error: function (oEvent) {
                v2Errors.push(String(oEvent.getParameter("message")));
            }
        });
        v2Host.placeAt("hh-odata-v2");
        v2Host.setBindingContext(v2Context, "odata");
        Core.applyChanges();

        v2Host.generate().then(function () {
            Core.applyChanges();
            var sm = v2Host.getStateManager();
            assert.strictEqual(
                sm.getProperty("When"),
                entity.When.toISOString(),
                "Host hardening 6: the V2 Date property reaches the Engine flattened to an ISO string"
            );

            // One transactional submit carrying a rejected scalar, an untouched Date and a touched collection entry.
            sm.setProperty("Code", "C-2");
            sm.setProperty("Items/0/Qty", 7);
            var committed = v2Host.triggerSubmit();
            assert.strictEqual(committed, true, "Host hardening 4-6: transactional triggerSubmit() committed the payload");

            var untouchedDateWrites = v2Writes.filter(function (w) {
                return w.path === "When";
            });
            assert.strictEqual(
                untouchedDateWrites.length,
                0,
                "Host hardening 6: an untouched V2 Date property is no longer rewritten as an ISO string on every submit"
            );

            var qtyWrites = v2Writes.filter(function (w) {
                return w.path === "Items/0/Qty";
            });
            assert.strictEqual(
                qtyWrites.length === 1 && qtyWrites[0].value === 7,
                true,
                "Host hardening 5: a collection edit (Items/0/Qty) is flushed on transactional submit, matching liveUpdate behaviour"
            );

            var reportedRejection = v2Errors.filter(function (m) {
                return m.indexOf("rejected") > -1 && m.indexOf("Code") > -1;
            });
            assert.strictEqual(
                reportedRejection.length > 0,
                true,
                "Host hardening 4: a rejected OData V2 write fires the host 'error' event instead of being discarded"
            );

            // A genuinely changed date must reach a Date-typed V2 property as a Date, not as the Engine's string.
            sm.setProperty("When", "2027-03-04T05:06:07.000Z");
            v2Host.triggerSubmit();
            var changedDateWrites = v2Writes.filter(function (w) {
                return w.path === "When";
            });
            var coercedDate = changedDateWrites.length === 1 ? changedDateWrites[0].value : null;
            assert.strictEqual(
                coercedDate instanceof Date && coercedDate.toISOString() === "2027-03-04T05:06:07.000Z",
                true,
                "Host hardening 6: a genuinely changed V2 Date property is written back as a Date instance"
            );

            v2Host.destroy();
            hhRestoreLogComponent("ODataDelegate", previousLogLevel);
            done();
        });
    });

    QUnit.test("Host hardening 7: one throwing policy no longer aborts the rest of the evaluation cycle", function (assert) {
        var done = assert.async();
        createIntegrationSandbox("hh-policy");

        var previousLogLevel = hhMuteLogComponent("PolicyDelegate");
        var policyHost = new DynamicHost({
            schemaDefinition: {
                type: "object",
                properties: {
                    Mode: { type: "string", ui: { label: "Mode" } },
                    Alpha: { type: "string", ui: { label: "Alpha" } },
                    Beta: { type: "string", ui: { label: "Beta" } }
                },
                uiPolicies: [
                    {
                        effect: "Hide",
                        targets: ["/Alpha", "/Beta"],
                        condition: { StringEquals: { "/Mode": "HIDE" } }
                    }
                ]
            },
            data: { Mode: "SHOW", Alpha: "a", Beta: "b" },
            editable: true
        });
        policyHost.placeAt("hh-policy");
        Core.applyChanges();

        policyHost.generate().then(function () {
            Core.applyChanges();
            var engine = policyHost._innerHost.engine;
            var alphaPlugin = engine.getPluginByPath("/Alpha");
            var betaPlugin = engine.getPluginByPath("/Beta");
            assert.strictEqual(
                betaPlugin.control.getVisible(),
                true,
                "Host hardening 7: baseline - Beta is visible while the Hide policy condition is unmet"
            );

            // Alpha's delta is emitted before Beta's, so a throw there used to swallow every later delta.
            alphaPlugin.applyVisibility = function () {
                throw new Error("HH injected policy delta failure");
            };
            policyHost.getStateManager().setProperty("Mode", "HIDE");
            var deltaCycleSurvived = false;
            try {
                policyHost._innerHost.resetAndEvaluatePoliciesNow();
                deltaCycleSurvived = true;
            } catch (e) {
                deltaCycleSurvived = false;
            }
            Core.applyChanges();
            assert.strictEqual(
                deltaCycleSurvived && betaPlugin.control.getVisible() === false,
                true,
                "Host hardening 7: a throwing policy delta is isolated and the remaining deltas still apply"
            );

            // A throwing evaluation pass must not escape into triggerSubmit().
            var policyDelegate = policyHost._innerHost.policyDelegate;
            var originalEvaluate = policyDelegate.policyEngine.evaluate;
            policyDelegate.policyEngine.evaluate = function () {
                throw new Error("HH injected policy evaluation failure");
            };
            var submitSurvived = false;
            var submitResult = false;
            try {
                submitResult = policyHost.triggerSubmit();
                submitSurvived = true;
            } catch (e) {
                submitSurvived = false;
            }
            policyDelegate.policyEngine.evaluate = originalEvaluate;
            assert.strictEqual(
                submitSurvived && submitResult === true,
                true,
                "Host hardening 7: a throwing policy evaluation pass is contained and no longer aborts triggerSubmit()"
            );

            policyHost.destroy();
            hhRestoreLogComponent("PolicyDelegate", previousLogLevel);
            done();
        });
    });

    QUnit.test("Host hardening 8: a remote schema URL is fetched exactly once", function (assert) {
        var done = assert.async();
        createIntegrationSandbox("hh-remote");

        // Same-origin absolute URL: still takes the remote-resolution branch, but never trips an
        // application-installed cross-origin data source policy. The fetch itself is stubbed below.
        var remoteUrl = window.location.origin + "/hh-remote-schema.json";
        var fetchCount = 0;
        var originalFetch = window.fetch;
        window.fetch = function (url) {
            if (String(url).indexOf("hh-remote-schema.json") > -1) {
                fetchCount++;
                return Promise.resolve({
                    ok: true,
                    status: 200,
                    json: function () {
                        return Promise.resolve({
                            type: "object",
                            properties: { Code: { type: "string", ui: { label: "Code" } } }
                        });
                    }
                });
            }
            return originalFetch.apply(window, arguments);
        };

        var remoteHost = new DynamicHost({ editable: true, data: { Code: "REMOTE-1" } });
        remoteHost.placeAt("hh-remote");
        // Assigning the URL starts a fetch; the first render and generate() must reuse it, not re-issue it.
        remoteHost.setProperty("schemaDefinition", remoteUrl);
        Core.applyChanges();

        remoteHost.generate().then(function () {
            Core.applyChanges();
            window.fetch = originalFetch;
            var resolvedSchema = remoteHost.getBaseProperty("schemaDefinition");
            assert.strictEqual(
                fetchCount,
                1,
                "Host hardening 8: the remote schema URL was requested exactly once (was " + fetchCount + ")"
            );
            assert.strictEqual(
                Boolean(resolvedSchema && resolvedSchema.properties && resolvedSchema.properties.Code),
                true,
                "Host hardening 8: the resolved remote schema was applied to the host"
            );
            assert.strictEqual(
                remoteHost.getStateManager().getProperty("Code"),
                "REMOTE-1",
                "Host hardening 8: the host rendered from the remotely resolved schema with its bound payload"
            );
            remoteHost.destroy();
            done();
        });
    });
});
