const { SchemaNormalizer } = require("./dist/resources/nz/co/siliconst/ui5/metaui/core/SchemaNormalizer.js");

const rawSchema = {
  "title": "Hybrid Inference Profile",
  "type": "object",
  "additionalProperties": true,
  "properties": {
    "AccountType": {
      "type": "string",
      "valueHelp": [
        { "key": "BASIC", "text": "Basic Plan" },
        { "key": "PREMIUM", "text": "Premium Plan" },
        { "key": "CORPORATE", "text": "Corporate Plan" }
      ]
    }
  }
};

const data = {
  "CustomerName": "Siliconst Corp",
  "AccountType": "CORPORATE"
};

const normalized = SchemaNormalizer.normalize(rawSchema, data);
console.log(JSON.stringify(normalized.properties, null, 2));
