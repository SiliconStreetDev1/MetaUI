#!/usr/bin/env node
/**
 * @file api-semver-gate.js
 * @description Release gate. Compares the API surface about to be published against
 * the surface of the version currently on the registry, and refuses the publish when
 * the version bump is too small for the change.
 *
 * `api-surface.js` splits that surface into three tiers, and this gate treats them
 * differently, because "exported" and "promised" are not the same thing:
 *
 *   PUBLIC and EXTENSION - the documented application and plugin-author contracts.
 *     patch bump  -> must be byte-identical
 *     minor bump  -> nothing may be removed or altered; additions are fine
 *     major bump  -> anything goes
 *
 *   INTERNAL - exported only so the AMD loader and PluginRegistry can reach it.
 *     Never gates a release. It is REPORTED in full, because "14 internal signatures
 *     moved in a patch" is review context worth having even when it is allowed.
 *
 * This is the control that stops a breaking change to a documented interface from
 * shipping as a patch, which is unrecoverable once npm has the tarball. It is
 * deliberately NOT a control over internal refactoring.
 *
 * Tier demotion caveat: the tiers are read from the allowlist in THIS checkout and
 * applied to both surfaces, because the published tarball does not carry the tier map
 * it was built with. Moving a symbol out of the public tier is therefore invisible here
 * and is a breaking change that needs a major bump; the pull-request-time
 * `api-surface.js --check` is what surfaces it, as a block moving between sections.
 *
 * Usage:
 *   node .github/scripts/api-semver-gate.js --dist dist [--package package.json]
 *   node .github/scripts/api-semver-gate.js --dist dist --package <pkg.json> \
 *        --previous <dir> --previous-version <semver>
 *
 * `--dist` is the directory that is about to be published (after `publish-prep`).
 * `--previous` / `--previous-version` replace the registry fetch with a local directory
 * of declarations, for rehearsing a release - or demonstrating the gate - offline.
 *
 * Exit codes: 0 allowed, 1 refused, 2 the gate itself could not run.
 */

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync, execSync, spawnSync } = require("child_process");

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

const SCRIPT_DIR = __dirname;
const EXTRACTOR = path.join(SCRIPT_DIR, "api-surface.js");

/**
 * Reads a named command-line flag.
 *
 * @param {string} name Flag name including leading dashes.
 * @param {string} fallback Value to use when the flag is absent.
 * @returns {string} The flag value.
 */
function arg(name, fallback) {
    const i = process.argv.indexOf(name);
    return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

/**
 * Parses a semantic version into its numeric components.
 *
 * @param {string} version The version string.
 * @returns {{major: number, minor: number, patch: number, prerelease: string}} Parsed parts.
 */
function parseVersion(version) {
    const m = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/.exec(version);
    if (!m) {
        console.error(`api-semver-gate: cannot parse version "${version}".`);
        process.exit(2);
    }
    return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]), prerelease: m[4] || "" };
}

/**
 * Runs the API extractor over a directory and returns its snapshot text.
 *
 * @param {string} dir Directory holding emitted declaration files.
 * @param {string} label Human-readable name used in error messages.
 * @returns {string} The snapshot.
 */
function surfaceOf(dir, label) {
    const result = spawnSync(process.execPath, [EXTRACTOR, dir], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    if (result.status !== 0) {
        console.error(`api-semver-gate: could not extract the API surface of ${label}.`);
        console.error(result.stderr || result.stdout || "");
        process.exit(2);
    }
    return result.stdout;
}

const distDir = path.resolve(arg("--dist", "dist"));
const pkgPath = path.resolve(arg("--package", path.join(distDir, "package.json")));

if (!fs.existsSync(pkgPath)) {
    console.error(`api-semver-gate: ${pkgPath} not found.`);
    process.exit(2);
}
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
const name = pkg.name;
const nextVersion = pkg.version;
console.log(`api-semver-gate: ${name} -> ${nextVersion}`);

// Local dry run: compare against a directory of declarations instead of the registry.
// Used to rehearse a release, and to prove the gate's behaviour without a network fetch.
// Both flags are required together; the release workflow passes neither.
const offlinePrevious = arg("--previous", "");
const offlineVersion = arg("--previous-version", "");
if (Boolean(offlinePrevious) !== Boolean(offlineVersion)) {
    console.error("api-semver-gate: --previous and --previous-version must be given together.");
    process.exit(2);
}

let publishedVersion = "";
if (offlinePrevious) {
    publishedVersion = offlineVersion;
    console.log(`api-semver-gate: offline comparison against ${path.resolve(offlinePrevious)} as ${publishedVersion}`);
} else {
    try {
        publishedVersion = npmSync(["view", name, "version"], {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "pipe"],
        }).trim();
    } catch {
        publishedVersion = "";
    }
}

if (!publishedVersion) {
    console.log("api-semver-gate: no published version on the registry - first publish, nothing to compare. PASS");
    process.exit(0);
}
console.log(`api-semver-gate: latest published version is ${publishedVersion}`);

const prev = parseVersion(publishedVersion);
const next = parseVersion(nextVersion);

if (next.major > prev.major) {
    console.log("api-semver-gate: major bump - any API change is allowed. PASS");
    process.exit(0);
}
if (next.major < prev.major || (next.major === prev.major && next.minor < prev.minor)) {
    console.error("api-semver-gate: the version being published is older than the published one. Refusing.");
    process.exit(1);
}
const bump = next.minor > prev.minor ? "minor" : "patch";

/**
 * Fetches and unpacks the published tarball into a throwaway directory.
 *
 * @returns {string} The unpacked `package/` root.
 */
function fetchPublishedRoot() {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "metaui-apigate-"));
    try {
        const packOutput = npmSync(
            ["pack", `${name}@${publishedVersion}`, "--pack-destination", workDir, "--silent"],
            { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
        ).trim();
        const tarball = packOutput
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter((line) => line.endsWith(".tgz"))
            .pop();
        if (!tarball) throw new Error(`npm pack printed no tarball name: ${packOutput}`);
        // Run tar from inside workDir with a bare filename: an absolute Windows path such
        // as C:\tmp\x.tgz is read by GNU tar as the remote host "C", which fails.
        execFileSync("tar", ["-xf", path.basename(tarball)], { cwd: workDir, stdio: ["ignore", "pipe", "pipe"] });
        const root = path.join(workDir, "package");
        if (!fs.existsSync(root)) throw new Error(`unpacked tarball has no package/ directory in ${workDir}`);
        return root;
    } catch (err) {
        console.error(`api-semver-gate: could not fetch ${name}@${publishedVersion} from the registry.`);
        console.error(String(err && err.message ? err.message : err));
        console.error("Refusing to publish blind - re-run once the registry is reachable.");
        process.exit(2);
    }
}

let previousRoot = "";
if (offlinePrevious) {
    previousRoot = path.resolve(offlinePrevious);
    if (!fs.existsSync(previousRoot) || !fs.statSync(previousRoot).isDirectory()) {
        console.error(`api-semver-gate: --previous ${previousRoot} is not a directory.`);
        process.exit(2);
    }
} else {
    previousRoot = fetchPublishedRoot();
}

const previousSurface = surfaceOf(previousRoot, `${name}@${publishedVersion}`);
const nextSurface = surfaceOf(distDir, `${distDir}`);

const SECTION_PREFIX = "=== tier: ";
const GATED_TIERS = new Set(["public", "extension"]);

/**
 * Splits a snapshot into its gated (public + extension) and ungated (internal) entries.
 *
 * Each entry is keyed by tier AND declaring module, not by its text alone. The same
 * member signature occurs in many modules - `setUseMessageManager(use: boolean): void;`
 * is on `Engine`, `ValidationLedger` and `IPlugin` - and a flat set of lines silently
 * hides a removal from one of them behind an identical line in another.
 *
 * A snapshot produced before the tiers existed carries no section markers. Those lines
 * are treated as gated, so an older extractor can only ever make this gate stricter.
 *
 * @param {string} surface Snapshot text from `api-surface.js`.
 * @returns {{gated: Array<{key: string, display: string}>, internal: Array<{key: string, display: string}>}} The two entry sets.
 */
function splitTiers(surface) {
    const out = { gated: [], internal: [] };
    let tier = "public";
    let moduleName = "(root)";
    for (const line of surface.split("\n")) {
        if (line.startsWith(SECTION_PREFIX)) {
            tier = line.slice(SECTION_PREFIX.length).replace(/\s*===\s*$/, "").trim();
            moduleName = "(root)";
            continue;
        }
        if (!line.trim() || line.startsWith("#")) continue;
        if (line.startsWith("module ")) moduleName = line.slice("module ".length).trim();
        const entry = {
            key: `${tier}\u0000${moduleName}\u0000${line}`,
            display: `[${tier}] ${moduleName} :: ${line.trim()}`
        };
        (GATED_TIERS.has(tier) ? out.gated : out.internal).push(entry);
    }
    return out;
}

/**
 * Lists the entries of `before` that are absent from `after`, and vice versa.
 *
 * @param {Array<{key: string, display: string}>} before Previous entries.
 * @param {Array<{key: string, display: string}>} after Next entries.
 * @returns {{removed: string[], added: string[]}} The two change lists, ready to print.
 */
function diffLines(before, after) {
    const afterKeys = new Set(after.map((e) => e.key));
    const beforeKeys = new Set(before.map((e) => e.key));
    return {
        removed: before.filter((e) => !afterKeys.has(e.key)).map((e) => e.display),
        added: after.filter((e) => !beforeKeys.has(e.key)).map((e) => e.display)
    };
}

const prevTiers = splitTiers(previousSurface);
const nextTiers = splitTiers(nextSurface);
const gated = diffLines(prevTiers.gated, nextTiers.gated);
const internal = diffLines(prevTiers.internal, nextTiers.internal);

/**
 * Prints up to a fixed number of lines of a change list.
 *
 * @param {(msg: string) => void} write Sink for the output.
 * @param {string} label Marker printed before each line.
 * @param {string[]} lines The changed lines.
 * @param {number} [limit] How many lines to print before summarizing the rest.
 * @returns {void}
 */
function show(write, label, lines, limit = 50) {
    for (const line of lines.slice(0, limit)) write(`  ${label} ${line.trim()}`);
    if (lines.length > limit) write(`  ${label} ... and ${lines.length - limit} more`);
}

// The internal tier never gates. Report it first, on stdout, so the release log always
// carries the full picture of what moved - including in a release the gate allows.
if (internal.removed.length === 0 && internal.added.length === 0) {
    console.log("api-semver-gate: internal tier unchanged.");
} else {
    console.log(
        `api-semver-gate: internal tier changed (NOT gated): ` +
        `${internal.removed.length} removed/altered, ${internal.added.length} added. ` +
        "These are exported but unpromised and may move in a patch release."
    );
    show(console.log, "-", internal.removed, 25);
    show(console.log, "+", internal.added, 25);
}

if (gated.removed.length === 0 && gated.added.length === 0) {
    console.log(`api-semver-gate: public and extension tiers unchanged since ${publishedVersion}. PASS`);
    process.exit(0);
}

console.error(
    `api-semver-gate: public/extension API changed since ${publishedVersion}: ` +
    `${gated.removed.length} removed/altered, ${gated.added.length} added.`
);
show(console.error, "-", gated.removed);
show(console.error, "+", gated.added);

if (bump === "patch") {
    console.error("");
    console.error(`REFUSED: ${publishedVersion} -> ${nextVersion} is a patch bump, but the documented API moved.`);
    console.error("Publish this as a minor version (additions only) or a major version (removals or changes).");
    console.error("If the declaration is not meant to be a promise, take it out of API_TIERS in api-surface.js");
    console.error("and out of the documentation that cites it - do not widen the version bump to hide it.");
    process.exit(1);
}
if (gated.removed.length > 0) {
    console.error("");
    console.error(`REFUSED: ${publishedVersion} -> ${nextVersion} is a minor bump, but documented declarations were removed or altered.`);
    console.error("Removing or changing a public or extension declaration is a breaking change - publish it as a major version.");
    process.exit(1);
}
console.log(`api-semver-gate: minor bump with additions only. PASS`);
