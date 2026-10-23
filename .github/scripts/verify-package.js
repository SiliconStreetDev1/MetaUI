#!/usr/bin/env node
/**
 * @file verify-package.js
 * @description Asserts that the directory `scripts/publish-prep.js` produced is
 * actually publishable, before npm sees it.
 *
 * publish-prep already fails on a dangling `index.d.ts` reference or an unresolved
 * relative specifier. It does not check the things it rewrites: the `files` list,
 * the `types` entry, the absence of dev-only fields, or that the resulting tarball
 * really contains what the manifest promises. Those used to be exercised for the
 * first time during a real `npm publish`, which cannot be undone.
 *
 * Usage:
 *   node .github/scripts/verify-package.js [distDir]
 *
 * Exit codes: 0 ok, 1 the package is not publishable, 2 the check could not run.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync, execSync } = require("child_process");

/**
 * Runs an npm subcommand and returns its stdout.
 *
 * Node refuses to spawn the Windows `npm.cmd` shim directly (EINVAL since Node 20),
 * and passing an argument array with `shell: true` concatenates them unescaped
 * (DEP0190). On Windows the command is therefore quoted and handed to the shell as
 * a single string; everywhere else it is a plain argv exec with no shell at all.
 *
 * @param {string[]} args The npm arguments.
 * @param {object} options Options forwarded to child_process.
 * @returns {string} The captured stdout.
 */
function npmSync(args, options) {
    if (process.platform === "win32") {
        const quoted = ["npm", ...args].map((a) => (/[\s"&|<>^()]/.test(a) ? `"${a}"` : a)).join(" ");
        return execSync(quoted, options);
    }
    return execFileSync("npm", args, options);
}

const distDir = path.resolve(process.argv[2] || "dist");
/** @type {string[]} */
const problems = [];

/**
 * Records a problem when a condition does not hold.
 *
 * @param {boolean} condition The condition that must be true.
 * @param {string} message What to report when it is not.
 * @returns {void}
 */
function expect(condition, message) {
    if (!condition) problems.push(message);
}

if (!fs.existsSync(distDir)) {
    console.error(`verify-package: ${distDir} does not exist. Run \`npm run build && npm run publish-prep\` first.`);
    process.exit(2);
}

const pkgPath = path.join(distDir, "package.json");
if (!fs.existsSync(pkgPath)) {
    console.error(`verify-package: ${pkgPath} not found - publish-prep did not run.`);
    process.exit(2);
}
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));

// --- manifest shape -------------------------------------------------------
expect(pkg.name === "@siliconst/metaui", `name is "${pkg.name}", expected "@siliconst/metaui"`);
expect(/^\d+\.\d+\.\d+/.test(pkg.version || ""), `version "${pkg.version}" is not a semantic version`);
expect(!!pkg.license, "license is missing from the published manifest");
expect(
    typeof (pkg.repository && pkg.repository.url) === "string" && pkg.repository.url.includes("github.com/"),
    "repository.url must point at the GitHub repository, or npm cannot attach provenance"
);
expect(pkg.types === "index.d.ts", `types is "${pkg.types}", expected "index.d.ts" after publish-prep`);
expect(pkg.scripts === undefined, "scripts survived publish-prep and would run on the consumer's machine");
expect(pkg.devDependencies === undefined, "devDependencies survived publish-prep");
expect(
    !(pkg.dependencies && pkg.dependencies["ui5-tooling-transpile"]),
    "ui5-tooling-transpile is a build-time dependency and must not be in the published manifest"
);
expect(Array.isArray(pkg.files) && pkg.files.length > 0, "files is missing from the published manifest");

// --- the manifest's promises exist on disk --------------------------------
for (const entry of pkg.files || []) {
    expect(fs.existsSync(path.join(distDir, entry)), `files lists "${entry}", which is not in ${distDir}`);
}
expect(
    !fs.existsSync(path.join(distDir, "resources")),
    "dist/resources still exists - publish-prep did not rename it to dist/src"
);
expect(fs.existsSync(path.join(distDir, "src")), "dist/src is missing - publish-prep did not rename dist/resources");

// --- what the tarball would actually carry --------------------------------
let files = [];
try {
    const out = npmSync(["pack", "--dry-run", "--json"], {
        cwd: distDir,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        maxBuffer: 64 * 1024 * 1024
    });
    const parsed = JSON.parse(out.slice(out.indexOf("[")));
    files = (parsed[0] && parsed[0].files ? parsed[0].files : []).map((f) => f.path.replace(/\\/g, "/"));
} catch (err) {
    console.error("verify-package: `npm pack --dry-run --json` failed inside the dist directory.");
    console.error(String(err && err.message ? err.message : err));
    process.exit(2);
}

const required = ["package.json", "index.d.ts", "ui5.yaml", "README.md", "LICENSE", "CHANGELOG.md"];
for (const name of required) {
    expect(files.includes(name), `the tarball would not contain ${name}`);
}
const declarationCount = files.filter((f) => f.startsWith("src/") && f.endsWith(".d.ts")).length;
const runtimeCount = files.filter((f) => f.startsWith("src/") && f.endsWith(".js")).length;
expect(declarationCount > 50, `the tarball carries only ${declarationCount} declaration files under src/`);
expect(runtimeCount > 50, `the tarball carries only ${runtimeCount} JavaScript modules under src/`);
expect(
    !files.some((f) => f.startsWith("resources/")),
    "the tarball still contains a resources/ directory"
);

// --- the roll-up points at files that ship --------------------------------
const rollup = fs.readFileSync(path.join(distDir, "index.d.ts"), "utf8");
expect(!rollup.includes("./resources/"), "index.d.ts still references ./resources/");
const shipped = new Set(files);
const dangling = [...rollup.matchAll(/path\s*=\s*"\.\/([^"]+)"/g)]
    .map((m) => m[1])
    .filter((rel) => !shipped.has(rel));
expect(
    dangling.length === 0,
    `index.d.ts references ${dangling.length} declaration(s) the tarball does not ship, e.g. ${dangling[0]}`
);

if (problems.length > 0) {
    console.error(`verify-package: ${problems.length} problem(s) with the publishable package in ${distDir}:`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
}

console.log(
    `verify-package: ${pkg.name}@${pkg.version} looks publishable ` +
        `(${files.length} files, ${declarationCount} declarations, ${runtimeCount} modules).`
);
