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

### Static Dropdowns (Select)
If you need a simple dropdown with hardcoded options, set the widget to `select` and provide a `valueHelp` array containing `key` and `text` pairs. *(For live API-driven dropdowns, see 09. Actions and Datasources).*

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
