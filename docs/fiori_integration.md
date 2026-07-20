# Fiori Integration Guide

MetaUI is designed for robust deployment within the SAP Fiori Launchpad. This guide outlines the standard procedures for integrating the `GeneratorHost` into a structured `Component.js` architecture.

## 1. Library Declaration (manifest.json)

Declare the MetaUI library as a dependency in your application's `manifest.json`. Ensure that the SAP Fiori Launchpad can resolve the namespace during bootstrap.

```json
{
  "sap.ui5": {
    "dependencies": {
      "minUI5Version": "1.71.0",
      "libs": {
        "sap.m": {},
        "sap.ui.core": {},
        "sap.ui.layout": {},
        "nz.co.siliconst.ui5.metaui": {}
      }
    }
  }
}
```

## 2. Component Initialization

If your application requires global models or MessageManagers, initialize them securely in the `Component.js` `init` lifecycle hook.

```javascript
sap.ui.define([
    "sap/ui/core/UIComponent",
    "sap/ui/model/json/JSONModel",
    "sap/ui/core/message/MessageManager"
], function (UIComponent, JSONModel, MessageManager) {
    "use strict";

    return UIComponent.extend("com.mycompany.app.Component", {
        metadata: {
            manifest: "json"
        },

        init: function () {
            // Call the base component's init function
            UIComponent.prototype.init.apply(this, arguments);

            // Enable global Fiori Message Management
            var oMessageManager = sap.ui.getCore().getMessageManager();
            this.setModel(oMessageManager.getMessageModel(), "message");
            oMessageManager.registerObject(this, true);

            // Initialize the router
            this.getRouter().initialize();
        }
    });
});
```

## 3. View Integration & Error Management

Embed the `GeneratorHost` inside your XML view. Enable `useMessageManager="true"` to route all schema validation errors to the Fiori Launchpad's global error popover.

```xml
<mvc:View
    controllerName="com.mycompany.app.controller.Main"
    xmlns:mvc="sap.ui.core.mvc"
    xmlns="sap.m"
    xmlns:meta="nz.co.siliconst.ui5.metaui.controls">

    <Page title="Dynamic Configuration">
        <headerContent>
            <!-- Standard Fiori Message Popover Button -->
            <Button 
                icon="sap-icon://message-popup" 
                text="{= ${message>/}.length }" 
                type="Emphasized" 
                press=".onMessagePopoverPress" 
                visible="{= ${message>/}.length > 0 }" />
        </headerContent>
        
        <content>
            <meta:GeneratorHost 
                id="dynamicForm"
                schemaDefinition="{api>/DynamicSchema}" 
                data="{api>/PayloadData}"
                useMessageManager="true"
                submit=".onPayloadSubmit" />
        </content>
        
        <footer>
            <Toolbar>
                <ToolbarSpacer/>
                <Button text="Submit Payload" type="Accept" press=".onTriggerSubmit" />
            </Toolbar>
        </footer>
    </Page>
</mvc:View>
```

## 4. XSS and Data Sanitization Strategy

> [!WARNING]
> **Important Security Notice:** MetaUI intentionally preserves raw string inputs to support legitimate complex payloads (such as embedded XML or HTML parameters). 
> 
> MetaUI relies natively on UI5's robust DOM sanitization for secure rendering, but it **does not** strip tags during `extractPayload()`. It is the strict responsibility of the backend OData service or gateway to apply SAP NetWeaver anti-XSS libraries before persisting any data extracted from MetaUI.

## 5. Diagnostic Telemetry

MetaUI uses the standard `sap/base/Log` module for all internal exceptions (e.g., malformed schemas or failed plugin instantiations). These logs are automatically routed to the Fiori Launchpad support console.

To trace MetaUI rendering issues, filter your console for the `[MetaUI]` prefix:

```javascript
// Example of accessing logs programmatically if needed
sap.ui.require(["sap/base/Log"], function(Log) {
    Log.setLevel(Log.Level.ALL, "GeneratorHost");
});
```
