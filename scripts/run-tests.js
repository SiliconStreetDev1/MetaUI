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
    //    docs/ARCHITECTURE.md, and docs/wiki/
    const mdFilesToAudit = [
        path.join(ROOT_DIR, "README.md"),
        path.join(ROOT_DIR, "CONTRIBUTING.md"),
        path.join(ROOT_DIR, "AGENTS.md"),
        path.join(ROOT_DIR, "docs", "ARCHITECTURE.md")
    ];
    const wikiDir = path.join(ROOT_DIR, "docs", "wiki");
    if (fs.existsSync(wikiDir)) {
        for (const mdFile of fs.readdirSync(wikiDir).filter((f) => f.endsWith(".md"))) {
            mdFilesToAudit.push(path.join(wikiDir, mdFile));
        }
    }
    for (const mdFull of mdFilesToAudit) {
        if (!fs.existsSync(mdFull)) continue;
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

    // 6c. Verify DefaultPluginBootstrapper.ts <-> TestOracle.js 1:1 parity (both directions + mapping count)
    const bootstrapperFile = path.join(SRC_DIR, "core", "DefaultPluginBootstrapper.ts");
    const oracleFile = path.join(WEBAPP_DIR, "test", "TestOracle.js");
    if (fs.existsSync(bootstrapperFile) && fs.existsSync(oracleFile)) {
        const bootText = fs.readFileSync(bootstrapperFile, "utf8");
        const oracleText = fs.readFileSync(oracleFile, "utf8");
        const bootSf = ts.createSourceFile(bootstrapperFile, bootText, ts.ScriptTarget.Latest, true);
        const constMap = new Map();
        const bootPaths = [];
        let registerPluginCalls = 0;

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

        function visitBoot(node) {
            if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
                const val = evalStringNode(node.initializer);
                if (typeof val === "string") {
                    constMap.set(node.name.text, val);
                }
            }
            if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
                const method = node.expression.name.text;
                if (method === "registerPluginPath") {
                    registerPluginCalls++;
                    const resolved = evalStringNode(node.arguments[2]);
                    if (resolved) bootPaths.push(resolved);
                } else if (
                    method === "registerLayoutPath" ||
                    method === "registerPolicyConditionPath" ||
                    method === "registerPolicyEffectPath"
                ) {
                    const resolved = evalStringNode(node.arguments[1]);
                    if (resolved) bootPaths.push(resolved);
                }
            }
            ts.forEachChild(node, visitBoot);
        }
        visitBoot(bootSf);

        const oraclePaths = [...oracleText.matchAll(/modulePath:\s*"(nz\/co\/siliconst\/ui5\/metaui\/[^"]+)"/g)].map(
            (m) => m[1]
        );
        for (const p of bootPaths) {
            if (!oracleText.includes(p)) {
                violations.push(`[ORACLE_PARITY] Plugin path '${p}' in DefaultPluginBootstrapper.ts is missing from TestOracle.js`);
            }
        }
        for (const p of oraclePaths) {
            if (!bootPaths.includes(p)) {
                violations.push(`[ORACLE_PARITY] Plugin path '${p}' in TestOracle.js is missing from DefaultPluginBootstrapper.ts`);
            }
        }
        if (registerPluginCalls !== oraclePaths.length) {
            violations.push(
                `[ORACLE_PARITY] DefaultPluginBootstrapper.ts has ${registerPluginCalls} registerPluginPath() calls but TestOracle.PLUGIN_MAP has ${oraclePaths.length} entries`
            );
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

    // 7. AST Symbol-Existence Gate over docs/wiki/*.md, README.md, and docs/ARCHITECTURE.md (Phase 16.1)
    const astSymbols = new Set();
    for (const file of tsFiles) {
        const baseNoExt = path.basename(file, ".ts");
        astSymbols.add(baseNoExt);
        const content = fs.readFileSync(file, "utf8");
        const sf = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
        function collectAstDeclarations(node) {
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
                const nameText = ts.isIdentifier(node.name) ? node.name.text : node.name.getText(sf);
                astSymbols.add(nameText);
            }
            if (ts.isTypeAliasDeclaration(node) && ts.isUnionTypeNode(node.type)) {
                for (const t of node.type.types) {
                    if (ts.isLiteralTypeNode(t) && ts.isStringLiteral(t.literal)) {
                        astSymbols.add(t.literal.text);
                    }
                }
            }
            ts.forEachChild(node, collectAstDeclarations);
        }
        collectAstDeclarations(sf);
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

    const symbolAuditFiles = [
        path.join(ROOT_DIR, "README.md"),
        path.join(ROOT_DIR, "CONTRIBUTING.md"),
        path.join(ROOT_DIR, "AGENTS.md"),
        path.join(ROOT_DIR, "docs", "ARCHITECTURE.md")
    ];
    if (fs.existsSync(wikiDir)) {
        for (const mdFile of fs.readdirSync(wikiDir).filter((f) => f.endsWith(".md"))) {
            symbolAuditFiles.push(path.join(wikiDir, mdFile));
        }
    }

    function isKnownOrAllowedSymbol(sym) {
        return astSymbols.has(sym) || DOC_SYMBOL_ALLOWLIST.has(sym);
    }

    for (const mdFull of symbolAuditFiles) {
        if (!fs.existsSync(mdFull)) continue;
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
                        continue;
                    }
                    if (qualifier && /^[A-Z]/.test(qualifier) && !isKnownOrAllowedSymbol(qualifier)) {
                        violations.push(
                            `[DOC_SYMBOL] ${relMd}:${lineNo} cites unknown class/object '${qualifier}' in '${raw}'.`
                        );
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
                    if (DOC_SYMBOL_ALLOWLIST.has(raw)) continue;
                    if (!isKnownOrAllowedSymbol(cls) || !isKnownOrAllowedSymbol(mem)) {
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

    if (violations.length > 0) {
        console.error(`  [FAIL] Static Quality Gate found ${violations.length} violation(s):`);
        for (const v of violations) {
            console.error(`    - ${v}`);
        }
        throw new Error(`Static Architectural Quality Gate failed with ${violations.length} violation(s).`);
    }

    console.log(
        `  [PASS] Audited ${tsFiles.length} src/ .ts files (0 violations, 0 exemptions, <=140 chars/line, full JSDoc, 0 any, 0 console, 0 empty catch) and ${scriptFiles.length + testFiles.length} scripts/ + test/ .js files (AST lint).`
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
    const counts = { validators: 0, formatters: 0 };
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
        }
        ts.forEachChild(node, visit);
    }
    visit(sf);
    return counts;
}

function computeQUnitAssertionsFromAst() {
    const oracleFile = path.join(TEST_DIR, "TestOracle.js");
    const oracleText = fs.readFileSync(oracleFile, "utf8");
    const oracle = vm.runInNewContext(oracleText, {
        sap: { ui: { define: (_deps, factory) => factory() } }
    });
    const oracleKeys = Object.keys(oracle.PLUGIN_MAP);
    const nonDefaultOracleCount = oracleKeys.filter((k) => !k.includes(":default")).length;
    const rowCloneCount = oracleKeys.filter((k) => Boolean(oracle.PLUGIN_MAP[k].supportsRowClone)).length;
    const layoutCount = Object.keys(oracle.LAYOUT_MAP).length;
    const condCount = Object.keys(oracle.POLICY_CONDITION_MAP).length;
    const effectCount = Object.keys(oracle.POLICY_EFFECT_MAP).length;
    const validatorCount = oracle.VALIDATOR_LIST.length;
    const formatterCount = oracle.FORMATTER_LIST.length;

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

    function countAssertionsInQUnitFile(filePath) {
        const content = fs.readFileSync(filePath, "utf8");
        const sf = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);

        function countTestBlock(testBody) {
            const bodyText = testBody.getText(sf);
            const usesRowCloneFilter = bodyText.includes(".supportsRowClone === true");

            function countNode(node, mult) {
                if (!node) return 0;
                if (
                    ts.isCallExpression(node) &&
                    ts.isPropertyAccessExpression(node.expression) &&
                    ts.isIdentifier(node.expression.expression) &&
                    node.expression.expression.text === "assert" &&
                    node.expression.name.text !== "async"
                ) {
                    return mult;
                }
                if (
                    ts.isCallExpression(node) &&
                    ts.isPropertyAccessExpression(node.expression) &&
                    node.expression.name.text === "forEach" &&
                    node.arguments.length > 0
                ) {
                    const targetExpr = node.expression.expression;
                    const targetText = targetExpr.getText(sf);
                    const cb = node.arguments[0];
                    const body = cb && (ts.isFunctionExpression(cb) || ts.isArrowFunction(cb)) ? cb.body : cb;
                    let loopMult = 1;
                    if (targetText === "TestOracle.VALIDATOR_LIST") loopMult = validatorCount;
                    else if (targetText === "TestOracle.FORMATTER_LIST") loopMult = formatterCount;
                    else if (targetText === "Object.keys(TestOracle.LAYOUT_MAP)") loopMult = layoutCount;
                    else if (targetText === "Object.keys(TestOracle.POLICY_CONDITION_MAP)") loopMult = condCount;
                    else if (targetText === "Object.keys(TestOracle.POLICY_EFFECT_MAP)") loopMult = effectCount;
                    else if (targetText === "oracleKeys") {
                        loopMult = usesRowCloneFilter ? rowCloneCount : oracleKeys.length;
                    } else if (ts.isArrayLiteralExpression(targetExpr)) {
                        loopMult = targetExpr.elements.length;
                    } else if (targetText === "schemaKeys") {
                        loopMult = kitchenSinkPropCount;
                    } else if (targetText === "scenarios") {
                        // 6 scenarios * 2 assertions each + OpenAPI v2 targets + OpenAPI v3 targets
                        return mult * (6 * 2 + openApiV2Targets + openApiV3Targets);
                    }
                    return countNode(body, mult * loopMult);
                }
                if (ts.isFunctionDeclaration(node) && node.name && node.name.text === "nextCell") {
                    return countNode(node.body, mult * 6);
                }
                if (ts.isIfStatement(node)) {
                    const condText = node.expression.getText(sf);
                    if (condText.includes('key.indexOf(":default") === -1') && mult === oracleKeys.length) {
                        return countNode(node.thenStatement, nonDefaultOracleCount);
                    }
                    if (condText.trim() === "idx === 0") {
                        return countNode(node.thenStatement, 1);
                    }
                    const thenCount = countNode(node.thenStatement, mult);
                    const elseCount = node.elseStatement ? countNode(node.elseStatement, mult) : 0;
                    if (thenCount > 0 && elseCount > 0) {
                        return thenCount;
                    }
                    return thenCount + elseCount;
                }
                let sum = 0;
                ts.forEachChild(node, (child) => {
                    sum += countNode(child, mult);
                });
                return sum;
            }

            return countNode(testBody, 1);
        }

        let fileTotal = 0;
        function visitTop(node) {
            if (
                ts.isCallExpression(node) &&
                ts.isPropertyAccessExpression(node.expression) &&
                ts.isIdentifier(node.expression.expression) &&
                node.expression.expression.text === "QUnit" &&
                node.expression.name.text === "test" &&
                node.arguments.length >= 2
            ) {
                const fnArg = node.arguments[1];
                if (ts.isFunctionExpression(fnArg) || ts.isArrowFunction(fnArg)) {
                    fileTotal += countTestBlock(fnArg.body);
                }
                return;
            }
            ts.forEachChild(node, visitTop);
        }
        visitTop(sf);
        return fileTotal;
    }

    const unitFiles = [
        path.join(TEST_DIR, "unit", "plugins", "PipelinePlugins.qunit.js"),
        path.join(TEST_DIR, "unit", "core", "CoreArchitecture.qunit.js"),
        path.join(TEST_DIR, "unit", "plugins", "ControlPlugins.qunit.js")
    ];
    const e2eFile = path.join(TEST_DIR, "integration", "AllJourneys.js");

    let unitTotal = 0;
    const unitByFile = {};
    for (const f of unitFiles) {
        const count = countAssertionsInQUnitFile(f);
        unitByFile[path.basename(f)] = count;
        unitTotal += count;
    }
    const e2eTotal = countAssertionsInQUnitFile(e2eFile);

    return {
        unit: unitTotal,
        e2e: e2eTotal,
        total: unitTotal + e2eTotal,
        unitByFile
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

    const controlsPluginDir = path.join(SRC_DIR, "plugins", "controls");
    let concreteControlPlugins = 0;
    let abstractControlPluginBases = 0;
    for (const f of collectTsFiles(controlsPluginDir)) {
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
        if (isAbstract) abstractControlPluginBases++;
        else concreteControlPlugins++;
    }

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
        gateExemptions: 0,
        registered: {
            ...bootstrapperCounts,
            ...pipelineCounts,
            concreteControlPlugins,
            abstractControlPluginBases,
            actionPluginFiles: collectTsFiles(path.join(SRC_DIR, "plugins", "actions")).length,
            datasourcePluginFiles: collectTsFiles(path.join(SRC_DIR, "plugins", "datasources")).length,
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
    console.log(`Lint Gate Exemptions:          ${m.gateExemptions}`);
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
        data-sap-ui-libs="sap.m, sap.ui.core, sap.ui.layout, sap.f, sap.ui.codeeditor, sap.ndc"
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
      <EntityContainer Name="Container">
        <EntitySet Name="Employees" EntityType="metaui.mock.Employee"/>
        <EntitySet Name="Departments" EntityType="metaui.mock.Department"/>
      </EntityContainer>
    </Schema>
  </edmx:DataServices>
</edmx:Edmx>`;

function startServer() {
    return new Promise((resolve, reject) => {
        const server = http.createServer((req, res) => {
            const parsedUrl = new URL(req.url, "http://localhost");
            const pathname = decodeURIComponent(parsedUrl.pathname);

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
    // ValidationLedger logs each plugin validation failure when validateAll() runs on invalid test inputs
    /\[MetaUI Validation\] Plugin failed validation:/,
    // SchemaNormalizer / GenerationDelegate negative tests that pass malformed JSON strings
    /Failed to parse (schema|inputData|inputDataJson) string:/,
    // OpenApiBuilder negative test passing an invalid/unsupported spec object
    /\[MetaUI OpenApiBuilder\].*Unsupported or invalid OpenAPI/,
    // 13.2.2 negative test asserting unresolvable uiLayout scope (#/properties/MissingScopeField) sets hasPartialRenderingErrors
    /Property 'MissingScopeField' not found in schema/,
    // 13.2.4 negative test asserting OData V4 setProperty rejection fires host error event
    /Failed to patch OData V4 property 'Name': Simulated 409 Conflict/,
    // 13.3.3 negative test asserting conflicting 'type' in allOf merge logs error and keeps first
    /Conflicting 'type' in allOf merge \('string' vs 'integer'\)/
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

    // Navigate to Data Inference Playpen (#/playpen) and verify DynamicHost renders inferred form
    await page.goto(`${baseUrl}/index.html#/playpen`, { waitUntil: "networkidle2", timeout: 30000 });
    await page.waitForFunction(
        () => document.body.innerText.includes("Data Inference Playpen"),
        { timeout: 30000 }
    );
    console.log(`  [PASS] Data Inference Playpen route rendered live bidirectional form`);

    // Navigate to Freeform Playground (#/playground)
    await page.goto(`${baseUrl}/index.html#/playground`, { waitUntil: "networkidle2", timeout: 30000 });
    await page.waitForFunction(
        () => document.body.innerText.includes("MetaUI Playground"),
        { timeout: 30000 }
    );
    console.log(`  [PASS] Freeform Playground route rendered without errors`);

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

    const verification = await page.evaluate(async () => {
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
        const allWidgetsSchema = {
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
                Barcode: { type: "string", ui: { widget: "scanner", label: "Barcode" } },
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

        const allWidgetsData = {
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
            Barcode: "9400123456789",
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
        const scanCtrl = formHost._innerHost.engine.getPluginByPath("Barcode").mainControl;
        const scanInputRect = scanCtrl.getDomRef().getBoundingClientRect();
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
            geoInputGrows: geoInputRect.width >= 150,
            scanInputGrows: scanInputRect.width >= 150
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
    });

    console.log(`  [PASS] Standalone Consumer Page rendered ${verification.renderedWidgets} widget plugins with physical DOM geometry`);
    if (verification.zeroGeometryWidgets.length > 0) {
        throw new Error(`Zero-geometry widgets detected: ${verification.zeroGeometryWidgets.join(", ")}`);
    }
    if (
        !verification.hardwareChecks.sigCanvasVisible ||
        !verification.hardwareChecks.camVideoVisible ||
        !verification.hardwareChecks.voiceInputGrows ||
        !verification.hardwareChecks.geoInputGrows ||
        !verification.hardwareChecks.scanInputGrows
    ) {
        throw new Error(`Hardware geometry check failed: ${JSON.stringify(verification.hardwareChecks)}`);
    }
    console.log(`  [PASS] Hardware controls (<canvas>, <video>, Voice/Geo/Scanner FlexItemData inputs) verified with non-zero geometry`);

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

async function main() {
    if (process.argv.includes("--metrics-only")) {
        printProjectMetrics();
        return;
    }
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
        if (
            unitReport.totalAssertions !== expectedMetrics.qunit.unit ||
            integrationReport.totalAssertions !== expectedMetrics.qunit.e2e
        ) {
            throw new Error(
                `[METRICS_DRIFT] Static 'npm run metrics' QUnit count (Unit=${expectedMetrics.qunit.unit}, E2E=${expectedMetrics.qunit.e2e}) does not match live browser QUnit count (Unit=${unitReport.totalAssertions}, E2E=${integrationReport.totalAssertions}).`
            );
        }
        await runFioriSandboxSmokeTest(browser, baseUrl);
        await runStandaloneConsumerVerification(browser, baseUrl);

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
