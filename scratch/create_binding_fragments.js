const fs = require('fs');
const path = require('path');

const targetDir = path.join('c:', 'projects', 'Games', 'MetaUI', 'test', 'webapp', 'view', 'fragments');
if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
}

// 1. String Binding
const stringBinding = `<core:FragmentDefinition
    xmlns:core="sap.ui.core"
    xmlns:meta="nz.co.siliconst.ui5.metaui.controls">
    
    <!-- Authentic String Binding: Directly injecting raw JSON text -->
    <meta:DynamicHost
        dataJson="{/current/data}"
        schemaDefinitionJson="{/current/schema}"
        liveUpdate="{/settings/liveUpdate}"
        editable="{/settings/editable}"
        debugMode="{/settings/debugMode}"
        useMessageManager="true"
        error=".onHostError"
        fieldChange=".onHostFieldChange"
        submit=".onHostSubmit" />
        
</core:FragmentDefinition>`;

// 2. Object Binding
const objectBinding = `<core:FragmentDefinition
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

// 3. OData Binding
const odataBinding = `<core:FragmentDefinition
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

const fragments = [
    { key: "StringBinding", content: stringBinding },
    { key: "ObjectBinding", content: objectBinding },
    { key: "ODataBinding", content: odataBinding }
];

fragments.forEach(f => {
    fs.writeFileSync(path.join(targetDir, f.key + '.fragment.xml'), f.content);
    console.log("Created: " + f.key + ".fragment.xml");
});
