# MetaUI

**A JSON-Schema-driven dynamic form engine for SAP UI5.** Define your forms as pure JSON. MetaUI generates the entire Fiori UI at runtime — fields, validation, layout, and cross-field business rules — with zero XML views.

[![Live Demo](https://img.shields.io/badge/demo-live-blue)](https://SiliconStreetDev1.github.io/MetaUI/index.html)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

![MetaUI rendering a Kitchen Sink form from a JSON Schema](docs/images/metaui_preview.png)

## Why MetaUI?

**There is no open-source alternative for dynamically generating SAP Fiori forms from JSON Schema.** SAP's own Fiori Elements requires static OData CDS annotations. MetaUI is for the use cases where that's unavailable, too rigid, or impossible.

| Feature | MetaUI | Fiori Elements |
|---|---|---|
| Schema format | Standard JSON Schema | OData CDS Annotations |
| Runtime generation | ✅ | ❌ (build-time) |
| Works without OData | ✅ | ❌ |
| Cross-field rules (declarative) | ✅ `uiPolicies` | Partial (side effects) |
| AI schema inference | ✅ | ❌ |

## Quickstart

**1. Install**
```bash
npm install @siliconst/metaui
```

**2. Add to your XML View**
```xml
<meta:DynamicHost
    schemaDefinition="{yourModel>/schema}"
    data="{yourModel>/payload}"
    submit=".onFormSubmitted"
/>
```

**3. Define a schema** (or let MetaUI infer one from your data)
```json
{
  "title": "Guest Registration",
  "type": "object",
  "properties": {
    "FullName":   { "type": "string", "maxLength": 100 },
    "Email":      { "type": "string", "ui": { "format": "email" } },
    "CheckIn":    { "type": "date" },
    "VIP":        { "type": "boolean", "ui": { "widget": "switch" } }
  },
  "required": ["FullName", "Email"]
}
```

That's it. MetaUI handles the `sap.m.Input`, `sap.m.DatePicker`, `sap.m.Switch`, validation, labels, and responsive layout automatically.

## Key Features

- **31 field plugins** — Strings, dates, cameras, barcode scanners, signatures, code editors, and more
- **4 layout strategies** — Form, Table, Wizard (step-by-step), Compact
- **Policy-Based Rules Engine** — Declarative cross-field logic (Show/Hide/Require/Disable) with automatic symmetrical reversals
- **Tri-Binding Engine** — Feed data as an object, JSON string, or OData context
- **Full Inference Mode** — Pass raw data with no schema; MetaUI generates the UI automatically
- **OpenAPI / Swagger support** — Extract schemas directly from API specs

## 📚 Documentation

Full documentation covering schemas, plugins, policies, and integration guides:

**→ [MetaUI Documentation Wiki](docs/wiki/Home.md)**

## ⚖️ License

MIT — see [LICENSE](LICENSE) for details.

> **Disclaimer**: This software is provided "as is", without warranty of any kind. Use at your own risk.
