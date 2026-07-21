const fs = require('fs');
const path = require('path');

const pluginDirs = [
    path.join(__dirname, '../../src/nz/co/siliconst/ui5/metaui/plugins/controls'),
    path.join(__dirname, '../../src/nz/co/siliconst/ui5/metaui/plugins/datasources')
];

function fixFile(filePath) {
    if (!filePath.endsWith('.ts')) return;
    
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Look for applyState logic with the early return
    // Match:
    // if (!this.isEditable) return;
    // const input = this.control as SomeType;
    // input.setEditable(!this.metadata.ui?.readOnly);
    // (and optional other lines)
    // }
    
    // A simpler replacement:
    // Find:
    //             if (!this.isEditable) return;
    //             const input = this.control as XXX;
    //             input.setEditable(YYY);
    //             [optional extra stuff]
    
    // But some use `(this.control as XXX).setEditable(YYY)`
    
    // Let's just do a manual regex replace for the two common patterns.
    
    // Pattern 1: Using a constant `input`
    //             if (!this.isEditable) return;
    //             const input = this.control as Switch;
    //             input.setEnabled(!this.metadata.ui?.readOnly);
    //             input.setRequired(this.metadata.required); // optional
    const regex1 = /if\s*\(!this\.isEditable\)\s*return;\s*(const\s+(\w+)\s*=\s*this\.control\s+as\s+[a-zA-Z0-9]+;)\s*\n\s*\2\.set(Editable|Enabled)\(!this\.metadata\.ui\?\.readOnly\);(\s*\n\s*\2\.setRequired\([^;]+;\))?/g;
    
    let newContent = content.replace(regex1, (match, constDecl, varName, setterType, optionalRequired) => {
        return `${constDecl}
            if (!this.isEditable) {
                ${varName}.set${setterType}(false);
            } else {
                ${varName}.set${setterType}(!this.metadata.ui?.readOnly);${optionalRequired || ''}
            }`;
    });
    
    // Pattern 2: Inline cast
    //             if (!this.isEditable) return;
    //             (this.control as SomeType).setEditable(!this.metadata.ui?.readOnly);
    const regex2 = /if\s*\(!this\.isEditable\)\s*return;\s*\n\s*\(\s*this\.control\s+as\s+([a-zA-Z0-9]+)\s*\)\.set(Editable|Enabled)\(!this\.metadata\.ui\?\.readOnly\);/g;
    
    newContent = newContent.replace(regex2, (match, controlType, setterType) => {
        return `const input = this.control as ${controlType};
            if (!this.isEditable) {
                input.set${setterType}(false);
            } else {
                input.set${setterType}(!this.metadata.ui?.readOnly);
            }`;
    });

    if (content !== newContent) {
        fs.writeFileSync(filePath, newContent, 'utf8');
        console.log(`Fixed: ${path.basename(filePath)}`);
    }
}

pluginDirs.forEach(dir => {
    if (fs.existsSync(dir)) {
        fs.readdirSync(dir).forEach(file => {
            fixFile(path.join(dir, file));
        });
    }
});
