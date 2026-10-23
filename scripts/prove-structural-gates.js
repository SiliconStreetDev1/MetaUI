/**
 * @file prove-structural-gates.js
 * @description Proof harness for the structural gates in run-tests.js.
 *
 * A gate nobody has watched catch something is not a gate. This project has shipped gates that
 * passed for months while checking nothing, so each structural gate carries a case here that
 * introduces the exact divergence it exists to catch. The harness edits a source file, runs
 * `run-tests.js --lint-only`, asserts the gate goes red *naming that specific violation*, and
 * restores the file byte-for-byte.
 *
 * It mutates src/, so it is deliberately NOT part of `npm run lint` or `npm test`. Run it by hand
 * after changing a gate, or in CI as a separate step:
 *
 *     node scripts/prove-structural-gates.js
 *     node scripts/prove-structural-gates.js A      # only cases whose id starts with "A"
 *
 * Exit code 0 means every gate caught its divergence and the tree was restored green.
 */

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT_DIR = path.resolve(__dirname, "..");
const SRC_DIR = path.join(ROOT_DIR, "src", "nz", "co", "siliconst", "ui5", "metaui");
const TEST_UNIT_DIR = path.join(ROOT_DIR, "test", "webapp", "test", "unit", "core");
const only = process.argv[2];

function srcFile(rel) {
    return path.join(SRC_DIR, ...rel.split("/"));
}

function runLint() {
    const r = spawnSync(process.execPath, [path.join(ROOT_DIR, "scripts", "run-tests.js"), "--lint-only"], {
        cwd: ROOT_DIR,
        encoding: "utf8"
    });
    return `${r.stdout || ""}${r.stderr || ""}`.replace(/\r?\n/g, "\n");
}

const CASES = [
    {
        id: "A1-producer-drops-a-field",
        gate: "PRODUCER_COMPLETENESS",
        file: srcFile("core/SchemaNormalizer.ts"),
        from: `            pattern: readString(prop, "pattern"),\n`,
        to: "",
        expect: /\[PRODUCER_COMPLETENESS\].*neither writes IPropertyMetadata\.pattern nor declines it/
    },
    {
        id: "A2-new-ISchema-field-obliges-every-producer",
        gate: "PRODUCER_COMPLETENESS",
        file: srcFile("interfaces/ISchema.ts"),
        from: "    // Numeric specifics\n    multipleOf?: number;",
        to: "    // Numeric specifics\n    vatRate?: number;\n    multipleOf?: number;",
        expectAll: [
            /\[PRODUCER_COMPLETENESS\].*SchemaNormalizer' neither writes IPropertyMetadata\.vatRate/,
            /\[PRODUCER_COMPLETENESS\].*OpenApiPropertyMapper.*neither writes IPropertyMetadata\.vatRate/,
            /\[PRODUCER_COMPLETENESS\].*DataInferenceBuilder' neither writes IPropertyMetadata\.vatRate/
        ]
    },
    {
        id: "A3-decline-premise-removed",
        gate: "PRODUCER_COMPLETENESS",
        file: srcFile("openapi/OpenApiUIMapper.ts"),
        from: "            Object.assign(ui, swaggerProp.ui);",
        to: "            ui.label = ui.label;",
        expect: /\[PRODUCER_COMPLETENESS\].*Object\.assign\(ui, \.\.\.\)' pass-through of the raw\s+ui block is gone/
    },
    {
        id: "A4-decline-without-a-real-reason",
        gate: "PRODUCER_COMPLETENESS",
        file: srcFile("core/DataInferenceBuilder.ts"),
        from: `    "ui.rows": "A control sizing hint with no counterpart in a payload.",`,
        to: `    "ui.rows": "n/a",`,
        expect: /\[PRODUCER_COMPLETENESS\].*DECLINED_SCHEMA_FIELDS\['ui\.rows'\].*3-character justification/
    },
    {
        id: "A5-producer-member-renamed-out-of-sight",
        gate: "PRODUCER_COMPLETENESS",
        file: srcFile("core/SchemaDirectiveNormalizer.ts"),
        from: "    public static normalizeUI(",
        to: "    public static normalizeUiBlock(",
        expect: /\[PRODUCER_COMPLETENESS\].*member 'normalizeUI' named in SCHEMA_PRODUCERS no longer\s+exists/
    },
    {
        id: "B1-numeric-literal-depth-cap",
        gate: "DEPTH_CONSTANT",
        file: srcFile("core/SchemaWalker.ts"),
        from: "if (depth > MAX_SCHEMA_DEPTH || depth > state.maxDepth) {",
        to: "if (depth > 8 || depth > state.maxDepth) {",
        expect: /\[DEPTH_CONSTANT\].*SchemaWalker\.ts.*compares a depth counter against the literal\s+'8'/
    },
    {
        id: "B2-private-MAX_x_DEPTH-constant",
        gate: "DEPTH_CONSTANT",
        file: srcFile("core/SchemaValidator.ts"),
        from: "export class SchemaValidator {",
        to: "export class SchemaValidator {\n    private static readonly MAX_VALIDATION_DEPTH = 12;",
        expect: /\[DEPTH_CONSTANT\].*declares a private depth cap 'MAX_VALIDATION_DEPTH'/
    },
    {
        id: "B3-schema-cap-lowered-below-layout-cap",
        gate: "DEPTH_CONSTANT",
        file: srcFile("constants/MetaUIConstants.ts"),
        from: "export const MAX_SCHEMA_DEPTH = 30;",
        to: "export const MAX_SCHEMA_DEPTH = 16;",
        expect: /\[DEPTH_CONSTANT\].*MAX_SCHEMA_DEPTH \(16\) is below MAX_LAYOUT_DEPTH \(30\)/
    },
    {
        id: "B4-test-restates-the-cap",
        gate: "DEPTH_CONSTANT",
        file: path.join(TEST_UNIT_DIR, "CoreArchitecture.qunit.js"),
        from: "    var MAX_SCHEMA_DEPTH = MetaUIConstantsMod.MAX_SCHEMA_DEPTH;",
        to: "    var MAX_SCHEMA_DEPTH = 30;",
        expect: /\[DEPTH_CONSTANT\].*declares its own value for\s+'MAX_SCHEMA_DEPTH' outside/
    },
    {
        id: "C-second-ref-resolver",
        gate: "REF_RESOLVER",
        file: srcFile("controls/host/delegates/DataSyncDelegate.ts"),
        from: "            const refKey = OpenApiRefResolver.extractRefName(schemaRef);",
        to: `            const refKey = schemaRef.split("/").pop();`,
        expect: /\[REF_RESOLVER\].*DataSyncDelegate\.ts.*hand-rolls \$ref parsing/
    },
    {
        id: "D-inline-layout-strategy-default",
        gate: "LAYOUT_STRATEGY_DEFAULT",
        file: srcFile("core/PluginRegistry.ts"),
        from: "        const strategy = DefaultLayoutGenerator.resolveLayoutStrategy(schema);",
        to:
            "        const strategy =\n" +
            "            schema.layoutStrategy || (schema.type === SCHEMA_TYPE.ARRAY ? LAYOUT_STRATEGY.TABLE : LAYOUT_STRATEGY.FORM);",
        expect: /\[LAYOUT_STRATEGY_DEFAULT\].*PluginRegistry\.ts.*re-derives the layout-strategy default/
    },
    {
        id: "E1-renderMode-string-literal",
        gate: "SCHEMA_CONSTANT",
        file: srcFile("layouts/LayoutElementWalker.ts"),
        from: "            renderMode !== RENDER_MODE.DIALOG",
        to: `            renderMode !== "dialog"`,
        expect: /\[SCHEMA_CONSTANT\].*LayoutElementWalker\.ts.*compares 'renderMode' against the string\s+literal "dialog"\. Use RENDER_MODE/
    },
    {
        id: "E2-layoutStrategy-string-literal-no-compiler-check",
        gate: "SCHEMA_CONSTANT",
        file: srcFile("core/LayoutMutator.ts"),
        from: "rootSchema.layoutStrategy === LAYOUT_STRATEGY.WIZARD",
        to: `rootSchema.layoutStrategy === "wizard"`,
        expect: /\[SCHEMA_CONSTANT\].*LayoutMutator\.ts.*compares 'rootSchema\.layoutStrategy' against the string\s+literal "wizard"\. Use LAYOUT_STRATEGY/
    },
    {
        id: "E3-widget-string-literal-no-compiler-check",
        gate: "SCHEMA_CONSTANT",
        file: srcFile("core/DefaultLayoutGenerator.ts"),
        from: "    public static resolveLayoutStrategy(schema: ISchema): string {",
        to:
            "    public static resolveLayoutStrategy(schema: ISchema): string {\n" +
            '        if (schema.ui?.widget === "select") { Logger.debug("probe"); }',
        expect: /\[SCHEMA_CONSTANT\].*DefaultLayoutGenerator\.ts.*compares 'schema\.ui\?\.widget' against the string\s+literal "select"\. Use WIDGET_TYPE/
    },
    {
        id: "F-second-data-dataJson-writer",
        gate: "DATA_WRITER",
        file: srcFile("controls/host/delegates/SchemaResolutionDelegate.ts"),
        from: "                            DataSyncDelegate.commitDataPair(this.facade, params.payload, params.payloadJson);",
        to: '                            this.facade.setBaseProperty("data", params.payload, true);',
        expect: /\[DATA_WRITER\].*SchemaResolutionDelegate\.ts.*writes the committed 'data' property directly/
    },
    {
        id: "G1-catch-that-swallows",
        gate: "CATCH_SIGNAL",
        file: srcFile("utils/UrlValidator.ts"),
        from:
            "        } catch {\n" +
            "            // CATCH_EXEMPT: a throw from new URL() is the 'not a parseable URL' answer this\n" +
            "            // predicate exists to give. Returning false is the result, not a degradation, and the\n" +
            "            // caller is responsible for reporting the rejected link to the user.\n" +
            "            return false;\n" +
            "        }",
        to: "        } catch {\n            return false;\n        }",
        expect: /\[CATCH_SIGNAL\].*UrlValidator\.ts.*swallows a failure silently/
    },
    {
        id: "G2-exemption-without-a-real-reason",
        gate: "CATCH_SIGNAL",
        file: srcFile("controls/host/HostControlMetadata.ts"),
        from:
            "        // CATCH_EXEMPT: a JSON.parse failure is the answer this predicate exists to give --\n" +
            "        // the constructor string is not a JSON literal, so it is a UI5 binding string. The\n" +
            "        // caller acts on the returned false; there is nothing degraded to report.",
        to: "        // CATCH_EXEMPT: fine",
        expect: /\[CATCH_SIGNAL\].*HostControlMetadata\.ts.*4-character CATCH_EXEMPT: justification/
    },
    {
        id: "H1-depth-guard-truncates-in-silence",
        gate: "DEPTH_SIGNAL",
        file: srcFile("utils/TypeGuards.ts"),
        from:
            "    if (depth >= MAX_CLONE_DEPTH) {\n" +
            "        // Returning {} or [] here replaces the consumer's own data with nothing. That is the\n" +
            "        // most expensive silent truncation in the library, so it must never be silent.\n" +
            "        Logger.warn(",
        to: "    if (depth >= MAX_CLONE_DEPTH) {\n        void 0;\n        const unusedWarn = (",
        expect: /\[DEPTH_SIGNAL\].*TypeGuards\.ts.*truncates at a depth cap without saying so/
    },
    {
        id: "I-layout-catch-leaves-the-banner-off",
        gate: "RENDER_DEGRADATION",
        file: srcFile("layouts/TableLayout.ts"),
        from: "                } catch (error) {\n                    engine.hasPartialRenderingErrors = true;",
        to: "                } catch (error) {",
        expect: /\[RENDER_DEGRADATION\].*TableLayout\.ts.*without setting\s+engine\.hasPartialRenderingErrors = true/
    },
    {
        id: "J-second-schema-walker",
        gate: "SINGLE_WALKER",
        file: srcFile("core/SchemaValidator.ts"),
        from: "export class SchemaValidator {",
        to:
            "export class SchemaValidator {\n" +
            "    private static countSchemaProps(node: IPropertyMetadata, depth: number = 0): number {\n" +
            "        if (!node.properties) return 0;\n" +
            "        return this.countSchemaProps(node, depth + 1);\n" +
            "    }",
        expect: /\[SINGLE_WALKER\].*SchemaValidator\.ts.*defines a recursive walker 'countSchemaProps' with a depth parameter outside core\/SchemaWalker\.ts/
    },
    {
        id: "J-depthless-schema-walker",
        gate: "SINGLE_WALKER",
        file: srcFile("core/SchemaValidator.ts"),
        from: "export class SchemaValidator {",
        to:
            "export class SchemaValidator {\n" +
            "    private static scanProps(props: Record<string, IPropertyMetadata>): void {\n" +
            "        for (const key of Object.keys(props)) {\n" +
            "            const prop = props[key];\n" +
            "            if (prop.properties) this.scanProps(prop.properties);\n" +
            "        }\n" +
            "    }",
        expect: /\[SINGLE_WALKER\].*SchemaValidator\.ts.*defines a recursive walker 'scanProps' outside core\/SchemaWalker\.ts/
    }
];

const baseline = runLint();
if (!/\[PASS\] Gate exemptions/.test(baseline)) {
    console.error("BASELINE IS NOT GREEN -- a gate that is already red proves nothing.\n" + baseline);
    process.exit(1);
}
console.log("baseline: green\n");

let failures = 0;
for (const c of CASES) {
    if (only && !c.id.startsWith(only)) continue;
    const original = fs.readFileSync(c.file, "utf8");
    const eol = original.includes("\r\n") ? "\r\n" : "\n";
    const needle = c.from.split("\n").join(eol);
    const replacement = c.to.split("\n").join(eol);
    if (original.split(needle).length - 1 < 1) {
        console.log(`[SETUP-FAIL] ${c.id}: mutation anchor not found in ${path.basename(c.file)}`);
        failures++;
        continue;
    }
    fs.writeFileSync(c.file, original.split(needle).join(replacement), "utf8");
    let out;
    try {
        out = runLint();
    } finally {
        fs.writeFileSync(c.file, original, "utf8");
    }
    const expectations = c.expectAll || [c.expect];
    const unmatched = expectations.filter((re) => !re.test(out));
    const wentRed = /TEST SUITE FAILED/.test(out);
    if (wentRed && unmatched.length === 0) {
        const line = (out.match(new RegExp(`.*\\[${c.gate}\\].*`)) || [""])[0].trim();
        console.log(`[CAUGHT] ${c.id}\n          ${line.slice(0, 170)}`);
    } else {
        failures++;
        console.log(`[MISSED] ${c.id} -- wentRed=${wentRed} unmatched=${unmatched.length}`);
        console.log(
            out
                .split("\n")
                .filter((l) => l.includes("["))
                .slice(0, 5)
                .join("\n")
        );
    }
}

if (!/\[PASS\] Gate exemptions/.test(runLint())) {
    console.error("\nTREE NOT RESTORED after the proof run -- investigate before committing.");
    process.exit(1);
}
const ran = only ? CASES.filter((c) => c.id.startsWith(only)).length : CASES.length;
console.log(`\nrestored: green. ${ran - failures}/${ran} divergences caught.`);
process.exit(failures ? 1 : 0);
