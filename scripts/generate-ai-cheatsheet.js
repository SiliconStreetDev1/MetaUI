/**
 * Generates `docs/wiki/AI_Schema_CheatSheet.md` from the authoritative TypeScript schema
 * contracts (`ISchema.ts`), constants (`MetaUIConstants.ts`), and plugin registrations
 * (`DefaultPluginBootstrapper.ts`).
 *
 *   node scripts/generate-ai-cheatsheet.js            rewrite docs/wiki/AI_Schema_CheatSheet.md
 *   node scripts/generate-ai-cheatsheet.js --check    fail if docs/wiki/AI_Schema_CheatSheet.md is stale
 */
"use strict";

const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const ROOT_DIR = path.resolve(__dirname, "..");
const ISCHEMA_PATH = path.join(ROOT_DIR, "src/nz/co/siliconst/ui5/metaui/interfaces/ISchema.ts");
const CONSTANTS_PATH = path.join(ROOT_DIR, "src/nz/co/siliconst/ui5/metaui/constants/MetaUIConstants.ts");
const BOOTSTRAPPER_PATH = path.join(ROOT_DIR, "src/nz/co/siliconst/ui5/metaui/core/DefaultPluginBootstrapper.ts");
const CHEATSHEET_PATH = path.join(ROOT_DIR, "docs/wiki/AI_Schema_CheatSheet.md");

function parseFile(absPath) {
    return ts.createSourceFile(absPath, fs.readFileSync(absPath, "utf8"), ts.ScriptTarget.Latest, true);
}

/** Extracts `export const NAME = { KEY: "value", ... } as const` maps from MetaUIConstants.ts. */
function extractConstObject(sf, constName) {
    const out = {};
    ts.forEachChild(sf, (node) => {
        if (!ts.isVariableStatement(node)) return;
        for (const decl of node.declarationList.declarations) {
            if (!ts.isIdentifier(decl.name) || decl.name.text !== constName || !decl.initializer) continue;
            let init = decl.initializer;
            if (ts.isAsExpression(init)) init = init.expression;
            if (!ts.isObjectLiteralExpression(init)) continue;
            for (const prop of init.properties) {
                if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name) && ts.isStringLiteral(prop.initializer)) {
                    out[prop.name.text] = prop.initializer.text;
                }
            }
        }
    });
    return out;
}

/** Extracts property names (in source order) from an exported interface in ISchema.ts. */
function extractInterfaceProperties(sf, interfaceName) {
    const props = [];
    ts.forEachChild(sf, (node) => {
        if (!ts.isInterfaceDeclaration(node) || node.name.text !== interfaceName) return;
        for (const member of node.members) {
            if (ts.isPropertySignature(member) && member.name) {
                const name = ts.isIdentifier(member.name) || ts.isStringLiteral(member.name)
                    ? member.name.text
                    : member.name.getText(sf);
                const typeText = member.type ? member.type.getText(sf) : "unknown";
                props.push({ name, typeText });
            }
        }
    });
    return props;
}

/** Extracts string literal union members from a type alias in ISchema.ts. */
function extractStringUnionFromTypeAlias(sf, typeName) {
    const values = [];
    ts.forEachChild(sf, (node) => {
        if (!ts.isTypeAliasDeclaration(node) || node.name.text !== typeName) return;
        if (ts.isUnionTypeNode(node.type)) {
            for (const t of node.type.types) {
                if (ts.isLiteralTypeNode(t) && ts.isStringLiteral(t.literal)) {
                    values.push(t.literal.text);
                }
            }
        }
    });
    return values;
}

function extractLayoutElementTypes(sf) {
    const values = [];
    ts.forEachChild(sf, (node) => {
        if (!ts.isInterfaceDeclaration(node) || node.name.text !== "ILayoutElement") return;
        for (const member of node.members) {
            if (
                ts.isPropertySignature(member) &&
                member.name &&
                member.name.getText(sf) === "type" &&
                member.type &&
                ts.isUnionTypeNode(member.type)
            ) {
                for (const t of member.type.types) {
                    if (ts.isLiteralTypeNode(t) && ts.isStringLiteral(t.literal)) {
                        values.push(t.literal.text);
                    }
                }
            }
        }
    });
    return values;
}

/** Extracts (schemaType, widgetName) pairs from DefaultPluginBootstrapper.ts in registration order. */
function extractBootstrapperWidgets(sf, schemaTypes, widgetTypes) {
    const byType = new Map();
    for (const t of Object.values(schemaTypes)) {
        byType.set(t, []);
    }
    const visit = (node) => {
        if (
            ts.isCallExpression(node) &&
            ts.isPropertyAccessExpression(node.expression) &&
            node.expression.name.text === "registerPluginPath" &&
            node.arguments.length >= 3
        ) {
            const typeArg = node.arguments[0];
            const widgetArg = node.arguments[1];
            let resolvedType = null;
            if (
                ts.isPropertyAccessExpression(typeArg) &&
                ts.isIdentifier(typeArg.expression) &&
                typeArg.expression.text === "SCHEMA_TYPE"
            ) {
                resolvedType = schemaTypes[typeArg.name.text];
            } else if (ts.isStringLiteral(typeArg)) {
                resolvedType = typeArg.text;
            }
            let resolvedWidget = null;
            if (ts.isIdentifier(widgetArg) && widgetArg.text === "undefined") {
                resolvedWidget = null;
            } else if (ts.isStringLiteral(widgetArg)) {
                resolvedWidget = widgetArg.text;
            } else if (
                ts.isPropertyAccessExpression(widgetArg) &&
                ts.isIdentifier(widgetArg.expression) &&
                widgetArg.expression.text === "WIDGET_TYPE"
            ) {
                resolvedWidget = widgetTypes[widgetArg.name.text];
            }
            if (resolvedType && resolvedWidget) {
                const list = byType.get(resolvedType) || [];
                if (!list.includes(resolvedWidget)) {
                    list.push(resolvedWidget);
                }
                byType.set(resolvedType, list);
            }
        }
        ts.forEachChild(node, visit);
    };
    visit(sf);
    return byType;
}

function buildCheatSheet() {
    const ischemaSf = parseFile(ISCHEMA_PATH);
    const constantsSf = parseFile(CONSTANTS_PATH);
    const bootstrapperSf = parseFile(BOOTSTRAPPER_PATH);

    const schemaTypes = extractConstObject(constantsSf, "SCHEMA_TYPE");
    const widgetTypes = extractConstObject(constantsSf, "WIDGET_TYPE");
    const layoutStrategies = extractConstObject(constantsSf, "LAYOUT_STRATEGY");
    const renderModes = extractConstObject(constantsSf, "RENDER_MODE");

    const rootSchemaProps = extractInterfaceProperties(ischemaSf, "ISchema");
    const fieldProps = extractInterfaceProperties(ischemaSf, "IPropertyMetadata");
    const uiProps = extractInterfaceProperties(ischemaSf, "IUIDirective");
    const dsProps = extractInterfaceProperties(ischemaSf, "IDataSourceConfig");
    const layoutElements = extractLayoutElementTypes(ischemaSf);
    const policyEffects = extractStringUnionFromTypeAlias(ischemaSf, "PolicyEffectType");
    const policyConditions = extractInterfaceProperties(ischemaSf, "IPolicyCondition");
    const widgetsByType = extractBootstrapperWidgets(bootstrapperSf, schemaTypes, widgetTypes);

    // Verify every WIDGET_TYPE constant is registered in DefaultPluginBootstrapper
    const allRegisteredWidgets = new Set();
    for (const list of widgetsByType.values()) {
        for (const w of list) allRegisteredWidgets.add(w);
    }
    for (const [key, val] of Object.entries(widgetTypes)) {
        if (!allRegisteredWidgets.has(val)) {
            throw new Error(`WIDGET_TYPE.${key} ("${val}") in MetaUIConstants.ts is not registered in DefaultPluginBootstrapper.ts`);
        }
    }

    // 1. Build Root Schema Level (ISchema) JSON block dynamically from ISchema.ts + LAYOUT_STRATEGY
    const strategyOptions = Object.values(layoutStrategies).map((s) => `"${s}"`).join(", ");
    const rootPropRenderers = {
        title: `    "title": "My Form",`,
        type: `    "type": "object", // or "array"`,
        layoutStrategy: `    "layoutStrategy": "${layoutStrategies.FORM || "form"}", // Options: ${strategyOptions}`,
        ui: `    "ui": {}, // Optional root IUIDirective`,
        uiLayout: `    "uiLayout": [], // (See Section 3)`,
        uiPolicies: `    "uiPolicies": [], // (See Section 4)`,
        required: `    "required": [], // Array of required property keys`,
        readOnly: `    "readOnly": false,`,
        maxItems: `    "maxItems": 100,`,
        minItems: `    "minItems": 0,`,
        uniqueItems: `    "uniqueItems": false,`,
        maxProperties: `    "maxProperties": 50,`,
        minProperties: `    "minProperties": 0,`,
        oneOf: `    "oneOf": [],`,
        anyOf: `    "anyOf": [],`,
        allOf: `    "allOf": [],`,
        additionalProperties: `    "additionalProperties": false, // boolean | IPropertyMetadata`,
        definitions: `    "definitions": {},`,
        items: `    "items": {}, // Root array item IPropertyMetadata when type === "array"`,
        properties: `    "properties": {\n        // Child fields go here...\n    }`
    };
    const rootOrder = [
        "title", "type", "layoutStrategy", "ui", "uiLayout", "uiPolicies",
        "required", "readOnly", "maxItems", "minItems", "uniqueItems",
        "maxProperties", "minProperties", "oneOf", "anyOf", "allOf",
        "additionalProperties", "definitions", "items", "properties"
    ];
    const rootPropNames = new Set(rootSchemaProps.map((p) => p.name));
    for (const p of rootSchemaProps) {
        if (!rootPropRenderers[p.name]) {
            rootPropRenderers[p.name] = `    "${p.name}": null, // ${p.typeText}`;
            rootOrder.splice(rootOrder.length - 1, 0, p.name);
        }
    }
    const activeRootOrder = rootOrder.filter((name) => rootPropNames.has(name));
    const rootSchemaBlock = "{\n" + activeRootOrder.map((name) => rootPropRenderers[name]).join("\n") + "\n}";

    // 2. Verify all IPropertyMetadata properties are accounted for in Section 2B
    const knownFieldProps = new Set([
        "type", "$ref", "title", "description", "ui", "required", "format", "const",
        "maxLength", "minLength", "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum",
        "multipleOf", "pattern", "valueHelp", "enum", "readOnly", "writeOnly", "nullable",
        "default", "example", "maxItems", "minItems", "uniqueItems", "maxProperties",
        "minProperties", "additionalProperties", "properties", "items", "uiLayout",
        "oneOf", "anyOf", "allOf", "not", "discriminator"
    ]);
    const extraFieldLines = [];
    for (const p of fieldProps) {
        if (!knownFieldProps.has(p.name)) {
            extraFieldLines.push("- `" + p.name + "`: " + p.typeText);
        }
    }
    const fieldTypesList = [
        schemaTypes.STRING, schemaTypes.NUMBER, schemaTypes.INTEGER,
        schemaTypes.BOOLEAN, schemaTypes.OBJECT, schemaTypes.ARRAY, schemaTypes.DATE
    ].filter(Boolean).map((t) => "`\"" + t + "\"`").join(", ");

    // 3. Build IUIDirective + IDataSourceConfig JSON block dynamically from ISchema.ts + RENDER_MODE
    const dsPropRenderers = {
        url: `            "url": "/api/items",`,
        keyField: `            "keyField": "id",`,
        textField: `            "textField": "name",`,
        dataPath: `            "dataPath": "results",`,
        modelName: `            "modelName": ""`
    };
    for (const p of dsProps) {
        if (!dsPropRenderers[p.name]) {
            dsPropRenderers[p.name] = `            "${p.name}": ""`;
        }
    }
    const dsBlockLines = dsProps.map((p, idx) => {
        const line = dsPropRenderers[p.name];
        const isLast = idx === dsProps.length - 1;
        return isLast ? line.replace(/,$/, "") : (line.endsWith(",") ? line : line + ",");
    });

    const renderModeComment = Object.values(renderModes).map((m) => `"${m}"`).join(" | ");
    const uiPropRenderers = {
        label: `        "label": "My Label",`,
        placeholder: `        "placeholder": "Enter text...",`,
        widget: `        "widget": "textArea",     // The explicit UI control (See Section 2D)`,
        readOnly: `        "readOnly": false,`,
        visible: `        "visible": true,`,
        enabled: `        "enabled": true,`,
        isKey: `        "isKey": false,`,
        visibleOn: `        "visibleOn": "$root.OtherField === true",`,
        enabledOn: `        "enabledOn": "$root.OtherField === true",`,
        format: `        "format": "email",        // Triggers native format validators`,
        valueState: `        "valueState": "None",     // Initial ValueState ("None", "Error", "Warning", "Success", "Information")`,
        rows: `        "rows": 4,                // For TextAreas and code editors`,
        expandable: `        "expandable": true,       // Adds a full-screen expand button to textArea / codeEditor`,
        fullWidth: `        "fullWidth": true,        // Bypasses layout constraints`,
        formatter: `        "formatter": "textCase",  // Single formatter name`,
        formatters: `        "formatters": ["textCase"], // Chained formatter names`,
        args: `        "args": "upper",          // Formatter arguments`,
        validators: `        "validators": [],         // Array of validator names or { name, args }`,
        valueHelp: `        "valueHelp": [],          // Inline [{ key, text }] options`,
        options: `        "options": {},            // Extended widget options (values, min, max, step, etc.)`,
        dataSource: `        "dataSource": {           // Remote REST/OData dataSource config\n${dsBlockLines.join("\n")}\n        },`,
        dialogButtonText: `        "dialogButtonText": "Edit Details",`,
        layoutBudget: `        "layoutBudget": 50,`,
        renderMode: `        "renderMode": "${renderModes.INLINE || "inline"}",   // ${renderModeComment}`,
        labelSpan: `        "labelSpan": 4,           // Root-level SimpleForm label span override (1-12 for label-beside-field, or 0 to hide labels)`,
        controlProps: `        "controlProps": {\n            "placeholder": "Enter text..."\n        }`
    };
    const uiOrder = [
        "label", "placeholder", "widget", "readOnly", "visible", "enabled", "isKey",
        "visibleOn", "enabledOn", "format", "valueState", "rows", "expandable",
        "fullWidth", "formatter", "formatters", "args", "validators", "valueHelp",
        "options", "dataSource", "dialogButtonText", "layoutBudget", "renderMode",
        "labelSpan", "controlProps"
    ];
    const uiPropNames = new Set(uiProps.map((p) => p.name));
    for (const p of uiProps) {
        if (!uiPropRenderers[p.name]) {
            uiPropRenderers[p.name] = `        "${p.name}": null,`;
            uiOrder.splice(uiOrder.length - 1, 0, p.name);
        }
    }
    const activeUiOrder = uiOrder.filter((name) => uiPropNames.has(name));
    const uiDirectiveBlock = activeUiOrder.map((name) => uiPropRenderers[name]).join("\n");

    // 4. Build Widget Registry Dictionary lines from DefaultPluginBootstrapper + WIDGET_TYPE
    const stringWidgets = (widgetsByType.get("string") || []).filter((w) => w !== "default");
    const rawNumberWidgets = widgetsByType.get("number") || [];
    const preferredNumOrder = ["step", "slider", "rating", "select"];
    const numberWidgets = [
        ...preferredNumOrder.filter((w) => rawNumberWidgets.includes(w)),
        ...rawNumberWidgets.filter((w) => !preferredNumOrder.includes(w))
    ];
    const booleanWidgets = widgetsByType.get("boolean") || [];
    const dateWidgets = widgetsByType.get("date") || [];
    const arrayWidgets = widgetsByType.get("array") || [];
    const objectWidgets = widgetsByType.get("object") || [];
    const objectWidgetAnnotations = {
        dictionaryMap: " (Key-Value Map)",
        reference: " (`$ref` Sub-Form)",
        polymorphic: " (`oneOf`/`anyOf` Selector)",
        location: " (Geolocation Picker)"
    };
    const stringWidgetsFormatted = [
        "*(omitted)* / `default` (`sap.m.Input`)",
        ...stringWidgets.map((w) => "`" + w + "`")
    ].join(", ");
    const numberWidgetsFormatted = [
        "*(omitted)* (`sap.m.Input` `type=\"Number\"`)",
        ...numberWidgets.map((w) => "`" + w + "`")
    ].join(", ");
    const booleanWidgetsFormatted = [
        "*(omitted)* (`sap.m.CheckBox`)",
        ...booleanWidgets.map((w) => "`" + w + "`")
    ].join(", ");
    const dateWidgetsFormatted = [
        "*(omitted)* (`sap.m.DatePicker`)",
        ...dateWidgets.map((w) => "`" + w + "`")
    ].join(", ");
    const arrayWidgetsFormatted = [
        "*(omitted)* (Array Dialog / Inline `TableLayout`)",
        ...arrayWidgets.map((w) => "`" + w + "`")
    ].join(", ");
    const objectWidgetsFormatted = [
        "*(omitted)* (Object Dialog / Inline `FormLayout`)",
        ...objectWidgets.map((w) => "`" + w + "`" + (objectWidgetAnnotations[w] || ""))
    ].join(", ");

    // 5. Layout Element Types & PBRE Effects/Operators from ISchema.ts
    const layoutElementsFormatted = layoutElements.map((e) => "`" + e + "`").join(", ");
    const policyEffectsFormatted = policyEffects.map((e) => "`" + e + "`").join(", ");
    const policyConditionsFormatted = policyConditions.map((c) => "`" + c.name + "`").join(", ");

    const S_1_TO_2A = "# MetaUI Framework - The Ultimate AI Instruction Manual\n\nThis document is the exhaustive ground truth for the MetaUI Engine (`nz.co.siliconst.ui5.metaui`). It provides comprehensive instructions on how to **use**, **configure**, **orchestrate**, and **extend** the framework.\n\n> **CRITICAL RULE FOR AI AGENTS**: Do not hallucinate properties, widgets, or methods that are not explicitly documented here. This document is forensically mapped to the source code.\n\n---\n\n## 1. Using the Framework (Consumption)\n\nMetaUI is an engine that dynamically generates SAPUI5 Fiori layouts based on JSON metadata. It manages its own internal data model to protect your parent application from invalid data until submission.\n\n### A. Declarative Usage (XML Views)\nYou can embed it directly into any Fiori view via the `DynamicHost` wrapper.\n```xml\n<mvc:View xmlns:mvc=\"sap.ui.core.mvc\" xmlns:meta=\"nz.co.siliconst.ui5.metaui.controls\">\n    <meta:DynamicHost\n        id=\"myHost\"\n        width=\"100%\"                        <!-- sap.ui.core.CSSSize (default \"100%\") -->\n        height=\"auto\"                       <!-- sap.ui.core.CSSSize (default \"auto\") -->\n        dataJson=\"{/rawJsonString}\"         <!-- OR 'data' for JS objects -->\n        schemaDefinition=\"{/jsonSchema}\"    <!-- Optional -->\n        liveUpdate=\"false\"                  <!-- false: Transactional Mode (protects parent model). true: Continuous Two-Way Binding -->\n        useMessageManager=\"true\"            <!-- Routes errors to global MessagePopover -->\n        submit=\".onFormSubmit\"              <!-- Fired when validation passes -->\n        fieldChange=\".onFieldChange\"        <!-- Fired when a field's change event commits -->\n    />\n</mvc:View>\n```\n\n**Host Sizing & Containment**: `DynamicHost` is containment-safe by default (`width=\"100%\"`, `height=\"auto\"`, `min-width: 0`, `max-width: 100%`, `box-sizing: border-box`) and will never push a parent flex, grid, or table cell wider than the width offered to it. When embedding `DynamicHost` inside a table column (such as `sap.m.Table` or Fiori Elements `<macros:Table>`), set an explicit sensible column width on the column definition so the responsive form has room to lay out cleanly rather than stacking into a narrow strip.\n\n### B. Programmatic Usage & Dialogs (JS/TS)\nThe Engine can be spawned dynamically in controllers to instantly generate a popup dialog, completely detached from the view's XML.\n```javascript\nimport DynamicHost from \"nz/co/siliconst/ui5/metaui/controls/DynamicHost\";\n\nconst host = new DynamicHost({\n    dataJson: '{\"name\": \"Alice\"}', \n    schemaDefinition: '{\"type\":\"object\",\"properties\":{\"name\":{\"type\":\"string\"}}}'\n});\n\nhost.attachSubmit(function(oEvent) {\n    const payload = oEvent.getParameter(\"payload\"); // Clean JSON object emitted by the form after successful validation\n});\n\n// Required for UI5 model inheritance\nthis.getView().addDependent(host); \n// Opens natively in a sap.m.Dialog with configurable buttons\nhost.openInDialog(\"Edit Profile\", \"Save\", \"Cancel\", \"600px\", this.getView());\n```\n\n### C. Tri-Binding Engine & Data Inference\nThe framework accepts data through three paths:\n1. **`dataJson`**: Raw stringified JSON (ideal for REST APIs).\n2. **`data`**: Native JS Objects.\n3. **`ODataDelegate`**: If bound to an OData V4 context (`host.bindElement(\"/Entity('1')\")`), the engine intercepts the binding and syncs natively.\n\n**Full Data Inference (No Schema Required):** If you bind `dataJson` or `data` but omit `schemaDefinition`, the internal `SchemaNormalizer` will automatically parse the data, infer types, and generate a layout instantly.\n\n---\n\n## 2. The Exhaustive Schema Dictionary\n\nWhen generating or editing a MetaUI JSON Schema (`schemaDefinition`), you must **only** use the properties defined below. \n\n### A. Root Schema Level (`ISchema`)\n";
    const S_2B_HEADER = "### B. Field Metadata (`IPropertyMetadata`)\nEvery field inside `properties` supports standard JSON-Schema validation and MetaUI-specific `ui` orchestration.\n\n**Standard Validations & Metadata:**\n";
    const S_2B_AFTER_TYPE = "- `$ref`: string (e.g., `\"#/definitions/Address\"`, `\"#/components/schemas/Address\"`)\n- `title`, `description`: string (fallback label and control tooltip)\n- `required`: boolean | string[]\n- `format`: string (`\"email\"`, `\"uri\"`, `\"url\"`, `\"iban\"`, `\"date\"`, `\"date-time\"`, `\"time\"`, `\"password\"`)\n- `const`: unknown\n- `maxLength`, `minLength`: number\n- `minimum`, `maximum`, `exclusiveMinimum`, `exclusiveMaximum`: number | boolean\n- `multipleOf`: number\n- `pattern`: string (regex). **Hard limits:** max 512 characters, and a repetition shape that is provably ambiguous \u2014 a quantifier over a group built only from variable-length elements (`(a+)+`, `(a?)*`, `(\\w+\\s?)*`) or over an alternation whose branches can start with the same token (`(a|a)+`, `(a|)+`) \u2014 is refused as a denial-of-service risk and reported as a schema configuration error on the field. Anchor repeated groups with at least one fixed atom (`([a-z]+\\.)+`, `(\\d{4})+`) and they are accepted.\n- `valueHelp`: Array of `{\"key\": \"id\", \"text\": \"Label\"}` or `{ \"url\": \"/api\", \"keyPath\": \"id\", \"textPath\": \"name\" }`\n- `enum`: (string | number | boolean | null)[]\n- `readOnly`, `writeOnly`, `nullable`: boolean (`writeOnly` properties are stripped from the inbound payload by `SchemaNormalizer.stripWriteOnlyValues` before seeding `StateManager`)\n- `default`, `example`: unknown (scalar `example` values serve as the control placeholder fallback when `ui.placeholder` is omitted)";
    const S_2B_ARRAY_TO_2C = "\n\n**Array & Object Validations:**\n- `maxItems`, `minItems`, `uniqueItems` (Arrays)\n- `maxProperties`, `minProperties`, `additionalProperties` (Objects)\n- `properties`, `items`, `uiLayout` (Nested recursion)\n\n**Polymorphism:**\n- `oneOf`, `anyOf`, `allOf`, `not`: `IPropertyMetadata[]` / `IPropertyMetadata`\n- `discriminator`: `{ \"propertyName\": \"type\", \"mapping\": {} }`\n\n### C. The `ui` Directive (`IUIDirective`)\nThe `ui` block dictates exactly how the field renders visually.\n```jsonc\n{\n    \"fieldName\": {\n        \"type\": \"string\",\n        \"ui\": {\n";
    const S_2C_RULES_TO_2D = "\n        }\n    }\n}\n```\n**`controlProps` rules \u2014 a generated schema that breaks any of these has the entry silently dropped at render time (with a logged warning), so do not emit them:**\n\n1. The property must be **declared by the generated UI5 control** (checked against the control's own metadata). Invented property names are refused.\n2. Its declared UI5 type must resolve to a **scalar primitive** \u2014 `string`, `boolean`, `int` or `float`. UI5 enums and `sap.ui.core.CSSSize` qualify; anything typed `object`, `function`, `any`, or an array of those, does not.\n3. **MetaUI-owned state properties are refused:** `value`, `selectedKey`, `selectedKeys`, `selected`, `dateValue`, `tokens`, `editable`, `enabled`, `visible`, `valueState`, `valueStateText`. Use `visibleOn`, `enabledOn`, `readOnly` and the validation pipeline instead.\n4. **Raw-markup properties are refused:** `htmlText`, `html`, `innerHTML`, `content`. There is no `controlProps` route for injecting HTML; use `ui.widget: \"richText\"`, whose bound value is rendered through `sap.m.FormattedText`.\n5. A `sap.ui.core.URI` property (`href`, `src`, `icon`, \u2026) is accepted but protocol-checked. Only `http:`, `https:`, `mailto:`, `tel:`, relative paths (`/`, `./`, `../`, `#`), `data:image/*;base64,`, `sap-icon://\u2026` and `\"\"` survive; anything else becomes `\"\"`. This applies to bound values too.\n\n*`controlProps` also supports SAPUI5 Expression Bindings referencing `meta>` (the internal form data model) or `metaui>` (rewritten to the host's `modelName`). The binding grammar is the same one `visibleOn` / `enabledOn` use: model paths, `{= \u2026 }` expressions, `$root.` / `$row.` references and OData key predicates are accepted; UI5 complex-binding object syntax (`{path:'\u2026', formatter:'\u2026'}`) is refused. On the root schema's `ui` block, `labelSpan` (`0`\u2013`12`) or `controlProps` (`labelSpanS`, `labelSpanM`, `labelSpanL`, `labelSpanXL`, `emptySpan*`, `columns*`) configures `SimpleForm`'s `ResponsiveGridLayout` spans (default `labelSpanS: 12`, `M/L/XL: 4`) \u2014 these root-level keys are read directly as layout numbers and do not go through the per-field property gate above.*\n\n**`ui.dataSource.url` rules:** the URL is resolved against the document origin and must end up on `http:` or `https:`. Protocol-relative (`//host/...`) and backslash-prefixed values are refused outright. A cross-origin endpoint is permitted by default and logged once per origin; an application can tighten this to same-origin or an explicit allowlist with `UrlValidator.setDataSourceOriginPolicy()`, in which case a refused URL means the control simply renders with no remote items (and a logged warning). The same policy governs a remote `schemaDefinition` URL.\n\n### D. The Widget Registry Dictionary\nYou may specify these values in `ui.widget` to force the Engine to use a specific Fiori control (mapped via `DefaultPluginBootstrapper.ts` and `MetaUIConstants.ts`):\n\n";
    const S_3_HEADER = "\n\n---\n\n## 3. Layout Orchestration (`uiLayout`)\n\nBy default, the engine generates fields sequentially. To orchestrate complex Fiori layouts, define the `uiLayout` array at the schema root.\n\n";
    const S_3_BODY_TO_4 = "\n\n```json\n{\n    \"uiLayout\": [\n        {\n            \"type\": \"Group\",\n            \"label\": \"Personal Info\",\n            \"elements\": [\n                { \"type\": \"Control\", \"scope\": \"#/properties/FirstName\" },\n                { \n                    \"type\": \"HorizontalLayout\", \n                    \"elements\": [\n                        { \"type\": \"Control\", \"scope\": \"#/properties/Age\" },\n                        { \"type\": \"Control\", \"scope\": \"#/properties/Gender\" }\n                    ]\n                }\n            ]\n        }\n    ]\n}\n```\n\n---\n\n## 4. Policy-Based Rules Engine (PBRE)\n\nThe root-level `uiPolicies` array dynamically toggles field states natively without writing controller code.\n\n";
    const S_4_BODY_TO_END = "\n\n```json\n{\n    \"uiPolicies\": [\n        {\n            \"effect\": \"Hide\",\n            \"targets\": [\"/SpouseName\"],\n            \"condition\": { \"StringEquals\": { \"/MaritalStatus\": \"Single\" } }\n        },\n        {\n            \"effect\": \"Invalidate\",\n            \"targets\": [\"/Age\"],\n            \"message\": \"Must be 18 or older\",\n            \"condition\": { \"NumericLessThan\": { \"/Age\": 18 } }\n        }\n    ]\n}\n```\n\n---\n\n## 5. Extending the Framework (Custom Plugins)\n\nMetaUI strictly adheres to a **Plugin-First Architecture**. Global inline `<script>` tags or DOM hacks are strictly forbidden. To add a new UI control, you must write a plugin.\n\n### A. Creating a Plugin\nCreate a class extending `BasePlugin`. You must implement `render()`, `getValue()`, and `applyState()`.\n\n```typescript\nimport { BasePlugin } from \"nz/co/siliconst/ui5/metaui/plugins/controls/BasePlugin\";\nimport { IPropertyMetadata } from \"nz/co/siliconst/ui5/metaui/interfaces/ISchema\";\nimport Control from \"sap/ui/core/Control\";\nimport Input from \"sap/m/Input\";\n\nexport class MyCustomPlugin extends BasePlugin {\n    public render(\n        fieldMetadata: IPropertyMetadata,\n        bindingPath: string,\n        modelName: string = \"meta\",\n        engineScopeId?: string,\n        onChange?: (isValid: boolean, fieldKey?: string, errorMessage?: string, controlId?: string) => void\n    ): Control {\n        this.initialize(fieldMetadata, bindingPath, modelName, onChange);\n        \n        this.control = new Input({\n            id: this.generateStableId(engineScopeId, bindingPath),\n            value: this.generateBindingInfo(bindingPath, modelName),\n            change: () => {\n                this.notifyChange();\n            }\n        });\n        \n        // CRITICAL: Automatically applies visibleOn, enabledOn, controlProps, etc.\n        this.applyCommonDirectives(this.control, fieldMetadata, modelName);\n        return this.control;\n    }\n\n    protected getValue(): unknown { return (this.control as Input).getValue(); }\n    protected applyState(): void { /* Handle ReadOnly / Editable toggling natively */ }\n}\n```\n\n### B. Registering the Plugin\nMap it in `PluginRegistry.ts` so the engine knows how to resolve the `ui.widget` hint:\n```typescript\nimport { PluginRegistry } from \"nz/co/siliconst/ui5/metaui/core/PluginRegistry\";\n\nPluginRegistry.getInstance().registerPluginPath(\"string\", \"myCustomWidget\", \"my/custom/app/plugins/MyCustomPlugin\");\n```\n\n### C. Built-in & Custom Validation / Formatting Rules\n`PipelineManager` registers <!-- DOC_COUNT:validators -->14 built-in validators (`required`, `minLength`, `maxLength`, `pattern`, `range`, `multipleOf`, `arrayItems`, `email`, `url`, `iban`, `enum`, `const`, `integer`, `objectProperties`), <!-- DOC_COUNT:formatters -->4 built-in formatters (`date`, `phone`, `textCase`, `currency`), and <!-- DOC_COUNT:parsers -->3 built-in presentational parsers (`date`, `phone`, `currency`).\n\n- **Presentational vs Transforming Formatters**:\n  - `phone`, `currency`, and `date` implement `IParser.parse()` (`PipelineManager.parsers`) and are **presentational** (reversible display masks). On user edits, `BasePlugin.notifyChange()` runs `GlobalPipeline.runParsers()` (in reverse order when `ui.formatters` is an array) so the model stores the raw unformatted value and validators evaluate the raw value.\n  - `textCase` (`args`: `\"upper\"`, `\"lower\"`, `\"title\"`) does not implement `parse()` and is **transforming** (lossy normalization). Its formatted output is written directly into the data model and validated.\n- **`phone` Formatter Accepted Input Shapes & Validation**:\n  - `PhoneFormatterPlugin` (`ui.formatter: \"phone\"` or `ui.formatters: [\"phone\"]`) formats and parses:\n    1. 10-digit US numbers: `\"5551234567\"` <-> `\"(555) 123-4567\"`\n    2. 11-digit US numbers with leading `1` or `+1`: `\"+15551234567\"` / `\"15551234567\"` -> `\"+1 (555) 123-4567\"` (parsed back to `\"+15551234567\"` when formatted with leading `+`, or `\"15551234567\"` when entered as 11 digits without `+`)\n    3. International numbers with 2-digit country code (`2` CC digits + `7\u201310` subscriber digits): `\"+64211234567\"` <-> `\"+64 211234567\"`\n    4. International numbers with 3-digit country code (`3` CC digits + `6\u201310` subscriber digits): `\"+3531234567\"` <-> `\"+353 1234567\"`\n    5. Any other string is returned unchanged by both `format()` and `parse()`.\n  - **No Built-in Phone Validator**: `ui.format: \"phone\"` (and `ui.formatter: \"phone\"`) performs **no validation**. Only `\"email\"`, `\"url\"` / `\"uri\"`, and `\"iban\"` map to built-in format validators. Validate phone numbers with a schema `pattern` (e.g., `\"pattern\": \"^\\\\+?\\\\d{10,15}$\"` or `\"pattern\": \"^\\\\d{10}$\"`), which runs against the parsed raw value in the model.\n\nYou can also register custom synchronous validation rules into `GlobalPipeline`:\n```typescript\nimport { GlobalPipeline } from \"nz/co/siliconst/ui5/metaui/core/PipelineManager\";\nimport { IValidationResult } from \"nz/co/siliconst/ui5/metaui/interfaces/IPipeline\";\n\nGlobalPipeline.validators.register(\"customMatchRule\", {\n    validate: function(value: unknown, args?: unknown): IValidationResult {\n        const expected = (args as { expected?: unknown } | undefined)?.expected;\n        return { isValid: value === expected };\n    }\n});\n```\nUsage in schema:\n```json\n{\n    \"ui\": {\n        \"validators\": [\n            { \"name\": \"customMatchRule\", \"args\": { \"expected\": \"Hello\" } }\n        ]\n    }\n}\n```\n\n### D. Custom Policy Plugins (Conditions & Effects)\nThe Policy-Based Rules Engine (PBRE) evaluates schema rules dynamically. If a standard condition operator doesn't meet requirements, you can write an `IPolicyConditionPlugin`.\n\n```typescript\nimport { IPolicyConditionPlugin } from \"nz/co/siliconst/ui5/metaui/interfaces/IPolicyPlugin\";\nimport { PluginRegistry } from \"nz/co/siliconst/ui5/metaui/core/PluginRegistry\";\n\nexport class CustomConditionPlugin implements IPolicyConditionPlugin {\n    public evaluate(conditionPayload: unknown, data: unknown, resolvePointer: (d: unknown, p: string) => unknown): boolean {\n        if (!conditionPayload || typeof conditionPayload !== \"object\" || Array.isArray(conditionPayload)) {\n            return false;\n        }\n        void data;\n        void resolvePointer;\n        return true;\n    }\n}\n\n// Register it\nPluginRegistry.getInstance().registerPolicyConditionPath(\n    \"MyCustomCheck\", \n    \"my/custom/app/plugins/policies/conditions/CustomConditionPlugin\"\n);\n```\n\n---\n\n## 6. Automated Testing & Double-Entry Verification\n\nWhenever any TypeScript file in `src/` or scenario in `test/` is modified, execute the three-step verification loop:\n\n```bash\nnpx tsc --noEmit -p .\nnpm run build\nnpm test\n```\n\n- **The Double-Entry Rule (`test/webapp/test/TestOracle.js`)**: Any plugin added to `DefaultPluginBootstrapper.ts` or validator/formatter added to `PipelineManager.ts` **must** also be added to `test/webapp/test/TestOracle.js`.\n- **Detailed Testing Blueprint**: See [`docs/wiki/09_Testing_Routines_and_Automation.md`](09_Testing_Routines_and_Automation.md) for the complete testing architecture (`TestOracle.js`, QUnit physical DOM unit tests, QUnit integration/E2E matrix tests, Fiori Sandbox route verification, and OpenAPI stress tests).\n";

    return (
        S_1_TO_2A +
        "```jsonc\n" +
        rootSchemaBlock +
        "\n```\n\n" +
        S_2B_HEADER +
        "- `type`: " + fieldTypesList + "\n" +
        S_2B_AFTER_TYPE +
        (extraFieldLines.length > 0 ? "\n" + extraFieldLines.join("\n") : "") +
        S_2B_ARRAY_TO_2C +
        uiDirectiveBlock +
        S_2C_RULES_TO_2D +
        "- **String Widgets**: " + stringWidgetsFormatted + ".\n" +
        "- **Number & Integer Widgets**: " + numberWidgetsFormatted + ".\n" +
        "- **Boolean Widgets**: " + booleanWidgetsFormatted + ".\n" +
        "- **Date Widgets**: " + dateWidgetsFormatted + ".\n" +
        "- **Array Widgets**: " + arrayWidgetsFormatted + ".\n" +
        "- **Object Widgets**: " + objectWidgetsFormatted + "." +
        S_3_HEADER +
        "**Supported Element Types:** " + layoutElementsFormatted +
        S_3_BODY_TO_4 +
        "- **Effects**: " + policyEffectsFormatted + " (via `IPolicyEffectPlugin`).\n" +
        "- **Operators**: " + policyConditionsFormatted + " (via `IPolicyConditionPlugin`)." +
        S_4_BODY_TO_END
    );
}

const checkOnly = process.argv.includes("--check");
const existing = fs.existsSync(CHEATSHEET_PATH) ? fs.readFileSync(CHEATSHEET_PATH, "utf8") : "";
const eol = existing.includes("\r\n") ? "\r\n" : "\n";
const generated = buildCheatSheet().split("\n").join(eol);

if (existing === generated) {
    process.stdout.write("- docs/wiki/AI_Schema_CheatSheet.md: up to date" + "\n");
    process.exit(0);
}

if (checkOnly) {
    process.stderr.write("Error: docs/wiki/AI_Schema_CheatSheet.md is stale relative to ISchema.ts / MetaUIConstants.ts." + "\n");
    process.stderr.write("Run 'node scripts/generate-ai-cheatsheet.js' and commit the result." + "\n");
    process.exit(1);
}

fs.writeFileSync(CHEATSHEET_PATH, generated, "utf8");
process.stdout.write("- docs/wiki/AI_Schema_CheatSheet.md: regenerated from ISchema.ts + MetaUIConstants.ts" + "\n");
