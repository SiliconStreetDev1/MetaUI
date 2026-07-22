const fs = require('fs');
const path = require('path');

const targetDir = path.join('c:', 'projects', 'Games', 'MetaUI', 'test', 'webapp', 'view', 'scenarios');

// 1. Kitchen Sink (Standard Property Binding with Objects)
const kitchenSink = `<core:FragmentDefinition
    xmlns:core="sap.ui.core"
    xmlns:meta="nz.co.siliconst.ui5.metaui.controls">
    
    <!-- Authentic Object Binding: Both Data and Schema are parsed JS objects -->
    <meta:DynamicHost
        data="{/current/dataObj}"
        schemaDefinition="{/current/schemaObj}"
        liveUpdate="{/settings/liveUpdate}"
        editable="{/settings/editable}"
        debugMode="{/settings/debugMode}"
        useMessageManager="true"
        error=".onHostError"
        fieldChange=".onHostFieldChange"
        submit=".onHostSubmit" />
        
</core:FragmentDefinition>`;

// 2. Hybrid Inference (No Schema required, just Data Object)
const hybridInference = `<core:FragmentDefinition
    xmlns:core="sap.ui.core"
    xmlns:meta="nz.co.siliconst.ui5.metaui.controls">
    
    <!-- Authentic Inference: We pass an incomplete schema, and it infers the rest -->
    <meta:DynamicHost
        data="{/current/dataObj}"
        schemaDefinition="{/current/schemaObj}"
        liveUpdate="{/settings/liveUpdate}"
        editable="{/settings/editable}"
        debugMode="{/settings/debugMode}"
        useMessageManager="true"
        error=".onHostError"
        fieldChange=".onHostFieldChange"
        submit=".onHostSubmit" />
        
</core:FragmentDefinition>`;

// 3. Full Inference (No schema at all)
const fullInference = `<core:FragmentDefinition
    xmlns:core="sap.ui.core"
    xmlns:meta="nz.co.siliconst.ui5.metaui.controls">
    
    <!-- Authentic Inference: No schema provided! Forms generate entirely from data. -->
    <meta:DynamicHost
        data="{/current/dataObj}"
        liveUpdate="{/settings/liveUpdate}"
        editable="{/settings/editable}"
        debugMode="{/settings/debugMode}"
        useMessageManager="true"
        error=".onHostError"
        fieldChange=".onHostFieldChange"
        submit=".onHostSubmit" />
        
</core:FragmentDefinition>`;

// 4. OData V4 (Element Binding)
const odataV4 = `<core:FragmentDefinition
    xmlns:core="sap.ui.core"
    xmlns:meta="nz.co.siliconst.ui5.metaui.controls">
    
    <!-- Authentic OData Binding: Resolving the global 'odata' model natively -->
    <meta:DynamicHost
        binding="{odata>/Employees('E100')}"
        liveUpdate="{/settings/liveUpdate}"
        editable="{/settings/editable}"
        debugMode="{/settings/debugMode}"
        useMessageManager="true"
        error=".onHostError"
        fieldChange=".onHostFieldChange"
        submit=".onHostSubmit" />
        
</core:FragmentDefinition>`;

// For the rest, we use standard object binding like Kitchen Sink
const scenarios = [
    { key: "kitchen_sink", content: kitchenSink },
    { key: "hybrid_inference", content: hybridInference },
    { key: "full_inference", content: fullInference },
    { key: "wizard", content: kitchenSink },
    { key: "array_table", content: kitchenSink },
    { key: "deep_structure", content: kitchenSink },
    { key: "odata_v4", content: odataV4 }
];

scenarios.forEach(s => {
    fs.writeFileSync(path.join(targetDir, s.key + '.fragment.xml'), s.content);
    console.log("Created: " + s.key + ".fragment.xml");
});
