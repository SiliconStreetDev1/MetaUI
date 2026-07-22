# Creating Custom Plugins

MetaUI's architecture is based entirely on a decoupled **Plugin-First** philosophy. If you need a specialized UI control (e.g., a barcode scanner, an address lookup, or a complex custom composite control) that is not included in the standard 24 plugins, you can easily create and register your own.

Every plugin is an isolated class that handles its own UI5 control instantiation, data binding, and value extraction.

---

## 1. Extend the `BasePlugin` Class

To create a new plugin, create a TypeScript class that extends `BasePlugin`. This abstract class enforces the necessary contracts so the `Engine` and `StateManager` can interact with it predictably.

```typescript
import { BasePlugin } from "nz/co/siliconst/ui5/metaui/plugins/controls/BasePlugin";
import { IPropertyMetadata } from "nz/co/siliconst/ui5/metaui/interfaces/ISchema";
import Control from "sap/ui/core/Control";
import Input from "sap/m/Input"; // Or your custom UI5 control

export class MyCustomPlugin extends BasePlugin {
    // Implementation goes here
}
```

---

## 2. Implement the `render` Method

The `render` method is called by the `Engine` when building the layout. Here, you instantiate your UI5 control and map the UI5 data binding.

**Crucial Steps:**
1. Call `this.generateStableId()` to ensure the control ID is globally unique.
2. Bind the control's value property using the `modelName` and `bindingPath`.
3. Trigger the `onChange` callback when the user edits the value (so the Validation Pipeline can run).
4. Call `this.applyCommonDirectives()` to automatically hook up standard schema rules like `visibleOn` and `readOnly`.

```typescript
public render(fieldMetadata: IPropertyMetadata, bindingPath: string, modelName: string = "meta", engineScopeId?: string, onChange?: (isValid: boolean, fieldKey?: string) => void): Control {
    this.onChange = onChange;
    this.metadata = fieldMetadata;
    this.fieldKey = bindingPath.replace("/", ""); // Internal path key

    // 1. Create the UI5 Control
    this.control = new Input({
        id: this.generateStableId(engineScopeId, bindingPath),
        value: `{${modelName}>${bindingPath}}`, // Bind to the engine's model
        change: (oEvent: sap.ui.base.Event) => {
            // 2. Validate and notify the engine on user interaction
            const result = this.validate();
            if (this.onChange) {
                this.onChange(result.isValid, this.fieldKey);
            }
        }
    });

    // 3. Apply standard visibility/readonly state bindings
    this.applyCommonDirectives(this.control, fieldMetadata, modelName);

    return this.control as Control;
}
```

---

## 3. Implement `getValue` and `applyState`

To fully comply with the interface, you must provide methods for data extraction and dynamic state updates.

### `getValue()`
The `StateManager` calls this method when extracting the payload for validation. It must return the raw, unformatted value directly from your UI5 control.

```typescript
protected getValue(): unknown {
    if (this.control) {
        return (this.control as Input).getValue();
    }
    return null;
}
```

### `applyState()`
If a condition rule triggers (e.g., another field forces this field to become read-only), the engine pushes the mutated schema down to the plugin. You must handle updating the physical control.

```typescript
protected applyState(): void {
    if (this.control && this.metadata) {
        const input = this.control as Input;
        input.setEditable(!this.metadata.ui?.readOnly);
        input.setRequired(!!this.metadata.required);
    }
}
```

---

## 4. Register the Plugin

*(Note: In the current framework iteration, core plugins are statically registered inside `PluginRegistry.ts`. For custom library extensions, you will map your plugin class into the registry matching your specific `widget` or `type` string defined in your JSON Schema).*
