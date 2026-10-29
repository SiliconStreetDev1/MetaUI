# Getting Started

## Installation & Setup

MetaUI is an npm package. You do not clone this repository to use it.

### Fastest: copy the starter app

A complete, runnable application lives at
[`examples/starter-app/`](../../examples/starter-app/). Copy the folder, then:

```bash
npm install
npm start          # http://localhost:8080
```

It renders a form from a plain object with no schema. Its README explains what every file is for.
If you are new to MetaUI, start there and edit it — the steps below are for adding MetaUI to an
app you already have.

### Adding MetaUI to an existing UI5 Tooling app

**1. Install**

```bash
npm install @siliconst/metaui
```

**2. Declare it as a library** in your app's `manifest.json`. Required, not optional: UI5 only
fetches a library's `library-preload.js` when the library is named as a library.

```json
{
  "sap.ui5": { "dependencies": { "libs": { "nz.co.siliconst.ui5.metaui": {} } } }
}
```

**3. Check your app's `ui5.yaml` declares the UI5 framework itself.** MetaUI needs `sap.m`,
`sap.ui.core` and `sap.ui.layout` to be available. If your app does not already have this block,
`ui5 serve` has no UI5 to serve:

```yaml
framework:
  name: OpenUI5
  version: "1.120.50"
  libraries:
    - name: sap.m
    - name: sap.ui.core
    - name: sap.ui.layout
    - name: themelib_sap_horizon
```

That is everything `ui5 serve` needs. UI5 Tooling resolves MetaUI out of `node_modules` with no
further configuration, because the package ships its own `ui5.yaml`.

**4. Use it** — see [Declarative Usage](#declarative-usage-xml) below.

When you come to ship, there are two ways to deploy and the choice changes your app's build.
See **[Deployment](Deployment.md)**.

---

## Declarative Usage (XML)

Declare the namespace on your view, and place a `DynamicHost`. This is the whole of it:

```xml
<mvc:View
    controllerName="my.app.Main"
    xmlns:mvc="sap.ui.core.mvc"
    xmlns="sap.m"
    xmlns:meta="nz.co.siliconst.ui5.metaui.controls">

    <Page title="My App">
        <meta:DynamicHost data="{/booking}" editable="true" submit=".onSubmit" />
    </Page>
</mvc:View>
```

With `{/booking}` holding a plain object in a `JSONModel`, that renders a form — MetaUI infers the
widgets from the data. The `submit` event carries `payload` (object) and `payloadJson` (string).

Everything below is **reference**: the full set of properties and events, not a starting point.
Add them as you need them, and see [API Reference](APIReference.md) for what each one does.

### Every property at once

   The `DynamicHost` control expects data and (optionally) a schema definition. 
   
   **Understanding the Bindings:**
   MetaUI provides two distinct properties for binding data, depending on how your backend serves it:
   - `data`: Binds native JavaScript objects (e.g. from a standard UI5 JSONModel).
   - `dataJson`: Binds raw, stringified JSON strings (e.g. from a raw text payload fetched directly from an API).
   
   **String Binding (Raw JSON Strings)**
   If you are directly injecting raw JSON text (e.g., from an unstructured backend payload):
   ```xml
   <meta:DynamicHost
       dataJson="{/current/data}"
       schemaDefinition="{/current/schema}"
       liveUpdate="{/settings/liveUpdate}"
       editable="{/settings/editable}"
       debugMode="{/settings/debugMode}"
       useMessageManager="true"
       isValid="{/settings/isValid}"
       modelName="meta"
       beforeSubmit=".onHostBeforeSubmit"
       submit=".onHostSubmit"
       cancel=".onHostCancel"
       fieldChange=".onHostFieldChange"
       validationStateChanged=".onHostValidationStateChanged"
       validationError=".onHostValidationError"
       validationSuccess=".onHostValidationSuccess"
       error=".onHostError" />
   ```

   **Object Binding (Parsed JS Objects)**
   If you have already parsed the data into a standard JavaScript object within your UI5 model:
   ```xml
   <meta:DynamicHost
       data="{/current/dataObj}"
       schemaDefinition="{/current/schemaObj}"
       liveUpdate="{/settings/liveUpdate}"
       editable="{/settings/editable}"
       debugMode="{/settings/debugMode}"
       useMessageManager="true"
       isValid="{/settings/isValid}"
       modelName="meta"
       beforeSubmit=".onHostBeforeSubmit"
       submit=".onHostSubmit"
       cancel=".onHostCancel"
       fieldChange=".onHostFieldChange"
       validationStateChanged=".onHostValidationStateChanged"
       validationError=".onHostValidationError"
       validationSuccess=".onHostValidationSuccess"
       error=".onHostError" />
   ```

---

## Programmatic Usage & Dialog Popups

You can bypass XML entirely and instantiate the engine dynamically inside your controllers. This is incredibly powerful for generating instant, self-validating popup forms using raw JSON strings, completely detached from UI5 model bindings.

### Pure String to Dialog (No UI5 Model Binding)

If you have a raw JSON string from an API and want to instantly pop up a form to edit it, and then receive the clean payload back:

```javascript
sap.ui.require(["nz/co/siliconst/ui5/metaui/controls/DynamicHost"], function(DynamicHost) {
    
    // 1. Instantiate the Host passing pure raw strings (no XML bindings needed)
    var oHost = new DynamicHost({
        dataJson: '{"CustomerName": "Acme Corp", "IsActive": true}',
        schemaDefinition: '{"type":"object","properties":{"CustomerName":{"type":"string","required":true},"IsActive":{"type":"boolean"}}}'
    });

    // 2. Wire up the submit event to extract the validated data payload
    oHost.attachSubmit(function(oEvent) {
        var payload = oEvent.getParameter("payload");
        console.log("Extracted payload after validation:", payload);
        // e.g. Send 'payload' back to your REST API
    });

    // 3. CRITICAL: Attach the host to the view lifecycle so UI5 themes and rendering resolve correctly
    this.getView().addDependent(oHost);

    // 4. Trigger the native popup framework
    // This automatically wraps the layout in a sap.m.Dialog, wires the Save button
    // to the Validation Pipeline, and destroys the dialog from memory when closed.
    oHost.openInDialog("Edit Customer", "Save Changes", "Cancel", "800px", this.getView());

}.bind(this));
```

The `DialogDelegate` automatically:
1. Wraps the generated layout inside a native `sap.m.Dialog`.
2. Generates the "Save Changes" (Submit) and "Cancel" buttons.
3. Wires the submit button directly into MetaUI's internal Validation Pipeline (it will not close if there are schema errors).
4. Handles destroying the dialog from memory when closed, preventing memory leaks.
