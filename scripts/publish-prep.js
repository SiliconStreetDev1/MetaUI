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

// 3. Copy and clean ui5.yaml
const yamlPath = path.join(rootDir, 'ui5.yaml');
const yamlDistPath = path.join(distDir, 'ui5.yaml');
const yamlContent = fs.readFileSync(yamlPath, 'utf8');

// Strip out builder and server sections using simple regex/string manipulation
const cleanYaml = yamlContent
    .replace(/^builder:[\s\S]*?(?=^[\w])/m, '')
    .replace(/^server:[\s\S]*?(?=^[\w])/m, '')
    .replace(/^builder:[\s\S]*$/m, '')
    .replace(/^server:[\s\S]*$/m, '');

fs.writeFileSync(yamlDistPath, cleanYaml.trim() + '\n');
console.log('- Copied and cleaned ui5.yaml');

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
