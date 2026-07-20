const fs = require('fs');
const path = require('path');

const dir = 'c:/projects/Games/MetaUI/test/webapp/view/scenarios';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.view.xml'));

files.forEach(file => {
    const filePath = path.join(dir, file);
    let content = fs.readFileSync(filePath, 'utf8');
    
    const switchStr = '<Switch state="{viewModel>/displayMode}" customTextOn="Display" customTextOff="Edit" tooltip="Toggle Display Mode" />';
    if (!content.includes('Toggle Display Mode')) {
        content = content.replace(/<headerContent>/, `<headerContent>\n            ${switchStr}`);
    }

    if (content.includes('displayMode="false"')) {
        content = content.replace(/displayMode="false"/g, 'displayMode="{viewModel>/displayMode}"');
    } else if (!content.includes('displayMode="{viewModel>/displayMode}"')) {
        content = content.replace(/(<(?:meta:)?(?:GeneratorHost|DynamicHost)[\s\S]*?)(\/?>)/g, (match, p1, p2) => {
            return `${p1} \n                                            displayMode="{viewModel>/displayMode}" ${p2}`;
        });
    }

    fs.writeFileSync(filePath, content);
    console.log('Patched ' + file);
});
