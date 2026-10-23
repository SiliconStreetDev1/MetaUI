# OpenAPI Integration

The MetaUI Engine natively supports both **Swagger (OpenAPI 2.0)** and **OpenAPI 3.x** schemas. Rather than forcing you to write UI-specific schemas, the engine dynamically translates API definitions into the native `ISchema` layout format at runtime.

This page explains how the OpenApiBuilder facade, Extractors, and parsing engine map OpenAPI features to Fiori UI components.

## Programmatic Translation API

The primary entry point for converting OpenAPI to a MetaUI Schema is the `OpenApiBuilder` facade.

- **`OpenApiBuilder.fetchAndBuild(url: string, targetDefinition?: string)`**: Asynchronously fetches a remote OpenAPI JSON document and compiles it into an `ISchema`. 
- **`OpenApiBuilder.build(rawSchema: unknown, targetDefinition?: string)`**: Synchronously parses an OpenAPI document if it is already loaded into memory.
- **`OpenApiExtractor.extractTargets(rawSchema: unknown)`**: Crawls an OpenAPI 2.0 or 3.0 document to extract all selectable request/response operation paths (`#/paths/...`) and reusable schema objects (`definitions` / `components.schemas`). Returns `OpenApiTarget[]` (`{ key, text }`).

---

## Type and Constraint Mapping

The `OpenApiPropertyMapper` and its related utilities rigorously translate OpenAPI constraints to native MetaUI validation.

### Type Translation

| OpenAPI Type | MetaUI `FieldType` | Fallback / Nuance |
| :--- | :--- | :--- |
| `string` | `string` | Default when `type` is omitted and no object/array structural keywords are present. |
| `file` | `string` | OpenAPI 2.0 `file` type; mapped to `widget: "fileUploader"`. |
| `number` | `number` | |
| `integer` | `integer` | |
| `boolean` | `boolean` | |
| `array` | `array` | Inferred when `items` is an object even if `type` is omitted. |
| `object` | `object` | Inferred when `properties`, `additionalProperties`, `oneOf`, `anyOf`, or `$ref` is present even if `type` is omitted. |
| `date` | `date` | |

### Structural Constraints

MetaUI respects OpenAPI constraints by directly mapping them onto `IPropertyMetadata`. Structural schema consistency (`minLength <= maxLength`, `minimum <= maximum`) is verified by `SchemaValidator`, while runtime payload values are validated by `PipelineManager` (`IValidator` plugins) and `PayloadValidator`.

- **String Constraints**: `maxLength`, `minLength`, `pattern`
- **Numeric Constraints**: `maximum`, `minimum`, `multipleOf`, `exclusiveMaximum`, `exclusiveMinimum`
- **Array Constraints**: `maxItems`, `minItems`, `uniqueItems`
- **Object Constraints**: `maxProperties`, `minProperties`

### State Modifiers

Operational flags from OpenAPI map onto the normalized `IPropertyMetadata`:

- **`readOnly`**: Makes the Fiori widget non-editable (`sap.m.InputBase#editable = false`).
- **`writeOnly`**: Preserved on `IPropertyMetadata` for consumer inspection (not automatically hidden or stripped at runtime).
- **`nullable`**: Enforced by `RequiredValidatorPlugin` (`nullable: false` rejects `null`; `nullable: true` permits `null` even when `required: true`). Also normalized from OpenAPI 2.0 `x-nullable` and Draft 2020-12 `type: [..., "null"]`.

---

## Formats & Visual Widget Mapping

OpenAPI `format` modifiers are mapped to explicit MetaUI `IUIDirective` properties to render specialized Fiori controls without requiring custom annotations.

| OpenAPI Format | MetaUI UI Directive Widget / Format |
| :--- | :--- |
| `date-time` | `widget: "datetime"` (`sap.m.DateTimePicker`) |
| `date` | `widget: "date"` (`sap.m.DatePicker`) |
| `time` | `widget: "time"` (`sap.m.TimePicker`) |
| `password` | `widget: "password"` (`sap.m.Input` `type="Password"`) |
| `email` | `widget: "email"`, `format: "email"` (`sap.m.Input` `type="Email"`) |
| `uri` / `url` | `widget: "link"`, `format: "url"` (`sap.m.Link`) |
| `iban` | `format: "iban"` |
| `binary` / `byte` | `widget: "fileUploader"` |
| `uuid` / `ipv4` / `ipv6` / `hostname` | Mapped to standard RFC regular expressions on `pattern` (`OpenApiConstraintMapper`) and validated by `PatternValidatorPlugin`. All four built-in mappings pass that plugin's catastrophic-backtracking screen; a `pattern` taken from the spec itself may not — see [Supported Features § Known Limitations](SupportedFeatures.md). |

---

## Composition and Polymorphism

MetaUI handles complex OpenAPI structural semantics through deep recursive evaluation:

- **`$ref` Resolution**: Reusable references are recursively resolved. If they point to primitives, they are inlined. If they point to objects, they map to the `reference` widget (`Sub-Form Container`).
- **`allOf`**: Arrays of schemas are flattened and deep-merged (`deepMergeSchemas`) to create a unified schema with all properties combined.
- **`oneOf` / `anyOf`**: Mapped into normalized `IPropertyMetadata[]` composition arrays on the property metadata and rendered interactively via `PolymorphicPlugin` (`widget: "polymorphic"`), which provides a variant selector (`sap.m.Select`) and renders the active sub-schema via a nested `DynamicHost`.
- **`discriminator`**: Maps the OpenAPI discriminator `propertyName` and `mapping` dictionary (`OpenAPI 3.0`) so `PolymorphicPlugin` automatically synchronizes the discriminator field with the active variant.
- **`additionalProperties`**: If set to `true`, enables Hybrid Inference mode on the object. If defined as a schema, maps to the `dictionaryMap` widget (Key-Value List).
- **Opaque Objects**: Objects with no `properties` and no `additionalProperties` fall back to rendering a raw `codeEditor` widget for freeform JSON.
