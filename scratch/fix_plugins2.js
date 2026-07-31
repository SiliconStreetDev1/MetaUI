const fs = require('fs');
const plugins = fs.readdirSync('src/nz/co/siliconst/ui5/metaui/plugins/controls').filter(f => f.endsWith('Plugin.ts'));
plugins.forEach(p => {
    const path = 'src/nz/co/siliconst/ui5/metaui/plugins/controls/' + p;
    let txt = fs.readFileSync(path, 'utf8');
    
    // Fix oEvent.getParameter
    txt = txt.replace(/oEvent\.getParameter\(/g, '(oEvent as any).getParameter(');
    txt = txt.replace(/\(oEvent as Event\)\.getParameter\(/g, '(oEvent as any).getParameter(');
    
    // Fix attachCapture in hardware plugins
    txt = txt.replace(/\.attachCapture\(/g, '.attachEvent(\'capture\', ');
    
    // Fix getValue in hardware plugins
    txt = txt.replace(/\.getValue\(\)/g, '.getProperty(\'value\')');
    
    fs.writeFileSync(path, txt);
});

// Fix RemoteDropdownPlugin
let rdp = fs.readFileSync('src/nz/co/siliconst/ui5/metaui/plugins/datasources/RemoteDropdownPlugin.ts', 'utf8');
rdp = rdp.replace(/new sap\.m\.Text/g, 'new (sap as any).m.Text');
rdp = rdp.replace(/sap\.ui\.requireSync\(\"sap\/m\/Text\"\)/g, '(sap.ui as any).requireSync(\"sap/m/Text\")');
rdp = rdp.replace(/this\.applyCommonDirectives\(this\.control, /g, 'this.applyCommonDirectives(this.control!, ');
fs.writeFileSync('src/nz/co/siliconst/ui5/metaui/plugins/datasources/RemoteDropdownPlugin.ts', rdp);

// Fix RemoteValueHelpPlugin
let rvh = fs.readFileSync('src/nz/co/siliconst/ui5/metaui/plugins/datasources/RemoteValueHelpPlugin.ts', 'utf8');
rvh = rvh.replace(/oEvent\.getParameter\(/g, '(oEvent as any).getParameter(');
fs.writeFileSync('src/nz/co/siliconst/ui5/metaui/plugins/datasources/RemoteValueHelpPlugin.ts', rvh);

// Fix BasePlugin coreLibrary
let bp = fs.readFileSync('src/nz/co/siliconst/ui5/metaui/plugins/controls/BasePlugin.ts', 'utf8');
bp = bp.replace('import coreLibrary from \"sap/ui/core/library\";', 'import * as coreLibrary from \"sap/ui/core/library\";');
bp = bp.replace('protected generateBindingInfo(bindingPath: string, modelName: string, typeInstance?: unknown, additionalOptions?: Record<string, unknown>): { path: string, model: string, type?: unknown, [key: string]: unknown }', 'protected generateBindingInfo(bindingPath: string, modelName: string, typeInstance?: unknown, additionalOptions?: Record<string, unknown>): any');
fs.writeFileSync('src/nz/co/siliconst/ui5/metaui/plugins/controls/BasePlugin.ts', bp);

// Fix ArrayPlugin DynamicHost
let ap = fs.readFileSync('src/nz/co/siliconst/ui5/metaui/plugins/controls/ArrayPlugin.ts', 'utf8');
ap = ap.replace(/import { IPropertyMetadata } from \"\.\.\/\.\.\/interfaces\/ISchema\";/, 'import { IPropertyMetadata, ISchema } from \"../../interfaces/ISchema\";\nimport { IPluginValidationResult } from \"../../interfaces/IPlugin\";');
ap = ap.replace(/editable: this\.isEditable \/\/ Pass the display mode down to the child Engine!/, 'editable: this.isEditable, layoutBudget: parentBudget } as any); //');
ap = ap.replace(/host\.attachSubmit\(\(e: Event\) => {/, 'host.attachEvent(\"submit\", (e: any) => {');
fs.writeFileSync('src/nz/co/siliconst/ui5/metaui/plugins/controls/ArrayPlugin.ts', ap);
