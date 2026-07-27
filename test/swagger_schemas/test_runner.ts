import * as fs from 'fs';
import * as path from 'path';
import { SwaggerBuilder } from '../../src/nz/co/siliconst/ui5/metaui/swagger/SwaggerBuilder';

let totalAssertions = 0;
let definitionsTested = 0;

function checkProperty(rawProp: any, metaProp: any, pathStr: string, version: "2.0" | "3.0", skipDeepRefs: boolean = true) {
    if (!rawProp || !metaProp) return;

    // Check basic constraints
    const mappings = {
        maxLength: (val: any) => metaProp.maxLength === val,
        minLength: (val: any) => metaProp.minLength === val,
        maximum: (val: any) => metaProp.maximum === val,
        minimum: (val: any) => metaProp.minimum === val,
        multipleOf: (val: any) => metaProp.multipleOf === val,
        maxItems: (val: any) => metaProp.maxItems === val,
        minItems: (val: any) => metaProp.minItems === val,
        uniqueItems: (val: any) => metaProp.uniqueItems === val,
        maxProperties: (val: any) => metaProp.maxProperties === val,
        minProperties: (val: any) => metaProp.minProperties === val,
        readOnly: (val: any) => metaProp.readOnly === val,
        writeOnly: (val: any) => metaProp.writeOnly === val,
        nullable: (val: any) => metaProp.nullable === val,
        deprecated: (val: any) => metaProp.deprecated === val
    };

    for (const [key, checkFn] of Object.entries(mappings)) {
        if (rawProp[key] !== undefined) {
            totalAssertions++;
            if (!checkFn(rawProp[key])) {
                throw new Error(`[Assertion Failed at ${pathStr}] Missing or invalid mapping for ${key}. Expected ${rawProp[key]}, got ${JSON.stringify(metaProp)}`);
            }
        }
    }

    if (rawProp.format === "password") {
        totalAssertions++;
        if (metaProp.ui?.format !== "password") throw new Error(`[Assertion Failed at ${pathStr}] format: password not mapped`);
    } else if (rawProp.format === "email") {
        totalAssertions++;
        if (metaProp.ui?.format !== "email") throw new Error(`[Assertion Failed at ${pathStr}] format: email not mapped`);
    } else if (rawProp.format === "date-time") {
        totalAssertions++;
        if (metaProp.ui?.widget !== "datetime") throw new Error(`[Assertion Failed at ${pathStr}] format: date-time not mapped`);
    } else if (rawProp.format === "date") {
        totalAssertions++;
        if (metaProp.ui?.widget !== "date") throw new Error(`[Assertion Failed at ${pathStr}] format: date not mapped`);
    } else if (rawProp.format === "binary" || rawProp.format === "byte") {
        totalAssertions++;
        if (metaProp.ui?.widget !== "fileUploader") throw new Error(`[Assertion Failed at ${pathStr}] format: binary/byte not mapped`);
    }

    // Polymorphism
    if (rawProp.oneOf && Array.isArray(rawProp.oneOf)) {
        totalAssertions++;
        if (!metaProp.oneOf || metaProp.oneOf.length !== rawProp.oneOf.length) {
            throw new Error(`[Assertion Failed at ${pathStr}] oneOf mismatch. Expected array length ${rawProp.oneOf.length}`);
        }
    }

    if (rawProp.anyOf && Array.isArray(rawProp.anyOf)) {
        totalAssertions++;
        if (!metaProp.anyOf || metaProp.anyOf.length !== rawProp.anyOf.length) {
            throw new Error(`[Assertion Failed at ${pathStr}] anyOf mismatch. Expected array length ${rawProp.anyOf.length}`);
        }
    }

    // Recurse direct properties (skip $refs to avoid infinite loops since we iterate all definitions globally)
    if (rawProp.properties && metaProp.properties && !rawProp.$ref) {
        for (const childKey of Object.keys(rawProp.properties)) {
            checkProperty(rawProp.properties[childKey], metaProp.properties[childKey], `${pathStr}.${childKey}`, version);
        }
    }

    if (rawProp.items && metaProp.items && !rawProp.items.$ref) {
        checkProperty(rawProp.items, metaProp.items, `${pathStr}.items`, version);
    }
}

function runOa2Test() {
    console.log("Loading Kubernetes OpenAPI 2.0 Spec (~3MB)...");
    const rawOa2 = JSON.parse(fs.readFileSync(path.join(__dirname, 'k8s_oa2.json'), 'utf8'));
    
    if (!rawOa2.definitions) throw new Error("No definitions found in OA2 spec");

    const builder = new SwaggerBuilder();
    
    const defKeys = Object.keys(rawOa2.definitions);
    console.log(`Starting crawl of ${defKeys.length} definitions...`);

    for (const key of defKeys) {
        try {
            const rawDef = rawOa2.definitions[key];
            const metaUiSchema = builder.build(rawOa2, key);
            
            definitionsTested++;
            
            if (rawDef.properties && metaUiSchema.properties) {
                for (const propKey of Object.keys(rawDef.properties)) {
                    checkProperty(rawDef.properties[propKey], metaUiSchema.properties[propKey], `k8s.${key}.${propKey}`, "2.0");
                }
            }
        } catch (e) {
            throw new Error(`Error parsing/validating definition '${key}': ${e.message}`);
        }
    }
    
    console.log(`✅ Kubernetes OpenAPI 2.0 Test Passed! (Definitions Tested: ${definitionsTested}, Assertions: ${totalAssertions})`);
}

function runOa3Test() {
    console.log("Loading GitHub OpenAPI 3.0 Spec (~5MB)...");
    const rawOa3 = JSON.parse(fs.readFileSync(path.join(__dirname, 'github_oa3.json'), 'utf8'));
    
    if (!rawOa3.components || !rawOa3.components.schemas) throw new Error("No schemas found in OA3 spec");

    const builder = new SwaggerBuilder();
    
    const defKeys = Object.keys(rawOa3.components.schemas);
    console.log(`Starting crawl of ${defKeys.length} schemas...`);

    let localDefTested = 0;
    let localAssertions = 0;

    for (const key of defKeys) {
        try {
            const rawDef = rawOa3.components.schemas[key];
            const metaUiSchema = builder.build(rawOa3, key);
            
            definitionsTested++;
            localDefTested++;
            
            if (rawDef.properties && metaUiSchema.properties) {
                for (const propKey of Object.keys(rawDef.properties)) {
                    const preAssertionCount = totalAssertions;
                    checkProperty(rawDef.properties[propKey], metaUiSchema.properties[propKey], `github.${key}.${propKey}`, "3.0");
                    localAssertions += (totalAssertions - preAssertionCount);
                }
            }
        } catch (e) {
            throw new Error(`Error parsing/validating schema '${key}': ${e.message}`);
        }
    }
    
    console.log(`✅ GitHub OpenAPI 3.0 Test Passed! (Schemas Tested: ${localDefTested}, Assertions: ${localAssertions})`);
}

try {
    totalAssertions = 0;
    definitionsTested = 0;
    runOa2Test();
    runOa3Test();
    console.log(`\n🎉 MASSIVE STRESS TEST COMPLETE. Total Assertions Mathematically Verified: ${totalAssertions}`);
} catch (e) {
    console.error("\n❌ STRESS TEST FAILED:");
    console.error(e.message);
    process.exit(1);
}
