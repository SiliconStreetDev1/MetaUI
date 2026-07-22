# Schemas & Data Inference

The MetaUI Engine is driven entirely by declarative JSON structures. It supports two modes of operation: **Schema-Driven** (where you define the exact layout and rules) and **Inference Mode** (where the engine guesses the layout based on the raw data).

---

## Defining a JSON Schema

A MetaUI JSON Schema defines the hierarchical layout of your form, the types of controls to generate, and the validation rules for each field.

### Basic Structure

```json
{
  "type": "object",
  "properties": {
    "GeneralInformation": {
      "type": "object",
      "title": "Customer Profile",
      "properties": {
        "CustomerName": {
          "type": "string",
          "title": "Customer Name",
          "required": true,
          "maxLength": 50
        },
        "AccountActive": {
          "type": "boolean",
          "title": "Is Account Active?"
        },
        "RegistrationDate": {
          "type": "date",
          "title": "Date of Registration"
        }
      }
    }
  }
}
```

### Core Schema Properties

- **`type`**: The primitive type determining which plugin handles the field (e.g., `string`, `number`, `boolean`, `date`, `object`, `array`).
- **`title`**: The human-readable label rendered next to the field in the UI.
- **`required`**: Following standard JSON Schema rules, this is an array of strings on the parent `object` defining which properties are mandatory (e.g. `"required": ["CustomerName"]`).
- **`properties`**: For `object` types, defines the nested fields.
- **`items`**: For `array` types, defines the schema of the array elements.
- **`layoutStrategy`**: Defines the macro-layout behavior of the form (e.g. `"Linear"`, `"Wizard"`, `"Grid"`).
- **`uiLayout`**: An array of `ILayoutElement` objects that explicitly define the visual hierarchy, grouping, and ordering of fields independently of the data structure.

### Advanced Explicit Layouts (`uiLayout`)

If you want to completely detach the visual presentation from the nested JSON data structure, you can use the `uiLayout` array. This allows you to place any property from anywhere in the schema into specific tabs, horizontal layouts, or wizard steps.

```json
"uiLayout": [
  {
    "type": "WizardStep",
    "label": "Personal Info",
    "elements": [
      { "type": "Control", "scope": "#/properties/FirstName" },
      { "type": "Control", "scope": "#/properties/LastName" }
    ]
  }
]
```
- **`type`**: `"Group" | "Control" | "HorizontalLayout" | "VerticalLayout" | "WizardStep"`
- **`label`**: The title for the layout container.
- **`scope`**: A JSON Pointer (e.g. `#/properties/FirstName`) linking the visual control to the underlying schema property.
- **`elements`**: Nested layout elements.
- **`widget`**: An optional widget override for the control.

### The `ui` Directive Block

MetaUI extends standard JSON Schema with a proprietary `ui` block for visual orchestration and Fiori-specific layouts:

```json
"CustomerName": {
  "type": "string",
  "ui": {
    "label": "Full Legal Name",
    "readOnly": false,
    "widget": "input",
    "visibleOn": "{/AccountActive} === true",
    "enabledOn": "{/Status} !== 'LOCKED'",
    "fullWidth": true
  }
}
```
**Supported `ui` properties:**
- `label`: Overrides `title`.
- `isKey`: Marks a field as a primary key (useful for OData mapping).
- `readOnly`: Locks the field structurally.
- `widget`: Forces a specific plugin (e.g. `"widget": "slider"` on a number field).
- `visibleOn` / `enabledOn`: Expression binding strings for dynamic UI behavior based on other fields.
- `format`: Specific format string (e.g. for dates or numbers).
- `rows`: Number of rows (for TextArea).
- `fullWidth`: Forces a control to take up 100% of the container.
- `validators` / `formatter`: Custom pipeline function names or arrays of custom validation rules.
- `args`: Optional arguments passed to custom validators or formatters.
- `dialogButtonText`: Text for the submit button when the plugin spawns a dialog.

### Standard Validations & Constraints

- **Strings**: `maxLength`, `minLength`, `pattern` (Regex).
- **Numbers**: `minimum`, `maximum`, `precision`, `scale`, `multipleOf`.

### Value Selection (Dropdowns & Inputs)

MetaUI provides three ways to handle predefined value selection (which typically render as Dropdowns, MultiSelects, or Input fields with a ValueHelpDialog).

#### 1. Simple Enum (Raw Values)
Use standard JSON Schema `enum` for basic string or number arrays:
```json
"Country": {
  "type": "string",
  "enum": ["US", "CA", "UK"]
}
```

#### 2. Static Value Help (Key/Text Pairs)
Use `valueHelp` as an array of objects to map backend keys to human-readable text:
```json
"Country": {
  "type": "string",
  "valueHelp": [
    { "key": "US", "text": "United States" },
    { "key": "CA", "text": "Canada" },
    { "key": "UK", "text": "United Kingdom" }
  ]
}
```

#### 3. Remote Value Help (OData / REST)
Use `valueHelp` as a configuration object to dynamically fetch items from a backend endpoint:
```json
"EmployeeId": {
  "type": "string",
  "valueHelp": {
    "url": "/sap/opu/odata/sap/Z_EMPLOYEE_SRV/EmployeeSet",
    "keyPath": "EmployeeNumber",
    "textPath": "FullName"
  }
}
```

---

## Full Data Inference Mode

In many scenarios, you may receive a raw data payload from a backend system without a predefined UI schema. MetaUI handles this seamlessly via the `SchemaNormalizer`.

If you bind a completely empty schema (either `null` or `{}`) to the `DynamicHost`, the engine will automatically parse the inbound `data` object and infer a schema dynamically.

**Example Inbound Data:**
```json
{
  "Username": "jdoe99",
  "IsAdmin": false,
  "Score": 85.5
}
```

**What MetaUI Infers:**
1. Creates an overarching form container.
2. Infers `Username` as a `string` and maps it to the `StringPlugin`.
3. Infers `IsAdmin` as a `boolean` and maps it to the `BooleanPlugin`.
4. Infers `Score` as a `number` and maps it to the `NumberPlugin`.

*Note: In Inference Mode, the UI uses the raw property keys (e.g., "Username") as the labels.*

### Partial Schemas (`additionalProperties`)

If you want to explicitly define the layout for *some* fields, but let the engine infer the rest of the unknown payload, use the `additionalProperties` flag:

```json
{
  "type": "object",
  "additionalProperties": true,
  "properties": {
    "Score": { "type": "number", "ui": { "widget": "slider" } }
  }
}
```
If `additionalProperties: true` is set, MetaUI will merge the explicit schema with an inferred schema generated from the inbound data, placing the explicitly defined fields first and appending the inferred fields at the bottom of the form!

---

## Supported Field Plugins

The framework delegates rendering to **24 native plugins**, grouped below by functionality. These plugins handle both the UI5 generation and the bidirectional state extraction.

### Primitives
- `StringPlugin` (Standard text inputs)
- `NumberPlugin` (Numeric inputs with formatting)
- `BooleanPlugin` (Checkboxes)
- `ObjectPlugin` (Groups, Form Containers)
- `ArrayPlugin` (Tables, Lists)

### Dates & Times
- `DatePlugin` (Date pickers)
- `TimePlugin` (Time pickers)
- `DateTimePlugin` (Combined DateTime pickers)

### Text & Code
- `TextAreaPlugin` (Multi-line text inputs)
- `RichTextPlugin` (WYSIWYG editors)
- `CodeEditorPlugin` (Syntax highlighted code entry)

### Selection & Input
- `DropdownPlugin` (Select/ComboBoxes)
- `MultiSelectPlugin` (Token-based multi-selection)
- `MultiInputPlugin` (Value help and free-text tokens)
- `SwitchPlugin` (Toggle switches)
- `SliderPlugin` (Numeric range sliders)
- `RatingIndicatorPlugin` (Star ratings)

### Media & Hardware
- `FileUploaderPlugin` (Native file attachment handling)
- `CameraPlugin` (Device camera capture integration)
- `BarcodeScannerPlugin` (Native scanner integration)
- `SignaturePlugin` (Canvas-based signature capture)
- `VoiceInputPlugin` (Microphone speech-to-text)
- `GeolocationPlugin` (GPS coordinate capture)

### Static Layouts
- `MessageStripPlugin` (Read-only alerts, warnings, and semantic messages)
