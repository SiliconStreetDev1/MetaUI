/**
 * Generates the TypeScript accessor declarations that UI5 creates at runtime from
 * control metadata (getX/setX, attachX/detachX/fireX) and merges them into each
 * control class by declaration merging.
 *
 * Why not @ui5/ts-interface-generator: it requires the metadata to be an inline
 * object literal on the class. DynamicHost and GeneratorHost deliberately share one
 * imported HOST_CONTROL_METADATA constant, which is what guarantees contract parity
 * between the facade and the inner host. Inlining it to satisfy that tool would
 * duplicate 19 properties and 9 events across two files and destroy the invariant.
 * This script reads the shared constant instead.
 *
 *   node scripts/generate-control-accessors.js            rewrite the blocks
 *   node scripts/generate-control-accessors.js --check    fail if they are stale
 */
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const ROOT_DIR = path.resolve(__dirname, '..');
const CONTROL_DIR = 'src/nz/co/siliconst/ui5/metaui/controls';

// `publicApi` marks a control in the public tier of .github/scripts/api-surface.js: its generated
// declarations then carry the @public tag that tier requires. The other two are internal.
const CONTROLS = [
    { file: `${CONTROL_DIR}/DynamicHost.ts`, className: 'DynamicHost', publicApi: true },
    { file: `${CONTROL_DIR}/host/GeneratorHost.ts`, className: 'GeneratorHost' },
    { file: `${CONTROL_DIR}/BaseHardwareControl.ts`, className: 'BaseHardwareControl' }
];

const BEGIN = '// <generated-accessors>';
const END = '// </generated-accessors>';

// UI5 metadata type -> TypeScript type. "any" maps to unknown: the lint gate bans
// any, and unknown is this codebase's convention for an unconstrained value.
const TYPE_MAP = {
    'any': 'unknown',
    'object': 'object',
    'string': 'string',
    'boolean': 'boolean',
    'int': 'number',
    'float': 'number',
    'function': '(...args: unknown[]) => unknown',
    'sap.ui.core.CSSSize': 'CSSSize',
    'sap.ui.core.ValueState': 'ValueState',
    'sap.ui.core.Control': 'Control'
};

// ManagedObject already declares these four events for binding type validation, with its
// own parameter types. MetaUI's metadata reuses two of the names, which works at runtime
// because the control's own event registry handles them, but a narrower redeclaration here
// is not assignable to the base class signature. Consumers get ManagedObject's accessors
// for these; everything else is typed. Recorded in docs/wiki/SupportedFeatures.md.
const BASE_CLASS_EVENTS = new Set(['validationError', 'validationSuccess', 'parseError', 'formatError']);

// TypeScript types the generated block uses that the control file must already import.
const REQUIRED_IMPORT = {
    'CSSSize': 'sap/ui/core/library',
    'ValueState': 'sap/ui/core/library',
    'Control': 'sap/ui/core/Control',
    'Event': 'sap/ui/base/Event'
};

function fail(message) {
    console.error(`Error: ${message}`);
    process.exit(1);
}

function parse(absPath) {
    return ts.createSourceFile(absPath, fs.readFileSync(absPath, 'utf8'), ts.ScriptTarget.Latest, true);
}

function literalOf(node) {
    if (ts.isStringLiteral(node)) return node.text;
    if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
    if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
    if (ts.isPropertyAccessExpression(node)) return node.getText();
    return undefined;
}

/** Reads an object literal into a plain nested record of literals. */
function objectOf(node) {
    const out = {};
    if (!node || !ts.isObjectLiteralExpression(node)) return out;
    for (const prop of node.properties) {
        if (!ts.isPropertyAssignment(prop)) continue;
        const key = ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name) ? prop.name.text : undefined;
        if (!key) continue;
        out[key] = ts.isObjectLiteralExpression(prop.initializer)
            ? objectOf(prop.initializer)
            : literalOf(prop.initializer);
    }
    return out;
}

/** Finds `static [readonly] metadata = ...` on the class and resolves it to an object literal. */
function resolveMetadata(sourceFile, className, absPath) {
    let initializer;
    ts.forEachChild(sourceFile, (node) => {
        if (!ts.isClassDeclaration(node) || !node.name || node.name.text !== className) return;
        for (const member of node.members) {
            if (!ts.isPropertyDeclaration(member) || !member.name) continue;
            if (member.name.getText() !== 'metadata') continue;
            initializer = member.initializer;
        }
    });
    if (!initializer) fail(`${className}: no 'static metadata' property found.`);

    if (ts.isObjectLiteralExpression(initializer)) {
        return objectOf(initializer);
    }
    if (!ts.isIdentifier(initializer)) {
        fail(`${className}: metadata is neither an object literal nor an identifier.`);
    }

    // Shared constant: follow the import to its declaring module.
    const name = initializer.text;
    let moduleSpec;
    ts.forEachChild(sourceFile, (node) => {
        if (!ts.isImportDeclaration(node) || !node.importClause) return;
        const bindings = node.importClause.namedBindings;
        if (!bindings || !ts.isNamedImports(bindings)) return;
        if (bindings.elements.some((el) => el.name.text === name)) {
            moduleSpec = node.moduleSpecifier.text;
        }
    });
    if (!moduleSpec) fail(`${className}: metadata identifier '${name}' is not imported.`);

    const targetPath = path.resolve(path.dirname(absPath), `${moduleSpec}.ts`);
    if (!fs.existsSync(targetPath)) fail(`${className}: cannot resolve '${moduleSpec}' to a .ts file.`);

    const target = parse(targetPath);
    let found;
    ts.forEachChild(target, (node) => {
        if (!ts.isVariableStatement(node)) return;
        for (const decl of node.declarationList.declarations) {
            if (ts.isIdentifier(decl.name) && decl.name.text === name && decl.initializer) {
                found = decl.initializer;
            }
        }
    });
    if (!found) fail(`${className}: '${name}' not found in ${moduleSpec}.`);
    return objectOf(found);
}

function tsTypeFor(uiType, context) {
    if (uiType === undefined) return 'unknown';
    const mapped = TYPE_MAP[uiType];
    if (!mapped) fail(`${context}: unmapped UI5 metadata type '${uiType}'. Add it to TYPE_MAP.`);
    return mapped;
}

/**
 * Formats a method signature, wrapping onto multiple lines when a single line would
 * exceed the 140-character limit the lint gate enforces.
 */
function signature(name, generics, params, returnType) {
    const oneLine = `    ${name}${generics}(${params.join(', ')}): ${returnType};`;
    if (oneLine.length <= 140) {
        return oneLine;
    }
    const lines = [`    ${name}${generics}(`];
    params.forEach((p, i) => {
        lines.push(`        ${p}${i === params.length - 1 ? '' : ','}`);
    });
    lines.push(`    ): ${returnType};`);
    return lines.join('\n');
}

function cap(name) {
    return name.charAt(0).toUpperCase() + name.slice(1);
}

/**
 * Method names the class implements itself. UI5 only generates an accessor when the
 * class does not already define one, and redeclaring it here produces an overload that
 * does not match the implementation. DynamicHost hand-writes several (getSchemaDefinitions
 * delegates to the inner host, for instance), so those are left alone.
 */
function declaredMethods(sourceFile, className) {
    const names = new Set();
    ts.forEachChild(sourceFile, (node) => {
        if (!ts.isClassDeclaration(node) || !node.name || node.name.text !== className) return;
        for (const member of node.members) {
            if ((ts.isMethodDeclaration(member) || ts.isPropertyDeclaration(member)) && member.name) {
                names.add(member.name.getText());
            }
        }
    });
    return names;
}

function buildBlock(className, metadata, skipNames, publicApi) {
    const publicTag = publicApi ? '\n * @public' : '';
    const used = new Set();
    const noteType = (t) => {
        for (const key of Object.keys(REQUIRED_IMPORT)) {
            if (new RegExp(`\\b${key}\\b`).test(t)) used.add(key);
        }
    };

    const eventInterfaces = [];
    const members = [];
    const skipped = [];
    /** Emits a declaration unless the class already implements that method. */
    const emit = (methodName, declaration) => {
        if (skipNames.has(methodName)) {
            if (!skipped.includes(methodName)) skipped.push(methodName);
            return;
        }
        members.push(declaration);
    };

    const properties = metadata.properties || {};
    for (const name of Object.keys(properties)) {
        const t = tsTypeFor(properties[name].type, `${className}.${name}`);
        noteType(t);
        emit(`get${cap(name)}`, `    get${cap(name)}(): ${t};`);
        emit(`set${cap(name)}`, `    set${cap(name)}(${name}: ${t}): this;`);
    }

    const aggregations = metadata.aggregations || {};
    for (const name of Object.keys(aggregations)) {
        const agg = aggregations[name];
        // Hidden aggregations are internal plumbing; UI5 generates accessors but a
        // consumer has no business calling them, so they stay out of the public types.
        if (agg.visibility === 'hidden') continue;
        const t = tsTypeFor(agg.type, `${className}.${name}`);
        noteType(t);
        if (agg.multiple === false) {
            emit(`get${cap(name)}`, `    get${cap(name)}(): ${t} | null;`);
            emit(`set${cap(name)}`, `    set${cap(name)}(${name}: ${t}): this;`);
            emit(`destroy${cap(name)}`, `    destroy${cap(name)}(): this;`);
        } else {
            emit(`get${cap(name)}`, `    get${cap(name)}(): ${t}[];`);
            emit(`add${cap(name)}`, `    add${cap(name)}(${name}: ${t}): this;`);
            emit(`insert${cap(name)}`, `    insert${cap(name)}(${name}: ${t}, index: number): this;`);
            emit(`remove${cap(name)}`, `    remove${cap(name)}(${name}: ${t} | number | string): ${t} | null;`);
            emit(`removeAll${cap(name)}`, `    removeAll${cap(name)}(): ${t}[];`);
            emit(`destroy${cap(name)}`, `    destroy${cap(name)}(): this;`);
        }
    }

    const events = metadata.events || {};
    for (const name of Object.keys(events)) {
        if (BASE_CLASS_EVENTS.has(name)) continue;
        const params = (events[name] || {}).parameters || {};
        const paramNames = Object.keys(params);
        const paramsTypeName = `${className}$${cap(name)}EventParameters`;

        if (paramNames.length > 0) {
            const fields = paramNames.map((p) => {
                const t = tsTypeFor(params[p].type, `${className}.${name}.${p}`);
                noteType(t);
                return `    ${p}?: ${t};`;
            });
            eventInterfaces.push(
                `/**\n * Parameters delivered with the \`${name}\` event of \`${className}\`.${publicTag}\n */\n` +
                `export interface ${paramsTypeName} {\n${fields.join('\n')}\n}`
            );
        } else {
            eventInterfaces.push(
                `/**\n * Parameters delivered with the \`${name}\` event of \`${className}\` (none).${publicTag}\n */\n` +
                `export type ${paramsTypeName} = object;`
            );
        }

        used.add('Event');
        const ev = `Event<${paramsTypeName}, ${className}>`;
        emit(`attach${cap(name)}`, signature(
            `attach${cap(name)}`, '', [`fn: (event: ${ev}) => void`, 'listener?: object'], 'this'
        ));
        emit(`attach${cap(name)}`, signature(
            `attach${cap(name)}`, '<T>', ['data: T', `fn: (event: ${ev}, data: T) => void`, 'listener?: object'], 'this'
        ));
        emit(`detach${cap(name)}`, signature(
            `detach${cap(name)}`, '', [`fn: (event: ${ev}) => void`, 'listener?: object'], 'this'
        ));
        emit(`fire${cap(name)}`, signature(`fire${cap(name)}`, '', [`parameters?: ${paramsTypeName}`], 'this'));
    }

    const body = [
        BEGIN,
        '// Generated by scripts/generate-control-accessors.js from this control\'s UI5 metadata.',
        '// Do not edit by hand: run `npm run gen:accessors`. `npm run lint` fails if it is stale.',
        '',
        ...(eventInterfaces.length > 0 ? [eventInterfaces.join('\n\n'), ''] : []),
        '/**',
        ` * Accessors UI5 generates at runtime from \`${className}\`'s metadata, declared here so`,
        ' * TypeScript consumers can call them. Merged into the class by declaration merging.',
        ...(publicApi ? [' * @public'] : []),
        ' */',
        `export default interface ${className} {`,
        ...members,
        '}',
        END
    ].join('\n');

    return { body, used, skipped };
}

function importedNames(sourceFile) {
    const names = new Set();
    ts.forEachChild(sourceFile, (node) => {
        if (!ts.isImportDeclaration(node) || !node.importClause) return;
        if (node.importClause.name) names.add(node.importClause.name.text);
        const bindings = node.importClause.namedBindings;
        if (bindings && ts.isNamedImports(bindings)) {
            for (const el of bindings.elements) names.add(el.name.text);
        }
    });
    return names;
}

const checkOnly = process.argv.includes('--check');
const stale = [];

for (const control of CONTROLS) {
    const absPath = path.join(ROOT_DIR, control.file);
    if (!fs.existsSync(absPath)) fail(`${control.file} not found.`);

    const sourceFile = parse(absPath);
    const metadata = resolveMetadata(sourceFile, control.className, absPath);
    const skipNames = declaredMethods(sourceFile, control.className);
    const { body, used, skipped } = buildBlock(control.className, metadata, skipNames, control.publicApi === true);

    const have = importedNames(sourceFile);
    const missing = [...used].filter((name) => !have.has(name));
    if (missing.length > 0) {
        fail(
            `${control.file} must import ${missing.map((m) => `${m} (from "${REQUIRED_IMPORT[m]}")`).join(', ')} ` +
            `for the generated accessors.`
        );
    }

    const original = fs.readFileSync(absPath, 'utf8');
    const eol = original.includes('\r\n') ? '\r\n' : '\n';
    const bodyEol = body.split('\n').join(eol);

    let updated;
    const beginIdx = original.indexOf(BEGIN);
    if (beginIdx === -1) {
        updated = `${original.replace(/\s*$/, '')}${eol}${eol}${bodyEol}${eol}`;
    } else {
        const endIdx = original.indexOf(END, beginIdx);
        if (endIdx === -1) fail(`${control.file}: ${BEGIN} without a matching ${END}.`);
        updated = original.slice(0, beginIdx) + bodyEol + original.slice(endIdx + END.length);
    }

    if (updated === original) {
        console.log(`- ${control.className}: up to date`);
        continue;
    }
    if (checkOnly) {
        stale.push(control.file);
        continue;
    }
    fs.writeFileSync(absPath, updated);
    const propCount = Object.keys(metadata.properties || {}).length;
    const eventCount = Object.keys(metadata.events || {}).length;
    const note = skipped.length > 0 ? ` (skipped ${skipped.length} already implemented: ${skipped.join(', ')})` : '';
    console.log(`- ${control.className}: wrote accessors for ${propCount} properties, ${eventCount} events${note}`);
}

if (stale.length > 0) {
    console.error('Error: generated accessor blocks are stale in:');
    for (const f of stale) console.error(`    ${f}`);
    console.error("Run 'npm run gen:accessors' and commit the result.");
    process.exit(1);
}
