# Getting Started

## Installation & Setup

1. **Clone the Repository**
   ```bash
   git clone https://github.com/SiliconStreetDev1/MetaUI.git
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Deploy to ABAP**
   ```bash
   npm run deploy
   ```
   **What does this do?**
   The `deploy` script automatically executes the build pipeline, flattens the directory structure, and uploads the library to the ABAP server. 
   
   **Why is the flattening step necessary?**
   When deploying a custom SAPUI5 library to an ABAP server, if the compiled library files are buried inside a `/resources/` folder (the standard `ui5 build` output), the SAP App Index calculation program (`/UI5/APP_INDEX_CALCULATE`) will fail to find it, resulting in 404 Not Found errors on the Fiori Launchpad. The deploy script safely restructures the `dist` folder so the `manifest.json` and namespace sit directly at the root of the BSP application before the upload occurs.

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
       error=".onHostError"
       fieldChange=".onHostFieldChange"
       submit=".onHostSubmit" />
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
       error=".onHostError"
       fieldChange=".onHostFieldChange"
       submit=".onHostSubmit" />
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
