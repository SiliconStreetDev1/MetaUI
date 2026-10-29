// Restructures dist/ for an ABAP BSP upload.
//
// `ui5 build` writes the library under dist/resources/<namespace>/. This moves it to
// dist/nz/... and removes dist/resources, keeping the debug files - sap-ui-debug=true
// needs the -dbg.js files present on the server.
//
// Which folder becomes the BSP root has never been tested on an SAP system. The App Index
// is understood to register a library from the manifest.json at the root of its BSP, which
// would mean uploading dist/nz/co/siliconst/ui5/metaui/ rather than dist/. Until someone
// settles it, the closing message says so instead of naming one; see Deployment.md, Route B.
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

// The declaration roll-up is for TypeScript consumers of the npm package. A BSP serves
// JavaScript to a browser and nothing there reads it, so it is not part of this payload.
const declarationRollup = path.join(distDir, "index.d.ts");
if (fs.existsSync(declarationRollup)) {
    fs.rmSync(declarationRollup, { force: true });
    console.log("- Removed dist/index.d.ts (npm-only, not served by a BSP)");
}
console.log("dist/ now holds the BSP payload; the library itself is in dist/nz/co/siliconst/ui5/metaui/.");
console.log("Which folder becomes the BSP root is untested - see docs/wiki/Deployment.md, Route B, before uploading.");
