# Creating Custom Plugins

MetaUI's architecture is based entirely on a decoupled **Plugin-First** philosophy. If you need a specialized UI control (e.g., a barcode scanner, an address lookup, or a complex custom composite control) that is not included in the standard 52 `(type, widget)` plugin mappings, you can easily create and register your own.

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
You can access these properties directly via `this.` inside your custom plugin (inherited from `PluginStateBase` and `BasePlugin`):
- **`control`**: `(Control | undefined)` The outer instantiated UI5 control for this plugin.
- **`mainControl`**: `(Control | undefined)` Optional inner interactive UI5 control when `control` is a layout wrapper (e.g. `VBox` / `HBox`).
- **`associatedLabel`**: `(Label | undefined)` The companion `sap.m.Label` linked via `setAssociatedLabel()`.
- **`metadata`**: `(IPropertyMetadata | undefined)` The metadata schema defining the field rules.
- **`bindingPath`**: `(string | undefined)` The JSON binding path passed to `render()` (e.g. `"/CustomerName"`).
- **`fieldKey`**: `(string | undefined)` The normalized property key without a leading slash (e.g. `"CustomerName"`).
- **`modelName`**: `(string)` The UI5 JSONModel name used for absolute binding paths (default `"meta"`).
- **`isEditable`**: `(boolean)` Indicates if the engine is enforcing an editable mode (`true`) or display mode (`false`).
- **`onChange`**: `((isValid: boolean, fieldKey?: string, errorMessage?: string, controlId?: string) => void)` Internal callback provided by `Engine` / `GeneratorHost` to signal validation and data changes upwards.
- **`engineContext`**: `(IPluginEngineContext | undefined)` Context accessor for the owning `Engine` and `StateManager` model.

### Static Architectural Contracts
You can optionally define static properties to participate in the dynamic layout pipeline:
- **`public static layoutScore: number`**: (Default `1`). Represents the layout footprint complexity of the plugin. Used by the `LayoutScorer` to determine if a deeply nested schema should be rendered inline or pushed into a dialog.
- **`public static isNativelyWide: boolean`**: (Default `false`). If true, instructs the declarative FormLayout to allocate 100% column width (`XL12 L12 M12 S12`) instead of stacking it next to a label. Ideal for complex editors like `CodeEditor` or `TextArea`.

### Mandatory Abstract Methods
You **must** implement these methods in your custom plugin class:

- **`render(fieldMetadata, bindingPath, modelName, engineScopeId, onChange)`**: Called by the Engine. You must instantiate your UI5 control here, bind it to the model, and return it.
- **`getValue()`**: Extractor called by the `StateManager`. Must return the raw, unformatted value directly from your UI5 control (e.g. `this.control.getValue()`).
- **`applyState()`**: Called automatically when a Condition Rule mutates the schema (e.g. toggling read-only). You must handle updating the physical control.

### Provided Core Methods (`BasePlugin` & `PluginStateBase`)
The `BasePlugin` (which extends `PluginStateBase`) provides these methods natively. You can call them, or the Engine calls them automatically during the lifecycle:

- **`initialize(metadata, bindingPath, modelName, onChange)`**: Initializes `metadata`, `bindingPath`, `fieldKey`, `modelName`, and `onChange` at the start of `render()`.
- **`setEditable(editable: boolean)`**: Injects the global editable mode context into the plugin before rendering.
- **`isControlEditable()`**: Centralized helper returning `true` only when `this.isEditable`, `!this.metadata?.readOnly`, `!this.metadata?.ui?.readOnly`, and `this.metadata?.ui?.enabled !== false`.
- **`isVisible()`**: Returns `true` if the outer UI5 control is currently visible (`getVisible() !== false`), allowing hidden controls to suppress validation errors.
- **`setAssociatedLabel(label: Label)`**: Links a companion `sap.m.Label` (`labelFor`) so `visible` and `required` state mutations stay synchronized.
- **`generateStableId(engineScopeId, bindingPath)`**: Generates a deterministic, globally unique ID for this control to prevent DOM collisions. Always use this when creating your UI5 control.
- **`validate()`**: Universal pipeline validation. Evaluates the current value against `maxLength`, `minimum`, `ui.validators`, etc., via `PipelineManager`.
- **`notifyChange(controlId?: string)`**: Runs validation (supporting both standalone controls and cloned table row templates), applies visual validation feedback, and invokes the Engine's `onChange` callback.
- **`setVisualValidationState(isValid: boolean, errorMessage?: string)`**: Applies `ValueState.Error` / `ValueState.None` (or `ButtonType.Reject` on modal trigger buttons) via `ControlDirectiveUtil`.
- **`setState(property, value, message)`**: Dynamically updates `"visible"`, `"editable"`, `"required"`, or `"valid"` state at runtime and invokes `applyState()`.
- **`onStateChange(newMetadata: IPropertyMetadata)`**: Executes when the condition engine pushes new schema metadata to this field. Natively calls your abstract `applyState()` method.
- **`applyCommonDirectives(control: Control, metadata: IPropertyMetadata, modelName: string)`**: Helper to apply common UI directives (`readOnly`, `visible`, `visibleOn`, `enabled`, `enabledOn`, `valueState`, `controlProps`) directly to any control. Always call this inside your `render` method!
- **`destroy()`**: Natively destroys the instantiated UI5 control to prevent memory leaks. Override this if you manage secondary models or sub-controls.

---

## 3. Implementing Your Custom Plugin

Here is an exhaustive example of a custom plugin properly utilizing the `BasePlugin` lifecycle:

```typescript
import Event from "sap/ui/base/Event";

public render(
    fieldMetadata: IPropertyMetadata,
    bindingPath: string,
    modelName: string = "meta",
    engineScopeId?: string,
    onChange?: (isValid: boolean, fieldKey?: string) => void
): Control {
    this.initialize(fieldMetadata, bindingPath, modelName, onChange);

    // 1. Create the UI5 Control using generateStableId
    this.control = new Input({
        id: this.generateStableId(engineScopeId, bindingPath),
        value: `{${modelName}>${bindingPath}}`,
        change: (_oEvent: Event) => {
            // 2. Validate and notify the engine using inherited helpers
            this.notifyChange();
        }
    });

    // 3. Apply standard visibility/readonly state bindings
    this.applyCommonDirectives(this.control, fieldMetadata, modelName);

    return this.control;
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
import { PluginRegistry } from "nz/co/siliconst/ui5/metaui/core/PluginRegistry";

// Register your custom widget
// Arguments: Schema Type, Custom Widget Name, Require Path to your Plugin
PluginRegistry.getInstance().registerPluginPath(
    "string", 
    "myCustomWidget", 
    "my/custom/app/plugins/MyCustomPlugin"
);
```

### Creating and Registering an Action Plugin

Action plugins (like custom interactive buttons or triggers) are registered exactly the same way using `registerPluginPath`. However, unlike data-entry plugins, Action Plugins typically render a `sap.m.Button` and do not extract data (`getValue` returns null).

#### 1. The Action Plugin Class
Here is an example of an Action Plugin that renders a button to trigger a custom event:

```typescript
import { BasePlugin } from "nz/co/siliconst/ui5/metaui/plugins/controls/BasePlugin";
import { IPropertyMetadata } from "nz/co/siliconst/ui5/metaui/interfaces/ISchema";
import Button from "sap/m/Button";
import Control from "sap/ui/core/Control";

export class MyActionPlugin extends BasePlugin {
    public render(
        fieldMetadata: IPropertyMetadata,
        bindingPath: string,
        modelName: string = "meta",
        engineScopeId?: string,
        onChange?: (isValid: boolean, fieldKey?: string) => void
    ): Control {
        this.initialize(fieldMetadata, bindingPath, modelName, onChange);

        this.control = new Button({
            id: this.generateStableId(engineScopeId, bindingPath),
            text: fieldMetadata.ui?.label || "Execute Action",
            icon: "sap-icon://action",
            press: () => {
                // Read custom arguments passed from the schema
                const myArg = fieldMetadata.ui?.args || "Default";
                alert(`Action Triggered with arg: ${myArg}`);
            }
        });

        return this.control as Control;
    }

    // Actions don't extract data into the JSON payload
    protected getValue(): unknown {
        return null;
    }

    protected applyState(): void {
        if (this.control && this.metadata) {
            (this.control as Button).setEnabled(!this.metadata.ui?.readOnly);
        }
    }
}
```

#### 2. Registering the Action Plugin
Register the plugin globally before the MetaUI Engine boots:

```typescript
// Register your custom action plugin
PluginRegistry.getInstance().registerPluginPath(
    "string", 
    "myCustomAction", 
    "my/custom/app/plugins/MyActionPlugin"
);
```

#### 3. Using it in the Schema
You can then trigger it in your schema simply by setting `"widget": "myCustomAction"`:

```json
"triggerMyAction": {
    "type": "string",
    "ui": {
        "widget": "myCustomAction",
        "label": "Click Me",
        "args": "My Custom Parameter"
    }
}
```

---

## 5. Custom Validators and PipelineManager

MetaUI natively supports several synchronous data validators (e.g., `maxLength`, `email`, `required`) out of the box. These are managed by the `PipelineManager` via its `validators` registry.

When a field runs its `validate()` method, `BasePlugin` resolves any presentational formatter via `runParsers()` and delegates the raw value to `PipelineManager.getInstance().runValidators(valueToValidate, this.metadata, dynamicRequired)` (which calls `assembleAndExecute()` and `executeValidation()`).

### Registering a Custom Validator

To inject custom validation logic (e.g., a complex business rule), you must register a custom programmatic validator in your app before rendering the MetaUI Form:

```typescript
// In your app's Component.js or Controller
import { GlobalPipeline } from "nz/co/siliconst/ui5/metaui/core/PipelineManager";

GlobalPipeline.validators.register("customAsyncRule", {
    validate: function(parsedValue, args) {
        // Evaluate the value and return an IValidationResult
        if (parsedValue === "invalid") {
            return { isValid: false, errorMessage: "This value is strictly forbidden." };
        }
        return { isValid: true };
    }
});
```

### Using it in your Schema

Once registered, you can invoke the custom validator anywhere in your schema using the `ui.validators` array:

```json
"specialField": {
    "type": "string",
    "ui": {
        "validators": [
            "required",
            { 
                "name": "customAsyncRule", 
                "args": { "limit": 10 } 
            }
        ]
    }
}
```
