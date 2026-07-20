const fs = require('fs');
const path = require('path');
const dir = 'test/webapp/view/scenarios';

fs.readdirSync(dir).filter(f => f.endsWith('.view.xml')).forEach(f => {
    const p = path.join(dir, f);
    let content = fs.readFileSync(p, 'utf8');
    
    // Ignore views that are specifically intended for ClientTable structure (which uses {viewModel>metadataString})
    if (f === "ClientTable.view.xml" || f === "ComplexClientTable.view.xml") {
        return;
    }
    
    let changed = false;
    
    if (content.includes('data=""')) {
        content = content.replace(/data=""/g, 'data="{viewModel>/parsedData}"');
        changed = true;
    }
    
    if (content.includes('dataJson="{viewModel>/liveOutputString}"')) {
        content = content.replace(/dataJson="\{viewModel>\/liveOutputString\}"/g, 'dataJson="{viewModel>/rawJsonStringIn}"');
        changed = true;
    }
    
    if (changed) {
        fs.writeFileSync(p, content);
        console.log('Fixed', f);
    }
});
