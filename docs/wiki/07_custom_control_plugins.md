# 07. Custom Control Plugins

MetaUI enforces a strict "Plugin-First" philosophy. If you need a custom UI element, a complex barcode scanner, or an integration with a third-party map, **do not hack it into the engine**. Build an isolated Plugin.

## 1. Implement `BasePlugin`

Every control plugin must extend `BasePlugin` and implement the `IPlugin` contract.

**`src/plugins/controls/MyCustomMapPlugin.ts`**
```typescript
import { BasePlugin } from "./BasePlugin";
import { IPropertyMetadata } from "../../interfaces/ISchema";
import { IPluginValidationResult } from "../../interfaces/IPlugin";
import Control from "sap/ui/core/Control";
import Text from "sap/m/Text";

export class MyCustomMapPlugin extends BasePlugin {
    
    public render(fieldMetadata: IPropertyMetadata, bindingPath: string, modelName: string = "meta"): Control {
        this.metadata = fieldMetadata; // Sets up base property for ConditionEngine state management
        
        // 1. Instantiate your custom UI5 Control
        this.control = new Text({
            text: `{${modelName}>${bindingPath}}`
        });

        // 2. Apply common directives (visibleOn, enabledOn, readonly)
        this.applyCommonDirectives(this.control, fieldMetadata);
        
        return this.control;
    }

    public validate(): IPluginValidationResult {
        // Implement custom structural validation if needed
        return { isValid: true };
    }

    public destroy(): void {
        // CLEANUP: Destroy custom models or listeners here to prevent Fiori memory leaks
        super.destroy(); 
    }
}
```

## 2. Register the Plugin

Once built, you must map the plugin to a JSON Schema Type and an optional `ui.widget` hint inside the `PluginRegistry`.

**`src/core/PluginRegistry.ts`**
```typescript
import { MyCustomMapPlugin } from "../plugins/controls/MyCustomMapPlugin";

// Inside constructor:
this.register("string", MyCustomMapPlugin, "customMap");
```

## 3. Trigger it via Schema

Now, any backend developer can trigger your custom control instantly by providing the widget hint:

```json
{
  "LocationData": {
    "type": "string",
    "ui": {
      "label": "Delivery Location",
      "widget": "customMap"
    }
  }
}
```
