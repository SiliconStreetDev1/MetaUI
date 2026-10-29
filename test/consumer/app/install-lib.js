/**
 * @file install-lib.js
 * @description Installs the packed tarball from `dist/` the way a consumer installs from npm.
 *
 * Two traps this exists to avoid:
 *
 * 1. npm resolves a `file:` dependency from the lockfile's integrity hash, so a plain
 *    `npm install` happily reinstalls the **previous** tarball and every check then passes
 *    against stale code. The lockfile and the installed package are deleted first.
 * 2. The tarball's name carries the version, so pinning it in `package.json` broke the harness
 *    on every release. The tarball is found by pattern instead, and the run fails loudly if
 *    `dist/` holds none or more than one.
 */
const fs = require("fs");
const path = require("path");
const { execFileSync, execSync } = require("child_process");

const APP_DIR = __dirname;
const DIST = path.resolve(APP_DIR, "..", "..", "..", "dist");

const tarballs = fs.existsSync(DIST)
    ? fs.readdirSync(DIST).filter((f) => /^siliconst-metaui-.*\.tgz$/.test(f))
    : [];

if (tarballs.length === 0) {
    console.error(`install-lib: no tarball in ${DIST}.`);
    console.error("Run: npm run build && npm run publish-prep && (cd dist && npm pack)");
    process.exit(1);
}
if (tarballs.length > 1) {
    console.error(`install-lib: ${tarballs.length} tarballs in dist/, so which one to install is ambiguous:`);
    tarballs.forEach((t) => console.error("  " + t));
    console.error("Delete the stale ones and run again.");
    process.exit(1);
}

const tarball = tarballs[0];
console.log(`install-lib: installing ${tarball}`);

fs.rmSync(path.join(APP_DIR, "node_modules", "@siliconst"), { recursive: true, force: true });
fs.rmSync(path.join(APP_DIR, "package-lock.json"), { force: true });

const spec = path.posix.join("..", "..", "..", "dist", tarball);

// Node refuses to spawn the Windows `npm.cmd` shim directly (EINVAL since Node 20), and an
// argument array with `shell: true` is concatenated unescaped (DEP0190). On Windows the command
// is quoted and handed to the shell as one string; elsewhere it is a plain argv exec, no shell.
// Same workaround as `.github/scripts/api-semver-gate.js`.
if (process.platform === "win32") {
    execSync(`npm install "${spec}"`, { cwd: APP_DIR, stdio: "inherit" });
} else {
    execFileSync("npm", ["install", spec], { cwd: APP_DIR, stdio: "inherit" });
}
