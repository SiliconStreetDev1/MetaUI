#!/usr/bin/env node
/**
 * @file api-surface.js
 * @description Extracts a normalized, order-stable, TIERED snapshot of the TypeScript
 * API that MetaUI publishes, from the emitted `.d.ts` files of a build.
 *
 * The snapshot is committed as `.github/api-surface.txt`. CI regenerates it and fails
 * when it differs, so an exported declaration cannot change without the diff appearing
 * in review. The release workflow runs the same extractor over the previously published
 * tarball; `api-semver-gate.js` then enforces the version bump against the PUBLIC and
 * EXTENSION tiers only, and reports the INTERNAL tier without gating it.
 *
 * ---------------------------------------------------------------------------
 * THE TIER MECHANISM
 * ---------------------------------------------------------------------------
 * Being exported is not a promise. Almost everything in this library is exported
 * because UI5's AMD loader resolves one module per file and `PluginRegistry` requires
 * plugin modules by path at runtime - not because a consumer is invited to use it.
 * Three tiers separate the two ideas:
 *
 *   public     Documented in `docs/wiki/APIReference.md` for applications. Byte-frozen
 *              within a major version.
 *   extension  Documented in `docs/wiki/CreatingPlugins.md` (and the policy / OpenAPI
 *              extension points) for code that plugs INTO MetaUI. Same guarantee.
 *   internal   Everything else. Exported, reachable, and explicitly NOT promised.
 *              Changes freely in a patch release.
 *
 * Tier membership is decided by `API_TIERS` below - an explicit, reviewable allowlist -
 * and NOT by the `@public` JSDoc tag. `@public` is already on 122 symbols in `src/`
 * because the static quality gate demands a doc comment on every exported declaration,
 * so it currently means "this has a doc header" and promoting on it would re-publish the
 * whole library. An allowlist also keeps the decision in one diff, in the directory the
 * release reviewer reads, instead of in 149 source files.
 *
 * `@internal` in the JSDoc IS honoured, as a one-way DEMOTION: it can move a symbol out
 * of the public or extension tier but can never move one in. Tagging a symbol `@internal`
 * while it is listed in `API_TIERS` is a contradiction and is a hard error, so the two
 * cannot silently disagree.
 *
 * THE DEFAULT IS `internal`, AND THAT IS THE SAFE SIDE. A newly exported symbol that
 * nobody thought about is unpromised: the library keeps the freedom to change it, and the
 * cost of the mistake is a consumer who depended on something they were told not to.
 * The opposite default costs a major version bump to undo and cannot be undone for
 * anyone who already shipped against it.
 *
 * Only modules inside the `nz/co/siliconst/` namespace are MetaUI's API. The ambient
 * `declare module "sap/..."` blocks in `src/.../typings/ui5-custom.d.ts` describe SAP's
 * own controls, which MetaUI consumes and does not publish; they are excluded and the
 * exclusion is reported in the header.
 *
 * Known limitation: a `const` object literal is one snapshot line, so ADDING a member to
 * one reads as an alteration of that line rather than an addition. Keep wide, frequently
 * extended literals (`WIDGET_TYPE`, `LAYOUT_STRATEGY`) out of the gated tiers.
 *
 * Deliberately NOT @microsoft/api-extractor: the published layout is ~150 separate
 * `declare module "nz/co/..."` ambient declarations with no single ES entry point,
 * which api-extractor is not built to roll up. This reads the same files directly
 * through the TypeScript compiler API, which is already a devDependency.
 *
 * Usage:
 *   node .github/scripts/api-surface.js <rootDir> [--out <file>]
 *   node .github/scripts/api-surface.js <rootDir> --check <file>
 *   node .github/scripts/api-surface.js <rootDir> --tier-report
 *
 * <rootDir> is any directory containing emitted declarations - `dist` before
 * publish-prep (`dist/resources/...`), `dist` after it (`dist/src/...`), or an
 * unpacked npm tarball. Only `.d.ts` content is read, so the layout does not matter.
 *
 * `--out` and `--check` run against the current build and are STRICT: a tier allowlist
 * entry that matches no declaration fails the run, because a promised symbol that has
 * silently disappeared is exactly what this file exists to catch. A bare run (what
 * `api-semver-gate.js` does over an older published tarball) is lenient, since an older
 * tarball legitimately predates newly promised symbols.
 *
 * Exit codes: 0 ok, 1 snapshot mismatch (--check), 2 usage, extraction or tier error.
 */

"use strict";

const fs = require("fs");
const path = require("path");

let ts;
try {
    ts = require("typescript");
} catch {
    console.error("api-surface: the 'typescript' package is required. Run `npm ci` first.");
    process.exit(2);
}

/** Only modules under this namespace are MetaUI's own API. */
const NAMESPACE = "nz/co/siliconst/";

/** Tier section markers. `api-semver-gate.js` parses these; keep them in sync. */
const TIERS = ["public", "extension", "internal"];
const SECTION_PREFIX = "=== tier: ";

/**
 * The tier allowlist: the ONLY way into the `public` and `extension` tiers.
 *
 * Keys are `<ambient module name>#<exported symbol>`; `#*` covers every export of a
 * module. Anything absent is `internal`. Every entry below is justified by a citation
 * in `docs/wiki/`, or by being a type that a cited declaration's own signature names
 * (a promised signature cannot reference an unpromised type without leaking it).
 *
 * To promote a symbol: document it first, then add it here, then regenerate the
 * snapshot. The reviewer sees one added allowlist line and one moved snapshot block.
 */
const API_TIERS = {
    // ---- public: the application-facing API, documented in docs/wiki/APIReference.md ----

    // The UI5 library entry point. Applications name it in manifest.json dependencies.
    "nz/co/siliconst/ui5/metaui/library#default": "public",
    // APIReference.md documents every property, event and method of this control.
    "nz/co/siliconst/ui5/metaui/controls/DynamicHost#*": "public",
    // The shape of the schema a consumer authors and hands to `schemaDefinition`, and
    // the type named by the documented setSchemaDefinitions / getSchemaDefinition
    // signatures. AI_Schema_CheatSheet.md and SchemasAndInference.md document it in full.
    "nz/co/siliconst/ui5/metaui/interfaces/ISchema#*": "public",
    // APIReference.md "Library-Level Configuration": the data-source origin policy.
    "nz/co/siliconst/ui5/metaui/utils/UrlValidator#*": "public",
    // APIReference.md "Library-Level Configuration": debug mode.
    "nz/co/siliconst/ui5/metaui/utils/Logger#Logger": "public",
    // Closure over ISchema: `FieldType` is `SchemaTypeType | "date"`, and `SchemaTypeType`
    // is derived from `SCHEMA_TYPE`. Both are closed sets of JSON Schema primitives.
    // `WIDGET_TYPE` and `LAYOUT_STRATEGY` are deliberately NOT here - they grow with every
    // new widget, and a const literal is one snapshot line (see the limitation above).
    "nz/co/siliconst/ui5/metaui/constants/MetaUIConstants#SCHEMA_TYPE": "public",
    "nz/co/siliconst/ui5/metaui/constants/MetaUIConstants#SchemaTypeType": "public",
    "nz/co/siliconst/ui5/metaui/constants/MetaUIConstants#RENDER_MODE": "public",
    "nz/co/siliconst/ui5/metaui/constants/MetaUIConstants#RenderModeType": "public",

    // ---- extension: the contract for code that plugs INTO MetaUI ----

    // CreatingPlugins.md: "create a TypeScript class that extends BasePlugin".
    "nz/co/siliconst/ui5/metaui/plugins/controls/BasePlugin#BasePlugin": "extension",
    // BasePlugin's base class; CreatingPlugins.md documents its protected members by name.
    "nz/co/siliconst/ui5/metaui/core/PluginStateBase#PluginStateBase": "extension",
    // CreatingPlugins.md: PluginRegistry.getInstance().registerPluginPath(...).
    "nz/co/siliconst/ui5/metaui/core/PluginRegistry#PluginRegistry": "extension",
    // CreatingPlugins.md: GlobalPipeline.validators.register(...). `GlobalPipeline` is
    // typed `PipelineManager`, so the class travels with it.
    "nz/co/siliconst/ui5/metaui/core/PipelineManager#*": "extension",
    // `GlobalPipeline.validators` is a `Registry<IValidator>`; `register()` lives here.
    "nz/co/siliconst/ui5/metaui/core/Registry#Registry": "extension",
    // Handed to every custom layout: `ILayoutManager.render(..., engine: Engine, ...)`.
    "nz/co/siliconst/ui5/metaui/core/Engine#Engine": "extension",
    // Closure over IPolicyEffectPlugin: its `apply()` returns `{ property: PropertyName }`,
    // so a custom effect plugin cannot be written without naming this closed union.
    // The PolicyEngine CLASS in the same module stays internal.
    "nz/co/siliconst/ui5/metaui/core/PolicyEngine#PropertyName": "extension",
    // Implemented by BasePlugin; `IPluginEngineContext` is the documented `engineContext`.
    "nz/co/siliconst/ui5/metaui/interfaces/IPlugin#*": "extension",
    // IValidator / IFormatter / IParser / IValidationResult: the pipeline contracts a
    // custom validator implements and returns.
    "nz/co/siliconst/ui5/metaui/interfaces/IPipeline#*": "extension",
    // AI_Schema_CheatSheet.md and PolicyBasedRulesEngine.md: custom condition and effect
    // plugins, registered with registerPolicyConditionPath / registerPolicyEffectPath.
    "nz/co/siliconst/ui5/metaui/interfaces/IPolicyPlugin#*": "extension",
    // PluginRegistry.registerLayoutPath() accepts a custom layout; this is its contract.
    "nz/co/siliconst/ui5/metaui/interfaces/ILayoutManager#*": "extension",
    // Closure over Engine: `Engine.host` is an `IEngineHost`.
    "nz/co/siliconst/ui5/metaui/interfaces/IEngineHost#*": "extension",
    // Registered on SchemaBuilderRegistry; exists only to be implemented from outside.
    "nz/co/siliconst/ui5/metaui/interfaces/ISchemaBuilderPlugin#*": "extension",
    "nz/co/siliconst/ui5/metaui/openapi/interfaces/IOpenApiParserPlugin#*": "extension",
    "nz/co/siliconst/ui5/metaui/openapi/heuristics/interfaces/IHeuristicPlugin#*": "extension",
    // Closure over BasePlugin: `protected openNestedEditorDialog(options: INestedEditorLaunchOptions)`.
    "nz/co/siliconst/ui5/metaui/utils/ControlCapabilities#INestedEditorLaunchOptions": "extension"
};

/**
 * Tier leaks that have been reviewed and accepted: a gated declaration whose signature
 * names an internal type. Accepting one freezes that type's NAME (renaming it alters a
 * gated line) but not its members. Anything not listed here is reported as a new leak.
 *
 * Keyed `<tier of the citing declaration>:<referenced symbol>`; one entry covers every
 * citation of that symbol from that tier.
 */
const ACCEPTED_TIER_LEAKS = new Set([
    // APIReference.md documents `DynamicHost.getStateManager(): StateManager | null`.
    // The accessor is promised and the class NAME is therefore frozen; the object it
    // hands back is not promised, and APIReference.md says so explicitly.
    "public:StateManager",
    // `IEngineHost.getStateManager()`, for the same reason, one tier down.
    "extension:StateManager"
]);

const HEADER = [
    "# MetaUI published API surface - GENERATED, DO NOT EDIT BY HAND.",
    "#",
    "# Regenerate after any change to an exported declaration:",
    "#   npm run build",
    "#   node .github/scripts/api-surface.js dist --out .github/api-surface.txt",
    "#",
    "# Every exported declaration in the nz/co/siliconst namespace appears below, split",
    "# into three tiers. CI fails when this file is stale, so EVERY change - internal",
    "# included - shows up in the diff of the pull request that causes it. What differs",
    "# between the tiers is what the release gate does about it:",
    "#",
    "#   public     Documented in docs/wiki/APIReference.md for applications.",
    "#              GATED: a patch bump must leave it byte-identical, a minor bump may",
    "#              only add to it, a removal or change needs a major bump.",
    "#   extension  Documented in docs/wiki/CreatingPlugins.md and the policy / OpenAPI",
    "#              extension points, for code that plugs INTO MetaUI. GATED, same rules.",
    "#   internal   Exported so the AMD loader and PluginRegistry can reach it. NOT a",
    "#              promise to anyone. REPORTED at release time, never gated: it may",
    "#              change in a patch release.",
    "#",
    "# Tier membership comes from the API_TIERS allowlist in api-surface.js, not from the",
    "# @public JSDoc tag. A new export defaults to `internal`, which is the safe side.",
    "# `@internal` in the JSDoc demotes; nothing in src/ can promote.",
    "#",
    "# `private` members are excluded; `protected` members are kept, because plugin",
    "# authors subclass BasePlugin and friends.",
    ""
];

/**
 * Recursively collects every `.d.ts` file under a directory.
 *
 * @param {string} dir Directory to walk.
 * @param {string[]} [acc] Accumulator used by the recursion.
 * @returns {string[]} Absolute paths of the declaration files found.
 */
function collectDeclarations(dir, acc = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === "node_modules" || entry.name === ".git") continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) collectDeclarations(full, acc);
        else if (entry.name.endsWith(".d.ts")) acc.push(full);
    }
    return acc;
}

const printer = ts.createPrinter({ removeComments: true, newLine: ts.NewLineKind.LineFeed });

/**
 * Prints a node without comments and collapses its whitespace onto one line.
 *
 * @param {import("typescript").Node} node Node to print.
 * @param {import("typescript").SourceFile} sourceFile Owning source file.
 * @returns {string} The single-line normalized text.
 */
function print(node, sourceFile) {
    return printer.printNode(ts.EmitHint.Unspecified, node, sourceFile).replace(/\s+/g, " ").trim();
}

/**
 * Reports whether a declaration carries a given modifier keyword.
 *
 * @param {import("typescript").Node} node Node to inspect.
 * @param {number} kind The `ts.SyntaxKind` of the modifier.
 * @returns {boolean} True when the modifier is present.
 */
function hasModifier(node, kind) {
    return !!(ts.canHaveModifiers(node) && (ts.getModifiers(node) || []).some((m) => m.kind === kind));
}

/**
 * Reads the JSDoc tag names attached to a declaration in the emitted `.d.ts`.
 *
 * The UI5 TypeScript build keeps doc comments in the declaration output, so the tags an
 * author wrote in `src/` survive into the file this extractor reads.
 *
 * @param {import("typescript").Node} node Declaration to inspect.
 * @returns {Set<string>} Lower-cased tag names, without the leading `@`.
 */
function jsDocTagNames(node) {
    /** @type {Set<string>} */
    const names = new Set();
    for (const tag of ts.getJSDocTags(node) || []) {
        if (tag.tagName && typeof tag.tagName.escapedText === "string") {
            names.add(String(tag.tagName.escapedText).toLowerCase());
        }
    }
    return names;
}

/**
 * Builds the declaration line of a class or interface: modifiers, name, type
 * parameters and heritage clauses, with the member block omitted.
 *
 * @param {import("typescript").ClassDeclaration|import("typescript").InterfaceDeclaration} node Declaration.
 * @param {import("typescript").SourceFile} sourceFile Owning source file.
 * @returns {string} The heading text.
 */
function heading(node, sourceFile) {
    const skip = new Set([ts.SyntaxKind.ExportKeyword, ts.SyntaxKind.DeclareKeyword, ts.SyntaxKind.DefaultKeyword]);
    const mods = (ts.getModifiers(node) || [])
        .filter((m) => !skip.has(m.kind))
        .map((m) => ts.tokenToString(m.kind))
        .join(" ");
    const kind = ts.isClassDeclaration(node) ? "class" : "interface";
    const name = node.name ? node.name.text : "(anonymous)";
    const typeParams = node.typeParameters
        ? `<${node.typeParameters.map((p) => print(p, sourceFile)).join(", ")}>`
        : "";
    const heritage = (node.heritageClauses || []).map((h) => print(h, sourceFile)).join(" ");
    return `${mods ? mods + " " : ""}${kind} ${name}${typeParams}${heritage ? " " + heritage : ""}`;
}

/**
 * Names the exported symbols a statement introduces, for tier lookup.
 *
 * @param {import("typescript").Statement} node The exported statement.
 * @returns {string[]} Symbol names; `default` for a default export.
 */
function declaredNames(node) {
    if (
        ts.isClassDeclaration(node) ||
        ts.isInterfaceDeclaration(node) ||
        ts.isEnumDeclaration(node) ||
        ts.isTypeAliasDeclaration(node) ||
        ts.isFunctionDeclaration(node)
    ) {
        if (hasModifier(node, ts.SyntaxKind.DefaultKeyword)) {
            return node.name ? [node.name.text, "default"] : ["default"];
        }
        return node.name ? [node.name.text] : [];
    }
    if (ts.isVariableStatement(node)) {
        return node.declarationList.declarations
            .map((d) => (ts.isIdentifier(d.name) ? d.name.text : ""))
            .filter(Boolean);
    }
    if (ts.isExportAssignment(node)) return ["default"];
    if (ts.isModuleDeclaration(node)) return [node.name && ts.isIdentifier(node.name) ? node.name.text : ""];
    return [];
}

/**
 * Renders one exported declaration as a sorted, order-stable block of lines.
 *
 * @param {import("typescript").Statement} node The exported statement.
 * @param {import("typescript").SourceFile} sourceFile Owning source file.
 * @returns {string[]|null} Lines for the snapshot, or null when the node is not API.
 */
function renderDeclaration(node, sourceFile) {
    if (ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node)) {
        const members = node.members
            .filter((m) => !hasModifier(m, ts.SyntaxKind.PrivateKeyword))
            .filter((m) => !(m.name && ts.isPrivateIdentifier(m.name)))
            .map((m) => print(m, sourceFile))
            .filter((text) => text.length > 0)
            .sort();
        return [`  ${heading(node, sourceFile)}`, ...members.map((m) => `    ${m}`)];
    }
    if (ts.isEnumDeclaration(node)) {
        const members = node.members.map((m) => print(m, sourceFile)).sort();
        return [`  enum ${node.name.text}`, ...members.map((m) => `    ${m}`)];
    }
    if (
        ts.isTypeAliasDeclaration(node) ||
        ts.isFunctionDeclaration(node) ||
        ts.isVariableStatement(node) ||
        ts.isExportAssignment(node) ||
        ts.isExportDeclaration(node) ||
        ts.isModuleDeclaration(node)
    ) {
        return [`  ${print(node, sourceFile)}`];
    }
    return null;
}

const RELATIVE_SPECIFIER = /((?:from|import\()\s*)"(\.[^"]*)"/g;

/**
 * Rewrites relative module specifiers to the absolute names they resolve to.
 *
 * `scripts/publish-prep.js` performs the same rewrite on the tarball, so without
 * this the snapshot would differ between a plain build and a prepped one and the
 * gate would fire on a layout change rather than an API change.
 *
 * @param {string} line A rendered snapshot line.
 * @param {string} moduleName The name of the ambient module that declares it.
 * @returns {string} The line with relative specifiers absolutized.
 */
function absolutize(line, moduleName) {
    if (!moduleName.includes("/")) return line;
    const base = moduleName.slice(0, moduleName.lastIndexOf("/"));
    return line.replace(RELATIVE_SPECIFIER, (whole, prefix, specifier) => {
        const parts = `${base}/${specifier}`.split("/");
        /** @type {string[]} */
        const resolved = [];
        for (const part of parts) {
            if (part === "." || part === "") continue;
            if (part === "..") resolved.pop();
            else resolved.push(part);
        }
        return `${prefix}"${resolved.join("/")}"`;
    });
}

/** Collects tier diagnostics so one run can report them all. */
const diagnostics = {
    /** @type {Set<string>} Allowlist keys that matched at least one declaration. */
    matchedTierKeys: new Set(),
    /** @type {string[]} `@internal` on a symbol the allowlist promises - a contradiction. */
    tagConflicts: [],
    /** @type {string[]} `@public` JSDoc on a symbol that is only in the internal tier. */
    tagMismatches: [],
    /** @type {string[]} A gated declaration with no `@public` JSDoc tag. */
    missingPublicTag: [],
    /** @type {string[]} A gated declaration whose signature names an internal symbol. */
    leaks: []
};

/**
 * Resolves the tier of one exported declaration.
 *
 * The allowlist is the only route into `public` or `extension`; an `@internal` JSDoc tag
 * demotes and never promotes. A symbol that is both allowlisted and tagged `@internal`
 * is recorded as a conflict, because the two statements of intent disagree.
 *
 * @param {string} moduleName Declaring ambient module.
 * @param {string[]} names Symbols the declaration introduces.
 * @param {Set<string>} tags JSDoc tag names on the declaration.
 * @returns {"public"|"extension"|"internal"} The resolved tier.
 */
function resolveTier(moduleName, names, tags) {
    let listed = "internal";
    for (const name of names) {
        const key = `${moduleName}#${name}`;
        const wildcard = `${moduleName}#*`;
        const hit = Object.prototype.hasOwnProperty.call(API_TIERS, key)
            ? ((diagnostics.matchedTierKeys.add(key), API_TIERS[key]))
            : Object.prototype.hasOwnProperty.call(API_TIERS, wildcard)
                ? ((diagnostics.matchedTierKeys.add(wildcard), API_TIERS[wildcard]))
                : "internal";
        if (hit === "public") listed = "public";
        else if (hit === "extension" && listed !== "public") listed = "extension";
    }
    const label = `${moduleName}#${names.join(",") || "(anonymous)"}`;
    if (tags.has("internal")) {
        if (listed !== "internal") {
            diagnostics.tagConflicts.push(
                `${label} is listed as '${listed}' in API_TIERS but tagged @internal in src/. ` +
                "Remove one of the two."
            );
        }
        return "internal";
    }
    if (tags.has("public") && listed === "internal") {
        diagnostics.tagMismatches.push(`${label} [${listed}] is tagged @public in src/. Replace the tag with @internal.`);
    }
    if (!tags.has("public") && listed !== "internal") {
        diagnostics.missingPublicTag.push(`${label} [${listed}] carries no @public tag in src/. Add one.`);
    }
    return listed;
}

const IDENTIFIER = /\b[A-Z][A-Za-z0-9_$]*\b/g;
const TIER_RANK = { internal: 0, extension: 1, public: 2 };

/**
 * Reports gated declarations whose signatures name a symbol from a lower tier.
 *
 * A promised signature that mentions an unpromised type leaks it: the consumer cannot
 * use the promise without touching the type. Each leak is either promoted or listed in
 * `ACCEPTED_TIER_LEAKS` with the reason; anything else is new and is reported.
 *
 * @param {Array<{module: string, tier: string, names: string[], lines: string[]}>} blocks All rendered blocks.
 * @returns {void}
 */
function detectTierLeaks(blocks) {
    /** @type {Map<string, string>} symbol -> highest tier it is declared at */
    const symbolTier = new Map();
    for (const block of blocks) {
        for (const name of block.names) {
            const current = symbolTier.get(name);
            if (!current || TIER_RANK[block.tier] > TIER_RANK[current]) symbolTier.set(name, block.tier);
        }
    }
    /** @type {Set<string>} */
    const reported = new Set();
    for (const block of blocks) {
        if (block.tier === "internal") continue;
        const own = new Set(block.names);
        for (const line of block.lines) {
            for (const match of line.matchAll(IDENTIFIER)) {
                const symbol = match[0];
                if (own.has(symbol)) continue;
                const tier = symbolTier.get(symbol);
                if (!tier || TIER_RANK[tier] >= TIER_RANK[block.tier]) continue;
                const key = `${block.tier}:${symbol}`;
                if (ACCEPTED_TIER_LEAKS.has(key) || reported.has(key)) continue;
                reported.add(key);
                diagnostics.leaks.push(
                    `${block.module}#${block.names.join(",")} (${block.tier}) names '${symbol}', which is ${tier}. ` +
                    "Promote it, or add it to ACCEPTED_TIER_LEAKS with the reason."
                );
            }
        }
    }
}

/**
 * Extracts every exported declaration from the statements of one module body.
 *
 * @param {import("typescript").NodeArray<import("typescript").Statement>} statements Statements to scan.
 * @param {import("typescript").SourceFile} sourceFile Owning source file.
 * @param {string} moduleName Name of the declaring module, used to absolutize specifiers.
 * @returns {Array<{module: string, tier: string, names: string[], lines: string[]}>} Rendered blocks.
 */
function extractExports(statements, sourceFile, moduleName) {
    const blocks = [];
    for (const stmt of statements) {
        const exported =
            hasModifier(stmt, ts.SyntaxKind.ExportKeyword) ||
            ts.isExportAssignment(stmt) ||
            ts.isExportDeclaration(stmt);
        if (!exported) continue;
        const lines = renderDeclaration(stmt, sourceFile);
        if (!lines) continue;
        const names = declaredNames(stmt);
        blocks.push({
            module: moduleName,
            tier: resolveTier(moduleName, names, jsDocTagNames(stmt)),
            names,
            lines: lines.map((line) => absolutize(line, moduleName))
        });
    }
    return blocks;
}

/**
 * Builds the full tiered API snapshot for a directory of emitted declarations.
 *
 * @param {string} rootDir Directory containing `.d.ts` files.
 * @returns {string} The snapshot text, newline terminated.
 */
function buildSnapshot(rootDir) {
    const files = collectDeclarations(rootDir).sort();
    if (files.length === 0) {
        console.error(`api-surface: no .d.ts files found under ${rootDir}. Run \`npm run build\` first.`);
        process.exit(2);
    }
    /** @type {Array<{module: string, tier: string, names: string[], lines: string[]}>} */
    const allBlocks = [];
    /** @type {Set<string>} */
    const foreignModules = new Set();

    for (const file of files) {
        const text = fs.readFileSync(file, "utf8");
        const sourceFile = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
        let sawAmbientModule = false;

        for (const stmt of sourceFile.statements) {
            if (ts.isModuleDeclaration(stmt) && ts.isStringLiteral(stmt.name) && stmt.body && ts.isModuleBlock(stmt.body)) {
                sawAmbientModule = true;
                const name = stmt.name.text;
                // SAP's own controls, declared ambiently in src/.../typings/ui5-custom.d.ts
                // so MetaUI can consume them. MetaUI does not publish them.
                if (!name.startsWith(NAMESPACE)) {
                    foreignModules.add(name);
                    continue;
                }
                allBlocks.push(...extractExports(stmt.body.statements, sourceFile, name));
            }
        }
        if (!sawAmbientModule) {
            // A plain (non-ambient) declaration file: key it by its path relative to rootDir.
            const rel = path.relative(rootDir, file).replace(/\\/g, "/");
            if (!rel.includes(NAMESPACE)) continue;
            allBlocks.push(...extractExports(sourceFile.statements, sourceFile, `(file) ${rel}`));
        }
    }

    detectTierLeaks(allBlocks);

    const out = [...HEADER];
    /** @type {Record<string, number>} */
    const moduleCounts = {};
    /** @type {Record<string, number>} */
    const blockCounts = {};

    for (const tier of TIERS) {
        const tierBlocks = allBlocks.filter((b) => b.tier === tier && b.lines.length > 0);
        /** @type {Map<string, string[][]>} */
        const byModule = new Map();
        for (const block of tierBlocks) {
            const existing = byModule.get(block.module) || [];
            existing.push(block.lines);
            byModule.set(block.module, existing);
        }
        moduleCounts[tier] = byModule.size;
        blockCounts[tier] = tierBlocks.length;

        out.push(`${SECTION_PREFIX}${tier} ===`);
        for (const name of [...byModule.keys()].sort()) {
            const groups = byModule.get(name);
            groups.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
            out.push(`module ${name}`);
            for (const group of groups) out.push(...group);
        }
        out.push("");
    }

    const totalModules = new Set(allBlocks.filter((b) => b.lines.length > 0).map((b) => b.module)).size;
    out.push(`# modules: ${totalModules} (public ${moduleCounts.public}, extension ${moduleCounts.extension}, internal ${moduleCounts.internal})`);
    out.push(`# declarations: ${blockCounts.public + blockCounts.extension + blockCounts.internal} (public ${blockCounts.public}, extension ${blockCounts.extension}, internal ${blockCounts.internal})`);
    out.push(`# excluded, not MetaUI's API: ${[...foreignModules].sort().join(", ") || "(none)"}`);
    return out.join("\n") + "\n";
}

/**
 * Prints the tier diagnostics gathered during extraction.
 *
 * @param {boolean} strict True when an unresolved diagnostic should fail the run.
 * @returns {boolean} True when a strict run must fail.
 */
function reportDiagnostics(strict) {
    let fatal = false;
    const stale = Object.keys(API_TIERS).filter((k) => !diagnostics.matchedTierKeys.has(k));

    // A conflict is a repository bug and fails any run against the current build. Over an
    // older published tarball it is only reported: there, `@internal` demoting a
    // now-promised symbol makes the old surface SMALLER, so the newly promised declaration
    // reads as an addition to the gated tier - the safe direction for the release gate.
    for (const conflict of diagnostics.tagConflicts) {
        console.error(`api-surface: [TIER_CONFLICT] ${conflict}`);
        if (strict) fatal = true;
    }
    if (stale.length > 0) {
        for (const key of stale) {
            console.error(`api-surface: [TIER_STALE] API_TIERS promises '${key}', which no declaration matches.`);
        }
        if (strict) fatal = true;
    }
    for (const leak of diagnostics.leaks) {
        console.error(`api-surface: [TIER_LEAK] ${leak}`);
    }
    if (diagnostics.tagMismatches.length > 0) {
        console.error(
            `api-surface: ${diagnostics.tagMismatches.length} declaration(s) tagged @public in src/ are in the ` +
            "internal tier. The tag is advisory only; run with --tier-report to list them."
        );
    }
    return fatal;
}

/**
 * Prints the first differing lines between two snapshots.
 *
 * @param {string} expected The committed snapshot.
 * @param {string} actual The freshly generated snapshot.
 * @returns {void}
 */
function reportDiff(expected, actual) {
    const a = expected.split("\n");
    const b = actual.split("\n");
    const removed = new Set(a);
    const added = new Set(b);
    const onlyExpected = a.filter((l) => l.trim() && !added.has(l));
    const onlyActual = b.filter((l) => l.trim() && !removed.has(l));
    const show = (label, lines) => {
        for (const line of lines.slice(0, 40)) console.error(`${label} ${line}`);
        if (lines.length > 40) console.error(`${label} ... and ${lines.length - 40} more`);
    };
    show("-", onlyExpected);
    show("+", onlyActual);
}

const args = process.argv.slice(2);
if (args.length === 0 || args.includes("--help")) {
    console.error("usage: node .github/scripts/api-surface.js <rootDir> [--out <file> | --check <file> | --tier-report]");
    process.exit(2);
}
const rootDir = path.resolve(args[0]);
if (!fs.existsSync(rootDir) || !fs.statSync(rootDir).isDirectory()) {
    console.error(`api-surface: ${rootDir} is not a directory.`);
    process.exit(2);
}

const snapshot = buildSnapshot(rootDir);
const outIndex = args.indexOf("--out");
const checkIndex = args.indexOf("--check");
const tierReport = args.includes("--tier-report");

// --out and --check run against the current build, so a tier allowlist entry that matches
// nothing means a promised symbol has vanished and the run fails. A bare run is used by
// api-semver-gate.js over an older published tarball, which may legitimately predate a
// newly promised symbol, so there it is reported but not fatal.
const strict = outIndex !== -1 || checkIndex !== -1 || tierReport;
if (reportDiagnostics(strict)) {
    console.error("api-surface: refusing to continue with an inconsistent tier assignment.");
    process.exit(2);
}

if (tierReport) {
    const counts = snapshot.split("\n").filter((l) => l.startsWith("# "));
    for (const line of counts) console.log(line.replace(/^# /, "api-surface: "));
    const missing = [...new Set(diagnostics.missingPublicTag)].sort();
    const mismatched = [...new Set(diagnostics.tagMismatches)].sort();
    if (missing.length > 0) {
        console.log("");
        console.log(`Gated declarations with no @public tag (${missing.length}):`);
        for (const line of missing) console.log(`  ${line}`);
    }
    if (mismatched.length > 0) {
        console.log("");
        console.log(`Internal declarations tagged @public (${mismatched.length}):`);
        for (const line of mismatched) console.log(`  ${line}`);
    }
    if (diagnostics.leaks.length === 0) console.log("api-surface: no unaccepted tier leaks.");
} else if (outIndex !== -1) {
    const target = args[outIndex + 1];
    if (!target) {
        console.error("api-surface: --out needs a file path.");
        process.exit(2);
    }
    fs.mkdirSync(path.dirname(path.resolve(target)), { recursive: true });
    fs.writeFileSync(target, snapshot);
    console.log(`api-surface: wrote ${target} (${snapshot.split("\n").length - 1} lines)`);
} else if (checkIndex !== -1) {
    const target = args[checkIndex + 1];
    if (!target) {
        console.error("api-surface: --check needs a file path.");
        process.exit(2);
    }
    if (!fs.existsSync(target)) {
        console.error(`api-surface: ${target} does not exist. Generate it with --out.`);
        process.exit(1);
    }
    // Normalize line endings: the snapshot is written LF but Git may check it out CRLF.
    const expected = fs.readFileSync(target, "utf8").replace(/\r\n/g, "\n");
    if (expected !== snapshot) {
        console.error(`api-surface: ${target} is stale - the exported API changed.`);
        console.error("Regenerate it and commit the diff:");
        console.error("  npm run build && node .github/scripts/api-surface.js dist --out .github/api-surface.txt");
        console.error("");
        reportDiff(expected, snapshot);
        process.exit(1);
    }
    console.log(`api-surface: ${target} is up to date.`);
} else {
    process.stdout.write(snapshot);
}
