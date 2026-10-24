/**
 * @file run-tests.js
 * @description Automated headless browser test runner for MetaUI.
 * Executes:
 *  1. QUnit Unit Test Suite (Core Architecture, Pipeline Validators/Formatters, Physical DOM Control Plugins)
 *  2. QUnit Integration & E2E Matrix Suite (Kitchen Sink, Tri-Binding, PBRE, Wizard, Inference, Dialogs)
 *  3. Live Fiori Sandbox App Verification (Launchpad, ScenarioRunner, Playpen, OpenAPI, Playground)
 */

const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");
const { spawnSync } = require("child_process");
const ts = require("typescript");
const puppeteer = require("puppeteer");

const ROOT_DIR = path.resolve(__dirname, "..");
const SRC_ROOT_DIR = path.join(ROOT_DIR, "src");
const SRC_DIR = path.join(ROOT_DIR, "src", "nz", "co", "siliconst", "ui5", "metaui");
const SCRIPTS_DIR = path.join(ROOT_DIR, "scripts");
const TEST_DIR = path.join(ROOT_DIR, "test", "webapp", "test");
const WEBAPP_DIR = path.join(ROOT_DIR, "test", "webapp");
const DIST_RESOURCES_DIR = path.join(ROOT_DIR, "dist", "resources");

function collectAllFilesWithExt(dir, extensions = [".ts"], out = []) {
    if (!fs.existsSync(dir)) return out;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            collectAllFilesWithExt(full, extensions, out);
        } else if (entry.isFile() && extensions.some((ext) => entry.name.endsWith(ext))) {
            out.push(full);
        }
    }
    return out;
}

function collectSourceFiles(dir, extensions = [".ts"], out = []) {
    if (!fs.existsSync(dir)) return out;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            collectSourceFiles(full, extensions, out);
        } else if (
            entry.isFile() &&
            !entry.name.endsWith(".d.ts") &&
            extensions.some((ext) => entry.name.endsWith(ext))
        ) {
            out.push(full);
        }
    }
    return out;
}

function collectTsFiles(dir, out = []) {
    return collectSourceFiles(dir, [".ts"], out);
}

function runAstLintOnFile(file, rel, content, allowConsole, violations) {
    const scriptKind = file.endsWith(".js") ? ts.ScriptKind.JS : ts.ScriptKind.TS;
    const sourceFile = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true, scriptKind);
    function visit(node) {
        if (node.kind === ts.SyntaxKind.AnyKeyword) {
            const pos = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
            violations.push(`[NO_EXPLICIT_ANY] ${rel}:${pos.line + 1}:${pos.character + 1} uses forbidden 'any' type.`);
        }
        if (ts.isCatchClause(node) && node.block.statements.length === 0) {
            const pos = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
            violations.push(
                `[NO_EMPTY_CATCH] ${rel}:${pos.line + 1}:${pos.character + 1} contains an empty or comment-only catch block.`
            );
        }
        if (!allowConsole && ts.isIdentifier(node) && node.text === "console") {
            const parent = node.parent;
            const isPropertyName =
                (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
                (ts.isPropertyAssignment(parent) && parent.name === node) ||
                (ts.isPropertySignature(parent) && parent.name === node);
            if (!isPropertyName) {
                const pos = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
                violations.push(
                    `[NO_CONSOLE] ${rel}:${pos.line + 1}:${pos.character + 1} references 'console' directly instead of Logger.`
                );
            }
        }
        ts.forEachChild(node, visit);
    }
    visit(sourceFile);
}

function countExecutableLines(lines) {
    let inBlockComment = false;
    let count = 0;
    for (const rawLine of lines) {
        const trimmed = rawLine.trim();
        if (!trimmed) continue;
        if (inBlockComment) {
            if (trimmed.includes("*/")) {
                inBlockComment = false;
            }
            continue;
        }
        if (trimmed.startsWith("/*")) {
            if (!trimmed.includes("*/")) {
                inBlockComment = true;
            }
            continue;
        }
        if (trimmed.startsWith("//") || trimmed.startsWith("*")) {
            continue;
        }
        count++;
    }
    return count;
}

// Commented allowlist for legitimate non-source identifiers in docs/wiki/*.md, README.md, and docs/ARCHITECTURE.md
const DOC_SYMBOL_ALLOWLIST = new Map([
    // SAPUI5 framework controls, classes, modules, and enums
    ["ManagedObject", "SAPUI5 base class sap.ui.base.ManagedObject"],
    ["ManagedObject.applySettings", "SAPUI5 ManagedObject.prototype.applySettings lifecycle method"],
    ["BindingParser", "SAPUI5 internal binding parser sap.ui.base.BindingParser"],
    ["BindingMode", "SAPUI5 enum sap.ui.model.BindingMode"],
    ["OneWay", "SAPUI5 enum member sap.ui.model.BindingMode.OneWay"],
    ["Control", "SAPUI5 base control sap.ui.core.Control"],
    ["Event", "SAPUI5 event class sap.ui.base.Event"],
    ["Messaging", "SAPUI5 singleton module sap/ui/core/Messaging"],
    ["MessageManager", "SAPUI5 message manager sap.ui.core.message.MessageManager"],
    ["MessagePopover", "SAPUI5 control sap.m.MessagePopover"],
    ["MessageStrip", "SAPUI5 control sap.m.MessageStrip"],
    ["SimpleForm", "SAPUI5 form container sap.ui.layout.form.SimpleForm"],
    ["ResponsiveGridLayout", "SAPUI5 form layout sap.ui.layout.form.ResponsiveGridLayout"],
    ["VBox", "SAPUI5 flex container sap.m.VBox"],
    ["HBox", "SAPUI5 flex container sap.m.HBox"],
    ["FlexItemData", "SAPUI5 flex layout data sap.m.FlexItemData"],
    ["Dialog", "SAPUI5 modal control sap.m.Dialog"],
    ["SelectDialog", "SAPUI5 value-help dialog control sap.m.SelectDialog"],
    ["Input", "SAPUI5 control sap.m.Input"],
    ["InputBase", "SAPUI5 base input control sap.m.InputBase"],
    ["Label", "SAPUI5 control sap.m.Label"],
    ["Button", "SAPUI5 control sap.m.Button"],
    ["ButtonType", "SAPUI5 enum sap.m.ButtonType"],
    ["Reject", "SAPUI5 enum member sap.m.ButtonType.Reject"],
    ["ValueState", "SAPUI5 enum sap.ui.core.ValueState"],
    ["ValueStateText", "SAPUI5 property on sap.m.InputBase"],
    ["Error", "SAPUI5 ValueState.Error / standard JS Error"],
    ["None", "SAPUI5 ValueState.None"],
    ["CodeEditor", "SAPUI5 control sap.ui.codeeditor.CodeEditor"],
    ["TextArea", "SAPUI5 control sap.m.TextArea"],
    ["JSONModel", "SAPUI5 model class sap.ui.model.json.JSONModel"],
    ["Core.initLibrary", "SAPUI5 library initialization call"],
    ["Messaging.registerObject", "SAPUI5 Messaging registration method"],
    ["getDomRef", "SAPUI5 Control.prototype.getDomRef"],
    ["getBoundingClientRect", "Standard DOM Element.prototype.getBoundingClientRect"],
    ["setEditable", "SAPUI5 control setter"],
    ["setEnabled", "SAPUI5 control setter"],
    ["setVisible", "SAPUI5 control setter"],
    ["setRequired", "SAPUI5 control setter"],
    ["getVisible", "SAPUI5 control getter"],
    ["getMetadata", "SAPUI5 ManagedObject.prototype.getMetadata"],
    ["getName", "SAPUI5 Metadata.prototype.getName"],
    ["applyChanges", "SAPUI5 Core.applyChanges"],
    ["requestObject", "SAPUI5 OData V4 Context.prototype.requestObject"],
    ["preventDefault", "MetaUI event callback parameter on beforeSubmit / beforeLayoutSectionChange"],
    ["resumeNavigation", "MetaUI event callback parameter on beforeLayoutSectionChange"],
    ["addError", "MetaUI event callback parameter on beforeSubmit / beforeLayoutSectionChange"],
    // Standard JavaScript / TypeScript built-ins
    ["super", "Standard JavaScript/TypeScript super() constructor call"],
    ["Date", "Standard JavaScript Date built-in"],
    ["Promise", "Standard JavaScript Promise built-in"],
    ["Record", "Standard TypeScript Record utility type"],
    // uiLayout structural element type names
    ["Group", "uiLayout element type in ILayoutElement.type"],
    ["HorizontalLayout", "uiLayout element type in ILayoutElement.type"],
    ["VerticalLayout", "uiLayout element type in ILayoutElement.type"],
    ["WizardStep", "uiLayout element type in ILayoutElement.type"],
    // Tutorial placeholder class/method names in docs/wiki/
    ["MyCustomPlugin", "Tutorial placeholder class in CreatingPlugins.md and AI_Schema_CheatSheet.md"],
    ["MyActionPlugin", "Tutorial placeholder action plugin in CreatingPlugins.md and SchemasAndInference.md"],
    [" ActionPlugin", "Tutorial concept reference in SchemasAndInference.md"],
    ["ActionPlugin", "Tutorial concept reference in SchemasAndInference.md"],
    ["CustomConditionPlugin", "Tutorial placeholder condition plugin in AI_Schema_CheatSheet.md"],
    ["StringContainsConditionPlugin", "Tutorial placeholder condition plugin in PolicyBasedRulesEngine.md"],
    ["StringContains", "Tutorial placeholder condition operator in PolicyBasedRulesEngine.md"],
    ["MyCustomCheck", "Tutorial placeholder condition key in AI_Schema_CheatSheet.md"],
    ["TriggerSubmit", "Conceptual action event description in SchemasAndInference.md"],
    // Test harness & sandbox symbols outside src/
    ["TestOracle", "Ground-truth test oracle in test/webapp/test/TestOracle.js"],
    ["PLUGIN_MAP", "Exported map on TestOracle in test/webapp/test/TestOracle.js"],
    ["LAYOUT_MAP", "Exported map on TestOracle in test/webapp/test/TestOracle.js"],
    ["POLICY_MAPs", "Shorthand reference to POLICY_CONDITION_MAP and POLICY_EFFECT_MAP on TestOracle"],
    ["POLICY_CONDITION_MAP", "Exported map on TestOracle in test/webapp/test/TestOracle.js"],
    ["POLICY_EFFECT_MAP", "Exported map on TestOracle in test/webapp/test/TestOracle.js"],
    ["VALIDATOR_LIST", "Exported list on TestOracle in test/webapp/test/TestOracle.js"],
    ["FORMATTER_LIST", "Exported list on TestOracle in test/webapp/test/TestOracle.js"],
    ["PARSER_LIST", "Exported list on TestOracle in test/webapp/test/TestOracle.js"],
    ["ScenarioRunner", "Sandbox test controller test/webapp/controller/ScenarioRunner.controller.js"],
    ["GenericTiles", "SAPUI5 sap.m.GenericTile controls in Fiori Sandbox"],
    // Example schema field names in documentation prose
    ["CustomerProfile", "Example OpenAPI schema target name in docs/wiki/"],
    ["FirstName", "Example schema property name in docs/wiki/"],
    ["CustomerName", "Example schema property name in docs/wiki/"],
    ["ShortName", "Example schema property name in docs/wiki/"],
    ["SpouseName", "Example schema property name in docs/wiki/"],
    ["MaritalStatus", "Example schema property name in docs/wiki/"],
    ["PassportNumber", "Example schema property name in docs/wiki/"],
    ["TotalGuests", "Example schema property name in docs/wiki/"],
    ["AccommodationType", "Example schema property name in docs/wiki/"],
    ["CheckInDate", "Example schema property name in docs/wiki/"],
    ["SpecialDietaryRequirements", "Example schema property name in docs/wiki/"],
    ["MealPlan", "Example schema property name in docs/wiki/"],
    ["AgreeTerms", "Example schema property name in docs/wiki/"],
    ["IsAdmin", "Example schema property name in docs/wiki/SchemasAndInference.md"],
    // UI5 generates these accessors at runtime from control metadata, so they are
    // deliberately absent from src/. SupportedFeatures.md documents that absence.
    ["getParameter", "SAPUI5 sap.ui.base.Event.prototype.getParameter"]
]);

// Markdown documents that MUST exist. A missing entry is a violation, never a silent skip:
// renaming an audited document used to make the entire audit of it disappear.
const REQUIRED_MARKDOWN_DOCS = ["README.md", "CONTRIBUTING.md", "AGENTS.md", "docs/ARCHITECTURE.md"];

/**
 * Resolves the full list of Markdown documents under audit (the required root documents plus
 * every docs/wiki/*.md page) and records a violation for each required document that is absent.
 */
function collectAuditedMarkdownFiles(violations) {
    const files = [];
    for (const rel of REQUIRED_MARKDOWN_DOCS) {
        const full = path.join(ROOT_DIR, rel);
        if (!fs.existsSync(full)) {
            violations.push(`[MD_AUDIT] Required audited document '${rel}' is missing.`);
            continue;
        }
        files.push(full);
    }
    const wikiDir = path.join(ROOT_DIR, "docs", "wiki");
    if (!fs.existsSync(wikiDir)) {
        violations.push(`[MD_AUDIT] Required documentation directory 'docs/wiki/' is missing.`);
        return files;
    }
    const wikiMd = fs.readdirSync(wikiDir).filter((f) => f.endsWith(".md")).sort();
    if (wikiMd.length === 0) {
        violations.push(`[MD_AUDIT] Required documentation directory 'docs/wiki/' contains no .md pages.`);
    }
    for (const f of wikiMd) {
        files.push(path.join(wikiDir, f));
    }
    return files;
}

/**
 * Every relative Markdown link between audited documents must resolve to a file that exists.
 * This is what catches the deletion of a wiki page that the required list cannot enumerate.
 */
function auditMarkdownCrossLinks(mdFiles, violations) {
    for (const full of mdFiles) {
        const relMd = path.relative(ROOT_DIR, full).replace(/\\/g, "/");
        const text = fs.readFileSync(full, "utf8");
        for (const m of text.matchAll(/]\(([^)\s#]+\.md)(?:#[^)]*)?\)/g)) {
            const target = m[1];
            if (/^[a-z][a-z0-9+.-]*:/i.test(target)) continue;
            if (!fs.existsSync(path.resolve(path.dirname(full), target))) {
                violations.push(`[MD_LINK] ${relMd} links to missing document '${target}'.`);
            }
        }
    }
}

/**
 * Evaluates test/webapp/test/TestOracle.js in a throwaway context and returns its exported maps.
 */
function loadTestOracle(oracleFile) {
    return vm.runInNewContext(fs.readFileSync(oracleFile, "utf8"), {
        sap: { ui: { define: (_deps, factory) => factory() } }
    });
}

/**
 * Builds the AST symbol index used by the documentation gates:
 *  - `astSymbols`: every declared name anywhere in src/ (flat, used for bare identifiers).
 *  - `containers`: declared name -> { members, bases, aliasOf }, so that a `Class.method()`
 *    citation can be resolved against THAT class (plus its resolvable base classes) instead of
 *    against the whole codebase.
 */
function buildSymbolIndex(tsFiles) {
    const astSymbols = new Set();
    const containers = new Map();
    const ensure = (name) => {
        if (!containers.has(name)) {
            containers.set(name, { members: new Set(), bases: [], aliasOf: undefined });
        }
        return containers.get(name);
    };

    for (const file of tsFiles) {
        const moduleName = path.basename(file, ".ts");
        astSymbols.add(moduleName);
        const moduleContainer = ensure(moduleName);
        const content = fs.readFileSync(file, "utf8");
        const sf = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

        const memberName = (node) => {
            if (!node.name) return undefined;
            return ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)
                ? node.name.text
                : node.name.getText(sf);
        };

        function collect(node) {
            if (
                (ts.isClassDeclaration(node) ||
                    ts.isInterfaceDeclaration(node) ||
                    ts.isTypeAliasDeclaration(node) ||
                    ts.isFunctionDeclaration(node) ||
                    ts.isEnumDeclaration(node) ||
                    ts.isEnumMember(node) ||
                    ts.isVariableDeclaration(node) ||
                    ts.isMethodDeclaration(node) ||
                    ts.isMethodSignature(node) ||
                    ts.isPropertyDeclaration(node) ||
                    ts.isPropertySignature(node) ||
                    ts.isGetAccessorDeclaration(node) ||
                    ts.isSetAccessorDeclaration(node)) &&
                node.name
            ) {
                const nameText = memberName(node);
                if (nameText) astSymbols.add(nameText);
            }

            if (ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node)) {
                const declared = memberName(node);
                if (declared) {
                    const container = ensure(declared);
                    moduleContainer.members.add(declared);
                    for (const member of node.members) {
                        const mn = memberName(member);
                        if (mn) container.members.add(mn);
                    }
                    for (const heritage of node.heritageClauses || []) {
                        for (const typeRef of heritage.types) {
                            if (ts.isIdentifier(typeRef.expression)) {
                                container.bases.push(typeRef.expression.text);
                            } else if (ts.isPropertyAccessExpression(typeRef.expression)) {
                                container.bases.push(typeRef.expression.name.text);
                            }
                        }
                    }
                }
            } else if (ts.isEnumDeclaration(node)) {
                const declared = memberName(node);
                if (declared) {
                    const container = ensure(declared);
                    moduleContainer.members.add(declared);
                    for (const member of node.members) {
                        const mn = memberName(member);
                        if (mn) container.members.add(mn);
                    }
                }
            } else if (ts.isTypeAliasDeclaration(node)) {
                const declared = memberName(node);
                if (declared) {
                    moduleContainer.members.add(declared);
                    const container = ensure(declared);
                    if (ts.isTypeLiteralNode(node.type)) {
                        for (const member of node.type.members) {
                            const mn = memberName(member);
                            if (mn) container.members.add(mn);
                        }
                    }
                }
                if (ts.isUnionTypeNode(node.type)) {
                    for (const t of node.type.types) {
                        if (ts.isLiteralTypeNode(t) && ts.isStringLiteral(t.literal)) {
                            astSymbols.add(t.literal.text);
                        }
                    }
                }
            } else if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
                const declared = node.name.text;
                moduleContainer.members.add(declared);
                const container = ensure(declared);
                let init = node.initializer;
                while (init && (ts.isAsExpression(init) || ts.isParenthesizedExpression(init))) {
                    init = init.expression;
                }
                if (init && ts.isObjectLiteralExpression(init)) {
                    for (const prop of init.properties) {
                        if (prop.name && (ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name))) {
                            container.members.add(prop.name.text);
                            astSymbols.add(prop.name.text);
                        }
                    }
                } else if (init && ts.isNewExpression(init) && ts.isIdentifier(init.expression)) {
                    container.aliasOf = init.expression.text;
                }
            } else if (ts.isFunctionDeclaration(node) && node.name) {
                moduleContainer.members.add(node.name.text);
            }
            ts.forEachChild(node, collect);
        }
        collect(sf);
    }

    return { astSymbols, containers };
}

/**
 * Resolves the full member set of a declared container, walking `extends`/`implements` chains and
 * `const X = new Y()` aliases. `declared` is false when the name is not declared in src/ at all;
 * `open` is true when some base class lives outside src/ (e.g. a SAPUI5 base control).
 */
function resolveContainerMembers(containers, name, seen = new Set()) {
    if (seen.has(name)) return { declared: true, members: new Set(), open: false };
    seen.add(name);
    const container = containers.get(name);
    if (!container) return { declared: false, members: new Set(), open: true };
    const members = new Set(container.members);
    let open = false;
    const chain = container.aliasOf ? [container.aliasOf, ...container.bases] : [...container.bases];
    for (const base of chain) {
        const resolved = resolveContainerMembers(containers, base, seen);
        if (!resolved.declared || resolved.open) open = true;
        for (const m of resolved.members) members.add(m);
    }
    return { declared: true, members, open };
}

/**
 * Counts the exemptions the lint gate actually grants, so the banner can report the real number
 * instead of a hardcoded zero. `docSymbolAllowlistHits` is filled in by the documentation audit.
 */
/** Re-runs GATE G purely to count its justified exemptions, so the tally is measured. */
function countCatchSignalExemptions(tsFiles) {
    return runCatchSignalGate([], tsFiles);
}

/** Re-runs GATE J purely to count its justified exemptions, so the tally is measured. */
function countSingleWalkerExemptions(tsFiles) {
    return runSingleWalkerGate([], tsFiles);
}

function countGateExemptions(
    tsFiles,
    scriptFiles,
    docSymbolAllowlistHits,
    catchSignalExemptions,
    singleWalkerExemptions
) {
    let bindingCasts = 0;
    for (const file of tsFiles) {
        for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
            const trimmed = line.trim();
            if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) continue;
            if (line.includes("as unknown as") && /\bas unknown as\s+(string(\[\])?|number|boolean)\b/.test(line)) {
                bindingCasts++;
            }
        }
    }

    let consoleFiles = 0;
    let consoleRefs = 0;
    for (const file of scriptFiles) {
        const rel = path.relative(ROOT_DIR, file).replace(/\\/g, "/");
        if (!rel.startsWith("scripts/")) continue;
        const content = fs.readFileSync(file, "utf8");
        const sf = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
        let refsInFile = 0;
        (function visit(node) {
            if (ts.isIdentifier(node) && node.text === "console") {
                const parent = node.parent;
                const isPropertyName =
                    (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
                    (ts.isPropertyAssignment(parent) && parent.name === node);
                if (!isPropertyName) refsInFile++;
            }
            ts.forEachChild(node, visit);
        })(sf);
        if (refsInFile > 0) {
            consoleFiles++;
            consoleRefs += refsInFile;
        }
    }

    const docSymbolAllowlistEntries = DOC_SYMBOL_ALLOWLIST.size;
    const hits = docSymbolAllowlistHits === undefined ? null : docSymbolAllowlistHits;
    // CATCH_SIGNAL and SINGLE_WALKER exemptions are measured, never asserted: re-running
    // the gates ensures a new unexempted catch or walker cannot hide behind a stale literal.
    const catchSignal =
        catchSignalExemptions === undefined ? countCatchSignalExemptions(tsFiles) : catchSignalExemptions;
    const singleWalker =
        singleWalkerExemptions === undefined ? countSingleWalkerExemptions(tsFiles) : singleWalkerExemptions;
    return {
        bindingCasts,
        consoleFiles,
        consoleRefs,
        catchSignal,
        singleWalker,
        docSymbolAllowlistEntries,
        docSymbolAllowlistHits: hits,
        applied: bindingCasts + consoleRefs + catchSignal + singleWalker + (hits === null ? 0 : hits),
        describe() {
            return (
                `${this.applied} applied (` +
                `${this.bindingCasts} UI5 binding casts, ` +
                `${this.consoleRefs} console refs in ${this.consoleFiles} scripts/ files, ` +
                `${this.catchSignal} justified CATCH_SIGNAL swallows, ` +
                `${this.singleWalker} justified SINGLE_WALKER exemptions, ` +
                `${this.docSymbolAllowlistHits === null ? "?" : this.docSymbolAllowlistHits} doc-symbol allowlist hits ` +
                `of ${this.docSymbolAllowlistEntries} entries)`
            );
        }
    };
}

// ============================================================================
// STRUCTURAL GATES
//
// MetaUI's recurring defect is not a wrong rule, it is a right rule applied in
// one place and missing in its twin: fifteen recursive walkers over the same
// (schema, data) tree, three producers of the same IPropertyMetadata record,
// and no machine that notices when one of them diverges.
//
// Extraction alone does not stop the next copy, twice over. MAX_SCHEMA_DEPTH was
// already extracted into MetaUIConstants and twelve private caps stayed anyway;
// DataSyncDelegate.invalidateStaleDataJson was extracted so the facade and the
// inner host could not diverge, and a third copy of its rule grew in
// SchemaResolutionDelegate, bypassing it. These gates are the machine that was
// missing both times.
//
// Each gate names the rule, the place that owns it, and what to do about a
// violation. None of them may be weakened to make the tree green. Each is proven
// to fire by scripts/prove-structural-gates.js.
// ============================================================================

/** Resolves a path relative to the MetaUI library source root. */
function srcPath(rel) {
    return path.join(SRC_DIR, ...rel.split("/"));
}

/** Parses one library source file into `{ rel, text, sf }`, or `null` if it is missing. */
function parseSrcFile(rel) {
    const full = srcPath(rel);
    if (!fs.existsSync(full)) {
        return null;
    }
    const text = fs.readFileSync(full, "utf8");
    return {
        rel: `src/${path.relative(SRC_ROOT_DIR, full).replace(/\\/g, "/")}`,
        full,
        text,
        sf: ts.createSourceFile(full, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
    };
}

/** Reports `file:line:col` for an AST node, using a repo-relative path. */
function nodeLoc(sf, node) {
    const pos = sf.getLineAndCharacterOfPosition(node.getStart(sf));
    const rel = path.relative(ROOT_DIR, sf.fileName).replace(/\\/g, "/");
    return `${rel}:${pos.line + 1}:${pos.character + 1}`;
}

/** Folds a string literal, template or `+` concatenation of literals into its value. */
function foldStringLiteral(node) {
    if (!node) return undefined;
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
        const l = foldStringLiteral(node.left);
        const r = foldStringLiteral(node.right);
        return l !== undefined && r !== undefined ? l + r : undefined;
    }
    if (ts.isParenthesizedExpression(node)) return foldStringLiteral(node.expression);
    return undefined;
}

/** Collects every class member / top-level function in `sf` whose name is in `memberNames`. */
function findNamedMembers(sf, memberNames) {
    const found = [];
    (function visit(node) {
        if (
            (ts.isMethodDeclaration(node) || ts.isFunctionDeclaration(node)) &&
            node.name &&
            memberNames.includes(node.name.getText(sf))
        ) {
            found.push(node);
        }
        ts.forEachChild(node, visit);
    })(sf);
    return found;
}

/** True when `node` is lexically inside a function/method named `memberName`. */
function isInsideMember(sf, node, memberName) {
    let cur = node.parent;
    while (cur) {
        if (
            (ts.isMethodDeclaration(cur) || ts.isFunctionDeclaration(cur)) &&
            cur.name &&
            cur.name.getText(sf) === memberName
        ) {
            return true;
        }
        cur = cur.parent;
    }
    return false;
}

// ---------------------------------------------------------------------------
// GATE A -- producer completeness.
//
// Every member of IPropertyMetadata and IUIDirective is optional, so a producer
// that omits one compiles cleanly and the consumer silently reads `undefined`.
// Each known producer must therefore either write a member or name it in its
// own commented DECLINED_SCHEMA_FIELDS set. Adding a field to ISchema.ts then
// fails the build until every producer has taken a position on it.
// ---------------------------------------------------------------------------

const SCHEMA_PRODUCERS = [
    {
        name: "SchemaNormalizer",
        declineFile: "core/SchemaNormalizer.ts",
        scopes: [
            { file: "core/SchemaNormalizer.ts", members: ["normalizePropertyMetadata", "normalizeSchemaList"] },
            { file: "core/SchemaDirectiveNormalizer.ts", members: ["normalizeUI"] }
        ]
    },
    {
        name: "OpenApiPropertyMapper + OpenApiConstraintMapper + OpenApiUIMapper",
        declineFile: "openapi/parsers/OpenApiPropertyMapper.ts",
        scopes: [
            {
                file: "openapi/parsers/OpenApiPropertyMapper.ts",
                members: [
                    "mapPropertyMetadata",
                    "resolveReference",
                    "applyPolymorphism",
                    "mapPolymorphicBranch",
                    "applyNestedTypes"
                ]
            },
            {
                file: "openapi/parsers/OpenApiConstraintMapper.ts",
                members: ["applyConstraints", "applyStateModifiers", "applyDiscriminator"]
            },
            { file: "openapi/OpenApiUIMapper.ts", members: ["build"] }
        ]
    },
    {
        name: "DataInferenceBuilder",
        declineFile: "core/DataInferenceBuilder.ts",
        scopes: [{ file: "core/DataInferenceBuilder.ts", members: ["inferPropertiesFromObject"] }]
    }
];

/** Minimum characters of justification a DECLINED_SCHEMA_FIELDS entry must carry. */
const MIN_DECLINE_REASON_CHARS = 40;

/** Reads the property-signature members of one interface in `ISchema.ts`. */
function readInterfaceMembers(sf, interfaceName) {
    const members = [];
    ts.forEachChild(sf, (node) => {
        if (ts.isInterfaceDeclaration(node) && node.name.text === interfaceName) {
            for (const m of node.members) {
                if (ts.isPropertySignature(m) && m.name) {
                    members.push({ name: m.name.getText(sf), optional: Boolean(m.questionToken) });
                }
            }
        }
    });
    return members;
}

/**
 * Collects the IPropertyMetadata and IUIDirective keys written inside one producer scope.
 *
 * Only typed writes count: an object literal whose declared type (variable annotation, return
 * type or `as` cast) names the interface, a write onto an identifier declared with that type,
 * a write into a `Record<string, IPropertyMetadata>`, or a `ui: { ... }` block. Reading a key
 * (`readString(prop, "title")`) is not a write, so a producer cannot be credited for merely
 * looking at a field.
 */
function collectSchemaWrites(sf, scopeNode) {
    const metaIdents = new Set();
    const uiIdents = new Set();
    const recordIdents = new Set();
    const metaWrites = new Set();
    const uiWrites = new Set();

    (function declPass(node) {
        if ((ts.isParameter(node) || ts.isVariableDeclaration(node)) && node.name && ts.isIdentifier(node.name) && node.type) {
            const txt = node.type.getText(sf);
            if (/^Record<\s*string\s*,\s*IPropertyMetadata\s*>/.test(txt)) {
                recordIdents.add(node.name.text);
            } else if (txt.includes("IPropertyMetadata")) {
                metaIdents.add(node.name.text);
            }
            if (txt.includes("IUIDirective")) {
                uiIdents.add(node.name.text);
            }
        }
        ts.forEachChild(node, declPass);
    })(scopeNode);

    function literalKeys(objLit) {
        const keys = [];
        for (const p of objLit.properties) {
            if (ts.isPropertyAssignment(p) && p.name) {
                keys.push({ key: p.name.getText(sf).replace(/^["']|["']$/g, ""), node: p });
            } else if (ts.isShorthandPropertyAssignment(p)) {
                keys.push({ key: p.name.text, node: p });
            }
        }
        return keys;
    }

    function recordUiLiteral(objLit) {
        for (const { key } of literalKeys(objLit)) {
            uiWrites.add(key);
        }
    }

    function recordMetaLiteral(objLit) {
        for (const { key, node } of literalKeys(objLit)) {
            metaWrites.add(key);
            if (key === "ui" && ts.isPropertyAssignment(node) && ts.isObjectLiteralExpression(node.initializer)) {
                recordUiLiteral(node.initializer);
            }
        }
    }

    function enclosingReturnType(node) {
        let cur = node.parent;
        while (cur) {
            if (
                ts.isMethodDeclaration(cur) ||
                ts.isFunctionDeclaration(cur) ||
                ts.isArrowFunction(cur) ||
                ts.isFunctionExpression(cur)
            ) {
                if (cur.type) return cur.type.getText(sf);
            }
            if (cur === scopeNode) break;
            cur = cur.parent;
        }
        return undefined;
    }

    function recordTypedLiteral(typeText, objLit) {
        if (typeText.includes("IUIDirective")) recordUiLiteral(objLit);
        else if (typeText.includes("IPropertyMetadata")) recordMetaLiteral(objLit);
    }

    (function visit(node) {
        if (ts.isVariableDeclaration(node) && node.type && node.initializer && ts.isObjectLiteralExpression(node.initializer)) {
            recordTypedLiteral(node.type.getText(sf), node.initializer);
        }
        if (ts.isReturnStatement(node) && node.expression && ts.isObjectLiteralExpression(node.expression)) {
            const rt = enclosingReturnType(node);
            if (rt) recordTypedLiteral(rt, node.expression);
        }
        if (ts.isAsExpression(node) && ts.isObjectLiteralExpression(node.expression)) {
            recordTypedLiteral(node.type.getText(sf), node.expression);
        }
        if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
            const lhs = node.left;
            if (
                ts.isElementAccessExpression(lhs) &&
                ts.isIdentifier(lhs.expression) &&
                recordIdents.has(lhs.expression.text) &&
                ts.isObjectLiteralExpression(node.right)
            ) {
                recordMetaLiteral(node.right);
            }
            if (ts.isPropertyAccessExpression(lhs)) {
                const member = lhs.name.text;
                const baseText = lhs.expression.getText(sf);
                const baseIsMeta = ts.isIdentifier(lhs.expression) && metaIdents.has(lhs.expression.text);
                const baseIsUi = ts.isIdentifier(lhs.expression) && uiIdents.has(lhs.expression.text);
                if (baseIsUi) {
                    uiWrites.add(member);
                } else if (baseIsMeta) {
                    metaWrites.add(member);
                    if (member === "ui" && ts.isObjectLiteralExpression(node.right)) recordUiLiteral(node.right);
                } else if (/(^|\.)ui$/.test(baseText)) {
                    uiWrites.add(member);
                }
            }
        }
        ts.forEachChild(node, visit);
    })(scopeNode);

    return { metaWrites, uiWrites };
}

/** Reads and validates a producer's `DECLINED_SCHEMA_FIELDS` object literal. */
function readDeclinedFields(parsed, producerName, violations) {
    const declined = new Map();
    let found = false;
    (function visit(node) {
        if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === "DECLINED_SCHEMA_FIELDS") {
            found = true;
            if (!node.initializer || !ts.isObjectLiteralExpression(node.initializer)) {
                violations.push(
                    `[PRODUCER_COMPLETENESS] ${parsed.rel}: DECLINED_SCHEMA_FIELDS must be an object literal of ` +
                        `'<field>: "<reason>"' entries so the gate can read the justifications.`
                );
                return;
            }
            for (const prop of node.initializer.properties) {
                if (!ts.isPropertyAssignment(prop) || !prop.name) continue;
                const key = prop.name.getText(parsed.sf).replace(/^["']|["']$/g, "");
                const reason = foldStringLiteral(prop.initializer);
                if (reason === undefined) {
                    violations.push(
                        `[PRODUCER_COMPLETENESS] ${nodeLoc(parsed.sf, prop)} DECLINED_SCHEMA_FIELDS['${key}'] in ` +
                            `${producerName} must be a plain string literal the gate can read, not a computed value.`
                    );
                    continue;
                }
                if (reason.trim().length < MIN_DECLINE_REASON_CHARS) {
                    violations.push(
                        `[PRODUCER_COMPLETENESS] ${nodeLoc(parsed.sf, prop)} DECLINED_SCHEMA_FIELDS['${key}'] in ` +
                            `${producerName} has a ${reason.trim().length}-character justification; at least ` +
                            `${MIN_DECLINE_REASON_CHARS} are required. Say why this producer cannot or must not write it.`
                    );
                }
                declined.set(key, reason);
            }
        }
        ts.forEachChild(node, visit);
    })(parsed.sf);

    if (!found) {
        violations.push(
            `[PRODUCER_COMPLETENESS] ${parsed.rel} is a known IPropertyMetadata producer but declares no ` +
                `'export const DECLINED_SCHEMA_FIELDS'. Add one (it may be empty) so every ISchema member it ` +
                `does not write is an explicit, commented decision.`
        );
    }
    return declined;
}

function runProducerCompletenessGate(violations) {
    const schemaFile = parseSrcFile("interfaces/ISchema.ts");
    if (!schemaFile) {
        violations.push(
            `[PRODUCER_COMPLETENESS] src/.../interfaces/ISchema.ts is missing, so producer completeness cannot be ` +
                `checked. Restore the file or update SCHEMA_PRODUCERS in scripts/run-tests.js.`
        );
        return;
    }

    const metaMembers = readInterfaceMembers(schemaFile.sf, "IPropertyMetadata");
    const uiMembers = readInterfaceMembers(schemaFile.sf, "IUIDirective");
    if (metaMembers.length === 0 || uiMembers.length === 0) {
        violations.push(
            `[PRODUCER_COMPLETENESS] Could not read members of IPropertyMetadata (${metaMembers.length}) or ` +
                `IUIDirective (${uiMembers.length}) from interfaces/ISchema.ts. The gate would pass vacuously; fix the parser.`
        );
        return;
    }

    for (const producer of SCHEMA_PRODUCERS) {
        const metaWrites = new Set();
        const uiWrites = new Set();
        let scopesOk = true;

        for (const scope of producer.scopes) {
            const parsed = parseSrcFile(scope.file);
            if (!parsed) {
                violations.push(
                    `[PRODUCER_COMPLETENESS] ${producer.name}: source file src/.../${scope.file} is missing. ` +
                        `Either restore it or update SCHEMA_PRODUCERS in scripts/run-tests.js -- a missing producer ` +
                        `must never silently skip the check.`
                );
                scopesOk = false;
                continue;
            }
            const nodes = findNamedMembers(parsed.sf, scope.members);
            for (const expected of scope.members) {
                if (!nodes.some((n) => n.name.getText(parsed.sf) === expected)) {
                    violations.push(
                        `[PRODUCER_COMPLETENESS] ${parsed.rel}: member '${expected}' named in SCHEMA_PRODUCERS no longer ` +
                            `exists. Rename it in scripts/run-tests.js, or the gate stops seeing that producer's writes.`
                    );
                    scopesOk = false;
                }
            }
            for (const node of nodes) {
                const writes = collectSchemaWrites(parsed.sf, node);
                writes.metaWrites.forEach((k) => metaWrites.add(k));
                writes.uiWrites.forEach((k) => uiWrites.add(k));
            }
        }
        if (!scopesOk) continue;

        const declineParsed = parseSrcFile(producer.declineFile);
        if (!declineParsed) {
            violations.push(
                `[PRODUCER_COMPLETENESS] ${producer.name}: declared DECLINED set file src/.../${producer.declineFile} is missing.`
            );
            continue;
        }
        const declined = readDeclinedFields(declineParsed, producer.name, violations);

        const checkGroup = (members, written, prefix, ifaceName) => {
            for (const member of members) {
                const declineKey = `${prefix}${member.name}`;
                if (written.has(member.name) || declined.has(declineKey)) continue;
                violations.push(
                    `[PRODUCER_COMPLETENESS] ${declineParsed.rel}: producer '${producer.name}' neither writes ` +
                        `${ifaceName}.${member.name} nor declines it. Either write the field in the producer, or add ` +
                        `'${declineKey}' to DECLINED_SCHEMA_FIELDS with a reason saying why this producer must not. ` +
                        `A consumer that reads it will see undefined and degrade silently.`
                );
            }
        };
        checkGroup(metaMembers, metaWrites, "", "IPropertyMetadata");
        checkGroup(uiMembers, uiWrites, "ui.", "IUIDirective");

        const knownKeys = new Set([
            ...metaMembers.map((m) => m.name),
            ...uiMembers.map((m) => `ui.${m.name}`)
        ]);
        for (const key of declined.keys()) {
            if (!knownKeys.has(key)) {
                violations.push(
                    `[PRODUCER_COMPLETENESS] ${declineParsed.rel}: DECLINED_SCHEMA_FIELDS['${key}'] names no member of ` +
                        `IPropertyMetadata or IUIDirective. Remove the stale entry, or correct the name ` +
                        `('ui.' prefixes an IUIDirective member).`
                );
            }
            if (knownKeys.has(key) && (key.startsWith("ui.") ? uiWrites : metaWrites).has(key.replace(/^ui\./, ""))) {
                violations.push(
                    `[PRODUCER_COMPLETENESS] ${declineParsed.rel}: DECLINED_SCHEMA_FIELDS['${key}'] says this producer ` +
                        `does not write that field, but it does. Remove the decline so the record stops lying about the code.`
                );
            }
        }
    }

    // The 21 'ui.*' declines in OpenApiPropertyMapper rest entirely on OpenApiUIMapper.build
    // copying the raw ui block verbatim. If that copy is removed the justifications become
    // false and 21 directives start vanishing from OpenAPI sources, so gate the premise itself.
    const uiMapper = parseSrcFile("openapi/OpenApiUIMapper.ts");
    if (!uiMapper) {
        violations.push(`[PRODUCER_COMPLETENESS] src/.../openapi/OpenApiUIMapper.ts is missing.`);
    } else if (!/Object\.assign\(\s*ui\s*,/.test(uiMapper.text)) {
        violations.push(
            `[PRODUCER_COMPLETENESS] ${uiMapper.rel}: the verbatim 'Object.assign(ui, ...)' pass-through of the raw ` +
                `ui block is gone. 21 'ui.*' entries in OpenApiPropertyMapper's DECLINED_SCHEMA_FIELDS are justified by ` +
                `it. Restore the pass-through, or map each of those directives explicitly and delete its decline.`
        );
    }
}

// ---------------------------------------------------------------------------
// GATE B -- one depth constant.
//
// Fifteen caps existed for one concept (8, 8, 8, 8, 8, 10, 10, 10, 10, 10, 16,
// 16, 30, 30, 200). MAX_SCHEMA_DEPTH already existed and exactly one walker used
// it. It is now the only cap for the (schema, data) tree; MAX_LAYOUT_DEPTH and MAX_CLONE_DEPTH are deliberately
// distinct and documented as such. All three live in MetaUIConstants.ts.
// ---------------------------------------------------------------------------

const DEPTH_CONSTANTS_FILE = "constants/MetaUIConstants.ts";
const REQUIRED_DEPTH_CONSTANTS = ["MAX_SCHEMA_DEPTH", "MAX_LAYOUT_DEPTH", "MAX_CLONE_DEPTH"];

/**
 * True when a `MAX_*_DEPTH` declaration merely aliases the shared constant
 * (`MetaUIConstantsMod.MAX_SCHEMA_DEPTH`, `constants.MAX_LAYOUT_DEPTH`, ...) rather than
 * restating a value of its own. Reading the cap is the behaviour this gate wants; only a
 * fresh number is a violation.
 */
function isSharedCapAlias(node) {
    const init = node && node.initializer;
    if (!init) return false;
    if (ts.isPropertyAccessExpression(init)) {
        return REQUIRED_DEPTH_CONSTANTS.includes(init.name.text);
    }
    if (ts.isElementAccessExpression(init) && init.argumentExpression) {
        return REQUIRED_DEPTH_CONSTANTS.includes(foldStringLiteral(init.argumentExpression) || "");
    }
    return ts.isIdentifier(init) && REQUIRED_DEPTH_CONSTANTS.includes(init.text);
}

function runDepthConstantGate(violations, tsFiles) {
    const constantsParsed = parseSrcFile(DEPTH_CONSTANTS_FILE);
    if (!constantsParsed) {
        violations.push(`[DEPTH_CONSTANT] src/.../${DEPTH_CONSTANTS_FILE} is missing; the shared depth caps have no home.`);
        return;
    }
    for (const name of REQUIRED_DEPTH_CONSTANTS) {
        if (!new RegExp(`export const ${name}\\s*=`).test(constantsParsed.text)) {
            violations.push(
                `[DEPTH_CONSTANT] ${constantsParsed.rel} no longer exports '${name}'. Every schema walker imports it; ` +
                    `restore it rather than reintroducing a local cap.`
            );
        }
    }

    const readCap = (name) => {
        const m = new RegExp(`export const ${name}\\s*=\\s*(\\d+)`).exec(constantsParsed.text);
        return m ? Number(m[1]) : undefined;
    };
    const schemaCap = readCap("MAX_SCHEMA_DEPTH");
    const layoutCap = readCap("MAX_LAYOUT_DEPTH");
    if (schemaCap !== undefined && layoutCap !== undefined && schemaCap < layoutCap) {
        violations.push(
            `[DEPTH_CONSTANT] ${constantsParsed.rel}: MAX_SCHEMA_DEPTH (${schemaCap}) is below MAX_LAYOUT_DEPTH ` +
                `(${layoutCap}). A schema walker capped below the layout tree that renders it truncates fields the ` +
                `layout could still have drawn: at 16 the 18-level diamond-\\$ref case stops doubling its score and ` +
                `flips from dialog to inline. Raise it back to at least MAX_LAYOUT_DEPTH.`
        );
    }

    const constantsFull = path.normalize(constantsParsed.full);
    for (const file of tsFiles) {
        const text = fs.readFileSync(file, "utf8");
        const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
        const isConstantsFile = path.normalize(file) === constantsFull;

        (function visit(node) {
            // 1. A MAX_*_DEPTH constant declared anywhere but MetaUIConstants.ts.
            const declName =
                (ts.isVariableDeclaration(node) || ts.isPropertyDeclaration(node) || ts.isEnumMember(node)) && node.name
                    ? node.name.getText(sf)
                    : undefined;
            if (declName && /^MAX_[A-Z0-9_]*DEPTH$/.test(declName) && !isConstantsFile && !isSharedCapAlias(node)) {
                violations.push(
                    `[DEPTH_CONSTANT] ${nodeLoc(sf, node)} declares a private depth cap '${declName}'. ` +
                        `Depth caps live only in ${DEPTH_CONSTANTS_FILE} (MAX_SCHEMA_DEPTH for the schema/data tree, ` +
                        `MAX_LAYOUT_DEPTH for uiLayout, MAX_CLONE_DEPTH for deepClone). Import one of those instead.`
                );
            }
            // 2. A numeric literal compared against a depth counter.
            if (
                ts.isBinaryExpression(node) &&
                [
                    ts.SyntaxKind.GreaterThanToken,
                    ts.SyntaxKind.GreaterThanEqualsToken,
                    ts.SyntaxKind.LessThanToken,
                    ts.SyntaxKind.LessThanEqualsToken
                ].includes(node.operatorToken.kind)
            ) {
                // Zero is never a recursion cap: `depth > 0` asks "have we descended at all",
                // which is how ExpressionBuilder balances brackets. Any other literal is a cap.
                // Catching a *fresh* one is the point: the failure mode this codebase keeps
                // producing is a thirteenth copy, not a mistyped value in the constants file.
                const isCapLiteral = (n) => ts.isNumericLiteral(n) && n.text !== "0";
                const leftText = node.left.getText(sf);
                const rightText = node.right.getText(sf);
                const depthOnLeft = /\bdepth\b/i.test(leftText) && isCapLiteral(node.right);
                const depthOnRight = /\bdepth\b/i.test(rightText) && isCapLiteral(node.left);
                if (depthOnLeft || depthOnRight) {
                    violations.push(
                        `[DEPTH_CONSTANT] ${nodeLoc(sf, node)} compares a depth counter against the literal ` +
                            `'${depthOnLeft ? rightText : leftText}' in '${node.getText(sf).replace(/\s+/g, " ")}'. ` +
                            `Import MAX_SCHEMA_DEPTH (or MAX_LAYOUT_DEPTH / MAX_CLONE_DEPTH) from ${DEPTH_CONSTANTS_FILE}; ` +
                            `a private number here is how the fifteen divergent caps happened.`
                    );
                }
            }
            ts.forEachChild(node, visit);
        })(sf);
    }

    // A test may read the cap, never restate it. The two recursion-limit tests in
    // CoreArchitecture.qunit.js assert where truncation starts, so a literal there goes stale
    // the moment the cap moves -- which is how they came to assert a limit nobody used.
    //
    // Only the declaration rule reaches outside src/. A bare `depth > 16` in an unrelated
    // DOM-tree helper in a test is not a schema cap, and flagging it would be noise. A raw
    // number passed to a nesting helper (`nestedSpec(30)`) is not mechanically distinguishable
    // from any other number and is NOT caught here; the two tests reading MAX_SCHEMA_DEPTH is
    // the mitigation for that, not this gate.
    const outsideSrc = [
        ...collectSourceFiles(SCRIPTS_DIR, [".ts", ".js"]),
        ...collectSourceFiles(TEST_DIR, [".ts", ".js"])
    ];
    for (const file of outsideSrc) {
        const text = fs.readFileSync(file, "utf8");
        const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
        (function visit(node) {
            if (ts.isVariableDeclaration(node) && node.name && /^MAX_[A-Z0-9_]*DEPTH$/.test(node.name.getText(sf))) {
                if (!isSharedCapAlias(node)) {
                    violations.push(
                        `[DEPTH_CONSTANT] ${nodeLoc(sf, node)} declares its own value for ` +
                            `'${node.name.getText(sf)}' outside ${DEPTH_CONSTANTS_FILE}. Read the shared constant ` +
                            `instead (e.g. 'MetaUIConstantsMod.MAX_SCHEMA_DEPTH'); a test that restates the cap ` +
                            `silently stops testing the real one the moment it moves.`
                    );
                }
            }
            ts.forEachChild(node, visit);
        })(sf);
    }
}

// ---------------------------------------------------------------------------
// GATE C -- no second $ref resolver.
//
// OpenApiRefResolver owns pointer parsing: it strips the three legal prefixes
// and unescapes RFC 6901 tokens. A hand-rolled `$ref.split("/").pop()` gets
// '#/definitions/Order~1Item' wrong and resolves a foreign document's pointer
// against the local definitions dictionary.
// ---------------------------------------------------------------------------

const REF_RESOLVER_FILE = "openapi/OpenApiRefResolver.ts";

function runRefResolverGate(violations, tsFiles) {
    const resolverParsed = parseSrcFile(REF_RESOLVER_FILE);
    if (!resolverParsed) {
        violations.push(`[REF_RESOLVER] src/.../${REF_RESOLVER_FILE} is missing; there is no canonical $ref resolver left.`);
        return;
    }
    if (!/extractRefName/.test(resolverParsed.text)) {
        violations.push(`[REF_RESOLVER] ${resolverParsed.rel} no longer exposes extractRefName(); every caller depends on it.`);
    }
    const resolverFull = path.normalize(resolverParsed.full);

    for (const file of tsFiles) {
        if (path.normalize(file) === resolverFull) continue;
        const text = fs.readFileSync(file, "utf8");
        const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

        (function visit(node) {
            if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
                const method = node.expression.name.text;
                const receiver = node.expression.expression.getText(sf);
                const splitsPointer =
                    method === "split" &&
                    node.arguments.length === 1 &&
                    foldStringLiteral(node.arguments[0]) === "/" &&
                    /ref/i.test(receiver);
                const stripsPrefix =
                    (method === "substring" || method === "slice" || method === "replace") &&
                    node.arguments.some((a) => /OPENAPI_PREFIX/.test(a.getText(sf)));
                if (splitsPointer || stripsPrefix) {
                    violations.push(
                        `[REF_RESOLVER] ${nodeLoc(sf, node)} hand-rolls $ref parsing in ` +
                            `'${node.getText(sf).replace(/\s+/g, " ").slice(0, 90)}'. Call ` +
                            `OpenApiRefResolver.extractRefName() (or .resolve()) instead: it strips all three legal ` +
                            `prefixes and unescapes RFC 6901 '~1'/'~0' tokens, which split("/").pop() does not.`
                    );
                }
            }
            ts.forEachChild(node, visit);
        })(sf);
    }
}

// ---------------------------------------------------------------------------
// GATE D -- one layout-strategy resolution.
//
// `schema.layoutStrategy || (schema.type === "array" ? "table" : "form")` was
// inlined three times, so PluginRegistry could preload one strategy's module
// while Engine rendered another.
// ---------------------------------------------------------------------------

const LAYOUT_STRATEGY_OWNER_FILE = "core/DefaultLayoutGenerator.ts";
const LAYOUT_STRATEGY_OWNER_MEMBER = "resolveLayoutStrategy";

function runLayoutStrategyGate(violations, tsFiles) {
    const ownerParsed = parseSrcFile(LAYOUT_STRATEGY_OWNER_FILE);
    if (!ownerParsed || findNamedMembers(ownerParsed.sf, [LAYOUT_STRATEGY_OWNER_MEMBER]).length === 0) {
        violations.push(
            `[LAYOUT_STRATEGY_DEFAULT] DefaultLayoutGenerator.${LAYOUT_STRATEGY_OWNER_MEMBER}() is missing from ` +
                `src/.../${LAYOUT_STRATEGY_OWNER_FILE}. It is the single owner of the array->table / object->form default; ` +
                `without it every caller re-decides and they drift apart.`
        );
        return;
    }
    const ownerFull = path.normalize(ownerParsed.full);

    for (const file of tsFiles) {
        const text = fs.readFileSync(file, "utf8");
        const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
        const isOwner = path.normalize(file) === ownerFull;

        (function visit(node) {
            if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.BarBarToken) {
                const leftText = node.left.getText(sf).replace(/\s+/g, "");
                if (/\.layoutStrategy$/.test(leftText)) {
                    if (isOwner && isInsideMember(sf, node, LAYOUT_STRATEGY_OWNER_MEMBER)) {
                        return;
                    }
                    violations.push(
                        `[LAYOUT_STRATEGY_DEFAULT] ${nodeLoc(sf, node)} re-derives the layout-strategy default in ` +
                            `'${node.getText(sf).replace(/\s+/g, " ").slice(0, 100)}'. Call ` +
                            `DefaultLayoutGenerator.${LAYOUT_STRATEGY_OWNER_MEMBER}(schema) instead, so the renderer and ` +
                            `the lazy-loader can never pick different strategies for one schema.`
                    );
                }
            }
            ts.forEachChild(node, visit);
        })(sf);
    }
}

// ---------------------------------------------------------------------------
// GATE E -- constants, not string literals.
//
// Scope was measured, not assumed. Of the four candidate fields:
//
//   ui.renderMode   RenderModeType  literal union -> tsc already errors (TS2367)
//   .type           FieldType / "object"|"array" / ILayoutElement["type"]
//                                   literal union -> tsc already errors (TS2367)
//   layoutStrategy  string          NO compiler check
//   ui.widget       string          NO compiler check
//
// Verified by renaming RENDER_MODE.DIALOG to "modal" and restoring the literal
// comparison in LayoutElementWalker: tsc reported TS2367, so the premise that a
// rename "breaks silently with no compiler error" does not hold for the two
// union-typed fields. `layoutStrategy` and `ui.widget` are deliberately bare
// `string` (third-party plugins register their own layouts and widgets via
// PluginRegistry, so they cannot be closed unions) -- those two have no compiler
// check at all, and that is where this gate earns its keep.
//
// `.type` is excluded on purpose: it is compiler-checked, and ~48 of the hits
// when it was included were ILayoutElement.type values ("Group", "WizardStep")
// that are not in MetaUIConstants at all, so the gate would have been telling
// the truth about nothing and pointing at the wrong constant.
//
// renderMode stays in despite the compiler overlap: it costs one AST test, and
// its one divergent site (LayoutElementWalker) is the reason this gate exists.
// ---------------------------------------------------------------------------

const GUARDED_SCHEMA_FIELDS = {
    renderMode: "RENDER_MODE",
    layoutStrategy: "LAYOUT_STRATEGY",
    widget: "WIDGET_TYPE"
};

function runSchemaConstantGate(violations, tsFiles) {
    const constantsParsed = parseSrcFile(DEPTH_CONSTANTS_FILE);
    if (!constantsParsed) {
        violations.push(`[SCHEMA_CONSTANT] src/.../${DEPTH_CONSTANTS_FILE} is missing; there are no canonical constants left.`);
        return;
    }
    const constantsFull = path.normalize(constantsParsed.full);

    const comparisonKinds = [
        ts.SyntaxKind.EqualsEqualsEqualsToken,
        ts.SyntaxKind.ExclamationEqualsEqualsToken,
        ts.SyntaxKind.EqualsEqualsToken,
        ts.SyntaxKind.ExclamationEqualsToken
    ];

    /** Returns the guarded field a member-access expression ends in, else undefined. */
    function guardedFieldOf(expr) {
        const node = ts.isNonNullExpression(expr) || ts.isParenthesizedExpression(expr) ? expr.expression : expr;
        // A local that carries the field keeps its meaning:
        //   const renderMode = decision?.renderMode ?? meta.ui?.renderMode;
        //   ... renderMode !== "dialog"
        // is the same defect as comparing `meta.ui.renderMode` directly, and a refactor that
        // hoists the value must not make the gate stop looking.
        const field = ts.isPropertyAccessExpression(node)
            ? node.name.text
            : ts.isIdentifier(node)
              ? node.text
              : undefined;
        if (!field || !Object.prototype.hasOwnProperty.call(GUARDED_SCHEMA_FIELDS, field)) return undefined;
        return field;
    }

    for (const file of tsFiles) {
        if (path.normalize(file) === constantsFull) continue;
        const text = fs.readFileSync(file, "utf8");
        const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

        (function visit(node) {
            if (ts.isBinaryExpression(node) && comparisonKinds.includes(node.operatorToken.kind)) {
                const pairs = [
                    [node.left, node.right],
                    [node.right, node.left]
                ];
                for (const [subject, literal] of pairs) {
                    const field = guardedFieldOf(subject);
                    const value = ts.isStringLiteral(literal) ? literal.text : undefined;
                    if (field && value !== undefined) {
                        violations.push(
                            `[SCHEMA_CONSTANT] ${nodeLoc(sf, node)} compares '${subject.getText(sf)}' against the string ` +
                                `literal "${value}". Use ${GUARDED_SCHEMA_FIELDS[field]} from ${DEPTH_CONSTANTS_FILE}: ` +
                                `renaming the constant must break the build here, not silently stop matching.`
                        );
                        break;
                    }
                }
            }
            if (ts.isSwitchStatement(node)) {
                const field = guardedFieldOf(node.expression);
                if (field) {
                    for (const clause of node.caseBlock.clauses) {
                        if (ts.isCaseClause(clause) && ts.isStringLiteral(clause.expression)) {
                            violations.push(
                                `[SCHEMA_CONSTANT] ${nodeLoc(sf, clause)} switches '${node.expression.getText(sf)}' on the ` +
                                    `string literal "${clause.expression.text}". Use ` +
                                    `${GUARDED_SCHEMA_FIELDS[field]} from ${DEPTH_CONSTANTS_FILE}.`
                            );
                        }
                    }
                }
            }
            ts.forEachChild(node, visit);
        })(sf);
    }
}

// ---------------------------------------------------------------------------
// GATE F -- the single data/dataJson writer.
//
// `data` and `dataJson` are two views of one payload: writing one without
// deciding about the other leaves a stale serialization bound to the consumer's
// view model. DataSyncDelegate.commitDataPair is the only place that decides.
// ---------------------------------------------------------------------------

const DATA_WRITER_FILE = "controls/host/delegates/DataSyncDelegate.ts";
const DATA_WRITER_MEMBERS = ["commitDataPair", "invalidateStaleDataJson"];
const DATA_PAIR_PROPERTIES = ["data", "dataJson"];

function runDataWriterGate(violations, tsFiles) {
    const ownerParsed = parseSrcFile(DATA_WRITER_FILE);
    for (const member of DATA_WRITER_MEMBERS) {
        if (!ownerParsed || findNamedMembers(ownerParsed.sf, [member]).length === 0) {
        violations.push(
                `[DATA_WRITER] DataSyncDelegate.${member}() is missing from src/.../${DATA_WRITER_FILE}. ` +
                    `It owns part of the committed (data, dataJson) rule; without it each caller re-invents ` +
                    `"does dataJson need serializing, or retiring?" and they diverge.`
            );
        }
    }
    if (!ownerParsed) return;
    const ownerFull = path.normalize(ownerParsed.full);

    for (const file of tsFiles) {
        if (path.normalize(file) === ownerFull) continue;
        const text = fs.readFileSync(file, "utf8");
        const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

        (function visit(node) {
            if (
                ts.isCallExpression(node) &&
                ts.isPropertyAccessExpression(node.expression) &&
                node.expression.name.text === "setBaseProperty"
            ) {
                const first = foldStringLiteral(node.arguments[0]);
                if (first && DATA_PAIR_PROPERTIES.includes(first)) {
                    violations.push(
                        `[DATA_WRITER] ${nodeLoc(sf, node)} writes the committed '${first}' property directly via ` +
                            `setBaseProperty("${first}", ...). Call ` +
                            `DataSyncDelegate.commitDataPair(host, payload, serializedJson) instead: it is the one ` +
                            `place that decides whether 'dataJson' must be re-serialized or retired alongside 'data'.`
                    );
                }
            }
            ts.forEachChild(node, visit);
        })(sf);
    }
}

// ---------------------------------------------------------------------------
// GATE G -- a caught failure must produce an observable signal.
//
// NO_EMPTY_CATCH only rejects a syntactically empty block, so
// `catch (_e) { committed = {}; }` passed it while wiping the user's form.
// A catch must log, rethrow, fire/show something, or carry a CATCH_EXEMPT
// comment saying why swallowing is the correct answer. Exemptions are counted
// and printed, never blanket-suppressed.
// ---------------------------------------------------------------------------

const CATCH_EXEMPT_MARKER = "CATCH_EXEMPT:";
const MIN_CATCH_EXEMPT_REASON_CHARS = 60;

function runCatchSignalGate(violations, tsFiles) {
    let exemptCount = 0;

    for (const file of tsFiles) {
        const text = fs.readFileSync(file, "utf8");
        const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

        (function visit(node) {
            if (ts.isCatchClause(node)) {
                const body = node.block.getText(sf);
                // Strip comments first: an exemption that explains "a throw from new URL() is the
                // answer" must not be mistaken for the block actually rethrowing.
                const code = body.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
                const signals =
                    /\bLogger\s*\./.test(code) ||
                    /\bthrow\b/.test(code) ||
                    /\bfire[A-Z_]\w*\s*\(/.test(code) ||
                    /\bfireEvent\s*\(/.test(code) ||
                    /\bMessageToast\s*\./.test(code) ||
                    /\bMessageBox\s*\./.test(code) ||
                    /\bshowErrorPopup\s*\(/.test(code) ||
                    // A `this.report*()` / `this.warn*()` helper is contracted to surface the failure.
                    // Every current implementation does: BaseHardwareControl.reportCapabilityFailure and
                    // ODataDelegate.reportWriteFailure log and then paint or fire an error event, and
                    // PluginRegistry.warnOnce calls Logger.warn behind a de-duplication key.
                    /\bthis\.(report|warn)[A-Z]?\w*\s*\(/.test(code);
                const exemptMatch = new RegExp(`//\\s*${CATCH_EXEMPT_MARKER}([\\s\\S]*?)(?:\\r?\\n\\s*[^/\\s]|$)`).exec(body);
                if (signals) {
                    if (exemptMatch) {
                        violations.push(
                            `[CATCH_SIGNAL] ${nodeLoc(sf, node)} carries a ${CATCH_EXEMPT_MARKER} comment but already ` +
                                `reports the failure. Delete the exemption so the tally only counts catches that really swallow.`
                        );
                    }
                    ts.forEachChild(node, visit);
                    return;
                }
                if (exemptMatch) {
                    const reason = exemptMatch[1].replace(/^\s*\/\/\s*/gm, " ").replace(/\s+/g, " ").trim();
                    if (reason.length < MIN_CATCH_EXEMPT_REASON_CHARS) {
                        violations.push(
                            `[CATCH_SIGNAL] ${nodeLoc(sf, node)} has a ${reason.length}-character ${CATCH_EXEMPT_MARKER} ` +
                                `justification; at least ${MIN_CATCH_EXEMPT_REASON_CHARS} are required. State what the ` +
                                `caught throw means and what the caller observes instead.`
                        );
                    } else {
                        exemptCount++;
                    }
                } else {
                    violations.push(
                        `[CATCH_SIGNAL] ${nodeLoc(sf, node)} swallows a failure silently: ` +
                            `'${body.replace(/\s+/g, " ").slice(0, 70)}'. A caught failure must produce an observable ` +
                            `signal -- a Logger call, a rethrow, or a fired/shown message. If swallowing is genuinely ` +
                            `correct (the throw IS the answer, as with new URL()), add a ` +
                            `'// ${CATCH_EXEMPT_MARKER} <reason>' comment inside the block saying what the caller observes instead.`
                    );
                }
            }
            ts.forEachChild(node, visit);
        })(sf);
    }
    return exemptCount;
}

// ---------------------------------------------------------------------------
// GATE H -- a depth guard must say what it truncated.
//
// Pairs with GATE B. Unifying the cap is only half the job: most walkers hit
// their cap and returned {}, undefined or `{ isValid: true }` without a word, so a truncated schema and a complete one look identical from
// outside. The worst were PayloadValidator (reports valid without validating)
// and deepClone (replaces the consumer's payload with {}).
// ---------------------------------------------------------------------------

const DEPTH_TRUNCATION_EXEMPT_MARKER = "DEPTH_TRUNCATION_EXEMPT:";

function runDepthSignalGate(violations, tsFiles) {
    const capPattern = new RegExp(`\\b(${REQUIRED_DEPTH_CONSTANTS.join("|")})\\b`);

    for (const file of tsFiles) {
        const text = fs.readFileSync(file, "utf8");
        const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

        (function visit(node) {
            if (ts.isIfStatement(node) && capPattern.test(node.expression.getText(sf))) {
                const branch = node.thenStatement.getText(sf);
                const logs = /\bLogger\s*\./.test(branch.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " "));
                const exempt = branch.includes(DEPTH_TRUNCATION_EXEMPT_MARKER);
                if (!logs && !exempt) {
                    violations.push(
                        `[DEPTH_SIGNAL] ${nodeLoc(sf, node)} truncates at a depth cap without saying so: ` +
                            `'if (${node.expression.getText(sf).replace(/\s+/g, " ")})'. Log a Logger.warn naming the ` +
                            `limit and what was discarded (OpenApiPropertyMapper.mapPropertyMetadata is the model), ` +
                            `or add '// ${DEPTH_TRUNCATION_EXEMPT_MARKER} <reason>' if nothing is actually lost. ` +
                            `A truncated tree must not look identical to a complete one.`
                    );
                }
            }
            ts.forEachChild(node, visit);
        })(sf);
    }
}

// ---------------------------------------------------------------------------
// GATE I -- a render that degrades must raise the partial-render flag.
//
// `engine.hasPartialRenderingErrors` is what GeneratorHost feeds to
// wrapWithStatusBanners, i.e. the banner the user actually sees. Engine set it
// at its three catch sites; five layout-level catches logged and popped a
// dialog but left the flag false, so a field could vanish while the rendered
// form reported itself complete.
//
// Scope is by directory and is deliberately narrow and arguable: every catch in
// layouts/ today is a render-degradation catch, and the exemption comment is
// the escape for one that is not. A broader "render path" definition could not
// be expressed precisely, so it was not attempted.
// ---------------------------------------------------------------------------

const RENDER_DEGRADATION_DIRS = ["layouts/"];
const RENDER_DEGRADATION_FLAG = "hasPartialRenderingErrors";
const RENDER_DEGRADATION_EXEMPT_MARKER = "RENDER_DEGRADATION_EXEMPT:";

function runRenderDegradationGate(violations, tsFiles) {
    for (const file of tsFiles) {
        const rel = path.relative(SRC_DIR, file).replace(/\\/g, "/");
        if (!RENDER_DEGRADATION_DIRS.some((dir) => rel.startsWith(dir))) continue;
        const text = fs.readFileSync(file, "utf8");
        const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

        (function visit(node) {
            if (ts.isCatchClause(node)) {
                const body = node.block.getText(sf);
                const raises = new RegExp(`${RENDER_DEGRADATION_FLAG}\\s*=\\s*true`).test(body);
                const exempt = body.includes(RENDER_DEGRADATION_EXEMPT_MARKER);
                if (!raises && !exempt) {
                    violations.push(
                        `[RENDER_DEGRADATION] ${nodeLoc(sf, node)} catches a failure inside a layout without setting ` +
                            `engine.${RENDER_DEGRADATION_FLAG} = true, so GeneratorHost renders no partial-render banner ` +
                            `and the form reports itself complete while a field is missing. Set the flag, or add ` +
                            `'// ${RENDER_DEGRADATION_EXEMPT_MARKER} <reason>' if nothing visible was dropped.`
                    );
                }
            }
            ts.forEachChild(node, visit);
        })(sf);
    }
}

// ---------------------------------------------------------------------------
// GATE J -- the single schema walker.
//
// Thirteen independent recursive walkers over the (schema, data) tree diverged on
// depth caps, cycle handling, $ref resolution, and hidden-node skipping.
// SchemaWalker.ts is now the single owner of pure schema traversal, scope-to-binding
// path translation, and JSON-Pointer scope resolution. Any function outside
// SchemaWalker.ts that recurses with a depth parameter must either be migrated to
// SchemaWalker.walk() or carry a '// WALKER_EXEMPT: <reason>' justification (>= 60
// chars) explaining why SchemaWalker cannot own it (e.g. co-inductive (schema, data)
// mutation, bottom-up IPropertyMetadata production audited by [PRODUCER_COMPLETENESS],
// or walking a non-schema tree such as uiLayout or deepClone).
// ---------------------------------------------------------------------------

const SCHEMA_WALKER_OWNER_FILE = "core/SchemaWalker.ts";
const SCHEMA_WALKER_OWNER_MEMBERS = ["walk", "walkPaired", "toBindingPath", "resolveScope"];
const WALKER_EXEMPT_MARKER = "WALKER_EXEMPT:";
const MIN_WALKER_EXEMPT_REASON_CHARS = 60;
const SCHEMA_TREE_PROPS = new Set([
    "properties",
    "items",
    "oneOf",
    "anyOf",
    "allOf",
    "additionalProperties",
    "$ref",
    "not",
    "definitions",
    "$defs",
    "elements"
]);
const SYNC_ARRAY_CALLBACK_METHODS = new Set([
    "forEach",
    "map",
    "filter",
    "some",
    "every",
    "flatMap",
    "reduce",
    "reduceRight",
    "find",
    "findIndex"
]);

function isSyncArrayCallback(fnNode) {
    const parent = fnNode.parent;
    if (!parent || !ts.isCallExpression(parent)) return false;
    if (!parent.arguments.includes(fnNode)) return false;
    return (
        ts.isPropertyAccessExpression(parent.expression) &&
        SYNC_ARRAY_CALLBACK_METHODS.has(parent.expression.name.text)
    );
}

function collectWalkerCallables(sf) {
    const callables = [];
    (function visit(node, enclosingClassName, enclosingScopeId) {
        let nextClass = enclosingClassName;
        if (ts.isClassDeclaration(node) && node.name) {
            nextClass = node.name.text;
        }
        if ((ts.isMethodDeclaration(node) || ts.isFunctionDeclaration(node)) && node.name && node.body) {
            const name = node.name.getText(sf);
            const kind = ts.isMethodDeclaration(node) ? "method" : "function";
            const scopeKey = kind === "method" ? `class:${nextClass || "anon"}` : `scope:${enclosingScopeId}`;
            callables.push({
                node,
                declNode: node,
                name,
                kind,
                className: nextClass,
                scopeKey,
                parameters: node.parameters,
                body: node.body
            });
            ts.forEachChild(node.body, (c) => visit(c, nextClass, `${enclosingScopeId}/${name}:${node.pos}`));
            return;
        }
        if (
            ts.isVariableDeclaration(node) &&
            ts.isIdentifier(node.name) &&
            node.initializer &&
            (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))
        ) {
            const fnExpr = node.initializer;
            const name = node.name.text;
            let stmtNode = node;
            while (stmtNode.parent && !ts.isVariableStatement(stmtNode.parent) && !ts.isSourceFile(stmtNode.parent)) {
                stmtNode = stmtNode.parent;
            }
            if (stmtNode.parent && ts.isVariableStatement(stmtNode.parent)) {
                stmtNode = stmtNode.parent;
            }
            const scopeKey = `scope:${enclosingScopeId}`;
            callables.push({
                node: fnExpr,
                declNode: stmtNode,
                name,
                kind: "closure",
                className: nextClass,
                scopeKey,
                parameters: fnExpr.parameters,
                body: fnExpr.body
            });
            ts.forEachChild(fnExpr.body, (c) => visit(c, nextClass, `${enclosingScopeId}/${name}:${fnExpr.pos}`));
            return;
        }
        ts.forEachChild(node, (c) => visit(c, nextClass, enclosingScopeId));
    })(sf, null, "root");
    return callables;
}

function bodyTouchesSchemaTree(body) {
    let touches = false;
    (function check(n) {
        if (touches) return;
        if (
            n !== body &&
            (ts.isFunctionDeclaration(n) ||
                ts.isMethodDeclaration(n) ||
                ((ts.isArrowFunction(n) || ts.isFunctionExpression(n)) && !isSyncArrayCallback(n)))
        ) {
            return;
        }
        if (ts.isPropertyAccessExpression(n) && SCHEMA_TREE_PROPS.has(n.name.text)) {
            touches = true;
            return;
        }
        if (
            ts.isCallExpression(n) &&
            ts.isIdentifier(n.expression) &&
            (n.expression.text === "readRecord" || n.expression.text === "readString") &&
            n.arguments.length >= 2 &&
            ts.isStringLiteral(n.arguments[1]) &&
            SCHEMA_TREE_PROPS.has(n.arguments[1].text)
        ) {
            touches = true;
            return;
        }
        if (
            ts.isBinaryExpression(n) &&
            (n.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken ||
                n.operatorToken.kind === ts.SyntaxKind.EqualsEqualsToken) &&
            ((ts.isStringLiteral(n.left) && SCHEMA_TREE_PROPS.has(n.left.text)) ||
                (ts.isStringLiteral(n.right) && SCHEMA_TREE_PROPS.has(n.right.text)))
        ) {
            touches = true;
            return;
        }
        ts.forEachChild(n, check);
    })(body);
    return touches;
}

function collectSiblingCalls(body, callable, peerMap) {
    const calledNames = new Set();
    (function check(n) {
        if (
            n !== body &&
            (ts.isFunctionDeclaration(n) ||
                ts.isMethodDeclaration(n) ||
                ((ts.isArrowFunction(n) || ts.isFunctionExpression(n)) && !isSyncArrayCallback(n)))
        ) {
            return;
        }
        if (ts.isCallExpression(n)) {
            const expr = n.expression;
            if (callable.kind === "method") {
                if (
                    ts.isPropertyAccessExpression(expr) &&
                    (expr.expression.kind === ts.SyntaxKind.ThisKeyword ||
                        (ts.isIdentifier(expr.expression) && expr.expression.text === callable.className)) &&
                    peerMap.has(expr.name.text)
                ) {
                    calledNames.add(expr.name.text);
                }
            } else if (ts.isIdentifier(expr) && peerMap.has(expr.text)) {
                calledNames.add(expr.text);
            }
        }
        ts.forEachChild(n, check);
    })(body);
    return calledNames;
}

function canReachPeer(startName, targetName, peerMap) {
    const visited = new Set();
    const startPeer = peerMap.get(startName);
    if (!startPeer) return false;
    const queue = [...startPeer.calledPeers];
    while (queue.length > 0) {
        const curr = queue.shift();
        if (curr === targetName) return true;
        if (visited.has(curr)) continue;
        visited.add(curr);
        const peer = peerMap.get(curr);
        if (peer) {
            for (const nxt of peer.calledPeers) queue.push(nxt);
        }
    }
    return false;
}

function extractOwnCallableText(callable, allCallables, sf) {
    const start = callable.declNode.pos;
    const end = callable.declNode.end;
    let raw = sf.text.slice(start, end);
    for (const other of allCallables) {
        if (other === callable) continue;
        if (other.declNode.pos > start && other.declNode.end <= end) {
            const relStart = other.declNode.pos - start;
            const relEnd = other.declNode.end - start;
            raw = raw.slice(0, relStart) + " ".repeat(relEnd - relStart) + raw.slice(relEnd);
        }
    }
    return raw;
}

function runSingleWalkerGate(violations, tsFiles) {
    const ownerParsed = parseSrcFile(SCHEMA_WALKER_OWNER_FILE);
    if (!ownerParsed) {
        violations.push(
            `[SINGLE_WALKER] src/.../${SCHEMA_WALKER_OWNER_FILE} is missing; there is no canonical schema walker left.`
        );
        return 0;
    }
    for (const member of SCHEMA_WALKER_OWNER_MEMBERS) {
        if (findNamedMembers(ownerParsed.sf, [member]).length === 0) {
            violations.push(
                `[SINGLE_WALKER] SchemaWalker.${member}() is missing from src/.../${SCHEMA_WALKER_OWNER_FILE}.`
            );
        }
    }
    const ownerFull = path.normalize(ownerParsed.full);
    let exemptCount = 0;

    for (const file of tsFiles) {
        if (path.normalize(file) === ownerFull) continue;
        const text = fs.readFileSync(file, "utf8");
        const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
        const callables = collectWalkerCallables(sf);
        const byScope = new Map();
        for (const c of callables) {
            if (!byScope.has(c.scopeKey)) byScope.set(c.scopeKey, new Map());
            byScope.get(c.scopeKey).set(c.name, c);
        }
        for (const c of callables) {
            const peerMap = byScope.get(c.scopeKey);
            c.calledPeers = collectSiblingCalls(c.body, c, peerMap);
            c.touchesSchema = bodyTouchesSchemaTree(c.body);
        }

        for (const c of callables) {
            const fnName = c.name;
            const peerMap = byScope.get(c.scopeKey);
            const inCycle = canReachPeer(fnName, fnName, peerMap);
            let cycleTouchesSchema = false;
            if (inCycle) {
                for (const [peerName, peer] of peerMap.entries()) {
                    const inSameScc =
                        peerName === fnName ||
                        (canReachPeer(fnName, peerName, peerMap) && canReachPeer(peerName, fnName, peerMap));
                    if (inSameScc && peer.touchesSchema) {
                        cycleTouchesSchema = true;
                        break;
                    }
                }
            }

            const hasDepthParam = c.parameters.some((p) => /depth/i.test(p.name.getText(sf)));
            const ownText = extractOwnCallableText(c, callables, sf);
            const usesSchemaWalker = /\bSchemaWalker\.(walk|walkPaired)\s*\(/.test(ownText);
            const exemptMatch = new RegExp(
                `//\\s*${WALKER_EXEMPT_MARKER}([\\s\\S]*?)(?:\\r?\\n\\s*[^/\\s]|$)`
            ).exec(ownText);

            let isDepthRecursiveWalker = false;
            if (hasDepthParam) {
                let callsSelf = c.calledPeers.has(fnName);
                let passesDepth = false;
                (function visitBody(child) {
                    if (ts.isCallExpression(child)) {
                        const callee = ts.isPropertyAccessExpression(child.expression)
                            ? child.expression.name.text
                            : ts.isIdentifier(child.expression)
                              ? child.expression.text
                              : "";
                        if (callee === fnName) callsSelf = true;
                        if (child.arguments.some((a) => /\bdepth\b/i.test(a.getText(sf)))) passesDepth = true;
                    }
                    ts.forEachChild(child, visitBody);
                })(c.body);
                const hasDepthCapGuard = new RegExp(`\\b(${REQUIRED_DEPTH_CONSTANTS.join("|")})\\b`).test(ownText);
                isDepthRecursiveWalker = !usesSchemaWalker && (callsSelf || (passesDepth && hasDepthCapGuard));
            }

            const isSchemaTreeRecursiveWalker = !usesSchemaWalker && inCycle && cycleTouchesSchema;
            const isRecursiveWalker = isDepthRecursiveWalker || isSchemaTreeRecursiveWalker;

            if (!isRecursiveWalker) {
                if (exemptMatch) {
                    violations.push(
                        `[SINGLE_WALKER] ${nodeLoc(sf, c.node)} carries a ${WALKER_EXEMPT_MARKER} comment on ` +
                            `'${fnName}' but does not recurse over a schema/layout tree or with a depth parameter. ` +
                            `Delete the stale exemption.`
                    );
                }
                continue;
            }

            if (exemptMatch) {
                const reason = exemptMatch[1].replace(/^\s*\/\/\s*/gm, " ").replace(/\s+/g, " ").trim();
                if (reason.length < MIN_WALKER_EXEMPT_REASON_CHARS) {
                    violations.push(
                        `[SINGLE_WALKER] ${nodeLoc(sf, c.node)} has a ${reason.length}-character ` +
                            `${WALKER_EXEMPT_MARKER} justification on '${fnName}'; at least ` +
                            `${MIN_WALKER_EXEMPT_REASON_CHARS} are required. State why SchemaWalker.walk() cannot own this traversal.`
                    );
                } else {
                    exemptCount++;
                }
            } else {
                const depthSuffix = hasDepthParam ? " with a depth parameter" : "";
                violations.push(
                    `[SINGLE_WALKER] ${nodeLoc(sf, c.node)} defines a recursive walker '${fnName}'${depthSuffix} ` +
                        `outside ${SCHEMA_WALKER_OWNER_FILE}. Delegate schema tree traversal to ` +
                        `SchemaWalker.walk(), or if the function genuinely walks a non-schema or co-inductive ` +
                        `(schema, data) structure, add a '// ${WALKER_EXEMPT_MARKER} <reason>' comment ` +
                        `(>= ${MIN_WALKER_EXEMPT_REASON_CHARS} chars) explaining why SchemaWalker cannot own it.`
                );
            }
        }
    }
    return exemptCount;
}


// ---------------------------------------------------------------------------
// REVERSE [DOC_SYMBOL] ALLOWLIST
//
// Every implementation .ts module in src/ and every top-level exported symbol in
// the public or extension API tiers MUST be documented in README.md,
// CONTRIBUTING.md, docs/ARCHITECTURE.md, or docs/wiki/*.md. Internal helper
// types and functions that are exported only for intra-library imports must
// either be documented in docs/ARCHITECTURE.md or listed below with a >= 30-char
// justification. Stale entries (deleted or subsequently documented) fail the gate.
// ---------------------------------------------------------------------------
const MIN_UNDOCUMENTED_REASON_CHARS = 30;
const UNDOCUMENTED_SYMBOL_ALLOWLIST = new Map([
    ["constants/MetaUIConstants.ts#UI5_EVENT", "Internal UI5 control event name constants consumed only by plugins and delegates."],
    ["constants/MetaUIConstants.ts#UI5_AGGREGATION", "Internal UI5 control aggregation name constants consumed only by layouts and hosts."],
    ["constants/MetaUIConstants.ts#OPENAPI_PREFIX", "Internal OpenAPI $ref prefix constants consumed only by OpenApiRefResolver and mappers."],
    ["controls/BaseHardwareControl.ts#$BaseHardwareControlSettings", "Generated UI5 constructor settings interface for internal BaseHardwareControl."],
    ["controls/BaseHardwareControl.ts#HardwareFailureReason", "Internal union type of capability failure codes for BaseHardwareControl subclasses."],
    ["controls/BaseHardwareControl.ts#BaseHardwareControl$CaptureEventParameters", "Internal UI5 event parameter shape for BaseHardwareControl capture event."],
    ["controls/host/delegates/DataSyncDelegate.ts#IHostDataSync", "Internal structural host interface decoupling DataSyncDelegate from GeneratorHost."],
    ["controls/host/delegates/DataSyncDelegate.ts#IDataJsonInvalidationTarget", "Internal target contract for DataSyncDelegate.invalidateStaleDataJson."],
    ["controls/host/delegates/DataSyncDelegate.ts#IDataPairCommitTarget", "Internal target contract for DataSyncDelegate.commitDataPair."],
    ["controls/host/delegates/DialogDelegate.ts#IHostDialog", "Internal structural host interface decoupling DialogDelegate from GeneratorHost."],
    ["controls/host/delegates/GenerationDelegate.ts#IPreparedGenerationInput", "Internal return record for GenerationDelegate.prepareGenerationInput."],
    ["controls/host/delegates/ValidationDelegate.ts#IHostValidation", "Internal structural host interface decoupling ValidationDelegate from GeneratorHost."],
    ["controls/host/GeneratorHost.ts#GeneratorHost$BeforeSubmitEventParameters", "Internal UI5 event parameter interface on inner GeneratorHost (DynamicHost is public)."],
    ["controls/host/GeneratorHost.ts#GeneratorHost$SubmitEventParameters", "Internal UI5 event parameter interface on inner GeneratorHost (DynamicHost is public)."],
    ["controls/host/GeneratorHost.ts#GeneratorHost$CancelEventParameters", "Internal UI5 event parameter interface on inner GeneratorHost (DynamicHost is public)."],
    ["controls/host/GeneratorHost.ts#GeneratorHost$FieldChangeEventParameters", "Internal UI5 event parameter interface on inner GeneratorHost (DynamicHost is public)."],
    ["controls/host/GeneratorHost.ts#GeneratorHost$ValidationStateChangedEventParameters", "Internal UI5 event parameter interface on inner GeneratorHost (DynamicHost is public)."],
    ["controls/host/GeneratorHost.ts#GeneratorHost$ErrorEventParameters", "Internal UI5 event parameter interface on inner GeneratorHost (DynamicHost is public)."],
    ["controls/host/GeneratorHost.ts#GeneratorHost$BeforeLayoutSectionChangeEventParameters", "Internal UI5 event parameter interface on inner GeneratorHost (DynamicHost is public)."],
    ["controls/host/HostControlMetadata.ts#isJsonLiteralString", "Internal constructor helper detecting inline JSON strings in UI5 XML/JS settings."],
    ["controls/host/HostControlMetadata.ts#IExtractedHostSettings", "Internal return type for extractJsonLiteralSettings in HostControlMetadata."],
    ["core/LayoutScorer.ts#ILayoutDecision", "Internal per-scope layout scoring decision entry produced by LayoutScorer."],
    ["core/LayoutScorer.ts#LayoutDecisionTable", "Internal ReadonlyMap alias mapping JSON-Pointer scopes to ILayoutDecision records."],
    ["core/SandboxJSONModel.ts#PropertyChangeHook", "Internal callback signature invoked by SandboxJSONModel on setProperty mutations."],
    ["core/ValidationLedger.ts#IValidationLedgerEntry", "Internal per-path validation error record stored inside ValidationLedger."],
    ["layouts/LayoutElementWalker.ts#ILabelledFieldResult", "Internal label-and-control pair returned to layouts by LayoutElementWalker."],
    ["layouts/LayoutElementWalker.ts#IResolvedLayoutControl", "Internal resolved control descriptor passed to ILayoutWalkerSink callbacks."],
    ["layouts/LayoutElementWalker.ts#ILayoutWalkerSink", "Internal sink interface implemented by FormLayout, WizardLayout, and FlexibleColumnLayout."],
    ["layouts/LayoutElementWalker.ts#LayoutFieldFactory", "Internal callback type for rendering a single field inside LayoutElementWalker."],
    ["layouts/LayoutElementWalker.ts#ArraySubSchemaFactory", "Internal callback type for rendering an inline array sub-schema in LayoutElementWalker."],
    ["plugins/actions/ActionButtonPlugin.ts#IActionButtonConfig", "Internal configuration struct passed by SubmitActionPlugin and ClearFormActionPlugin."],
    ["plugins/controls/NestedDialogPlugin.ts#INestedDialogDescriptor", "Internal descriptor struct passed by NestedFormPlugin and NestedArrayPlugin."],
    ["plugins/controls/OptionListPlugin.ts#IOptionItem", "Internal normalized key/text option item shared by Select, Radio, ComboBox, and Segmented."],
    ["plugins/controls/OptionListPlugin.ts#IOptionListControl", "Internal duck-typed UI5 item-list control contract for OptionListPlugin."],
    ["plugins/controls/PickerPlugin.ts#PickerControlInstance", "Internal union of UI5 DatePicker, TimePicker,DateTimePicker, and ColorPicker instances."],
    ["plugins/controls/PickerPlugin.ts#PickerSettings", "Internal UI5 constructor settings record for PickerPlugin subclasses."],
    ["plugins/controls/PickerPlugin.ts#IPickerPluginConfig", "Internal configuration contract for PickerPlugin subclasses."],
    ["plugins/controls/SingleBoundWidgetPlugin.ts#SingleBoundWidgetInstance", "Internal union of UI5 single-value bound controls for SingleBoundWidgetPlugin."],
    ["plugins/controls/SingleBoundWidgetPlugin.ts#SingleBoundWidgetSettings", "Internal UI5 constructor settings record for SingleBoundWidgetPlugin subclasses."],
    ["plugins/controls/SingleBoundWidgetPlugin.ts#ISingleBoundWidgetConfig", "Internal configuration contract for SingleBoundWidgetPlugin subclasses."],
    ["plugins/controls/TextLikeInputPlugin.ts#ITextLikeControl", "Internal duck-typed UI5 Input/TextArea interface for TextLikeInputPlugin."],
    ["plugins/validators/ArrayItemsValidatorPlugin.ts#IArrayItemsArgs", "Internal rule arguments shape extracted by ArrayItemsValidatorPlugin."],
    ["plugins/validators/ArrayItemsValidatorPlugin.ts#canonicalSerialize", "Internal deterministic JSON serializer used for uniqueItems structural equality."],
    ["plugins/validators/PatternValidatorPlugin.ts#resetPatternSafetyState", "Internal test hook resetting memoized regex safety verdicts between unit tests."],
    ["plugins/validators/RangeValidatorPlugin.ts#IRangeArgs", "Internal numeric bounds argument struct extracted by RangeValidatorPlugin."],
    ["plugins/validators/RequiredValidatorPlugin.ts#isEmptyValue", "Internal emptiness predicate shared by RequiredValidatorPlugin and PayloadValidator."],
    ["utils/ControlCapabilities.ts#IBoundInspectable", "Internal duck-typed UI5 ManagedObject binding inspection interface."],
    ["utils/ControlCapabilities.ts#IControlPropVerdict", "Internal return record for vetControlProperty capability checks."],
    ["utils/ControlCapabilities.ts#IValueStateSupport", "Internal duck-typed UI5 interface for controls supporting setValueState."],
    ["utils/ControlCapabilities.ts#IEditableSupport", "Internal duck-typed UI5 interface for controls supporting setEditable."],
    ["utils/ControlCapabilities.ts#IEnabledSupport", "Internal duck-typed UI5 interface for controls supporting setEnabled."],
    ["utils/ControlCapabilities.ts#IRequiredSupport", "Internal duck-typed UI5 interface for controls supporting setRequired."],
    ["utils/ControlCapabilities.ts#isValueStateSupport", "Internal type guard narrowing a UI5 Control to IValueStateSupport."],
    ["utils/ControlCapabilities.ts#isEditableSupport", "Internal type guard narrowing a UI5 Control to IEditableSupport."],
    ["utils/ControlCapabilities.ts#isEnabledSupport", "Internal type guard narrowing a UI5 Control to IEnabledSupport."],
    ["utils/ControlCapabilities.ts#isRequiredSupport", "Internal type guard narrowing a UI5 Control to IRequiredSupport."],
    ["utils/ControlCapabilities.ts#resolveContextualPath", "Internal path concatenation helper for relative vs absolute binding paths."],
    ["utils/ControlCapabilities.ts#resolveDataSourceDescriptor", "Internal helper resolving IDataSourceConfig from metadata and binding path."],
    ["utils/ControlCapabilities.ts#extractDataSourceList", "Internal helper extracting an array payload from a remote JSON response."],
    ["utils/ControlCapabilities.ts#openNestedHostDialog", "Internal dialog launcher backing BasePlugin.openNestedEditorDialog."],
    ["utils/ControlCapabilities.ts#forEachBoundControl", "Internal control-tree walker invoking a callback on every field-bound UI5 control."],
    ["utils/DictionaryMapUtil.ts#IDictionaryEntry", "Internal key/value row model entry for DictionaryMapPlugin."],
    ["utils/DictionaryMapUtil.ts#IDictionarySerializationResult", "Internal serialization result with duplicate-key tracking for DictionaryMapPlugin."],
    ["utils/DictionaryMapUtil.ts#IDictionaryRowBuildOptions", "Internal row construction options for DictionaryMapUtil.buildRow."],
    ["utils/I18n.ts#METAUI_LIBRARY_NAME", "Internal constant holding the UI5 library namespace string for resource bundle lookup."],
    ["utils/I18n.ts#MetaUITextKey", "Internal union type of valid i18n bundle keys derived from TEXT_KEY."],
    ["utils/PolymorphicUtil.ts#IPolymorphicVariant", "Internal normalized oneOf/anyOf variant descriptor for PolymorphicPlugin."],
    ["utils/TypeGuards.ts#JsonRecord", "Internal convenience alias for Record<string, unknown> used across normalizers."],
    ["utils/TypeGuards.ts#isRecord", "Internal type guard checking that an unknown value is a non-null plain object."],
    ["utils/TypeGuards.ts#readString", "Internal safe property reader returning string or undefined from a JsonRecord."],
    ["utils/TypeGuards.ts#readNumber", "Internal safe property reader returning finite number or undefined from a JsonRecord."],
    ["utils/TypeGuards.ts#readBoolean", "Internal safe property reader returning boolean or undefined from a JsonRecord."],
    ["utils/TypeGuards.ts#readRecord", "Internal safe property reader returning a nested JsonRecord or undefined."],
    ["utils/TypeGuards.ts#readStringArray", "Internal safe property reader returning a string[] or undefined from a JsonRecord."]
]);

/**
 * Collects all git-tracked / repository Markdown files under audit for [DOC_COUNT] and [DOC_CODE].
 */
function collectAllTrackedMarkdownFiles(mdFilesToAudit) {
    const extraCandidates = ["CHANGELOG.md", "docs/ROADMAP.md", "benchmark/BASELINE.md"];
    const set = new Set(mdFilesToAudit);
    for (const rel of extraCandidates) {
        const full = path.join(ROOT_DIR, rel);
        if (fs.existsSync(full)) set.add(full);
    }
    return Array.from(set);
}

/**
 * GATE K -- [DOC_SYMBOL] reverse direction (src/ -> docs/).
 *
 * Ensures every implementation .ts module in src/ and every top-level exported declaration in src/
 * is either cited in the audited documentation (README.md, CONTRIBUTING.md, AGENTS.md,
 * docs/ARCHITECTURE.md, docs/wiki/*.md) or explicitly justified in UNDOCUMENTED_SYMBOL_ALLOWLIST.
 * Also fails when an allowlist entry is stale (deleted from src/ or now documented in docs/).
 */
function runReverseDocSymbolGate(violations, tsFiles, symbolAuditFiles) {
    for (const [key, reason] of UNDOCUMENTED_SYMBOL_ALLOWLIST.entries()) {
        if (typeof reason !== "string" || reason.trim().length < MIN_UNDOCUMENTED_REASON_CHARS) {
            violations.push(
                `[DOC_SYMBOL] UNDOCUMENTED_SYMBOL_ALLOWLIST['${key}'] must carry a justification of at least ${MIN_UNDOCUMENTED_REASON_CHARS} characters.`
            );
        }
    }

    const allDocText = symbolAuditFiles.map((f) => fs.readFileSync(f, "utf8")).join("\n");
    const docIdentifiers = new Set();
    for (const m of allDocText.matchAll(/[A-Za-z_$][A-Za-z0-9_$]*/g)) {
        docIdentifiers.add(m[0]);
    }

    const matchedAllowlistKeys = new Set();

    for (const file of tsFiles) {
        const relFromSrc = path.relative(SRC_DIR, file).replace(/\\/g, "/");
        const relFromRoot = path.relative(ROOT_DIR, file).replace(/\\/g, "/");
        const moduleStem = path.basename(file, ".ts");

        if (moduleStem !== "library" && !docIdentifiers.has(moduleStem)) {
            const moduleKey = `${relFromSrc}#<module>`;
            if (UNDOCUMENTED_SYMBOL_ALLOWLIST.has(moduleKey)) {
                matchedAllowlistKeys.add(moduleKey);
            } else {
                violations.push(
                    `[DOC_SYMBOL] ${relFromRoot} module '${moduleStem}' is not mentioned in any audited documentation file (docs/ARCHITECTURE.md, CONTRIBUTING.md, or docs/wiki/*.md).`
                );
            }
        }

        const content = fs.readFileSync(file, "utf8");
        const sf = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

        for (const stmt of sf.statements) {
            const isExported =
                stmt.modifiers && stmt.modifiers.some((mod) => mod.kind === ts.SyntaxKind.ExportKeyword);
            if (!isExported) continue;

            const exportedNames = [];
            if (
                (ts.isClassDeclaration(stmt) ||
                    ts.isInterfaceDeclaration(stmt) ||
                    ts.isTypeAliasDeclaration(stmt) ||
                    ts.isFunctionDeclaration(stmt) ||
                    ts.isEnumDeclaration(stmt)) &&
                stmt.name
            ) {
                exportedNames.push({ name: stmt.name.text, node: stmt.name });
            } else if (ts.isVariableStatement(stmt)) {
                for (const decl of stmt.declarationList.declarations) {
                    if (ts.isIdentifier(decl.name)) {
                        exportedNames.push({ name: decl.name.text, node: decl.name });
                    }
                }
            }

            for (const { name, node } of exportedNames) {
                const allowKey = `${relFromSrc}#${name}`;
                if (docIdentifiers.has(name)) {
                    if (UNDOCUMENTED_SYMBOL_ALLOWLIST.has(allowKey)) {
                        violations.push(
                            `[DOC_SYMBOL] Stale UNDOCUMENTED_SYMBOL_ALLOWLIST entry '${allowKey}': symbol '${name}' is now documented in docs/ and must be removed from the allowlist.`
                        );
                    }
                    continue;
                }
                if (UNDOCUMENTED_SYMBOL_ALLOWLIST.has(allowKey)) {
                    matchedAllowlistKeys.add(allowKey);
                } else {
                    const pos = sf.getLineAndCharacterOfPosition(node.getStart(sf));
                    violations.push(
                        `[DOC_SYMBOL] ${relFromRoot}:${pos.line + 1} exports '${name}' which is neither documented in docs/ nor justified in UNDOCUMENTED_SYMBOL_ALLOWLIST.`
                    );
                }
            }
        }
    }

    for (const key of UNDOCUMENTED_SYMBOL_ALLOWLIST.keys()) {
        if (!matchedAllowlistKeys.has(key)) {
            violations.push(
                `[DOC_SYMBOL] Stale UNDOCUMENTED_SYMBOL_ALLOWLIST entry '${key}' matched no undocumented export in src/.`
            );
        }
    }
}

/**
 * GATE L -- [DOC_COUNT] markdown metric parity.
 *
 * Re-derives project counts from the live source AST and verifies every
 * `<!-- DOC_COUNT:<key> --><number>` marker across all tracked Markdown files.
 */
function runDocCountGate(violations, tsFiles, singleWalkerExemptions, catchExemptions) {
    function countConcreteAndAbstract(dir) {
        let concrete = 0;
        let abstractBases = 0;
        for (const f of collectTsFiles(dir)) {
            const text = fs.readFileSync(f, "utf8");
            const sf = ts.createSourceFile(f, text, ts.ScriptTarget.Latest, true);
            let isAbstract = false;
            sf.forEachChild((node) => {
                if (
                    ts.isClassDeclaration(node) &&
                    node.modifiers &&
                    node.modifiers.some((m) => m.kind === ts.SyntaxKind.AbstractKeyword)
                ) {
                    isAbstract = true;
                }
            });
            if (isAbstract) abstractBases++;
            else concrete++;
        }
        return { concrete, abstractBases };
    }
    const bootCounts = parseBootstrapperSource(path.join(SRC_DIR, "core", "DefaultPluginBootstrapper.ts"));
    const pipeCounts = parsePipelineManagerSource(path.join(SRC_DIR, "core", "PipelineManager.ts"));
    const ctrlSplit = countConcreteAndAbstract(path.join(SRC_DIR, "plugins", "controls"));
    const actSplit = countConcreteAndAbstract(path.join(SRC_DIR, "plugins", "actions"));
    const dsCount = collectTsFiles(path.join(SRC_DIR, "plugins", "datasources")).length;
    const condFiles = collectTsFiles(path.join(SRC_DIR, "plugins", "policies", "conditions")).length;
    const effFiles = collectTsFiles(path.join(SRC_DIR, "plugins", "policies", "effects")).length;
    const metrics = {
        registered: {
            ...bootCounts,
            ...pipeCounts,
            concreteControlPlugins: ctrlSplit.concrete,
            abstractControlPluginBases: ctrlSplit.abstractBases,
            concreteActionPlugins: actSplit.concrete,
            abstractActionPluginBases: actSplit.abstractBases,
            datasourcePluginFiles: dsCount,
            policyConditionFiles: condFiles,
            policyEffectFiles: effFiles,
            concreteWidgetPlugins: ctrlSplit.concrete + actSplit.concrete + dsCount
        }
    };

    // Derive i18nTextKeys from utils/I18n.ts TEXT_KEY object literal
    let i18nTextKeys = 0;
    const i18nFile = path.join(SRC_DIR, "utils", "I18n.ts");
    if (fs.existsSync(i18nFile)) {
        const sf = ts.createSourceFile(i18nFile, fs.readFileSync(i18nFile, "utf8"), ts.ScriptTarget.Latest, true);
        sf.forEachChild((node) => {
            if (ts.isVariableStatement(node)) {
                for (const decl of node.declarationList.declarations) {
                    if (ts.isIdentifier(decl.name) && decl.name.text === "TEXT_KEY" && decl.initializer) {
                        let init = decl.initializer;
                        while (ts.isAsExpression(init) || ts.isParenthesizedExpression(init)) init = init.expression;
                        if (ts.isObjectLiteralExpression(init)) {
                            i18nTextKeys = init.properties.length;
                        }
                    }
                }
            }
        });
    }

    // Derive maxSchemaDepth from constants/MetaUIConstants.ts MAX_SCHEMA_DEPTH
    let maxSchemaDepth = 0;
    const constFile = path.join(SRC_DIR, "constants", "MetaUIConstants.ts");
    if (fs.existsSync(constFile)) {
        const sf = ts.createSourceFile(constFile, fs.readFileSync(constFile, "utf8"), ts.ScriptTarget.Latest, true);
        sf.forEachChild((node) => {
            if (ts.isVariableStatement(node)) {
                for (const decl of node.declarationList.declarations) {
                    if (
                        ts.isIdentifier(decl.name) &&
                        decl.name.text === "MAX_SCHEMA_DEPTH" &&
                        decl.initializer &&
                        ts.isNumericLiteral(decl.initializer)
                    ) {
                        maxSchemaDepth = Number(decl.initializer.text);
                    }
                }
            }
        });
    }

    // Derive gateProofCases from scripts/prove-structural-gates.js CASES array length
    let gateProofCases = 0;
    const proveFile = path.join(SCRIPTS_DIR, "prove-structural-gates.js");
    if (fs.existsSync(proveFile)) {
        const sf = ts.createSourceFile(
            proveFile,
            fs.readFileSync(proveFile, "utf8"),
            ts.ScriptTarget.Latest,
            true,
            ts.ScriptKind.JS
        );
        sf.forEachChild((node) => {
            if (ts.isVariableStatement(node)) {
                for (const decl of node.declarationList.declarations) {
                    if (
                        ts.isIdentifier(decl.name) &&
                        decl.name.text === "CASES" &&
                        decl.initializer &&
                        ts.isArrayLiteralExpression(decl.initializer)
                    ) {
                        gateProofCases = decl.initializer.elements.length;
                    }
                }
            }
        });
    }

    // Derive publicTierModules and publicTierDeclarations from .github/api-surface.txt header
    let publicTierModules = 0;
    let publicTierDeclarations = 0;
    const apiSurfaceFile = path.join(ROOT_DIR, ".github", "api-surface.txt");
    if (fs.existsSync(apiSurfaceFile)) {
        const apiText = fs.readFileSync(apiSurfaceFile, "utf8");
        const modMatch = apiText.match(/^# modules:\s*\d+\s*\(public\s+(\d+),/m);
        const declMatch = apiText.match(/^# declarations:\s*\d+\s*\(public\s+(\d+),/m);
        if (modMatch) publicTierModules = Number(modMatch[1]);
        if (declMatch) publicTierDeclarations = Number(declMatch[1]);
    }

    const derivedCounts = new Map([
        ["pluginMappings", metrics.registered.pluginMappings],
        ["layouts", metrics.registered.layouts],
        ["policyConditions", metrics.registered.policyConditions],
        ["policyEffects", metrics.registered.policyEffects],
        ["policyConditionFiles", metrics.registered.policyConditionFiles],
        ["policyEffectFiles", metrics.registered.policyEffectFiles],
        ["concreteControlPlugins", metrics.registered.concreteControlPlugins],
        ["abstractControlPluginBases", metrics.registered.abstractControlPluginBases],
        ["concreteActionPlugins", metrics.registered.concreteActionPlugins],
        ["abstractActionPluginBases", metrics.registered.abstractActionPluginBases],
        ["datasourcePlugins", metrics.registered.datasourcePluginFiles],
        ["concreteWidgetPlugins", metrics.registered.concreteWidgetPlugins],
        ["validators", metrics.registered.validators],
        ["formatters", metrics.registered.formatters],
        ["parsers", metrics.registered.parsers],
        ["i18nTextKeys", i18nTextKeys],
        ["maxSchemaDepth", maxSchemaDepth],
        ["singleWalkerExemptions", singleWalkerExemptions],
        ["catchExemptions", catchExemptions],
        ["structuralGates", 10],
        ["gateProofCases", gateProofCases],
        ["publicTierModules", publicTierModules],
        ["publicTierDeclarations", publicTierDeclarations]
    ]);

    const mdFiles = collectAllTrackedMarkdownFiles(collectAuditedMarkdownFiles([]));
    let markerCount = 0;

    for (const full of mdFiles) {
        const relMd = path.relative(ROOT_DIR, full).replace(/\\/g, "/");
        const lines = fs.readFileSync(full, "utf8").split(/\r?\n/);
        lines.forEach((line, idx) => {
            const lineNo = idx + 1;
            const scanLine = line.replace(/`[^`]*`/g, (m) => " ".repeat(m.length));
            const rawMarkers = scanLine.matchAll(/<!--\s*DOC_COUNT:([^>]*?)-->/g);
            for (const rm of rawMarkers) {
                const key = rm[1].trim();
                if (!derivedCounts.has(key)) {
                    violations.push(`[DOC_COUNT] ${relMd}:${lineNo} references unknown DOC_COUNT metric key '${key}'.`);
                    continue;
                }
                const afterIdx = rm.index + rm[0].length;
                const tail = line.slice(afterIdx);
                const numMatch = tail.match(/^[\`*]*(\d+)/);
                if (!numMatch) {
                    violations.push(
                        `[DOC_COUNT] ${relMd}:${lineNo} marker 'DOC_COUNT:${key}' is not immediately followed by an integer.`
                    );
                    continue;
                }
                markerCount++;
                const claimed = Number(numMatch[1]);
                const actual = derivedCounts.get(key);
                if (claimed !== actual) {
                    violations.push(
                        `[DOC_COUNT] ${relMd}:${lineNo} claims ${key}=${claimed} but source AST derives ${actual}.`
                    );
                }
            }
        });
    }

    if (markerCount < 50) {
        violations.push(
            `[DOC_COUNT] Expected at least 50 DOC_COUNT markers across documentation, but found only ${markerCount}. Do not strip DOC_COUNT markers.`
        );
    }
}

/**
 * Strips // line comments and /* block comments * / outside JSON string literals for JSONC blocks.
 */
function stripJsoncComments(str) {
    let out = "";
    let inString = false;
    let escape = false;
    for (let i = 0; i < str.length; i++) {
        const ch = str[i];
        const next = str[i + 1];
        if (inString) {
            out += ch;
            if (escape) escape = false;
            else if (ch === "\\") escape = true;
            else if (ch === '"') inString = false;
        } else if (ch === '"') {
            inString = true;
            out += ch;
        } else if (ch === "/" && next === "/") {
            while (i < str.length && str[i] !== "\n") i++;
            out += "\n";
        } else if (ch === "/" && next === "*") {
            i += 2;
            while (i < str.length && !(str[i] === "*" && str[i + 1] === "/")) i++;
            i++;
        } else {
            out += ch;
        }
    }
    return out;
}

/**
 * GATE M -- [DOC_CODE] fenced code block compilation & JSON parsing gate.
 *
 * Extracts every fenced `typescript`/`ts`, `json`, and `jsonc` code block across all tracked
 * Markdown files:
 *  - `json` blocks must parse with JSON.parse() and must not use withdrawn 2.0.0 keywords.
 *  - `jsonc` blocks must parse with JSON.parse() after stripping comments.
 *  - `typescript`/`ts` blocks must compile cleanly against tsconfig.json via ts.createProgram.
 */
function runDocCodeGate(violations, tsFiles) {
    const mdFiles = collectAllTrackedMarkdownFiles(collectAuditedMarkdownFiles([]));
    const tsBlocks = [];
    const jsonBlocks = [];
    const jsoncBlocks = [];

    for (const full of mdFiles) {
        const relMd = path.relative(ROOT_DIR, full).replace(/\\/g, "/");
        const lines = fs.readFileSync(full, "utf8").split(/\r?\n/);
        let inFence = false;
        let fenceLang = "";
        let fenceStart = 0;
        let fenceLines = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (!inFence) {
                const m = line.match(/^\s*```(\S*)\s*$/);
                if (m) {
                    inFence = true;
                    fenceLang = (m[1] || "").toLowerCase();
                    fenceStart = i + 1;
                    fenceLines = [];
                }
            } else if (/^\s*```\s*$/.test(line)) {
                const code = fenceLines.join("\n");
                if (fenceLang === "typescript" || fenceLang === "ts") {
                    tsBlocks.push({ relMd, fenceStart, code });
                } else if (fenceLang === "json") {
                    jsonBlocks.push({ relMd, fenceStart, code });
                } else if (fenceLang === "jsonc") {
                    jsoncBlocks.push({ relMd, fenceStart, code });
                }
                inFence = false;
            } else {
                fenceLines.push(line);
            }
        }
    }

    for (const b of jsonBlocks) {
        try {
            const parsed = JSON.parse(b.code);
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
                const checkProps = (propsObj) => {
                    if (!propsObj || typeof propsObj !== "object") return;
                    for (const [propName, propDef] of Object.entries(propsObj)) {
                        if (!propDef || typeof propDef !== "object") continue;
                        for (const withdrawn of ["scale", "precision", "deprecated"]) {
                            if (Object.prototype.hasOwnProperty.call(propDef, withdrawn)) {
                                violations.push(
                                    `[DOC_CODE] ${b.relMd}:${b.fenceStart} JSON schema property '${propName}' uses withdrawn 2.0.0 keyword '${withdrawn}'.`
                                );
                            }
                        }
                        if (propDef.ui && propDef.ui.widget === "scanner") {
                            violations.push(
                                `[DOC_CODE] ${b.relMd}:${b.fenceStart} JSON schema property '${propName}' uses withdrawn 2.0.0 widget 'scanner'.`
                            );
                        }
                        if (propDef.properties) checkProps(propDef.properties);
                        if (propDef.items && propDef.items.properties) checkProps(propDef.items.properties);
                    }
                };
                if (parsed.properties) checkProps(parsed.properties);
                if (parsed.items && parsed.items.properties) checkProps(parsed.items.properties);
            }
        } catch (err) {
            violations.push(`[DOC_CODE] ${b.relMd}:${b.fenceStart} invalid JSON code block: ${err.message}`);
        }
    }

    for (const b of jsoncBlocks) {
        try {
            JSON.parse(stripJsoncComments(b.code));
        } catch (err) {
            violations.push(`[DOC_CODE] ${b.relMd}:${b.fenceStart} invalid JSONC code block: ${err.message}`);
        }
    }

    if (tsBlocks.length > 0) {
        const crypto = require("crypto");
        const hash = crypto.createHash("sha256");
        for (const b of tsBlocks) {
            hash.update(`${b.relMd}:${b.fenceStart}:\n${b.code}\n`);
        }
        const digest = hash.digest("hex");
        const cacheFile = path.join(os.tmpdir(), "metaui_doc_code_ts_cache.json");
        let cachedDiags = null;
        if (fs.existsSync(cacheFile)) {
            try {
                const parsedCache = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
                if (parsedCache && parsedCache.digest === digest && Array.isArray(parsedCache.violations)) {
                    cachedDiags = parsedCache.violations;
                }
            } catch (cacheErr) {
                void cacheErr;
            }
        }

        if (cachedDiags !== null) {
            for (const v of cachedDiags) violations.push(v);
        } else {
            const configPath = path.join(ROOT_DIR, "tsconfig.json");
            const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
            const parsedConfig = ts.parseJsonConfigFileContent(configFile.config, ts.sys, ROOT_DIR);

            const virtualFiles = new Map();
            const virtualToBlock = new Map();
            const vDir = path.join(SRC_DIR).replace(/\\/g, "/");

            tsBlocks.forEach((b, idx) => {
                const vPath = `${vDir}/__doc_block_${idx}.ts`;
                const rewritten = b.code.replace(
                    /from\s+["']nz\/co\/siliconst\/ui5\/metaui\/([^"']+)["']/g,
                    'from "./$1"'
                );
                virtualFiles.set(vPath, rewritten + "\nexport {};\n");
                virtualToBlock.set(vPath, b);
            });

            const defaultHost = ts.createCompilerHost(parsedConfig.options);
            const customHost = {
                ...defaultHost,
                fileExists: (fileName) => {
                    const norm = fileName.replace(/\\/g, "/");
                    return virtualFiles.has(norm) || defaultHost.fileExists(fileName);
                },
                readFile: (fileName) => {
                    const norm = fileName.replace(/\\/g, "/");
                    if (virtualFiles.has(norm)) return virtualFiles.get(norm);
                    return defaultHost.readFile(fileName);
                },
                getSourceFile: (fileName, languageVersion, onError, shouldCreateNewSourceFile) => {
                    const norm = fileName.replace(/\\/g, "/");
                    if (virtualFiles.has(norm)) {
                        return ts.createSourceFile(fileName, virtualFiles.get(norm), languageVersion, true);
                    }
                    return defaultHost.getSourceFile(fileName, languageVersion, onError, shouldCreateNewSourceFile);
                }
            };

            const compilerOpts = {
                ...parsedConfig.options,
                noEmit: true,
                noUnusedLocals: false,
                noUnusedParameters: false
            };
            const ambientFiles = parsedConfig.fileNames.filter((f) => f.endsWith(".d.ts"));
            const rootNames = [...ambientFiles, ...virtualFiles.keys()];
            const program = ts.createProgram(rootNames, compilerOpts, customHost);

            const tsViolations = [];
            for (const [vPath, b] of virtualToBlock.entries()) {
                const sf = program.getSourceFile(vPath);
                if (!sf) continue;
                const diags = [...program.getSyntacticDiagnostics(sf), ...program.getSemanticDiagnostics(sf)];
                for (const d of diags) {
                    const msg = ts.flattenDiagnosticMessageText(d.messageText, " ");
                    tsViolations.push(
                        `[DOC_CODE] ${b.relMd}:${b.fenceStart} TypeScript code block failed compilation (TS${d.code}): ${msg}`
                    );
                }
            }

            try {
                fs.writeFileSync(cacheFile, JSON.stringify({ digest, violations: tsViolations }), "utf8");
            } catch (writeErr) {
                void writeErr;
            }
            for (const v of tsViolations) violations.push(v);
        }
    }
}

/** Runs all ten structural gates, returning the counted CATCH_SIGNAL and SINGLE_WALKER exemptions. */
function runStructuralGates(violations, tsFiles) {
    runProducerCompletenessGate(violations);
    runDepthConstantGate(violations, tsFiles);
    runRefResolverGate(violations, tsFiles);
    runLayoutStrategyGate(violations, tsFiles);
    runSchemaConstantGate(violations, tsFiles);
    runDataWriterGate(violations, tsFiles);
    const catchExemptions = runCatchSignalGate(violations, tsFiles);
    runDepthSignalGate(violations, tsFiles);
    runRenderDegradationGate(violations, tsFiles);
    const singleWalkerExemptions = runSingleWalkerGate(violations, tsFiles);
    return { catchExemptions, singleWalkerExemptions };
}

/**
 * Parses key=value and key="quoted value" attributes inside a DOC_MEASURE HTML comment.
 */
function parseDocMeasureAttrs(attrText) {
    const attrs = {};
    const re = /([a-zA-Z0-9_]+)=(?:"((?:[^"\\]|\\.)*)"|(\S+))/g;
    for (const m of attrText.matchAll(re)) {
        const key = m[1];
        const val = m[2] !== undefined ? m[2].replace(/\\"/g, '"').replace(/\\\\/g, "\\") : m[3];
        attrs[key] = val;
    }
    return attrs;
}

/**
 * GATE N -- [DOC_MEASURE] measured-figure parity & staleness gate.
 *
 * Verifies every `<!-- DOC_MEASURE:<key> ... --><number>` marker across all tracked Markdown files:
 *  1. Fast in-process measurements (`tolerance=<N%|N> source=<cmd>`) are measured live and checked
 *     against `|claimed - actual| <= tolerance`.
 *  2. Expensive measurements (`measured=YYYY-MM-DD maxAgeDays=<N> source=<cmd>`) are checked for a
 *     valid non-future ISO date within `maxAgeDays` and a non-empty `source=` command.
 */
function runDocMeasureGate(violations) {
    const liveMeasurements = new Map([
        [
            "bundlePreloadKB",
            () => {
                const buildPath = path.join(
                    ROOT_DIR,
                    "dist",
                    "resources",
                    "nz",
                    "co",
                    "siliconst",
                    "ui5",
                    "metaui",
                    "library-preload.js"
                );
                const prepPath = path.join(
                    ROOT_DIR,
                    "dist",
                    "src",
                    "nz",
                    "co",
                    "siliconst",
                    "ui5",
                    "metaui",
                    "library-preload.js"
                );
                const preloadPath = fs.existsSync(buildPath)
                    ? buildPath
                    : fs.existsSync(prepPath)
                      ? prepPath
                      : null;
                if (!preloadPath) {
                    return null;
                }
                return fs.statSync(preloadPath).size / 1024;
            }
        ]
    ]);

    const mdFiles = collectAllTrackedMarkdownFiles(collectAuditedMarkdownFiles([]));
    const now = new Date();
    const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    let liveCount = 0;
    let timestampedCount = 0;
    let deferredCount = 0;
    let oldestDays = 0;

    for (const full of mdFiles) {
        const relMd = path.relative(ROOT_DIR, full).replace(/\\/g, "/");
        const lines = fs.readFileSync(full, "utf8").split(/\r?\n/);
        lines.forEach((line, idx) => {
            const lineNo = idx + 1;
            const scanLine = line.replace(/`[^`]*`/g, (m) => " ".repeat(m.length));
            const rawMarkers = scanLine.matchAll(/<!--\s*DOC_MEASURE:([\s\S]*?)-->/g);
            for (const rm of rawMarkers) {
                const inner = rm[1].trim();
                const firstSpace = inner.search(/\s/);
                if (firstSpace === -1) {
                    violations.push(
                        `[DOC_MEASURE] ${relMd}:${lineNo} marker 'DOC_MEASURE:${inner}' is missing attributes.`
                    );
                    continue;
                }
                const key = inner.slice(0, firstSpace).trim();
                const attrText = inner.slice(firstSpace + 1).trim();
                const attrs = parseDocMeasureAttrs(attrText);

                const afterIdx = rm.index + rm[0].length;
                const tail = line.slice(afterIdx);
                const numMatch = tail.match(/^[`*]*(\d+(?:\.\d+)?)/);
                if (!numMatch) {
                    violations.push(
                        `[DOC_MEASURE] ${relMd}:${lineNo} marker 'DOC_MEASURE:${key}' is not immediately followed by a number.`
                    );
                    continue;
                }
                const claimed = Number(numMatch[1]);

                if (!attrs.source || !attrs.source.trim()) {
                    violations.push(
                        `[DOC_MEASURE] ${relMd}:${lineNo} marker 'DOC_MEASURE:${key}' is missing a 'source=' attribute.`
                    );
                    continue;
                }

                if (attrs.tolerance !== undefined) {
                    if (!liveMeasurements.has(key)) {
                        violations.push(
                            `[DOC_MEASURE] ${relMd}:${lineNo} references unknown live DOC_MEASURE key '${key}'.`
                        );
                        continue;
                    }
                    const actual = liveMeasurements.get(key)();
                    if (actual === null) {
                        // The marker is present and well-formed; only the artifact it measures is absent.
                        // `npm run lint` deliberately runs ahead of `npm run build` so that static failures
                        // are cheap, so failing here would break a lint on a fresh checkout and in CI.
                        // Count it and report the deferral out loud - verify.yml re-runs lint after the
                        // build, where the measurement is enforced for real.
                        liveCount++;
                        deferredCount++;
                        continue;
                    }
                    const pctMatch = attrs.tolerance.match(/^(\d+(?:\.\d+)?)%$/);
                    const absMatch = attrs.tolerance.match(/^(\d+(?:\.\d+)?)$/);
                    if (!pctMatch && !absMatch) {
                        violations.push(
                            `[DOC_MEASURE] ${relMd}:${lineNo} has invalid tolerance '${attrs.tolerance}' on 'DOC_MEASURE:${key}'.`
                        );
                        continue;
                    }
                    const maxDelta = pctMatch ? (Number(pctMatch[1]) / 100) * actual : Number(absMatch[1]);
                    liveCount++;
                    if (Math.abs(claimed - actual) > maxDelta) {
                        violations.push(
                            `[DOC_MEASURE] ${relMd}:${lineNo} claims ${key}=${claimed} but live measurement is ${actual.toFixed(2)} (outside tolerance ${attrs.tolerance}).`
                        );
                    }
                } else if (attrs.measured !== undefined && attrs.maxAgeDays !== undefined) {
                    const dateMatch = attrs.measured.match(/^(\d{4})-(\d{2})-(\d{2})$/);
                    const maxAgeMatch = attrs.maxAgeDays.match(/^\d+$/);
                    if (!dateMatch || !maxAgeMatch) {
                        violations.push(
                            `[DOC_MEASURE] ${relMd}:${lineNo} marker 'DOC_MEASURE:${key}' has malformed 'measured=' or 'maxAgeDays=' attribute.`
                        );
                        continue;
                    }
                    const year = Number(dateMatch[1]);
                    const month = Number(dateMatch[2]);
                    const day = Number(dateMatch[3]);
                    const measuredDate = new Date(year, month - 1, day);
                    if (
                        measuredDate.getFullYear() !== year ||
                        measuredDate.getMonth() !== month - 1 ||
                        measuredDate.getDate() !== day
                    ) {
                        violations.push(
                            `[DOC_MEASURE] ${relMd}:${lineNo} marker 'DOC_MEASURE:${key}' has invalid calendar date '${attrs.measured}'.`
                        );
                        continue;
                    }
                    const ageDays = Math.floor((todayMidnight - measuredDate.getTime()) / 86400000);
                    const maxAgeDays = Number(attrs.maxAgeDays);
                    timestampedCount++;
                    if (ageDays < 0) {
                        violations.push(
                            `[DOC_MEASURE] ${relMd}:${lineNo} measurement '${key}' carries a future date (${attrs.measured}).`
                        );
                    } else if (ageDays > maxAgeDays) {
                        violations.push(
                            `[DOC_MEASURE] ${relMd}:${lineNo} measurement '${key}' is ${ageDays} days old (measured ${attrs.measured}, maxAgeDays=${maxAgeDays}). Re-run '${attrs.source}' and update.`
                        );
                    } else if (ageDays > oldestDays) {
                        oldestDays = ageDays;
                    }
                } else {
                    violations.push(
                        `[DOC_MEASURE] ${relMd}:${lineNo} marker 'DOC_MEASURE:${key}' must specify either 'tolerance=' or both 'measured=YYYY-MM-DD' and 'maxAgeDays=N'.`
                    );
                }
            }
        });
    }

    if (liveCount < 2 || timestampedCount < 1) {
        violations.push(
            `[DOC_MEASURE] Expected at least 2 live and 1 timestamped DOC_MEASURE markers across documentation, but found ${liveCount} live and ${timestampedCount} timestamped.`
        );
    }

    return { liveCount, timestampedCount, oldestDays, deferredCount };
}

function runStaticQualityGate() {
    console.log(`\n============================================================`);
    console.log(`Running Static Architectural & AST Lint Gate (src/, scripts/, test/)`);
    console.log(`============================================================`);

    const tsFiles = collectTsFiles(SRC_DIR);
    const scriptFiles = collectSourceFiles(SCRIPTS_DIR, [".ts", ".js"]);
    const testFiles = collectSourceFiles(TEST_DIR, [".ts", ".js"]);
    const violations = [];

    for (const file of tsFiles) {
        const rel = path.relative(ROOT_DIR, file).replace(/\\/g, "/");
        const content = fs.readFileSync(file, "utf8");
        const lines = content.split(/\r?\n/);

        // 1. AST Lint Gate (no-explicit-any, no-empty catch incl. comment-only, no-console)
        runAstLintOnFile(file, rel, content, false, violations);

        // 2. @file and @description header check
        if (!content.includes("@file") || !content.includes("@description")) {
            violations.push(`[HEADER_JSDOC] ${rel} is missing @file or @description header.`);
        }

        // 3. Max line length (<= 140 chars on executable lines), forbidden words, and unsafe casts
        lines.forEach((line, idx) => {
            const trimmed = line.trim();
            if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) {
                return;
            }
            if (line.length > 140) {
                violations.push(
                    `[MAX_LINE_LENGTH] ${rel}:${idx + 1} exceeds 140 chars (${line.length}): ${trimmed.slice(0, 80)}...`
                );
            }
            if (/\benterprise\b/i.test(line)) {
                violations.push(`[FORBIDDEN_WORD] ${rel}:${idx + 1} contains forbidden word 'enterprise': ${trimmed}`);
            }
            if (line.includes("as unknown as")) {
                const isUi5BindingCast =
                    /\bas unknown as\s+(string(\[\])?|number|boolean)\b/.test(line);
                if (!isUi5BindingCast) {
                    violations.push(`[UNSAFE_CAST] ${rel}:${idx + 1} uses non-binding 'as unknown as': ${trimmed}`);
                }
            }
        });

        // 4. Plugin folder purity check
        if (rel.includes("metaui/plugins/")) {
            const baseName = path.basename(file, ".ts");
            if (baseName !== "BasePlugin" && !baseName.endsWith("Plugin")) {
                violations.push(`[PLUGIN_PURITY] ${rel} inside plugins/ is not a *Plugin class.`);
            }
        }

        // 5. JSDoc presence before exported classes/interfaces/functions and public/protected methods
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const isExportDecl = /^\s*export\s+(abstract\s+)?(class|interface|function)\s+\w+/.test(line);
            const isMethodDecl =
                /^\s*(public|protected)\s+(static\s+|override\s+|async\s+|abstract\s+)*[a-zA-Z0-9_]+\s*\(/.test(line) &&
                !line.includes(";");
            if (isExportDecl || isMethodDecl) {
                let prevIdx = i - 1;
                while (prevIdx >= 0 && lines[prevIdx].trim() === "") {
                    prevIdx--;
                }
                const prevLine = prevIdx >= 0 ? lines[prevIdx].trim() : "";
                if (!prevLine.endsWith("*/")) {
                    violations.push(`[MISSING_JSDOC] ${rel}:${i + 1} lacks preceding JSDoc comment: ${line.trim()}`);
                }
            }
        }
    }

    // 5b. AST Lint Gate on scripts/ and test/webapp/test/
    for (const file of [...scriptFiles, ...testFiles]) {
        const rel = path.relative(ROOT_DIR, file).replace(/\\/g, "/");
        const content = fs.readFileSync(file, "utf8");
        const allowConsole = rel.startsWith("scripts/");
        runAstLintOnFile(file, rel, content, allowConsole, violations);
    }

    // 6. Verify all Markdown (.md) documents in README.md, CONTRIBUTING.md, AGENTS.md,
    //    docs/ARCHITECTURE.md, and docs/wiki/. A missing required document is a violation,
    //    and every cross-document .md link must resolve, so deleting an audited page fails here.
    const mdFilesToAudit = collectAuditedMarkdownFiles(violations);
    auditMarkdownCrossLinks(mdFilesToAudit, violations);
    for (const mdFull of mdFilesToAudit) {
        const relMd = path.relative(ROOT_DIR, mdFull).replace(/\\/g, "/");
        const mdText = fs.readFileSync(mdFull, "utf8");
        if (/\benterprise\b/i.test(mdText)) {
            violations.push(`[MD_AUDIT] ${relMd} contains forbidden word 'enterprise'.`);
        }
    }

    // 6b. Verify mock scenario JSON files contain zero occurrences of forbidden word 'enterprise'
    const scenariosDir = path.join(WEBAPP_DIR, "mockData", "scenarios");
    if (fs.existsSync(scenariosDir)) {
        for (const jsonFile of fs.readdirSync(scenariosDir).filter((f) => f.endsWith(".json"))) {
            const fullJson = path.join(scenariosDir, jsonFile);
            const relJson = path.relative(ROOT_DIR, fullJson).replace(/\\/g, "/");
            const jsonText = fs.readFileSync(fullJson, "utf8");
            if (/\benterprise\b/i.test(jsonText)) {
                violations.push(`[SCENARIO_AUDIT] ${relJson} contains forbidden word 'enterprise'.`);
            }
        }
    }

    // 6c. Verify DefaultPluginBootstrapper.ts <-> TestOracle.js parity on the REGISTRATION KEYS,
    //     not just on the set of module paths: every (type, widget) pair, layout strategy, policy
    //     condition and policy effect must map to the same module path in both files, in both
    //     directions. Comparing only the path strings let a key be renamed, or two plugins swap
    //     keys, without the gate noticing. A missing file is a violation, not a silent skip.
    const bootstrapperFile = path.join(SRC_DIR, "core", "DefaultPluginBootstrapper.ts");
    const oracleFile = path.join(WEBAPP_DIR, "test", "TestOracle.js");
    const constantsFile = path.join(SRC_DIR, "constants", "MetaUIConstants.ts");
    const parityInputs = [
        [bootstrapperFile, "src/.../core/DefaultPluginBootstrapper.ts"],
        [oracleFile, "test/webapp/test/TestOracle.js"],
        [constantsFile, "src/.../constants/MetaUIConstants.ts"]
    ];
    const missingParityInput = parityInputs.filter(([full]) => !fs.existsSync(full));
    if (missingParityInput.length > 0) {
        for (const [, label] of missingParityInput) {
            violations.push(`[ORACLE_PARITY] Cannot run the registration parity gate: '${label}' is missing.`);
        }
    } else {
        // Exported `as const` object literals in MetaUIConstants.ts (SCHEMA_TYPE, WIDGET_TYPE, ...)
        // so that registerPluginPath(SCHEMA_TYPE.STRING, WIDGET_TYPE.SELECT, ...) resolves to
        // ("string", "select") rather than to undefined.
        const constantsSf = ts.createSourceFile(
            constantsFile,
            fs.readFileSync(constantsFile, "utf8"),
            ts.ScriptTarget.Latest,
            true
        );
        const constantObjects = new Map();
        constantsSf.forEachChild(function collectConstants(node) {
            if (ts.isVariableStatement(node)) {
                for (const decl of node.declarationList.declarations) {
                    if (!ts.isIdentifier(decl.name) || !decl.initializer) continue;
                    let init = decl.initializer;
                    while (ts.isAsExpression(init) || ts.isParenthesizedExpression(init)) {
                        init = init.expression;
                    }
                    if (!ts.isObjectLiteralExpression(init)) continue;
                    const entries = new Map();
                    for (const prop of init.properties) {
                        if (
                            ts.isPropertyAssignment(prop) &&
                            (ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name)) &&
                            (ts.isStringLiteral(prop.initializer) ||
                                ts.isNoSubstitutionTemplateLiteral(prop.initializer))
                        ) {
                            entries.set(prop.name.text, prop.initializer.text);
                        }
                    }
                    constantObjects.set(decl.name.text, entries);
                }
            }
        });

        const bootSf = ts.createSourceFile(
            bootstrapperFile,
            fs.readFileSync(bootstrapperFile, "utf8"),
            ts.ScriptTarget.Latest,
            true
        );
        const constMap = new Map();
        const UNRESOLVED = Symbol("unresolved");

        function evalStringNode(node) {
            if (!node) return undefined;
            if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
                return node.text;
            }
            if (node.kind === ts.SyntaxKind.UndefinedKeyword) {
                return undefined;
            }
            if (ts.isIdentifier(node)) {
                if (node.text === "undefined") return undefined;
                return constMap.has(node.text) ? constMap.get(node.text) : UNRESOLVED;
            }
            if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression)) {
                const obj = constantObjects.get(node.expression.text);
                if (obj && obj.has(node.name.text)) return obj.get(node.name.text);
                return UNRESOLVED;
            }
            if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
                const l = evalStringNode(node.left);
                const r = evalStringNode(node.right);
                return typeof l === "string" && typeof r === "string" ? l + r : UNRESOLVED;
            }
            if (ts.isTemplateExpression(node)) {
                let acc = node.head.text;
                for (const span of node.templateSpans) {
                    const sub = evalStringNode(span.expression);
                    if (typeof sub !== "string") return UNRESOLVED;
                    acc += sub + span.literal.text;
                }
                return acc;
            }
            return UNRESOLVED;
        }

        const bootMaps = {
            PLUGIN_MAP: new Map(),
            LAYOUT_MAP: new Map(),
            POLICY_CONDITION_MAP: new Map(),
            POLICY_EFFECT_MAP: new Map()
        };
        const REGISTRARS = {
            registerPluginPath: "PLUGIN_MAP",
            registerLayoutPath: "LAYOUT_MAP",
            registerPolicyConditionPath: "POLICY_CONDITION_MAP",
            registerPolicyEffectPath: "POLICY_EFFECT_MAP"
        };

        function recordRegistration(mapName, key, modulePath, callLine) {
            if (key === UNRESOLVED || typeof key !== "string" || typeof modulePath !== "string") {
                violations.push(
                    `[ORACLE_PARITY] DefaultPluginBootstrapper.ts:${callLine} registration could not be resolved statically (key=${String(key)}, path=${String(modulePath)}).`
                );
                return;
            }
            if (bootMaps[mapName].has(key)) {
                violations.push(
                    `[ORACLE_PARITY] DefaultPluginBootstrapper.ts:${callLine} registers '${key}' twice in ${mapName}.`
                );
            }
            bootMaps[mapName].set(key, modulePath);
        }

        (function visitBoot(node) {
            if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
                const val = evalStringNode(node.initializer);
                if (typeof val === "string") {
                    constMap.set(node.name.text, val);
                }
            }
            if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
                const mapName = REGISTRARS[node.expression.name.text];
                if (mapName) {
                    const line = bootSf.getLineAndCharacterOfPosition(node.getStart(bootSf)).line + 1;
                    if (mapName === "PLUGIN_MAP") {
                        const type = evalStringNode(node.arguments[0]);
                        const widget = evalStringNode(node.arguments[1]);
                        const modulePath = evalStringNode(node.arguments[2]);
                        const key = type === UNRESOLVED || widget === UNRESOLVED ? UNRESOLVED
                            : widget === undefined ? type
                                : `${type}:${widget}`;
                        recordRegistration(mapName, key, modulePath, line);
                    } else {
                        recordRegistration(mapName, evalStringNode(node.arguments[0]), evalStringNode(node.arguments[1]), line);
                    }
                }
            }
            ts.forEachChild(node, visitBoot);
        })(bootSf);

        let oracle;
        try {
            oracle = loadTestOracle(oracleFile);
        } catch (oracleErr) {
            violations.push(`[ORACLE_PARITY] TestOracle.js could not be evaluated: ${oracleErr.message}`);
            oracle = undefined;
        }

        if (oracle) {
            for (const [mapName, bootMap] of Object.entries(bootMaps)) {
                const oracleMap = oracle[mapName];
                if (!oracleMap || typeof oracleMap !== "object") {
                    violations.push(`[ORACLE_PARITY] TestOracle.js does not export ${mapName}.`);
                    continue;
                }
                const oracleEntries = new Map(
                    Object.entries(oracleMap).map(([key, value]) => [
                        key,
                        typeof value === "string" ? value : value && value.modulePath
                    ])
                );
                for (const [key, bootPath] of bootMap) {
                    if (!oracleEntries.has(key)) {
                        violations.push(
                            `[ORACLE_PARITY] ${mapName}: key '${key}' is registered in DefaultPluginBootstrapper.ts but missing from TestOracle.js`
                        );
                    } else if (oracleEntries.get(key) !== bootPath) {
                        violations.push(
                            `[ORACLE_PARITY] ${mapName}: key '${key}' maps to '${bootPath}' in DefaultPluginBootstrapper.ts but to '${oracleEntries.get(key)}' in TestOracle.js`
                        );
                    }
                }
                for (const [key, oraclePath] of oracleEntries) {
                    if (!bootMap.has(key)) {
                        violations.push(
                            `[ORACLE_PARITY] ${mapName}: key '${key}' (-> '${oraclePath}') is in TestOracle.js but is never registered in DefaultPluginBootstrapper.ts`
                        );
                    }
                }
                if (bootMap.size !== oracleEntries.size) {
                    violations.push(
                        `[ORACLE_PARITY] ${mapName}: DefaultPluginBootstrapper.ts registers ${bootMap.size} keys but TestOracle.js declares ${oracleEntries.size}`
                    );
                }
            }
        }
    }


    // 6d. Generated control accessors must match the control metadata they came from.
    // Without this, adding a property to HOST_CONTROL_METADATA would silently ship types
    // that omit its accessors.
    const accessorGen = spawnSync(
        process.execPath,
        [path.join(ROOT_DIR, "scripts", "generate-control-accessors.js"), "--check"],
        { cwd: ROOT_DIR, encoding: "utf8" }
    );
    if (accessorGen.status !== 0) {
        const detail = `${accessorGen.stdout || ""}${accessorGen.stderr || ""}`
            .split(/\r?\n/)
            .filter((l) => l.trim() && !l.trim().startsWith("- "))
            .join(" ");
        violations.push(`[GENERATED_ACCESSORS] ${detail.trim() || "generate-control-accessors.js --check failed."}`);
    }

    // 6e. Generated AI schema cheat sheet must match ISchema.ts + MetaUIConstants.ts + DefaultPluginBootstrapper.ts.
    const cheatSheetGen = spawnSync(
        process.execPath,
        [path.join(ROOT_DIR, "scripts", "generate-ai-cheatsheet.js"), "--check"],
        { cwd: ROOT_DIR, encoding: "utf8" }
    );
    if (cheatSheetGen.status !== 0) {
        const detail = `${cheatSheetGen.stdout || ""}${cheatSheetGen.stderr || ""}`
            .split(/\r?\n/)
            .filter((l) => l.trim() && !l.trim().startsWith("- "))
            .join(" ");
        violations.push(`[GENERATED_CHEATSHEET] ${detail.trim() || "generate-ai-cheatsheet.js --check failed."}`);
    }

    // 6f. ScenarioRunner.controller.js must derive scenario lists from index.json without a hardcoded whitelist.
    const runnerCtrlPath = path.join(ROOT_DIR, "test", "webapp", "controller", "ScenarioRunner.controller.js");
    if (fs.existsSync(runnerCtrlPath)) {
        const runnerSrc = fs.readFileSync(runnerCtrlPath, "utf8");
        if (/\bwhitelist\b/.test(runnerSrc) || /hybrid_inference|full_inference|deep_structure|ultra_complex_structure|pbre_scenario/.test(runnerSrc)) {
            violations.push(
                "[SCENARIO_WHITELIST] test/webapp/controller/ScenarioRunner.controller.js contains a hardcoded scenario whitelist; derive the list from test/webapp/mockData/scenarios/index.json instead."
            );
        }
    }

    // 7. AST Symbol-Existence Gate over docs/wiki/*.md, README.md, and docs/ARCHITECTURE.md (Phase 16.1).
    //    A `Class.method()` citation is resolved against THAT class (and its resolvable bases),
    //    not against the flat set of every identifier in src/.
    const { astSymbols, containers } = buildSymbolIndex(tsFiles);
    const symbolAuditFiles = mdFilesToAudit;
    let docSymbolAllowlistHits = 0;

    function isKnownOrAllowedSymbol(sym) {
        if (DOC_SYMBOL_ALLOWLIST.has(sym) && !astSymbols.has(sym)) {
            docSymbolAllowlistHits++;
            return true;
        }
        return astSymbols.has(sym) || DOC_SYMBOL_ALLOWLIST.has(sym);
    }

    /**
     * Checks `Qualifier.member` against the qualifier's own declaration. Returns a violation
     * message, or undefined when the citation resolves (or the qualifier is not declared in src/,
     * in which case the caller falls back to the allowlist/global check).
     */
    function checkQualifiedMember(relMd, lineNo, raw, qualifier, member) {
        const owner = resolveContainerMembers(containers, qualifier);
        if (!owner.declared) return undefined;
        if (owner.members.has(member)) return undefined;
        if (DOC_SYMBOL_ALLOWLIST.has(`${qualifier}.${member}`)) {
            docSymbolAllowlistHits++;
            return undefined;
        }
        const hint = owner.open
            ? " (its base class is outside src/; add an explicit allowlist entry if it is inherited)"
            : "";
        return `[DOC_SYMBOL] ${relMd}:${lineNo} cites '${raw}' but '${member}' is not a member of '${qualifier}'${hint}.`;
    }

    for (const mdFull of symbolAuditFiles) {
        const relMd = path.relative(ROOT_DIR, mdFull).replace(/\\/g, "/");
        const mdLines = fs.readFileSync(mdFull, "utf8").split(/\r?\n/);
        let inCodeFence = false;

        mdLines.forEach((line, idx) => {
            const lineNo = idx + 1;
            if (/^\s*```/.test(line)) {
                inCodeFence = !inCodeFence;
                return;
            }
            if (inCodeFence) return;

            const backtickMatches = line.matchAll(/`([^`]+)`/g);
            for (const m of backtickMatches) {
                const raw = m[1].trim();
                if (!raw) continue;

                // 1. Source file path: src/...
                if (raw.startsWith("src/") && !raw.endsWith("/") && !raw.includes("*")) {
                    const targetPath = path.join(ROOT_DIR, raw);
                    if (!fs.existsSync(targetPath)) {
                        violations.push(
                            `[DOC_SYMBOL] ${relMd}:${lineNo} cites non-existent source path '${raw}'.`
                        );
                    }
                    continue;
                }

                // 2. Method or qualified call: methodName(...) or ClassName.methodName(...)
                const callMatch = raw.match(/^(?:([A-Za-z_$][A-Za-z0-9_$]*)\.)?([a-zA-Z_$][A-Za-z0-9_$]*)\([^)]*\)$/);
                if (callMatch) {
                    const qualifier = callMatch[1];
                    const methodName = callMatch[2];
                    if (DOC_SYMBOL_ALLOWLIST.has(`${qualifier}.${methodName}`) || DOC_SYMBOL_ALLOWLIST.has(raw)) {
                        docSymbolAllowlistHits++;
                        continue;
                    }
                    if (qualifier && /^[A-Z]/.test(qualifier)) {
                        if (!isKnownOrAllowedSymbol(qualifier)) {
                            violations.push(
                                `[DOC_SYMBOL] ${relMd}:${lineNo} cites unknown class/object '${qualifier}' in '${raw}'.`
                            );
                            continue;
                        }
                        const memberViolation = checkQualifiedMember(relMd, lineNo, raw, qualifier, methodName);
                        if (memberViolation) {
                            violations.push(memberViolation);
                            continue;
                        }
                        if (containers.has(qualifier)) continue;
                    }
                    if (!isKnownOrAllowedSymbol(methodName)) {
                        violations.push(
                            `[DOC_SYMBOL] ${relMd}:${lineNo} cites unknown method/function '${methodName}()' in '${raw}'.`
                        );
                    }
                    continue;
                }

                // 3. Qualified member access: ClassName.memberName (excluding file extensions)
                const memberMatch = raw.match(/^([A-Z][A-Za-z0-9_]*)\.([a-zA-Z_$][A-Za-z0-9_$]*)$/);
                if (
                    memberMatch &&
                    !["ts", "js", "md", "json", "yaml", "html", "css"].includes(memberMatch[2])
                ) {
                    const cls = memberMatch[1];
                    const mem = memberMatch[2];
                    if (DOC_SYMBOL_ALLOWLIST.has(raw)) {
                        docSymbolAllowlistHits++;
                        continue;
                    }
                    if (!isKnownOrAllowedSymbol(cls)) {
                        violations.push(
                            `[DOC_SYMBOL] ${relMd}:${lineNo} cites unknown qualified symbol '${raw}'.`
                        );
                        continue;
                    }
                    const memberViolation = checkQualifiedMember(relMd, lineNo, raw, cls, mem);
                    if (memberViolation) {
                        violations.push(memberViolation);
                        continue;
                    }
                    if (!containers.has(cls) && !isKnownOrAllowedSymbol(mem)) {
                        violations.push(
                            `[DOC_SYMBOL] ${relMd}:${lineNo} cites unknown qualified symbol '${raw}'.`
                        );
                    }
                    continue;
                }

                // 4. ClassName / IInterfaceName / TypeName (with optional generic <...> or array [])
                const cleanId = raw.replace(/<[^>]+>$/, "").replace(/\[\]$/, "");
                const isInterfaceLike = /^I[A-Z][a-zA-Z0-9_]*$/.test(cleanId);
                const isPascalSymbol = /^[A-Z][a-z0-9]+[A-Z][A-Za-z0-9_]*$/.test(cleanId);
                if (isInterfaceLike || isPascalSymbol) {
                    if (!isKnownOrAllowedSymbol(cleanId)) {
                        violations.push(
                            `[DOC_SYMBOL] ${relMd}:${lineNo} cites unknown symbol '${raw}'.`
                        );
                    }
                }
            }
        });
    }

    // Structural gates: one rule, one place. Each is defined above with the divergence it
    // exists to catch, and each is proven to fire by scripts/prove-structural-gates.js.
    const { catchExemptions, singleWalkerExemptions } = runStructuralGates(violations, tsFiles);

    // Documentation gates: two-way [DOC_SYMBOL] (src/ -> docs/), [DOC_COUNT], [DOC_CODE], and [DOC_MEASURE].
    runReverseDocSymbolGate(violations, tsFiles, symbolAuditFiles);
    runDocCountGate(violations, tsFiles, singleWalkerExemptions, catchExemptions);
    runDocCodeGate(violations, tsFiles);
    const docMeasureSummary = runDocMeasureGate(violations);

    if (violations.length > 0) {
        console.error(`  [FAIL] Static Quality Gate found ${violations.length} violation(s):`);
        for (const v of violations) {
            console.error(`    - ${v}`);
        }
        throw new Error(`Static Architectural Quality Gate failed with ${violations.length} violation(s).`);
    }

    const exemptions = countGateExemptions(
        tsFiles,
        scriptFiles,
        docSymbolAllowlistHits,
        catchExemptions,
        singleWalkerExemptions
    );
    console.log(
        `  [PASS] Audited ${tsFiles.length} src/ .ts files (0 violations, <=140 chars/line, full JSDoc, 0 any, 0 console, 0 empty catch) and ${scriptFiles.length + testFiles.length} scripts/ + test/ .js files (AST lint).`
    );
    console.log(`  [PASS] Gate exemptions: ${exemptions.describe()}`);
    console.log(
        `  [PASS] DOC_MEASURE: ${docMeasureSummary.liveCount} live checks${docMeasureSummary.deferredCount > 0 ? ` (${docMeasureSummary.deferredCount} deferred - no dist/, run 'npm run build' then lint again)` : ""}, ${docMeasureSummary.timestampedCount} timestamped measurements (oldest: ${docMeasureSummary.oldestDays} days)`
    );
}

function parseBootstrapperSource(bootstrapperFile) {
    const bootText = fs.readFileSync(bootstrapperFile, "utf8");
    const bootSf = ts.createSourceFile(bootstrapperFile, bootText, ts.ScriptTarget.Latest, true);
    const constMap = new Map();
    const counts = {
        pluginMappings: 0,
        layouts: 0,
        policyConditions: 0,
        policyEffects: 0
    };

    function evalStringNode(node) {
        if (!node) return undefined;
        if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
            return node.text;
        }
        if (ts.isIdentifier(node)) {
            return constMap.get(node.text);
        }
        if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
            const l = evalStringNode(node.left);
            const r = evalStringNode(node.right);
            return l !== undefined && r !== undefined ? l + r : undefined;
        }
        if (ts.isTemplateExpression(node)) {
            let acc = node.head.text;
            for (const span of node.templateSpans) {
                const sub = evalStringNode(span.expression);
                if (sub === undefined) return undefined;
                acc += sub + span.literal.text;
            }
            return acc;
        }
        return undefined;
    }

    function visit(node) {
        if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
            const val = evalStringNode(node.initializer);
            if (typeof val === "string") {
                constMap.set(node.name.text, val);
            }
        }
        if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
            const method = node.expression.name.text;
            if (method === "registerPluginPath") counts.pluginMappings++;
            else if (method === "registerLayoutPath") counts.layouts++;
            else if (method === "registerPolicyConditionPath") counts.policyConditions++;
            else if (method === "registerPolicyEffectPath") counts.policyEffects++;
        }
        ts.forEachChild(node, visit);
    }
    visit(bootSf);
    return counts;
}

function parsePipelineManagerSource(pipelineFile) {
    const text = fs.readFileSync(pipelineFile, "utf8");
    const sf = ts.createSourceFile(pipelineFile, text, ts.ScriptTarget.Latest, true);
    const counts = { validators: 0, formatters: 0, parsers: 0 };
    function visit(node) {
        if (
            ts.isCallExpression(node) &&
            ts.isPropertyAccessExpression(node.expression) &&
            node.expression.name.text === "register" &&
            ts.isPropertyAccessExpression(node.expression.expression)
        ) {
            const targetProp = node.expression.expression.name.text;
            if (targetProp === "validators") counts.validators++;
            else if (targetProp === "formatters") counts.formatters++;
            else if (targetProp === "parsers") counts.parsers++;
        }
        ts.forEachChild(node, visit);
    }
    visit(sf);
    return counts;
}

// ------------------------------------------------------------------------------------------------
// Static QUnit assertion model.
//
// `npm test` compares this count against the live headless-Chromium run and fails on any difference
// ([METRICS_DRIFT]). That is what makes the published assertion count impossible to fabricate: an
// assertion that never executes shows up as static > live, and one the model cannot see shows up as
// live > static. So the model has to understand the constructs real tests are written with.
//
// What it understands
//   assert.*(...)                  one assertion; async()/expect()/timeout() are not assertions
//   forEach/map/filter/flatMap     body x the collection's length
//   for...of / for...in            body x the collection's length / the object's key count
//   for (i = a; i < b; i++)        body x the trip count, when the bounds are statically known
//   try / catch / finally          try + finally; catch only when the try path asserts nothing,
//                                  because one run takes one of those two paths
//   if / else, ?:, switch          ONE branch, for the same reason
//   callbacks that are not loops   body once (then/catch/setTimeout/event handlers)
//   local helper functions         body at each call site, not once at the declaration
//   a const/var in an enclosing    resolved to its initializer, unless the name is re-assigned or
//     scope                        its length is mutated
//   TestOracle-derived expressions evaluated for real against TestOracle.js, so
//                                  Object.keys(TestOracle.PLUGIN_MAP).filter(...) is exact rather
//                                  than matched by name
//   conditions inside such a loop  evaluated per element, so `if (key.indexOf(":default") === -1)`
//                                  counts the elements that match instead of all of them
//
// Evaluating "for real" is bounded syntactically, not by a clock: see isCheaplyEvaluable(). No
// `new`, no regex, no loop, and calls only to pure Object/Array/String members, so the count is the
// same on a busy machine as on an idle one and the counter never runs a test's own hostile fixture.
//
// What it refuses
//   Anything else that would change the number - a loop over a value only the browser can produce,
//   a while loop, a short-circuiting some()/every() that asserts, a recursive helper - is reported
//   by file, line and test name instead of being guessed. DECLARED_COLLECTIONS is the only escape
//   hatch and every entry in it has to say where its number comes from.
// ------------------------------------------------------------------------------------------------
function computeQUnitAssertionsFromAst() {
    const oracle = loadTestOracle(path.join(TEST_DIR, "TestOracle.js"));

    const scenariosDir = path.join(WEBAPP_DIR, "mockData", "scenarios");
    const kitchenSinkJson = JSON.parse(fs.readFileSync(path.join(scenariosDir, "kitchen_sink.json"), "utf8"));
    const kitchenSinkPropCount = Object.keys(kitchenSinkJson.schema.properties).length;

    function countOpenApiTargetsInScenario(scenarioFileName) {
        const scenario = JSON.parse(fs.readFileSync(path.join(scenariosDir, scenarioFileName), "utf8"));
        const spec = scenario.schema;
        let targets = 0;
        if (spec.paths) {
            for (const p of Object.values(spec.paths)) {
                if (!p || typeof p !== "object") continue;
                for (const op of Object.values(p)) {
                    if (!op || typeof op !== "object") continue;
                    const hasV3Body = Boolean(
                        op.requestBody && op.requestBody.content && op.requestBody.content["application/json"]
                    );
                    const hasV2Body = Array.isArray(op.parameters) && op.parameters.some((pr) => pr && pr.in === "body");
                    if (hasV3Body || hasV2Body) targets++;
                }
            }
        }
        const defs = spec.definitions || (spec.components && spec.components.schemas) || {};
        targets += Object.keys(defs).length;
        return targets;
    }

    const openApiV2Targets = countOpenApiTargetsInScenario("openapi_v2_complex.json");
    const openApiV3Targets = countOpenApiTargetsInScenario("openapi_v3_complex.json");

    // The only collections the model takes on trust, because the browser produces them from data the
    // AST cannot reach. `perIteration` sizes one pass of the loop; `total` sizes every pass the
    // enclosing loop makes, for a collection whose size differs per outer iteration. Both are derived
    // from the same mock data the test loads, never typed in by hand.
    const DECLARED_COLLECTIONS = new Map([
        [
            "AllJourneys.js::schemaKeys",
            {
                perIteration: kitchenSinkPropCount,
                why: "Object.keys() of the kitchen_sink scenario schema, read from mockData/scenarios/kitchen_sink.json"
            }
        ],
        [
            "AllJourneys.js::OpenApiExtractor.extractTargets(scenario.schema)",
            {
                total: openApiV2Targets + openApiV3Targets,
                why:
                    "extractTargets() runs in the browser and yields a different number of targets per scenario; " +
                    "only openapi_v2_complex and openapi_v3_complex yield any, and their JSON gives the total"
            }
        ]
    ]);

    // Identifiers an expression may reference and still be evaluated for real. TestOracle is the test
    // suite's own source of truth, already loaded above; the rest are pure built-ins.
    const SAFE_EVAL_GLOBALS = new Set([
        "TestOracle", "Object", "Array", "JSON", "String", "Number", "Boolean", "Math", "Date",
        "undefined", "NaN", "Infinity", "RegExp", "isNaN", "parseInt", "parseFloat"
    ]);
    // Methods that run their callback once per element.
    const LOOPING_METHODS = new Set(["forEach", "map", "flatMap", "filter"]);
    // Methods that run their callback an input-dependent number of times.
    const UNCOUNTABLE_CALLBACK_METHODS = new Set([
        "some", "every", "find", "findIndex", "findLast", "findLastIndex", "sort", "reduce", "reduceRight"
    ]);
    const LENGTH_CHANGING_METHODS = new Set(["push", "pop", "shift", "unshift", "splice", "fill", "copyWithin"]);
    // Members the model may call while evaluating an expression for real: pure, and cheap in the size
    // of the source it is reading.
    const PURE_CALL_MEMBERS = new Set([
        "keys", "values", "entries", "assign", "freeze", "getOwnPropertyNames", "hasOwnProperty",
        "isArray", "parse", "stringify", "filter", "map", "flatMap", "slice", "concat", "join", "split",
        "indexOf", "lastIndexOf", "includes", "some", "every", "find", "findIndex", "sort", "reverse",
        "toLowerCase", "toUpperCase", "trim", "charAt", "startsWith", "endsWith", "substring", "toString"
    ]);
    const NON_ASSERTING_ASSERT_METHODS = new Set(["async", "expect", "timeout"]);

    const refusals = [];

    function analyseQUnitFile(filePath) {
        const content = fs.readFileSync(filePath, "utf8");
        const sf = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
        const fileName = path.basename(filePath);
        let currentTest = "(file scope)";
        const inlining = new Set();
        const assertingFunctions = new Map();

        // The model asks the same questions of the same nodes many times over - once per element of
        // every loop it unrolls - so each answer that depends only on the node is cached.
        const textCache = new Map();
        const freeIdentifierCache = new Map();
        const reboundCache = new Map();
        const scriptCache = new Map();
        const evalContext = vm.createContext({ TestOracle: oracle });

        const lineOf = (node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
        const textOf = (node) => {
            let text = textCache.get(node);
            if (text === undefined) {
                text = node.getText(sf).replace(/\s+/g, " ").trim();
                textCache.set(node, text);
            }
            return text;
        };
        const shortTextOf = (node) => {
            const t = textOf(node);
            return t.length > 90 ? `${t.slice(0, 87)}...` : t;
        };

        function refuse(node, what) {
            const message = `${fileName}:${lineOf(node)} in QUnit.test "${currentTest}": cannot statically count ${what}`;
            if (!refusals.includes(message)) refusals.push(message);
        }

        // ---- scope-aware resolution -------------------------------------------------------------

        function scopeStatements(node) {
            if (ts.isSourceFile(node) || ts.isBlock(node) || ts.isModuleBlock(node)) return node.statements;
            if (ts.isCaseClause(node) || ts.isDefaultClause(node)) return node.statements;
            return undefined;
        }

        // Every name a scope assigns to, or grows with push()/splice(), in one walk per scope.
        function reboundNames(scope) {
            let names = reboundCache.get(scope);
            if (names) return names;
            names = new Set();
            const walk = (node) => {
                if (
                    ts.isBinaryExpression(node) &&
                    ts.isIdentifier(node.left) &&
                    node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
                    node.operatorToken.kind <= ts.SyntaxKind.LastAssignment
                ) {
                    names.add(node.left.text);
                }
                if (
                    ts.isCallExpression(node) &&
                    ts.isPropertyAccessExpression(node.expression) &&
                    ts.isIdentifier(node.expression.expression) &&
                    LENGTH_CHANGING_METHODS.has(node.expression.name.text)
                ) {
                    names.add(node.expression.expression.text);
                }
                ts.forEachChild(node, walk);
            };
            walk(scope);
            reboundCache.set(scope, names);
            return names;
        }

        // The single initializer `name` was declared with in the nearest enclosing scope that declares
        // it, or undefined. A name declared twice in one scope, assigned to after its declaration, or
        // grown with push()/splice() is deliberately left unresolved: guessing at a mutated array's
        // length is exactly the failure this gate exists to catch.
        function resolveDeclaration(ident) {
            const name = ident.text;
            let scope = ident.parent;
            while (scope) {
                const statements = scopeStatements(scope);
                if (statements) {
                    const found = [];
                    for (const statement of statements) {
                        if (!ts.isVariableStatement(statement)) continue;
                        for (const decl of statement.declarationList.declarations) {
                            if (ts.isIdentifier(decl.name) && decl.name.text === name) found.push(decl);
                        }
                    }
                    if (found.length > 1) return undefined;
                    if (found.length === 1) {
                        return reboundNames(scope).has(name) ? undefined : found[0].initializer;
                    }
                }
                scope = scope.parent;
            }
            return undefined;
        }

        // ---- evaluation against the real TestOracle ----------------------------------------------

        function freeIdentifiers(expr) {
            const cached = freeIdentifierCache.get(expr);
            if (cached) return cached;
            const bound = new Set();
            const used = new Set();
            const walk = (node) => {
                if (ts.isFunctionExpression(node) || ts.isArrowFunction(node) || ts.isFunctionDeclaration(node)) {
                    for (const param of node.parameters) {
                        if (ts.isIdentifier(param.name)) bound.add(param.name.text);
                    }
                }
                if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) bound.add(node.name.text);
                if (ts.isIdentifier(node)) {
                    const parent = node.parent;
                    const isMemberName = parent && ts.isPropertyAccessExpression(parent) && parent.name === node;
                    const isKeyName =
                        parent &&
                        (ts.isPropertyAssignment(parent) || ts.isMethodDeclaration(parent)) &&
                        parent.name === node;
                    if (!isMemberName && !isKeyName) used.add(node.text);
                }
                ts.forEachChild(node, walk);
            };
            walk(expr);
            const free = [...used].filter((name) => !bound.has(name));
            freeIdentifierCache.set(expr, free);
            return free;
        }

        // Only expressions that are cheap and bounded by construction are ever run: no `new`, no regex,
        // no loop, and calls only to a short list of pure Object/Array/String members. That bound is
        // syntactic rather than a wall-clock timeout, so the count cannot change with how busy the
        // machine is - and the counter never executes a test's own catastrophic-backtracking fixture.
        function isCheaplyEvaluable(node) {
            let cheap = true;
            const walk = (child) => {
                if (!cheap) return;
                if (
                    child.kind === ts.SyntaxKind.RegularExpressionLiteral ||
                    ts.isNewExpression(child) ||
                    ts.isWhileStatement(child) ||
                    ts.isDoStatement(child) ||
                    ts.isForStatement(child) ||
                    ts.isForOfStatement(child) ||
                    ts.isForInStatement(child)
                ) {
                    cheap = false;
                    return;
                }
                if (ts.isCallExpression(child)) {
                    const callee = child.expression;
                    const member = ts.isPropertyAccessExpression(callee) ? callee.name.text : undefined;
                    if (!member || !PURE_CALL_MEMBERS.has(member)) {
                        cheap = false;
                        return;
                    }
                }
                ts.forEachChild(child, walk);
            };
            walk(node);
            return cheap;
        }

        // Runs `source` in one reused context holding nothing but TestOracle and the names the caller
        // bound. One context and one compiled script per distinct expression keeps the model's cost
        // flat even when it unrolls a loop over every entry in the oracle.
        function runSandboxed(source, bindings) {
            let script = scriptCache.get(source);
            if (!script) {
                script = new vm.Script(source);
                scriptCache.set(source, script);
            }
            const names = Object.keys(bindings);
            for (const name of names) evalContext[name] = bindings[name];
            try {
                return { ok: true, value: script.runInContext(evalContext) };
            } catch (evalError) {
                void evalError;
                return { ok: false };
            } finally {
                for (const name of names) delete evalContext[name];
            }
        }

        // Evaluates `expr` against the real TestOracle plus whatever the enclosing loop has bound, so
        // an oracle-derived list or a condition over one is exact rather than guessed. An expression
        // that reaches any further fails the identifier check and stays unresolved.
        function evaluateExpression(expr, env) {
            if (!expr || !isCheaplyEvaluable(expr)) return { ok: false };
            const bindings = {};
            for (const name of freeIdentifiers(expr)) {
                if (SAFE_EVAL_GLOBALS.has(name)) continue;
                const bound = env.get(name);
                if (bound && bound.hasValue) {
                    bindings[name] = bound.value;
                    continue;
                }
                return { ok: false };
            }
            // The raw text, not the whitespace-normalised one: a string or template literal in the
            // expression must evaluate to exactly what the browser sees.
            return runSandboxed(`(${expr.getText(sf)})`, bindings);
        }

        // ---- collection sizing --------------------------------------------------------------------

        function resolveObjectKeyCount(expr, env, depth) {
            if (!expr || depth > 10) return null;
            const evaluated = evaluateExpression(expr, env);
            if (evaluated.ok && evaluated.value && typeof evaluated.value === "object") {
                return Object.keys(evaluated.value).length;
            }
            if (ts.isObjectLiteralExpression(expr)) {
                const dynamic = expr.properties.some(
                    (prop) => ts.isSpreadAssignment(prop) || (prop.name && ts.isComputedPropertyName(prop.name))
                );
                return dynamic ? null : expr.properties.length;
            }
            if (ts.isIdentifier(expr)) {
                const init = resolveDeclaration(expr);
                return init ? resolveObjectKeyCount(init, env, depth + 1) : null;
            }
            return null;
        }

        // { perIteration } sizes one pass of the enclosing loop; { total } sizes all of them.
        // `values` is present only when the real elements are known, which lets a condition inside the
        // loop be decided per element instead of guessed.
        function resolveCollection(expr, env, depth) {
            if (!expr || depth > 10) return null;
            const declared = DECLARED_COLLECTIONS.get(`${fileName}::${textOf(expr)}`);
            if (declared) {
                return declared.total !== undefined
                    ? { total: declared.total }
                    : { perIteration: declared.perIteration };
            }
            const evaluated = evaluateExpression(expr, env);
            if (evaluated.ok && Array.isArray(evaluated.value)) {
                return { perIteration: evaluated.value.length, values: evaluated.value };
            }
            if (ts.isParenthesizedExpression(expr)) return resolveCollection(expr.expression, env, depth + 1);
            if (ts.isArrayLiteralExpression(expr)) {
                if (expr.elements.some((element) => ts.isSpreadElement(element))) return null;
                return { perIteration: expr.elements.length };
            }
            if (ts.isIdentifier(expr)) {
                const bound = env.get(expr.text);
                if (bound && typeof bound.length === "number") return { perIteration: bound.length };
                const init = resolveDeclaration(expr);
                return init ? resolveCollection(init, env, depth + 1) : null;
            }
            if (ts.isCallExpression(expr) && ts.isPropertyAccessExpression(expr.expression)) {
                const method = expr.expression.name.text;
                const receiver = expr.expression.expression;
                if (
                    (method === "keys" || method === "values" || method === "entries") &&
                    ts.isIdentifier(receiver) &&
                    receiver.text === "Object"
                ) {
                    const keyCount = resolveObjectKeyCount(expr.arguments[0], env, depth + 1);
                    return keyCount === null ? null : { perIteration: keyCount };
                }
                const lengthPreserving =
                    method === "map" ||
                    method === "sort" ||
                    method === "reverse" ||
                    (method === "slice" && expr.arguments.length === 0);
                if (lengthPreserving) {
                    const base = resolveCollection(receiver, env, depth + 1);
                    return base && typeof base.perIteration === "number" ? { perIteration: base.perIteration } : null;
                }
                if (method === "concat") {
                    const base = resolveCollection(receiver, env, depth + 1);
                    if (!base || typeof base.perIteration !== "number") return null;
                    let total = base.perIteration;
                    for (const argument of expr.arguments) {
                        const part = resolveCollection(argument, env, depth + 1);
                        if (!part || typeof part.perIteration !== "number") return null;
                        total += part.perIteration;
                    }
                    return { perIteration: total };
                }
            }
            return null;
        }

        // ---- counting -------------------------------------------------------------------------------

        const zero = () => ({ scaled: 0, fixed: 0 });
        const addInto = (acc, part) => {
            acc.scaled += part.scaled;
            acc.fixed += part.fixed;
            return acc;
        };
        const totalOf = (part) => part.scaled + part.fixed;
        // A loop repeats the part of its body that scales with it; a part whose total the model already
        // knows (a DECLARED_COLLECTIONS `total`) is already the whole number and must not be repeated.
        const repeat = (part, times) => ({ scaled: part.scaled * times, fixed: part.fixed });

        function isAssertCall(node) {
            if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) return false;
            const receiver = node.expression.expression;
            const onAssert =
                (ts.isIdentifier(receiver) && receiver.text === "assert") ||
                (ts.isPropertyAccessExpression(receiver) && receiver.name.text === "assert");
            return onAssert && !NON_ASSERTING_ASSERT_METHODS.has(node.expression.name.text);
        }

        function functionBodyOf(node) {
            if (!node) return undefined;
            if (ts.isFunctionExpression(node) || ts.isArrowFunction(node) || ts.isFunctionDeclaration(node)) {
                return node;
            }
            if (ts.isIdentifier(node)) {
                const init = resolveDeclaration(node);
                if (init && (ts.isFunctionExpression(init) || ts.isArrowFunction(init))) return init;
                const declared = resolveFunctionDeclaration(node);
                if (declared) return declared;
            }
            return undefined;
        }

        function resolveFunctionDeclaration(ident) {
            let scope = ident.parent;
            while (scope) {
                const statements = scopeStatements(scope);
                if (statements) {
                    for (const statement of statements) {
                        if (
                            ts.isFunctionDeclaration(statement) &&
                            statement.name &&
                            statement.name.text === ident.text
                        ) {
                            return statement;
                        }
                    }
                }
                scope = scope.parent;
            }
            return undefined;
        }

        // Whether a function can contribute an assertion at all, following calls it makes to other
        // helpers in the file. A helper that cannot assert costs nothing and never has to be modelled,
        // which is what keeps a recursive tree walker in a test from being reported as uncountable.
        function functionAsserts(fn, seen) {
            if (!seen && assertingFunctions.has(fn)) return assertingFunctions.get(fn);
            const visited = seen || new Set();
            if (visited.has(fn)) return false;
            visited.add(fn);
            let found = false;
            const walk = (node) => {
                if (found) return;
                if (isAssertCall(node)) {
                    found = true;
                    return;
                }
                if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
                    const target = functionBodyOf(node.expression);
                    if (target && functionAsserts(target, visited)) {
                        found = true;
                        return;
                    }
                }
                ts.forEachChild(node, walk);
            };
            walk(fn.body);
            if (!seen) assertingFunctions.set(fn, found);
            return found;
        }

        // Counts a function's body once, guarding against a helper that calls itself.
        function countFunctionBody(fn, env, site) {
            if (!functionAsserts(fn)) return zero();
            if (inlining.has(fn)) {
                refuse(site, `the recursive helper '${fn.name ? fn.name.text : "(anonymous)"}'`);
                return zero();
            }
            inlining.add(fn);
            const result = countNode(fn.body, env);
            inlining.delete(fn);
            return result;
        }

        function bindCallbackEnv(env, fn, element, index) {
            const next = new Map(env);
            const params = fn.parameters;
            if (params.length > 0 && ts.isIdentifier(params[0].name)) {
                next.set(params[0].name.text, { hasValue: element.hasValue, value: element.value });
            }
            if (params.length > 1 && ts.isIdentifier(params[1].name) && typeof index === "number") {
                next.set(params[1].name.text, { hasValue: true, value: index });
            }
            return next;
        }

        // Runs the callback body once per element when the real elements are known, so a condition on
        // the element decides itself; otherwise counts one pass and multiplies.
        function countLoopBody(fn, collection, env) {
            if (Array.isArray(collection.values)) {
                const acc = zero();
                collection.values.forEach((value, index) => {
                    const pass = countFunctionBody(fn, bindCallbackEnv(env, fn, { hasValue: true, value }, index), fn);
                    acc.scaled += pass.scaled;
                    // A known total inside this loop is already the total: count it once, not per element.
                    acc.fixed = Math.max(acc.fixed, pass.fixed);
                });
                return acc;
            }
            const times = typeof collection.total === "number" ? collection.total : collection.perIteration;
            const once = countFunctionBody(fn, bindCallbackEnv(env, fn, { hasValue: false }, undefined), fn);
            if (typeof collection.total === "number") return { scaled: 0, fixed: once.scaled * times + once.fixed };
            return repeat(once, times);
        }

        function countBranches(branches) {
            const asserting = branches.filter((branch) => totalOf(branch) > 0);
            if (asserting.length > 1) return asserting[0];
            const acc = zero();
            branches.forEach((branch) => addInto(acc, branch));
            return acc;
        }

        function resolveForTripCount(node, env) {
            const initializer = node.initializer;
            const declared = new Set();
            if (initializer && ts.isVariableDeclarationList(initializer)) {
                for (const decl of initializer.declarations) {
                    if (ts.isIdentifier(decl.name)) declared.add(decl.name.text);
                }
            } else if (
                initializer &&
                ts.isBinaryExpression(initializer) &&
                initializer.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
                ts.isIdentifier(initializer.left)
            ) {
                declared.add(initializer.left.text);
            }
            if (declared.size === 0 || !node.condition || !node.incrementor) return null;
            const parts = [initializer, node.condition, node.incrementor];
            const sandbox = bindHeaderNames(parts, declared, env);
            if (!sandbox) return null;
            const source =
                `(function () { var __trips = 0; ` +
                `for (${initializer.getText(sf)}; ${node.condition.getText(sf)}; ${node.incrementor.getText(sf)}) ` +
                `{ if (++__trips > 1000000) return null; } return __trips; })()`;
            const evaluated = runSandboxed(source, sandbox);
            return evaluated.ok && typeof evaluated.value === "number" ? evaluated.value : null;
        }

        // Every name a loop header needs: a value the enclosing loop bound, or - for the usual
        // `for (i = 0; i < rows.length; i++)` - a stand-in carrying just the length of a collection
        // the model can size. The stand-in is only used when the header reads nothing but `.length`,
        // so it can never decide something else about the collection.
        function bindHeaderNames(parts, declared, env) {
            const sandbox = {};
            for (const part of parts) {
                for (const name of freeIdentifiers(part)) {
                    if (SAFE_EVAL_GLOBALS.has(name) || declared.has(name) || name in sandbox) continue;
                    const bound = env.get(name);
                    if (bound && bound.hasValue) {
                        sandbox[name] = bound.value;
                        continue;
                    }
                    const length = lengthOnlyUse(parts, name, env);
                    if (length === null) return null;
                    sandbox[name] = { length };
                }
            }
            return sandbox;
        }

        function lengthOnlyUse(parts, name, env) {
            let reference;
            let onlyLength = true;
            for (const part of parts) {
                const walk = (node) => {
                    if (ts.isIdentifier(node) && node.text === name) {
                        const parent = node.parent;
                        const readsLength =
                            parent &&
                            ts.isPropertyAccessExpression(parent) &&
                            parent.expression === node &&
                            parent.name.text === "length";
                        if (readsLength) reference = node;
                        else onlyLength = false;
                    }
                    ts.forEachChild(node, walk);
                };
                walk(part);
            }
            if (!onlyLength || !reference) return null;
            const collection = resolveCollection(reference, env, 0);
            return collection && typeof collection.perIteration === "number" ? collection.perIteration : null;
        }

        function countNode(node, env) {
            if (!node) return zero();

            if (isAssertCall(node)) {
                const acc = { scaled: 1, fixed: 0 };
                node.arguments.forEach((argument) => addInto(acc, countNode(argument, env)));
                return acc;
            }

            // Counted where it is called, not where it is written: a helper called five times asserts
            // five times, and one that is never called asserts nothing.
            if (ts.isFunctionDeclaration(node)) return zero();

            if (ts.isTryStatement(node)) {
                const tried = countNode(node.tryBlock, env);
                const caught = node.catchClause ? countNode(node.catchClause.block, env) : zero();
                const finallyPart = node.finallyBlock ? countNode(node.finallyBlock, env) : zero();
                return addInto(countBranches([tried, caught]), finallyPart);
            }

            if (ts.isIfStatement(node)) {
                const verdict = evaluateExpression(node.expression, env);
                if (verdict.ok) {
                    return verdict.value
                        ? countNode(node.thenStatement, env)
                        : countNode(node.elseStatement, env);
                }
                return countBranches([
                    countNode(node.thenStatement, env),
                    countNode(node.elseStatement, env)
                ]);
            }

            if (ts.isConditionalExpression(node)) {
                const verdict = evaluateExpression(node.condition, env);
                if (verdict.ok) return countNode(verdict.value ? node.whenTrue : node.whenFalse, env);
                return countBranches([countNode(node.whenTrue, env), countNode(node.whenFalse, env)]);
            }

            if (ts.isSwitchStatement(node)) {
                return countBranches(node.caseBlock.clauses.map((clause) => {
                    const acc = zero();
                    clause.statements.forEach((statement) => addInto(acc, countNode(statement, env)));
                    return acc;
                }));
            }

            if (ts.isForOfStatement(node) || ts.isForInStatement(node)) {
                const once = countNode(node.statement, env);
                if (totalOf(once) === 0) return zero();
                const times = ts.isForOfStatement(node)
                    ? (resolveCollection(node.expression, env, 0) || {}).perIteration
                    : resolveObjectKeyCount(node.expression, env, 0);
                if (typeof times !== "number") {
                    refuse(node, `the loop over '${shortTextOf(node.expression)}'`);
                    return zero();
                }
                return repeat(once, times);
            }

            if (ts.isForStatement(node)) {
                const once = countNode(node.statement, env);
                if (totalOf(once) === 0) return zero();
                const trips = resolveForTripCount(node, env);
                if (trips === null) {
                    refuse(node, `the counted loop '${shortTextOf(node.condition || node)}'`);
                    return zero();
                }
                return repeat(once, trips);
            }

            if (ts.isWhileStatement(node) || ts.isDoStatement(node)) {
                const once = countNode(node.statement, env);
                if (totalOf(once) === 0) return zero();
                refuse(node, `the while loop '${shortTextOf(node.expression)}' (its trip count is not static)`);
                return zero();
            }

            if (ts.isCallExpression(node)) {
                const callee = node.expression;

                if (ts.isPropertyAccessExpression(callee) && node.arguments.length > 0) {
                    const method = callee.name.text;
                    const fn = functionBodyOf(node.arguments[0]);
                    if (fn && (LOOPING_METHODS.has(method) || UNCOUNTABLE_CALLBACK_METHODS.has(method))) {
                        const acc = countNode(callee.expression, env);
                        node.arguments.slice(1).forEach((argument) => addInto(acc, countNode(argument, env)));
                        const once = countFunctionBody(fn, bindCallbackEnv(env, fn, { hasValue: false }, undefined), fn);
                        if (totalOf(once) === 0) return acc;
                        if (UNCOUNTABLE_CALLBACK_METHODS.has(method)) {
                            refuse(node, `assertions inside ${method}(), which stops early or folds`);
                            return acc;
                        }
                        const collection = resolveCollection(callee.expression, env, 0);
                        if (!collection) {
                            refuse(node, `${method}() over '${shortTextOf(callee.expression)}'`);
                            return acc;
                        }
                        return addInto(acc, countLoopBody(fn, collection, env));
                    }
                    // A promise's rejection path is a branch, like catch: on one run the chain either
                    // settles through then() or through catch(), never both. So an assertion in a
                    // rejection handler counts only when the path it guards asserts nothing.
                    if (method === "catch" || (method === "then" && node.arguments.length > 1)) {
                        const happyPath = countNode(callee.expression, env);
                        const handlers = node.arguments.map((argument) => {
                            const handler = functionBodyOf(argument);
                            return handler ? countFunctionBody(handler, env, node) : countNode(argument, env);
                        });
                        if (method === "catch") {
                            return countBranches([happyPath, handlers[0]]);
                        }
                        return addInto(happyPath, countBranches([handlers[0], handlers[1]]));
                    }
                    // Promise.all(list) hands its callback one result per entry, so a loop over that
                    // parameter has the same length as the list.
                    if (method === "then" && fn) {
                        const promiseAll = asPromiseAll(callee.expression);
                        if (promiseAll) {
                            const collection = resolveCollection(promiseAll, env, 0);
                            if (collection && typeof collection.perIteration === "number") {
                                const next = new Map(env);
                                if (fn.parameters.length > 0 && ts.isIdentifier(fn.parameters[0].name)) {
                                    next.set(fn.parameters[0].name.text, {
                                        hasValue: false,
                                        length: collection.perIteration
                                    });
                                }
                                const acc = countNode(callee.expression, env);
                                node.arguments.slice(1).forEach((arg) => addInto(acc, countNode(arg, env)));
                                return addInto(acc, countFunctionBody(fn, next, fn));
                            }
                        }
                    }
                }

                // A call to a helper declared in this file runs that helper's body here.
                if (ts.isIdentifier(callee)) {
                    const fn = functionBodyOf(callee);
                    if (fn) {
                        const acc = zero();
                        node.arguments.forEach((argument) => addInto(acc, countNode(argument, env)));
                        const next = new Map(env);
                        fn.parameters.forEach((param, index) => {
                            if (!ts.isIdentifier(param.name)) return;
                            const argument = node.arguments[index];
                            const evaluated = argument ? evaluateExpression(argument, env) : { ok: false };
                            next.set(param.name.text, evaluated.ok
                                ? { hasValue: true, value: evaluated.value }
                                : { hasValue: false });
                        });
                        return addInto(acc, countFunctionBody(fn, next, node));
                    }
                }
            }

            const acc = zero();
            // forEachChild stops at the first truthy callback result, so this must not return one.
            ts.forEachChild(node, (child) => {
                addInto(acc, countNode(child, env));
            });
            return acc;
        }

        function asPromiseAll(expr) {
            if (
                ts.isCallExpression(expr) &&
                ts.isPropertyAccessExpression(expr.expression) &&
                ts.isIdentifier(expr.expression.expression) &&
                expr.expression.expression.text === "Promise" &&
                expr.expression.name.text === "all" &&
                expr.arguments.length === 1
            ) {
                return expr.arguments[0];
            }
            return undefined;
        }

        const tests = [];
        let total = 0;
        let currentModule = "Global";

        function visitTop(node) {
            if (
                ts.isCallExpression(node) &&
                ts.isPropertyAccessExpression(node.expression) &&
                ts.isIdentifier(node.expression.expression) &&
                node.expression.expression.text === "QUnit"
            ) {
                const member = node.expression.name.text;
                if (member === "module" && node.arguments.length >= 1 && ts.isStringLiteralLike(node.arguments[0])) {
                    currentModule = node.arguments[0].text;
                    return;
                }
                if (member === "test" && node.arguments.length >= 2) {
                    const name = ts.isStringLiteralLike(node.arguments[0])
                        ? node.arguments[0].text
                        : "(computed name)";
                    const body = node.arguments[1];
                    if (ts.isFunctionExpression(body) || ts.isArrowFunction(body)) {
                        currentTest = name;
                        const counted = countNode(body.body, new Map());
                        currentTest = "(file scope)";
                        tests.push({
                            file: fileName,
                            module: currentModule,
                            name,
                            line: lineOf(node),
                            count: totalOf(counted)
                        });
                        total += totalOf(counted);
                    }
                    return;
                }
            }
            ts.forEachChild(node, visitTop);
        }
        visitTop(sf);
        return { total, tests };
    }

    const unitFiles = [
        path.join(TEST_DIR, "unit", "plugins", "PipelinePlugins.qunit.js"),
        path.join(TEST_DIR, "unit", "core", "CoreArchitecture.qunit.js"),
        path.join(TEST_DIR, "unit", "plugins", "ControlPlugins.qunit.js")
    ];
    const e2eFile = path.join(TEST_DIR, "integration", "AllJourneys.js");

    let unitTotal = 0;
    const unitByFile = {};
    const unitTests = [];
    for (const file of unitFiles) {
        const analysis = analyseQUnitFile(file);
        unitByFile[path.basename(file)] = analysis.total;
        unitTests.push(...analysis.tests);
        unitTotal += analysis.total;
    }
    const e2eAnalysis = analyseQUnitFile(e2eFile);

    if (refusals.length > 0) {
        throw new Error(
            `[METRICS_MODEL] The static QUnit assertion model cannot count ${refusals.length} construct(s), ` +
                `so it will not publish a number it would have to guess at:\n  - ${refusals.join("\n  - ")}\n` +
                `Fix one of these: write the collection so its size is reachable from the source (a literal, ` +
                `an oracle-derived expression, or a const in the same scope that is never re-assigned); or, if ` +
                `only the browser can produce it, add it to DECLARED_COLLECTIONS in scripts/run-tests.js with ` +
                `the data its size comes from.`
        );
    }

    return {
        unit: unitTotal,
        e2e: e2eAnalysis.total,
        total: unitTotal + e2eAnalysis.total,
        unitByFile,
        unitTests,
        e2eTests: e2eAnalysis.tests,
        declaredCollections: [...DECLARED_COLLECTIONS].map(([key, declared]) => ({
            key,
            size: declared.total !== undefined ? `${declared.total} in total` : `${declared.perIteration} per pass`,
            why: declared.why
        }))
    };
}

function computeProjectMetrics() {
    const allSrcTsFiles = collectAllFilesWithExt(SRC_ROOT_DIR, [".ts"]);
    const auditedTsFiles = collectTsFiles(SRC_DIR);
    const scriptFiles = collectSourceFiles(SCRIPTS_DIR, [".ts", ".js"]);
    const testFiles = collectSourceFiles(TEST_DIR, [".ts", ".js"]);

    let totalExecLines = 0;
    let totalRawLines = 0;
    const areaStats = {
        "plugins/": { files: 0, execLines: 0, rawLines: 0 },
        "layouts/": { files: 0, execLines: 0, rawLines: 0 },
        "core/": { files: 0, execLines: 0, rawLines: 0 },
        "controls/": { files: 0, execLines: 0, rawLines: 0 },
        "openapi/": { files: 0, execLines: 0, rawLines: 0 },
        "utils/": { files: 0, execLines: 0, rawLines: 0 },
        "interfaces/": { files: 0, execLines: 0, rawLines: 0 },
        "constants/": { files: 0, execLines: 0, rawLines: 0 },
        "swagger/": { files: 0, execLines: 0, rawLines: 0 },
        "other (library.ts + types/)": { files: 0, execLines: 0, rawLines: 0 }
    };

    let longestLine = { length: 0, file: "", line: 0, text: "" };
    let bootstrapperLongestLine = { length: 0, line: 0 };

    for (const file of allSrcTsFiles) {
        const rel = path.relative(ROOT_DIR, file).replace(/\\/g, "/");
        const content = fs.readFileSync(file, "utf8");
        const rawLines = content.replace(/\r?\n$/, "").split(/\r?\n/);
        const execLines = countExecutableLines(rawLines);
        totalExecLines += execLines;
        totalRawLines += rawLines.length;

        let matchedArea = "other (library.ts + types/)";
        for (const areaKey of Object.keys(areaStats)) {
            if (areaKey !== "other (library.ts + types/)" && rel.includes(`metaui/${areaKey}`)) {
                matchedArea = areaKey;
                break;
            }
        }
        areaStats[matchedArea].files++;
        areaStats[matchedArea].execLines += execLines;
        areaStats[matchedArea].rawLines += rawLines.length;

        if (!file.endsWith(".d.ts")) {
            rawLines.forEach((line, idx) => {
                const trimmed = line.trim();
                if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) {
                    return;
                }
                if (line.length > longestLine.length) {
                    longestLine = {
                        length: line.length,
                        file: rel,
                        line: idx + 1,
                        text: trimmed
                    };
                }
                if (rel.endsWith("DefaultPluginBootstrapper.ts") && line.length > bootstrapperLongestLine.length) {
                    bootstrapperLongestLine = { length: line.length, line: idx + 1 };
                }
            });
        }
    }

    function countConcreteAndAbstractPlugins(dir) {
        let concrete = 0;
        let abstractBases = 0;
        for (const f of collectTsFiles(dir)) {
            const text = fs.readFileSync(f, "utf8");
            const sf = ts.createSourceFile(f, text, ts.ScriptTarget.Latest, true);
            let isAbstract = false;
            sf.forEachChild((node) => {
                if (
                    ts.isClassDeclaration(node) &&
                    node.modifiers &&
                    node.modifiers.some((m) => m.kind === ts.SyntaxKind.AbstractKeyword)
                ) {
                    isAbstract = true;
                }
            });
            if (isAbstract) abstractBases++;
            else concrete++;
        }
        return { concrete, abstractBases };
    }
    const controlSplit = countConcreteAndAbstractPlugins(path.join(SRC_DIR, "plugins", "controls"));
    const actionSplit = countConcreteAndAbstractPlugins(path.join(SRC_DIR, "plugins", "actions"));
    const concreteControlPlugins = controlSplit.concrete;
    const abstractControlPluginBases = controlSplit.abstractBases;
    const concreteActionPlugins = actionSplit.concrete;
    const abstractActionPluginBases = actionSplit.abstractBases;

    const bootstrapperCounts = parseBootstrapperSource(path.join(SRC_DIR, "core", "DefaultPluginBootstrapper.ts"));
    const pipelineCounts = parsePipelineManagerSource(path.join(SRC_DIR, "core", "PipelineManager.ts"));
    const qunit = computeQUnitAssertionsFromAst();

    return {
        qunit,
        tsFiles: {
            totalInSrc: allSrcTsFiles.length,
            auditedByLintGate: auditedTsFiles.length,
            declarationFilesInSrc: allSrcTsFiles.length - auditedTsFiles.length,
            auditedJsFiles: scriptFiles.length + testFiles.length
        },
        lines: {
            totalExecutable: totalExecLines,
            totalRaw: totalRawLines,
            areas: areaStats
        },
        longestLine,
        bootstrapperLongestLine,
        // Measured, not asserted: the gate grants real exemptions (UI5 binding casts, console in
        // scripts/, and the documentation symbol allowlist) and must report how many it used.
        gateExemptions: countGateExemptions(auditedTsFiles, scriptFiles, undefined),
        registered: {
            ...bootstrapperCounts,
            ...pipelineCounts,
            concreteControlPlugins,
            abstractControlPluginBases,
            concreteActionPlugins,
            abstractActionPluginBases,
            actionPluginFiles: collectTsFiles(path.join(SRC_DIR, "plugins", "actions")).length,
            datasourcePluginFiles: collectTsFiles(path.join(SRC_DIR, "plugins", "datasources")).length,
            concreteWidgetPlugins:
                concreteControlPlugins +
                concreteActionPlugins +
                collectTsFiles(path.join(SRC_DIR, "plugins", "datasources")).length,
            policyConditionFiles: collectTsFiles(path.join(SRC_DIR, "plugins", "policies", "conditions")).length,
            policyEffectFiles: collectTsFiles(path.join(SRC_DIR, "plugins", "policies", "effects")).length
        }
    };
}

function printProjectMetrics() {
    const m = computeProjectMetrics();
    console.log(`============================================================`);
    console.log(`MetaUI Canonical Project Metrics (read-only via --metrics-only)`);
    console.log(`============================================================`);
    console.log(
        `QUnit Assertions (Total):      ${m.qunit.total} (Unit: ${m.qunit.unit}, Integration/E2E: ${m.qunit.e2e})`
    );
    console.log(
        `  Unit Breakdown:              PipelinePlugins=${m.qunit.unitByFile["PipelinePlugins.qunit.js"]}, CoreArchitecture=${m.qunit.unitByFile["CoreArchitecture.qunit.js"]}, ControlPlugins=${m.qunit.unitByFile["ControlPlugins.qunit.js"]}`
    );
    console.log(
        `  How Obtained:                AST traversal of test/webapp/test/**/*.js expanded against TestOracle.js & mockData/scenarios/*.json (verified 1:1 against live headless Chromium QUnit summary during 'npm test')`
    );
    console.log(
        `TypeScript Files in src/:      ${m.tsFiles.totalInSrc} total (${m.tsFiles.auditedByLintGate} implementation .ts files audited by lint gate + ${m.tsFiles.declarationFilesInSrc} ambient .d.ts in src/types/; plus ${m.tsFiles.auditedJsFiles} scripts/ + test/ .js files audited)`
    );
    console.log(
        `Source Lines in src/ (Total):  ${m.lines.totalExecutable} executable lines / ${m.lines.totalRaw} total lines`
    );
    console.log(`Per-Area Line Subtotals:`);
    for (const [area, stat] of Object.entries(m.lines.areas)) {
        console.log(
            `  - ${area.padEnd(27)} ${String(stat.execLines).padStart(5)} executable / ${String(stat.rawLines).padStart(5)} total lines (${stat.files} files)`
        );
    }
    console.log(
        `Longest Code Line in src/:     ${m.longestLine.length} chars (limit <= 140) at ${m.longestLine.file}:${m.longestLine.line}`
    );
    console.log(
        `  DefaultPluginBootstrapper:   ${m.bootstrapperLongestLine.length} chars at line ${m.bootstrapperLongestLine.line}`
    );
    console.log(
        `Lint Gate Exemptions:          ${m.gateExemptions.bindingCasts} UI5 binding casts + ${m.gateExemptions.consoleRefs} console refs in ${m.gateExemptions.consoleFiles} scripts/ files + ${m.gateExemptions.catchSignal} justified CATCH_SIGNAL swallows + ${m.gateExemptions.singleWalker} justified SINGLE_WALKER exemptions + ${m.gateExemptions.docSymbolAllowlistEntries} doc-symbol allowlist entries (hits counted during 'npm run lint')`
    );
    console.log(`Registered Counts (from AST):`);
    console.log(
        `  - (type, widget) mappings:   ${m.registered.pluginMappings} (${m.registered.concreteControlPlugins} concrete control plugins + ${m.registered.abstractControlPluginBases} abstract bases, ${m.registered.actionPluginFiles} actions, ${m.registered.datasourcePluginFiles} datasources)`
    );
    console.log(`  - Layouts:                   ${m.registered.layouts}`);
    console.log(
        `  - Policy Conditions:         ${m.registered.policyConditions} (${m.registered.policyConditionFiles} files)`
    );
    console.log(
        `  - Policy Effects:            ${m.registered.policyEffects} (${m.registered.policyEffectFiles} file: BinaryEffectPlugin.ts)`
    );
    console.log(`  - Validators:                ${m.registered.validators}`);
    console.log(`  - Formatters:                ${m.registered.formatters}`);
    console.log(`  - Parsers:                   ${m.registered.parsers}`);
    console.log(`============================================================`);
}

/**
 * Indexes QUnit tests by "module :: name". Two tests sharing a name are summed and the duplicate is
 * noted, because the live run and the model would otherwise disagree for a reason that is not drift.
 */
function indexQUnitTests(entries, keyOf, countOf, whereOf) {
    const index = new Map();
    for (const entry of entries) {
        const key = keyOf(entry);
        const existing = index.get(key);
        if (existing) {
            existing.count += countOf(entry);
            existing.occurrences++;
        } else {
            index.set(key, { count: countOf(entry), occurrences: 1, where: whereOf ? whereOf(entry) : "" });
        }
    }
    return index;
}

/**
 * Compares the static per-QUnit.test model against the live browser run. Returns undefined when they
 * agree, and otherwise the whole [METRICS_DRIFT] message: which direction, which tests, and by how
 * much, so that nobody has to reconstruct that by hand from two totals.
 */
function buildQUnitDriftReport(staticQUnit, unitReport, integrationReport) {
    const suites = [
        { label: "Unit", tests: staticQUnit.unitTests, total: staticQUnit.unit, live: unitReport },
        { label: "E2E", tests: staticQUnit.e2eTests, total: staticQUnit.e2e, live: integrationReport }
    ];
    const lines = [];
    let under = 0;
    let over = 0;

    for (const suite of suites) {
        const liveTotal = suite.live.totalAssertions;
        if (liveTotal === suite.total) {
            lines.push(`  ${suite.label}: static ${suite.total} = live ${liveTotal}  (agrees)`);
            continue;
        }
        const delta = liveTotal - suite.total;
        if (delta > 0) under += delta;
        else over -= delta;
        lines.push(
            `  ${suite.label}: static ${suite.total}, live ${liveTotal}  ->  live is ${Math.abs(delta)} ` +
                `${delta > 0 ? "ABOVE" : "BELOW"} static`
        );

        const staticIndex = indexQUnitTests(
            suite.tests,
            (t) => `${t.module} :: ${t.name}`,
            (t) => t.count,
            (t) => `${t.file}:${t.line}`
        );
        const liveIndex = indexQUnitTests(
            suite.live.tests,
            (t) => `${t.moduleName} :: ${t.testName}`,
            (t) => t.passed + t.failed
        );

        const rows = [];
        for (const [key, modelled] of staticIndex) {
            const ran = liveIndex.get(key);
            if (!ran) {
                rows.push(`    modelled but no such test ran:  static=${modelled.count}  "${key}"  (${modelled.where})`);
            } else if (ran.count !== modelled.count) {
                const diff = ran.count - modelled.count;
                rows.push(
                    `    static=${modelled.count} live=${ran.count} (${diff > 0 ? "+" : ""}${diff})  ` +
                        `"${key}"  (${modelled.where})`
                );
            }
        }
        for (const [key, ran] of liveIndex) {
            if (!staticIndex.has(key)) {
                rows.push(`    ran but the model never saw it:  live=${ran.count}  "${key}"`);
            }
        }
        if (rows.length === 0) {
            rows.push(`    (no single test differs: the suite totals differ, so a whole test file may be missing)`);
        }
        lines.push(...rows.slice(0, 40));
        if (rows.length > 40) lines.push(`    ... and ${rows.length - 40} further test(s)`);
    }

    if (under === 0 && over === 0) return undefined;

    const guidance = [];
    if (over > 0) {
        guidance.push(
            `  Live BELOW static (${over} assertion(s)): the model counted assertions that did not execute. ` +
                `Usually a bare 'if' with no else inside a loop, an early return, a rejection handler that never ` +
                `ran, or a test that threw part way. Find it with the per-test rows above - the assertion is real ` +
                `and is not running.`
        );
    }
    if (under > 0) {
        guidance.push(
            `  Live ABOVE static (${under} assertion(s)): the model under-counted, so the construct is one it does ` +
                `not understand yet. Teach computeQUnitAssertionsFromAst() that construct - do NOT restructure a ` +
                `working test to suit the model, and do NOT relax this gate.`
        );
    }

    return [
        `[METRICS_DRIFT] The static assertion model and the live browser run disagree.`,
        ...lines,
        ...guidance,
        `  The static model is computeQUnitAssertionsFromAst() in scripts/run-tests.js; ` +
            `'node scripts/run-tests.js --qunit-breakdown' prints its number for every test, in the same ` +
            `"module :: name (N assertions)" shape the live run prints, so the two listings diff directly.`
    ].join("\n");
}

function printQUnitBreakdown() {
    const qunit = computeQUnitAssertionsFromAst();
    console.log(`============================================================`);
    console.log(`Static QUnit assertion model (per QUnit.test)`);
    console.log(`============================================================`);
    for (const label of ["unit", "e2e"]) {
        const tests = label === "unit" ? qunit.unitTests : qunit.e2eTests;
        console.log(`-- ${label.toUpperCase()} (${label === "unit" ? qunit.unit : qunit.e2e} assertions over ${tests.length} tests)`);
        for (const t of tests) {
            console.log(`  [STATIC ${String(t.count).padStart(4)}] ${t.module} :: ${t.name}   (${t.file}:${t.line})`);
        }
    }
    console.log(`-- Collections the model takes on trust (everything else is read from the test source):`);
    for (const declared of qunit.declaredCollections) {
        console.log(`  ${declared.key}  =  ${declared.size}`);
        console.log(`    because: ${declared.why}`);
    }
    console.log(`============================================================`);
}

const MIME_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".xml": "application/xml; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".properties": "text/plain; charset=utf-8",
    ".library": "application/xml; charset=utf-8"
};

const STANDALONE_CONSUMER_HTML = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Standalone Consumer Verification - MetaUI Library</title>
    <script id="sap-ui-bootstrap"
        src="https://ui5.sap.com/resources/sap-ui-core.js"
        data-sap-ui-theme="sap_horizon"
        data-sap-ui-libs="sap.m, sap.ui.core, sap.ui.layout, sap.f, sap.ui.codeeditor"
        data-sap-ui-resourceroots='{
            "nz.co.siliconst.ui5.metaui": "/resources/nz/co/siliconst/ui5/metaui"
        }'
        data-sap-ui-compatVersion="edge"
        data-sap-ui-async="true">
    </script>
</head>
<body class="sapUiBody" id="consumer-root" style="margin:0; padding:16px; width:1200px; min-height:800px;">
    <div id="consumer-mount" style="width:1100px;"></div>
</body>
</html>`;

const ODATA_V4_METADATA_XML = `<?xml version="1.0" encoding="utf-8"?>
<edmx:Edmx Version="4.0" xmlns:edmx="http://docs.oasis-open.org/odata/ns/edmx">
  <edmx:DataServices>
    <Schema Namespace="metaui.mock" xmlns="http://docs.oasis-open.org/odata/ns/edm">
      <EntityType Name="Employee">
        <Key><PropertyRef Name="ID"/></Key>
        <Property Name="ID" Type="Edm.String" Nullable="false"/>
        <Property Name="FirstName" Type="Edm.String"/>
        <Property Name="LastName" Type="Edm.String"/>
        <Property Name="Role" Type="Edm.String"/>
        <Property Name="Department" Type="Edm.String"/>
      </EntityType>
      <EntityType Name="Department">
        <Key><PropertyRef Name="ID"/></Key>
        <Property Name="ID" Type="Edm.String" Nullable="false"/>
        <Property Name="Name" Type="Edm.String"/>
      </EntityType>
      <!--
        WorkOrder exists for the integration shape a real consumer uses: a table whose rows come
        from OData V4, three ordinary scalar columns, and one column holding a MetaUI host that
        edits DetailsJson - a JSON document carried in an Edm.String, driven by a JSON Schema.
      -->
      <EntityType Name="WorkOrder">
        <Key><PropertyRef Name="ID"/></Key>
        <Property Name="ID" Type="Edm.String" Nullable="false"/>
        <Property Name="Code" Type="Edm.String"/>
        <Property Name="Status" Type="Edm.String"/>
        <Property Name="Owner" Type="Edm.String"/>
        <Property Name="DetailsJson" Type="Edm.String"/>
      </EntityType>
      <EntityContainer Name="Container">
        <EntitySet Name="Employees" EntityType="metaui.mock.Employee"/>
        <EntitySet Name="Departments" EntityType="metaui.mock.Department"/>
        <EntitySet Name="WorkOrders" EntityType="metaui.mock.WorkOrder"/>
      </EntityContainer>
    </Schema>
  </edmx:DataServices>
</edmx:Edmx>`;

/**
 * Live rows for the WorkOrders entity set, plus a log of every PATCH the V4 model sent.
 *
 * This is deliberately stateful: a test asserts that editing a MetaUI host inside a table cell
 * reaches the service as a real PATCH, and the only way to know that is to record what arrived.
 * `__odata-probe` exposes both to the browser so a QUnit test can read them back.
 */
function freshWorkOrders() {
    return [
        { ID: "WO-1", Code: "PO-10021", Status: "Open", Owner: "Ada", DetailsJson: JSON.stringify({ Priority: "High", Quantity: 4, Notes: "Original" }) },
        { ID: "WO-2", Code: "PO-10022", Status: "Closed", Owner: "Grace", DetailsJson: JSON.stringify({ Priority: "Low", Quantity: 1, Notes: "Second" }) },
        { ID: "WO-3", Code: "PO-10023", Status: "Open", Owner: "Alan", DetailsJson: JSON.stringify({ Priority: "Medium", Quantity: 9, Notes: "Third" }) }
    ];
}
let ODATA_WORK_ORDERS = freshWorkOrders();
let ODATA_PATCH_LOG = [];

function startServer() {
    return new Promise((resolve, reject) => {
        const server = http.createServer((req, res) => {
            const parsedUrl = new URL(req.url, "http://localhost");
            const pathname = decodeURIComponent(parsedUrl.pathname);

            // --- WorkOrders: a real OData V4 service surface -------------------------------
            if (pathname.startsWith("/odata/v4/wo/")) {
                const tail = pathname.slice("/odata/v4/wo/".length);

                if (tail === "$metadata") {
                    res.writeHead(200, { "Content-Type": "application/xml; charset=utf-8", "OData-Version": "4.0" });
                    res.end(ODATA_V4_METADATA_XML);
                    return;
                }

                // Test-only: read back what the model actually sent, and reset between tests.
                if (tail === "__odata-probe") {
                    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
                    res.end(JSON.stringify({ patches: ODATA_PATCH_LOG, rows: ODATA_WORK_ORDERS }));
                    return;
                }
                if (tail === "__odata-reset") {
                    ODATA_WORK_ORDERS = freshWorkOrders();
                    ODATA_PATCH_LOG = [];
                    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
                    res.end('{"reset":true}');
                    return;
                }

                const keyMatch = /^WorkOrders\('([^']+)'\)$/.exec(tail);

                if (req.method === "PATCH" && keyMatch) {
                    let body = "";
                    req.on("data", (chunk) => { body += chunk; });
                    req.on("end", () => {
                        let parsed = null;
                        try { parsed = JSON.parse(body || "{}"); } catch (e) { parsed = { __parseError: String(e && e.message) }; }
                        ODATA_PATCH_LOG.push({ id: keyMatch[1], body: parsed, raw: body });
                        const row = ODATA_WORK_ORDERS.find((r) => r.ID === keyMatch[1]);
                        if (row && parsed && !parsed.__parseError) { Object.assign(row, parsed); }
                        res.writeHead(200, { "Content-Type": "application/json; odata.metadata=minimal", "OData-Version": "4.0" });
                        res.end(JSON.stringify(Object.assign({ "@odata.context": "$metadata#WorkOrders/$entity" }, row || {})));
                    });
                    return;
                }

                if (keyMatch) {
                    const row = ODATA_WORK_ORDERS.find((r) => r.ID === keyMatch[1]);
                    res.writeHead(row ? 200 : 404, { "Content-Type": "application/json; odata.metadata=minimal", "OData-Version": "4.0" });
                    res.end(row ? JSON.stringify(Object.assign({ "@odata.context": "$metadata#WorkOrders/$entity" }, row)) : '{"error":{"message":"not found"}}');
                    return;
                }

                if (tail.startsWith("WorkOrders")) {
                    res.writeHead(200, { "Content-Type": "application/json; odata.metadata=minimal", "OData-Version": "4.0" });
                    res.end(JSON.stringify({
                        "@odata.context": "$metadata#WorkOrders",
                        "@odata.count": ODATA_WORK_ORDERS.length,
                        value: ODATA_WORK_ORDERS
                    }));
                    return;
                }
            }

            if (pathname === "/favicon.ico") {
                res.writeHead(204);
                res.end();
                return;
            }

            if (pathname === "/Component-preload.js") {
                res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8" });
                res.end('sap.ui.require.preload({}, "metaui/sandbox/Component-preload");');
                return;
            }

            if (pathname === "/standalone-consumer.html") {
                res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
                res.end(STANDALONE_CONSUMER_HTML);
                return;
            }

            if (pathname === "/Categories") {
                res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
                res.end(
                    JSON.stringify([
                        { Id: "C1", Name: "Hardware" },
                        { Id: "C2", Name: "Software" }
                    ])
                );
                return;
            }

            // Mock OData v4 metadata and entity responses for offline/headless testing
            if (pathname.startsWith("/odata/v4/main/")) {
                if (pathname.endsWith("$metadata")) {
                    res.writeHead(200, { "Content-Type": "application/xml; charset=utf-8", "OData-Version": "4.0" });
                    res.end(ODATA_V4_METADATA_XML);
                    return;
                }
                if (pathname.includes("Departments")) {
                    res.writeHead(200, { "Content-Type": "application/json; odata.metadata=minimal", "OData-Version": "4.0" });
                    res.end(
                        JSON.stringify({
                            "@odata.context": "$metadata#Departments",
                            value: [
                                { ID: "ENG", Name: "Engineering" },
                                { ID: "FIN", Name: "Finance" },
                                { ID: "OPS", Name: "Operations" }
                            ]
                        })
                    );
                    return;
                }
                res.writeHead(200, { "Content-Type": "application/json; odata.metadata=minimal", "OData-Version": "4.0" });
                res.end(
                    JSON.stringify({
                        "@odata.context": "$metadata#Employees/$entity",
                        ID: "E100",
                        FirstName: "Ada",
                        LastName: "Lovelace",
                        Role: "Principal Engineer",
                        Department: "Engineering"
                    })
                );
                return;
            }

            let filePath;
            if (pathname.startsWith("/resources/nz/co/siliconst/ui5/metaui")) {
                const rel = pathname.replace(/^\/resources\//, "");
                filePath = path.join(DIST_RESOURCES_DIR, rel);
            } else {
                const rel = pathname === "/" ? "/index.html" : pathname;
                filePath = path.join(WEBAPP_DIR, rel);
            }

            if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
                if (filePath.endsWith(".properties")) {
                    const basePropsPath = filePath.replace(/_[a-zA-Z0-9_]+\.properties$/, ".properties");
                    if (basePropsPath !== filePath && fs.existsSync(basePropsPath)) {
                        res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
                        res.end(fs.readFileSync(basePropsPath));
                        return;
                    }
                }
                console.error(`  [SERVER 404] ${pathname}`);
                res.writeHead(404, { "Content-Type": "text/plain" });
                res.end("Not Found: " + pathname);
                return;
            }

            const ext = path.extname(filePath).toLowerCase();
            const contentType = MIME_TYPES[ext] || "application/octet-stream";
            res.writeHead(200, { "Content-Type": contentType });
            res.end(fs.readFileSync(filePath));
        });

        server.listen(0, "127.0.0.1", () => {
            const address = server.address();
            resolve({ server, baseUrl: `http://127.0.0.1:${address.port}` });
        });
        server.on("error", reject);
    });
}

// Documented allowlist for console.error messages intentionally triggered by negative QUnit test cases
// (e.g. testing validation failures, invalid JSON input strings, or OpenAPI parser error rejection).
const INTENTIONAL_CONSOLE_ERROR_PATTERNS = [
    // Chromium deprecation notice triggered by OpenUI5 CDN sap-ui-core.js registering an "unload" listener
    /Permissions policy violation: unload is not allowed in this document/,
    // Hardware capability reports. A headless browser has no camera or microphone and denies
    // geolocation, so the DOM sandbox exercises every degradation arm on every run. These log at
    // error, not warning, deliberately: UI5 discards warnings at its stock ERROR level, which is
    // why an absent device API used to be invisible to the user AND to this harness.
    //
    // Allowlisting them hides nothing. The "Hardware: unavailable device APIs are painted, not
    // only logged" and "Hardware: geolocation never leaves the control busy" modules assert these
    // same five conditions directly - the ValueState, the aria-invalid, the inline error line and
    // the log level. Each pattern is anchored to its full sentence, so any OTHER hardware error
    // still fails the suite.
    /Speech recognition is not available in this browser\..*VoiceInputControl/,
    /Camera is not available in this browser\..*CameraControl/,
    /Camera access was blocked\. Allow it in the browser's site permissions and try again\..*CameraControl/,
    /Location access was blocked\. Allow it in the browser's site permissions and try again\..*GeolocationControl/,
    /Location did not respond in time\. Please try again\..*GeolocationControl/,
    // ValidationLedger logs each plugin validation failure when validateAll() runs on invalid test inputs
    /\[MetaUI Validation\] Plugin failed validation:/,
    // SchemaNormalizer / GenerationDelegate negative tests that pass malformed JSON strings
    /Failed to parse (schema|inputData|inputDataJson) string:/,
    // OpenApiBuilder negative test passing an invalid/unsupported spec object
    /Unsupported or invalid OpenAPI.*OpenApiBuilder/,
    // 13.2.2 negative test asserting unresolvable uiLayout scope (#/properties/MissingScopeField) sets hasPartialRenderingErrors
    /Property 'MissingScopeField' not found in schema/,
    // Two negative tests assert that a V4 service rejecting a PATCH reaches the application as a
    // host error event rather than being swallowed: 13.2.4 ('Name'), and the "a service that
    // rejects the patch is reported" test in the OData V4 module ('FirstName'). Both deliberately
    // reject setProperty, and the delegate is supposed to log. Anchored to the two properties
    // those tests use, so a real V4 write failure on any other property still fails the suite.
    /Failed to patch OData V4 property '(Name|FirstName)': (Simulated )?409 Conflict/,
    // 13.3.3 negative test asserting conflicting 'type' in allOf merge logs error and keeps first
    /Conflicting 'type' in allOf merge \('string' vs 'integer'\)/,
    // OpenAPI hardening tests feed deliberately contradictory allOf branches: the mapper is
    // expected to log and intersect them. Matched on the full sentence so that any other
    // OpenApiConstraintMapper error still fails the suite.
    /\[MetaUI OpenApiConstraintMapper\] Contradictory 'enum' in allOf merge \(.*\); no value satisfies both branches\./,
    // ... and the empty-enum property that intersection produces, which OpenApiPropertyMapper
    // renders as a disabled selection rather than silently as free text.
    /Property '[^']+' has an empty 'enum': no value satisfies it\. Rendering it as a disabled, empty selection rather than as unconstrained free text\./,
    // ODataDelegate negative test: a mock OData V2 model returns false from setProperty so the
    // test can assert the host surfaces the rejection. Only this one sentence is expected.
    /OData V2 model rejected the write to property '[^']+'/,
    // PolicyDelegate negative tests feed a throwing condition/effect to assert the pass survives
    // it. Both messages are matched in full so any other PolicyDelegate error still fails.
    // (UI5's Log prints Logger.error(message, details) as "<message> - <details>", so the
    // separator between the prefix and the sentence is matched loosely.)
    /Policy evaluation pass failed and emitted no deltas:.*PolicyDelegate/,
    /Failed to apply '[^']*' policy delta to '[^']*':.*PolicyDelegate/
];

function isAllowlistedConsoleError(text) {
    return INTENTIONAL_CONSOLE_ERROR_PATTERNS.some((pattern) => pattern.test(text));
}

function attachPageDiagnostics(page, label) {
    const pageErrors = [];
    const consoleErrors = [];
    const networkErrors = [];

    page.on("pageerror", (err) => {
        const msg = err.message || String(err);
        pageErrors.push(msg);
        console.error(`  [${label} PAGE ERROR] ${msg}`);
        page.evaluate(() => {
            window.__qunitPageError = true;
        }).catch(() => {});
    });

    page.on("console", (msg) => {
        if (msg.type() === "error") {
            const text = msg.text();
            if (!isAllowlistedConsoleError(text)) {
                consoleErrors.push(text);
                console.error(`  [${label} CONSOLE ERROR] ${text}`);
            }
        }
    });

    page.on("requestfailed", (req) => {
        const reqUrl = req.url();
        if (reqUrl.includes("/mockData/") || reqUrl.includes("/resources/")) {
            const errText = `${req.method()} ${reqUrl} failed: ${req.failure()?.errorText || "unknown"}`;
            networkErrors.push(errText);
            console.error(`  [${label} REQUEST FAILED] ${errText}`);
        }
    });

    page.on("response", (res) => {
        const resUrl = res.url();
        const status = res.status();
        if (status >= 400 && (resUrl.includes("/mockData/") || resUrl.includes("/resources/"))) {
            // UI5 sap/base/i18n/ResourceBundle probes locale-specific .properties files before falling back to base
            if (resUrl.endsWith(".properties") && status === 404) {
                return;
            }
            const errText = `HTTP ${status} for ${resUrl}`;
            networkErrors.push(errText);
            console.error(`  [${label} HTTP ERROR] ${errText}`);
        }
    });

    return { pageErrors, consoleErrors, networkErrors };
}

async function runQUnitPage(browser, url, suiteLabel) {
    console.log(`\n============================================================`);
    console.log(`Running ${suiteLabel}: ${url}`);
    console.log(`============================================================`);

    const page = await browser.newPage();
    const { pageErrors, consoleErrors, networkErrors } = attachPageDiagnostics(page, suiteLabel);

    await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });

    await page.waitForFunction(
        () => {
            if (window.__qunitPageError) return true;
            const banner = document.getElementById("qunit-testresult");
            return banner && banner.innerText.includes("completed in");
        },
        { timeout: 60000 }
    );

    const report = await page.evaluate(() => {
        const tests = Array.from(document.querySelectorAll("#qunit-tests > li")).map((li) => {
            const moduleName = li.querySelector(".module-name")?.textContent || "Global";
            const testName = li.querySelector(".test-name")?.textContent || "Unnamed";
            const passedText = li.querySelector(".counts .passed")?.textContent;
            const failedText = li.querySelector(".counts .failed")?.textContent;
            const passed =
                passedText !== undefined
                    ? Number(passedText)
                    : li.querySelectorAll(".qunit-assert-list > li.pass").length;
            const failed =
                failedText !== undefined
                    ? Number(failedText)
                    : li.querySelectorAll(".qunit-assert-list > li.fail").length;
            const status = li.classList.contains("pass") ? "PASS" : "FAIL";
            const failedMessages = Array.from(li.querySelectorAll(".qunit-assert-list > li.fail")).map(
                (f) => f.innerText.trim()
            );
            return { moduleName, testName, passed, failed, status, failedMessages };
        });

        const totalPassed = Number(document.querySelector("#qunit-testresult .passed")?.textContent || 0);
        const totalFailed = Number(document.querySelector("#qunit-testresult .failed")?.textContent || 0);
        const totalAssertions = Number(document.querySelector("#qunit-testresult .total")?.textContent || 0);

        return { tests, totalPassed, totalFailed, totalAssertions };
    });

    for (const t of report.tests) {
        const icon = t.status === "PASS" ? "PASS" : "FAIL";
        console.log(`  [${icon}] ${t.moduleName} :: ${t.testName} (${t.passed} assertions)`);
        for (const fMsg of t.failedMessages) {
            console.error(`    -> ${fMsg}`);
        }
    }

    console.log(
        `Summary (${suiteLabel}): ${report.totalPassed}/${report.totalAssertions} assertions passed, ${report.totalFailed} failed.`
    );

    await page.close();

    if (
        report.totalFailed > 0 ||
        report.totalAssertions === 0 ||
        pageErrors.length > 0 ||
        consoleErrors.length > 0 ||
        networkErrors.length > 0
    ) {
        throw new Error(
            `${suiteLabel} failed (failed=${report.totalFailed}, pageErrors=${pageErrors.length}, consoleErrors=${consoleErrors.length}, networkErrors=${networkErrors.length})`
        );
    }
    return report;
}

/**
 * Wraps page.waitForFunction so a timeout names the check that failed instead of reporting a
 * bare "Waiting failed: 30000ms exceeded".
 */
async function waitForNamed(page, label, pageFunction, options, ...args) {
    try {
        await page.waitForFunction(pageFunction, options, ...args);
    } catch (waitErr) {
        throw new Error(`${label} (${waitErr.message})`);
    }
}

async function runFioriSandboxSmokeTest(browser, baseUrl) {
    console.log(`\n============================================================`);
    console.log(`Running Fiori Sandbox App Verification: ${baseUrl}/index.html`);
    console.log(`============================================================`);

    const page = await browser.newPage();
    const { pageErrors, consoleErrors, networkErrors } = attachPageDiagnostics(page, "SANDBOX");

    await page.goto(`${baseUrl}/index.html`, { waitUntil: "networkidle2", timeout: 60000 });

    // Wait for Fiori Launchpad Home tiles to render
    await page.waitForFunction(
        () => document.querySelectorAll(".sapMGT").length >= 5,
        { timeout: 30000 }
    );
    const tileCount = await page.evaluate(() => document.querySelectorAll(".sapMGT").length);
    console.log(`  [PASS] Launchpad Home rendered ${tileCount} GenericTiles`);

    // Navigate to ScenarioRunner (#/scenario/kitchen_sink) and trigger Generate Form
    await page.goto(`${baseUrl}/index.html#/scenario/kitchen_sink`, { waitUntil: "networkidle2", timeout: 30000 });
    await page.waitForFunction(
        () => {
            const listItems = document.querySelectorAll(".sapMSLI");
            return listItems.length >= 6;
        },
        { timeout: 30000 }
    );
    const scenarioCount = await page.evaluate(() => document.querySelectorAll(".sapMSLI").length);
    await page.evaluate(() => {
        const reg = sap.ui.core.Element.registry.all();
        for (const id in reg) {
            const ctrl = reg[id];
            if (ctrl.isA && ctrl.isA("sap.m.Button") && ctrl.getText && ctrl.getText() === "Generate Form" && ctrl.getDomRef()) {
                ctrl.firePress();
                break;
            }
        }
    });
    await page.waitForFunction(
        () => {
            const reg = sap.ui.core.Element.registry.all();
            for (const id in reg) {
                const ctrl = reg[id];
                if (ctrl.isA && ctrl.isA("nz.co.siliconst.ui5.metaui.controls.DynamicHost") && ctrl.getDomRef()) {
                    const rect = ctrl.getDomRef().getBoundingClientRect();
                    if (rect.width > 0 && rect.height > 100) return true;
                }
            }
            return false;
        },
        { timeout: 30000 }
    );
    console.log(`  [PASS] ScenarioRunner (#/scenario/kitchen_sink) loaded ${scenarioCount} scenarios and rendered DynamicHost`);

    // Navigate to OpenAPI ScenarioRunner (#/scenario/openapi) and trigger Generate Form
    await page.goto(`${baseUrl}/index.html#/scenario/openapi`, { waitUntil: "networkidle2", timeout: 30000 });
    await page.waitForFunction(
        () => {
            const reg = sap.ui.core.Element.registry.all();
            for (const id in reg) {
                const ctrl = reg[id];
                if (ctrl.isA && ctrl.isA("sap.m.Select") && id.endsWith("schemaTargetSelect") && ctrl.getItems().length > 0) {
                    return true;
                }
            }
            return false;
        },
        { timeout: 30000 }
    );
    await page.evaluate(() => {
        const reg = sap.ui.core.Element.registry.all();
        for (const id in reg) {
            const ctrl = reg[id];
            if (ctrl.isA && ctrl.isA("sap.m.Button") && ctrl.getText && ctrl.getText() === "Generate Form" && ctrl.getDomRef()) {
                ctrl.firePress();
                break;
            }
        }
    });
    await page.waitForFunction(
        () => {
            const reg = sap.ui.core.Element.registry.all();
            for (const id in reg) {
                const ctrl = reg[id];
                if (ctrl.isA && ctrl.isA("nz.co.siliconst.ui5.metaui.controls.DynamicHost") && ctrl.getDomRef()) {
                    const rect = ctrl.getDomRef().getBoundingClientRect();
                    if (rect.width > 0 && rect.height > 100) return true;
                }
            }
            return false;
        },
        { timeout: 30000 }
    );
    console.log(`  [PASS] OpenAPI ScenarioRunner (#/scenario/openapi) extracted targets and rendered DynamicHost`);

    // Navigate to Data Inference Playpen (#/playpen) and verify the DynamicHost inferred a form
    // from the controller's payload and syncs edits back into the JSON editor. Asserting the
    // static <Title> text instead would pass with the host's data binding deleted.
    const PLAYPEN_FIELDS = ["username", "isActive", "rating", "roles"];
    await page.goto(`${baseUrl}/index.html#/playpen`, { waitUntil: "networkidle2", timeout: 30000 });
    await waitForNamed(
        page,
        `Playpen inference check failed: no DynamicHost on #/playpen rendered widgets for [${PLAYPEN_FIELDS.join(", ")}]`,
        (expected) => {
            const reg = sap.ui.core.Element.registry.all();
            for (const id in reg) {
                const ctrl = reg[id];
                if (
                    ctrl.isA &&
                    ctrl.isA("nz.co.siliconst.ui5.metaui.controls.DynamicHost") &&
                    id.endsWith("dynamicHost") &&
                    ctrl.getDomRef() &&
                    ctrl._innerHost &&
                    ctrl._innerHost.engine
                ) {
                    const paths = ctrl._innerHost.engine.getActivePlugins().map((e) => e.path.replace(/^\//, ""));
                    const rect = ctrl.getDomRef().getBoundingClientRect();
                    return expected.every((f) => paths.indexOf(f) !== -1) && rect.width > 0 && rect.height > 0;
                }
            }
            return false;
        },
        { timeout: 30000 },
        PLAYPEN_FIELDS
    );
    const playpen = await page.evaluate(() => {
        const reg = sap.ui.core.Element.registry.all();
        let host = null;
        for (const id in reg) {
            const ctrl = reg[id];
            if (ctrl.isA && ctrl.isA("nz.co.siliconst.ui5.metaui.controls.DynamicHost") && id.endsWith("dynamicHost")) {
                host = ctrl;
                break;
            }
        }
        const engine = host._innerHost.engine;
        const paths = engine.getActivePlugins().map((e) => e.path.replace(/^\//, ""));
        const usernameControl = engine.getPluginByPath("username").control;
        const inferredValue = usernameControl.getValue();
        const probe = "PLAYPEN_SYNC_PROBE";
        usernameControl.setValue(probe);
        usernameControl.fireChange({ value: probe });
        const viewModel = host.getModel("view");
        const jsonString = viewModel ? viewModel.getProperty("/jsonString") : "";
        const parsed = (viewModel && viewModel.getProperty("/parsedData")) || {};
        return {
            paths,
            inferredValue,
            probe,
            parsedSynced: parsed.username === probe,
            editorSynced: typeof jsonString === "string" && jsonString.indexOf(probe) !== -1
        };
    });
    const missingPlaypenFields = PLAYPEN_FIELDS.filter((f) => !playpen.paths.includes(f));
    if (missingPlaypenFields.length > 0) {
        throw new Error(
            `Playpen inference check failed: DynamicHost rendered [${playpen.paths.join(", ")}], missing [${missingPlaypenFields.join(", ")}]`
        );
    }
    if (playpen.inferredValue !== "admin123") {
        throw new Error(
            `Playpen inference check failed: 'username' control rendered '${playpen.inferredValue}' instead of the bound payload value 'admin123'`
        );
    }
    if (!playpen.parsedSynced || !playpen.editorSynced) {
        throw new Error(
            `Playpen bidirectional sync failed (model updated=${playpen.parsedSynced}, JSON editor updated=${playpen.editorSynced})`
        );
    }
    console.log(
        `  [PASS] Data Inference Playpen route inferred ${playpen.paths.length} widgets from the raw payload and synced an edit back into the JSON editor`
    );

    // Navigate to Freeform Playground (#/playground), type a schema and payload into the two
    // CodeEditors, press "Generate Form" and verify the engine rendered the typed fields.
    // #hostContainer stays empty until that button is pressed, so a text check on the route
    // title could never fail.
    const PLAYGROUND_SCHEMA = {
        type: "object",
        layoutStrategy: "form",
        properties: {
            PlaygroundTitle: { type: "string", ui: { label: "Playground Title" } },
            PlaygroundQty: { type: "integer", ui: { label: "Playground Quantity" } }
        }
    };
    const PLAYGROUND_DATA = { PlaygroundTitle: "PLAYGROUND_SMOKE_VALUE", PlaygroundQty: 7 };
    const PLAYGROUND_FIELDS = Object.keys(PLAYGROUND_SCHEMA.properties);
    await page.goto(`${baseUrl}/index.html#/playground`, { waitUntil: "networkidle2", timeout: 30000 });
    await waitForNamed(
        page,
        "Playground generation check failed: #/playground never rendered its two CodeEditors and a Generate Form button",
        () => {
            // The ScenarioRunner view visited earlier keeps its own rendered "Generate Form"
            // button alive, so the button has to be located inside the Playground view.
            const reg = sap.ui.core.Element.registry.all();
            let editors = 0;
            let generateButton = false;
            const inPlayground = (ctrl) => {
                for (let p = ctrl; p; p = p.getParent()) {
                    if (p.isA && p.isA("sap.ui.core.mvc.View") && p.getId().endsWith("playground")) return true;
                }
                return false;
            };
            for (const id in reg) {
                const ctrl = reg[id];
                if (!ctrl.isA) continue;
                if (
                    ctrl.isA("sap.ui.codeeditor.CodeEditor") &&
                    (id.endsWith("playground--inboundEditor") || id.endsWith("playground--schemaEditor"))
                ) {
                    editors++;
                }
                if (
                    ctrl.isA("sap.m.Button") &&
                    ctrl.getText &&
                    ctrl.getText() === "Generate Form" &&
                    ctrl.getDomRef() &&
                    inPlayground(ctrl)
                ) {
                    generateButton = true;
                }
            }
            return editors === 2 && generateButton;
        },
        { timeout: 30000 }
    );
    let playgroundPressed = false;
    try {
        playgroundPressed = await page.evaluate(
        (schemaJson, dataJson) => {
            const reg = sap.ui.core.Element.registry.all();
            const inPlayground = (ctrl) => {
                for (let p = ctrl; p; p = p.getParent()) {
                    if (p.isA && p.isA("sap.ui.core.mvc.View") && p.getId().endsWith("playground")) return true;
                }
                return false;
            };
            for (const id in reg) {
                const ctrl = reg[id];
                if (!ctrl.isA || !ctrl.isA("sap.ui.codeeditor.CodeEditor")) continue;
                if (id.endsWith("playground--schemaEditor")) {
                    ctrl.setValue(schemaJson);
                    ctrl.fireChange({ value: schemaJson });
                } else if (id.endsWith("playground--inboundEditor")) {
                    ctrl.setValue(dataJson);
                    ctrl.fireChange({ value: dataJson });
                }
            }
            for (const id in reg) {
                const ctrl = reg[id];
                if (
                    ctrl.isA &&
                    ctrl.isA("sap.m.Button") &&
                    ctrl.getText &&
                    ctrl.getText() === "Generate Form" &&
                    ctrl.getDomRef() &&
                    inPlayground(ctrl)
                ) {
                    ctrl.firePress();
                    return true;
                }
            }
            return false;
        },
        JSON.stringify(PLAYGROUND_SCHEMA),
        JSON.stringify(PLAYGROUND_DATA)
        );
    } catch (pressErr) {
        throw new Error(`Playground generation check failed: typing the schema/payload and pressing 'Generate Form' threw: ${pressErr.message}`);
    }
    if (!playgroundPressed) {
        throw new Error("Playground generation check failed: no rendered 'Generate Form' button inside the Playground view");
    }
    await waitForNamed(
        page,
        `Playground generation check failed: pressing 'Generate Form' did not render a DynamicHost with [${PLAYGROUND_FIELDS.join(", ")}] inside #hostContainer`,
        (expected) => {
            const reg = sap.ui.core.Element.registry.all();
            for (const id in reg) {
                const ctrl = reg[id];
                if (!ctrl.isA || !id.endsWith("playground--hostContainer") || !ctrl.getItems) continue;
                const items = ctrl.getItems();
                if (items.length === 0) return false;
                const host = items[0];
                if (!host.isA("nz.co.siliconst.ui5.metaui.controls.DynamicHost") || !host.getDomRef()) return false;
                if (!host._innerHost || !host._innerHost.engine) return false;
                const paths = host._innerHost.engine.getActivePlugins().map((e) => e.path.replace(/^\//, ""));
                return expected.every((f) => paths.indexOf(f) !== -1);
            }
            return false;
        },
        { timeout: 30000 },
        PLAYGROUND_FIELDS
    );
    const playground = await page.evaluate(() => {
        const reg = sap.ui.core.Element.registry.all();
        let host = null;
        for (const id in reg) {
            const ctrl = reg[id];
            if (ctrl.isA && id.endsWith("playground--hostContainer") && ctrl.getItems && ctrl.getItems().length > 0) {
                host = ctrl.getItems()[0];
                break;
            }
        }
        const engine = host._innerHost.engine;
        const dom = host.getDomRef();
        const rect = dom.getBoundingClientRect();
        return {
            paths: engine.getActivePlugins().map((e) => e.path.replace(/^\//, "")),
            titleValue: engine.getPluginByPath("PlaygroundTitle").control.getValue(),
            qtyValue: String(engine.getPluginByPath("PlaygroundQty").control.getValue()),
            inputValues: Array.prototype.map.call(dom.querySelectorAll("input"), (i) => i.value),
            width: Math.round(rect.width),
            height: Math.round(rect.height)
        };
    });
    const missingPlaygroundFields = PLAYGROUND_FIELDS.filter((f) => !playground.paths.includes(f));
    if (missingPlaygroundFields.length > 0) {
        throw new Error(
            `Playground generation check failed: rendered [${playground.paths.join(", ")}], missing [${missingPlaygroundFields.join(", ")}]`
        );
    }
    if (
        playground.titleValue !== PLAYGROUND_DATA.PlaygroundTitle ||
        playground.qtyValue !== String(PLAYGROUND_DATA.PlaygroundQty) ||
        !playground.inputValues.includes(PLAYGROUND_DATA.PlaygroundTitle) ||
        playground.width <= 0 ||
        playground.height <= 0
    ) {
        throw new Error(
            `Playground generation check failed: ${JSON.stringify(playground)} does not match typed payload ${JSON.stringify(PLAYGROUND_DATA)}`
        );
    }
    console.log(
        `  [PASS] Freeform Playground route generated ${playground.paths.length} widgets (${playground.width}x${playground.height}px) from the typed schema and bound the typed payload into them`
    );

    // Navigate to OData V4 Test View (#/odata) and verify OData V4 context extraction into DynamicHost
    await page.goto(`${baseUrl}/index.html#/odata`, { waitUntil: "networkidle2", timeout: 30000 });
    await page.waitForFunction(
        () => {
            const reg = sap.ui.core.Element.registry.all();
            for (const id in reg) {
                const ctrl = reg[id];
                if (ctrl.isA && ctrl.isA("nz.co.siliconst.ui5.metaui.controls.DynamicHost") && id.endsWith("odataHost")) {
                    const out = ctrl.getProperty("outputData");
                    if (out && out.FirstName === "Ada" && out.LastName === "Lovelace") return true;
                }
            }
            return false;
        },
        { timeout: 30000 }
    );
    console.log(`  [PASS] OData V4 route (#/odata) resolved $metadata and populated DynamicHost from /Employees('E100')`);

    await page.close();

    if (pageErrors.length > 0 || consoleErrors.length > 0 || networkErrors.length > 0) {
        throw new Error(
            `Fiori Sandbox verification encountered errors (pageErrors=${pageErrors.length}, consoleErrors=${consoleErrors.length}, networkErrors=${networkErrors.length})`
        );
    }
}

// The consumer fixture covering every widget category and hardware control. Hoisted to module scope
// so the standalone consumer verification and the axe-core accessibility scan render the SAME tree:
// an a11y scan of a second, hand-maintained schema would drift away from what is actually shipped.
const CONSUMER_ALL_WIDGETS_SCHEMA = {
    type: "object",
    layoutStrategy: "form",
    required: ["Title", "Qty"],
    definitions: {
        RefPart: {
            type: "object",
            properties: { PartCode: { type: "string", default: "P-100" } }
        }
    },
    properties: {
        Title: { type: "string", minLength: 3, ui: { label: "Title" } },
        Notes: { type: "string", ui: { widget: "textArea", label: "Notes" } },
        Qty: { type: "integer", minimum: 1, ui: { label: "Quantity" } },
        StepVal: { type: "number", minimum: 0, maximum: 50, ui: { widget: "step", label: "Step" } },
        SlideVal: { type: "number", minimum: 0, maximum: 100, ui: { widget: "slider", label: "Slider" } },
        RatingVal: { type: "number", maximum: 5, ui: { widget: "rating", label: "Rating" } },
        Active: { type: "boolean", ui: { label: "Active" } },
        Toggle: { type: "boolean", ui: { widget: "switch", label: "Toggle" } },
        Category: { type: "string", enum: ["A", "B", "C"], ui: { widget: "select", label: "Category" } },
        MultiOpt: {
            type: "array",
            items: { type: "string", enum: ["M1", "M2", "M3"] },
            ui: { widget: "multiSelect", label: "MultiSelect" }
        },
        Tokens: {
            type: "array",
            items: { type: "string" },
            ui: { widget: "multiInput", label: "Tokens" }
        },
        DueDate: { type: "date", ui: { label: "Due Date" } },
        CreatedAt: { type: "string", ui: { widget: "datetime", label: "Created At" } },
        AlarmTime: { type: "string", ui: { widget: "time", label: "Alarm Time" } },
        Secret: { type: "string", ui: { widget: "password", label: "Password" } },
        EmailAddr: { type: "string", format: "email", ui: { widget: "email", label: "Email" } },
        DocsUrl: { type: "string", ui: { widget: "link", label: "Documentation" } },
        UploadDoc: { type: "string", ui: { widget: "fileUploader", label: "Upload File" } },
        BannerMsg: { type: "string", ui: { widget: "messageStrip", label: "Banner" } },
        VoiceNote: { type: "string", ui: { widget: "voiceInput", label: "Voice Note" } },
        GpsCoords: { type: "object", ui: { widget: "location", label: "GPS Coordinates" } },
        SignatureImg: { type: "string", ui: { widget: "signature", label: "Signature" } },
        CameraSnap: { type: "string", ui: { widget: "camera", label: "Camera" } },
        HtmlBody: { type: "string", ui: { widget: "richText", label: "Rich Text" } },
        JsonSnippet: { type: "string", ui: { widget: "codeEditor", label: "Code Editor" } },
        RemoteDrop: {
            type: "string",
            ui: {
                widget: "remoteDropdown",
                label: "Remote Dropdown",
                dataSource: { url: "/mockData/scenarios/index.json", keyField: "category", textField: "category" }
            }
        },
        ComboDrop: {
            type: "string",
            ui: {
                widget: "combobox",
                label: "ComboBox",
                dataSource: { url: "/mockData/scenarios/index.json", keyField: "category", textField: "category" }
            }
        },
        ODataDrop: {
            type: "string",
            ui: {
                widget: "odataSelect",
                label: "OData Select",
                dataSource: { url: "/Categories", keyField: "Id", textField: "Name" }
            }
        },
        SearchBox: {
            type: "string",
            ui: {
                widget: "liveSearch",
                label: "Live Search",
                dataSource: { url: "/mockData/scenarios/index.json", keyField: "category", textField: "category" }
            }
        },
        ValHelpBox: {
            type: "string",
            ui: {
                widget: "valueHelp",
                label: "Value Help",
                dataSource: { url: "/mockData/scenarios/index.json", keyField: "category", textField: "category" }
            }
        },
        PolyUnion: {
            type: "object",
            ui: { widget: "polymorphic", label: "Polymorphic Variant" },
            oneOf: [
                { title: "Card", type: "object", properties: { CardNo: { type: "string" } } },
                { title: "Bank", type: "object", properties: { Iban: { type: "string" } } }
            ]
        },
        EnvMap: {
            type: "object",
            additionalProperties: { type: "string" },
            ui: { widget: "dictionaryMap", label: "Env Map" }
        },
        SubObj: {
            type: "object",
            properties: { SubName: { type: "string" } },
            ui: { label: "Sub Object" }
        },
        SubArr: {
            type: "array",
            items: { type: "object", properties: { ItemCode: { type: "string", required: true } } },
            ui: { label: "Sub Array" }
        },
        RefObj: {
            type: "object",
            $ref: "#/definitions/RefPart",
            ui: { widget: "reference", label: "Ref Object" }
        },
        NavAct: { type: "string", ui: { widget: "urlButton", label: "Open Docs", options: { url: "https://ui5.sap.com" } } },
        SubmitAct: { type: "string", ui: { widget: "submitButton", label: "Submit Form" } },
        ClearAct: { type: "string", ui: { widget: "clearButton", label: "Clear Form" } }
    }
};

const CONSUMER_ALL_WIDGETS_DATA = {
    Title: "Consumer Item",
    Notes: "Line 1\nLine 2",
    Qty: 4,
    StepVal: 10,
    SlideVal: 40,
    RatingVal: 4,
    Active: true,
    Toggle: true,
    Category: "B",
    MultiOpt: ["M1", "M2"],
    Tokens: ["alpha", "beta"],
    DueDate: "2026-10-22",
    CreatedAt: "2026-10-22T08:30:00Z",
    AlarmTime: "08:30:00",
    Secret: "hunter2",
    EmailAddr: "dev@siliconst.co.nz",
    DocsUrl: "https://ui5.sap.com",
    UploadDoc: "report.pdf",
    BannerMsg: "System status normal",
    VoiceNote: "Recorded note",
    GpsCoords: { lat: -36.8485, lng: 174.7633 },
    SignatureImg: null,
    CameraSnap: null,
    HtmlBody: "<p>Hello</p>",
    JsonSnippet: '{"ok":true}',
    RemoteDrop: "Standard Schemas",
    ComboDrop: "Standard Schemas",
    ODataDrop: "CAT-1",
    SearchBox: "Standard",
    ValHelpBox: "Standard Schemas",
    PolyUnion: { CardNo: "4111" },
    EnvMap: { PORT: "8080" },
    SubObj: { SubName: "Inner" },
    SubArr: [{ ItemCode: "IC-1" }],
    RefObj: { PartCode: "P-100" }
};

async function runStandaloneConsumerVerification(browser, baseUrl) {
    console.log(`\\n============================================================`);
    console.log(`Running Standalone Consumer Page Verification (Outside ScenarioRunner): ${baseUrl}/standalone-consumer.html`);
    console.log(`============================================================`);

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    const { pageErrors, consoleErrors, networkErrors } = attachPageDiagnostics(page, "CONSUMER");

    await page.goto(`${baseUrl}/standalone-consumer.html`, { waitUntil: "networkidle2", timeout: 60000 });
    await page.waitForFunction(() => typeof window.sap !== "undefined" && window.sap.ui && window.sap.ui.getCore, {
        timeout: 30000
    });

    const verification = await page.evaluate(async (allWidgetsSchema, allWidgetsData) => {
        await new Promise((resolve) => sap.ui.getCore().attachInit(resolve));

        const [DynamicHost, VBox, JSONModel, Core, Messaging] = await new Promise((resolve, reject) => {
            sap.ui.require(
                [
                    "nz/co/siliconst/ui5/metaui/controls/DynamicHost",
                    "sap/m/VBox",
                    "sap/ui/model/json/JSONModel",
                    "sap/ui/core/Core",
                    "sap/ui/core/Messaging"
                ],
                (...mods) => resolve(mods),
                reject
            );
        });

        const results = {
            renderedWidgets: 0,
            zeroGeometryWidgets: [],
            hardwareChecks: {},
            layoutChecks: {},
            dialogChecks: {}
        };

        const container = new VBox({ width: "1000px" });
        container.placeAt("consumer-mount");
        Core.applyChanges();

        let parentInvalidations = 0;
        const origInvalidate = container.invalidate.bind(container);
        container.invalidate = function (oOrigin) {
            parentInvalidations++;
            origInvalidate(oOrigin);
        };

        // 1. Standalone Consumer Form with All Widget Categories & Hardware Controls
        const formHost = new DynamicHost({
            schemaDefinition: allWidgetsSchema,
            data: allWidgetsData,
            editable: true,
            liveUpdate: true,
            useMessageManager: true
        });
        container.addItem(formHost);
        Core.applyChanges();
        await formHost.generate();
        Core.applyChanges();
        await new Promise((r) => setTimeout(r, 100));

        const activePlugins = formHost._innerHost.engine.getActivePlugins();
        results.renderedWidgets = activePlugins.length;
        results.renderedWidgetPaths = activePlugins.map((entry) => entry.path.replace(/^\//, ""));
        results.expectedWidgetPaths = Object.keys(allWidgetsSchema.properties);

        // Coverage is measured per schema property, and one property does not always mean one
        // active plugin: an inline array (SubArr) renders as a table whose row cells are pushed
        // into Engine's private templatePlugins list, so nothing is registered at path "SubArr"
        // and its template plugin's path is the ITEM property ("ItemCode"), carrying no trace of
        // the owning property. The owning property is instead visible as a real binding on a
        // rendered control (the sap.m.Table binds items to "/SubArr"), so coverage falls back to
        // the rendered control tree: every binding path on a control that actually has DOM.
        const boundPaths = [];
        const subtree = [formHost].concat(formHost.findAggregatedObjects(true));
        for (const ctrl of subtree) {
            if (!ctrl.getMetadata || !ctrl.getDomRef || !ctrl.getDomRef()) continue;
            const meta = ctrl.getMetadata();
            const names = Object.keys(meta.getAllProperties()).concat(Object.keys(meta.getAllAggregations()));
            const ctx = ctrl.getBindingContext ? ctrl.getBindingContext() : null;
            const ctxPath = ctx && ctx.getPath ? ctx.getPath() : "";
            for (const name of names) {
                const info = ctrl.getBindingInfo ? ctrl.getBindingInfo(name) : undefined;
                if (!info) continue;
                const rawPaths = [];
                if (info.path) rawPaths.push(info.path);
                for (const part of info.parts || []) {
                    if (part && part.path) rawPaths.push(part.path);
                }
                for (const rawPath of rawPaths) {
                    const absolute = rawPath.charAt(0) === "/" ? rawPath : ctxPath ? ctxPath + "/" + rawPath : "";
                    if (absolute) boundPaths.push(absolute.replace(/^\//, ""));
                }
            }
        }
        results.boundPaths = boundPaths.filter((v, i, a) => a.indexOf(v) === i);

        for (const entry of activePlugins) {
            const ctrl = entry.plugin.control;
            const dom = ctrl ? ctrl.getDomRef() : null;
            if (!dom) {
                results.zeroGeometryWidgets.push(`${entry.path}:missing_dom`);
                continue;
            }
            const rect = dom.getBoundingClientRect();
            const style = window.getComputedStyle(dom);
            if (rect.width <= 0 || rect.height <= 0 || style.display === "none" || style.visibility === "hidden") {
                results.zeroGeometryWidgets.push(`${entry.path}:${Math.round(rect.width)}x${Math.round(rect.height)}`);
            }
        }

        // Verify hardware inner elements (<canvas>, <video>, HBox inputs)
        const sigCanvas = document.querySelector("canvas[id$='-sig-canvas']");
        const camVideo = document.querySelector("video[id$='-video']");
        const sigRect = sigCanvas ? sigCanvas.getBoundingClientRect() : { width: 0, height: 0 };
        const camRect = camVideo ? camVideo.getBoundingClientRect() : { width: 0, height: 0 };
        const voiceCtrl = formHost._innerHost.engine.getPluginByPath("VoiceNote").control;
        const voiceInputRect = voiceCtrl.textInput.getDomRef().getBoundingClientRect();
        const geoCtrl = formHost._innerHost.engine.getPluginByPath("GpsCoords").control;
        const geoInputRect = geoCtrl.coordInput.getDomRef().getBoundingClientRect();
        const sigCtrl = formHost._innerHost.engine.getPluginByPath("SignatureImg").control;
        sigCtrl.setValueState("Error");
        sigCtrl.setValueStateText("Signature required");
        const sigNoDetachOnError =
            typeof sigCanvas?.onmousedown === "function" &&
            sigCtrl.getDomRef().getAttribute("aria-invalid") === "true";
        sigCtrl.setValueState("None");
        sigCtrl.setValueStateText("");

        results.hardwareChecks = {
            sigCanvasVisible: sigRect.width >= 200 && sigRect.height >= 100 && sigNoDetachOnError,
            camVideoVisible: camRect.width >= 200 && camRect.height >= 150,
            voiceInputGrows: voiceInputRect.width >= 150,
            geoInputGrows: geoInputRect.width >= 150
        };

        // Verify Display Mode (editable: false) renders expected display text on known fields
        formHost.setProperty("editable", false);
        await formHost.generate();
        Core.applyChanges();
        const displayTitleCtrl = formHost._innerHost.engine.getPluginByPath("Title")?.control;
        const displaySecretCtrl = formHost._innerHost.engine.getPluginByPath("Secret")?.control;
        results.layoutChecks.displayModeRendered =
            displayTitleCtrl?.getMetadata()?.getName() === "sap.m.Text" &&
            displayTitleCtrl.getText() === "Consumer Item" &&
            displaySecretCtrl?.getMetadata()?.getName() === "sap.m.Text" &&
            displaySecretCtrl.getText() === "********";
        container.removeItem(formHost);
        formHost.destroy();

        // 2. Verify Table, Wizard, and Compact Layouts in Standalone Consumer Page
        for (const strategy of ["table", "wizard", "compact"]) {
            const schema =
                strategy === "table"
                    ? {
                          type: "array",
                          layoutStrategy: "table",
                          items: {
                              type: "object",
                              properties: {
                                  Name: { type: "string", required: true },
                                  Count: { type: "integer", minimum: 1 }
                              }
                          }
                      }
                    : strategy === "wizard"
                      ? {
                            type: "object",
                            layoutStrategy: "wizard",
                            properties: {
                                StepOneField: { type: "string", required: true },
                                StepTwoField: { type: "string" }
                            },
                            uiLayout: [
                                {
                                    type: "WizardStep",
                                    label: "Step 1",
                                    elements: [{ type: "Control", scope: "#/properties/StepOneField" }]
                                },
                                {
                                    type: "WizardStep",
                                    label: "Step 2",
                                    elements: [{ type: "Control", scope: "#/properties/StepTwoField" }]
                                }
                            ]
                        }
                      : {
                            type: "object",
                            layoutStrategy: "compact",
                            properties: {
                                A: { type: "string" },
                                B: { type: "number" }
                            }
                        };
            const data =
                strategy === "table"
                    ? [{ Name: "Row 1", Count: 3 }]
                    : strategy === "wizard"
                      ? { StepOneField: "Ready", StepTwoField: "Done" }
                      : { A: "CompactVal", B: 42 };

            const lHost = new DynamicHost({ schemaDefinition: schema, data, editable: true });
            container.addItem(lHost);
            Core.applyChanges();
            await lHost.generate();
            Core.applyChanges();
            const rect = lHost.getDomRef().getBoundingClientRect();
            let wizardStepRetained = true;
            if (strategy === "wizard") {
                const stepOneCtrl = lHost._innerHost.engine.getPluginByPath("StepOneField").control;
                const nextBtn = lHost.getDomRef().querySelectorAll(".sapMBtn")[1];
                if (nextBtn) {
                    const nextUi5 = sap.ui.core.Element.closestTo(nextBtn);
                    if (nextUi5 && nextUi5.firePress) {
                        nextUi5.firePress();
                        Core.applyChanges();
                    }
                }
                wizardStepRetained = stepOneCtrl.getParent() !== null && !!stepOneCtrl.getModel(lHost._innerHost.activeModelName);
            }
            results.layoutChecks[strategy] = rect.width > 0 && rect.height > 0 && wizardStepRetained && lHost.triggerSubmit() === true;
            container.removeItem(lHost);
            lHost.destroy();
        }

        // 3. Verify Dependent Dialog Host Isolation & Validation/Messaging Lifecycle
        parentInvalidations = 0;
        const dialogHost = new DynamicHost({
            schemaDefinition: {
                type: "object",
                required: ["OrderCode"],
                properties: {
                    OrderCode: { type: "string", minLength: 4, ui: { label: "Order Code" } }
                }
            },
            data: { OrderCode: "AB" },
            editable: true,
            useMessageManager: true
        });
        container.addAggregation("dependents", dialogHost, true);
        const closePromise = dialogHost.openInDialog("Consumer Dialog", "Confirm", "Cancel", "auto", container);
        await dialogHost.generate();
        await new Promise((r) => setTimeout(r, 80));
        Core.applyChanges();

        const blockedOnInvalid = dialogHost.triggerSubmit() === false;
        const messagesOnInvalid = dialogHost.getStateManager().getOwnMessages().length;

        const orderInput = dialogHost._innerHost.engine.getPluginByPath("OrderCode").control;
        orderInput.setValue("ORD-9000");
        orderInput.fireChange({ value: "ORD-9000" });

        const messagesAfterFix = dialogHost.getStateManager().getOwnMessages().length;
        const activeDialog = dialogHost._innerHost.dialogDelegate.activeDialog;
        activeDialog.getBeginButton().firePress();
        await closePromise;
        Core.applyChanges();

        results.dialogChecks = {
            parentInvalidations,
            blockedOnInvalid,
            messagesOnInvalid,
            messagesAfterFix
        };

        dialogHost.destroy();

        // 4. Verify Optimal Model Usage: On-Demand Get, On-Demand Push, and Live Two-Way Binding (Object, String, OData)
        const consumerModel = new sap.ui.model.json.JSONModel({
            objPayload: { Code: "INIT-OBJ", Qty: 10 },
            strPayload: JSON.stringify({ Code: "INIT-STR", Qty: 20 })
        });
        const syncSchema = {
            type: "object",
            required: ["Code", "Qty"],
            properties: {
                Code: { type: "string", minLength: 3 },
                Qty: { type: "integer", minimum: 1 }
            }
        };

        // 4a. Transactional Object Binding (liveUpdate: false) -> On-Demand Get & On-Demand Push
        const txHost = new DynamicHost({
            schemaDefinition: syncSchema,
            liveUpdate: false,
            editable: true
        });
        txHost.setModel(consumerModel);
        txHost.bindProperty("data", { path: "/objPayload" });
        container.addItem(txHost);
        Core.applyChanges();
        await txHost.generate();
        Core.applyChanges();

        const txCodeInput = txHost._innerHost.engine.getPluginByPath("Code").control;
        txCodeInput.setValue("EDITED-OBJ");
        txCodeInput.fireChange({ value: "EDITED-OBJ" });

        const shieldedBeforeSubmit =
            consumerModel.getProperty("/objPayload/Code") === "INIT-OBJ" &&
            JSON.parse(txHost.getProperty("dataJson")).Code === "INIT-OBJ";
        const onDemandOutputBeforeSubmit = txHost.getProperty("outputData").Code === "EDITED-OBJ";
        const txSubmitted = txHost.triggerSubmit() === true;
        const onDemandJsonBeforeSubmit = JSON.parse(txHost.getProperty("dataJson")).Code === "EDITED-OBJ";
        const pushedAfterSubmit = consumerModel.getProperty("/objPayload/Code") === "EDITED-OBJ";
        container.removeItem(txHost);
        txHost.destroy();

        // 4b. Live Two-Way String Binding (liveUpdate: true)
        const liveStrHost = new DynamicHost({
            schemaDefinition: syncSchema,
            liveUpdate: true,
            editable: true
        });
        liveStrHost.setModel(consumerModel);
        liveStrHost.bindProperty("dataJson", { path: "/strPayload" });
        container.addItem(liveStrHost);
        Core.applyChanges();
        await liveStrHost.generate();
        Core.applyChanges();

        const liveStrInput = liveStrHost._innerHost.engine.getPluginByPath("Code").control;
        liveStrInput.setValue("LIVE-STR-OK");
        liveStrInput.fireChange({ value: "LIVE-STR-OK" });
        const liveStringSynced = JSON.parse(consumerModel.getProperty("/strPayload")).Code === "LIVE-STR-OK";
        container.removeItem(liveStrHost);
        liveStrHost.destroy();
        consumerModel.destroy();

        results.modelChecks = {
            shieldedBeforeSubmit,
            onDemandOutputBeforeSubmit,
            onDemandJsonBeforeSubmit,
            txSubmitted,
            pushedAfterSubmit,
            liveStringSynced
        };

        container.destroy();
        return results;
    }, CONSUMER_ALL_WIDGETS_SCHEMA, CONSUMER_ALL_WIDGETS_DATA);

    // The widget count used to be printed and never checked: half the form could vanish and the
    // banner still said PASS. Every property of the consumer schema must own a rendered plugin.
    const isCovered = (prop) =>
        verification.renderedWidgetPaths.includes(prop) ||
        verification.boundPaths.some((bound) => bound === prop || bound.indexOf(prop + "/") === 0);
    const missingConsumerWidgets = verification.expectedWidgetPaths.filter((p) => !isCovered(p));
    const unexpectedConsumerWidgets = verification.renderedWidgetPaths.filter(
        (p) => !verification.expectedWidgetPaths.includes(p)
    );
    if (missingConsumerWidgets.length > 0 || unexpectedConsumerWidgets.length > 0) {
        throw new Error(
            `Standalone consumer widget coverage failed: ${verification.expectedWidgetPaths.length} schema properties, ${verification.renderedWidgets} active widget plugins. Properties that rendered nothing: [${missingConsumerWidgets.join(", ")}]. Plugins with no matching property: [${unexpectedConsumerWidgets.join(", ")}]`
        );
    }
    console.log(
        `  [PASS] Standalone Consumer Page covered all ${verification.expectedWidgetPaths.length} schema properties (${verification.renderedWidgets} widget plugins with physical DOM geometry + inline arrays bound on rendered controls)`
    );
    if (verification.zeroGeometryWidgets.length > 0) {
        throw new Error(`Zero-geometry widgets detected: ${verification.zeroGeometryWidgets.join(", ")}`);
    }
    if (
        !verification.hardwareChecks.sigCanvasVisible ||
        !verification.hardwareChecks.camVideoVisible ||
        !verification.hardwareChecks.voiceInputGrows ||
        !verification.hardwareChecks.geoInputGrows
    ) {
        throw new Error(`Hardware geometry check failed: ${JSON.stringify(verification.hardwareChecks)}`);
    }
    console.log(`  [PASS] Hardware controls (<canvas>, <video>, Voice/Geo FlexItemData inputs) verified with non-zero geometry`);

    if (
        !verification.layoutChecks.displayModeRendered ||
        !verification.layoutChecks.table ||
        !verification.layoutChecks.wizard ||
        !verification.layoutChecks.compact
    ) {
        throw new Error(`Layout strategy check failed: ${JSON.stringify(verification.layoutChecks)}`);
    }
    console.log(`  [PASS] All layout strategies (form, table, wizard, compact) + display mode verified in standalone consumer app`);

    if (
        verification.dialogChecks.parentInvalidations !== 0 ||
        !verification.dialogChecks.blockedOnInvalid ||
        verification.dialogChecks.messagesOnInvalid === 0 ||
        verification.dialogChecks.messagesAfterFix !== 0
    ) {
        throw new Error(`Dialog & Messaging lifecycle check failed: ${JSON.stringify(verification.dialogChecks)}`);
    }
    console.log(`  [PASS] Dialog isolation (0 parent invalidations) & Single-Authority Messaging cleanup (0 stuck messages) verified`);

    if (
        !verification.modelChecks.shieldedBeforeSubmit ||
        !verification.modelChecks.onDemandOutputBeforeSubmit ||
        !verification.modelChecks.onDemandJsonBeforeSubmit ||
        !verification.modelChecks.txSubmitted ||
        !verification.modelChecks.pushedAfterSubmit ||
        !verification.modelChecks.liveStringSynced
    ) {
        throw new Error(`Model synchronization check failed: ${JSON.stringify(verification.modelChecks)}`);
    }
    console.log(`  [PASS] Optimal Model Usage (on-demand outputData/dataJson get, transactional submit push, and live two-way binding) verified`);

    await page.close();

    if (pageErrors.length > 0 || consoleErrors.length > 0 || networkErrors.length > 0) {
        throw new Error(
            `Standalone consumer verification encountered errors (pageErrors=${pageErrors.length}, consoleErrors=${consoleErrors.length}, networkErrors=${networkErrors.length})`
        );
    }
}

// Schemas that exist only for the accessibility scan, covering the three shapes where a generated field
// has no visible sap.m.Label of its own: a table cell (named by its column header), a form whose labels
// are suppressed with ui.labelSpan: 0, and a wizard whose steps must be announced as named regions.
const A11Y_EXTRA_FIXTURES = [
    {
        label: "table",
        schema: {
            type: "array",
            layoutStrategy: "table",
            items: {
                type: "object",
                properties: {
                    Name: { type: "string", required: true, description: "Row display name" },
                    Count: { type: "integer", minimum: 1 },
                    Active: { type: "boolean" }
                }
            }
        },
        data: [
            { Name: "Row 1", Count: 3, Active: true },
            { Name: "Row 2", Count: 7, Active: false }
        ]
    },
    {
        label: "wizard",
        schema: {
            type: "object",
            layoutStrategy: "wizard",
            properties: {
                StepOneField: { type: "string", required: true, description: "Entered in the first step" },
                StepTwoField: { type: "string" }
            },
            uiLayout: [
                { type: "WizardStep", label: "Step 1", elements: [{ type: "Control", scope: "#/properties/StepOneField" }] },
                { type: "WizardStep", label: "Step 2", elements: [{ type: "Control", scope: "#/properties/StepTwoField" }] }
            ]
        },
        data: { StepOneField: "Ready", StepTwoField: "Done" }
    },
    {
        label: "compact",
        schema: {
            type: "object",
            layoutStrategy: "compact",
            properties: {
                A: { type: "string", description: "Compact string field" },
                B: { type: "number" }
            }
        },
        data: { A: "CompactVal", B: 42 }
    },
    {
        label: "labelSpanZero",
        schema: {
            type: "object",
            layoutStrategy: "form",
            ui: { labelSpan: 0 },
            required: ["Unlabelled"],
            properties: {
                Unlabelled: { type: "string", ui: { label: "Suppressed Label Field" }, description: "No visible label" },
                UnlabelledPick: { type: "string", enum: ["X", "Y"], ui: { widget: "select", label: "Suppressed Select" } }
            }
        },
        data: { Unlabelled: "", UnlabelledPick: "X" }
    }
];

/**
 * Accessibility findings that come out of SAPUI5's own control renderers rather than out of MetaUI's
 * wiring. Each entry pins ONE rule to ONE control so a regression in MetaUI's own output still fails:
 * matching is per rule id AND per selector fragment, never per rule alone. An entry that stops matching
 * is reported as stale and fails the gate, so the list cannot quietly rot into a blanket suppression.
 */
const AXE_UI5_ALLOWLIST = [
    {
        rule: "aria-valid-attr-value",
        selectorIncludes: "-Title-inner",
        reason:
            "sap.m.InputBase renders aria-errormessage pointing at its own '<id>-message-sr' div, and renders " +
            "that div with neither aria-live nor role=alert. MetaUI only calls the documented setValueState / " +
            "setValueStateText API; the id, the element and its attributes all come out of SAPUI5's renderer. " +
            "The only way to satisfy axe from here is to write aria-describedby onto that private UI5 DOM id, " +
            "which couples MetaUI to a renderer internal, and SAPUI5 already exposes aria-invalid=\"true\" on " +
            "the same input, so the invalid state itself does reach assistive technology."
    },
    {
        rule: "label-title-only",
        selectorIncludes: "-Unlabelled-inner",
        reason:
            "axe best-practice rule (not WCAG): it wants a VISIBLE label, and discounts a label supplied by " +
            "sap.ui.core.InvisibleText because UI5 renders that text with aria-hidden=\"true\". This field sets " +
            "ui.labelSpan: 0, which is the schema author explicitly asking for a layout with no visible label; " +
            "MetaUI cannot invent one. The field still has a correct accessible name - aria-labelledby resolves " +
            "to the InvisibleText, which the accname spec includes precisely because it is referenced directly - " +
            "and the rule only fires at all because MetaUI additionally exposes ui.description as a description."
    }
];

const AXE_FAILING_IMPACTS = ["serious", "critical"];

/**
 * Resolves the bundled axe-core runtime. Resolution is deliberately lazy and deliberately fatal: a
 * missing axe-core must fail the accessibility gate loudly rather than skip it, and it must not stop
 * `npm run lint` or `npm run metrics` from running at all.
 */
function resolveAxeSourcePath() {
    try {
        return require.resolve("axe-core/axe.min.js");
    } catch (err) {
        void err;
        throw new Error(
            "axe-core is not installed, so the accessibility gate cannot run. Add it to devDependencies: " +
                '"axe-core": "4.14.0"'
        );
    }
}

async function runAccessibilityScan(browser, baseUrl) {
    const axeSourcePath = resolveAxeSourcePath();
    const axeVersion = require("axe-core/package.json").version;
    console.log(`\n============================================================`);
    console.log(`Running axe-core ${axeVersion} Accessibility Scan: ${baseUrl}/standalone-consumer.html`);
    console.log(`============================================================`);

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    const { pageErrors, consoleErrors, networkErrors } = attachPageDiagnostics(page, "A11Y");

    await page.goto(`${baseUrl}/standalone-consumer.html`, { waitUntil: "networkidle2", timeout: 60000 });
    await page.waitForFunction(() => typeof window.sap !== "undefined" && window.sap.ui && window.sap.ui.getCore, {
        timeout: 30000
    });

    const fixture = await page.evaluate(
        async (allWidgetsSchema, allWidgetsData, extraFixtures) => {
            await new Promise((resolve) => sap.ui.getCore().attachInit(resolve));
            const [DynamicHost, VBox, Core] = await new Promise((resolve, reject) => {
                sap.ui.require(
                    ["nz/co/siliconst/ui5/metaui/controls/DynamicHost", "sap/m/VBox", "sap/ui/core/Core"],
                    (...mods) => resolve(mods),
                    reject
                );
            });

            const container = new VBox({ width: "1000px" });
            container.placeAt("consumer-mount");
            Core.applyChanges();

            const addHost = async (settings) => {
                const host = new DynamicHost(settings);
                container.addItem(host);
                Core.applyChanges();
                await host.generate();
                Core.applyChanges();
                return host;
            };

            // Every widget category in edit mode, with a live validation error painted onto one field so
            // the invalid state is scanned too, not only the pristine state.
            const formHost = await addHost({
                schemaDefinition: allWidgetsSchema,
                data: allWidgetsData,
                editable: true,
                liveUpdate: true,
                useMessageManager: true
            });
            const titlePlugin = formHost._innerHost.engine.getPluginByPath("Title");
            titlePlugin.control.setValue("x");
            titlePlugin.control.fireChange({ value: "x" });
            Core.applyChanges();

            // The same widget set in display mode: read-only output still needs an accessible name.
            await addHost({ schemaDefinition: allWidgetsSchema, data: allWidgetsData, editable: false });

            for (const extra of extraFixtures) {
                await addHost({ schemaDefinition: extra.schema, data: extra.data, editable: true });
            }

            await new Promise((r) => setTimeout(r, 250));
            Core.applyChanges();

            return {
                hostCount: container.getItems().length,
                renderedElements: document.querySelectorAll("#consumer-mount *").length
            };
        },
        CONSUMER_ALL_WIDGETS_SCHEMA,
        CONSUMER_ALL_WIDGETS_DATA,
        A11Y_EXTRA_FIXTURES
    );

    await page.addScriptTag({ path: axeSourcePath });

    // Scoped to the mount point: MetaUI owns the control tree it generates, not the host document that a
    // consuming application supplies. Document-level rules (html-has-lang, landmarks, page title) belong
    // to that application and are deliberately out of scope rather than silently passed.
    const violations = await page.evaluate(async () => {
        const run = await window.axe.run("#consumer-mount", { resultTypes: ["violations"] });
        const flat = [];
        for (const violation of run.violations) {
            for (const node of violation.nodes) {
                flat.push({
                    ruleId: violation.id,
                    impact: node.impact || violation.impact,
                    help: violation.help,
                    helpUrl: violation.helpUrl,
                    target: Array.isArray(node.target) ? node.target.join(" ") : String(node.target),
                    summary: (node.failureSummary || "").replace(/\s+/g, " ").trim()
                });
            }
        }
        return flat;
    });

    await page.close();

    const failing = violations.filter((v) => AXE_FAILING_IMPACTS.includes(v.impact));
    const matchedAllowlist = new Set();
    for (const v of failing) {
        v.allowlistIndex = AXE_UI5_ALLOWLIST.findIndex(
            (entry) => entry.rule === v.ruleId && v.target.includes(entry.selectorIncludes)
        );
        if (v.allowlistIndex >= 0) {
            matchedAllowlist.add(v.allowlistIndex);
        }
    }
    const blocking = failing.filter((v) => v.allowlistIndex < 0);

    console.log(
        `  Scanned ${fixture.hostCount} generated hosts / ${fixture.renderedElements} DOM elements under #consumer-mount.`
    );
    console.log(
        `  axe-core findings: ${violations.length} total, ${failing.length} at serious/critical impact, ` +
            `${failing.length - blocking.length} allowlisted to SAPUI5, ${blocking.length} blocking.`
    );

    for (const v of failing) {
        const allowed = v.allowlistIndex >= 0;
        console.log(`    [${allowed ? "ALLOWLISTED" : "VIOLATION"}] ${v.ruleId} (${v.impact}) -> ${v.target}`);
        console.log(`      ${v.help}. ${v.summary}`);
        if (allowed) {
            console.log(`      Allowlisted because: ${AXE_UI5_ALLOWLIST[v.allowlistIndex].reason}`);
        }
    }

    // Printed, not hidden: findings below the gate's threshold are still reported so a moderate finding
    // cannot sit unseen until the day its impact is reclassified upward.
    for (const v of violations.filter((candidate) => !AXE_FAILING_IMPACTS.includes(candidate.impact))) {
        console.log(`    [BELOW THRESHOLD] ${v.ruleId} (${v.impact}) -> ${v.target}`);
    }

    const staleAllowlist = AXE_UI5_ALLOWLIST.filter((_, idx) => !matchedAllowlist.has(idx));
    if (staleAllowlist.length > 0) {
        throw new Error(
            `[STALE_A11Y_ALLOWLIST] ${staleAllowlist.length} allowlist entr(ies) matched nothing and must be removed: ` +
                staleAllowlist.map((e) => `${e.rule} @ '${e.selectorIncludes}'`).join("; ")
        );
    }

    if (blocking.length > 0) {
        throw new Error(
            `Accessibility scan failed: ${blocking.length} serious/critical axe-core violation(s) in MetaUI output -> ` +
                blocking.map((v) => `${v.ruleId}(${v.impact}) @ ${v.target}`).join("; ")
        );
    }

    console.log(`  [PASS] No serious or critical axe-core violations in MetaUI's generated control tree`);

    if (pageErrors.length > 0 || consoleErrors.length > 0 || networkErrors.length > 0) {
        throw new Error(
            `Accessibility scan encountered errors (pageErrors=${pageErrors.length}, consoleErrors=${consoleErrors.length}, networkErrors=${networkErrors.length})`
        );
    }
}

async function main() {
    if (process.argv.includes("--metrics-only")) {
        printProjectMetrics();
        return;
    }
    // --qunit-breakdown prints the static per-QUnit.test model that the [METRICS_DRIFT] gate compares
    // against the live browser run. The live run prints the same "module :: name (N assertions)" shape,
    // so the two listings diff directly when a drift has to be traced back to one test.
    if (process.argv.includes("--qunit-breakdown")) {
        printQUnitBreakdown();
        return;
    }
    // --a11y-only runs the browser accessibility gate on its own. The scan needs the built library, the
    // local server and a browser, but not the QUnit pages, so this keeps the gate iterable while fixing
    // what it reports. The full `npm test` always runs it.
    const a11yOnly = process.argv.includes("--a11y-only");
    runStaticQualityGate();
    if (process.argv.includes("--lint-only")) {
        return;
    }
    const expectedMetrics = computeProjectMetrics();
    const { server, baseUrl } = await startServer();
    const profileDir = path.join(os.tmpdir(), `.metaui_chrome_profile_${process.pid}_${Date.now()}`);
    fs.mkdirSync(profileDir, { recursive: true });
    let browser;
    try {
        browser = await puppeteer.launch({
            headless: "new",
            userDataDir: profileDir,
            args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu"]
        });

        if (a11yOnly) {
            await runAccessibilityScan(browser, baseUrl);
            return;
        }

        const unitReport = await runQUnitPage(
            browser,
            `${baseUrl}/test/unit/unitTests.qunit.html`,
            "QUnit Unit Tests"
        );
        const integrationReport = await runQUnitPage(
            browser,
            `${baseUrl}/test/integration/opaTests.qunit.html`,
            "QUnit Integration & E2E Matrix Tests"
        );
        const drift = buildQUnitDriftReport(expectedMetrics.qunit, unitReport, integrationReport);
        if (drift) {
            throw new Error(drift);
        }
        await runFioriSandboxSmokeTest(browser, baseUrl);
        await runStandaloneConsumerVerification(browser, baseUrl);
        await runAccessibilityScan(browser, baseUrl);

        console.log(`\n============================================================`);
        console.log(
            `ALL TEST SUITES PASSED! Total QUnit Assertions: ${
                unitReport.totalAssertions + integrationReport.totalAssertions
            }`
        );
        console.log(`============================================================\n`);
    } finally {
        if (browser) {
            await browser.close();
        }
        server.close();
        try {
            fs.rmSync(profileDir, { recursive: true, force: true });
        } catch (cleanupErr) {
            void cleanupErr;
        }
    }
}

main().catch((err) => {
    console.error("\nTEST SUITE FAILED:", err.message || err);
    process.exit(1);
});
