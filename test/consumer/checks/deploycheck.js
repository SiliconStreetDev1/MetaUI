// Deployment-route checks against the packed @siliconst/metaui tarball as installed in
// test/consumer/app. No server and no browser: these read the installed package and run the
// consumer's own `ui5 build`. Both routes the package serves are covered:
//   - deployed as its own library (an ABAP BSP): the library folder must carry the files a
//     library deployment needs, with manifest.json at its root;
//   - bundled into the app: `ui5 build --include-dependency` must produce MetaUI's preload and
//     honour the build exclusions the package's ui5.yaml ships.
// Fails loudly; no silent passes.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const LIBRARY_NAME = "nz.co.siliconst.ui5.metaui";
const LIBRARY_PATH = LIBRARY_NAME.split(".").join("/");
const ROOT_DIR = path.resolve(__dirname, "..", "..", "..");
const APP_DIR = path.resolve(__dirname, "..", "app");
const INSTALLED = path.join(APP_DIR, "node_modules", "@siliconst", "metaui");
const INSTALLED_LIB = path.join(INSTALLED, "src", LIBRARY_PATH);
const BUILT_LIB = path.join(ROOT_DIR, "dist", "src", LIBRARY_PATH);

/**
 * Upper bound on the number of files an app build containing MetaUI may hold.
 *
 * Measured on 2026-10-29: 171 files (11 of the consumer app's own, 160 of MetaUI). Losing any one of the
 * three shipped exclusion rules lands well above 300 — each was measured at 320 or more on its own,
 * and with none of them the build held 938 files. Each new library module adds one file, so 300
 * leaves room for roughly 130 more before this needs revisiting, while still catching every
 * single-rule regression.
 */
const MAX_APP_BUILD_FILES = 300;

const results = [];
function check(name, ok, detail) {
    results.push({ name, ok, detail });
    console.log(`  [${ok ? "PASS" : "FAIL"}] ${name}${detail ? " :: " + detail : ""}`);
}

function listFiles(dir) {
    const out = [];
    (function walk(d) {
        for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
            const full = path.join(d, entry.name);
            if (entry.isDirectory()) walk(full);
            else out.push(full);
        }
    })(dir);
    return out;
}

// 0. The installed package is the build under test, not a tarball left over from an earlier
//    install (see the trap in ../README.md).
check("@siliconst/metaui is installed in the consumer app", fs.existsSync(INSTALLED), INSTALLED);
if (!fs.existsSync(INSTALLED)) {
    console.error("Install the packed tarball first: cd test/consumer/app && npm run install-lib");
    process.exit(1);
}
const installedPreload = path.join(INSTALLED_LIB, "library-preload.js");
const builtPreload = path.join(BUILT_LIB, "library-preload.js");
check(
    "Installed library-preload.js is byte-identical to the current dist/ build",
    fs.existsSync(installedPreload) && fs.existsSync(builtPreload) &&
        fs.readFileSync(installedPreload).equals(fs.readFileSync(builtPreload)),
    fs.existsSync(builtPreload) ? "" : "dist/src not found: run npm run build && npm run publish-prep"
);

// 1. Library route: the files a separate library deployment needs, with manifest.json at the
//    root of the library folder.
for (const name of [".library", "manifest.json", "library.js", "library-preload.js", "messagebundle.properties"]) {
    check(`Library folder carries ${name}`, fs.existsSync(path.join(INSTALLED_LIB, name)), path.join("src", LIBRARY_PATH, name));
}
let manifestId = null;
try {
    manifestId = JSON.parse(fs.readFileSync(path.join(INSTALLED_LIB, "manifest.json"), "utf8"))["sap.app"].id;
} catch (e) {
    manifestId = "unreadable: " + e.message;
}
check("manifest.json at the library folder's root names the library", manifestId === LIBRARY_NAME, "sap.app.id = " + manifestId);

// 2. Bundled route: the shipped ui5.yaml carries the exclusion rules, and an app build that opts
//    MetaUI in honours them.
const installedYaml = fs.readFileSync(path.join(INSTALLED, "ui5.yaml"), "utf8");
for (const rule of ['"/**/*-dbg.js"', '"/**/*.d.ts"', '"/**/*.js"']) {
    check(`Installed ui5.yaml ships the exclusion ${rule}`, installedYaml.includes(rule));
}

const dest = fs.mkdtempSync(path.join(os.tmpdir(), "metaui-appbuild-"));
const build = spawnSync("npx", ["ui5", "build", "--include-dependency", LIBRARY_NAME, "--dest", dest], {
    cwd: APP_DIR,
    encoding: "utf8",
    shell: process.platform === "win32"
});
check(
    `ui5 build --include-dependency ${LIBRARY_NAME} succeeds`,
    build.status === 0,
    build.status === 0 ? "" : (build.stderr || build.stdout || "").trim().split("\n").slice(-3).join(" | ")
);

const built = build.status === 0 ? listFiles(dest) : [];
const rel = (f) => path.relative(dest, f).replace(/\\/g, "/");
check(
    `App build contains resources/${LIBRARY_PATH}/library-preload.js`,
    fs.existsSync(path.join(dest, "resources", LIBRARY_PATH, "library-preload.js"))
);
const dbgDbg = built.filter((f) => f.endsWith("-dbg-dbg.js"));
check("App build holds no *-dbg-dbg.js", built.length > 0 && dbgDbg.length === 0, `${dbgDbg.length} found ${dbgDbg.slice(0, 2).map(rel).join(", ")}`);
const declarations = built.filter((f) => f.endsWith(".d.ts"));
check("App build holds no *.d.ts", built.length > 0 && declarations.length === 0, `${declarations.length} found ${declarations.slice(0, 2).map(rel).join(", ")}`);
const totalKb = Math.round(built.reduce((sum, f) => sum + fs.statSync(f).size, 0) / 1024);
check(
    `App build holds at most ${MAX_APP_BUILD_FILES} files`,
    built.length > 0 && built.length <= MAX_APP_BUILD_FILES,
    `${built.length} files, ${totalKb} KB`
);

fs.rmSync(dest, { recursive: true, force: true });

const failed = results.filter((r) => !r.ok);
console.log("\n" + "=".repeat(60));
console.log(failed.length === 0
    ? `ALL ${results.length} DEPLOY CHECKS PASSED`
    : `${failed.length} OF ${results.length} DEPLOY CHECKS FAILED`);
console.log("=".repeat(60));
process.exit(failed.length === 0 ? 0 : 1);
