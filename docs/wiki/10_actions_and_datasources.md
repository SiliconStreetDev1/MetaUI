# 10. Actions and Datasources

MetaUI allows dynamic schemas to include actionable buttons and live data lookups.

## Action Plugins

Action plugins are rendered as Fiori Buttons (`sap.m.Button`). They execute a behavior rather than storing data.

### Submitting Forms
```json
{
  "SubmitAction": {
    "type": "string",
    "ui": {
      "widget": "submitButton",
      "label": "Save Changes"
    }
  }
}
```
When clicked, the `SubmitFormActionPlugin` triggers the `DynamicHost` validation pipeline. If valid, it fires the `submit` event on the host.

### Navigation
```json
{
  "HelpLink": {
    "type": "string",
    "ui": {
      "widget": "urlButton",
      "label": "Open Documentation",
      "args": "https://example.com/help"
    }
  }
}
```

## Datasource Plugins

Instead of hardcoding a dropdown with static enum values, you can bind it to a live OData service or REST endpoint.

### Remote Value Help (REST Mock)
Instead of static arrays, the `RemoteValueHelpPlugin` intercepts the dropdown and triggers a real network fetch to populate the options dynamically.

```json
{
  "Country": {
    "type": "string",
    "ui": {
      "label": "Select Country",
      "widget": "remoteDropdown"
    },
    "valueHelp": {
      "url": "/api/countries",
      "keyPath": "id",
      "textPath": "name"
    }
  }
}
```

The plugin natively reads the `valueHelp` configuration block, issues a standard `fetch()` call against `url`, and dynamically maps the array items to UI5 dropdown items based on the provided `keyPath` and `textPath`.

### OData List Binding
If your Fiori App has a registered OData model, you can bind a dropdown directly to an EntitySet. Pass an object mapping the `path`, `key`, and `text` into `ui.args`.

```json
{
  "Supplier": {
    "type": "string",
    "ui": {
      "label": "Supplier",
      "widget": "odataSelect",
      "args": {
        "path": "/Suppliers",
        "key": "SupplierID",
        "text": "CompanyName"
      }
    }
  }
}
```
