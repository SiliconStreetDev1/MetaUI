const fs = require('fs');
const path = require('path');

const controllers = [
    'test/webapp/controller/scenarios/ClientTable.controller.js',
    'test/webapp/controller/scenarios/ComplexClientTable.controller.js'
];

controllers.forEach(p => {
    let c = fs.readFileSync(p, 'utf8');
    
    // Remove attachPropertyChange
    c = c.replace(/\s*\/\/\s*Watch for changes on the records to update the live string[\s\S]*?\.bind\(this\)\);/, '');
    
    // Replace onExtractData with onFieldChange
    const replacement = `onFieldChange: function () {
            if (this.viewModel.getProperty("/liveUpdate")) {
                var aRecords = this.viewModel.getProperty("/records");
                this.viewModel.setProperty("/editorDataString", JSON.stringify(aRecords, null, 2));
            }
        }`;
        
    c = c.replace(/onExtractData:[\s\S]*?(?=,\s*onInboundStringChange:)/, replacement);
    
    fs.writeFileSync(p, c);
    console.log('Fixed', p);
});

const views = [
    'test/webapp/view/scenarios/ClientTable.view.xml',
    'test/webapp/view/scenarios/ComplexClientTable.view.xml'
];

views.forEach(p => {
    let content = fs.readFileSync(p, 'utf8');
    
    let changed = false;
    
    if (content.includes('<!-- Right Pane: Output (Hidden in Wizard) -->')) {
        content = content.replace(/<!-- Right Pane: Output[\s\S]*?<\/VBox>\s*/g, '');
        changed = true;
    }
    
    if (!content.includes('fieldChange=".onFieldChange"')) {
        content = content.replace(/<meta:DynamicHost/g, '<meta:DynamicHost\n                            fieldChange=".onFieldChange"');
        changed = true;
    }
    
    if (changed) {
        fs.writeFileSync(p, content);
        console.log('Fixed', p);
    }
});
