// Restructures dist/ for an ABAP BSP upload.
//
// `ui5 build` writes the library under dist/resources/<namespace>/. A BSP wants the
// namespace at the root of the BSP application: /UI5/APP_INDEX_CALCULATE looks for
// .library and manifest.json there, and a namespace buried under resources/ is not
// found, which surfaces as 404s on the Fiori Launchpad rather than as an upload error.
//
// So: dist/resources/nz/... becomes dist/nz/..., and dist/resources is removed. What is
// left in dist/ is exactly what gets uploaded, debug files included - sap-ui-debug=true
// needs the -dbg.js files present on the server.
//
// This replaces a `move`/`rmdir /s /q` shell one-liner that only ran under Windows cmd.
// It is the BSP counterpart of publish-prep.js, which solves the same problem for npm by
// renaming dist/resources to dist/src. The two are mutually exclusive: both consume
// dist/resources, so one build serves one route.
const fs = require("fs");
const path = require("path");

const distDir = path.resolve(__dirname, "..", "dist");
const resourcesDir = path.join(distDir, "resources");
const namespaceRoot = "nz";

if (!fs.existsSync(resourcesDir)) {
    const alreadyFlat = fs.existsSync(path.join(distDir, namespaceRoot));
    console.error(
        alreadyFlat
            ? `dist/${namespaceRoot} already exists and dist/resources does not: this build has already been flattened.`
            : "dist/resources not found. Run `npm run build` first, and note that publish-prep consumes the same folder."
    );
    process.exit(1);
}

const from = path.join(resourcesDir, namespaceRoot);
if (!fs.existsSync(from)) {
    console.error(`dist/resources exists but holds no ${namespaceRoot}/ folder. Nothing to flatten.`);
    process.exit(1);
}

const to = path.join(distDir, namespaceRoot);
if (fs.existsSync(to)) {
    fs.rmSync(to, { recursive: true, force: true });
}
fs.renameSync(from, to);
fs.rmSync(resourcesDir, { recursive: true, force: true });

console.log(`- Moved dist/resources/${namespaceRoot} to dist/${namespaceRoot}`);
console.log("- Removed dist/resources");
console.log("dist/ is now the BSP payload: upload its contents to the BSP application root.");
