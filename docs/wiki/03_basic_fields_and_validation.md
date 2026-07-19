# 03. Basic Fields and Validation

MetaUI supports standard JSON Schema primitives. The `PluginRegistry` automatically resolves these types into native UI5 controls.

## Primitive Types

| Type | Default Control | Supported `ui.widget` Overrides |
|---|---|---|
| `string` | `sap.m.Input` | `textArea`, `select`, `time`, `datetime`, `fileUploader`, `camera`, `signature`, `scanner`, `voiceInput`, `richText` |
| `number` / `integer` | `sap.m.StepInput` | `slider`, `rating` |
| `boolean`| `sap.m.CheckBox` | `switch` |
| `date`   | `sap.m.DatePicker` | None |
| `object` | `sap.m.Button` (Drill-down) | `location` |

## Schema Definition Examples

### String & Text Area
```json
{
  "Description": {
    "type": "string",
    "ui": {
      "label": "Project Description",
      "widget": "textArea",
      "rows": 4
    }
  }
}
```

### Number with Limits
```json
{
  "Quantity": {
    "type": "integer",
    "minimum": 1,
    "maximum": 100,
    "multipleOf": 5,
    "ui": {
      "label": "Order Quantity"
    }
  }
}
```

### Boolean Switch
```json
{
  "IsActive": {
    "type": "boolean",
    "ui": {
      "label": "Active",
      "widget": "switch"
    }
  }
}
```

### Single-Select Dropdowns (type: "string")
If you need a simple dropdown with hardcoded options, use `"type": "string"`. You can provide an `enum` or `valueHelp` array containing `key` and `text` pairs. *(For live API-driven dropdowns, see 09. Actions and Datasources).*

```json
{
  "Status": {
    "type": "string",
    "enum": ["NEW", "INP", "CMP"],
    "ui": {
      "label": "Document Status",
      "widget": "select"
    }
  }
}
```

### Multi-Select Fields (type: "array")
In strict adherence to the JSON Schema standard, if a user can select *multiple* options, the resulting payload is an array of strings. Therefore, the property must be `"type": "array"`, and the `enum` logic is placed inside an `items` block. MetaUI will automatically map this to a multi-select or token-input field.

```json
{
  "AccessRegions": {
    "type": "array",
    "ui": {
      "label": "Access Regions",
      "widget": "multiSelect"
    },
    "items": {
      "type": "string",
      "enum": ["North America", "Europe", "Asia"]
    }
  }
}
```

## Built-In Validation

MetaUI actively intercepts validation upon submission or field blur.

### Required Fields
Applying `"required": true` adds an asterisk to the label and actively prevents submission if empty.

```json
{
  "Email": {
    "type": "string",
    "required": true,
    "ui": { "label": "Email Address" }
  }
}
```

### String Constraints
```json
{
  "Username": {
    "type": "string",
    "maxLength": 10,
    "pattern": "^[a-zA-Z]+$",
    "ui": { "label": "Username" }
  }
}
```

If validation fails, the control natively transitions to a red `ValueState.Error` with the corresponding message (e.g., "Maximum length is 10").
