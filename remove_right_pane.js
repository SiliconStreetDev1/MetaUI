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
    
    // Remove the right pane Output VBox
    if (content.includes('<!-- Right Pane: Output (Hidden in Wizard) -->')) {
        content = content.replace(/<!-- Right Pane: Output[\s\S]*?<\/VBox>\s*/g, '');
        changed = true;
    }
    
    if (changed) {
        fs.writeFileSync(p, content);
        console.log('Removed Right Pane from', f);
    }
});
