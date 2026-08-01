# MetaUI Framework - The Ultimate AI Instruction Manual

This document is the exhaustive ground truth for the MetaUI Engine (`nz.co.siliconst.ui5.metaui`). It provides comprehensive instructions on how to **use**, **configure**, **orchestrate**, and **extend** the framework.

> **CRITICAL RULE FOR AI AGENTS**: Do not hallucinate properties, widgets, or methods that are not explicitly documented here. This document is forensically mapped to the source code.

---

## 1. Using the Framework (Consumption)

MetaUI is an engine that dynamically generates SAPUI5 Fiori layouts based on JSON metadata. It manages its own internal data model to protect your parent application from invalid data until submission.

### A. Declarative Usage (XML Views)
You can embed it directly into any Fiori view via the `DynamicHost` wrapper.
```xml
<mvc:View xmlns:meta="nz.co.siliconst.ui5.metaui.controls.host">
    <meta:DynamicHost
        id="myHost"
        dataJson="{/rawJsonString}"         <!-- OR 'data' for JS objects -->
        schemaDefinition="{/jsonSchema}"    <!-- Optional -->
        liveUpdate="false"                  <!-- false: Transactional Mode (protects parent model). true: Continuous Two-Way Binding -->
        useMessageManager="true"            <!-- Routes errors to global MessagePopover -->
        submit=".onFormSubmit"              <!-- Fired when validation passes -->
        fieldChange=".onFieldChange"        <!-- Fired instantly on every keystroke -->
    />
</mvc:View>
```

### B. Programmatic Usage & Dialogs (JS/TS)
The Engine can be spawned dynamically in controllers to instantly generate a popup dialog, completely detached from the view's XML.
```javascript
import DynamicHost from "nz/co/siliconst/ui5/metaui/controls/DynamicHost";

const host = new DynamicHost({
    dataJson: '{"name": "Alice"}', 
    schemaDefinition: '{"type":"object","properties":{"name":{"type":"string"}}}'
});

host.attachSubmit(function(oEvent) {
    const payload = oEvent.getParameter("payload"); // Clean JSON object emitted by the form after successful validation
});

// Required for UI5 model inheritance
this.getView().addDependent(host); 
// Opens natively in a sap.m.Dialog with configurable buttons
host.openInDialog("Edit Profile", "Save", "Cancel", "600px", this.getView());
```

### C. Tri-Binding Engine & AI Inference
The framework accepts data through three paths:
1. **`dataJson`**: Raw stringified JSON (ideal for REST APIs).
2. **`data`**: Native JS Objects.
3. **`ODataDelegate`**: If bound to an OData V4 context (`host.bindElement("/Entity('1')")`), the engine intercepts the binding and syncs natively.

**Full Data Inference (No Schema Required):** If you bind `dataJson` or `data` but omit `schemaDefinition`, the internal `SchemaNormalizer` will automatically parse the data, infer types, and generate a layout instantly.

---

## 2. The Exhaustive Schema Dictionary

When generating or editing a MetaUI JSON Schema (`schemaDefinition`), you must **only** use the properties defined below. 

### A. Root Schema Level (`ISchema`)
```json
{
    "title": "My Form",
    "type": "object", // or "array"
    "layoutStrategy": "form", // Options: "form", "table", "wizard", "compact"
    "uiLayout": [], // (See Section 3)
    "uiPolicies": [], // (See Section 4)
    "additionalProperties": false,
    "definitions": {},
    "properties": {
        // Child fields go here...
    }
}
```

### B. Field Metadata (`IPropertyMetadata`)
Every field inside `properties` supports standard JSON-Schema validation and MetaUI-specific `ui` orchestration.

**Standard Validations:**
- `type`: "string", "number", "integer", "boolean", "object", "array", "date"
- `required`: boolean
- `maxLength`, `minLength`: number
- `minimum`, `maximum`: number
- `pattern`: string (regex)
- `valueHelp`: Array of `{"key": "id", "text": "Label"}` or `{ "url": "/api", "keyPath": "id", "textPath": "name" }`
- `enum`: string[] | number[]
- `readOnly`, `writeOnly`, `nullable`, `deprecated`: boolean
- `default`, `example`: any

**Array & Object Validations:**
- `maxItems`, `minItems`, `uniqueItems` (Arrays)
- `maxProperties`, `minProperties` (Objects)

**Polymorphism:**
- `oneOf`, `anyOf`, `allOf`, `not`: IPropertyMetadata[]
- `discriminator`: `{ "propertyName": "type", "mapping": {} }`

### C. The `ui` Directive (`IUIDirective`)
The `ui` block dictates exactly how the field renders visually.
```json
"fieldName": {
    "type": "string",
    "ui": {
        "label": "My Label",
        "widget": "textArea",     // The explicit UI control (See Section 2D)
        "readOnly": false,
        "isKey": false,
        "visibleOn": "/OtherField === true",
        "enabledOn": "/OtherField === true",
        "format": "email",        // Triggers native format validators
        "rows": 4,                // For TextAreas
        "fullWidth": true,        // Bypasses layout constraints
        "validators": [],         // Array of custom validator names
        "controlProps": {
            "placeholder": "Enter text..."
        }
    }
}
```
*Note: `controlProps` supports SAPUI5 Expression Bindings referencing `metaui>` (the internal form data model). Blocked core properties (`value`, `editable`, `valueState`) cannot be overridden via `controlProps`.*

### D. The Widget Registry Dictionary
You may specify these values in `ui.widget` to force the Engine to use a specific Fiori control (mapped via `PluginRegistry.ts`).

- **String Widgets**: `default` (Input), `time`, `datetime`, `select`, `textArea`, `codeEditor`, `link`, `password`, `email`, `fileUploader`, `messageStrip`, `camera`, `signature`, `scanner`, `voiceInput`, `richText`.
- **Number Widgets**: `default` (Input type=Number), `step`, `slider`, `rating`.
- **Boolean Widgets**: `default` (CheckBox), `switch`.
- **Array Widgets**: `default` (Table), `multiSelect`, `multiInput`.
- **Object Widgets**: `default` (Form), `dictionaryMap` (Key-Value), `reference` (Sub-Form), `location`.
- **Actions/Data Sources**: `urlButton`, `submitButton`, `odataSelect`, `remoteDropdown`, `liveSearch`, `remoteValueHelp`.

---

## 3. Layout Orchestration (`uiLayout`)

By default, the engine generates fields sequentially. To orchestrate complex Fiori layouts, define the `uiLayout` array at the schema root.

**Supported Element Types:** `Group`, `Control`, `HorizontalLayout`, `VerticalLayout`, `WizardStep`

```json
"uiLayout": [
    {
        "type": "Group",
        "label": "Personal Info",
        "elements": [
            { "type": "Control", "scope": "#/properties/FirstName" },
            { 
                "type": "HorizontalLayout", 
                "elements": [
                    { "type": "Control", "scope": "#/properties/Age" },
                    { "type": "Control", "scope": "#/properties/Gender" }
                ]
            }
        ]
    }
]
```

---

## 4. Policy-Based Rules Engine (PBRE)

The root-level `uiPolicies` array dynamically toggles field states natively without writing controller code.

- **Effects**: `Require`, `Hide`, `Disable`, `Invalidate`, `Show`, `Enable`, `Validate`, `Optional` (via `IPolicyEffectPlugin`).
- **Operators**: `NumericGreaterThan`, `NumericLessThan`, `StringEquals`, `DateLessThan`, `IsNull`, `IsNotNull` (via `IPolicyConditionPlugin`).

```json
"uiPolicies": [
    {
        "effect": "Hide",
        "targets": ["/SpouseName"],
        "condition": { "StringEquals": { "/MaritalStatus": "Single" } }
    },
    {
        "effect": "Invalidate",
        "targets": ["/Age"],
        "message": "Must be 18 or older",
        "condition": { "NumericLessThan": { "/Age": 18 } }
    }
]
```

---

## 5. Extending the Framework (Custom Plugins)

MetaUI strictly adheres to a **Plugin-First Architecture**. Global inline `<script>` tags or DOM hacks are strictly forbidden. To add a new UI control, you must write a plugin.

### A. Creating a Plugin
Create a class extending `BasePlugin`. You must implement `render()`, `getValue()`, and `applyState()`.

```typescript
import { BasePlugin } from "nz/co/siliconst/ui5/metaui/plugins/controls/BasePlugin";
import Input from "sap/m/Input";

export class MyCustomPlugin extends BasePlugin {
    public render(fieldMetadata, bindingPath, modelName, engineScopeId, onChange) {
        this.metadata = fieldMetadata;
        
        this.control = new Input({
            id: this.generateStableId(engineScopeId, bindingPath),
            value: `{${modelName}>${bindingPath}}`,
            change: () => {
                const result = this.validateAndApplyVisualState();
                if (onChange) onChange(result.isValid, bindingPath);
            }
        });
        
        // CRITICAL: Automatically applies visibleOn, enabledOn, controlProps, etc.
        this.applyCommonDirectives(this.control, fieldMetadata, modelName);
        return this.control;
    }

    protected getValue() { return (this.control as Input).getValue(); }
    protected applyState() { /* Handle ReadOnly / Editable toggling natively */ }
}
```

### B. Registering the Plugin
Map it in `PluginRegistry.ts` so the engine knows how to resolve the `ui.widget` hint:
```typescript
PluginRegistry.getInstance().registerPluginPath("string", "myCustomWidget", "my/path/MyCustomPlugin");
```

### C. Custom Validation Rules
Register programmatic validation rules into the `GlobalPipeline`:
```typescript
import { GlobalPipeline } from "nz/co/siliconst/ui5/metaui/core/PipelineManager";

GlobalPipeline.validators.register("customAsyncRule", {
    validate: function(value, args) { return { isValid: value === args.expected }; }
});
```
Usage in schema:
```json
"ui": {
    "validators": [
        { "name": "customAsyncRule", "args": { "expected": "Hello" } }
    ]
}
```

### D. Custom Policy Plugins (Conditions & Effects)
The Policy-Based Rules Engine (PBRE) evaluates schema rules dynamically. If a standard condition operator doesn't meet requirements, you can write an `IPolicyConditionPlugin`.

```typescript
import { IPolicyConditionPlugin } from "nz/co/siliconst/ui5/metaui/interfaces/IPolicyPlugin";
import { PluginRegistry } from "nz/co/siliconst/ui5/metaui/core/PluginRegistry";

export class CustomConditionPlugin implements IPolicyConditionPlugin {
    public canHandle(conditionKey: string): boolean { return conditionKey === "MyCustomCheck"; }
    public evaluate(conditionPayload: unknown, data: unknown, resolvePointer: Function): boolean {
        // Logic goes here
        return true; 
    }
}

// Register it
PluginRegistry.getInstance().registerPolicyConditionPath(
    "MyCustomCheck", 
    "my/path/CustomConditionPlugin"
);
```

---