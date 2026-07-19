# 04. Layouts and Groups

By default, the `Engine` separates data definition from visual presentation. To organize fields within a form, you define a explicit `uiLayout` array.

## The `uiLayout` Structure

The `uiLayout` is an array of layout elements that dictate exactly how the data should be visually presented on the screen. It supports `Group` elements to partition the form into logical sections, and `Control` elements to render specific fields.

```json
{
  "type": "object",
  "uiLayout": [
    {
      "type": "Group",
      "label": "Personal Information",
      "elements": [
        { "type": "Control", "scope": "#/properties/FirstName" },
        { "type": "Control", "scope": "#/properties/LastName" }
      ]
    },
    {
      "type": "Group",
      "label": "Corporate Structure",
      "elements": [
        { "type": "Control", "scope": "#/properties/Department" }
      ]
    }
  ],
  "properties": {
    "FirstName": {
      "type": "string",
      "ui": { "label": "First Name" }
    },
    "LastName": {
      "type": "string",
      "ui": { "label": "Last Name" }
    },
    "Department": {
      "type": "string",
      "ui": { "label": "Department" }
    }
  }
}
```

In the above example, the generated `SimpleForm` will have two distinct visual sections: "Personal Information" and "Corporate Structure". The fields are bound to the data properties using the JSON Pointer syntax (`#/properties/...`) in the `scope` attribute.

> [!NOTE]
> **Strict Ordering:** The exact order in which you define elements in the `uiLayout` array is the exact order they will be rendered on the screen.

## Layout Strategies

The schema supports an explicit `layoutStrategy` override at the root level, though it is usually inferred based on the schema `type`.

| Strategy | Description |
|---|---|
| `form` | Default for `object`. Generates a `SimpleForm`. |
| `table` | Default for `array`. Generates a `sap.m.Table` (responsive) or `sap.ui.table.Table` (analytical). |
| `mixed` | Forces both object and array layout strategies sequentially inside a `VBox`. |

### Forcing a Table Layout
If you supply an array, MetaUI inherently uses the `table` strategy. Because massive data tables cannot be embedded inside standard Fiori Form cells without breaking responsive design, **arrays are always extracted and rendered full-width below the form.**

If the array is nested inside an object, the table derives its title from the property's `ui.label` or the layout element's `label`. However, if you are supplying a **root-level array**, you must provide a `title` attribute at the top of the schema.

```json
{
  "type": "array",
  "title": "System Logs",
  "uiLayout": [
    { "type": "Control", "scope": "#/properties/LogId" },
    { "type": "Control", "scope": "#/properties/Message" }
  ],
  "items": {
    "type": "object",
    "properties": {
      "LogId": { "type": "string", "ui": { "label": "Log ID" } },
      "Message": { "type": "string", "ui": { "label": "Details" } }
    }
  }
}
```
