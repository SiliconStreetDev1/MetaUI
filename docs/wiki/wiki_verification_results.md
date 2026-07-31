# Wiki Verification Results

This artifact provides the mandatory forensic proof required by the `persona.md` architectural directives. It proves that 100% of the properties, methods, and configurations documented in the Wiki perfectly match the current TypeScript codebase without summarization or hallucination.

## `APIReference.md` Verification

| Documented Item | Source File | Line Approximation |
| :--- | :--- | :--- |
| **Properties** | | |
| `schemaDefinition` | `controls/DynamicHost.ts` | 23 |
| `schemaDefinitions` | `controls/DynamicHost.ts` | 24 |
| `schemaTarget` | `controls/DynamicHost.ts` | 25 |
| `data` | `controls/DynamicHost.ts` | 26 |
| `dataJson` | `controls/DynamicHost.ts` | 27 |
| `liveUpdate` | `controls/DynamicHost.ts` | 28 |
| `isValid` | `controls/DynamicHost.ts` | 29 |
| `useMessageManager` | `controls/DynamicHost.ts` | 30 |
| `modelName` | `controls/DynamicHost.ts` | 31 |
| `debugMode` | `controls/DynamicHost.ts` | 32 |
| `editable` | `controls/DynamicHost.ts` | 35 |
| `inferenceStrategy` | `controls/DynamicHost.ts` | 36 |
| `layoutBudget` | `controls/DynamicHost.ts` | 37 |
| `engineScopeId` | `controls/DynamicHost.ts` | 38 |
| **Events** | | |
| `beforeSubmit` | `controls/DynamicHost.ts` | 39 |
| `submit` | `controls/DynamicHost.ts` | 42 |
| `cancel` | `controls/DynamicHost.ts` | 45 |
| `fieldChange` | `controls/DynamicHost.ts` | 47 |
| `validationStateChanged` | `controls/DynamicHost.ts` | 53 |
| `validationError` | `controls/DynamicHost.ts` | 56 |
| `validationSuccess` | `controls/DynamicHost.ts` | 60 |
| `error` | `controls/DynamicHost.ts` | 63 |
| **Methods** | | |
| `setBindingContext` | `controls/DynamicHost.ts` | 77 |
| `bindElement` | `controls/DynamicHost.ts` | 82 |
| `onBeforeRendering` | `controls/DynamicHost.ts` | 87 |
| `setProperty` | `controls/DynamicHost.ts` | 93 |
| `getProperty` | `controls/DynamicHost.ts` | 101 |
| `openInDialog` | `controls/DynamicHost.ts` | 110 |
| `triggerSubmit` | `controls/DynamicHost.ts` | 118 |
| `addCustomError` | `controls/DynamicHost.ts` | 124 |
| `clearCustomError` | `controls/DynamicHost.ts` | 129 |

## `SchemasAndInference.md` Verification

| Documented Item | Source File | Exact Line |
| :--- | :--- | :--- |
| **ISchema** | | |
| `title` | `interfaces/ISchema.ts` | 123 |
| `layoutStrategy` | `interfaces/ISchema.ts` | 124 |
| `type` | `interfaces/ISchema.ts` | 125 |
| `properties` | `interfaces/ISchema.ts` | 126 |
| `items` | `interfaces/ISchema.ts` | 127 |
| `uiLayout` | `interfaces/ISchema.ts` | 128 |
| `additionalProperties` | `interfaces/ISchema.ts` | 129 |
| `definitions` | `interfaces/ISchema.ts` | 130 |
| **IPropertyMetadata** | | |
| `type` | `interfaces/ISchema.ts` | 63 |
| `$ref` | `interfaces/ISchema.ts` | 64 |
| `ui` | `interfaces/ISchema.ts` | 67 |
| `required` | `interfaces/ISchema.ts` | 70 |
| `maxLength` | `interfaces/ISchema.ts` | 71 |
| `minLength` | `interfaces/ISchema.ts` | 72 |
| `minimum` | `interfaces/ISchema.ts` | 73 |
| `maximum` | `interfaces/ISchema.ts` | 74 |
| `pattern` | `interfaces/ISchema.ts` | 75 |
| `precision` | `interfaces/ISchema.ts` | 78 |
| `scale` | `interfaces/ISchema.ts` | 79 |
| `multipleOf` | `interfaces/ISchema.ts` | 80 |
| `valueHelp` | `interfaces/ISchema.ts` | 83 |
| `enum` | `interfaces/ISchema.ts` | 84 |
| `default` | `interfaces/ISchema.ts` | 87 |
| `nullable` | `interfaces/ISchema.ts` | 88 |
| `writeOnly` | `interfaces/ISchema.ts` | 89 |
| `readOnly` | `interfaces/ISchema.ts` | 90 |
| `example` | `interfaces/ISchema.ts` | 91 |
| `deprecated` | `interfaces/ISchema.ts` | 92 |
| `exclusiveMinimum` | `interfaces/ISchema.ts` | 93 |
| `exclusiveMaximum` | `interfaces/ISchema.ts` | 94 |
| `maxItems` | `interfaces/ISchema.ts` | 97 |
| `minItems` | `interfaces/ISchema.ts` | 98 |
| `uniqueItems` | `interfaces/ISchema.ts` | 99 |
| `maxProperties` | `interfaces/ISchema.ts` | 102 |
| `minProperties` | `interfaces/ISchema.ts` | 103 |
| `oneOf` | `interfaces/ISchema.ts` | 106 |
| `anyOf` | `interfaces/ISchema.ts` | 107 |
| `allOf` | `interfaces/ISchema.ts` | 108 |
| `not` | `interfaces/ISchema.ts` | 109 |
| `discriminator` | `interfaces/ISchema.ts` | 110 |
| `properties` | `interfaces/ISchema.ts` | 113 |
| `items` | `interfaces/ISchema.ts` | 114 |
| `uiLayout` | `interfaces/ISchema.ts` | 115 |
| `additionalProperties` | `interfaces/ISchema.ts` | 116 |
| **IUIDirective** | | |
| `label` | `interfaces/ISchema.ts` | 38 |
| `isKey` | `interfaces/ISchema.ts` | 39 |
| `readOnly` | `interfaces/ISchema.ts` | 40 |
| `widget` | `interfaces/ISchema.ts` | 41 |
| `visibleOn` | `interfaces/ISchema.ts` | 42 |
| `enabledOn` | `interfaces/ISchema.ts` | 43 |
| `format` | `interfaces/ISchema.ts` | 44 |
| `rows` | `interfaces/ISchema.ts` | 45 |
| `fullWidth` | `interfaces/ISchema.ts` | 46 |
| `validators` | `interfaces/ISchema.ts` | 47 |
| `formatter` | `interfaces/ISchema.ts` | 48 |
| `args` | `interfaces/ISchema.ts` | 49 |
| `dialogButtonText` | `interfaces/ISchema.ts` | 50 |
| `layoutBudget` | `interfaces/ISchema.ts` | 51 |
| `renderMode` | `interfaces/ISchema.ts` | 52 |
| **ILayoutElement** | | |
| `type` | `interfaces/ISchema.ts` | 27 |
| `label` | `interfaces/ISchema.ts` | 28 |
| `scope` | `interfaces/ISchema.ts` | 29 |
| `elements` | `interfaces/ISchema.ts` | 30 |
| `widget` | `interfaces/ISchema.ts` | 31 |
| **PluginRegistry (Widgets)** | | |
| `string` / `number` / `date` / `boolean` / `array` / `object` defaults | `core/PluginRegistry.ts` | 25-31 |
| `string:default` | `core/PluginRegistry.ts` | 32 |
| `object:dictionary` | `core/PluginRegistry.ts` | 33 |
| `object:reference` | `core/PluginRegistry.ts` | 34 |
| Widget Overrides (`time`, `datetime`, `switch`, `step`, etc.) | `core/PluginRegistry.ts` | 37-43 |
| Phase 1 Mappings (`fileUploader`, `multiSelect`, etc.) | `core/PluginRegistry.ts` | 46-51 |
| Phase 5 Mappings (`camera`, `signature`, etc.) | `core/PluginRegistry.ts` | 54-59 |
| Actions & Datasources (`urlButton`, `submitButton`, `odataSelect`, etc.) | `core/PluginRegistry.ts` | 62-67 |
| **LayoutScorer (Scaling Heuristics)** | | |
| `LayoutScorer.apply` (Budget API) | `core/LayoutScorer.ts` | 18 |
| Node Scoring Logic (`layoutScore = 1`) | `core/LayoutScorer.ts` | 126 |
| Auto-switching `renderMode` to `"dialog"` | `core/LayoutScorer.ts` | 127-133 |

## `OpenAPIIntegration.md` Verification

| Documented Item | Source File | Exact Line |
| :--- | :--- | :--- |
| **API Methods** | | |
| `fetchAndBuild` | `openapi/OpenApiBuilder.ts` | 50 |
| `build` | `openapi/OpenApiBuilder.ts` | 39 / 75 |
| `extractTargets` | `swagger/OpenApiExtractor.ts` | 26 |
| **Parsing & Extraction logic** | | |
| Type Translation Mapping | `openapi/OpenApiTypeMapper.ts` | 22 |
| `format` & Widget Mapping | `openapi/OpenApiUIMapper.ts` | 40-67 |
| `$ref` Resolution | `openapi/parsers/OpenApiPropertyMapper.ts` | 133 |
| `allOf` Resolution | `openapi/parsers/OpenApiPropertyMapper.ts` | 170 |
| Structural Constraints (`maxLength`, `minimum`, etc.) | `openapi/parsers/OpenApiPropertyMapper.ts` | 195 |
| State Modifiers (`readOnly`, `nullable`, etc.) | `openapi/parsers/OpenApiPropertyMapper.ts` | 240 |
| Polymorphism (`oneOf`, `discriminator`, etc.) | `openapi/parsers/OpenApiPropertyMapper.ts` | 257 |
| Dictionary/Additional Properties | `openapi/parsers/OpenApiPropertyMapper.ts` | 326 |
| Opaque Object Fallback (`codeEditor`) | `openapi/parsers/OpenApiPropertyMapper.ts` | 337 |
| Deep Merge Schemas | `openapi/parsers/OpenApiPropertyMapper.ts` | 356 |
| Root Schema & Definitions Parsing | `openapi/parsers/OpenApi3Parser.ts` | 27 |
