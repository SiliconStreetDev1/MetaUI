# Schemas, Inference & OpenAPI

The MetaUI Engine is driven entirely by declarative JSON structures. You have three primary ways to define your UI layout:
1. **Native MetaUI Schemas**: The proprietary, fully-featured base schema for absolute control.
2. **Swagger / OpenAPI**: Standard external API definitions dynamically converted at runtime.
3. **Data Inference**: Zero-schema generation based purely on the raw inbound data structure.

---

# Part 1: Native MetaUI Schemas

## Defining a JSON Schema

A MetaUI JSON Schema defines the hierarchical layout of your form, the types of controls to generate, and the validation rules for each field. The root payload evaluates against the `ISchema` contract.

### Root `ISchema` Properties

- **`type`**: `("object" | "array")` The overarching type of the root node (implicitly hints layout).
- **`title`**: `(string)` The title of the form/schema.
- **`layoutStrategy`**: `(string)` Defines the macro-layout behavior of the container (`"form"`, `"table"`, `"wizard"`, or `"compact"`).
- **`properties`**: `(Record<string, IPropertyMetadata>)` The dictionary of nested fields for an object.
- **`items`**: `(IPropertyMetadata)` The schema defining the elements within an array.
- **`uiLayout`**: `(ILayoutElement[])` Explicitly overrides the visual hierarchy and grouping.
- **`additionalProperties`**: `(boolean)` If true, MetaUI merges explicit properties with an inferred schema generated from bound data.

### Field `IPropertyMetadata` Properties (Exhaustive)

Every field within `properties` or `items` supports the following absolute schema properties:

#### Type & UI
- **`type`**: `("string" | "number" | "integer" | "boolean" | "date" | "array" | "object")` The primitive data type.
- **`ui`**: `(IUIDirective)` MetaUI proprietary block for Fiori visual orchestration.

#### Core JSON-Schema Validations
- **`required`**: `(boolean)` Natively maps to `sap.m.InputBase` required state.
- **`maxLength`**: `(number)` String max length constraint.
- **`minLength`**: `(number)` String min length constraint.
- **`minimum`**: `(number)` Numeric minimum boundary.
- **`maximum`**: `(number)` Numeric maximum boundary.
- **`pattern`**: `(string)` Regular expression validation.

#### Numeric Specifics
- **`precision`**: `(number)` Total length of a numeric field (e.g. `precision: 10, scale: 2`).
- **`scale`**: `(number)` Number of allowed decimal places. *(Note: Passing `scale` forces the standard `number` input to preserve exactly that many trailing zeroes. If omitted, the number input accepts up to 9 decimals dynamically without padding).*
- **`multipleOf`**: `(number)` Step increment (mapped to StepInput natively).

#### Value Selection
- **`enum`**: `(string[] | number[])` Array of allowed primitive values.
- **`valueHelp`**: `(IValueHelp[] | IRemoteValueHelpConfig)` Array of static Key/Text pairs OR remote OData configuration object.

#### OpenAPI Advanced Constraints
- **`default`**: `(any)` The default value assigned if the payload is empty.
- **`nullable`**: `(boolean)` Indicates if the property allows null values.
- **`writeOnly`**: `(boolean)` Indicates the property is meant only for submission and should not be displayed in read-only layouts.
- **`example`**: `(any)` A sample value for documentation/mocking.
- **`deprecated`**: `(boolean)` Flags the property as deprecated.
- **`exclusiveMinimum`**: `(boolean | number)` Strict boundary constraint (less than but not equal).
- **`exclusiveMaximum`**: `(boolean | number)` Strict boundary constraint (greater than but not equal).

#### Recursion & Layout
- **`properties`**: `(Record<string, IPropertyMetadata>)` Nested recursion for objects.
- **`items`**: `(IPropertyMetadata)` Nested recursion for arrays.
- **`uiLayout`**: `(ILayoutElement[])` Nested visual layout overrides for complex child objects.
- **`additionalProperties`**: `(boolean)` Nested inference flags.

---

### The `ui` Directive Block (`IUIDirective`)

The proprietary `ui` block separates logic from presentation. It supports the following absolute properties:

- **`label`**: `(string)` Overrides the schema `title` with a specific UI label.
- **`isKey`**: `(boolean)` Marks a field as a primary key (useful for OData payload mapping).
- **`readOnly`**: `(boolean)` Structurally locks the field (maps to `setEditable(false)`).
- **`widget`**: `(string)` Forces a specific Plugin implementation (e.g., `"slider"` instead of the default numeric input).
- **`visibleOn`**: `(string)` Expression string evaluated via `ExpressionBuilder` (e.g. `"{/Active} === true"` or direct JS syntax). Controls `setVisible()`.
- **`enabledOn`**: `(string)` Expression string for enabling/disabling a control interactively.
- **`format`**: `(string)` Specialized data formats natively mapped to validation rules (`"email"`, `"url"`, `"iban"`).
- **`rows`**: `(number)` Row count specific to the `textArea` widget.
- **`fullWidth`**: `(boolean)` Forces a control to break to a new line and span 12 grid columns horizontally. *(Note: `codeEditor`, `textArea`, and `richText` automatically default to `fullWidth: true`. Pass `false` to explicitly disable).*
- **`validators`**: `((string | IValidationRule)[])` Array of custom validation pipelines (e.g. `["customRule", { name: "complexRule", args: { limit: 10 } }]`).
- **`formatter`**: `(string)` The name of a custom string transformation formatter pipeline natively mapped in `PipelineManager` (`"date"`, `"phone"`, `"textCase"`).
- **`args`**: `(unknown)` Configuration arguments passed to a specific Widget or Formatter (e.g. `"javascript"` for `codeEditor`).
- **`dialogButtonText`**: `(string)` Explicit text for the configurable popup submit button (overriding the default "Submit").

---

### Advanced Explicit Layouts (`ILayoutElement`)

If you want to explicitly detach the visual presentation from the nested JSON data structure, use `uiLayout`. It supports these elements:

- **`type`**: `("Group" | "Control" | "HorizontalLayout" | "VerticalLayout" | "WizardStep")` The type of structural UI container.
- **`label`**: `(string)` The textual title of the container or step.
- **`scope`**: `(string)` A JSON Pointer (e.g. `#/properties/CustomerName`) linking the visual control to the underlying schema property.
- **`elements`**: `(ILayoutElement[])` Nested layout elements.
- **`widget`**: `(string)` An optional widget override applied specifically to this visual instance of the field.

---

### Action Plugins (Widgets)

In MetaUI, "Actions" are simply custom plugins mapped via the `ui.widget` property. They render interactive controls (like buttons) rather than data-entry fields, but they still adhere to the `BasePlugin` lifecycle.

#### Built-in Actions
- **`submitButton`**: Renders an Action Button that natively triggers the host container's submission flow (publishing a `TriggerSubmit` event).
- **`urlButton`**: Renders a Navigation Button that opens an external link.

#### Using `ui.args` for Actions
Action plugins often require parameters. You can pass these via the `ui.args` property:

```json
"openWebsite": {
    "type": "string",
    "ui": {
        "widget": "urlButton",
        "label": "Visit SAP",
        "args": "https://sap.com"
    }
}
```

#### Registering a Custom Action Plugin
You are not limited to the built-in actions. If you create a custom `ActionPlugin` (e.g., a button that triggers a barcode scanner or a backend OData call), you register it globally using the `PluginRegistry`:

```typescript
import PluginRegistry from "@siliconst/metaui/core/PluginRegistry";

// Register your custom action
PluginRegistry.getInstance().registerPluginPath(
    "string", 
    "myCustomAction", 
    "my/custom/app/plugins/MyActionPlugin"
);
```
You can then trigger it in your schema simply by setting `"widget": "myCustomAction"`.

---

## Out-of-the-Box Widget Mappings (`PluginRegistry`)

The MetaUI Engine translates schemas into SAPUI5 instances using 31 rigorously defined Plugins. You must use these exact `type` and `ui.widget` combinations to trigger them.

| Base `type` | `ui.widget` (Override) | Rendered UI5 Control | Plugin Class |
| :--- | :--- | :--- | :--- |
| **Core Plugins** | | | |
| `string` | *(default)* | `sap.m.Input` | StringPlugin |
| `number` | *(default)* | `sap.m.StepInput` | NumberPlugin |
| `integer` | *(default)* | `sap.m.StepInput` | NumberPlugin |
| `boolean` | *(default)* | `sap.m.CheckBox` | BooleanPlugin |
| `date` | *(default)* | `sap.m.DatePicker` | DatePlugin |
| `object` | *(default)* | `sap.ui.layout.form.FormContainer` | ObjectPlugin |
| `array` | *(default)* | `sap.m.Table` | ArrayPlugin |
| **Widget Overrides** | | | |
| `string` | `"time"` | `sap.m.TimePicker` | TimePlugin |
| `string` | `"datetime"` | `sap.m.DateTimePicker` | DateTimePlugin |
| `boolean` | `"switch"` | `sap.m.Switch` | SwitchPlugin |
| `number` | `"step"` | `sap.m.StepInput` | StepInputPlugin |
| `string` | `"select"` | `sap.m.ComboBox` | DropdownPlugin |
| `string` | `"textArea"` | `sap.m.TextArea` | TextAreaPlugin |
| `string` | `"codeEditor"` | `sap.ui.codeeditor.CodeEditor` | CodeEditorPlugin |
| `string` | `"fileUploader"` | `sap.ui.unified.FileUploader` | FileUploaderPlugin |
| `array` | `"multiSelect"` | `sap.m.MultiComboBox` | MultiSelectPlugin |
| `array` | `"multiInput"` | `sap.m.MultiInput` | MultiInputPlugin |
| `number` | `"slider"` | `sap.m.Slider` | SliderPlugin |
| `number` | `"rating"` | `sap.m.RatingIndicator` | RatingIndicatorPlugin |
| `string` | `"messageStrip"` | `sap.m.MessageStrip` | MessageStripPlugin |
| `string` | `"camera"` | MetaUI Native Camera | CameraPlugin |
| `string` | `"signature"` | MetaUI Native Signature | SignaturePlugin |
| `object` | `"location"` | MetaUI Native Geolocation | GeolocationPlugin |
| `string` | `"scanner"` | MetaUI Native Barcode | BarcodeScannerPlugin |
| `string` | `"voiceInput"` | MetaUI Native Voice | VoiceInputPlugin |
| `string` | `"richText"` | `sap.ui.richtexteditor...` | RichTextPlugin |
| **Actions & Datasources** | | | |
| `string` | `"urlButton"` | Navigation Button | UrlNavigationActionPlugin |
| `string` | `"submitButton"` | Action Button | SubmitFormActionPlugin |
| `string` | `"odataSelect"` | `sap.m.Select` (OData) | ODataListBindingPlugin |
| `string` | `"remoteDropdown"` | `sap.m.ComboBox` (REST) | RemoteDropdownPlugin |
| `string` | `"liveSearch"` | `sap.m.SearchField` | LiveSearchPlugin |
| `string` | `"remoteValueHelp"` | Remote ValueHelpDialog | RemoteValueHelpPlugin |

---

# Part 2: Full Data Inference Mode

If you bind a completely empty schema (either `null` or `{}`) to the `DynamicHost`, the engine will automatically parse the inbound `data` object and infer a schema dynamically using `SchemaNormalizer`.

**Example Inbound Data:**
```json
{
  "Username": "jdoe99",
  "IsAdmin": false,
  "Score": 85.5
}
```

**What MetaUI Infers:**
1. Creates an overarching form container (via the default `"form"` layout strategy).
2. Infers `Username` as a `string` and maps it to the `StringPlugin`.
3. Infers `IsAdmin` as a `boolean` and maps it to the `BooleanPlugin`.
4. Infers `Score` as a `number` and maps it to the `NumberPlugin`.

---

# Part 3: Swagger / OpenAPI Integration

You don't have to write MetaUI schemas by hand. The engine includes a `SwaggerBuilder` that can consume standard Swagger v2 or OpenAPI v3 JSON payloads directly from your backend and dynamically generate the Fiori UI.

### How to Use It (Practical Guide)

To use an OpenAPI specification, you simply fetch it in your controller, pass it through the `SwaggerBuilder`, and bind the resulting object to the `DynamicHost` in your XML view.

**1. Your XML View**
Add the `DynamicHost` and bind its `schemaDefinition` to a local JSON model (e.g., `viewMode>/swaggerSchema`).

```xml
<core:FragmentDefinition
    xmlns:core="sap.ui.core"
    xmlns:meta="nz.co.siliconst.ui5.metaui.controls">
    
    <meta:DynamicHost
        data="{/myFormData}"
        schemaDefinition="{viewModel>/swaggerSchema}" />
        
</core:FragmentDefinition>
```

**2. Your Controller (JavaScript)**
Use the `SwaggerBuilder.fetchAndBuild()` utility to download the OpenAPI JSON and convert it into a MetaUI layout.

```javascript
sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "nz/co/siliconst/ui5/metaui/swagger/SwaggerBuilder"
], function (Controller, JSONModel, SwaggerBuilder) {
    "use strict";

    return Controller.extend("my.app.controller.Main", {
        onInit: function () {
            var oViewModel = new JSONModel({ swaggerSchema: {} });
            this.getView().setModel(oViewModel, "viewModel");

            // 1. Fetch the Swagger JSON from your API
            // 2. Tell the builder which specific entity to extract (e.g. "CustomerProfile")
            SwaggerBuilder.fetchAndBuild("https://api.mycorp.com/swagger.json", "CustomerProfile")
                .then(function(oMetaUISchema) {
                    // 3. Bind the converted schema to the XML view
                    oViewModel.setProperty("/swaggerSchema", oMetaUISchema);
                })
                .catch(function(err) {
                    console.error("Failed to load Swagger:", err);
                });
        }
    });
});
```

### What does it map automatically?
When the `SwaggerBuilder` runs, it automatically maps OpenAPI constraints into MetaUI UI rules:
- `format: "email"` -> Maps to `ui: { format: "email" }` (Native validation)
- `allOf` and `$ref` -> Flattened and resolved automatically
- `enum` arrays -> Rendered as Dropdowns (`sap.m.ComboBox`)
- `exclusiveMinimum` / `maxLength` -> Natively bound to UI5 input constraints

You can see this live in the **Playground Sandbox**! Toggle the **"Simulate Swagger Pipeline"** switch to swap out the MetaUI schema for a native Swagger schema and watch the Engine orchestrate the exact same UI layout.

---

# Part 4: Real-World Schema Examples

To help you understand how Native MetaUI Schemas fit together, here are three complete, production-ready schema examples.

### Example 1: Basic Employee Form
This example demonstrates a standard form with custom widgets, native validation, and read-only logic.

```json
{
  "type": "object",
  "title": "Employee Profile",
  "layoutStrategy": "form",
  "properties": {
    "employeeId": {
      "type": "string",
      "required": true,
      "ui": {
        "label": "Employee ID",
        "readOnly": true
      }
    },
    "firstName": {
      "type": "string",
      "required": true,
      "maxLength": 50
    },
    "department": {
      "type": "string",
      "ui": {
        "widget": "select"
      },
      "enum": ["HR", "Engineering", "Sales"]
    },
    "hireDate": {
      "type": "date",
      "ui": {
        "widget": "datetime"
      }
    }
  }
}
```

### Example 2: Explicit Grouping (`uiLayout`)
This example forces the Engine to render fields side-by-side using groups and horizontal layouts, completely detaching the visual presentation from the JSON structure.

```json
{
  "type": "object",
  "title": "Payment Settings",
  "layoutStrategy": "form",
  "properties": {
    "cardNumber": { "type": "string", "pattern": "^\\d{16}$" },
    "expiry": { "type": "string" },
    "cvv": { "type": "string", "maxLength": 3 }
  },
  "uiLayout": [
    {
      "type": "Group",
      "label": "Credit Card Details",
      "elements": [
        { "type": "Control", "scope": "#/properties/cardNumber" },
        {
          "type": "HorizontalLayout",
          "elements": [
            { "type": "Control", "scope": "#/properties/expiry" },
            { "type": "Control", "scope": "#/properties/cvv" }
          ]
        }
      ]
    }
  ]
}
```

### Example 3: Tabular Array with Financials (`type: "array"`)
This example renders a Fiori Table. Notice how we use `scale` to strictly format the price to 2 decimal places, and `widget: "step"` for the quantity.

```json
{
  "type": "array",
  "title": "Purchase Order Items",
  "layoutStrategy": "table",
  "items": {
    "type": "object",
    "properties": {
      "materialCode": {
        "type": "string",
        "required": true,
        "ui": { "label": "Material" }
      },
      "quantity": {
        "type": "integer",
        "ui": { "widget": "step" }
      },
      "unitPrice": {
        "type": "number",
        "scale": 2,
        "ui": { "label": "Unit Price ($)" }
      }
    }
  }
}
```
