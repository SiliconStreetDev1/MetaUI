import { SchemaNormalizer } from "./src/nz/co/siliconst/ui5/metaui/core/SchemaNormalizer";
import * as fs from "fs";

const wizardJson = JSON.parse(fs.readFileSync("./TEST/webapp/mockData/scenarios/wizard.json", "utf8"));
const schema = wizardJson.schema;
const { meta } = SchemaNormalizer.resolveScope(schema, "#/properties/Applicant");

console.log("Meta is:", meta ? "FOUND" : "UNDEFINED");
if (meta) {
    console.log("Meta type:", meta.type);
    console.log("Meta properties:", Object.keys(meta.properties || {}));
}
