# Getting Started

## Installation & Setup

MetaUI is an npm package. You do not clone this repository to use it.

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

That is everything `ui5 serve` needs — UI5 Tooling resolves MetaUI out of `node_modules` with no
further configuration, because the package ships its own `ui5.yaml`.

**3. Use it** — see [Declarative Usage](#declarative-usage-xml) below.

When you come to ship, there are two ways to deploy and the choice changes your app's build.
See **[Deployment](Deployment.md)**.

---

## Declarative Usage (XML)

To embed the MetaUI engine inside a standard UI5 XML view natively:

1. **Declare the Namespace**
   Add the MetaUI namespace to your `<core:View>` or `<core:FragmentDefinition>`:
   ```xml
   xmlns:meta="nz.co.siliconst.ui5.metaui.controls"
   ```

2. **Embed the DynamicHost**
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
