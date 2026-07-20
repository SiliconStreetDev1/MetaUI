const fs = require('fs');
const path = require('path');
const dir = 'test/webapp/view/scenarios';

fs.readdirSync(dir).filter(f => f.endsWith('.view.xml')).forEach(f => {
    const p = path.join(dir, f);
    let content = fs.readFileSync(p, 'utf8');
    
    // Ignore views that are specifically intended for ClientTable structure
    if (f === "ClientTable.view.xml" || f === "ComplexClientTable.view.xml") {
        return;
    }
    
    let changed = false;
    
    // The previous regex messed up parsing and inserted:
    // schemaDefinition="{viewModel
    // fieldChange=".onFieldChange">/parsedSchema}"
    // OR something similar.
    
    // We will fix it by looking for the inserted fieldChange chunk and removing it, 
    // then restoring the > bracket, and then cleanly adding fieldChange to the opening tag.
    
    if (content.includes('fieldChange=".onFieldChange">')) {
        // Strip out the injected invalid line with the closing bracket
        content = content.replace(/\n\s*fieldChange="\.onFieldChange">/g, '>');
        
        // Add fieldChange to the first line of <meta:DynamicHost safely
        content = content.replace(/<meta:DynamicHost/g, '<meta:DynamicHost\n                            fieldChange=".onFieldChange"');
        changed = true;
    }
    
    if (changed) {
        fs.writeFileSync(p, content);
        console.log('Fixed syntax in', f);
    }
});
