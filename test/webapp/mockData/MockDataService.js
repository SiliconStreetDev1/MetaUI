sap.ui.define([
    "sap/m/MessageToast"
], function (MessageToast) {
    "use strict";

    /**
     * MockDataService
     * Resolves and fetches the appropriate JSON schema and mock data
     * for a given scenario to keep the controllers clean.
     */
    return {
        loadScenario: function(sScenario) {
            var sSchemaUrl = sap.ui.require.toUrl("metaui/sandbox/mockData/mockSchema.json");
            var sDataUrl = sap.ui.require.toUrl("metaui/sandbox/mockData/mockData.json");

            if (sScenario === "complex") {
                sSchemaUrl = sap.ui.require.toUrl("metaui/sandbox/mockData/mockSchemaComplex.json");
                sDataUrl = sap.ui.require.toUrl("metaui/sandbox/mockData/mockDataComplex.json");
            } else if (sScenario === "wizard") {
                sSchemaUrl = sap.ui.require.toUrl("metaui/sandbox/mockData/mockWizardSchema.json");
                sDataUrl = sap.ui.require.toUrl("metaui/sandbox/mockData/mockWizardData.json");
            } else if (sScenario === "basic_form") {
                sSchemaUrl = sap.ui.require.toUrl("metaui/sandbox/mockData/basic_form_schema.json");
                sDataUrl = sap.ui.require.toUrl("metaui/sandbox/mockData/basic_form_data.json");
            } else if (sScenario === "basic_table") {
                sSchemaUrl = sap.ui.require.toUrl("metaui/sandbox/mockData/basic_table_schema.json");
                sDataUrl = sap.ui.require.toUrl("metaui/sandbox/mockData/basic_table_data.json");
            } else if (sScenario === "mixed_layout") {
                sSchemaUrl = sap.ui.require.toUrl("metaui/sandbox/mockData/mixed_layout_schema.json");
                sDataUrl = sap.ui.require.toUrl("metaui/sandbox/mockData/mixed_layout_data.json");
            } else if (sScenario === "hierarchy_test") {
                sSchemaUrl = sap.ui.require.toUrl("metaui/sandbox/mockData/hierarchy_test.json");
                sDataUrl = sap.ui.require.toUrl("metaui/sandbox/mockData/hierarchy_test_data.json");
            }

            return Promise.all([
                fetch(sSchemaUrl).then(res => res.text()),
                fetch(sDataUrl).then(res => res.text())
            ]).then((results) => {
                var schemaTxt = results[0];
                var dataTxt = results[1];

                if (sScenario === "inference") {
                    schemaTxt = ""; // Erase schema to force inference
                }

                return {
                    schemaString: schemaTxt,
                    dataString: dataTxt
                };
            }).catch(err => {
                console.error("Error loading JSON", err);
                MessageToast.show("Failed to load mock files.");
                throw err;
            });
        }
    };
});
