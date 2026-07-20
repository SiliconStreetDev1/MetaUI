sap.ui.define([], function () {
    "use strict";

    /**
     * @class SnippetService
     * @description Provides scenario-specific metadata and integration code snippets for the Playground test application.
     * This acts as a reference for developers learning how to integrate MetaUI.
     */
    return {

        /**
         * Returns the human-readable title for a given scenario key.
         * @param {string} sScenario The routing key of the scenario.
         * @returns {string} The title.
         */
        getScenarioTitle: function (sScenario) {
            var mTitles = {
                "basic_form": "Basic Structured Form",
                "basic_table": "Basic Table Layout",
                "mixed_layout": "Form & Table Mixed Layout",
                "everything": "The 'Everything' Form",
                "string": "String Binding (dataJson)",
                "dialog": "JavaScript API (Dialog Modality)",
                "inference": "Schema Inference (No Schema Provided)",
                "partial": "Partial Inference (additionalProperties: true)",
                "complex": "Complex Hierarchy (Nested Arrays)",
                "wizard": "Wizard Layout Demonstration",
                "live_binding": "Live JSON Output Binding",
                "double_bind": "Double Bind (Same Model Property)"
            };

            return mTitles[sScenario] || "Standard Demonstration";
        },

        /**
         * Returns a detailed description of what is being tested in the scenario.
         * @param {string} sScenario The routing key of the scenario.
         * @returns {string} The description.
         */
        getScenarioDescription: function (sScenario) {
            var mDescriptions = {
                "basic_form": "Demonstrates a standard form layout. Try typing in the fields to see how basic text, numbers, and checkboxes are displayed side-by-side.",
                "basic_table": "Demonstrates how array data is automatically rendered as a grid table. Try adding or deleting rows to see the table dynamically update.",
                "mixed_layout": "Demonstrates combining a standard form and a data table on the same page. This shows how complex screens can be built automatically from a single configuration.",
                "everything": "The kitchen-sink test! This screen contains every single type of input control supported by the system to prove they all work smoothly together.",
                "string": "Demonstrates injecting a raw JSON text string into the form instead of a JavaScript object. Notice how the form builds perfectly from pure text data.",
                "dialog": "Demonstrates opening the dynamic form inside a popup dialog window instead of a full page layout.",
                "inference": "Notice that the 'Schema' tab is completely empty! This demonstrates the system automatically guessing the correct form layout just by looking at the raw data.",
                "partial": "Demonstrates partial schema inference. We provided a few rules in the Schema tab, but allowed the system to automatically build the rest of the form based on the incoming data.",
                "complex": "Demonstrates deeply nested data. Try clicking on the nested tables or arrays to see how the system automatically spawns sub-dialogs to handle complex hierarchies.",
                "wizard": "Demonstrates breaking a massive form into smaller, sequential steps. Notice how you cannot proceed to the next step until all errors in the current step are fixed.",
                "live_binding": "Demonstrates real-time output. Notice how the 'Live Outbound Payload' JSON on the right updates instantly on standard change events (e.g., losing focus or pressing Enter).",
                "dialog_integration": "Demonstrates integrating the MetaUI engine inside a popup Dialog. Uses standard event-driven extraction instead of live two-way syncing.",
                "double_bind": "Demonstrates true two-way data binding. Both the input and output are wired to the exact same source, proving the form can update live without jittering.",
                "string_double_bind": "Demonstrates two-way data binding using pure JSON text strings. Everything updates instantly on change events without requiring any background data conversion.",
                "odata_v4_rap": "Demonstrates integrating MetaUI with an OData V4 backend, simulating a RAP Determination that dynamically calculates and serves the JSON schema when a field changes."
            };

            return mDescriptions[sScenario] || "This scenario demonstrates standard MetaUI rendering and binding capabilities.";
        },

        /**
         * Returns a JavaScript or XML code snippet demonstrating how the current scenario is integrated.
         * @param {string} sScenario The routing key of the scenario.
         * @returns {string} The code snippet.
         */
        getCodeSnippet: function (sScenario) {
            switch (sScenario) {
                case "double_bind":
                    return `<!-- ========================================== -->
<!-- DOUBLE BINDING (TRUE TWO-WAY SYNC) -->
<!-- ========================================== -->
<!-- If you want the form to automatically mutate your original model property as the user types, -->
<!-- you can bind both data and data to the exact same shared property. -->
<!-- The DynamicHost contains internal safeguards to catch the resulting UI5 binding "echoes" -->
<!-- and will silently drop them, keeping your cursor perfectly stable. -->

<mvc:View
    xmlns:mvc="sap.ui.core.mvc"
    xmlns:meta="nz.co.siliconst.ui5.metaui.controls">
    
    <meta:DynamicHost 
        id="myDoubleBoundForm"
        schemaDefinition="{myModel>/schema}" 
        
        <!-- Bind both to the exact same property! -->
        data="{myModel>/mySharedDataObject}" 
        data="{myModel>/mySharedDataObject}"
        
        liveUpdate="true" 
    />
</mvc:View>
`;

                case "string_double_bind":
                    return `<!-- ========================================== -->
<!-- STRING DOUBLE BINDING (RAW JSON INJECTION) -->
<!-- ========================================== -->
<!-- If you don't have an object, and ONLY have a raw JSON string in your model, -->
<!-- you can double-bind both dataJson and dataJson to the exact same string property. -->
<!-- The engine will natively parse it on the way in, and stringify it on the way out! -->

<mvc:View
    xmlns:mvc="sap.ui.core.mvc"
    xmlns:meta="nz.co.siliconst.ui5.metaui.controls">
    
    <meta:DynamicHost 
        schemaDefinition="{myModel>/schema}" 
        
        <!-- Bind both to the exact same string property! -->
        dataJson="{myModel>/myRawJsonString}" 
        dataJson="{myModel>/myRawJsonString}"
        
        liveUpdate="true" 
    />
</mvc:View>
`;

                case "string":
                    return `// ==========================================
// STRING BINDING (RAW JSON INJECTION)
// ==========================================
// Sometimes you don't have a JavaScript object, but rather a raw JSON string from a database or API.
// MetaUI natively supports accepting stringified JSON directly. It will parse it internally and output a stringified result.

var oHost = this.byId("metaHost");

// Instead of 'data', bind to 'dataJson'
oHost.bindProperty("dataJson", "myModel>/rawJsonStringIn");

// Instead of 'data', bind to 'dataJson'
oHost.bindProperty("dataJson", "myModel>/rawJsonStringOut");
`;

                case "dialog":
                    return `// ==========================================
// PROGRAMMATIC JAVASCRIPT API (DIALOGS)
// ==========================================
// You don't need XML to use MetaUI. You can instantiate it entirely in JavaScript 
// and immediately open it in a responsive popup dialog.
// Note: We use DynamicHost so it automatically figures out whether to use Explicit or Inference mode!

sap.ui.require(["nz/co/siliconst/ui5/metaui/controls/DynamicHost"], function(DynamicHost) {
    const host = new DynamicHost({
        schemaDefinition: mySchemaObject, // Optional! If omitted, it will infer from data
        data: myDataObject,
        submit: function(oEvent) {
            const payload = oEvent.getParameter("payload");
            console.log("Extracted Data:", payload);
        }
    });
    
    // Instantly wraps the host in a responsive Dialog
    host.openInDialog("My Dynamic Form", "Save Changes");
});
`;
                case "inference":
                case "partial":
                    return `// ==========================================
// SCHEMA INFERENCE
// ==========================================
// If you don't provide a JSON Schema, or if your schema is incomplete (additionalProperties: true),
// MetaUI will automatically analyze your data and infer a schema on the fly!
// It will detect strings, numbers, booleans, arrays, and nested objects automatically.

<meta:DynamicHost 
    data="{myModel>/myUnstructuredData}" 
    submit=".onSubmit"
/>
`;
                
                case "live_binding":
                    return `// ==========================================
// LIVE BINDING
// ==========================================
// By default, MetaUI only pushes data to 'data' when you click Submit (after validation).
// If you want real-time updates on change events, simply set liveUpdate="true".

<meta:DynamicHost 
    schemaDefinition="{myModel>/mySchema}" 
    data="{myModel>/initialData}" 
    data="{myModel>/liveOutput}"
    liveUpdate="true" 
/>
`;

                default:
                    return `// ==========================================
// STANDARD XML INTEGRATION (UNIDIRECTIONAL)
// ==========================================
// The safest and most common way to integrate MetaUI.
// data is treated as a read-only starting point.
// data receives the final mutated result only after validation passes.
// If the user cancels the form, your original data remains untouched.

<mvc:View
    xmlns:mvc="sap.ui.core.mvc"
    xmlns:meta="nz.co.siliconst.ui5.metaui.controls">
    
    <meta:DynamicHost 
        id="myDynamicForm"
        schemaDefinition="{myModel>/schema}" 
        data="{myModel>/initialData}" 
        data="{myModel>/finalResult}"
        
        fieldChange=".onFieldChange"       <!-- Fired when ANY field is modified -->
        beforeSubmit=".onBeforeSubmit"     <!-- Fired before validation block. Good for cross-field checks. -->
        submit=".onSubmit"                 <!-- Fired after successful validation. -->
    />
</mvc:View>
`;
            }
        }
    };
});
