# Creating Custom Plugins

MetaUI's architecture is based entirely on a decoupled **Plugin-First** philosophy. If you need a specialized UI control (e.g., a barcode scanner, an address lookup, or a complex custom composite control) that is not included in the standard 31 plugins, you can easily create and register your own.

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

## 2. Exhaustive `BasePlugin` Architecture

The `BasePlugin` provides a strictly defined foundation. When building a custom plugin, you have access to the following protected state properties and inherit several lifecycle methods. 

### Protected State Properties
You can access these properties directly via `this.` inside your custom plugin:
- **`control`**: `(Control | null)` The instantiated UI5 control for this plugin.
- **`metadata`**: `(IPropertyMetadata | null)` The metadata schema defining the field rules.
- **`fieldKey`**: `(string)` The internal JSON path of the field relative to its parent payload.
- **`modelName`**: `(string)` The UI5 JSONModel name used for absolute binding paths.
- **`isEditable`**: `(boolean)` Indicates if the engine is enforcing an editable mode.
- **`useMessageManager`**: `(boolean)` Indicates if the plugin should delegate visual validation to the MessageManager.
- **`onChange`**: `((isValid: boolean, fieldKey?: string, errorMessage?: string, controlId?: string) => void)` Internal callback provided by GeneratorHost to signal validation/data changes upwards.

### Mandatory Abstract Methods
You **must** implement these methods in your custom plugin class:

- **`render(fieldMetadata, bindingPath, modelName, engineScopeId, onChange)`**: Called by the Engine. You must instantiate your UI5 control here, bind it to the model, and return it.
- **`getValue()`**: Extractor called by the `StateManager`. Must return the raw, unformatted value directly from your UI5 control (e.g. `this.control.getValue()`).
- **`applyState()`**: Called automatically when a Condition Rule mutates the schema (e.g. toggling read-only). You must handle updating the physical control.

### Provided Core Methods
The `BasePlugin` provides these methods natively. You can call them, or the Engine calls them automatically during the lifecycle:

- **`setEditable(editable: boolean)`**: Injects the global editable mode context into the plugin before rendering.
- **`setUseMessageManager(useMessageManager: boolean)`**: Injects the global MessageManager context.
- **`generateStableId(engineScopeId, bindingPath)`**: Generates a deterministic, globally unique ID for this control to prevent DOM collisions. Always use this when creating your UI5 control.
- **`validate()`**: Universal pipeline validation. Evaluates the current value against `maxLength`, `minimum`, `ui.validators`, etc., via the `GlobalPipeline`.
- **`setVisualValidationState(isValid: boolean, errorMessage?: string)`**: Natively manipulates the UI5 control's `valueState` using reflection if the control supports it.
- **`validateAndApplyVisualState()`**: Wraps standard validation and immediately applies the visual state. Ideal for 'change' events to instantly turn fields red on blur.
- **`onStateChange(newMetadata: IPropertyMetadata)`**: Executes when the condition engine pushes new schema metadata to this field. Natively calls your abstract `applyState()` method.
- **`applyCommonDirectives(control: Control, metadata: IPropertyMetadata, modelName: string)`**: Helper to apply common UI directives (like `readOnly`, `visibleOn`, `enabledOn`) directly to any control. Always call this inside your `render` method!
- **`destroy()`**: Natively destroys the instantiated UI5 control to prevent memory leaks. Override this if you manage secondary models or sub-controls.

---

## 3. Implementing Your Custom Plugin

Here is an exhaustive example of a custom plugin properly utilizing the `BasePlugin` lifecycle:

```typescript
public render(fieldMetadata: IPropertyMetadata, bindingPath: string, modelName: string = "meta", engineScopeId?: string, onChange?: (isValid: boolean, fieldKey?: string) => void): Control {
    this.onChange = onChange;
    this.metadata = fieldMetadata;
    this.fieldKey = bindingPath.replace("/", ""); // Internal path key

    // 1. Create the UI5 Control using generateStableId
    this.control = new Input({
        id: this.generateStableId(engineScopeId, bindingPath),
        value: `{${modelName}>${bindingPath}}`, 
        change: (oEvent: sap.ui.base.Event) => {
            // 2. Validate and notify the engine using inherited helpers
            const result = this.validateAndApplyVisualState();
            if (this.onChange) {
                this.onChange(result.isValid, this.fieldKey);
            }
        }
    });

    // 3. Apply standard visibility/readonly state bindings
    this.applyCommonDirectives(this.control, fieldMetadata, modelName);

    return this.control as Control;
}

protected getValue(): unknown {
    return this.control ? (this.control as Input).getValue() : null;
}

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

*(Note: Core plugins are statically registered by the framework. For your custom library extensions, you must programmatically map your plugin class into the registry before instantiating the MetaUI Engine).*

```typescript
// In your Component.js or Controller
import PluginRegistry from "@siliconst/metaui/core/PluginRegistry";

// Register your custom widget
// Arguments: Schema Type, Custom Widget Name, Require Path to your Plugin
PluginRegistry.getInstance().registerPluginPath(
    "string", 
    "myCustomWidget", 
    "my/custom/app/plugins/MyCustomPlugin"
);
```
