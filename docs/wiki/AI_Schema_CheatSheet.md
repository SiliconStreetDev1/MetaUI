# MetaUI Framework - The Ultimate AI Instruction Manual

This document is the exhaustive ground truth for the MetaUI Engine (`nz.co.siliconst.ui5.metaui`). It provides comprehensive instructions on how to **use**, **configure**, **orchestrate**, and **extend** the framework.

> **CRITICAL RULE FOR AI AGENTS**: Do not hallucinate properties, widgets, or methods that are not explicitly documented here. This document is forensically mapped to the source code.

---

## 1. Using the Framework (Consumption)

MetaUI is an engine that dynamically generates SAPUI5 Fiori layouts based on JSON metadata. It manages its own internal data model to protect your parent application from invalid data until submission.

### A. Declarative Usage (XML Views)
You can embed it directly into any Fiori view via the `DynamicHost` wrapper.
```xml
<mvc:View xmlns:mvc="sap.ui.core.mvc" xmlns:meta="nz.co.siliconst.ui5.metaui.controls">
    <meta:DynamicHost
        id="myHost"
        width="100%"                        <!-- sap.ui.core.CSSSize (default "100%") -->
        height="auto"                       <!-- sap.ui.core.CSSSize (default "auto") -->
        dataJson="{/rawJsonString}"         <!-- OR 'data' for JS objects -->
        schemaDefinition="{/jsonSchema}"    <!-- Optional -->
        liveUpdate="false"                  <!-- false: Transactional Mode (protects parent model). true: Continuous Two-Way Binding -->
        useMessageManager="true"            <!-- Routes errors to global MessagePopover -->
        submit=".onFormSubmit"              <!-- Fired when validation passes -->
        fieldChange=".onFieldChange"        <!-- Fired when a field's change event commits -->
    />
</mvc:View>
```

**Host Sizing & Containment**: `DynamicHost` is containment-safe by default (`width="100%"`, `height="auto"`, `min-width: 0`, `max-width: 100%`, `box-sizing: border-box`) and will never push a parent flex, grid, or table cell wider than the width offered to it. When embedding `DynamicHost` inside a table column (such as `sap.m.Table` or Fiori Elements `<macros:Table>`), set an explicit sensible column width on the column definition so the responsive form has room to lay out cleanly rather than stacking into a narrow strip.

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

### C. Tri-Binding Engine & Data Inference
The framework accepts data through three paths:
1. **`dataJson`**: Raw stringified JSON (ideal for REST APIs).
2. **`data`**: Native JS Objects.
3. **`ODataDelegate`**: If bound to an OData V4 context (`host.bindElement("/Entity('1')")`), the engine intercepts the binding and syncs natively.

**Full Data Inference (No Schema Required):** If you bind `dataJson` or `data` but omit `schemaDefinition`, the internal `SchemaNormalizer` will automatically parse the data, infer types, and generate a layout instantly.

---

## 2. The Exhaustive Schema Dictionary

When generating or editing a MetaUI JSON Schema (`schemaDefinition`), you must **only** use the properties defined below. 

### A. Root Schema Level (`ISchema`)
```jsonc
{
    "title": "My Form",
    "type": "object", // or "array"
    "layoutStrategy": "form", // Options: "form", "table", "wizard", "compact"
    "ui": {}, // Optional root IUIDirective
    "uiLayout": [], // (See Section 3)
    "uiPolicies": [], // (See Section 4)
    "required": [], // Array of required property keys
    "readOnly": false,
    "maxItems": 100,
    "minItems": 0,
    "uniqueItems": false,
    "maxProperties": 50,
    "minProperties": 0,
    "oneOf": [],
    "anyOf": [],
    "allOf": [],
    "additionalProperties": false, // boolean | IPropertyMetadata
    "definitions": {},
    "items": {}, // Root array item IPropertyMetadata when type === "array"
    "properties": {
        // Child fields go here...
    }
}
```

### B. Field Metadata (`IPropertyMetadata`)
Every field inside `properties` supports standard JSON-Schema validation and MetaUI-specific `ui` orchestration.

**Standard Validations & Metadata:**
- `type`: `"string"`, `"number"`, `"integer"`, `"boolean"`, `"object"`, `"array"`, `"date"`
- `$ref`: string (e.g., `"#/definitions/Address"`, `"#/components/schemas/Address"`)
- `title`, `description`: string (fallback label and control tooltip)
- `required`: boolean | string[]
- `format`: string (`"email"`, `"uri"`, `"url"`, `"iban"`, `"date"`, `"date-time"`, `"time"`, `"password"`)
- `const`: unknown
- `maxLength`, `minLength`: number
- `minimum`, `maximum`, `exclusiveMinimum`, `exclusiveMaximum`: number | boolean
- `multipleOf`: number
- `pattern`: string (regex). **Hard limits:** max 512 characters, and a repetition shape that is provably ambiguous — a quantifier over a group built only from variable-length elements (`(a+)+`, `(a?)*`, `(\w+\s?)*`) or over an alternation whose branches can start with the same token (`(a|a)+`, `(a|)+`) — is refused as a denial-of-service risk and reported as a schema configuration error on the field. Anchor repeated groups with at least one fixed atom (`([a-z]+\.)+`, `(\d{4})+`) and they are accepted.
- `valueHelp`: Array of `{"key": "id", "text": "Label"}` or `{ "url": "/api", "keyPath": "id", "textPath": "name" }`
- `enum`: (string | number | boolean | null)[]
- `readOnly`, `writeOnly`, `nullable`: boolean (`writeOnly` properties are stripped from the inbound payload by `SchemaNormalizer.stripWriteOnlyValues` before seeding `StateManager`)
- `default`, `example`: unknown (scalar `example` values serve as the control placeholder fallback when `ui.placeholder` is omitted)

**Array & Object Validations:**
- `maxItems`, `minItems`, `uniqueItems` (Arrays)
- `maxProperties`, `minProperties`, `additionalProperties` (Objects)
- `properties`, `items`, `uiLayout` (Nested recursion)

**Polymorphism:**
- `oneOf`, `anyOf`, `allOf`, `not`: `IPropertyMetadata[]` / `IPropertyMetadata`
- `discriminator`: `{ "propertyName": "type", "mapping": {} }`

### C. The `ui` Directive (`IUIDirective`)
The `ui` block dictates exactly how the field renders visually.
```jsonc
{
    "fieldName": {
        "type": "string",
        "ui": {
        "label": "My Label",
        "placeholder": "Enter text...",
        "widget": "textArea",     // The explicit UI control (See Section 2D)
        "readOnly": false,
        "visible": true,
        "enabled": true,
        "isKey": false,
        "visibleOn": "$root.OtherField === true",
        "enabledOn": "$root.OtherField === true",
        "format": "email",        // Triggers native format validators
        "valueState": "None",     // Initial ValueState ("None", "Error", "Warning", "Success", "Information")
        "rows": 4,                // For TextAreas and code editors
        "expandable": true,       // Adds a full-screen expand button to textArea / codeEditor
        "fullWidth": true,        // Bypasses layout constraints
        "formatter": "textCase",  // Single formatter name
        "formatters": ["textCase"], // Chained formatter names
        "args": "upper",          // Formatter arguments
        "validators": [],         // Array of validator names or { name, args }
        "valueHelp": [],          // Inline [{ key, text }] options
        "options": {},            // Extended widget options (values, min, max, step, etc.)
        "dataSource": {           // Remote REST/OData dataSource config
            "url": "/api/items",
            "keyField": "id",
            "textField": "name",
            "dataPath": "results",
            "modelName": ""
        },
        "dialogButtonText": "Edit Details",
        "layoutBudget": 50,
        "renderMode": "inline",   // "inline" | "dialog"
        "labelSpan": 4,           // Root-level SimpleForm label span override (1-12 for label-beside-field, or 0 to hide labels)
        "controlProps": {
            "placeholder": "Enter text..."
        }
        }
    }
}
```
**`controlProps` rules — a generated schema that breaks any of these has the entry silently dropped at render time (with a logged warning), so do not emit them:**

1. The property must be **declared by the generated UI5 control** (checked against the control's own metadata). Invented property names are refused.
2. Its declared UI5 type must resolve to a **scalar primitive** — `string`, `boolean`, `int` or `float`. UI5 enums and `sap.ui.core.CSSSize` qualify; anything typed `object`, `function`, `any`, or an array of those, does not.
3. **MetaUI-owned state properties are refused:** `value`, `selectedKey`, `selectedKeys`, `selected`, `dateValue`, `tokens`, `editable`, `enabled`, `visible`, `valueState`, `valueStateText`. Use `visibleOn`, `enabledOn`, `readOnly` and the validation pipeline instead.
4. **Raw-markup properties are refused:** `htmlText`, `html`, `innerHTML`, `content`. There is no `controlProps` route for injecting HTML; use `ui.widget: "richText"`, whose bound value is rendered through `sap.m.FormattedText`.
5. A `sap.ui.core.URI` property (`href`, `src`, `icon`, …) is accepted but protocol-checked. Only `http:`, `https:`, `mailto:`, `tel:`, relative paths (`/`, `./`, `../`, `#`), `data:image/*;base64,`, `sap-icon://…` and `""` survive; anything else becomes `""`. This applies to bound values too.

*`controlProps` also supports SAPUI5 Expression Bindings referencing `meta>` (the internal form data model) or `metaui>` (rewritten to the host's `modelName`). The binding grammar is the same one `visibleOn` / `enabledOn` use: model paths, `{= … }` expressions, `$root.` / `$row.` references and OData key predicates are accepted; UI5 complex-binding object syntax (`{path:'…', formatter:'…'}`) is refused. On the root schema's `ui` block, `labelSpan` (`0`–`12`) or `controlProps` (`labelSpanS`, `labelSpanM`, `labelSpanL`, `labelSpanXL`, `emptySpan*`, `columns*`) configures `SimpleForm`'s `ResponsiveGridLayout` spans (default `labelSpanS: 12`, `M/L/XL: 4`) — these root-level keys are read directly as layout numbers and do not go through the per-field property gate above.*

**`ui.dataSource.url` rules:** the URL is resolved against the document origin and must end up on `http:` or `https:`. Protocol-relative (`//host/...`) and backslash-prefixed values are refused outright. A cross-origin endpoint is permitted by default and logged once per origin; an application can tighten this to same-origin or an explicit allowlist with `UrlValidator.setDataSourceOriginPolicy()`, in which case a refused URL means the control simply renders with no remote items (and a logged warning). The same policy governs a remote `schemaDefinition` URL.

### D. The Widget Registry Dictionary
You may specify these values in `ui.widget` to force the Engine to use a specific Fiori control (mapped via `DefaultPluginBootstrapper.ts` and `MetaUIConstants.ts`):

- **String Widgets**: *(omitted)* / `default` (`sap.m.Input`), `date`, `datePicker`, `time`, `datetime`, `select`, `textArea`, `codeEditor`, `link`, `password`, `email`, `fileUploader`, `messageStrip`, `camera`, `signature`, `voiceInput`, `richText`, `urlButton`, `submitButton`, `clearButton`, `odataSelect`, `remoteDropdown`, `remoteSelect`, `combobox`, `liveSearch`, `remoteValueHelp`, `valueHelp`.
- **Number & Integer Widgets**: *(omitted)* (`sap.m.Input` `type="Number"`), `step`, `slider`, `rating`, `select`.
- **Boolean Widgets**: *(omitted)* (`sap.m.CheckBox`), `switch`.
- **Date Widgets**: *(omitted)* (`sap.m.DatePicker`), `date`, `datePicker`.
- **Array Widgets**: *(omitted)* (Array Dialog / Inline `TableLayout`), `multiSelect`, `multiInput`.
- **Object Widgets**: *(omitted)* (Object Dialog / Inline `FormLayout`), `dictionaryMap` (Key-Value Map), `reference` (`$ref` Sub-Form), `polymorphic` (`oneOf`/`anyOf` Selector), `location` (Geolocation Picker).

---

## 3. Layout Orchestration (`uiLayout`)

By default, the engine generates fields sequentially. To orchestrate complex Fiori layouts, define the `uiLayout` array at the schema root.

**Supported Element Types:** `Group`, `Control`, `HorizontalLayout`, `VerticalLayout`, `WizardStep`

```json
{
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
}
```

---

## 4. Policy-Based Rules Engine (PBRE)

The root-level `uiPolicies` array dynamically toggles field states natively without writing controller code.

- **Effects**: `Require`, `Hide`, `Disable`, `Invalidate`, `Show`, `Enable`, `Validate`, `Optional` (via `IPolicyEffectPlugin`).
- **Operators**: `NumericGreaterThan`, `NumericLessThan`, `StringEquals`, `DateLessThan`, `IsNull`, `IsNotNull` (via `IPolicyConditionPlugin`).

```json
{
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
}
```

---

## 5. Extending the Framework (Custom Plugins)

MetaUI strictly adheres to a **Plugin-First Architecture**. Global inline `<script>` tags or DOM hacks are strictly forbidden. To add a new UI control, you must write a plugin.

### A. Creating a Plugin
Create a class extending `BasePlugin`. You must implement `render()`, `getValue()`, and `applyState()`.

```typescript
import { BasePlugin } from "nz/co/siliconst/ui5/metaui/plugins/controls/BasePlugin";
import { IPropertyMetadata } from "nz/co/siliconst/ui5/metaui/interfaces/ISchema";
import Control from "sap/ui/core/Control";
import Input from "sap/m/Input";

export class MyCustomPlugin extends BasePlugin {
    public render(
        fieldMetadata: IPropertyMetadata,
        bindingPath: string,
        modelName: string = "meta",
        engineScopeId?: string,
        onChange?: (isValid: boolean, fieldKey?: string, errorMessage?: string, controlId?: string) => void
    ): Control {
        this.initialize(fieldMetadata, bindingPath, modelName, onChange);
        
        this.control = new Input({
            id: this.generateStableId(engineScopeId, bindingPath),
            value: this.generateBindingInfo(bindingPath, modelName),
            change: () => {
                this.notifyChange();
            }
        });
        
        // CRITICAL: Automatically applies visibleOn, enabledOn, controlProps, etc.
        this.applyCommonDirectives(this.control, fieldMetadata, modelName);
        return this.control;
    }

    protected getValue(): unknown { return (this.control as Input).getValue(); }
    protected applyState(): void { /* Handle ReadOnly / Editable toggling natively */ }
}
```

### B. Registering the Plugin
Map it in `PluginRegistry.ts` so the engine knows how to resolve the `ui.widget` hint:
```typescript
import { PluginRegistry } from "nz/co/siliconst/ui5/metaui/core/PluginRegistry";

PluginRegistry.getInstance().registerPluginPath("string", "myCustomWidget", "my/custom/app/plugins/MyCustomPlugin");
```

### C. Built-in & Custom Validation / Formatting Rules
`PipelineManager` registers <!-- DOC_COUNT:validators -->14 built-in validators (`required`, `minLength`, `maxLength`, `pattern`, `range`, `multipleOf`, `arrayItems`, `email`, `url`, `iban`, `enum`, `const`, `integer`, `objectProperties`), <!-- DOC_COUNT:formatters -->4 built-in formatters (`date`, `phone`, `textCase`, `currency`), and <!-- DOC_COUNT:parsers -->3 built-in presentational parsers (`date`, `phone`, `currency`).

- **Presentational vs Transforming Formatters**:
  - `phone`, `currency`, and `date` implement `IParser.parse()` (`PipelineManager.parsers`) and are **presentational** (reversible display masks). On user edits, `BasePlugin.notifyChange()` runs `GlobalPipeline.runParsers()` (in reverse order when `ui.formatters` is an array) so the model stores the raw unformatted value and validators evaluate the raw value.
  - `textCase` (`args`: `"upper"`, `"lower"`, `"title"`) does not implement `parse()` and is **transforming** (lossy normalization). Its formatted output is written directly into the data model and validated.
- **`phone` Formatter Accepted Input Shapes & Validation**:
  - `PhoneFormatterPlugin` (`ui.formatter: "phone"` or `ui.formatters: ["phone"]`) formats and parses:
    1. 10-digit US numbers: `"5551234567"` <-> `"(555) 123-4567"`
    2. 11-digit US numbers with leading `1` or `+1`: `"+15551234567"` / `"15551234567"` -> `"+1 (555) 123-4567"` (parsed back to `"+15551234567"` when formatted with leading `+`, or `"15551234567"` when entered as 11 digits without `+`)
    3. International numbers with 2-digit country code (`2` CC digits + `7–10` subscriber digits): `"+64211234567"` <-> `"+64 211234567"`
    4. International numbers with 3-digit country code (`3` CC digits + `6–10` subscriber digits): `"+3531234567"` <-> `"+353 1234567"`
    5. Any other string is returned unchanged by both `format()` and `parse()`.
  - **No Built-in Phone Validator**: `ui.format: "phone"` (and `ui.formatter: "phone"`) performs **no validation**. Only `"email"`, `"url"` / `"uri"`, and `"iban"` map to built-in format validators. Validate phone numbers with a schema `pattern` (e.g., `"pattern": "^\\+?\\d{10,15}$"` or `"pattern": "^\\d{10}$"`), which runs against the parsed raw value in the model.

You can also register custom synchronous validation rules into `GlobalPipeline`:
```typescript
import { GlobalPipeline } from "nz/co/siliconst/ui5/metaui/core/PipelineManager";
import { IValidationResult } from "nz/co/siliconst/ui5/metaui/interfaces/IPipeline";

GlobalPipeline.validators.register("customMatchRule", {
    validate: function(value: unknown, args?: unknown): IValidationResult {
        const expected = (args as { expected?: unknown } | undefined)?.expected;
        return { isValid: value === expected };
    }
});
```
Usage in schema:
```json
{
    "ui": {
        "validators": [
            { "name": "customMatchRule", "args": { "expected": "Hello" } }
        ]
    }
}
```

### D. Custom Policy Plugins (Conditions & Effects)
The Policy-Based Rules Engine (PBRE) evaluates schema rules dynamically. If a standard condition operator doesn't meet requirements, you can write an `IPolicyConditionPlugin`.

```typescript
import { IPolicyConditionPlugin } from "nz/co/siliconst/ui5/metaui/interfaces/IPolicyPlugin";
import { PluginRegistry } from "nz/co/siliconst/ui5/metaui/core/PluginRegistry";

export class CustomConditionPlugin implements IPolicyConditionPlugin {
    public evaluate(conditionPayload: unknown, data: unknown, resolvePointer: (d: unknown, p: string) => unknown): boolean {
        if (!conditionPayload || typeof conditionPayload !== "object" || Array.isArray(conditionPayload)) {
            return false;
        }
        void data;
        void resolvePointer;
        return true;
    }
}

// Register it
PluginRegistry.getInstance().registerPolicyConditionPath(
    "MyCustomCheck", 
    "my/custom/app/plugins/policies/conditions/CustomConditionPlugin"
);
```

---

## 6. Automated Testing & Double-Entry Verification

Whenever any TypeScript file in `src/` or scenario in `test/` is modified, execute the three-step verification loop:

```bash
npx tsc --noEmit -p .
npm run build
npm test
```

- **The Double-Entry Rule (`test/webapp/test/TestOracle.js`)**: Any plugin added to `DefaultPluginBootstrapper.ts` or validator/formatter added to `PipelineManager.ts` **must** also be added to `test/webapp/test/TestOracle.js`.
- **Detailed Testing Blueprint**: See [`docs/wiki/09_Testing_Routines_and_Automation.md`](09_Testing_Routines_and_Automation.md) for the complete testing architecture (`TestOracle.js`, QUnit physical DOM unit tests, QUnit integration/E2E matrix tests, Fiori Sandbox route verification, and OpenAPI stress tests).
