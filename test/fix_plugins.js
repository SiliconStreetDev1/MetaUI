const fs = require('fs');
const path = require('path');

const controlsDir = path.join(__dirname, '../src/nz/co/siliconst/ui5/metaui/plugins/controls');
const files = fs.readdirSync(controlsDir).filter(f => f.endsWith('.ts') && f !== 'BasePlugin.ts');

files.forEach(file => {
    const filePath = path.join(controlsDir, file);
    let content = fs.readFileSync(filePath, 'utf-8');
    
    // Check if it already has this.fieldKey =
    if (!content.includes('this.fieldKey =')) {
        // Find this.metadata = fieldMetadata; or this.onChange = onChange;
        content = content.replace(/(this\.onChange\s*=\s*onChange;\s*this\.metadata\s*=\s*fieldMetadata;)/g, "$1\n        this.fieldKey = bindingPath.startsWith('/') ? bindingPath.substring(1) : bindingPath;");
        content = content.replace(/(this\.metadata\s*=\s*fieldMetadata;\s*this\.onChange\s*=\s*onChange;)/g, "$1\n        this.fieldKey = bindingPath.startsWith('/') ? bindingPath.substring(1) : bindingPath;");
        fs.writeFileSync(filePath, content, 'utf-8');
        console.log('Fixed:', file);
    }
});

// Fix BasePlugin.ts Logger.error
const basePluginPath = path.join(controlsDir, 'BasePlugin.ts');
let baseContent = fs.readFileSync(basePluginPath, 'utf-8');
baseContent = baseContent.replace(/Logger\.error\("\[MetaUI\]", `setVisualValidationState called on plugin: \$\{this\.fieldKey\}, isValid: \$\{isValid\}`.*?;\r?\n/g, "");
fs.writeFileSync(basePluginPath, baseContent, 'utf-8');
console.log('Fixed BasePlugin.ts');
