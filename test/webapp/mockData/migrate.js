const fs = require('fs');
const path = require('path');

function migrateSchema(filePath) {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    if (data.type === 'object') {
        migrateObjectSchema(data);
    } else if (data.type === 'array') {
        migrateArraySchema(data);
    }

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    console.log(`Migrated ${path.basename(filePath)}`);
}

function migrateObjectSchema(schema) {
    const groups = {};
    const defaultGroup = "General";
    const properties = schema.properties || {};

    const tableElements = [];
    let hasFormFields = false;

    for (const key of Object.keys(properties)) {
        const prop = properties[key];
        
        if (prop.type === 'array') {
            tableElements.push({ type: "Control", scope: `#/properties/${key}` });
            if (prop.items && prop.items.properties) {
                migrateArraySchema(prop);
            }
        } else {
            hasFormFields = true;
            const groupName = (prop.ui && prop.ui.group) ? prop.ui.group : defaultGroup;
            if (!groups[groupName]) groups[groupName] = [];
            groups[groupName].push({ type: "Control", scope: `#/properties/${key}` });
        }

        if (prop.ui && prop.ui.group) {
            delete prop.ui.group;
        }
    }

    const uiLayout = [];
    if (hasFormFields) {
        for (const [groupName, elements] of Object.entries(groups)) {
            if (Object.keys(groups).length === 1 && groupName === defaultGroup) {
                uiLayout.push(...elements);
            } else {
                uiLayout.push({
                    type: "Group",
                    label: groupName,
                    elements: elements
                });
            }
        }
    }
    
    uiLayout.push(...tableElements);
    
    if (uiLayout.length > 0) {
        schema.uiLayout = uiLayout;
    }
}

function migrateArraySchema(schema) {
    let items = schema;
    if (schema.type === 'array') {
        items = schema.items;
    }
    if (!items || !items.properties) return;

    const properties = items.properties;
    const uiLayout = [];

    for (const key of Object.keys(properties)) {
        uiLayout.push({ type: "Control", scope: `#/properties/${key}` });
        if (properties[key].ui && properties[key].ui.group) {
            delete properties[key].ui.group;
        }
    }

    if (uiLayout.length > 0) {
        schema.uiLayout = uiLayout;
    }
}

const dir = path.join(__dirname);
const files = fs.readdirSync(dir).filter(f => f.endsWith('Schema.json') || f.endsWith('SchemaComplex.json'));

for (const file of files) {
    if (file === "basic_form_schema.json" || file === "basic_table_schema.json" || file === "mixed_layout_schema.json") {
        // Already manually updated
        continue;
    }
    migrateSchema(path.join(dir, file));
}
