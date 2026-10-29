# Getting Started

## Installation & Setup

MetaUI is an npm package, and your app installs it from npm. It needs **Node.js 22.14 or later**.

### Fastest: copy the starter app

A complete, runnable application lives at
[`examples/starter-app/`](../../examples/starter-app/). GitHub cannot download one folder, so
download the repository as a
[ZIP](https://github.com/SiliconStreetDev1/MetaUI/archive/refs/heads/main.zip), copy
`examples/starter-app/` out of it, and discard the rest. Then, in the copied folder:

```bash
npm install
npm start          # http://localhost:8080
```

It renders a form with a Submit button from a plain object, with no schema. Its README explains
what every file is for. If you are new to MetaUI, start there and edit it — the steps below are
for adding MetaUI to an app you already have.

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

**If `ui5 serve` was already running when you installed, restart it.** It reads `node_modules`
only when it starts. Until you restart it, the page is blank and the console shows
`failed to load 'nz/co/siliconst/ui5/metaui/library.js'`.

**4. Use it** — see [Declarative Usage](#declarative-usage-xml) below.

When you come to ship, there are two ways to deploy and the choice changes your app's build.
See **[Deployment](Deployment.md)**.

---

## Declarative Usage (XML)

Declare the namespace on your view, and place a `DynamicHost`. This is the whole of it:

```xml
<mvc:View
    controllerName="my.app.Main"
    displayBlock="true"
    xmlns:mvc="sap.ui.core.mvc"
    xmlns="sap.m"
    xmlns:meta="nz.co.siliconst.ui5.metaui.controls">

    <App>
        <Page title="My App">
            <meta:DynamicHost id="host" data="{/booking}" editable="true" submit=".onSubmit" />
            <footer>
                <OverflowToolbar>
                    <ToolbarSpacer />
                    <Button text="Submit" type="Emphasized" press=".onPressSubmit" />
                </OverflowToolbar>
            </footer>
        </Page>
    </App>
</mvc:View>
```

```javascript
// In the controller
onPressSubmit: function () {
    this.byId("host").triggerSubmit();   // validates; fires `submit` only if the form is valid
},
onSubmit: function (oEvent) {
    var oPayload = oEvent.getParameter("payload");       // the form's data, as an object
    var sJson = oEvent.getParameter("payloadJson");      // the same, as a JSON string
}
```

With `{/booking}` holding a plain object in a `JSONModel` (in the starter app, `Component.js` does
`this.setModel(new JSONModel({ booking: { … } }))`), that renders a form — MetaUI infers the
widgets from the data.

Three things in this snippet are easy to drop and each one costs you:

- **The `App`.** A `Page` takes its height from its parent. Without an `App` around it, the form is
  laid out at zero height and you see an empty page under the title bar. If your app already has an
  `App` or `Shell`, put the `DynamicHost` into the page you have.
- **The Submit button.** A `DynamicHost` on a page renders no submit button of its own; `submit`
  fires only when you call `triggerSubmit()`. (A form opened with `openInDialog`, below, has its own
  Save button.)
- **When the model updates.** Without `liveUpdate="true"`, edits reach `{/booking}` only on a
  successful submit. With it, they reach the model as the user types.

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
