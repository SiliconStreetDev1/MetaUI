sap.ui.define([
    "sap/ui/base/Object"
], function (UI5Object) {
    "use strict";

    /**
     * @class
     * SnippetGenerator computes authentic snippets based on the test matrix permutations.
     * 
     * @extends sap.ui.base.Object
     * @alias metaui.sandbox.util.SnippetGenerator
     */
    var SnippetGenerator = UI5Object.extend("metaui.sandbox.util.SnippetGenerator", {});

    /**
     * Generates Authentic Javascript snippets if a programmatic rendering strategy is selected.
     * 
     * @public
     * @param {object} oSettings The current UI settings object
     * @returns {string} The javascript snippet, or an empty string if testing declarative modes.
     */
    SnippetGenerator.generateJS = function (oSettings) {
        var binding = oSettings.selectedBinding;
        var render = oSettings.selectedRender;
        
        var js = "";
        if (binding === "programmatic") {
            js = 'sap.ui.require(["nz/co/siliconst/ui5/metaui/controls/DynamicHost"], function(DynamicHost) {\n' +
                 '    var host = new DynamicHost({\n' +
                 '        liveUpdate: ' + oSettings.liveUpdate + ',\n' +
                 '        useMessageManager: true\n' +
                 '    });\n' +
                 '    host.setProperty("data", JSON.parse(this.oModel.getProperty("/current/data")));\n' +
                 '    var sSchema = this.oModel.getProperty("/current/schema");\n' +
                 '    host.setProperty("schemaDefinition", sSchema ? JSON.parse(sSchema) : null);\n';
            if (render === "dialog" || render === "js_dialog") {
                js += '    this.getView().addDependent(host);\n' +
                      '    // We pass "auto" to let MetaUI heuristically determine if 80vw is needed\n' +
                      '    host.openInDialog("Programmatic Dialog", "Submit", "Cancel", "auto", this.getView());\n';
            } else {
                js += '    this.byId("hostContainer").addItem(host);\n';
            }
            js += '}.bind(this));';
        } else if (render === "js_scratch" || render === "js_dialog") {
            js = 'sap.ui.require(["nz/co/siliconst/ui5/metaui/controls/DynamicHost"], function(DynamicHost) {\n' +
                 '    var host = new DynamicHost({\n' +
                 '        liveUpdate: ' + oSettings.liveUpdate + ',\n' +
                 '        useMessageManager: true\n' +
                 '    });\n';
            if (binding === "string") {
                js += '    host.bindProperty("dataJson", { path: "/current/data" });\n' +
                      '    host.bindProperty("schemaDefinition", { path: "/current/schema" });\n';
            } else if (binding === "object") {
                js += '    host.bindProperty("data", { path: "/current/dataObj" });\n' +
                      '    host.bindProperty("schemaDefinition", { path: "/current/schemaObj" });\n';
            } else if (binding === "odata") {
                js += `    host.bindElement({ path: "/Employees('E100')", model: "odata" });\n`;
            }
            if (render === "dialog" || render === "js_dialog") {
                js += '    this.getView().addDependent(host);\n' +
                      '    host.openInDialog("Programmatic Dialog", "Submit", "Cancel", "auto", this.getView());\n}.bind(this));';
            } else {
                js += '    this.byId("hostContainer").addItem(host);\n}.bind(this));';
            }
        } else if (render === "dialog" && binding !== "programmatic") {
            js = 'var host = this.byId("hostContainer").getItems()[0];\n' +
                 '// "auto" allows the Engine to automatically snap to 80vw if it detects massive controls\n' +
                 'host.openInDialog("Matrix Dialog", "Extract Data", "Cancel", "auto", this.getView());';
        }
        return js;
    };

    /**
     * Fetches the authentic XML fragment asynchronously based on the selected binding.
     * 
     * @public
     * @param {string} sBindingKey The binding engine identifier (e.g. "string", "object", "odata")
     * @returns {Promise<string>} Promise resolving to the raw XML text.
     */
    SnippetGenerator.fetchXML = function (sBindingKey) {
        if (sBindingKey === "programmatic") return Promise.resolve("");

        var fragmentMap = {
            "string": "StringBinding",
            "object": "ObjectBinding",
            "odata": "ODataBinding"
        };
        var sFragmentName = fragmentMap[sBindingKey];
        if (!sFragmentName) return Promise.resolve("");

        var url = sap.ui.require.toUrl("metaui/sandbox/view/fragments/" + sFragmentName + ".fragment.xml");
        return fetch(url)
            .then(function (res) {
                if (!res.ok) return "Error loading authentic snippet: " + res.statusText;
                return res.text();
            })
            .catch(function (err) {
                return "Failed to fetch authentic snippet: " + err.message;
            });
    };

    return SnippetGenerator;
});
