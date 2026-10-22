import * as fs from "fs";
import * as path from "path";
import { OpenApiBuilder } from "../../src/nz/co/siliconst/ui5/metaui/openapi/OpenApiBuilder";
import { IPropertyMetadata } from "../../src/nz/co/siliconst/ui5/metaui/interfaces/ISchema";
import { isRecord } from "../../src/nz/co/siliconst/ui5/metaui/utils/TypeGuards";

let totalAssertions = 0;
let definitionsTested = 0;
const skipped: string[] = [];

function checkProperty(
    rawProp: Record<string, unknown> | undefined,
    metaProp: IPropertyMetadata | undefined,
    pathStr: string,
    version: "2.0" | "3.0"
): void {
    if (!rawProp || !metaProp) {
        return;
    }

    const mappings: Record<string, (val: unknown) => boolean> = {
        maxLength: (val: unknown) => metaProp.maxLength === val,
        minLength: (val: unknown) => metaProp.minLength === val,
        maximum: (val: unknown) => metaProp.maximum === val,
        minimum: (val: unknown) => metaProp.minimum === val,
        multipleOf: (val: unknown) => metaProp.multipleOf === val,
        maxItems: (val: unknown) => metaProp.maxItems === val,
        minItems: (val: unknown) => metaProp.minItems === val,
        uniqueItems: (val: unknown) => metaProp.uniqueItems === val,
        maxProperties: (val: unknown) => metaProp.maxProperties === val,
        minProperties: (val: unknown) => metaProp.minProperties === val,
        readOnly: (val: unknown) => metaProp.readOnly === val,
        writeOnly: (val: unknown) => metaProp.writeOnly === val,
        nullable: (val: unknown) => metaProp.nullable === val,
        deprecated: (val: unknown) => metaProp.deprecated === val
    };

    for (const [key, checkFn] of Object.entries(mappings)) {
        if (rawProp[key] !== undefined) {
            totalAssertions++;
            if (!checkFn(rawProp[key])) {
                throw new Error(
                    `[Assertion Failed at ${pathStr}] Missing or invalid mapping for ${key}. Expected ${String(rawProp[key])}, got ${JSON.stringify(metaProp)}`
                );
            }
        }
    }

    if (rawProp.format === "password") {
        totalAssertions++;
        if (metaProp.ui?.format !== "password") {
            throw new Error(`[Assertion Failed at ${pathStr}] format: password not mapped`);
        }
    } else if (rawProp.format === "email") {
        totalAssertions++;
        if (metaProp.ui?.format !== "email") {
            throw new Error(`[Assertion Failed at ${pathStr}] format: email not mapped`);
        }
    } else if (rawProp.format === "date-time") {
        totalAssertions++;
        if (metaProp.ui?.widget !== "datetime") {
            throw new Error(`[Assertion Failed at ${pathStr}] format: date-time not mapped`);
        }
    } else if (rawProp.format === "date") {
        totalAssertions++;
        if (metaProp.ui?.widget !== "date") {
            throw new Error(`[Assertion Failed at ${pathStr}] format: date not mapped`);
        }
    } else if (rawProp.format === "binary" || rawProp.format === "byte") {
        totalAssertions++;
        if (metaProp.ui?.widget !== "fileUploader") {
            throw new Error(`[Assertion Failed at ${pathStr}] format: binary/byte not mapped`);
        }
    }

    if (Array.isArray(rawProp.oneOf)) {
        totalAssertions++;
        if (!metaProp.oneOf || metaProp.oneOf.length !== rawProp.oneOf.length) {
            throw new Error(`[Assertion Failed at ${pathStr}] oneOf mismatch. Expected array length ${rawProp.oneOf.length}`);
        }
    }

    if (Array.isArray(rawProp.anyOf)) {
        totalAssertions++;
        if (!metaProp.anyOf || metaProp.anyOf.length !== rawProp.anyOf.length) {
            throw new Error(`[Assertion Failed at ${pathStr}] anyOf mismatch. Expected array length ${rawProp.anyOf.length}`);
        }
    }

    if (isRecord(rawProp.properties) && metaProp.properties && !rawProp.$ref) {
        for (const childKey of Object.keys(rawProp.properties)) {
            const rawChild = rawProp.properties[childKey];
            if (isRecord(rawChild)) {
                checkProperty(rawChild, metaProp.properties[childKey], `${pathStr}.${childKey}`, version);
            }
        }
    }

    if (isRecord(rawProp.items) && metaProp.items && !rawProp.items.$ref) {
        checkProperty(rawProp.items, metaProp.items, `${pathStr}.items`, version);
    }
}

/**
 * Real-world specs are tens of megabytes and are deliberately not committed.
 * Fetch them with `npm run stress:fetch`; this returns null when absent so the
 * routine reports a skip instead of crashing with ENOENT.
 */
function loadSpec(fileName: string, label: string): Record<string, unknown> | null {
    const full = path.join(__dirname, fileName);
    if (!fs.existsSync(full)) {
        console.log(`SKIPPED ${label}: ${fileName} not present. Run 'npm run stress:fetch' to download it.`);
        skipped.push(fileName);
        return null;
    }
    const sizeMb = (fs.statSync(full).size / (1024 * 1024)).toFixed(1);
    console.log(`Loading ${label} (${sizeMb}MB)...`);
    return JSON.parse(fs.readFileSync(full, "utf8")) as Record<string, unknown>;
}

function runOa2Test(): void {
    const rawOa2 = loadSpec("k8s_oa2.json", "Kubernetes OpenAPI 2.0 spec");
    if (!rawOa2) {
        return;
    }

    if (!isRecord(rawOa2.definitions)) {
        throw new Error("No definitions found in OA2 spec");
    }

    const defKeys = Object.keys(rawOa2.definitions);
    console.log(`Starting crawl of ${defKeys.length} definitions...`);

    for (const key of defKeys) {
        try {
            const rawDef = rawOa2.definitions[key];
            const metaUiSchema = OpenApiBuilder.build(rawOa2, key);
            definitionsTested++;

            if (isRecord(rawDef) && isRecord(rawDef.properties) && metaUiSchema.properties) {
                for (const propKey of Object.keys(rawDef.properties)) {
                    const rawProp = rawDef.properties[propKey];
                    if (isRecord(rawProp)) {
                        checkProperty(rawProp, metaUiSchema.properties[propKey], `k8s.${key}.${propKey}`, "2.0");
                    }
                }
            }
        } catch (e) {
            throw new Error(`Error parsing/validating definition '${key}': ${(e as Error).message}`);
        }
    }

    console.log(`✅ Kubernetes OpenAPI 2.0 Test Passed! (Definitions Tested: ${definitionsTested}, Assertions: ${totalAssertions})`);
}

function runOa3Test(): void {
    const rawOa3 = loadSpec("github_oa3.json", "GitHub OpenAPI 3.0 spec");
    if (!rawOa3) {
        return;
    }

    if (!isRecord(rawOa3.components) || !isRecord(rawOa3.components.schemas)) {
        throw new Error("No schemas found in OA3 spec");
    }

    const defKeys = Object.keys(rawOa3.components.schemas);
    console.log(`Starting crawl of ${defKeys.length} schemas...`);

    let localDefTested = 0;
    let localAssertions = 0;

    for (const key of defKeys) {
        try {
            const rawDef = rawOa3.components.schemas[key];
            const metaUiSchema = OpenApiBuilder.build(rawOa3, key);

            definitionsTested++;
            localDefTested++;

            if (isRecord(rawDef) && isRecord(rawDef.properties) && metaUiSchema.properties) {
                for (const propKey of Object.keys(rawDef.properties)) {
                    const preAssertionCount = totalAssertions;
                    const rawProp = rawDef.properties[propKey];
                    if (isRecord(rawProp)) {
                        checkProperty(rawProp, metaUiSchema.properties[propKey], `github.${key}.${propKey}`, "3.0");
                    }
                    localAssertions += totalAssertions - preAssertionCount;
                }
            }
        } catch (e) {
            throw new Error(`Error parsing/validating schema '${key}': ${(e as Error).message}`);
        }
    }

    console.log(`✅ GitHub OpenAPI 3.0 Test Passed! (Schemas Tested: ${localDefTested}, Assertions: ${localAssertions})`);
}

try {
    totalAssertions = 0;
    definitionsTested = 0;
    runOa2Test();
    runOa3Test();

    if (skipped.length === 2) {
        // Nothing ran. Say so loudly rather than printing a success line with zero work behind it.
        console.error("\nSTRESS TEST DID NOT RUN: neither spec is present.");
        console.error("Run 'npm run stress:fetch' to download them, then run this again.");
        process.exit(1);
    }
    const note = skipped.length > 0 ? ` (skipped: ${skipped.join(", ")})` : "";
    console.log(`\nSTRESS TEST COMPLETE. Definitions crawled: ${definitionsTested}. Assertions verified: ${totalAssertions}${note}`);
} catch (e) {
    console.error("\nSTRESS TEST FAILED:");
    console.error((e as Error).message);
    process.exit(1);
}
