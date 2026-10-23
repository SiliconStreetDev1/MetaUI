sap.ui.define([
    "metaui/sandbox/test/TestOracle",
    "nz/co/siliconst/ui5/metaui/plugins/controls/BasePlugin",
    "nz/co/siliconst/ui5/metaui/plugins/controls/SingleBoundWidgetPlugin",
    "nz/co/siliconst/ui5/metaui/plugins/controls/OptionListPlugin",
    "nz/co/siliconst/ui5/metaui/plugins/actions/ActionButtonPlugin",
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
    "sap/m/Token",
    "sap/m/library",
    "sap/ui/core/Core"
], function (
    TestOracle,
    BasePluginMod,
    SingleBoundWidgetPluginMod,
    OptionListPluginMod,
    ActionButtonPluginMod,
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
    Token,
    mobileLibrary,
    Core
) {
    "use strict";

    var BasePlugin = BasePluginMod.BasePlugin;
    var SingleBoundWidgetPlugin = SingleBoundWidgetPluginMod.SingleBoundWidgetPlugin;
    var OptionListPlugin = OptionListPluginMod.OptionListPlugin;
    var ActionButtonPlugin = ActionButtonPluginMod.ActionButtonPlugin;
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

            // 4. Control is not interactive.
            //    The old final branch asserted `typeof dispControl.setValue === "undefined"`, which
            //    is a fixed SAPUI5 API fact for sap.m.Text / FormattedText / Image / MessageStrip
            //    and is already implied by assertion 1 above, so no plugin defect could ever fail
            //    it. Both checks below read the control's actual rendered DOM instead.
            var writableSelector =
                "input:not([type=hidden]):not([disabled]):not([readonly])," +
                "textarea:not([disabled]):not([readonly])," +
                "select:not([disabled])," +
                '[contenteditable="true"],[contenteditable=""]';
            var interactiveSelector = "input,textarea,select,button,[contenteditable]";
            var describeEls = function (els) {
                return els
                    .map(function (el) {
                        var cls = String(el.className || "").split(" ")[0];
                        return el.tagName.toLowerCase() + (cls ? "." + cls : "");
                    })
                    .join(", ");
            };
            var writableEls = dispDom ? Array.prototype.slice.call(dispDom.querySelectorAll(writableSelector)) : [];

            if (typeof dispControl.getEditable === "function") {
                assert.strictEqual(dispControl.getEditable(), false, "[" + key + " display] Display control getEditable() is false");
            } else if (spec.displaySameAsEdit && typeof dispControl.getEnabled === "function") {
                // Navigation affordances (nested payload triggers, hyperlinks, and the URL button, which opens
                // a target and mutates nothing) stay clickable in display mode: read-only constrains the dialog
                // and the bound value, not the ability to reach them. The mutating action buttons (submit,
                // clear) remain disabled.
                var staysReachable =
                    key === "array" ||
                    key === "object" ||
                    key === "object:reference" ||
                    key === "string:link" ||
                    key === "string:urlButton";
                assert.strictEqual(
                    dispControl.getEnabled(),
                    staysReachable,
                    "[" + key + " display] Display control getEnabled() is " + staysReachable
                );
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
            } else {
                // Pure display controls (sap.m.Text / FormattedText / Image / MessageStrip and any
                // future equivalent): the rendered subtree must contain no interactive element at
                // all, which fails if a plugin ever renders its edit control here.
                var interactiveEls = dispDom
                    ? Array.prototype.slice.call(dispDom.querySelectorAll(interactiveSelector))
                    : [];
                assert.strictEqual(
                    interactiveEls.length,
                    0,
                    "[" + key + " display] Display control (" + actualClass + ") renders no interactive element (found: " + describeEls(interactiveEls) + ")"
                );
            }

            // 4b. Whichever branch verified the control's own state, nothing in the rendered
            //     subtree may still accept typing. This catches an edit control leaking into a
            //     display-mode container (dictionary values, polymorphic children, uploader input).
            assert.strictEqual(
                writableEls.length,
                0,
                "[" + key + " display] Rendered DOM exposes no enabled, writable element (found: " + describeEls(writableEls) + ")"
            );

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

        // 3. CameraPlugin & LinkPlugin reject unsafe javascript: URLs and do not fire capture on programmatic setValue
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

    function makeHardeningEngine(registry, model, refDefinition) {
        var engine = new Engine(true, false, registry);
        engine.activeModel = model;
        engine.host = {
            activeModelName: "meta",
            getSchemaDefinition: function () { return refDefinition || null; },
            getSchemaDefinitions: function () { return refDefinition ? { MockReference: refDefinition } : {}; }
        };
        engine.onChange = function () { return undefined; };
        return engine;
    }

    QUnit.test("Plugin hardening: ui.expandable restores the full-screen editor dialog on textArea and codeEditor", function (assert) {
        var done = assert.async();
        var registry = PluginRegistry.getInstance();
        var schema = SchemaNormalizer.normalize({
            type: "object",
            properties: {
                Plain: { type: "string", ui: { label: "Plain", widget: "textArea", rows: 3 } },
                Notes: { type: "string", ui: { label: "Notes", widget: "textArea", rows: 3, expandable: true } },
                Source: { type: "string", ui: { label: "Source", widget: "codeEditor", expandable: true } }
            }
        });

        registry.preloadDependencies(schema).then(function () {
            var sandboxId = "sandbox-hardening-expandable";
            createPhysicalSandbox(sandboxId);
            var model = new JSONModel({ Plain: "a\nb", Notes: "a\nb", Source: "{ \"a\": 1 }" });

            var plainPlugin = registry.getPlugin("string", "textArea");
            var plainCtrl = plainPlugin.render(schema.properties.Plain, "/Plain", "meta", "expPlain", function () {}, model);
            assert.strictEqual(
                plainCtrl.getMetadata().getName(),
                "sap.m.TextArea",
                "[expandable] Without ui.expandable the textArea stays a bare sap.m.TextArea (default rendering unchanged)"
            );

            var taPlugin = registry.getPlugin("string", "textArea");
            var taCtrl = taPlugin.render(schema.properties.Notes, "/Notes", "meta", "expNotes", function () {}, model);
            taCtrl.setModel(model, "meta");
            taCtrl.placeAt(sandboxId);
            Core.applyChanges();
            assert.strictEqual(
                taCtrl.getMetadata().getName(),
                "sap.m.HBox",
                "[expandable textArea] ui.expandable wraps the editor in an sap.m.HBox"
            );
            var taItems = typeof taCtrl.getItems === "function" ? taCtrl.getItems() : [];
            assert.strictEqual(
                taItems.length === 2 &&
                    taItems[0].getMetadata().getName() === "sap.m.TextArea" &&
                    taItems[1].getIcon() === "sap-icon://full-screen",
                true,
                "[expandable textArea] HBox holds [sap.m.TextArea, full-screen Button]"
            );
            assert.strictEqual(
                taItems.length === 2 && taPlugin.mainControl === taItems[0],
                true,
                "[expandable textArea] mainControl stays the editor so state and validation still target it"
            );

            if (taItems.length === 2) {
                taItems[1].firePress();
            }
            var taDeps = taCtrl.getDependents();
            var taDialog = taDeps.length > 0 ? taDeps[0] : null;
            assert.strictEqual(
                taDeps.length === 1 && taDeps[0].getMetadata().getName() === "sap.m.Dialog",
                true,
                "[expandable textArea] Pressing the expand button adds a dependent sap.m.Dialog"
            );
            assert.strictEqual(
                Boolean(taDialog) &&
                    taDialog.getContentWidth() === "80%" &&
                    taDialog.getContentHeight() === "80%" &&
                    taDialog.getResizable(),
                true,
                "[expandable textArea] Expand dialog is a resizable 80% x 80% modal"
            );
            assert.strictEqual(
                taDialog && taDialog.getContent().length > 0
                    ? taDialog.getContent()[0].getMetadata().getName()
                    : "<no expand dialog>",
                "sap.m.TextArea",
                "[expandable textArea] Expand dialog hosts a second sap.m.TextArea on the same binding"
            );
            if (taDialog) {
                taDialog.destroy();
            }

            var cePlugin = registry.getPlugin("string", "codeEditor");
            var ceCtrl = cePlugin.render(schema.properties.Source, "/Source", "meta", "expSource", function () {}, model);
            ceCtrl.setModel(model, "meta");
            assert.strictEqual(
                ceCtrl.getMetadata().getName(),
                "sap.m.HBox",
                "[expandable codeEditor] ui.expandable wraps the editor in an sap.m.HBox"
            );
            var ceItems = typeof ceCtrl.getItems === "function" ? ceCtrl.getItems() : [];
            assert.strictEqual(
                ceItems.length === 2 &&
                    ceItems[0].getMetadata().getName() === "sap.ui.codeeditor.CodeEditor" &&
                    ceItems[1].getIcon() === "sap-icon://full-screen",
                true,
                "[expandable codeEditor] HBox holds [sap.ui.codeeditor.CodeEditor, full-screen Button]"
            );
            assert.strictEqual(
                ceItems.length === 2 && cePlugin.mainControl === ceItems[0],
                true,
                "[expandable codeEditor] mainControl stays the editor so state and validation still target it"
            );

            taPlugin.destroy();
            cePlugin.destroy();
            plainPlugin.destroy();
            model.destroy();
            done();
        });
    });

    QUnit.test("Plugin hardening: codeEditor honours ui.rows for height, ui.args for language, and renders a read-only editor in display mode", function (assert) {
        var done = assert.async();
        var registry = PluginRegistry.getInstance();
        var sampleCode = "function test() {\n    return true;\n}";
        var schema = SchemaNormalizer.normalize({
            type: "object",
            properties: {
                Defaults: { type: "string", ui: { label: "Defaults", widget: "codeEditor" } },
                Sized: { type: "string", ui: { label: "Sized", widget: "codeEditor", rows: 10, args: "javascript" } },
                Shown: { type: "string", ui: { label: "Shown", widget: "codeEditor", rows: 6 } }
            }
        });

        registry.preloadDependencies(schema).then(function () {
            var model = new JSONModel({ Defaults: sampleCode, Sized: sampleCode, Shown: sampleCode });

            var defPlugin = registry.getPlugin("string", "codeEditor");
            var defCtrl = defPlugin.render(schema.properties.Defaults, "/Defaults", "meta", "ceDef", function () {}, model);
            assert.strictEqual(
                defCtrl.getHeight() === "250px" && defCtrl.getType() === "json",
                true,
                "[codeEditor] Without ui.rows / ui.args the editor keeps its 250px json defaults"
            );

            var sizedPlugin = registry.getPlugin("string", "codeEditor");
            var sizedCtrl = sizedPlugin.render(schema.properties.Sized, "/Sized", "meta", "ceSized", function () {}, model);
            assert.strictEqual(
                sizedCtrl.getHeight(),
                "200px",
                "[codeEditor] ui.rows: 10 sizes the editor to 200px, matching the row directive TextAreaPlugin honours"
            );
            assert.strictEqual(
                sizedCtrl.getType(),
                "javascript",
                "[codeEditor] ui.args selects the Ace language mode"
            );

            var dispPlugin = registry.getPlugin("string", "codeEditor");
            dispPlugin.setEditable(false);
            var dispCtrl = dispPlugin.render(schema.properties.Shown, "/Shown", "meta", "ceDisp", function () {}, model);
            dispCtrl.setModel(model, "meta");
            assert.strictEqual(
                dispCtrl.getMetadata().getName(),
                "sap.ui.codeeditor.CodeEditor",
                "[codeEditor display] Display mode renders a CodeEditor, not the single-line sap.m.Text it inherited"
            );
            assert.strictEqual(
                typeof dispCtrl.getEditable === "function" && dispCtrl.getEditable() === false,
                true,
                "[codeEditor display] Display-mode CodeEditor is not editable"
            );
            assert.strictEqual(
                typeof dispCtrl.getValue === "function" ? dispCtrl.getValue() : "",
                sampleCode,
                "[codeEditor display] Display-mode CodeEditor shows the bound multi-line source verbatim"
            );
            assert.strictEqual(
                typeof dispCtrl.getHeight === "function" ? dispCtrl.getHeight() : "",
                "128px",
                "[codeEditor display] Display-mode CodeEditor honours ui.rows for its height"
            );

            defPlugin.destroy();
            sizedPlugin.destroy();
            dispPlugin.destroy();
            model.destroy();
            done();
        });
    });

    QUnit.test("Plugin hardening: CompactLayout renders an inline array table at its declared position instead of hoisting it to the root", function (assert) {
        var done = assert.async();
        var registry = PluginRegistry.getInstance();
        var compactSchema = SchemaNormalizer.normalize({
            type: "object",
            title: "Compact Row",
            uiLayout: [
                {
                    type: "HorizontalLayout",
                    elements: [
                        { type: "Control", scope: "#/properties/Lines" },
                        { type: "Control", scope: "#/properties/Note" }
                    ]
                }
            ],
            properties: {
                Lines: { type: "array", items: { type: "object", properties: { Sku: { type: "string" } } } },
                Note: { type: "string", ui: { label: "Note" } }
            }
        });

        registry.preloadDependencies(compactSchema).then(function () {
            sap.ui.require(["nz/co/siliconst/ui5/metaui/layouts/CompactLayout"], function (CompactLayoutMod) {
                var CompactLayout = CompactLayoutMod.CompactLayout;
                var sandboxId = "sandbox-hardening-compact";
                createPhysicalSandbox(sandboxId);
                var model = new JSONModel({ Lines: [{ Sku: "A-1" }], Note: "Hello" });
                var engine = makeHardeningEngine(registry, model);

                var container = new CompactLayout().render(compactSchema, "meta", engine);
                container.setModel(model, "meta");
                container.placeAt(sandboxId);
                Core.applyChanges();

                assert.strictEqual(
                    container.getItems().length,
                    1,
                    "[compact] Root container holds only the declared HorizontalLayout row (no hoisted table appended after the walk)"
                );
                var row = container.getItems()[0];
                assert.strictEqual(
                    row.getMetadata().getName(),
                    "sap.m.HBox",
                    "[compact] The single root item is the HorizontalLayout row"
                );
                var rowItems = typeof row.getItems === "function" ? row.getItems() : [];
                assert.strictEqual(
                    rowItems.length,
                    2,
                    "[compact] Both declared elements render inside the row"
                );
                assert.strictEqual(
                    rowItems.length > 0 ? rowItems[0].getMetadata().getName() : "<empty row>",
                    "sap.m.Table",
                    "[compact] The inline array table keeps its declared index 0 inside the row"
                );
                assert.strictEqual(
                    rowItems.length > 0 && typeof rowItems[0].getColumns === "function"
                        ? rowItems[0].getColumns().length
                        : -1,
                    1,
                    "[compact] The inline array table rendered its item columns"
                );

                container.destroy();
                model.destroy();
                done();
            });
        });
    });

    QUnit.test("Plugin hardening: nested dialog sub-schemas carry metadata.ui so labelSpan, controlProps and layoutBudget survive renderMode dialog", function (assert) {
        var registry = PluginRegistry.getInstance();
        var refDefinition = SchemaNormalizer.normalize({
            type: "object",
            properties: { NestedString: { type: "string" } }
        });
        var sharedUi = { labelSpan: 3, layoutBudget: 40, controlProps: { columnsXL: 2 } };

        var objPlugin = registry.getPlugin("object");
        var objDescriptor = objPlugin.buildDialogDescriptor({
            type: "object",
            properties: { Street: { type: "string" } },
            ui: JSON.parse(JSON.stringify(sharedUi))
        });
        assert.strictEqual(
            objDescriptor.subSchema.ui && objDescriptor.subSchema.ui.labelSpan === 3 &&
                objDescriptor.subSchema.ui.layoutBudget === 40 &&
                objDescriptor.subSchema.ui.controlProps.columnsXL === 2,
            true,
            "[dialog ui] ObjectPlugin forwards ui.labelSpan, ui.layoutBudget and ui.controlProps onto the modal sub-schema"
        );

        var arrPlugin = registry.getPlugin("array");
        var arrDescriptor = arrPlugin.buildDialogDescriptor({
            type: "array",
            items: { type: "object", properties: { Sku: { type: "string" } } },
            ui: JSON.parse(JSON.stringify(sharedUi))
        });
        assert.strictEqual(
            arrDescriptor.subSchema.ui && arrDescriptor.subSchema.ui.labelSpan === 3 &&
                arrDescriptor.subSchema.ui.layoutBudget === 40,
            true,
            "[dialog ui] ArrayPlugin forwards the ui block onto the modal table sub-schema"
        );

        var refPlugin = registry.getPlugin("object", "reference");
        refPlugin.setEngineContext({
            getSchemaDefinition: function () { return refDefinition; },
            getSchemaDefinitions: function () { return { MockReference: refDefinition }; },
            getModel: function () { return null; }
        });
        var refDescriptor = refPlugin.buildDialogDescriptor({
            type: "object",
            $ref: "#/definitions/MockReference",
            ui: JSON.parse(JSON.stringify(sharedUi))
        });
        assert.strictEqual(
            refDescriptor.subSchema.ui && refDescriptor.subSchema.ui.labelSpan === 3 &&
                refDescriptor.subSchema.ui.layoutBudget === 40,
            true,
            "[dialog ui] ReferencePlugin merges the property ui block onto the resolved $ref sub-schema"
        );
        assert.strictEqual(
            refDefinition.ui === undefined,
            true,
            "[dialog ui] ReferencePlugin does not mutate the shared $ref definition while merging"
        );

        var roDescriptor = objPlugin.buildDialogDescriptor({
            type: "object",
            readOnly: true,
            properties: { Street: { type: "string" } }
        });
        assert.strictEqual(
            roDescriptor.subSchema.ui && roDescriptor.subSchema.ui.readOnly,
            true,
            "[dialog ui] A read-only nested property propagates ui.readOnly to the sub-schema, matching ArraySubSchemaFactory"
        );

        objPlugin.destroy();
        arrPlugin.destroy();
        refPlugin.destroy();
    });

    QUnit.test("Plugin hardening: ui.placeholder and maxLength are honoured by the date/time pickers and multiInput", function (assert) {
        var done = assert.async();
        var registry = PluginRegistry.getInstance();
        var schema = SchemaNormalizer.normalize({
            type: "object",
            properties: {
                Day: { type: "string", ui: { label: "Day", widget: "date", placeholder: "Pick a day" } },
                Moment: { type: "string", ui: { label: "Moment", widget: "datetime", placeholder: "Pick a moment" } },
                Clock: { type: "string", ui: { label: "Clock", widget: "time", placeholder: "Pick a time" } },
                Tags: {
                    type: "array",
                    items: { type: "string", maxLength: 8 },
                    ui: { label: "Tags", widget: "multiInput", placeholder: "Add a tag" }
                }
            }
        });

        registry.preloadDependencies(schema).then(function () {
            var model = new JSONModel({ Day: "2026-01-01", Moment: "", Clock: "", Tags: [] });

            [
                { key: "Day", widget: "date", expected: "Pick a day" },
                { key: "Moment", widget: "datetime", expected: "Pick a moment" },
                { key: "Clock", widget: "time", expected: "Pick a time" }
            ].forEach(function (entry) {
                var pickerPlugin = registry.getPlugin("string", entry.widget);
                var pickerCtrl = pickerPlugin.render(
                    schema.properties[entry.key],
                    "/" + entry.key,
                    "meta",
                    "hp" + entry.key,
                    function () {},
                    model
                );
                assert.strictEqual(
                    pickerCtrl.getPlaceholder(),
                    entry.expected,
                    "[directives] " + pickerCtrl.getMetadata().getName() + " honours ui.placeholder"
                );
                pickerPlugin.destroy();
            });

            var tagPlugin = registry.getPlugin("array", "multiInput");
            var tagCtrl = tagPlugin.render(schema.properties.Tags, "/Tags", "meta", "hpTags", function () {}, model);
            assert.strictEqual(
                tagCtrl.getMaxLength(),
                8,
                "[directives] MultiInput honours the per-entry items.maxLength on its token entry field"
            );

            tagPlugin.destroy();
            model.destroy();
            done();
        });
    });

    QUnit.test("Plugin hardening: nested host tracking drops destroyed hosts and TableLayout falls back when no uiLayout scope resolves", function (assert) {
        var registry = PluginRegistry.getInstance();

        var trackingPlugin = registry.getPlugin("object");
        var hostA = new Label({ text: "host A" });
        var hostB = new Label({ text: "host B" });
        var canTrack = typeof trackingPlugin.trackNestedHost === "function";
        assert.strictEqual(
            canTrack,
            true,
            "[lifecycle] BasePlugin exposes a nested-host tracking seam that can prune destroyed hosts"
        );
        if (canTrack) {
            trackingPlugin.trackNestedHost(hostA);
        }
        assert.strictEqual(
            canTrack && trackingPlugin.activeNestedHosts.size === 1,
            true,
            "[lifecycle] The first nested host is tracked for destruction"
        );
        hostA.destroy();
        if (canTrack) {
            trackingPlugin.trackNestedHost(hostB);
        }
        assert.strictEqual(
            canTrack && trackingPlugin.activeNestedHosts.size === 1,
            true,
            "[lifecycle] Opening another dialog discards the host the dialog layer already destroyed on close"
        );
        assert.strictEqual(
            canTrack && trackingPlugin.activeNestedHosts.has(hostB),
            true,
            "[lifecycle] The live nested host is still owned by the plugin"
        );
        if (!canTrack) {
            hostB.destroy();
        }
        trackingPlugin.destroy();

        var sandboxId = "sandbox-hardening-tablefallback";
        createPhysicalSandbox(sandboxId);
        var model = new JSONModel({ items: [{ Code: "C1", Name: "First" }] });
        var engine = makeHardeningEngine(registry, model);
        var badLayoutSchema = {
            type: "array",
            title: "Unresolvable Layout",
            uiLayout: [{ type: "Control", scope: "#/properties/MissingScopeField" }],
            items: {
                type: "object",
                properties: { Code: { type: "string" }, Name: { type: "string" } }
            }
        };

        var table = new TableLayout().render(badLayoutSchema, "meta", engine, undefined, "/items");
        table.setModel(model, "meta");
        table.placeAt(sandboxId);
        Core.applyChanges();
        assert.strictEqual(
            table.getColumns().length,
            2,
            "[fallback] An unresolvable uiLayout scope no longer counts as a rendered column, so the items.properties fallback runs"
        );
        assert.strictEqual(
            engine.hasPartialRenderingErrors,
            true,
            "[fallback] The unresolvable scope is still reported as a partial rendering error"
        );

        table.destroy();
        model.destroy();
    });

    QUnit.test("Plugin hardening: display mode keeps nested payload triggers, hyperlinks and URL buttons reachable", function (assert) {
        var done = assert.async();
        var registry = PluginRegistry.getInstance();
        var schema = SchemaNormalizer.normalize({
            type: "object",
            properties: {
                Address: {
                    type: "object",
                    ui: { label: "Address", renderMode: "dialog" },
                    properties: { Street: { type: "string" } }
                },
                Lines: {
                    type: "array",
                    ui: { label: "Lines", renderMode: "dialog" },
                    items: { type: "object", properties: { Sku: { type: "string" } } }
                },
                Homepage: { type: "string", ui: { label: "Homepage", widget: "link" } },
                Docs: { type: "string", ui: { label: "Docs", widget: "urlButton", args: "https://example.com/docs" } },
                Blocked: { type: "string", ui: { label: "Blocked", widget: "link", enabled: false } },
                Sealed: { type: "string", ui: { label: "Sealed", widget: "urlButton", args: "https://example.com", enabled: false } },
                Locked: { type: "object", ui: { label: "Locked", renderMode: "dialog", enabled: false }, properties: { A: { type: "string" } } }
            }
        });

        registry.preloadDependencies(schema).then(function () {
            var model = new JSONModel({
                Address: { Street: "1 Queen St" },
                Lines: [{ Sku: "A-1" }],
                Homepage: "https://example.com",
                Docs: "Open the docs",
                Blocked: "https://example.com",
                Sealed: "Sealed target",
                Locked: { A: "x" }
            });

            [
                { key: "Address", type: "object", widget: undefined, label: "nested object trigger" },
                { key: "Lines", type: "array", widget: undefined, label: "nested array trigger" },
                { key: "Homepage", type: "string", widget: "link", label: "hyperlink" },
                { key: "Docs", type: "string", widget: "urlButton", label: "URL navigation button" }
            ].forEach(function (entry) {
                var plugin = registry.getPlugin(entry.type, entry.widget);
                plugin.setEditable(false);
                plugin.setEngineContext({
                    getSchemaDefinition: function () { return null; },
                    getSchemaDefinitions: function () { return {}; },
                    getModel: function () { return model; }
                });
                var ctrl = plugin.render(
                    schema.properties[entry.key],
                    "/" + entry.key,
                    "meta",
                    "nav" + entry.key,
                    function () {},
                    model
                );
                assert.strictEqual(
                    ctrl.getEnabled(),
                    true,
                    "[affordance] Read-only host leaves the " + entry.label + " clickable so the payload stays reachable"
                );
                plugin.setState("editable", false);
                assert.strictEqual(
                    ctrl.getEnabled(),
                    true,
                    "[affordance] A runtime editable=false toggle does not disable the " + entry.label
                );
                plugin.destroy();
            });

            [
                { key: "Blocked", type: "string", widget: "link", label: "hyperlink" },
                { key: "Sealed", type: "string", widget: "urlButton", label: "URL navigation button" },
                { key: "Locked", type: "object", widget: undefined, label: "nested object trigger" }
            ].forEach(function (entry) {
                var offPlugin = registry.getPlugin(entry.type, entry.widget);
                offPlugin.setEditable(false);
                var offCtrl = offPlugin.render(
                    schema.properties[entry.key],
                    "/" + entry.key,
                    "meta",
                    "off" + entry.key,
                    function () {},
                    model
                );
                assert.strictEqual(
                    offCtrl.getEnabled(),
                    false,
                    "[affordance] An explicit ui.enabled:false still disables the " + entry.label
                );
                offPlugin.destroy();
            });

            model.destroy();
            done();
        });
    });

    QUnit.test("Plugin hardening: switching a polymorphic variant clears the abandoned branch's validation entries", function (assert) {
        var done = assert.async();
        var registry = PluginRegistry.getInstance();
        var polyMeta = {
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
            ui: { label: "Payment", widget: "polymorphic" }
        };
        var schema = SchemaNormalizer.normalize({ type: "object", properties: { Payment: polyMeta } });

        registry.preloadDependencies(schema).then(function () {
            var model = new JSONModel({ Payment: { method: "card", cardNumber: "41112222" } });
            var engine = makeHardeningEngine(registry, model);
            var polyBox = engine.generateField(schema.properties.Payment, "/Payment", "meta");
            polyBox.setModel(model, "meta");

            // A real error on the active variant's field, recorded the way Engine.onChange records it.
            engine.reportSchemaError("Payment/cardNumber", "Minimum length is 12 characters.");
            assert.strictEqual(
                engine.validationLedger.hasActiveErrorsForPaths(["Payment/cardNumber"]),
                true,
                "[polymorphic] Precondition: the active variant's field error is held in the ValidationLedger"
            );

            var variantSelect = polyBox.getItems()[0];
            variantSelect.setSelectedKey("bank");
            variantSelect.fireChange({ selectedItem: variantSelect.getItems()[1] });

            assert.strictEqual(
                model.getProperty("/Payment/method"),
                "bank",
                "[polymorphic] Precondition: the variant actually switched"
            );
            assert.strictEqual(
                engine.validationLedger.hasActiveErrorsForPaths(["Payment/cardNumber"]),
                false,
                "[polymorphic] Switching variants clears the abandoned branch's stale field error"
            );
            assert.strictEqual(
                engine.validationLedger.hasActiveErrors(),
                false,
                "[polymorphic] No stale ledger entry survives for a field that no longer exists"
            );

            // An unrelated sibling error must survive: the prefix clear is scoped, not a global wipe.
            engine.reportSchemaError("Unrelated/Field", "Untouched error");
            engine.clearValidationPrefix("/Payment");
            assert.strictEqual(
                engine.validationLedger.hasActiveErrorsForPaths(["Unrelated/Field"]),
                true,
                "[polymorphic] Clearing the polymorphic prefix leaves sibling branches of the ledger intact"
            );

            engine.validationLedger.clear(true);
            polyBox.destroy();
            model.destroy();
            done();
        });
    });

    QUnit.test("Plugin hardening: a HorizontalLayout row counts and renders only the Control elements whose scope resolves", function (assert) {
        var done = assert.async();
        var registry = PluginRegistry.getInstance();

        sap.ui.require([
            "nz/co/siliconst/ui5/metaui/layouts/LayoutElementWalker",
            "nz/co/siliconst/ui5/metaui/layouts/FormLayout"
        ], function (WalkerMod, FormLayoutMod) {
            var LayoutElementWalker = WalkerMod.LayoutElementWalker;
            var FormLayout = FormLayoutMod.FormLayout;

            var mixedSchema = SchemaNormalizer.normalize({
                type: "object",
                uiLayout: [
                    {
                        type: "HorizontalLayout",
                        elements: [
                            { type: "Control", scope: "#/properties/MissingScopeField" },
                            { type: "Control", scope: "#/properties/Present" }
                        ]
                    }
                ],
                properties: { Present: { type: "string", ui: { label: "Present" } } }
            });

            var model = new JSONModel({ Present: "here" });
            var countEngine = makeHardeningEngine(registry, model);
            var delivered = null;
            var rowCount = LayoutElementWalker.walk(
                mixedSchema.uiLayout,
                mixedSchema,
                countEngine,
                {
                    onHorizontalControls: function (resolvedControls) { delivered = resolvedControls; },
                    onScalarField: function () { return undefined; }
                },
                "HardeningProbe"
            );

            assert.strictEqual(
                rowCount,
                1,
                "[horizontal] Only the Control whose scope resolves is counted towards controlCount"
            );
            assert.strictEqual(
                delivered ? delivered.length : -1,
                1,
                "[horizontal] The sink receives only the resolvable Control elements"
            );
            assert.strictEqual(
                delivered && delivered.length > 0 ? delivered[0].bindingPath : "<unresolved>",
                "Present",
                "[horizontal] The sink receives each element already resolved to its binding path"
            );
            assert.strictEqual(
                countEngine.hasPartialRenderingErrors,
                true,
                "[horizontal] The unresolvable scope is still reported as a partial rendering error"
            );

            // A row whose every scope is unresolvable must render nothing, not an empty labelled row.
            var deadSchema = SchemaNormalizer.normalize({
                type: "object",
                uiLayout: [
                    {
                        type: "HorizontalLayout",
                        elements: [{ type: "Control", scope: "#/properties/MissingScopeField" }]
                    }
                ],
                properties: { Present: { type: "string", ui: { label: "Present" } } }
            });
            var formEngine = makeHardeningEngine(registry, model);
            var deadContainer = new FormLayout().render(deadSchema, "meta", formEngine);
            assert.strictEqual(
                deadContainer.getItems().length,
                0,
                "[horizontal] A row with no resolvable scope renders no form at all, instead of an empty labelled row"
            );

            deadContainer.destroy();
            model.destroy();
            done();
        });
    });

    QUnit.module("Accessibility of the generated control tree");

    function a11yTextOf(sId) {
        var oText = sap.ui.core.Element.getElementById(sId);
        return oText ? oText.getText() : "<no such InvisibleText>";
    }

    function a11yLabelledTexts(oDomRef) {
        var sRefs = oDomRef ? oDomRef.getAttribute("aria-labelledby") || "" : "";
        return sRefs.split(" ").filter(Boolean).map(function (sId) {
            var oNode = document.getElementById(sId);
            return oNode ? oNode.textContent : "<missing " + sId + ">";
        });
    }

    QUnit.test("a11y: a field with a rendered label is named by labelFor alone, never by a second aria-labelledby", function (assert) {
        var done = assert.async();
        var registry = PluginRegistry.getInstance();
        sap.ui.require(["nz/co/siliconst/ui5/metaui/layouts/FormLayout"], function (FormLayoutMod) {
            var FormLayout = FormLayoutMod.FormLayout;
            var schema = SchemaNormalizer.normalize({
                type: "object",
                required: ["Code"],
                uiLayout: [{ type: "Control", scope: "#/properties/Code" }],
                properties: { Code: { type: "string", ui: { label: "Order Code" } } }
            });
            var model = new JSONModel({ Code: "ABC" });
            var engine = makeHardeningEngine(registry, model);
            var sandboxId = "sandbox-a11y-labelfor";
            createPhysicalSandbox(sandboxId);
            var container = new FormLayout().render(schema, "meta", engine);
            container.setModel(model, "meta");
            container.placeAt(sandboxId);
            Core.applyChanges();

            var plugin = engine.getPluginByPath("/Code");
            var target = plugin.mainControl || plugin.control;
            var label = container.getItems()[0].getContent()[0];

            assert.strictEqual(
                label.getLabelFor(),
                target.getId(),
                "[a11y] The rendered sap.m.Label is programmatically associated with the generated field via labelFor"
            );
            assert.strictEqual(
                target.getAriaLabelledBy().length,
                0,
                "[a11y] MetaUI adds no competing ariaLabelledBy: a control carrying BOTH a labelFor label and its own aria-labelledby can be skipped by screen readers"
            );
            assert.strictEqual(
                target.data("metauiA11yNameId"),
                null,
                "[a11y] The synthetic InvisibleText created at render time is released once a real label takes the job"
            );
            assert.strictEqual(
                a11yLabelledTexts(target.getDomRef("inner")).join("|"),
                "Order Code",
                "[a11y] The label text reaches the DOM exactly once as the field's accessible name"
            );

            container.destroy();
            model.destroy();
            done();
        });
    });

    QUnit.test("a11y: a field with ui.labelSpan 0 is named by an InvisibleText and leaves no dangling labelFor", function (assert) {
        var done = assert.async();
        var registry = PluginRegistry.getInstance();
        sap.ui.require(["nz/co/siliconst/ui5/metaui/layouts/FormLayout"], function (FormLayoutMod) {
            var FormLayout = FormLayoutMod.FormLayout;
            var schema = SchemaNormalizer.normalize({
                type: "object",
                ui: { labelSpan: 0 },
                uiLayout: [{ type: "Control", scope: "#/properties/Silent" }],
                properties: { Silent: { type: "string", ui: { label: "Suppressed Label" } } }
            });
            var model = new JSONModel({ Silent: "value" });
            var engine = makeHardeningEngine(registry, model);
            var sandboxId = "sandbox-a11y-labelspan0";
            createPhysicalSandbox(sandboxId);
            var container = new FormLayout().render(schema, "meta", engine);
            container.setModel(model, "meta");
            container.placeAt(sandboxId);
            Core.applyChanges();

            var plugin = engine.getPluginByPath("/Silent");
            var target = plugin.mainControl || plugin.control;
            var hiddenLabel = container.getItems()[0].getDependents()[0];

            assert.strictEqual(
                hiddenLabel.getLabelFor(),
                null,
                "[a11y] A label parked as a dependent is never rendered, so its labelFor is retracted instead of dangling"
            );
            assert.strictEqual(
                target.getAriaLabelledBy().length,
                1,
                "[a11y] The field falls back to exactly one InvisibleText for its accessible name"
            );
            assert.strictEqual(
                a11yTextOf(target.getAriaLabelledBy()[0]),
                "Suppressed Label",
                "[a11y] The InvisibleText carries the label the layout suppressed"
            );
            assert.strictEqual(
                a11yLabelledTexts(target.getDomRef("inner")).join("|"),
                "Suppressed Label",
                "[a11y] The accessible name resolves in the DOM even though no label is painted"
            );

            container.destroy();
            model.destroy();
            done();
        });
    });

    QUnit.test("a11y: required, invalid, read-only and disabled states are exposed to assistive technology", function (assert) {
        var done = assert.async();
        var registry = PluginRegistry.getInstance();
        sap.ui.require(["nz/co/siliconst/ui5/metaui/layouts/FormLayout"], function (FormLayoutMod) {
            var FormLayout = FormLayoutMod.FormLayout;
            var schema = SchemaNormalizer.normalize({
                type: "object",
                required: ["Code"],
                uiLayout: [
                    { type: "Control", scope: "#/properties/Code" },
                    { type: "Control", scope: "#/properties/Score" },
                    { type: "Control", scope: "#/properties/Frozen" },
                    { type: "Control", scope: "#/properties/Locked" }
                ],
                properties: {
                    Code: { type: "string", minLength: 4, ui: { label: "Order Code" } },
                    Score: { type: "number", maximum: 5, ui: { label: "Score", widget: "rating" } },
                    Frozen: { type: "string", readOnly: true, ui: { label: "Frozen" } },
                    Locked: { type: "string", ui: { label: "Locked", enabled: false } }
                }
            });
            var model = new JSONModel({ Code: "AB", Score: 3, Frozen: "locked", Locked: "off" });
            var engine = makeHardeningEngine(registry, model);
            var sandboxId = "sandbox-a11y-states";
            createPhysicalSandbox(sandboxId);
            var container = new FormLayout().render(schema, "meta", engine);
            container.setModel(model, "meta");
            container.placeAt(sandboxId);
            Core.applyChanges();

            var codePlugin = engine.getPluginByPath("/Code");
            var codeCtrl = codePlugin.mainControl || codePlugin.control;
            var ratingPlugin = engine.getPluginByPath("/Score");
            var ratingCtrl = ratingPlugin.mainControl || ratingPlugin.control;
            var frozenPlugin = engine.getPluginByPath("/Frozen");
            var frozenCtrl = frozenPlugin.mainControl || frozenPlugin.control;
            var lockedPlugin = engine.getPluginByPath("/Locked");
            var lockedCtrl = lockedPlugin.mainControl || lockedPlugin.control;

            assert.strictEqual(
                lockedCtrl.getDomRef("inner").hasAttribute("disabled"),
                true,
                "[a11y] A ui.enabled:false field renders the native disabled state, which assistive technology reports as unavailable"
            );
            assert.strictEqual(
                codeCtrl.getDomRef("inner").getAttribute("aria-required"),
                "true",
                "[a11y] A schema-mandatory field renders aria-required, not only a visual asterisk"
            );
            assert.strictEqual(
                frozenCtrl.getDomRef("inner").hasAttribute("readonly"),
                true,
                "[a11y] A readOnly property renders the native readonly state rather than only looking inert"
            );

            codePlugin.setState("valid", false, "Minimum length is 4 characters.");
            Core.applyChanges();
            assert.strictEqual(
                codeCtrl.getDomRef("inner").getAttribute("aria-invalid"),
                "true",
                "[a11y] An invalid field renders aria-invalid, so a screen-reader user gets the equivalent of the red border"
            );
            assert.strictEqual(
                codeCtrl.getValueStateText(),
                "Minimum length is 4 characters.",
                "[a11y] The validation message is published through the control's own value-state channel"
            );

            ratingPlugin.setState("valid", false, "Score is out of range.");
            assert.strictEqual(
                a11yTextOf(ratingCtrl.getAriaDescribedBy()[0]),
                "Score is out of range.",
                "[a11y] A control with no valueState of its own publishes the message as an accessible description instead of a tooltip only"
            );
            ratingPlugin.setState("valid", true);
            assert.strictEqual(
                ratingCtrl.getAriaDescribedBy().length,
                0,
                "[a11y] The accessible error description is withdrawn again once the field becomes valid"
            );

            codePlugin.setState("editable", false);
            Core.applyChanges();
            assert.strictEqual(
                codeCtrl.getDomRef("inner").hasAttribute("readonly"),
                true,
                "[a11y] A runtime editable=false policy reaches the DOM as a read-only state"
            );

            container.destroy();
            model.destroy();
            done();
        });
    });

    QUnit.test("a11y: display mode does not announce static output as a mandatory form field", function (assert) {
        var done = assert.async();
        var registry = PluginRegistry.getInstance();
        sap.ui.require(["nz/co/siliconst/ui5/metaui/layouts/FormLayout"], function (FormLayoutMod) {
            var FormLayout = FormLayoutMod.FormLayout;
            var schema = SchemaNormalizer.normalize({
                type: "object",
                required: ["Code"],
                uiLayout: [{ type: "Control", scope: "#/properties/Code" }],
                properties: { Code: { type: "string", ui: { label: "Order Code" } } }
            });
            var model = new JSONModel({ Code: "ABC" });
            var engine = new Engine(false, false, registry);
            engine.activeModel = model;
            engine.host = { activeModelName: "meta" };
            engine.onChange = function () { return undefined; };

            var sandboxId = "sandbox-a11y-display";
            createPhysicalSandbox(sandboxId);
            var container = new FormLayout().render(schema, "meta", engine);
            container.setModel(model, "meta");
            container.placeAt(sandboxId);
            Core.applyChanges();

            var label = container.getItems()[0].getContent()[0];
            var plugin = engine.getPluginByPath("/Code");
            var target = plugin.mainControl || plugin.control;

            assert.strictEqual(
                label.getRequired(),
                false,
                "[a11y] A read-only field carries no required marker: UI5 forwards it as aria-required onto a sap.m.Text, where that attribute is not allowed"
            );
            assert.strictEqual(
                target.getDomRef().hasAttribute("aria-required"),
                false,
                "[a11y] The rendered display control carries no aria-required attribute"
            );

            container.destroy();
            model.destroy();
            done();
        });
    });

    QUnit.test("a11y: ui.description becomes an accessible description, not only a tooltip", function (assert) {
        var registry = PluginRegistry.getInstance();
        var schema = SchemaNormalizer.normalize({
            type: "object",
            properties: {
                Code: { type: "string", description: "Six characters, letters only.", ui: { label: "Order Code" } }
            }
        });
        var model = new JSONModel({ Code: "ABC" });
        var plugin = registry.getPlugin("string");
        var control = plugin.render(schema.properties.Code, "/Code", "meta", "a11yDesc", function () {}, model);
        control.setModel(model, "meta");
        var sandboxId = "sandbox-a11y-description";
        createPhysicalSandbox(sandboxId);
        control.placeAt(sandboxId);
        Core.applyChanges();

        assert.strictEqual(
            control.getAriaDescribedBy().length,
            1,
            "[a11y] A described field gains exactly one accessible description reference"
        );
        assert.strictEqual(
            a11yTextOf(control.getAriaDescribedBy()[0]),
            "Six characters, letters only.",
            "[a11y] The schema description is what the description reference resolves to"
        );
        assert.strictEqual(
            control.getTooltip(),
            "Six characters, letters only.",
            "[a11y] The visible tooltip affordance is kept alongside the accessible description"
        );

        plugin.destroy();
        model.destroy();
    });

    QUnit.test("a11y: a hardware composite names the inner control that actually takes focus", function (assert) {
        var done = assert.async();
        var registry = PluginRegistry.getInstance();
        var schema = SchemaNormalizer.normalize({
            type: "object",
            properties: { Note: { type: "string", ui: { label: "Voice Note", widget: "voiceInput" } } }
        });
        registry.preloadDependencies(schema).then(function () {
            var model = new JSONModel({ Note: "spoken" });
            var plugin = registry.getPlugin("string", "voiceInput");
            var control = plugin.render(schema.properties.Note, "/Note", "meta", "a11yVoice", function () {}, model);
            control.setModel(model, "meta");
            var sandboxId = "sandbox-a11y-hardware";
            createPhysicalSandbox(sandboxId);
            control.placeAt(sandboxId);
            Core.applyChanges();

            var innerInputs = control.findAggregatedObjects(true).filter(function (candidate) {
                return candidate.isA && candidate.isA("sap.m.InputBase");
            });

            assert.strictEqual(
                innerInputs.length > 0,
                true,
                "[a11y] The hardware composite exposes an inner text-entry control that can hold the accessible name"
            );
            assert.strictEqual(
                a11yTextOf(innerInputs[0].getAriaLabelledBy()[0]),
                "Voice Note",
                "[a11y] BaseHardwareControl declares no ariaLabelledBy, so the field name is attached to the inner input instead of being dropped"
            );

            plugin.destroy();
            model.destroy();
            done();
        });
    });

    QUnit.test("a11y: a table row cell is named by its column header exactly once", function (assert) {
        var registry = PluginRegistry.getInstance();
        var schema = SchemaNormalizer.normalize({
            type: "array",
            items: {
                type: "object",
                properties: {
                    Name: { type: "string", required: true },
                    Count: { type: "integer", minimum: 1 }
                }
            }
        });
        var model = new JSONModel([{ Name: "Row 1", Count: 3 }]);
        var engine = makeHardeningEngine(registry, model);
        var sandboxId = "sandbox-a11y-table";
        createPhysicalSandbox(sandboxId);
        var table = new TableLayout().render(schema, "meta", engine, undefined, "/");
        table.setModel(model, "meta");
        table.placeAt(sandboxId);
        Core.applyChanges();

        var cellInput = document.getElementById(sandboxId).querySelector("input.sapMInputBaseInner");

        assert.strictEqual(
            table.getAriaLabelledBy().length,
            1,
            "[a11y] The generated table is named by its own toolbar title instead of being an anonymous grid"
        );
        assert.deepEqual(
            a11yLabelledTexts(cellInput),
            ["Name"],
            "[a11y] A row cell is named by its column header, and MetaUI does not add a second copy of that same text"
        );

        table.destroy();
        model.destroy();
    });

    QUnit.test("a11y: wizard steps and the step progress bar are announced coherently", function (assert) {
        var done = assert.async();
        var registry = PluginRegistry.getInstance();
        sap.ui.require(["nz/co/siliconst/ui5/metaui/layouts/WizardLayout"], function (WizardLayoutMod) {
            var WizardLayout = WizardLayoutMod.WizardLayout;
            var schema = SchemaNormalizer.normalize({
                type: "object",
                uiLayout: [
                    { type: "WizardStep", label: "Customer", elements: [{ type: "Control", scope: "#/properties/Who" }] },
                    { type: "WizardStep", label: "Delivery", elements: [{ type: "Control", scope: "#/properties/Where" }] }
                ],
                properties: {
                    Who: { type: "string", ui: { label: "Customer name" } },
                    Where: { type: "string", ui: { label: "Delivery address" } }
                }
            });
            var model = new JSONModel({ Who: "Ada", Where: "Auckland" });
            var engine = makeHardeningEngine(registry, model);
            var sandboxId = "sandbox-a11y-wizard";
            createPhysicalSandbox(sandboxId);
            var root = new WizardLayout().render(schema, "meta", engine);
            root.setModel(model, "meta");
            root.placeAt(sandboxId);
            Core.applyChanges();

            var header = root.getItems()[0];
            var titleCtrl = header.getItems()[0].getItems()[0];
            var counterCtrl = header.getItems()[0].getItems()[1];
            var progressBar = header.getItems()[1];
            var stepForm = root.getItems()[1].getItems()[0];

            assert.deepEqual(
                progressBar.getAriaLabelledBy(),
                [counterCtrl.getId()],
                "[a11y] The step progress bar is named by the visible step counter instead of announcing a bare percentage"
            );
            assert.deepEqual(
                stepForm.getAriaLabelledBy(),
                [titleCtrl.getId()],
                "[a11y] Each wizard step form is named by the live step title, so its fields are announced as a titled region"
            );
            assert.strictEqual(
                titleCtrl.getText(),
                "Customer",
                "[a11y] The step title the region is named by is the one currently on screen"
            );

            root.destroy();
            model.destroy();
            done();
        });
    });

    QUnit.test("a11y: a composite widget's unrendered labels are republished as accessible names", function (assert) {
        var registry = PluginRegistry.getInstance();
        var dictModel = new JSONModel({ EnvVars: { HOST: "localhost" } });
        var dictPlugin = registry.getPlugin("object", "dictionaryMap");
        dictPlugin.setEngineContext({
            pluginRegistry: registry,
            getSchemaDefinition: function () { return undefined; },
            getSchemaDefinitions: function () { return undefined; },
            getModel: function () { return dictModel; }
        });
        var dictControl = dictPlugin.render(
            {
                type: "object",
                additionalProperties: { type: "string" },
                ui: { widget: "dictionaryMap", label: "Environment Variables" }
            },
            "/EnvVars",
            "meta",
            "a11yDictScope"
        );
        dictControl.setModel(dictModel, "meta");
        var sandboxId = "sandbox-a11y-dictionary";
        createPhysicalSandbox(sandboxId);
        dictControl.placeAt(sandboxId);
        Core.applyChanges();

        var firstRow = dictControl.getItems()[1].getItems()[0];
        var valueControl = firstRow.getItems()[1];

        assert.strictEqual(
            firstRow.getDependents().length > 0,
            true,
            "[a11y] The row labels are parked as dependents, which UI5 never renders"
        );
        assert.strictEqual(
            a11yTextOf(valueControl.getAriaLabelledBy()[0]),
            "Dictionary entry value",
            "[a11y] That unrendered label text is republished as an InvisibleText so the entry input still has an accessible name"
        );

        dictPlugin.destroy();
        dictModel.destroy();
    });

    QUnit.test("a11y: destroying a plugin frees the InvisibleText controls it put in the static area", function (assert) {
        var registry = PluginRegistry.getInstance();
        var schema = SchemaNormalizer.normalize({
            type: "object",
            properties: {
                Code: { type: "string", description: "Letters only.", ui: { label: "Order Code" } }
            }
        });
        var model = new JSONModel({ Code: "ABC" });
        var plugin = registry.getPlugin("string");
        var control = plugin.render(schema.properties.Code, "/Code", "meta", "a11yLifecycle", function () {}, model);
        var nameId = control.data("metauiA11yNameId");
        var descId = control.data("metauiA11yDescriptionId");

        assert.strictEqual(
            sap.ui.core.Element.getElementById(nameId) !== undefined &&
                sap.ui.core.Element.getElementById(descId) !== undefined,
            true,
            "[a11y] The accessible name and description texts exist while the field does"
        );

        plugin.destroy();

        assert.strictEqual(
            sap.ui.core.Element.getElementById(nameId),
            undefined,
            "[a11y] The accessible name text is destroyed with the plugin, not leaked into the static area"
        );
        assert.strictEqual(
            sap.ui.core.Element.getElementById(descId),
            undefined,
            "[a11y] The accessible description text is destroyed with the plugin as well"
        );

        model.destroy();
    });

    QUnit.module("Consolidation: shared commit, single-bound widgets, option lists and action buttons");

    /**
     * Gives a plugin an engine context that can resolve the model, and deliberately does NOT call
     * control.setModel(). A control reaches this state whenever the host owns the model and the
     * widget is created outside the propagating control tree (dialog content, a detached cell
     * template, a plugin rendered before it is added to its parent).
     */
    function contextOnlyModel(plugin, model) {
        plugin.setEngineContext({
            pluginRegistry: PluginRegistry.getInstance(),
            getSchemaDefinition: function () { return undefined; },
            getSchemaDefinitions: function () { return undefined; },
            getModel: function () { return model; }
        });
    }

    QUnit.test("Consolidation: a control with no local model still commits the user's edit through the engine context", function (assert) {
        var registry = PluginRegistry.getInstance();

        // 1. CheckBox (BooleanPlugin) -- select event
        var boolModel = new JSONModel({ Agreed: false });
        var boolPlugin = registry.getPlugin("boolean");
        contextOnlyModel(boolPlugin, boolModel);
        var checkBox = boolPlugin.render({ type: "boolean", ui: { label: "Agreed" } }, "/Agreed", "meta", "ccBoolScope");
        checkBox.setSelected(true);
        checkBox.fireSelect({ selected: true });
        assert.strictEqual(
            boolModel.getProperty("/Agreed"),
            true,
            "BooleanPlugin commits through engineContext.getModel() when the CheckBox carries no local model"
        );
        boolPlugin.destroy();
        boolModel.destroy();

        // 2. Switch (SwitchPlugin) -- change event
        var switchModel = new JSONModel({ Active: false });
        var switchPlugin = registry.getPlugin("boolean", "switch");
        contextOnlyModel(switchPlugin, switchModel);
        var switchCtrl = switchPlugin.render(
            { type: "boolean", ui: { label: "Active", widget: "switch" } }, "/Active", "meta", "ccSwitchScope");
        switchCtrl.setState(true);
        switchCtrl.fireChange({ state: true });
        assert.strictEqual(
            switchModel.getProperty("/Active"),
            true,
            "SwitchPlugin commits through engineContext.getModel() when the Switch carries no local model"
        );
        switchPlugin.destroy();
        switchModel.destroy();

        // 3. Slider (SliderPlugin) -- change event
        var sliderModel = new JSONModel({ Volume: 10 });
        var sliderPlugin = registry.getPlugin("number", "slider");
        contextOnlyModel(sliderPlugin, sliderModel);
        var sliderCtrl = sliderPlugin.render(
            { type: "number", minimum: 0, maximum: 100, ui: { label: "Volume", widget: "slider" } },
            "/Volume", "meta", "ccSliderScope");
        sliderCtrl.setValue(42);
        sliderCtrl.fireChange({ value: 42 });
        assert.strictEqual(
            sliderModel.getProperty("/Volume"),
            42,
            "SliderPlugin commits through engineContext.getModel() when the Slider carries no local model"
        );
        sliderPlugin.destroy();
        sliderModel.destroy();

        // 4. StepInput (StepInputPlugin) -- change event
        var stepModel = new JSONModel({ Qty: 2 });
        var stepPlugin = registry.getPlugin("number", "step");
        contextOnlyModel(stepPlugin, stepModel);
        var stepCtrl = stepPlugin.render(
            { type: "number", minimum: 0, maximum: 10, multipleOf: 1, ui: { label: "Qty", widget: "step" } },
            "/Qty", "meta", "ccStepScope");
        stepCtrl.setValue(7);
        stepCtrl.fireChange({ value: 7 });
        assert.strictEqual(
            stepModel.getProperty("/Qty"),
            7,
            "StepInputPlugin commits through engineContext.getModel() when the StepInput carries no local model"
        );
        stepPlugin.destroy();
        stepModel.destroy();

        // 5. RatingIndicator (RatingIndicatorPlugin) -- change event
        var ratingModel = new JSONModel({ Stars: 1 });
        var ratingPlugin = registry.getPlugin("number", "rating");
        contextOnlyModel(ratingPlugin, ratingModel);
        var ratingCtrl = ratingPlugin.render(
            { type: "number", maximum: 5, ui: { label: "Stars", widget: "rating" } }, "/Stars", "meta", "ccRatingScope");
        ratingCtrl.setValue(4);
        ratingCtrl.fireChange({ value: 4 });
        assert.strictEqual(
            ratingModel.getProperty("/Stars"),
            4,
            "RatingIndicatorPlugin commits through engineContext.getModel() when the RatingIndicator carries no local model"
        );
        ratingPlugin.destroy();
        ratingModel.destroy();

        // 6. Select (DropdownPlugin, numeric coercion branch)
        var ddModel = new JSONModel({ Priority: 1 });
        var ddPlugin = registry.getPlugin("number", "select");
        contextOnlyModel(ddPlugin, ddModel);
        var ddCtrl = ddPlugin.render(
            { type: "integer", enum: [1, 2, 3], ui: { label: "Priority", widget: "select" } },
            "/Priority", "meta", "ccDropdownScope");
        ddCtrl.setSelectedKey("3");
        ddCtrl.fireChange({ selectedItem: ddCtrl.getItems()[2] });
        assert.strictEqual(
            ddModel.getProperty("/Priority"),
            3,
            "DropdownPlugin commits through engineContext.getModel() when the Select carries no local model"
        );
        ddPlugin.destroy();
        ddModel.destroy();

        // 7. MultiComboBox (MultiSelectPlugin)
        var msModel = new JSONModel({ Codes: [10] });
        var msPlugin = registry.getPlugin("array", "multiSelect");
        contextOnlyModel(msPlugin, msModel);
        var msCtrl = msPlugin.render(
            { type: "array", items: { type: "integer", enum: [10, 20, 30] }, ui: { label: "Codes", widget: "multiSelect" } },
            "/Codes", "meta", "ccMultiSelectScope");
        msCtrl.setSelectedKeys(["10", "30"]);
        msCtrl.fireSelectionFinish({ selectedItems: [msCtrl.getItems()[0], msCtrl.getItems()[2]] });
        assert.deepEqual(
            msModel.getProperty("/Codes"),
            [10, 30],
            "MultiSelectPlugin commits through engineContext.getModel() when the MultiComboBox carries no local model"
        );
        msPlugin.destroy();
        msModel.destroy();

        // 8. MultiInput (MultiInputPlugin)
        var miModel = new JSONModel({ Scores: [] });
        var miPlugin = registry.getPlugin("array", "multiInput");
        contextOnlyModel(miPlugin, miModel);
        var miCtrl = miPlugin.render(
            { type: "array", items: { type: "number" }, ui: { label: "Scores", widget: "multiInput" } },
            "/Scores", "meta", "ccMultiInputScope");
        var addedToken = new Token({ key: "55", text: "55" });
        miCtrl.fireTokenUpdate({ type: "added", addedTokens: [addedToken], removedTokens: [] });
        assert.deepEqual(
            miModel.getProperty("/Scores"),
            [55],
            "MultiInputPlugin commits through engineContext.getModel() when the MultiInput carries no local model"
        );
        addedToken.destroy();
        miPlugin.destroy();
        miModel.destroy();

    });

    QUnit.test("Consolidation: the shared bases are the only place the consolidated behaviour can live", function (assert) {
        var registry = PluginRegistry.getInstance();

        // commitValue is the single write path. A plugin that reimplements it locally is how the
        // engine-context fallback went missing in five widgets, so assert it exists exactly once.
        assert.strictEqual(
            typeof BasePlugin.prototype.commitValue,
            "function",
            "BasePlugin owns commitValue, so no plugin needs its own model-resolve-and-write block"
        );

        var boolPlugin = registry.getPlugin("boolean");
        var switchPlugin = registry.getPlugin("boolean", "switch");
        var sliderPlugin = registry.getPlugin("number", "slider");
        var stepPlugin = registry.getPlugin("number", "step");
        var ratingPlugin = registry.getPlugin("number", "rating");

        assert.strictEqual(
            boolPlugin instanceof SingleBoundWidgetPlugin &&
                switchPlugin instanceof SingleBoundWidgetPlugin &&
                sliderPlugin instanceof SingleBoundWidgetPlugin &&
                stepPlugin instanceof SingleBoundWidgetPlugin &&
                ratingPlugin instanceof SingleBoundWidgetPlugin,
            true,
            "CheckBox, Switch, Slider, StepInput and RatingIndicator all extend SingleBoundWidgetPlugin"
        );
        assert.strictEqual(
            boolPlugin.getValue === switchPlugin.getValue &&
                boolPlugin.getValue === sliderPlugin.getValue &&
                boolPlugin.getValue === stepPlugin.getValue &&
                boolPlugin.getValue === ratingPlugin.getValue,
            true,
            "The five widgets share one getValue function object: the live-or-model fallback cannot drift apart again"
        );
        assert.strictEqual(
            boolPlugin.render === ratingPlugin.render && boolPlugin.applyState === sliderPlugin.applyState,
            true,
            "They also share one render and one applyState, so the display branch and the editable guard are single-sourced"
        );

        var dropdownPlugin = registry.getPlugin("string", "select");
        var multiSelectPlugin = registry.getPlugin("array", "multiSelect");
        assert.strictEqual(
            dropdownPlugin instanceof OptionListPlugin && multiSelectPlugin instanceof OptionListPlugin,
            true,
            "Select and MultiComboBox both extend OptionListPlugin"
        );
        assert.strictEqual(
            dropdownPlugin.resolveValueHelpList === multiSelectPlugin.resolveValueHelpList &&
                dropdownPlugin.syncOptionItems === multiSelectPlugin.syncOptionItems,
            true,
            "They share one valueHelp resolution and one item-sync function: the ui.valueHelp precedence cannot diverge"
        );
        assert.strictEqual(
            dropdownPlugin.resolveValueHelpList({ ui: { valueHelp: [{ key: "a", text: "A" }] }, valueHelp: [{ key: "b", text: "B" }] })[0].key,
            "a",
            "The shared resolver keeps ui.valueHelp ahead of the schema-level valueHelp"
        );

        var submitPlugin = registry.getPlugin("string", "submitButton");
        var clearPlugin = registry.getPlugin("string", "clearButton");
        var urlPlugin = registry.getPlugin("string", "urlButton");
        assert.strictEqual(
            submitPlugin instanceof ActionButtonPlugin &&
                clearPlugin instanceof ActionButtonPlugin &&
                urlPlugin instanceof ActionButtonPlugin,
            true,
            "Submit, Clear and URL navigation all extend ActionButtonPlugin"
        );
        assert.strictEqual(
            submitPlugin.render === clearPlugin.render && submitPlugin.render === urlPlugin.render,
            true,
            "All three triggers are built by one render, so label binding, icon and enabled state stay consistent"
        );

        // The one genuine difference between the mutating buttons and the navigation affordance is
        // now three declared overrides rather than three silent omissions.
        assert.strictEqual(
            [submitPlugin.isNavigationAffordance, clearPlugin.isNavigationAffordance, urlPlugin.isNavigationAffordance].join(","),
            "false,false,true",
            "Only the URL trigger declares itself a navigation affordance; the mutating buttons take the default"
        );
        var defaultOwnerCheck = ActionButtonPlugin.prototype.isEnabledStateExternallyOwned;
        assert.strictEqual(
            submitPlugin.isEnabledStateExternallyOwned === defaultOwnerCheck &&
                clearPlugin.isEnabledStateExternallyOwned === defaultOwnerCheck &&
                urlPlugin.isEnabledStateExternallyOwned !== defaultOwnerCheck,
            true,
            "Only the URL trigger overrides the enabled-state owner check that guards ui.enabledOn"
        );

        boolPlugin.destroy();
        switchPlugin.destroy();
        sliderPlugin.destroy();
        stepPlugin.destroy();
        ratingPlugin.destroy();
        dropdownPlugin.destroy();
        multiSelectPlugin.destroy();
        submitPlugin.destroy();
        clearPlugin.destroy();
        urlPlugin.destroy();
    });

    QUnit.test("Consolidation: the remaining imperative commit sites also survive a control with no local model", function (assert) {
        var registry = PluginRegistry.getInstance();

        // 1. LiveSearchPlugin -- picking a suggestion is the whole point of the widget, and it wrote
        //    nowhere when the Input had no local model: the user watched their pick vanish.
        var lsModel = new JSONModel({ Query: "" });
        var lsPlugin = registry.getPlugin("string", "liveSearch");
        contextOnlyModel(lsPlugin, lsModel);
        var lsInput = lsPlugin.render(
            {
                type: "string",
                ui: {
                    widget: "liveSearch",
                    dataSource: { url: "/mockData/scenarios/index.json", keyField: "code", textField: "name" }
                }
            },
            "/Query", "meta", "ccLiveSearchScope");
        var suggestion = new sap.m.SuggestionItem({ key: "NZL", text: "New Zealand" });
        lsInput.fireSuggestionItemSelected({ selectedItem: suggestion });
        assert.strictEqual(
            lsModel.getProperty("/Query"),
            "NZL",
            "LiveSearchPlugin commits the chosen suggestion through engineContext.getModel()"
        );
        suggestion.destroy();
        lsPlugin.destroy();
        lsModel.destroy();

        // 2. NumberPlugin -- a non-zero write. Starting from 7 rather than 0 so that a silent no-op
        //    cannot be mistaken for a successful write.
        var numModel = new JSONModel({ Qty: 7 });
        var numPlugin = registry.getPlugin("number");
        contextOnlyModel(numPlugin, numModel);
        var numInput = numPlugin.render({ type: "number", ui: { label: "Qty" } }, "/Qty", "meta", "ccNumberScope");
        numInput.setValue("42");
        numInput.fireChange({ value: "42" });
        assert.strictEqual(
            numModel.getProperty("/Qty"),
            42,
            "NumberPlugin commits a parsed number through engineContext.getModel() (7 -> 42, so a no-op cannot pass)"
        );
        assert.strictEqual(
            typeof numModel.getProperty("/Qty"),
            "number",
            "NumberPlugin still writes a native number, not the raw input string"
        );
        numPlugin.destroy();
        numModel.destroy();

        // 3. NumberPlugin -- zero is the value most likely to hide a no-op, so assert it from a
        //    non-zero starting point where only a real write can produce it.
        var zeroModel = new JSONModel({ Qty: 7 });
        var zeroPlugin = registry.getPlugin("number");
        contextOnlyModel(zeroPlugin, zeroModel);
        var zeroInput = zeroPlugin.render({ type: "number", ui: { label: "Qty" } }, "/Qty", "meta", "ccNumberZeroScope");
        zeroInput.setValue("0");
        zeroInput.fireChange({ value: "0" });
        assert.strictEqual(
            zeroModel.getProperty("/Qty"),
            0,
            "NumberPlugin commits a literal zero (7 -> 0), which a silent no-op would leave at 7"
        );
        zeroPlugin.destroy();
        zeroModel.destroy();

        // 4. NumberPlugin -- clearing the field is the second write in the same handler.
        var clearNumModel = new JSONModel({ Qty: 42 });
        var clearNumPlugin = registry.getPlugin("number");
        contextOnlyModel(clearNumPlugin, clearNumModel);
        var clearNumInput = clearNumPlugin.render(
            { type: "number", ui: { label: "Qty" } }, "/Qty", "meta", "ccNumberClearScope");
        clearNumInput.setValue("");
        clearNumInput.fireChange({ value: "" });
        assert.strictEqual(
            clearNumModel.getProperty("/Qty"),
            null,
            "NumberPlugin commits the cleared value through engineContext.getModel() (42 -> null)"
        );
        clearNumPlugin.destroy();
        clearNumModel.destroy();

        // 5. RemoteValueHelpPlugin -- the dialog is built synchronously by valueHelpRequest, so the
        //    confirm handler can be exercised before the backing fetch settles.
        var vhModel = new JSONModel({ Country: "" });
        var vhPlugin = registry.getPlugin("string", "valueHelp");
        contextOnlyModel(vhPlugin, vhModel);
        var vhInput = vhPlugin.render(
            {
                type: "string",
                ui: { widget: "valueHelp" },
                valueHelp: { url: "/mockData/scenarios/index.json", keyPath: "category", textPath: "category" }
            },
            "/Country", "meta", "ccValueHelpScope");
        vhInput.fireValueHelpRequest();
        var chosen = new sap.m.StandardListItem({ title: "New Zealand", description: "NZL" });
        vhPlugin.selectDialog.fireConfirm({ selectedItem: chosen });
        assert.strictEqual(
            vhModel.getProperty("/Country"),
            "NZL",
            "RemoteValueHelpPlugin commits the confirmed value-help row through engineContext.getModel()"
        );

        // Tearing down now is deliberate: openValueHelpDialog re-checks the dialog and the input
        // after its await, so the in-flight fetch returns at that guard instead of opening a modal
        // over the rest of the suite.
        chosen.destroy();
        vhPlugin.destroy();
        vhModel.destroy();
    });

    QUnit.test("Consolidation: RemoteDropdownPlugin reads the same option sources as every other option list", function (assert) {
        var registry = PluginRegistry.getInstance();

        // The oracle's own 'string:combobox' mapping declares its options as a schema-level valueHelp
        // array with no dataSource. Display mode mapped CB_1 -> 'Combo 1'; edit mode looked only at
        // ui.valueHelp, found nothing, and offered the user the bare key instead of the two options.
        var comboMeta = {
            type: "string",
            ui: { label: "ComboBox", widget: "combobox" },
            valueHelp: [{ key: "CB_1", text: "Combo 1" }, { key: "CB_2", text: "Combo 2" }]
        };

        var comboModel = new JSONModel({ Choice: "CB_1" });
        var comboPlugin = registry.getPlugin("string", "combobox");
        var combo = comboPlugin.render(cloneVal(comboMeta), "/Choice", "meta", "ccComboScope");
        combo.setModel(comboModel, "meta");
        createPhysicalSandbox("sandbox-cc-combo");
        combo.placeAt("sandbox-cc-combo");
        Core.applyChanges();

        assert.strictEqual(
            combo.getItems().length,
            2,
            "RemoteDropdownPlugin offers both declared valueHelp options in edit mode, not just the bound key"
        );
        assert.deepEqual(
            combo.getItems().map(function (item) { return item.getText(); }),
            ["Combo 1", "Combo 2"],
            "The options carry their declared labels, matching what display mode already showed"
        );
        comboPlugin.destroy();
        comboModel.destroy();

        var dispModel = new JSONModel({ Choice: "CB_2" });
        var dispPlugin = registry.getPlugin("string", "combobox");
        dispPlugin.setEditable(false);
        var dispText = dispPlugin.render(cloneVal(comboMeta), "/Choice", "meta", "ccComboDispScope");
        dispText.setModel(dispModel, "meta");
        Core.applyChanges();
        assert.strictEqual(
            dispText.getText(),
            "Combo 2",
            "Display mode still maps the stored key to its option text (regression guard on the shared resolver)"
        );
        dispPlugin.destroy();
        dispModel.destroy();

        var sharedPlugin = registry.getPlugin("string", "combobox");
        var listPlugin = registry.getPlugin("string", "select");
        assert.strictEqual(
            sharedPlugin instanceof OptionListPlugin &&
                sharedPlugin.resolveValueHelpList === listPlugin.resolveValueHelpList,
            true,
            "RemoteDropdownPlugin now shares OptionListPlugin's single valueHelp resolver with DropdownPlugin"
        );
        sharedPlugin.destroy();
        listPlugin.destroy();
    });

    QUnit.test("Consolidation: the URL trigger navigates to the metadata it currently has, not the metadata it was rendered from", function (assert) {
        var registry = PluginRegistry.getInstance();
        var navigated = [];
        var originalRedirect = mobileLibrary.URLHelper.redirect;
        mobileLibrary.URLHelper.redirect = function (url) {
            navigated.push(url);
        };

        var urlPlugin = registry.getPlugin("string", "urlButton");
        var urlBtn = urlPlugin.render(
            { type: "string", ui: { label: "Open", widget: "urlButton", args: "https://example.com/original" } },
            "/Target", "meta", "ccUrlScope");

        urlBtn.firePress();
        assert.strictEqual(
            navigated[navigated.length - 1],
            "https://example.com/original",
            "The trigger navigates to the URL it was rendered with"
        );

        // A policy effect reaches the plugin through updateMetadata, exactly as PolicyEngine does.
        urlPlugin.updateMetadata({
            type: "string",
            ui: { label: "Open", widget: "urlButton", args: "https://example.com/updated" }
        });

        assert.strictEqual(
            urlPlugin.getValue(),
            "https://example.com/updated",
            "getValue() reports the updated target, because it reads this.metadata"
        );

        urlBtn.firePress();
        assert.strictEqual(
            navigated[navigated.length - 1],
            "https://example.com/updated",
            "press() navigates to the same updated target rather than the stale render-time one"
        );

        mobileLibrary.URLHelper.redirect = originalRedirect;
        urlPlugin.destroy();
    });

    QUnit.test("Consolidation: a plugin that never finished rendering fails closed instead of reporting valid", function (assert) {
        var registry = PluginRegistry.getInstance();

        // Engine.generateField pushes the plugin onto activePlugins and only then calls render(),
        // so a render that throws before initialize() leaves precisely this state: a registered
        // plugin with no metadata and no control. Reporting valid there lets a required field that
        // visibly failed to render pass triggerSubmit().
        var neverRendered = registry.getPlugin("string");
        var unrenderedResult = neverRendered.validate();
        assert.strictEqual(
            unrenderedResult.isValid,
            false,
            "A plugin with neither metadata nor a control reports invalid, matching validate()'s documented fail-closed contract"
        );
        assert.strictEqual(
            typeof unrenderedResult.errorMessage === "string" && unrenderedResult.errorMessage.length > 0,
            true,
            "It carries an explanatory message rather than an empty failure"
        );
        neverRendered.destroy();

        // The sibling case - metadata present, control missing - already failed closed and must stay that way.
        var renderedThenLost = registry.getPlugin("string");
        renderedThenLost.render({ type: "string", ui: { label: "Code" } }, "/Code", "meta", "ccFailClosedScope");
        renderedThenLost.destroy();
        assert.strictEqual(
            renderedThenLost.validate().isValid,
            false,
            "A plugin whose control is gone still reports invalid (regression guard on the existing branch)"
        );

        // Widgets that hold no user data opt out through their own validate() override and never
        // reach the guard, so tightening it cannot make a form unsubmittable.
        var submitPlugin = registry.getPlugin("string", "submitButton");
        var clearPlugin = registry.getPlugin("string", "clearButton");
        var urlPlugin = registry.getPlugin("string", "urlButton");
        var stripPlugin = registry.getPlugin("string", "messageStrip");
        assert.strictEqual(
            submitPlugin.validate().isValid &&
                clearPlugin.validate().isValid &&
                urlPlugin.validate().isValid &&
                stripPlugin.validate().isValid,
            true,
            "Action buttons and the message strip still report valid with no metadata, so the form stays submittable"
        );
        submitPlugin.destroy();
        clearPlugin.destroy();
        urlPlugin.destroy();
        stripPlugin.destroy();
    });

});
