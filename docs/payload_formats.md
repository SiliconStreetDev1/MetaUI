# MetaUI Schema Specification

MetaUI operates on a strict, dictionary-based JSON Schema architecture. This schema acts as the single source of truth for the `DynamicHost` and underlying engine, dictating exactly how data structures are mapped into dynamic UI5 Layouts.

## The Core Concept

MetaUI uses standard JSON Schema `properties` blocks.

### Root Form Definition

A standard `FormLayout` is derived from an `object` type with scalar properties.

```json
{
  "title": "Customer Profile",
  "type": "object",
  "layoutStrategy": "form",
  "uiLayout": [
    {
      "type": "Group",
      "label": "General Information",
      "elements": [
        { "type": "Control", "scope": "#/properties/CustomerName" },
        { "type": "Control", "scope": "#/properties/IsActive" }
      ]
    }
  ],
  "properties": {
    "CustomerName": {
      "type": "string",
      "required": true,
      "maxLength": 50,
      "ui": {
        "label": "Customer Name",
        "isKey": true
      }
    },
    "IsActive": {
      "type": "boolean",
      "ui": {
        "label": "Account Active",
        "widget": "switch"
      }
    }
  }
}
```

### Complex Hierarchies (Nested Arrays)

If a property is of `type: "array"`, the `FormLayout` will natively orchestrate an embedded `TableLayout` beneath the parent form. Deeply nested tables and objects will automatically utilize the `ArrayPlugin` or `ObjectPlugin` to spawn recursive Dialog drill-downs.

```json
{
  "title": "Purchase Orders List",
  "type": "object",
  "properties": {
    "PurchaseOrders": {
      "type": "array",
      "layoutStrategy": "table",
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
Primitive type mapping (`string`, `number`, `boolean`, `array`, `object`, `date`).

### `required` (Boolean)
If true, the layout renders a mandatory asterisk next to the field label and blocks form submission if the field is empty, actively highlighting the input in red.

### `maxLength` (Number)
Enforces maximum character length on string inputs.

---

## Layout Orchestration (`uiLayout`)

The visual layout of the schema is fully decoupled from the data definition using the `uiLayout` array.

### `uiLayout` (Array)
An array of layout elements defining exactly how the fields should be displayed on screen.
- **`Group`**: A visual container. Generates a Fiori `Title`. Supports nested `elements`.
- **`Control`**: A data field. Must specify a `scope` (JSON pointer) linking it to a definition in the `properties` block. Supports an optional `widget` override.
- **`WizardStep`**: Defines an isolated paginated step for the `WizardLayout`.

```json
"uiLayout": [
  {
    "type": "Group",
    "label": "Financial Details",
    "elements": [
      { "type": "Control", "scope": "#/properties/CreditLimit" }
    ]
  }
]
```

---

## Technical Directives Reference (`ui.*`)

All MetaUI visual orchestrations are driven by the optional `ui` dictionary inside any property.

### `ui.label` (String)
The human-readable label injected into Column Headers or Form Labels.
```json
"ui": { "label": "Total Amount (USD)" }
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
| `string`      | `sap.m.Input`  | `textArea`, `html`, `clearButton`, `remoteDropdown`, `select`, `time`, `datetime` |

```json
"ui": { "widget": "remoteDropdown" }
```

### `ui.validators` (Array of Strings or Objects)
Instructs the `PipelineManager` to execute specific registered business logic validators before saving data to the model. Can be a simple string array or an array of configuration objects (`IValidationRule`) for passing custom arguments.

```json
"ui": { 
  "validators": [
    "email", 
    "required",
    { "name": "maxLength", "args": 50 }
  ] 
}
```

### `ui.formatter` (String)
Instructs the `PipelineManager` to pass the raw data through a registered data formatter before displaying it in the UI.

```json
"ui": { "formatter": "currency" }
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
