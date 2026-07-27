# OpenAPI Integration

The MetaUI Engine natively supports both **Swagger (OpenAPI 2.0)** and **OpenAPI 3.x** schemas. Rather than forcing you to write UI-specific schemas, the engine dynamically translates API definitions into the native `ISchema` layout format at runtime.

This page explains how the OpenApiBuilder facade, Extractors, and parsing engine map OpenAPI features to Fiori UI components.

## Programmatic Translation API

The primary entry point for converting OpenAPI to a MetaUI Schema is the `OpenApiBuilder` facade.

- **`OpenApiBuilder.fetchAndBuild(url: string, targetDefinition?: string)`**: Asynchronously fetches a remote OpenAPI JSON document and compiles it into an `ISchema`. 
- **`OpenApiBuilder.build(rawSchema: unknown, targetDefinition?: string)`**: Synchronously parses an OpenAPI document if it is already loaded into memory.
- **`OpenApiExtractor.extractTargets(rawSchema: unknown)`**: Crawls an OpenAPI document to extract all valid root endpoints (Paths) and reusable schema objects (Definitions/Components). This is used to populate drop-downs for schema selection.

---

## Type and Constraint Mapping

The `OpenApiPropertyMapper` and its related utilities rigorously translate OpenAPI constraints to native MetaUI validation.

### Type Translation

| OpenAPI Type | MetaUI `FieldType` | Fallback / Nuance |
| :--- | :--- | :--- |
| `string` | `string` | |
| `number` | `number` | |
| `integer` | `integer` | |
| `boolean` | `boolean` | |
| `array` | `array` | |
| `object` | `object` | Defaults to `object` if the type property is entirely omitted. |
| `date` | `date` | |

### Structural Constraints

MetaUI respects OpenAPI constraints by directly mapping them to the schema. These constraints are evaluated natively by the `SchemaValidator`.

- **String Constraints**: `maxLength`, `minLength`, `pattern`
- **Numeric Constraints**: `maximum`, `minimum`, `multipleOf`, `exclusiveMaximum`, `exclusiveMinimum`
- **Array Constraints**: `maxItems`, `minItems`, `uniqueItems`
- **Object Constraints**: `maxProperties`, `minProperties`

### State Modifiers

Operational flags from OpenAPI map directly to the MetaUI form state:

- **`readOnly`**: Makes the Fiori widget non-editable (`sap.m.InputBase#editable = false`).
- **`writeOnly`**: Maps to `writeOnly` state (often used to obscure payloads on outbound).
- **`nullable`**: Allows `null` as a valid validation state.
- **`deprecated`**: Flags the field as deprecated.

---

## Formats & Visual Widget Mapping

OpenAPI `format` modifiers are mapped to explicit MetaUI `IUIDirective` properties to render specialized Fiori controls without requiring custom annotations.

| OpenAPI Format | MetaUI UI Directive Widget / Format |
| :--- | :--- |
| `date-time` | `widget: "datetime"` (`sap.m.DateTimePicker`) |
| `date` | `widget: "date"` (`sap.m.DatePicker`) |
| `password` | `format: "password"` |
| `email` | `format: "email"` |
| `uri` | `format: "url"` |
| `binary` / `byte` | `widget: "fileUploader"` |
| `uuid` / `ipv4` / `ipv6` / `hostname` | Adds explicit format string to the `ui.validators` array. |

---

## Composition and Polymorphism

MetaUI handles complex OpenAPI structural semantics through deep recursive evaluation:

- **`$ref` Resolution**: Reusable references are recursively resolved. If they point to primitives, they are inlined. If they point to objects, they map to the `reference` widget (`Sub-Form Container`).
- **`allOf`**: Arrays of schemas are flattened and deep-merged (`deepMergeSchemas`) to create a unified schema with all properties combined.
- **`oneOf` / `anyOf`**: Mapped into native MetaUI polymorphic definitions. `oneOf` triggers the `polymorphic` widget, which generates dropdown selection layouts for variant swapping.
- **`discriminator`**: Maps the OpenAPI discriminator property Name (and mappings in v3.0) to MetaUI so the engine can natively switch types based on payload values.
- **`additionalProperties`**: If set to `true`, enables Inference mode on the object. If defined as a schema, maps to the `dictionary` widget (Key-Value List).
- **Opaque Objects**: Objects with no `properties` and no `additionalProperties` fall back to rendering a raw `codeEditor` widget for freeform JSON.
