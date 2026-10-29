const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');

console.log('Preparing publish...');

if (!fs.existsSync(distDir)) {
    console.error('Error: dist directory not found. Run npm run build first.');
    process.exit(1);
}

// 1. Rename dist/resources to dist/src (UI5 default source path)
const resourcesDir = path.join(distDir, 'resources');
const srcDir = path.join(distDir, 'src');

if (fs.existsSync(resourcesDir)) {
    if (fs.existsSync(srcDir)) {
        fs.rmSync(srcDir, { recursive: true, force: true });
    }
    fs.renameSync(resourcesDir, srcDir);
    console.log('- Renamed dist/resources to dist/src');
} else {
    console.log('- dist/resources not found, might have already been renamed');
}

// 1b. Prune artifacts no consumer can use.
//
// Measured before this step existed: 74.3% of the published tarball was source maps
// and raw .ts sources. The maps are only read by a devtools pane open against the
// consumer's node_modules, and the .ts files are byte-identical to src/ while the
// same text is ALSO embedded as `sourcesContent` inside those maps -- three copies
// of every source file. TypeScript resolves the .d.ts, not the .ts, and UI5 loads
// the .js, so neither is reachable.
//
// ui5.yaml already sets `removeSourceFiles: true`; it is not taking effect, so the
// prune is done here where it can be verified rather than assumed.
const prunedExtensions = { maps: 0, sources: 0, bytes: 0 };
(function prune(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            prune(full);
            continue;
        }
        const isMap = entry.name.endsWith('.js.map') || entry.name.endsWith('.d.ts.map');
        // .d.ts must survive; only the hand-written .ts sources go.
        const isRawSource = entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts');
        if (!isMap && !isRawSource) {
            continue;
        }
        prunedExtensions.bytes += fs.statSync(full).size;
        prunedExtensions[isMap ? 'maps' : 'sources'] += 1;
        fs.unlinkSync(full);
    }
})(srcDir);

// Fail rather than ship a half-pruned tree: a surviving .ts means the walk missed a
// directory, and a surviving .d.ts loss means the filter is wrong in the other
// direction. Both are silent packaging defects of exactly the kind this guards.
const survivors = [];
(function check(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            check(full);
        } else if (entry.name.endsWith('.map') || (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts'))) {
            survivors.push(path.relative(distDir, full));
        }
    }
})(srcDir);
if (survivors.length > 0) {
    console.error(`Error: ${survivors.length} prunable file(s) survived, e.g. ${survivors[0]}`);
    process.exit(1);
}
console.log(
    `- Pruned ${prunedExtensions.maps} source maps and ${prunedExtensions.sources} raw .ts sources ` +
    `(${(prunedExtensions.bytes / (1024 * 1024)).toFixed(2)}MB)`
);

// 2. Copy and clean package.json
const pkgPath = path.join(rootDir, 'package.json');
const pkgDistPath = path.join(distDir, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

delete pkg.devDependencies;
delete pkg.scripts;
if (pkg.dependencies && pkg.dependencies['ui5-tooling-transpile']) {
    delete pkg.dependencies['ui5-tooling-transpile'];
    if (Object.keys(pkg.dependencies).length === 0) {
        delete pkg.dependencies;
    }
}
if (pkg.ui5 && pkg.ui5.dependencies) {
    pkg.ui5.dependencies = pkg.ui5.dependencies.filter(dep => dep !== 'ui5-tooling-transpile');
    if (pkg.ui5.dependencies.length === 0) {
        delete pkg.ui5.dependencies;
        if (Object.keys(pkg.ui5).length === 0) delete pkg.ui5;
    }
}

// index.d.ts is the generated roll-up that references every emitted .d.ts.
// It must ship, or TypeScript consumers resolve no types at all.
// npm only auto-includes LICENSE and README from the package root, which is
// dist/ here, so both are copied in below and listed explicitly.
pkg.files = ["index.d.ts", "src", "ui5.yaml", "README.md", "LICENSE", "CHANGELOG.md"];

// The roll-up is emitted next to dist/resources and references "./resources/...".
// Step 1 renamed that folder to src, so those references must be repointed or all
// of them dangle inside the published tarball.
const typesEntry = path.join(distDir, 'index.d.ts');
if (!fs.existsSync(typesEntry)) {
    console.error('Error: dist/index.d.ts not found. Run npm run build first.');
    process.exit(1);
}
const rollup = fs.readFileSync(typesEntry, 'utf8');
const repointed = rollup.replace(/(["'(])\.\/resources\//g, '$1./src/');
fs.writeFileSync(typesEntry, repointed);

const stillPointingAtResources = (repointed.match(/\.\/resources\//g) || []).length;
if (stillPointingAtResources > 0) {
    console.error(`Error: ${stillPointingAtResources} reference(s) in index.d.ts still point at ./resources/.`);
    process.exit(1);
}

// Verify every referenced declaration actually exists in the published layout.
const referenced = [...repointed.matchAll(/path\s*=\s*"(\.\/src\/[^"]+)"/g)].map((m) => m[1]);
const missing = referenced.filter((rel) => !fs.existsSync(path.join(distDir, rel)));
if (missing.length > 0) {
    console.error(`Error: index.d.ts references ${missing.length} missing file(s), e.g. ${missing[0]}`);
    process.exit(1);
}
console.log(`- Repointed index.d.ts (${referenced.length} declarations verified)`);

// Every emitted .d.ts wraps its contents in `declare module "nz/co/..."`. A relative
// import inside an ambient module declaration is illegal TypeScript (TS2439) and does
// not resolve (TS2307), so such a file fails to compile for any consumer who has not
// set skipLibCheck. The transpiler rewrites single-line imports to absolute module
// names but leaves multi-line ones relative, so a handful slip through each build.
// Rewrite them against the declaring module's own path, then prove none remain.
const declarationFiles = [];
(function collect(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) collect(full);
        else if (entry.name.endsWith('.d.ts')) declarationFiles.push(full);
    }
})(srcDir);

const RELATIVE_SPECIFIER = /((?:from|module)\s+)"(\.[^"]*)"/g;
let rewrittenSpecifiers = 0;
const unresolved = [];

for (const file of declarationFiles) {
    const text = fs.readFileSync(file, 'utf8');
    if (!RELATIVE_SPECIFIER.test(text)) continue;
    RELATIVE_SPECIFIER.lastIndex = 0;

    const moduleNames = [...text.matchAll(/^declare module "([^"]+)"/gm)].map((m) => m[1]);
    const rel = path.relative(distDir, file).replace(/\\/g, '/');
    if (moduleNames.length !== 1) {
        // Cannot attribute a relative specifier to one declaring module; refuse to guess.
        unresolved.push(`${rel} (${moduleNames.length} ambient module declarations)`);
        continue;
    }

    const base = path.posix.dirname(moduleNames[0]);
    const fixed = text.replace(RELATIVE_SPECIFIER, (whole, prefix, specifier) => {
        rewrittenSpecifiers += 1;
        return `${prefix}"${path.posix.normalize(path.posix.join(base, specifier))}"`;
    });
    fs.writeFileSync(file, fixed);
}

for (const file of declarationFiles) {
    const text = fs.readFileSync(file, 'utf8');
    if (/^declare module/m.test(text) && RELATIVE_SPECIFIER.test(text)) {
        unresolved.push(path.relative(distDir, file).replace(/\\/g, '/'));
    }
    RELATIVE_SPECIFIER.lastIndex = 0;
}
if (unresolved.length > 0) {
    console.error(`Error: ${unresolved.length} declaration file(s) still hold a relative import inside an ambient module:`);
    for (const f of unresolved.slice(0, 10)) console.error(`    ${f}`);
    process.exit(1);
}
console.log(`- Absolutized ${rewrittenSpecifiers} relative specifier(s) across ${declarationFiles.length} declaration files`);

pkg.types = 'index.d.ts';

fs.writeFileSync(pkgDistPath, JSON.stringify(pkg, null, 2));
console.log('- Copied and cleaned package.json');

// 3. Write the published ui5.yaml
//
// The repository's own builder: and server: sections configure ui5-tooling-transpile, which a
// consumer must not be made to install, so neither is carried over. In their place the package
// ships the builder: rules a consuming *application* build applies to this library when it opts
// it in (includeDependency). Because publish-prep renames dist/resources to dist/src, the app
// build treats our already-built output as source, so without these rules it:
//   - re-minifies our -dbg.js files into *-dbg-dbg.js copies (minification.excludes stops this,
//     and stops the app re-minifying modules that are already minified);
//   - copies our -dbg.js files and .d.ts declarations into the app's deployable.
// The .d.ts files stay in the package for TypeScript consumers; resources.excludes only keeps
// them out of the app build. A *.js.map exclude is deliberately absent: the remaining map,
// library-preload.js.map, is generated by the app build, and resources.excludes filters inputs.
//
// The file is built from an object, not by editing the repository's text, and is derived only
// from the repository's ui5.yaml, so running publish-prep twice writes the same file.
const yamlPath = path.join(rootDir, 'ui5.yaml');
const yamlDistPath = path.join(distDir, 'ui5.yaml');
const yamlContent = fs.readFileSync(yamlPath, 'utf8').replace(/\r\n/g, '\n');

// A top-level key this step does not know about would be dropped from the package without a word.
const KNOWN_TOP_LEVEL = ['specVersion', 'metadata', 'type', 'builder', 'server'];
const unknownKeys = [...yamlContent.matchAll(/^([A-Za-z][\w-]*):/gm)]
    .map((m) => m[1])
    .filter((key) => !KNOWN_TOP_LEVEL.includes(key));
if (unknownKeys.length > 0) {
    console.error(`Error: ui5.yaml has top-level key(s) publish-prep does not carry over: ${unknownKeys.join(', ')}`);
    process.exit(1);
}

/** Reads a top-level scalar, or a scalar one level under `parent`, failing when it is absent. */
function readYamlScalar(key, parent) {
    const pattern = parent
        ? new RegExp(`^${parent}:\\s*\\n(?:[ \\t]+.*\\n)*?[ \\t]+${key}:[ \\t]*"?([^"\\n]+?)"?[ \\t]*$`, 'm')
        : new RegExp(`^${key}:[ \\t]*"?([^"\\n]+?)"?[ \\t]*$`, 'm');
    const match = pattern.exec(yamlContent);
    if (!match) {
        console.error(`Error: ui5.yaml has no ${parent ? parent + '.' : ''}${key}.`);
        process.exit(1);
    }
    return match[1];
}

const publishedYaml = {
    specVersion: readYamlScalar('specVersion'),
    metadata: { name: readYamlScalar('name', 'metadata') },
    type: readYamlScalar('type'),
    builder: {
        resources: { excludes: ['/**/*-dbg.js', '/**/*.d.ts'] },
        minification: { excludes: ['/**/*.js'] }
    }
};

/** Serializes the plain object/array/string tree above as block-style YAML. */
function toYaml(value, indent) {
    const pad = ' '.repeat(indent);
    return Object.entries(value)
        .map(([key, child]) => {
            if (Array.isArray(child)) {
                return `${pad}${key}:\n` + child.map((item) => `${pad}  - ${JSON.stringify(item)}\n`).join('');
            }
            if (child !== null && typeof child === 'object') {
                return `${pad}${key}:\n` + toYaml(child, indent + 2);
            }
            return `${pad}${key}: ${key === 'specVersion' ? JSON.stringify(child) : child}\n`;
        })
        .join('');
}

fs.writeFileSync(yamlDistPath, toYaml(publishedYaml, 0));
console.log('- Wrote ui5.yaml with the consumer build exclusions');

// 4. Copy README.md, LICENSE and CHANGELOG.md
// LICENSE is not optional: the package declares "license": "MIT", and a tarball
// that asserts a licence without carrying its text is a defect, not a nicety.
for (const name of ['README.md', 'LICENSE', 'CHANGELOG.md']) {
    const from = path.join(rootDir, name);
    if (!fs.existsSync(from)) {
        console.error(`Error: ${name} not found at the repository root.`);
        process.exit(1);
    }
    fs.copyFileSync(from, path.join(distDir, name));
    console.log(`- Copied ${name}`);
}

console.log('Done! Now run "npm publish --access public" from inside the dist/ folder.');
