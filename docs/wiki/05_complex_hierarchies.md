# 05. Complex Hierarchies

Enterprise data payloads are rarely flat. MetaUI supports recursive generation of nested `object` and `array` structures indefinitely.

## Embedded Tables (Arrays inside Objects)

If a property inside a parent object is typed as an `array`, the `FormLayout` delegates the generation back to the `Engine` to natively embed a `TableLayout` beneath the form fields.

```json
{
  "type": "object",
  "uiLayout": [
    { "type": "Control", "scope": "#/properties/HeaderName" },
    { "type": "Control", "scope": "#/properties/Items" }
  ],
  "properties": {
    "HeaderName": { "type": "string", "ui": { "label": "Document Name" } },
    "Items": {
      "type": "array",
      "items": {
        "type": "object",
        "uiLayout": [
          { "type": "Control", "scope": "#/properties/Material" },
          { "type": "Control", "scope": "#/properties/Quantity" }
        ],
        "properties": {
          "Material": { "type": "string" },
          "Quantity": { "type": "number" }
        }
      }
    }
  }
}
```
*Result*: A Form displaying "Header Name" followed by a Table displaying "Material" and "Quantity" columns.

## Deep Nested Drill-Downs

What happens if you have a massive Object inside another Object? Standard UI5 Forms would become hopelessly cluttered if you tried to nest 30 fields inside a single cell of a parent form. 

To solve this, if a property is of `type: "object"`, the layout engine utilizes the **`ObjectPlugin`**. 

Instead of attempting to render the nested object's fields inline, the `ObjectPlugin` renders a simple Fiori Button (e.g., "View Details"). When the user clicks this button, MetaUI takes the nested schema and recursively mounts a brand new `GeneratorHost` inside a popup `sap.m.Dialog`. 

This is incredibly useful for isolating complex nested configurations without breaking the user experience of the parent form.

### Visual Mapping & Drill-Down Example

Let's look at an enterprise scenario: an Employee Profile that contains a massive sub-object for `NetworkConfiguration`. 

```json
{
  "type": "object",
  "uiLayout": [
    { "type": "Control", "scope": "#/properties/EmployeeName" },
    { "type": "Control", "scope": "#/properties/NetworkConfiguration" }
  ],
  "properties": {
    "EmployeeName": { "type": "string", "ui": { "label": "Employee Name" } },
    
    "NetworkConfiguration": {
      "type": "object",
      "ui": {
        "label": "Network Settings",
        "dialogButtonText": "Apply Network Settings"
      },
      "uiLayout": [
        { "type": "Control", "scope": "#/properties/IpAddress" },
        { "type": "Control", "scope": "#/properties/SubnetMask" },
        { "type": "Control", "scope": "#/properties/UseProxy" }
      ],
      "properties": {
        "IpAddress": { "type": "string", "ui": { "label": "Static IP Address" } },
        "SubnetMask": { "type": "string", "ui": { "label": "Subnet Mask" } },
        "UseProxy": { "type": "boolean", "ui": { "label": "Enable Corporate Proxy", "widget": "switch" } }
      }
    }
  }
}
```

### What happens on the screen:
1. **The Parent Form:** MetaUI renders the "Employee Name" input field. Next to it, instead of trying to cram 3 network fields into the form, it renders a label `"Network Settings"` and a Fiori Button that says `"View Details"`.
2. **The Drill-Down:** The user clicks "View Details". MetaUI dynamically generates a `sap.m.Dialog` (Popup).
3. **The Popup Form:** Inside that popup, a brand new `GeneratorHost` takes over. It parses the nested `uiLayout` and renders the `IpAddress`, `SubnetMask`, and `UseProxy` fields natively.
4. **The Custom Action:** At the bottom of the popup, instead of a generic "Save" button, it renders a button labeled `"Apply Network Settings"` (because we defined `ui.dialogButtonText`).
5. **Data Persistence:** When the user clicks Apply, the popup closes, and the data is safely merged back into the root `meta` JSONModel under the `"NetworkConfiguration"` key.

> [!NOTE]
> The exact same drill-down paradigm and `dialogButtonText` property apply to nested `array` properties utilizing the `ArrayPlugin`. If you define an array of complex objects without rendering them as an inline table, MetaUI will drill down into a list/detail dialog automatically.
