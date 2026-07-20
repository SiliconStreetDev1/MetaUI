# Custom Plugin Authorship Guide

MetaUI utilizes a rigid, modular Plugin Architecture. To extend MetaUI with custom functionality without modifying the core engine, you can build and register your own plugins.

## 1. Directory Structure

MetaUI enforces strict physical segregation of plugins to prevent God Classes. All plugins reside in their respective functional domains:

- `src/.../plugins/controls/` - Visual UI5 components (e.g., Maps, Signatures).
- `src/.../plugins/validators/` - Custom business logic and constraints. **Reference Example**: [EmailValidatorPlugin.ts](file:///c:/projects/Games/MetaUI/src/nz/co/siliconst/ui5/metaui/plugins/validators/EmailValidatorPlugin.ts)
- `src/.../plugins/formatters/` - Data transformation utilities. **Reference Example**: [CurrencyFormatterPlugin.ts](file:///c:/projects/Games/MetaUI/src/nz/co/siliconst/ui5/metaui/plugins/formatters/CurrencyFormatterPlugin.ts)
- `src/.../plugins/actions/` - Execution handlers (e.g., custom button press). **Reference Example**: [ClearFormActionPlugin.ts](file:///c:/projects/Games/MetaUI/src/nz/co/siliconst/ui5/metaui/plugins/actions/ClearFormActionPlugin.ts)
- `src/.../plugins/datasources/` - Remote ValueHelp and dropdown providers. **Reference Example**: [RemoteValueHelpPlugin.ts](file:///c:/projects/Games/MetaUI/src/nz/co/siliconst/ui5/metaui/plugins/datasources/RemoteValueHelpPlugin.ts)

## 2. Writing a Control Plugin

All control plugins must implement the `IPlugin` interface. The easiest way to do this is to extend `BasePlugin`.

```typescript
import { BasePlugin } from "nz/co/siliconst/ui5/metaui/plugins/controls/BasePlugin";
import { IPropertyMetadata } from "nz/co/siliconst/ui5/metaui/interfaces/ISchema";
import Control from "sap/ui/core/Control";
import Input from "sap/m/Input";

export class MyCustomInputPlugin extends BasePlugin {
    public render(fieldMetadata: IPropertyMetadata, bindingPath: string, modelName: string = "meta"): Control {
        this.metadata = fieldMetadata;
        this.fieldKey = bindingPath.split("/").pop() || "";
        this.modelName = modelName;

        this.control = new Input({
            value: `{${modelName}>/${bindingPath}}`,
            placeholder: fieldMetadata.ui?.label || "Enter value",
            change: (oEvent: sap.ui.base.Event) => {
                const val = oEvent.getParameter("value");
                this.publishChange(val);
                this.validate();
            }
        });

        // Automatically binds visibleOn, readOnly, enabledOn
        this.applyCommonDirectives(this.control, fieldMetadata, modelName);

        return this.control;
    }

    protected getValue(): any {
        return (this.control as Input).getValue();
    }

    protected applyState(): void {
        if (this.control && this.metadata?.ui?.label) {
            (this.control as Input).setPlaceholder(this.metadata.ui.label);
        }
    }
}
```

## 3. Registering Your Plugin

Once your plugin class is written, you must register it with the `PluginRegistry` so the `Engine` knows when to use it.

### Registering Controls, Actions, and Data Sources
Use the `PluginRegistry` for visual plugins.

```typescript
import { PluginRegistry } from "nz/co/siliconst/ui5/metaui/core/PluginRegistry";
import { MyCustomInputPlugin } from "./MyCustomInputPlugin";

// Register it to handle string types where widget === 'myCustomWidget'
PluginRegistry.getInstance().register("string", MyCustomInputPlugin, "myCustomWidget");
```

### Registering Validators and Formatters
Use the `PipelineManager.GlobalPipeline` for business logic plugins.

```typescript
import { GlobalPipeline } from "nz/co/siliconst/ui5/metaui/core/PipelineManager";
import { MyCompanySignatureValidator } from "./MyCompanySignatureValidator";

// Register it so the schema can use "validators": ["signatureCheck"]
GlobalPipeline.validators.register("signatureCheck", new MyCompanySignatureValidator());
```

Now, your backend simply outputs this JSON schema, and MetaUI will render your custom control:

```json
{
  "properties": {
    "SpecialField": {
      "type": "string",
      "ui": {
        "widget": "myCustomWidget",
        "label": "My Special Input"
      }
    }
  }
}
```

## 4. Best Practices (Zero Hacks)

1. **State Isolation:** Never store global state in your plugin instance. MetaUI creates a single instance of your plugin class and re-uses it per field (or instantiates anew via factory if required). Rely heavily on UI5 data binding.
2. **Lifecycle:** If you create internal JSONModels or instantiate sub-controls manually, you MUST destroy them when your plugin is destroyed to prevent memory leaks in the Launchpad.
3. **No Direct DOM Manipulation:** Strict UI5 guidelines apply. Do not use jQuery or `document.getElementById()`.
4. **Architectural Boundary:** Never build structural containers (`Form`, `VBox`, `Table`) inside an `IPlugin`. Plugins are atomic leaf-nodes (e.g. `sap.m.Input`). Structural orchestration must be handled exclusively by creating an `ILayoutManager` (e.g. `CompactLayout`, `FormLayout`) and registering it in the `LayoutRegistry`.
