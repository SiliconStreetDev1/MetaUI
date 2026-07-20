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

// The published files should only include src, test-resources, ui5.yaml, README.md
pkg.files = ["src", "test-resources", "ui5.yaml", "README.md"];

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

// 4. Copy README.md
const readmePath = path.join(rootDir, 'README.md');
const readmeDistPath = path.join(distDir, 'README.md');
if (fs.existsSync(readmePath)) {
    fs.copyFileSync(readmePath, readmeDistPath);
    console.log('- Copied README.md');
}

console.log('Done! Now run "npm publish --access public" from inside the dist/ folder.');
