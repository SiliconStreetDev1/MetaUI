sap.ui.define([
    "nz/co/siliconst/ui5/metaui/openapi/OpenApiBuilder",
    "nz/co/siliconst/ui5/metaui/core/SchemaValidator"
], function(OpenApiBuilder, SchemaValidator) {
    "use strict";

    async function runTest() {
        try {
            // Fetch the complex K8s schema
            const response = await fetch("../openapi_schemas/k8s_oa2.json");
            const rawOpenApi = await response.json();
            
            const targetDef = 'io.k8s.api.core.v1.Pod';
            const startTime = performance.now();
            
            // Execute the programmatic mapping
            const finalSchema = OpenApiBuilder.build(rawOpenApi, targetDef);
            const duration = performance.now() - startTime;

            const results = {
                executionTimeMs: Math.round(duration),
                hasDefinitions: !!finalSchema.definitions,
                definitionsCount: finalSchema.definitions ? Object.keys(finalSchema.definitions).length : 0,
                podSpecMapped: !!(finalSchema.properties && finalSchema.properties.spec),
                refWidgetUsed: false,
                structuralErrors: []
            };

            if (results.podSpecMapped) {
                const specProp = finalSchema.properties.spec;
                if (specProp.ui && specProp.ui.widget === "reference") {
                    results.refWidgetUsed = true;
                }
            }

            // Run SchemaValidator structurally
            results.structuralErrors = SchemaValidator.validateSchemaStructure(finalSchema);

            document.getElementById("test-results").innerText = JSON.stringify(results, null, 2);
            document.getElementById("test-results").setAttribute("data-status", "done");

        } catch (err) {
            document.getElementById("test-results").innerText = "ERROR: " + err.message;
            document.getElementById("test-results").setAttribute("data-status", "error");
        }
    }

    runTest();
});
