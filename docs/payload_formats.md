# MetaUI Schema Specification

MetaUI operates on a strict, dictionary-based JSON Schema architecture. This schema acts as the single source of truth for the `GeneratorHost`, dictating exactly how data structures are mapped into dynamic UI5 Layouts.

## The Core Concept

MetaUI uses standard JSON Schema `properties` blocks.

### Root Form Definition

A standard `FormLayout` is derived from an `object` type with scalar properties.

```json
{
  "title": "Customer Profile",
  "type": "object",
  "properties": {
    "CustomerName": {
      "type": "string",
      "required": true,
      "maxLength": 50,
      "ui": {
        "label": "Customer Name",
        "isKey": true,
        "group": "General Information"
      }
    },
    "IsActive": {
      "type": "boolean",
      "ui": {
        "label": "Account Active",
        "group": "General Information",
        "widget": "switch"
      }
    }
  }
}
```

### Complex Hierarchies (Nested Arrays)

If a property is of `type: "array"`, the `Engine` will automatically inject it as a native drill-down `TableLayout` beneath the parent form. Deeply nested tables will automatically utilize the `ArrayPlugin` to spawn recursive Dialog drill-downs.

```json
{
  "title": "Purchase Orders List",
  "type": "object",
  "properties": {
    "PurchaseOrders": {
      "type": "array",
      "ui": { "label": "Purchase Orders" },
      "items": {
        "type": "object",
        "properties": {
          "orderId": { 
            "type": "string",
            "ui": { "label": "Order ID", "isKey": true }
          },
          "lineItems": {
            "type": "array",
            "ui": { "label": "Line Items" },
            "items": {
              "type": "object",
              "properties": {
                "itemCode": { "type": "string" },
                "quantity": { "type": "number" }
              }
            }
          }
        }
      }
    }
  }
}
```

---

## Core Schema Properties (Level 1)

These properties adhere to standard JSON Schema structures and drive both rendering and strict validation pipelines:

### `type` (String)
Primitive type mapping (`string`, `number`, `boolean`, `array`, `date`, `time`, `datetime`).

### `required` (Boolean)
If true, the layout renders a mandatory asterisk next to the field label and blocks form submission if the field is empty, actively highlighting the input in red.

### `maxLength` (Number)
Enforces maximum character length on string inputs.

---

## Technical Directives Reference (`ui.*`)

All MetaUI visual orchestrations are driven by the optional `ui` dictionary inside any property.

### `ui.label` (String)
The human-readable label injected into Column Headers or Form Labels.
```json
"ui": { "label": "Total Amount (USD)" }
```

### `ui.group` (String)
Enables semantic Form Grouping. Any scalar property sharing the same group string will be clustered under a native `sap.ui.core.Title` section inside the `FormLayout`.
```json
"ui": { "group": "Financial Details" }
```

### `ui.isKey` (Boolean)
Flags a property as a primary identifier. In a `TableLayout`, columns marked as keys will *never* pop-in on mobile, ensuring they are always visible.
```json
"ui": { "isKey": true }
```

### `ui.widget` (String)
Overrides the default Plugin resolution to render a specific UI5 Control.

| Property Type | Default Widget | Supported Override Widgets |
|---------------|----------------|----------------------------|
| `boolean`     | `sap.m.CheckBox` | `switch` (`sap.m.Switch`) |
| `string`      | `sap.m.Input`  | `textArea` (Future), `html` (Future) |

```json
"ui": { "widget": "switch" }
```

### `ui.readOnly` (Boolean)
Disables input interaction for the generated control, utilizing `sap.m.InputBase#setEnabled(false)`.
```json
"ui": { "readOnly": true }
```

### `ui.visibleOn` (Expression String)
The `ConditionEngine` provides a custom expression binding abstraction allowing you to natively hide/show fields based on the state of *other* fields in the payload.

Prefix the path with `$root.` to instruct the engine to traverse up to the root JSONModel. This is strictly compiled into a highly performant native UI5 Expression Binding path (`${meta>/path}`).

```json
"ui": { "visibleOn": "$root.AccountType === 'PREMIUM'" }
```
*(If `AccountType` changes to anything other than PREMIUM, the field is instantly hidden via native UI5 reactivity, zero JS required).*
