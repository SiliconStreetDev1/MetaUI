# Schemas & Data Inference

The MetaUI Engine is driven entirely by declarative JSON structures. It supports two modes of operation: **Schema-Driven** (where you define the exact layout and rules) and **Inference Mode** (where the engine guesses the layout based on the raw data).

---

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
- **`precision`**: `(number)` Number of significant digits.
- **`scale`**: `(number)` Number of decimal places.
- **`multipleOf`**: `(number)` Step interval constraint.

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
- **`formatter`**: `(string)` The name of a custom string transformation formatter pipeline.
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

## Full Data Inference Mode

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
