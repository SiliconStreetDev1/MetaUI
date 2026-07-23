const fs = require('fs');
const path = require('path');
import { SwaggerBuilder } from '../src/nz/co/siliconst/ui5/metaui/swagger/SwaggerBuilder';

const jsonPath = path.join(__dirname, 'swagger_test.json');
const swaggerRoot = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

console.log("--- Testing SwaggerBuilder.build() ---");
try {
    const metaSchema = SwaggerBuilder.build(swaggerRoot, "Pet");
    console.log(JSON.stringify(metaSchema, null, 2));
} catch (e) {
    console.error("Test Failed:", e);
}
