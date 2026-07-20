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
    
    // add fieldChange=".onFieldChange" to <meta:DynamicHost if not present
    if (content.includes('<meta:DynamicHost') && !content.includes('fieldChange=".onFieldChange"')) {
        content = content.replace(/<meta:DynamicHost([^>]*?)(\/?)>/, function(match, attributes, selfClosing) {
            return `<meta:DynamicHost${attributes}\n                            fieldChange=".onFieldChange"${selfClosing}>`;
        });
        changed = true;
    }
    
    if (changed) {
        fs.writeFileSync(p, content);
        console.log('Added fieldChange to', f);
    }
});
