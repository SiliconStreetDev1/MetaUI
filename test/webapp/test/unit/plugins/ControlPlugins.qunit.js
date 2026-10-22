sap.ui.define([
    "metaui/sandbox/test/TestOracle",
    "nz/co/siliconst/ui5/metaui/core/PluginRegistry",
    "nz/co/siliconst/ui5/metaui/core/PipelineManager",
    "nz/co/siliconst/ui5/metaui/core/SchemaNormalizer",
    "nz/co/siliconst/ui5/metaui/core/Engine",
    "nz/co/siliconst/ui5/metaui/core/StateManager",
    "nz/co/siliconst/ui5/metaui/layouts/TableLayout",
    "nz/co/siliconst/ui5/metaui/layouts/TableRowHelper",
    "nz/co/siliconst/ui5/metaui/utils/UrlValidator",
    "nz/co/siliconst/ui5/metaui/controls/DynamicHost",
    "sap/ui/model/json/JSONModel",
    "sap/m/Label",
    "sap/ui/core/Core"
], function (
    TestOracle,
    PluginRegistryMod,
    PipelineManagerMod,
    SchemaNormalizerMod,
    EngineMod,
    StateManagerMod,
    TableLayoutMod,
    TableRowHelperMod,
    UrlValidatorMod,
    DynamicHostMod,
    JSONModel,
    Label,
    Core
) {
    "use strict";

    var PluginRegistry = PluginRegistryMod.PluginRegistry;
    var GlobalPipeline = PipelineManagerMod.GlobalPipeline;
    var SchemaNormalizer = SchemaNormalizerMod.SchemaNormalizer;
    var Engine = EngineMod.Engine;
    var StateManager = StateManagerMod.StateManager;
    var TableLayout = TableLayoutMod.TableLayout;
    var TableRowHelper = TableRowHelperMod.TableRowHelper;
    var UrlValidator = UrlValidatorMod.UrlValidator;
    var DynamicHost = DynamicHostMod.default || DynamicHostMod.DynamicHost || DynamicHostMod;

    function cloneVal(v) {
        return v === undefined ? undefined : JSON.parse(JSON.stringify(v));
    }

    function readLiveControlValue(control, plugin, spec, key) {
        var target = plugin.mainControl || control;
        if (key === "object:dictionaryMap") {
            var rows = control.getItems()[1].getItems();
            var out = {};
            rows.forEach(function (r) {
                var k = r.getItems()[0].getValue();
                var v = r.getItems()[1].getValue();
                out[k] = v;
            });
            return out;
        }
        if (key === "object:polymorphic") {
            var varKey = control.getItems()[0].getSelectedKey();
            var childCtrl = control.getItems()[1].getItems()[1];
            if (varKey === "num") {
                return { kind: "num", numVal: Number(childCtrl.getValue()) };
            }
            return { kind: "text", textVal: childCtrl.getValue() };
        }
        if (key === "array" || key === "object" || key === "object:reference" || key === "string:fileUploader") {
            return plugin.getValue(control);
        }
        if (key === "object:location") {
            return control.getProperty("value");
        }
        if (key === "string:camera" || key === "string:signature" || key === "string:voiceInput" || key === "string:richText") {
            return control.getProperty("value");
        }
        if (typeof target.getSelectedKeys === "function") {
            return target.getSelectedKeys();
        }
        if (typeof target.getTokens === "function") {
            return target.getTokens().map(function (t) { return t.getKey(); });
        }
        if (typeof target.getSelected === "function") {
            return target.getSelected();
        }
        if (typeof target.getState === "function") {
            return target.getState();
        }
        if (typeof target.getSelectedKey === "function" && (spec.controlClass === "sap.m.Select" || spec.controlClass === "sap.m.ComboBox")) {
            var rawKey = target.getSelectedKey() || (typeof target.getValue === "function" ? target.getValue() : "");
            return spec.serializesTo === "number" ? Number(rawKey) : rawKey;
        }
        if (typeof target.getValue === "function") {
            var rawVal = target.getValue();
            return spec.serializesTo === "number" ? Number(rawVal) : rawVal;
        }
        if (typeof target.getText === "function") {
            return target.getText();
        }
        return undefined;
    }

    function readDisplayControlValue(dispControl, spec) {
        if (spec.displayValueCheck === "getSrc") {
            return dispControl.getSrc();
        }
        if (spec.displayValueCheck === "fileUploaderText") {
            return dispControl.getItems()[1].getText() || dispControl.getItems()[0].getSrc();
        }
        if (spec.displayValueCheck === "dictionaryEntries") {
            return dispControl.getItems()[1].getItems().map(function (rowBox) {
                var items = rowBox.getItems();
                return items[0].getText() + "=" + items[1].getText();
            }).join(", ");
        }
        if (spec.displayValueCheck === "polymorphicChild") {
            var childTextCtrl = dispControl.getItems()[1].getItems()[1];
            return childTextCtrl && typeof childTextCtrl.getText === "function" ? childTextCtrl.getText() : "";
        }
        if (typeof dispControl.getHtmlText === "function") {
            return dispControl.getHtmlText();
        }
        return typeof dispControl[spec.displayValueCheck] === "function"
            ? dispControl[spec.displayValueCheck]()
            : "";
    }

    function getCellInteractiveTarget(cellControl) {
        var metaName = cellControl.getMetadata().getName();
        if (metaName === "sap.m.HBox") {
            return cellControl.getItems()[0];
        }
        if (metaName === "sap.m.VBox") {
            return cellControl.getItems()[1] || cellControl.getItems()[0];
        }
        return cellControl;
    }

    function simulateCellEdit(cellControl, newVal, spec, key, model) {
        var target = getCellInteractiveTarget(cellControl);
        var ctxPath = cellControl.getBindingContext("meta").getPath();
        var absPath = ctxPath + "/Val";

        if (key === "array" || key === "object" || key === "object:reference" || key === "string:fileUploader") {
            model.setProperty(absPath, cloneVal(newVal));
            var tmplPlugin = cellControl.data("metauiTestPlugin");
            if (tmplPlugin) {
                tmplPlugin.notifyChange(target.getId());
            }
            return;
        }
        if (key === "string:link") {
            model.setProperty(absPath, newVal);
            var linkPlugin = cellControl.data("metauiTestPlugin");
            if (linkPlugin) {
                linkPlugin.notifyChange(target.getId());
            }
            return;
        }
        if (
            key === "string:camera" ||
            key === "string:signature" ||
            key === "object:location" ||
            key === "string:voiceInput" ||
            key === "string:richText"
        ) {
            target.setValue(cloneVal(newVal));
            target.fireEvent("capture", { value: cloneVal(newVal) });
            return;
        }
        if (typeof target.setSelectedKeys === "function" && typeof target.fireSelectionFinish === "function") {
            target.setSelectedKeys(newVal.map(String));
            target.fireSelectionFinish({ selectedItems: [] });
            return;
        }
        if (typeof target.getTokens === "function" && typeof target.fireTokenUpdate === "function") {
            var existingTokens = target.getTokens().slice();
            if (Array.isArray(newVal) && newVal.length === 0) {
                target.DestroyTokens ? target.DestroyTokens() : target.destroyTokens();
                target.fireTokenUpdate({ type: "removed", removedTokens: existingTokens });
            } else {
                var addedTokens = (newVal || []).map(function (v) {
                    return new sap.m.Token({ key: String(v), text: String(v) });
                });
                target.destroyTokens();
                addedTokens.forEach(function (t) { target.addToken(t); });
                target.fireTokenUpdate({ type: "added", addedTokens: addedTokens, removedTokens: existingTokens });
            }
            return;
        }
        if (typeof target.setSelected === "function" && typeof target.fireSelect === "function") {
            if (newVal === null) {
                model.setProperty(absPath, null);
                var boolPlugin = cellControl.data("metauiTestPlugin");
                if (boolPlugin) {
                    boolPlugin.notifyChange(target.getId());
                }
            } else {
                target.setSelected(Boolean(newVal));
                target.fireSelect({ selected: Boolean(newVal) });
            }
            return;
        }
        if (typeof target.setState === "function" && typeof target.fireChange === "function") {
            if (newVal === null) {
                model.setProperty(absPath, null);
                var swPlugin = cellControl.data("metauiTestPlugin");
                if (swPlugin) {
                    swPlugin.notifyChange(target.getId());
                }
            } else {
                target.setState(Boolean(newVal));
                target.fireChange({ state: Boolean(newVal) });
            }
            return;
        }
        if (typeof target.setSelectedKey === "function" && (spec.controlClass === "sap.m.Select" || spec.controlClass === "sap.m.ComboBox")) {
            var strKey = newVal === "" || newVal === null || newVal === undefined ? "" : String(newVal);
            if (strKey !== "" && !target.getItems().some(function (it) { return it.getKey() === strKey; })) {
                target.addItem(new sap.ui.core.Item({ key: strKey, text: strKey }));
            }
            target.setSelectedKey(strKey);
            if (typeof target.setValue === "function") {
                target.setValue(strKey);
            }
            if (strKey === "") {
                model.setProperty(absPath, "");
            }
            target.fireChange({ value: strKey });
            return;
        }
        if (typeof target.setValue === "function" && typeof target.fireChange === "function") {
            if (newVal === null && (spec.controlClass === "sap.m.Slider" || spec.controlClass === "sap.m.RatingIndicator")) {
                model.setProperty(absPath, null);
                var numCtrlPlugin = cellControl.data("metauiTestPlugin");
                if (numCtrlPlugin) {
                    numCtrlPlugin.notifyChange(target.getId());
                }
                return;
            }
            target.setValue(newVal);
            if (newVal === "") {
                model.setProperty(absPath, "");
            }
            target.fireChange({ value: newVal, valid: true });
        }
    }

    function isCellInErrorState(cellControl, spec) {
        var target = getCellInteractiveTarget(cellControl);
        if (spec.errorStateMechanism === "valueState" && typeof target.getValueState === "function") {
            return target.getValueState() === "Error";
        }
        if (spec.errorStateMechanism === "buttonReject" && typeof target.getType === "function") {
            return target.getType() === "Reject";
        }
        if (spec.errorStateMechanism === "none" && typeof target.data === "function") {
            return target.data("metauiErrorState") === true;
        }
        return false;
    }

    function createPhysicalSandbox(id) {
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

    QUnit.module("Physical DOM Sandbox: All 38 Control, Action & Datasource Plugins");

    QUnit.test("Every registered plugin in TestOracle.PLUGIN_MAP renders into physical DOM, binds to JSONModel, toggles state, validates, and destroys cleanly", function (assert) {
        var done = assert.async();
        var registry = PluginRegistry.getInstance();
        var oracleKeys = Object.keys(TestOracle.PLUGIN_MAP);

        // Preload all plugins first
        var rawProps = {};
        oracleKeys.forEach(function (key, i) {
            rawProps["P_" + i] = JSON.parse(JSON.stringify(TestOracle.PLUGIN_MAP[key].sampleMeta));
        });
        var preloadSchema = SchemaNormalizer.normalize({
            type: "object",
            properties: rawProps
        });

        registry.preloadDependencies(preloadSchema).then(function () {
            oracleKeys.forEach(function (key, idx) {
                var spec = TestOracle.PLUGIN_MAP[key];
                var parts = key.split(":");
                var type = parts[0];
                var widget = parts[1];

                var sandboxId = "sandbox-plugin-" + idx;
                createPhysicalSandbox(sandboxId);

                var fieldName = "Field_" + idx;
                var modelData = {};
                modelData[fieldName] = JSON.parse(JSON.stringify(spec.sampleValue));
                var oModel = new JSONModel(modelData);

                var normalizedSchema = SchemaNormalizer.normalize({
                    type: "object",
                    properties: (function () {
                        var p = {};
                        p[fieldName] = JSON.parse(JSON.stringify(spec.sampleMeta));
                        return p;
                    })()
                });
                var propMeta = normalizedSchema.properties[fieldName];

                var plugin = registry.getPlugin(type, widget);
                plugin.setEngineContext({
                    getSchemaDefinition: function () {
                        return SchemaNormalizer.normalize({
                            type: "object",
                            properties: { NestedString: { type: "string" } }
                        });
                    },
                    getSchemaDefinitions: function () {
                        return {
                            MockReference: SchemaNormalizer.normalize({
                                type: "object",
                                properties: { NestedString: { type: "string" } }
                            })
                        };
                    },
                    triggerSubmit: function () { return true; },
                    getModel: function () { return oModel; }
                });

                var control = plugin.render(propMeta, "/" + fieldName, "meta", "unitScope_" + idx, function () {}, oModel);
                var companionLabel = new Label({ text: propMeta.ui && propMeta.ui.label ? propMeta.ui.label : fieldName });
                plugin.setAssociatedLabel(companionLabel);
                control.setModel(oModel, "meta");
                companionLabel.placeAt(sandboxId);
                control.placeAt(sandboxId);
                Core.applyChanges();

                assert.strictEqual(
                    control.getMetadata().getName(),
                    spec.controlClass,
                    "[" + key + "] Rendered expected UI5 control class (" + spec.controlClass + ")"
                );

                var domRef = control.getDomRef();
                var rect = domRef ? domRef.getBoundingClientRect() : { width: 0, height: 0 };
                var compStyle = domRef ? window.getComputedStyle(domRef) : { display: "none", visibility: "hidden" };
                assert.strictEqual(
                    rect.width > 0 && rect.height > 0 && compStyle.display !== "none" && compStyle.visibility !== "hidden",
                    true,
                    "[" + key + "] Control has non-zero physical DOM geometry (" + Math.round(rect.width) + "x" + Math.round(rect.height) + ") and visible CSS"
                );

                var validationRes = plugin.validate();
                assert.strictEqual(
                    validationRes.isValid,
                    true,
                    "[" + key + "] Sample value passes plugin.validate()"
                );

                // 13.7.6: Mutate model and read back from the rendered control (not from JSONModel)
                oModel.setProperty("/" + fieldName, JSON.parse(JSON.stringify(spec.mutatedValue)));
                Core.applyChanges();
                assert.deepEqual(
                    readLiveControlValue(control, plugin, spec, key),
                    spec.mutatedValue,
                    "[" + key + "] Model mutation propagated to rendered UI5 control"
                );
                assert.strictEqual(
                    plugin.validate().isValid,
                    true,
                    "[" + key + "] Mutated value passes plugin.validate()"
                );

                // Test runtime state mutations (visibility, editable, required, valid) + companion label sync
                plugin.setState("visible", false);
                Core.applyChanges();
                assert.strictEqual(control.getVisible(), false, "[" + key + "] setState('visible', false) hides control");
                assert.strictEqual(companionLabel.getVisible(), false, "[" + key + "] Companion label hides with control");

                plugin.setState("visible", true);
                plugin.setState("editable", false);
                plugin.setState("required", true);
                assert.strictEqual(companionLabel.getRequired(), true, "[" + key + "] Companion label reflects required=true");

                // 13.7.7: Verify error-state mechanism for all 52 plugins with terminating else
                plugin.setState("valid", false, "Unit test error");
                var errTarget = plugin.mainControl || control;
                if (spec.errorStateMechanism === "valueState" && typeof errTarget.getValueState === "function") {
                    assert.strictEqual(errTarget.getValueState(), "Error", "[" + key + "] Control reflects ValueState.Error");
                } else if (spec.errorStateMechanism === "buttonReject" && typeof control.getType === "function") {
                    assert.strictEqual(control.getType(), "Reject", "[" + key + "] Trigger button reflects Reject type on error");
                } else if (spec.errorStateMechanism === "none") {
                    assert.strictEqual(
                        errTarget.data("metauiErrorState") === true && typeof errTarget.getValueState === "undefined",
                        true,
                        "[" + key + "] Explicitly recorded errorStateMechanism='none' sets metauiErrorState fallback"
                    );
                } else {
                    assert.ok(false, "[" + key + "] No verified error-state mechanism");
                }

                plugin.setState("valid", true);
                Core.applyChanges();
                assert.strictEqual(control.getVisible(), true, "[" + key + "] setState('visible', true) restores visibility");

                companionLabel.destroy();
                plugin.destroy();
                oModel.destroy();
            });

            done();
        });
    });

    QUnit.test("Display Mode (13.7.2): All 52 plugin mappings render expected display control class, visible bound value, non-zero geometry, non-interactive state, and update on model mutation", function (assert) {
        var registry = PluginRegistry.getInstance();
        var oracleKeys = Object.keys(TestOracle.PLUGIN_MAP);

        oracleKeys.forEach(function (key, idx) {
            var spec = TestOracle.PLUGIN_MAP[key];
            var parts = key.split(":");
            var type = parts[0];
            var widget = parts[1];

            var sandboxId = "sandbox-display-" + idx;
            createPhysicalSandbox(sandboxId);

            var fieldName = "DispField_" + idx;
            var modelData = {};
            modelData[fieldName] = cloneVal(spec.sampleValue);
            var oModel = new JSONModel(modelData);

            var normalizedSchema = SchemaNormalizer.normalize({
                type: "object",
                properties: (function () {
                    var p = {};
                    p[fieldName] = cloneVal(spec.sampleMeta);
                    return p;
                })()
            });
            var propMeta = normalizedSchema.properties[fieldName];

            var plugin = registry.getPlugin(type, widget);
            plugin.setEditable(false);
            plugin.setEngineContext({
                getSchemaDefinition: function () {
                    return SchemaNormalizer.normalize({
                        type: "object",
                        properties: { NestedString: { type: "string" } }
                    });
                },
                getSchemaDefinitions: function () {
                    return {
                        MockReference: SchemaNormalizer.normalize({
                            type: "object",
                            properties: { NestedString: { type: "string" } }
                        })
                    };
                },
                triggerSubmit: function () { return true; },
                getModel: function () { return oModel; }
            });

            var dispControl = plugin.render(propMeta, "/" + fieldName, "meta", "dispScope_" + idx, function () {}, oModel);
            dispControl.setModel(oModel, "meta");
            dispControl.placeAt(sandboxId);
            Core.applyChanges();

            // 1. Rendered control class equals displayControlClass
            var actualClass = dispControl.getMetadata().getName();
            assert.strictEqual(
                actualClass,
                spec.displayControlClass,
                "[" + key + " display] Rendered expected display control class (" + spec.displayControlClass + ")"
            );

            // 2. Bound value is visible via displayValueCheck — not an empty string
            var initialDispVal = readDisplayControlValue(dispControl, spec);
            assert.strictEqual(
                typeof initialDispVal === "string" && initialDispVal.trim().length > 0,
                true,
                "[" + key + " display] Bound sampleValue is visible in display mode ('" + initialDispVal + "')"
            );

            // 3. Non-zero getBoundingClientRect() geometry
            var dispDom = dispControl.getDomRef();
            var dispRect = dispDom ? dispDom.getBoundingClientRect() : { width: 0, height: 0 };
            assert.strictEqual(
                dispRect.width > 0 && dispRect.height > 0,
                true,
                "[" + key + " display] Display control has non-zero DOM geometry (" + Math.round(dispRect.width) + "x" + Math.round(dispRect.height) + ")"
            );

            // 4. Control is not interactive
            if (typeof dispControl.getEditable === "function") {
                assert.strictEqual(dispControl.getEditable(), false, "[" + key + " display] Display control getEditable() is false");
            } else if (spec.displaySameAsEdit && typeof dispControl.getEnabled === "function") {
                assert.strictEqual(dispControl.getEnabled(), false, "[" + key + " display] Display control getEnabled() is false");
            } else if (key === "object:dictionaryMap") {
                var addBtn = dispControl.getItems()[0].getItems()[1];
                assert.strictEqual(addBtn.getVisible(), false, "[" + key + " display] Dictionary Add Entry button is hidden in display mode");
            } else if (key === "object:polymorphic") {
                var varSelect = dispControl.getItems()[0];
                var childDisp = dispControl.getItems()[1].getItems()[1];
                assert.strictEqual(
                    varSelect.getEnabled() === false && childDisp.getMetadata().getName() === "sap.m.Text",
                    true,
                    "[" + key + " display] Polymorphic variant selector disabled and child rendered as sap.m.Text"
                );
            } else if (key === "string:fileUploader") {
                var hasUploader = dispControl.getItems().some(function (it) {
                    return it.getMetadata().getName() === "sap.ui.unified.FileUploader";
                });
                assert.strictEqual(hasUploader, false, "[" + key + " display] FileUploader input omitted in display mode");
            } else if (
                actualClass === "sap.m.Text" ||
                actualClass === "sap.m.FormattedText" ||
                actualClass === "sap.m.Image" ||
                actualClass === "sap.m.MessageStrip"
            ) {
                assert.strictEqual(
                    typeof dispControl.setValue === "undefined",
                    true,
                    "[" + key + " display] Display control (" + actualClass + ") is non-interactive"
                );
            } else {
                assert.ok(false, "[" + key + " display] Unverified non-interactive state for " + actualClass);
            }

            // 5. After mutating the model, the displayed text updates
            if (key === "string:password") {
                oModel.setProperty("/" + fieldName, "");
                Core.applyChanges();
                var emptyMaskVal = readDisplayControlValue(dispControl, spec);
                oModel.setProperty("/" + fieldName, cloneVal(spec.mutatedValue));
                Core.applyChanges();
                var restoredMaskVal = readDisplayControlValue(dispControl, spec);
                assert.strictEqual(
                    emptyMaskVal === "" && restoredMaskVal === "********",
                    true,
                    "[" + key + " display] Password display text updates dynamically on model mutation"
                );
            } else {
                oModel.setProperty("/" + fieldName, cloneVal(spec.mutatedValue));
                Core.applyChanges();
                var updatedDispVal = readDisplayControlValue(dispControl, spec);
                assert.strictEqual(
                    updatedDispVal !== initialDispVal && updatedDispVal.trim().length > 0,
                    true,
                    "[" + key + " display] Displayed value updated on model mutation ('" + initialDispVal + "' -> '" + updatedDispVal + "')"
                );
            }

            plugin.destroy();
            oModel.destroy();
        });
    });

    QUnit.test("Cloned Table-Row Cells (13.7.3): All supportsRowClone widgets render with geometry in both rows, isolate per-row edits and validation errors, and shift value + error state on deleteRow", function (assert) {
        var registry = PluginRegistry.getInstance();
        var oracleKeys = Object.keys(TestOracle.PLUGIN_MAP).filter(function (k) {
            return TestOracle.PLUGIN_MAP[k].supportsRowClone === true;
        });

        oracleKeys.forEach(function (key, idx) {
            var spec = TestOracle.PLUGIN_MAP[key];
            var sandboxId = "sandbox-rowclone-" + idx;
            createPhysicalSandbox(sandboxId);

            var itemPropMeta = cloneVal(spec.sampleMeta);
            itemPropMeta.required = true;
            if (itemPropMeta.type === "boolean") {
                itemPropMeta.nullable = false;
            } else if (itemPropMeta.type === "array") {
                itemPropMeta.minItems = 1;
            } else if (key === "object") {
                itemPropMeta.required = ["Key"];
                itemPropMeta.properties.Key.required = true;
                itemPropMeta.properties.Key.minLength = 1;
            } else if (key === "object:reference") {
                itemPropMeta.required = ["NestedString"];
            } else if (key === "object:location") {
                itemPropMeta.required = ["lat", "lng"];
            } else if ((itemPropMeta.type === "number" || itemPropMeta.type === "integer") && itemPropMeta.minimum === undefined) {
                itemPropMeta.minimum = 0;
            }

            var tableSchema = SchemaNormalizer.normalize({
                type: "array",
                layoutStrategy: "table",
                items: {
                    type: "object",
                    required: ["Val"],
                    properties: {
                        Val: itemPropMeta
                    }
                }
            });

            var initialRows = [
                { Val: cloneVal(spec.sampleValue) },
                { Val: cloneVal(spec.sampleValue) }
            ];
            var stateMgr = new StateManager({ items: cloneVal(initialRows) }, tableSchema);
            var tblModel = stateMgr.getModel();

            var arrayMutatedCalls = 0;
            var engine = new Engine(true, false, registry);
            var origOnArrayMutated = engine.onArrayMutated.bind(engine);
            engine.onArrayMutated = function (arrPath, deletedRowIndex) {
                arrayMutatedCalls++;
                return origOnArrayMutated(arrPath, deletedRowIndex);
            };
            var mockRefDef = SchemaNormalizer.normalize({
                type: "object",
                required: ["NestedString"],
                properties: { NestedString: { type: "string", required: true, minLength: 1 } }
            });
            var tableControl = null;
            engine.host = {
                activeModelName: "meta",
                get generatedContent() { return tableControl; },
                getStateManager: function () { return stateMgr; },
                getParsedSchema: function () { return tableSchema; },
                getSchemaDefinition: function () { return mockRefDef; },
                getSchemaDefinitions: function () { return { MockReference: mockRefDef }; }
            };
            engine.activeModel = tblModel;
            engine.onChange = function (isValid, fieldKey, errorMessage) {
                if (fieldKey) {
                    engine.reportSchemaError(fieldKey, isValid ? null : errorMessage || "Invalid input");
                }
            };

            var origGenField = engine.generateField.bind(engine);
            engine.generateField = function (fieldMeta, bindingPath, modelName, isTemplate) {
                var cellCtrl = origGenField(fieldMeta, bindingPath, modelName, isTemplate);
                var tmplEntry = engine.templatePlugins[engine.templatePlugins.length - 1];
                if (tmplEntry) {
                    cellCtrl.data("metauiTestPlugin", tmplEntry.plugin);
                }
                return cellCtrl;
            };

            tableControl = new TableLayout().render(tableSchema, "meta", engine, undefined, "/items");
            tableControl.setModel(tblModel, "meta");
            tableControl.placeAt(sandboxId);
            Core.applyChanges();

            var rows = tableControl.getItems();
            var row0Cell = rows[0].getCells()[0];
            var row1Cell = rows[1].getCells()[0];

            // 1. Cell control renders with non-zero geometry in both rows
            var r0Dom = row0Cell.getDomRef();
            var r1Dom = row1Cell.getDomRef();
            var r0Rect = r0Dom ? r0Dom.getBoundingClientRect() : { width: 0, height: 0 };
            var r1Rect = r1Dom ? r1Dom.getBoundingClientRect() : { width: 0, height: 0 };
            assert.strictEqual(
                r0Rect.width > 0 && r0Rect.height > 0 && r1Rect.width > 0 && r1Rect.height > 0,
                true,
                "[" + key + " row-clone] Both table rows render cell with non-zero geometry"
            );

            // 2. Editing row 1 writes to /items/1/Val and leaves row 0 (/items/0/Val) untouched
            simulateCellEdit(row1Cell, spec.mutatedValue, spec, key, tblModel);
            Core.applyChanges();
            assert.strictEqual(
                JSON.stringify(tblModel.getProperty("/items/1/Val")) === JSON.stringify(spec.mutatedValue) &&
                    JSON.stringify(tblModel.getProperty("/items/0/Val")) === JSON.stringify(spec.sampleValue),
                true,
                "[" + key + " row-clone] Editing row 1 writes to /items/1/Val and leaves row 0 untouched"
            );

            // 3. Validation error on row 1 paints row 1 only and leaves row 0 clean
            simulateCellEdit(row1Cell, spec.invalidValue, spec, key, tblModel);
            Core.applyChanges();
            assert.strictEqual(
                isCellInErrorState(row1Cell, spec) === true && isCellInErrorState(row0Cell, spec) === false,
                true,
                "[" + key + " row-clone] Validation error on row 1 paints row 1 only and leaves row 0 clean"
            );

            // 4. After deleteRow(0), row 1's value shifts to index 0 and its error state follows it
            TableRowHelper.deleteRow(rows[0], "meta", engine, "/items", tableSchema);
            Core.applyChanges();
            var shiftedRow0Cell = tableControl.getItems()[0].getCells()[0];
            assert.strictEqual(
                JSON.stringify(tblModel.getProperty("/items/0/Val")) === JSON.stringify(spec.invalidValue) &&
                    isCellInErrorState(shiftedRow0Cell, spec) === true &&
                    engine.hasActiveErrors() === true,
                true,
                "[" + key + " row-clone] After deleteRow(0), row 1 value shifts to index 0 and error state follows it"
            );

            // Verify addRow invokes engine.onArrayMutated (13.3.7a) when idx === 0
            if (idx === 0) {
                var callsBeforeAdd = arrayMutatedCalls;
                TableRowHelper.addRow(tableControl, "meta", tableSchema.items, engine, "/items", tableSchema);
                assert.strictEqual(
                    arrayMutatedCalls > callsBeforeAdd,
                    true,
                    "TableRowHelper.addRow invokes engine.onArrayMutated"
                );
            }

            tableControl.destroy();
            engine.destroy();
            stateMgr.destroy();
        });
    });

    QUnit.test("dataJson String-Binding Round-Trip (13.7.4): All 52 plugin mappings populate from dataJson, serialize user edits to expected JSON type, and match object binding", function (assert) {
        var done = assert.async();
        var oracleKeys = Object.keys(TestOracle.PLUGIN_MAP);
        var schemaProps = {};
        var initialPayload = {};

        oracleKeys.forEach(function (key, idx) {
            var spec = TestOracle.PLUGIN_MAP[key];
            var fieldName = "Field_" + idx;
            var propMeta = cloneVal(spec.sampleMeta);
            if (key === "array" || key === "object" || key === "object:reference") {
                propMeta.ui = Object.assign({}, propMeta.ui || {}, { renderMode: "dialog" });
            }
            schemaProps[fieldName] = propMeta;
            initialPayload[fieldName] = cloneVal(spec.sampleValue);
        });

        var hostSchema = {
            type: "object",
            properties: schemaProps
        };
        var mockDefs = {
            MockReference: {
                type: "object",
                properties: {
                    NestedString: { type: "string" }
                }
            }
        };

        var jsonBoxId = "sandbox-datajson-host";
        var objBoxId = "sandbox-dataobj-host";
        createPhysicalSandbox(jsonBoxId);
        createPhysicalSandbox(objBoxId);

        var jsonHost = new DynamicHost({
            schemaDefinition: cloneVal(hostSchema),
            schemaDefinitions: cloneVal(mockDefs),
            dataJson: JSON.stringify(initialPayload),
            liveUpdate: true,
            layoutBudget: 0
        });
        var objHost = new DynamicHost({
            schemaDefinition: cloneVal(hostSchema),
            schemaDefinitions: cloneVal(mockDefs),
            data: cloneVal(initialPayload),
            liveUpdate: true,
            layoutBudget: 0
        });

        jsonHost.placeAt(jsonBoxId);
        objHost.placeAt(objBoxId);
        Core.applyChanges();

        Promise.all([jsonHost.generate(), objHost.generate()]).then(function () {
            Core.applyChanges();
            var jsonEngine = jsonHost._innerHost.engine;
            var objEngine = objHost._innerHost.engine;
            var jsonModel = jsonHost.getStateManager().getModel();
            var objModel = objHost.getStateManager().getModel();

            oracleKeys.forEach(function (key, idx) {
                var spec = TestOracle.PLUGIN_MAP[key];
                var fieldName = "Field_" + idx;
                var jsonPlugin = jsonEngine.getPluginByPath(fieldName);
                var objPlugin = objEngine.getPluginByPath(fieldName);

                // 1. Initial value from dataJson string reaches the rendered control
                var initialCtrlVal = jsonPlugin ? readLiveControlValue(jsonPlugin.control, jsonPlugin, spec, key) : undefined;
                var initialMatches = JSON.stringify(initialCtrlVal) === JSON.stringify(spec.sampleValue);
                assert.strictEqual(
                    initialMatches,
                    true,
                    "[" + key + " dataJson] Initial value from dataJson reached rendered control"
                );

                // For picker widgets, also verify Date instance preservation through StateManager.extractPayload (Mutation Probe #4)
                var isPicker =
                    key === "date" ||
                    key === "string:date" ||
                    key === "string:datePicker" ||
                    key === "date:date" ||
                    key === "date:datePicker" ||
                    key === "string:datetime" ||
                    key === "string:time";
                var pickerDatePreserved = true;
                if (isPicker) {
                    var probeDate = new Date("2026-12-25T10:30:00.000Z");
                    var probeKey = "_probeDate_" + fieldName;
                    jsonModel.setProperty("/" + probeKey, probeDate);
                    objModel.setProperty("/" + probeKey, new Date(probeDate.getTime()));
                    var extractedJsonPayload = jsonHost.getStateManager().extractPayload();
                    var extractedObjPayload = objHost.getStateManager().extractPayload();
                    pickerDatePreserved =
                        extractedJsonPayload[probeKey] instanceof Date &&
                        extractedJsonPayload[probeKey] !== probeDate &&
                        extractedJsonPayload[probeKey].getTime() === probeDate.getTime() &&
                        extractedObjPayload[probeKey] instanceof Date &&
                        typeof JSON.parse(JSON.stringify(extractedJsonPayload))[probeKey] === spec.serializesTo;
                    delete jsonModel.getData()[probeKey];
                    delete objModel.getData()[probeKey];
                }

                // 2. User-level change updates outbound dataJson with expected serializesTo JSON type
                jsonModel.setProperty("/" + fieldName, cloneVal(spec.mutatedValue));
                objModel.setProperty("/" + fieldName, cloneVal(spec.mutatedValue));
                Core.applyChanges();
                if (jsonPlugin) {
                    jsonPlugin.notifyChange();
                }
                if (objPlugin) {
                    objPlugin.notifyChange();
                }

                var outboundStr = jsonHost.getDataJson();
                var outboundObj = JSON.parse(outboundStr);
                var outVal = outboundObj[fieldName];
                var actualJsonType = Array.isArray(outVal) ? "array" : typeof outVal;

                assert.strictEqual(
                    pickerDatePreserved &&
                        actualJsonType === spec.serializesTo &&
                        JSON.stringify(outVal) === JSON.stringify(spec.mutatedValue),
                    true,
                    "[" + key + " dataJson] Outbound dataJson contains mutated value with type '" + spec.serializesTo + "'"
                );

                // 3. JSON.parse(outbound) deep-equals object-binding payload for the same input
                var objBindingPayload = objHost.getData();
                assert.deepEqual(
                    outVal,
                    objBindingPayload[fieldName],
                    "[" + key + " dataJson] JSON.parse(outbound) agrees with object-binding payload"
                );
            });

            jsonHost.destroy();
            objHost.destroy();
            done();
        });
    });

    QUnit.test("Selection & Token Plugins: numeric enum coercion, valueHelp display formatting, and MultiInput tokenUpdate lifecycle", function (assert) {
        var registry = PluginRegistry.getInstance();

        // 1. DropdownPlugin numeric enum coercion
        var dropdownPlugin = registry.getPlugin("number", "select");
        var numModel = new JSONModel({ Priority: 1 });
        var numSelect = dropdownPlugin.render(
            { type: "integer", enum: [1, 2, 3], ui: { widget: "select" } },
            "/Priority",
            "meta",
            "ddNumScope"
        );
        numSelect.setModel(numModel, "meta");
        numSelect.setSelectedKey("3");
        numSelect.fireChange({ selectedItem: numSelect.getItems()[2] });
        assert.strictEqual(numModel.getProperty("/Priority"), 3, "DropdownPlugin coerces integer enum selection to number (3)");
        dropdownPlugin.destroy();
        numModel.destroy();

        // 2. DropdownPlugin read-only valueHelp text mapping
        var roDropdown = registry.getPlugin("string", "select");
        roDropdown.setEditable(false);
        var roModel = new JSONModel({ Country: "NZ" });
        var roText = roDropdown.render(
            {
                type: "string",
                readOnly: true,
                ui: {
                    widget: "select",
                    readOnly: true,
                    valueHelp: [{ key: "NZ", text: "New Zealand" }, { key: "AU", text: "Australia" }]
                }
            },
            "/Country",
            "meta",
            "ddRoScope"
        );
        roText.setModel(roModel, "meta");
        Core.applyChanges();
        assert.strictEqual(roText.getText(), "New Zealand", "DropdownPlugin display mode formats valueHelp key 'NZ' to 'New Zealand'");
        roDropdown.destroy();
        roModel.destroy();

        // 3. MultiSelectPlugin numeric items coercion
        var multiSelectPlugin = registry.getPlugin("array", "multiSelect");
        var msModel = new JSONModel({ Codes: [10] });
        var mcb = multiSelectPlugin.render(
            {
                type: "array",
                items: { type: "integer", enum: [10, 20, 30] },
                ui: { widget: "multiSelect" }
            },
            "/Codes",
            "meta",
            "msNumScope"
        );
        mcb.setModel(msModel, "meta");
        mcb.setSelectedKeys(["10", "30"]);
        mcb.fireSelectionFinish({ selectedItems: [mcb.getItems()[0], mcb.getItems()[2]] });
        assert.deepEqual(msModel.getProperty("/Codes"), [10, 30], "MultiSelectPlugin coerces integer selectedKeys back to number[]");
        multiSelectPlugin.destroy();
        msModel.destroy();

        // 4. MultiInputPlugin token addition & removal with numeric items
        var multiInputPlugin = registry.getPlugin("array", "multiInput");
        var miModel = new JSONModel({ Scores: [100, 200] });
        var mi = multiInputPlugin.render(
            {
                type: "array",
                items: { type: "number" },
                ui: { widget: "multiInput" }
            },
            "/Scores",
            "meta",
            "miNumScope"
        );
        mi.setModel(miModel, "meta");
        Core.applyChanges();
        assert.strictEqual(mi.getTokens().length, 2, "MultiInput renders 2 initial tokens from bound array");
        var firstToken = mi.getTokens()[0];
        mi.fireTokenUpdate({ type: "removed", removedTokens: [firstToken] });
        assert.deepEqual(miModel.getProperty("/Scores"), [200], "MultiInput token removal synchronously updates JSONModel array");
        multiInputPlugin.destroy();
        miModel.destroy();
    });

    QUnit.test("Datasource & Action Plugins: DataSource extraction, Submit/Clear actions, and UrlValidator security", function (assert) {
        var registry = PluginRegistry.getInstance();

        // 1. SubmitFormActionPlugin invokes engineContext.onSubmit on press
        var submitTriggered = false;
        var submitPlugin = registry.getPlugin("string", "submitButton");
        submitPlugin.setEngineContext({
            pluginRegistry: registry,
            getSchemaDefinition: function () { return undefined; },
            getSchemaDefinitions: function () { return undefined; },
            getModel: function () { return undefined; },
            onSubmit: function () { submitTriggered = true; }
        });
        var submitBtn = submitPlugin.render(
            { type: "string", ui: { widget: "submitButton", label: "Send Now" } },
            "/SubmitAction",
            "meta",
            "actSubmitScope"
        );
        submitBtn.firePress();
        assert.strictEqual(submitTriggered, true, "SubmitFormActionPlugin triggers engineContext.onSubmit when pressed");
        submitPlugin.destroy();

        // 2. ClearFormActionPlugin resets typed JSONModel fields
        var clearModel = new JSONModel({
            Name: "Alice",
            Age: 42,
            Active: true,
            Tags: ["a", "b"],
            Details: { city: "Auckland" },
            OptionalVal: null
        });
        var clearPlugin = registry.getPlugin("string", "clearButton");
        var clearBtn = clearPlugin.render(
            { type: "string", ui: { widget: "clearButton", label: "Reset" } },
            "/ClearAction",
            "meta",
            "actClearScope"
        );
        clearBtn.setModel(clearModel, "meta");
        clearBtn.firePress();
        assert.deepEqual(
            clearModel.getData(),
            {
                Name: "",
                Age: null,
                Active: false,
                Tags: [],
                Details: { city: "" },
                OptionalVal: null
            },
            "ClearFormActionPlugin resets string, number, boolean, array, nested object keys, and null model properties cleanly"
        );
        clearPlugin.destroy();
        clearModel.destroy();

        // 3. UrlNavigationActionPlugin & LiveSearchPlugin suggestion selection
        var liveSearchPlugin = registry.getPlugin("string", "liveSearch");
        var lsModel = new JSONModel({ Query: "" });
        var lsInput = liveSearchPlugin.render(
            {
                type: "string",
                ui: {
                    widget: "liveSearch",
                    dataSource: { url: "/mock/search", keyField: "code", textField: "name", dataPath: "data.items" }
                }
            },
            "/Query",
            "meta",
            "lsScope"
        );
        lsInput.setModel(lsModel, "meta");
        var suggestion = new sap.m.SuggestionItem({ key: "NZL", text: "New Zealand" });
        lsInput.fireSuggestionItemSelected({ selectedItem: suggestion });
        assert.strictEqual(lsModel.getProperty("/Query"), "NZL", "LiveSearchPlugin updates JSONModel on suggestionItemSelected");
        suggestion.destroy();
        liveSearchPlugin.destroy();
        lsModel.destroy();

        // 4. UrlValidator.isSafeNavigationUrl & isSafeImageSource security enforcement
        assert.strictEqual(UrlValidator.isSafeNavigationUrl("javascript:alert(1)"), false, "UrlValidator rejects javascript: URI");
        assert.strictEqual(UrlValidator.isSafeNavigationUrl("data:text/html,<script>alert(1)</script>"), false, "UrlValidator rejects data:text/html URI");
        assert.strictEqual(UrlValidator.isSafeNavigationUrl("//evil.com/phish"), false, "UrlValidator rejects protocol-relative //evil.com URI");
        assert.strictEqual(UrlValidator.isSafeNavigationUrl("/\\evil.com/phish"), false, "UrlValidator rejects backslash-relative /\\evil.com URI");
        assert.strictEqual(UrlValidator.isSafeNavigationUrl("https://ui5.sap.com"), true, "UrlValidator accepts https: navigation URL");
        assert.strictEqual(UrlValidator.isSafeNavigationUrl("mailto:support@siliconst.co.nz"), true, "UrlValidator accepts mailto: navigation URL");
        assert.strictEqual(UrlValidator.isSafeNavigationUrl("tel:+6421000"), true, "UrlValidator accepts tel: navigation URL");
        assert.strictEqual(UrlValidator.isSafeNavigationUrl("/local/route"), true, "UrlValidator accepts safe root-relative /local/route");
        assert.strictEqual(UrlValidator.isSafeImageSource("data:image/svg+xml;base64,PHN2Zz4="), false, "UrlValidator.isSafeImageSource rejects SVG data URI");
        assert.strictEqual(UrlValidator.isSafeImageSource("data:image/png;base64,iVBORw0KGgo="), true, "UrlValidator.isSafeImageSource accepts PNG base64 data URI");
    });

    QUnit.test("DictionaryMapPlugin & PolymorphicPlugin: dynamic entry lifecycle, duplicate key validation, and variant switching", function (assert) {
        var registry = PluginRegistry.getInstance();

        // 1. DictionaryMapPlugin: add entry, remove entry, and duplicate key detection
        var dictPlugin = registry.getPlugin("object", "dictionaryMap");
        var dictModel = new JSONModel({
            EnvVars: { HOST: "localhost" }
        });
        dictPlugin.setEngineContext({
            pluginRegistry: registry,
            getSchemaDefinition: function () { return undefined; },
            getSchemaDefinitions: function () { return undefined; },
            getModel: function () { return dictModel; }
        });
        var dictControl = dictPlugin.render(
            {
                type: "object",
                additionalProperties: { type: "string", required: true, minLength: 2 },
                ui: { widget: "dictionaryMap", label: "Environment Variables" }
            },
            "/EnvVars",
            "meta",
            "dictScope"
        );
        dictControl.setModel(dictModel, "meta");
        Core.applyChanges();

        var headerBar = dictControl.getItems()[0];
        var addBtn = headerBar.getItems()[1];
        addBtn.firePress();
        assert.strictEqual(
            Object.keys(dictModel.getProperty("/EnvVars")).length,
            2,
            "DictionaryMapPlugin addEntry adds a new unique key_2 entry to parent JSONModel"
        );
        assert.strictEqual(
            dictPlugin.validate().isValid,
            false,
            "DictionaryMapPlugin validate() catches child minLength violation on newly added empty entry"
        );

        // Update the first entry's value via the live child input control and verify parent JSONModel sync
        var rowsBox = dictControl.getItems()[1];
        var firstRow = rowsBox.getItems()[0];
        var firstValCtrl = firstRow.getItems()[1];
        firstValCtrl.setValue("127.0.0.1");
        firstValCtrl.fireChange({ value: "127.0.0.1" });
        assert.strictEqual(
            dictModel.getProperty("/EnvVars/HOST"),
            "127.0.0.1",
            "DictionaryMapPlugin synchronizes child value control edits back to parent JSONModel"
        );

        var secondRow = rowsBox.getItems()[1];
        var removeBtn = secondRow.getItems()[2];
        removeBtn.firePress();
        assert.deepEqual(
            dictModel.getProperty("/EnvVars"),
            { HOST: "127.0.0.1" },
            "DictionaryMapPlugin removeEntry removes entry and preserves edited parent map"
        );
        assert.strictEqual(dictPlugin.validate().isValid, true, "DictionaryMapPlugin passes validation after removing invalid row");
        dictPlugin.destroy();
        dictModel.destroy();

        // 2. PolymorphicPlugin: variant detection, switching, discriminator & const auto-population, and label association
        var polyPlugin = registry.getPlugin("object", "polymorphic");
        var polyModel = new JSONModel({
            Payment: { method: "card", cardNumber: "4111222233334444" }
        });
        polyPlugin.setEngineContext({
            pluginRegistry: registry,
            getSchemaDefinition: function () { return undefined; },
            getSchemaDefinitions: function () { return undefined; },
            getModel: function () { return polyModel; }
        });
        var polyBox = polyPlugin.render(
            {
                type: "object",
                discriminator: { propertyName: "method" },
                oneOf: [
                    {
                        title: "Credit Card",
                        properties: {
                            method: { type: "string", const: "card" },
                            cardNumber: { type: "string", minLength: 12 }
                        },
                        required: ["cardNumber"]
                    },
                    {
                        title: "Bank Transfer",
                        properties: {
                            method: { type: "string", const: "bank" },
                            iban: { type: "string", minLength: 10, default: "DE89370400440532013000" }
                        },
                        required: ["iban"]
                    }
                ],
                ui: { widget: "polymorphic" }
            },
            "/Payment",
            "meta",
            "polyScope",
            function () {},
            polyModel
        );
        polyBox.setModel(polyModel, "meta");
        var variantSelect = polyBox.getItems()[0];
        assert.strictEqual(variantSelect.getSelectedKey(), "card", "PolymorphicPlugin detects initial 'card' variant");
        assert.strictEqual(polyPlugin.validate().isValid, true, "Initial 'card' variant passes validation");

        // Switch to 'bank' variant
        variantSelect.setSelectedKey("bank");
        variantSelect.fireChange({ selectedItem: variantSelect.getItems()[1] });
        assert.strictEqual(polyModel.getProperty("/Payment/method"), "bank", "Switching variant updates discriminator property to 'bank'");
        assert.strictEqual(
             polyModel.getProperty("/Payment/iban"),
            "DE89370400440532013000",
            "Switching variant populates default value on new branch property"
        );
        polyPlugin.destroy();
        polyModel.destroy();

        // 3. ObjectPlugin, ArrayPlugin & ReferencePlugin: dialogButtonText, readOnly button state, and recursive PayloadValidator
        var objPlugin = registry.getPlugin("object");
        var objModel = new JSONModel({ Address: { Street: "" } });
        var objBtn = objPlugin.render(
            {
                type: "object",
                required: ["Street"],
                properties: { Street: { type: "string", required: true, minLength: 3 } },
                ui: { label: "Address", dialogButtonText: "Configure Address" }
            },
            "/Address",
            "meta",
            "objModalScope"
        );
        objBtn.setModel(objModel, "meta");
        assert.strictEqual(objBtn.getText(), "Configure Address", "ObjectPlugin honors custom ui.dialogButtonText");
        assert.strictEqual(objPlugin.validate().isValid, false, "ObjectPlugin recursively validates nested required property");
        objModel.setProperty("/Address/Street", "100 Queen St");
        assert.strictEqual(objPlugin.validate().isValid, true, "ObjectPlugin passes validation when nested property is valid");
        objPlugin.destroy();
        objModel.destroy();
    });

    QUnit.test("Hardware Controls, Display Mode Formatting, and UI Directives (visibleOn, enabledOn, controlProps, description, valueState)", function (assert) {
        var registry = PluginRegistry.getInstance();

        // 1. PasswordPlugin display mode masks password as ********
        var pwdPlugin = registry.getPlugin("string", "password");
        pwdPlugin.setEditable(false);
        var pwdModel = new JSONModel({ Secret: "TopSecret123" });
        var pwdText = pwdPlugin.render(
            { type: "string", ui: { widget: "password" } },
            "/Secret",
            "meta",
            "pwdDispScope"
        );
        pwdText.setModel(pwdModel, "meta");
        Core.applyChanges();
        assert.strictEqual(pwdText.getText(), "********", "PasswordPlugin masks value as ******** in display mode");
        pwdPlugin.destroy();
        pwdModel.destroy();

        // 2. GeolocationPlugin display mode formats { lat, lng }
        var geoPlugin = registry.getPlugin("object", "location");
        geoPlugin.setEditable(false);
        var geoModel = new JSONModel({ Coords: { lat: -36.8485, lng: 174.7633 } });
        var geoText = geoPlugin.render(
            { type: "object", ui: { widget: "location" } },
            "/Coords",
            "meta",
            "geoDispScope"
        );
        geoText.setModel(geoModel, "meta");
        Core.applyChanges();
        assert.strictEqual(geoText.getText(), "Lat: -36.8485, Lng: 174.7633", "GeolocationPlugin formats { lat, lng } in display mode");
        geoPlugin.destroy();
        geoModel.destroy();

        // 3. BarcodeScannerPlugin hides scanner button when readOnly is toggled
        var scanPlugin = registry.getPlugin("string", "scanner");
        var scanBox = scanPlugin.render(
            { type: "string", ui: { widget: "scanner" } },
            "/Barcode",
            "meta",
            "scanScope"
        );
        assert.strictEqual(scanBox.getItems()[1].getVisible(), true, "BarcodeScannerButton is visible when editable");
        scanPlugin.applyEditable(false);
        assert.strictEqual(scanBox.getItems()[1].getVisible(), false, "BarcodeScannerButton hides when applyEditable(false) is called");
        scanPlugin.destroy();

        // 4. CameraPlugin & LinkPlugin reject unsafe javascript: URLs and do not fire capture on programmatic setValue
        var camCaptureFired = 0;
        var camPlugin = registry.getPlugin("string", "camera");
        var camCtrl = camPlugin.render(
            { type: "string", ui: { widget: "camera" } },
            "/Snap",
            "meta",
            "camSafeScope",
            function () { camCaptureFired++; }
        );
        camCtrl.setValue("javascript:alert(1)");
        assert.strictEqual(camCtrl.imagePreview.getSrc(), "", "CameraControl rejects unsafe javascript: image source");
        camCtrl.setValue("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=");
        assert.strictEqual(camCtrl.imagePreview.getVisible(), true, "CameraControl accepts valid data:image/png;base64 source");
        assert.strictEqual(camCaptureFired, 0, "CameraControl.setValue() does not fire spurious capture events during model sync");
        camPlugin.destroy();

        // 4b. DatePlugin, DateTimePlugin, TimePlugin & NumberPlugin reject unparseable user input
        var dpPlugin = registry.getPlugin("date");
        var dpCtrl = dpPlugin.render({ type: "date" }, "/BirthDate", "meta", "dpParseScope");
        dpCtrl.fireChange({ value: "not-a-date", valid: false });
        assert.strictEqual(dpPlugin.validate().isValid, false, "DatePlugin rejects unparseable date string (valid=false)");
        dpCtrl.fireChange({ value: "2026-10-22", valid: true });
        assert.strictEqual(dpPlugin.validate().isValid, true, "DatePlugin clears parse error when valid=true");
        dpPlugin.destroy();

        var dtpPlugin = registry.getPlugin("string", "datetime");
        var dtpCtrl = dtpPlugin.render({ type: "string", ui: { widget: "datetime" } }, "/Timestamp", "meta", "dtpParseScope");
        dtpCtrl.fireChange({ value: "bad-ts", valid: false });
        assert.strictEqual(dtpPlugin.validate().isValid, false, "DateTimePlugin rejects unparseable datetime string (valid=false)");
        dtpCtrl.fireChange({ value: "2026-10-22T10:00:00Z", valid: true });
        assert.strictEqual(dtpPlugin.validate().isValid, true, "DateTimePlugin clears parse error when valid=true");
        dtpPlugin.destroy();

        var tpPlugin = registry.getPlugin("string", "time");
        var tpCtrl = tpPlugin.render({ type: "string", ui: { widget: "time" } }, "/StartTime", "meta", "tpParseScope");
        tpCtrl.fireChange({ value: "bad-time", valid: false });
        assert.strictEqual(tpPlugin.validate().isValid, false, "TimePlugin rejects unparseable time string (valid=false)");
        tpCtrl.fireChange({ value: "12:30:00", valid: true });
        assert.strictEqual(tpPlugin.validate().isValid, true, "TimePlugin clears parse error when valid=true");
        tpPlugin.destroy();

        var numFmtPlugin = registry.getPlugin("number");
        var numFmtModel = new JSONModel({ Amount: 100 });
        var numFmtCtrl = numFmtPlugin.render(
            { type: "number", ui: { formatter: "currency" } },
            "/Amount",
            "meta",
            "numFmtScope",
            function () {},
            numFmtModel
        );
        numFmtCtrl.setModel(numFmtModel, "meta");
        Core.applyChanges();
        numFmtCtrl.setValue("250.75");
        numFmtCtrl.fireChange({ value: "250.75" });
        assert.strictEqual(numFmtModel.getProperty("/Amount"), 250.75, "NumberPlugin with ui.formatter writes parsed numeric value back to JSONModel on user change");
        numFmtPlugin.destroy();
        numFmtModel.destroy();

        // 5. ControlDirectiveUtil: description tooltip, valueState, visibleOn, enabledOn, controlProps
        var strPlugin = registry.getPlugin("string");
        var dirModel = new JSONModel({ ShowField: false, EnableField: true, DynamicPh: "Type here", Code: "ABC" });
        var strCtrl = strPlugin.render(
            {
                type: "string",
                description: "Tooltip from schema description",
                ui: {
                    valueState: "Warning",
                    visibleOn: "{= ${/ShowField} === true }",
                    enabledOn: "{= ${/EnableField} === true }",
                    controlProps: {
                        showClearIcon: true,
                        placeholder: "{/DynamicPh}",
                        value: "HACKED",
                        editable: false
                    }
                }
            },
            "/Code",
            "meta",
            "dirScope"
        );
        strCtrl.setModel(dirModel, "meta");
        Core.applyChanges();
        assert.strictEqual(strCtrl.getTooltip(), "Tooltip from schema description", "Schema description sets control tooltip");
        assert.strictEqual(strCtrl.getValueState(), "Warning", "ui.valueState sets initial ValueState");
        assert.strictEqual(strCtrl.getVisible(), false, "ui.visibleOn hides control when ShowField is false");
        assert.strictEqual(strCtrl.getPlaceholder(), "Type here", "ui.controlProps binds expression/model path to placeholder");
        assert.strictEqual(strCtrl.getValue(), "ABC", "ui.controlProps blocks illegal override of core 'value' binding");
        assert.strictEqual(strCtrl.getEditable(), true, "ui.controlProps blocks illegal override of 'editable'");
        dirModel.setProperty("/ShowField", true);
        Core.applyChanges();
        assert.strictEqual(strCtrl.getVisible(), true, "ui.visibleOn reveals control when ShowField becomes true");
        strPlugin.destroy();
        dirModel.destroy();

        // 6. StepInputPlugin untouched undefined/null model value handling & RichTextControl HTML sanitization
        var stepPlugin = registry.getPlugin("number", "step");
        var stepModel = new JSONModel({ TouchCount: undefined });
        var stepCtrl = stepPlugin.render(
            { type: "number", required: true, minimum: 1, ui: { widget: "step" } },
            "/TouchCount",
            "meta",
            "stepNullScope"
        );
        stepCtrl.setModel(stepModel, "meta");
        Core.applyChanges();
        assert.strictEqual(stepPlugin.validate().isValid, false, "StepInputPlugin rejects untouched undefined value when required: true");
        stepCtrl.setValue(5);
        stepCtrl.fireChange({ value: 5 });
        assert.strictEqual(stepModel.getProperty("/TouchCount"), 5, "StepInputPlugin writes value to JSONModel on change");
        assert.strictEqual(stepPlugin.validate().isValid, true, "StepInputPlugin passes validation after user sets valid value");
        stepPlugin.destroy();
        stepModel.destroy();

        var rtPlugin = registry.getPlugin("string", "richText");
        var rtCtrl = rtPlugin.render({ type: "string", ui: { widget: "richText" } }, "/Bio", "meta", "rtSanitizeScope");
        rtCtrl.setValue("<p onclick=\"alert(1)\">Safe</p><script>evil()</script>");
        var sanitizedVal = rtCtrl.getProperty("value");
        assert.strictEqual(
            sanitizedVal.indexOf("<script>") === -1 && sanitizedVal.indexOf("onclick") === -1,
            true,
            "RichTextControl sanitizes <script> tags and inline on* attributes in fallback mode"
        );
        rtPlugin.destroy();
    });

    QUnit.test("Presentational vs Transforming Formatters (13.11.1 & 13.11.3): phone, currency, date keep raw model values and pass validation while textCase writes transformed value and edits persist via triggerSubmit/outputData", function (assert) {
        var done = assert.async();
        var registry = PluginRegistry.getInstance();
        var sandboxId = "sandbox-formatter-parse";
        createPhysicalSandbox(sandboxId);

        // 1. phone (presentational): pattern ^\d{10}$ + maxLength 10 + formatter "phone"
        var phonePlugin = registry.getPlugin("string");
        var phoneModel = new JSONModel({ Mobile: "5550000000" });
        var phoneMeta = {
            type: "string",
            pattern: "^\\d{10}$",
            maxLength: 10,
            ui: { label: "Mobile", formatter: "phone" }
        };
        var phoneCtrl = phonePlugin.render(phoneMeta, "/Mobile", "meta", "fmtPhoneScope", function () {}, phoneModel);
        phoneCtrl.setModel(phoneModel, "meta");
        phoneCtrl.placeAt(sandboxId);
        Core.applyChanges();

        phoneCtrl.setValue("5551234567");
        phoneCtrl.fireChange({ value: "5551234567" });
        // Also simulate a subsequent change/blur when the control already displays the formatted string
        phoneCtrl.fireChange({ value: phoneCtrl.getValue() });
        assert.strictEqual(
            phoneModel.getProperty("/Mobile"),
            "5551234567",
            "[phone] Model holds raw value '5551234567', not formatted display text"
        );
        assert.strictEqual(
            phonePlugin.validate().isValid,
            true,
            "[phone] plugin.validate().isValid is true against raw pattern ^\\d{10}$ and maxLength 10"
        );
        assert.strictEqual(
            phoneCtrl.getValue(),
            "(555) 123-4567",
            "[phone] Control still displays formatted phone number '(555) 123-4567'"
        );
        phonePlugin.destroy();
        phoneModel.destroy();

        // 2. currency (presentational): type "number" + minimum/maximum + formatter "currency"
        var currPlugin = registry.getPlugin("number");
        var currModel = new JSONModel({ CurrencyVal: 100 });
        var currMeta = {
            type: "number",
            minimum: 100,
            maximum: 5000,
            ui: { label: "Currency Formatter", formatter: "currency" }
        };
        var currCtrl = currPlugin.render(currMeta, "/CurrencyVal", "meta", "fmtCurrScope", function () {}, currModel);
        currCtrl.setModel(currModel, "meta");
        currCtrl.placeAt(sandboxId);
        Core.applyChanges();

        currCtrl.setValue("1234.56");
        currCtrl.fireChange({ value: "1234.56" });
        // Also simulate editing the formatted currency string directly in the input
        currCtrl.setValue("$1,234.56");
        currCtrl.fireChange({ value: "$1,234.56" });
        assert.strictEqual(
            currModel.getProperty("/CurrencyVal"),
            1234.56,
            "[currency] Model holds numeric 1234.56 (typeof number), not formatted string '$1,234.56'"
        );
        assert.strictEqual(
            currPlugin.validate().isValid,
            true,
            "[currency] plugin.validate().isValid is true for numeric value 1234.56"
        );
        assert.strictEqual(
            currCtrl.getValue(),
            GlobalPipeline.runFormatters(1234.56, ["currency"]),
            "[currency] Control still displays formatted currency text"
        );
        currPlugin.destroy();
        currModel.destroy();

        // 3. date (presentational): pattern ^\d{4}-\d{2}-\d{2}$ + maxLength 10 + formatter "date"
        var datePlugin = registry.getPlugin("string");
        var dateModel = new JSONModel({ EventDate: "2026-01-01" });
        var dateMeta = {
            type: "string",
            pattern: "^\\d{4}-\\d{2}-\\d{2}$",
            maxLength: 10,
            ui: { label: "Event Date", formatter: "date" }
        };
        var dateCtrl = datePlugin.render(dateMeta, "/EventDate", "meta", "fmtDateScope", function () {}, dateModel);
        dateCtrl.setModel(dateModel, "meta");
        dateCtrl.placeAt(sandboxId);
        Core.applyChanges();

        var expectedFormattedDate = GlobalPipeline.runFormatters("2026-10-15", ["date"]);
        dateCtrl.setValue("2026-10-15");
        dateCtrl.fireChange({ value: "2026-10-15" });
        dateCtrl.fireChange({ value: dateCtrl.getValue() });
        assert.strictEqual(
            dateModel.getProperty("/EventDate"),
            "2026-10-15",
            "[date] Model holds raw ISO date '2026-10-15', not formatted medium date"
        );
        assert.strictEqual(
            datePlugin.validate().isValid,
            true,
            "[date] plugin.validate().isValid is true against ISO pattern and maxLength 10"
        );
        assert.strictEqual(
            dateCtrl.getValue(),
            expectedFormattedDate,
            "[date] Control still displays formatted medium date ('" + expectedFormattedDate + "')"
        );
        datePlugin.destroy();
        dateModel.destroy();

        // 4. textCase (transforming): transformed uppercase value IS written to the model
        var tcPlugin = registry.getPlugin("string");
        var tcModel = new JSONModel({ Code: "init" });
        var tcMeta = {
            type: "string",
            pattern: "^[A-Z\\s]+$",
            ui: { label: "Code", formatter: "textCase" }
        };
        var tcCtrl = tcPlugin.render(tcMeta, "/Code", "meta", "fmtTcScope", function () {}, tcModel);
        tcCtrl.setModel(tcModel, "meta");
        tcCtrl.placeAt(sandboxId);
        Core.applyChanges();

        tcCtrl.setValue("hello world");
        tcCtrl.fireChange({ value: "hello world" });
        assert.strictEqual(
            tcModel.getProperty("/Code"),
            "HELLO WORLD",
            "[textCase] Transforming formatter writes uppercase 'HELLO WORLD' to the model"
        );
        assert.strictEqual(
            tcPlugin.validate().isValid,
            true,
            "[textCase] plugin.validate().isValid is true against uppercase pattern"
        );
        assert.strictEqual(
            tcCtrl.getValue(),
            "HELLO WORLD",
            "[textCase] Control displays transformed 'HELLO WORLD'"
        );
        tcPlugin.destroy();
        tcModel.destroy();

        // 5. 13.11.3: Edit persistence through DynamicHost (triggerSubmit & outputData) under liveUpdate: false and liveUpdate: true
        var hostSchema = {
            type: "object",
            properties: {
                Mobile: { type: "string", pattern: "^\\d{10}$", maxLength: 10, ui: { label: "Mobile", formatter: "phone" } },
                CurrencyVal: { type: "number", minimum: 100, maximum: 5000, ui: { label: "Currency", formatter: "currency" } },
                EventDate: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$", maxLength: 10, ui: { label: "Date", formatter: "date" } },
                Code: { type: "string", pattern: "^[A-Z\\s]+$", ui: { label: "Code", formatter: "textCase" } }
            }
        };
        var initialHostData = {
            Mobile: "5550000000",
            CurrencyVal: 100,
            EventDate: "2026-01-01",
            Code: "INITIAL"
        };
        var expectedEditedPayload = {
            Mobile: "5551234567",
            CurrencyVal: 1234.56,
            EventDate: "2026-10-15",
            Code: "HELLO WORLD"
        };

        var txBoxId = "sandbox-fmt-host-tx";
        var liveBoxId = "sandbox-fmt-host-live";
        createPhysicalSandbox(txBoxId);
        createPhysicalSandbox(liveBoxId);

        var txHost = new DynamicHost({
            schemaDefinition: cloneVal(hostSchema),
            data: cloneVal(initialHostData),
            liveUpdate: false
        });
        var liveHost = new DynamicHost({
            schemaDefinition: cloneVal(hostSchema),
            data: cloneVal(initialHostData),
            liveUpdate: true
        });
        txHost.placeAt(txBoxId);
        liveHost.placeAt(liveBoxId);
        Core.applyChanges();

        Promise.all([txHost.generate(), liveHost.generate()]).then(function () {
            Core.applyChanges();

            [
                { mode: "liveUpdate=false", host: txHost },
                { mode: "liveUpdate=true", host: liveHost }
            ].forEach(function (entry) {
                var h = entry.host;
                var eng = h._innerHost.engine;
                var mCtrl = eng.getPluginByPath("Mobile").control;
                var cCtrl = eng.getPluginByPath("CurrencyVal").control;
                var dCtrl = eng.getPluginByPath("EventDate").control;
                var tCtrl = eng.getPluginByPath("Code").control;

                mCtrl.setValue("5551234567");
                mCtrl.fireChange({ value: "5551234567" });
                cCtrl.setValue("$1,234.56");
                cCtrl.fireChange({ value: "$1,234.56" });
                dCtrl.setValue("2026-10-15");
                dCtrl.fireChange({ value: "2026-10-15" });
                tCtrl.setValue("hello world");
                tCtrl.fireChange({ value: "hello world" });
                Core.applyChanges();

                var submittedPayload = null;
                h.attachSubmit(function (oEv) {
                    submittedPayload = oEv.getParameter("payload");
                });
                var submitOk = h.triggerSubmit();
                assert.strictEqual(
                    submitOk,
                    true,
                    "[" + entry.mode + "] triggerSubmit() succeeds after editing formatted fields"
                );
                assert.deepEqual(
                    submittedPayload,
                    expectedEditedPayload,
                    "[" + entry.mode + "] submit event payload contains raw phone/currency/date values and transformed textCase value"
                );
                assert.deepEqual(
                    h.getProperty("outputData"),
                    expectedEditedPayload,
                    "[" + entry.mode + "] getProperty('outputData') returns persisted edited values"
                );
            });

            txHost.destroy();
            liveHost.destroy();
            done();
        });
    });
});
