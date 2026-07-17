# MetaUI Payload Formats

The MetaUI engine consumes exactly two JSON payloads: the **Schema Definition** and the **Initial Data Payload**. Both payloads map directly to the `GeneratorHost` UI5 properties and operate entirely detached from any OData host models via the **Isolated State Pattern**.

## 1. Schema Definition (`schemaDefinition`)
This JSON defines the structure of the UI layout and binds directly to the TypeScript interface `ISchema`.

### Example
```json
{
  "mode": "mixed",
  "rootFields": [
    {
      "fieldName": "CustomerName",
      "type": "string",
      "label": "Customer Name",
      "isKey": true,
      "isReadOnly": false,
      "isRequired": true,
      "maxLength": 50
    },
    {
      "fieldName": "AccountType",
      "type": "dropdown",
      "label": "Account Type",
      "isKey": false,
      "isReadOnly": false,
      "isRequired": true,
      "valueHelp": [
        { "key": "BASIC", "text": "Basic Plan" },
        { "key": "PREMIUM", "text": "Premium Plan" }
      ]
    }
  ],
  "tables": [
    {
      "tableName": "Contacts",
      "label": "Authorized Contacts",
      "fields": [
        {
          "fieldName": "FullName",
          "type": "string",
          "label": "Full Name",
          "isKey": false,
          "isReadOnly": false,
          "isRequired": true,
          "maxLength": 100
        }
      ]
    }
  ]
}
```

### Properties
*   `mode`: `form` | `table` | `mixed`. Defines the rendering strategy orchestrator.
*   `rootFields`: Array of metadata describing the top-level form elements (rendered via `sap.ui.layout.form.SimpleForm`).
*   `tables`: Array of metadata describing nested table structures (rendered via `sap.m.Table`).
*   `type`: Evaluated by the `PluginRegistry` to map to `sap.m.*` primitives (`string`, `number`, `boolean`, `dropdown`, `date`).

## 2. Initial Data Payload (`initialData`)
This JSON represents the current state of the UI form. The root fields live at the root object, and tables live inside arrays named identically to their `tableName`.

### Example
```json
{
  "CustomerName": "Siliconst Corp",
  "AccountType": "PREMIUM",
  "Contacts": [
    {
      "FullName": "Alice Smith"
    },
    {
      "FullName": "Bob Jones"
    }
  ]
}
```

When the user modifies the UI5 form and clicks **Save**, this exact structure is intercepted, serialized from the Isolated State model, and emitted out via the `GeneratorHost`'s `submit` event!
