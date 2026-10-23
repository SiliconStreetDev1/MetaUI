# API Reference (DynamicHost)

The `DynamicHost` (`nz.co.siliconst.ui5.metaui.controls.DynamicHost`) is the primary public interface for the MetaUI framework. It acts as a transparent Facade wrapper that extends `sap.ui.core.Control`.

---

## API Tiers and What They Promise

The library publishes roughly 150 AMD modules, and almost every one of them exports something. That is a consequence of how it is loaded, not an invitation: UI5 resolves one module per file, and `PluginRegistry` requires plugin modules by path at runtime, so a class has to be exported to be reachable at all. **Being exported is not a compatibility promise.** Three tiers say which exports are.

| Tier | Who it is for | Patch release (`2.0.x`) | Minor release (`2.x.0`) | Major release (`x.0.0`) |
| :--- | :--- | :--- | :--- | :--- |
| **Public** | Applications embedding MetaUI | Unchanged, byte for byte | May gain declarations; nothing removed or altered | May change in any way |
| **Extension** | Code that plugs *into* MetaUI: custom plugins, validators, layouts, policy operators | Unchanged, byte for byte | May gain declarations; nothing removed or altered | May change in any way |
| **Internal** | Nobody outside this repository | **May change without notice** | May change without notice | May change without notice |

The tier of every exported declaration is recorded in the committed snapshot `.github/api-surface.txt`, which is regenerated and diffed on every pull request. The assignment itself lives in the `API_TIERS` allowlist in `.github/scripts/api-surface.js`. A declaration is internal unless that allowlist names it, so a newly exported symbol defaults to *unpromised* rather than to *frozen*.

### Public tier

Everything this page documents, and nothing else:

| Module | What it is |
| :--- | :--- |
| `nz/co/siliconst/ui5/metaui/library` | The UI5 library entry point. The name an application lists in its `manifest.json` dependencies. |
| `nz/co/siliconst/ui5/metaui/controls/DynamicHost` | The control, its properties, its events and their parameter types. |
| `nz/co/siliconst/ui5/metaui/interfaces/ISchema` | The TypeScript shape of the schema you author and hand to `schemaDefinition` — `ISchema`, `IPropertyMetadata`, `IUIDirective`, `IValidationRule`, `IDataSourceConfig`, `IValueHelp`, `IPolicy` and the rest of that module. Documented in full in [AI_Schema_CheatSheet.md](AI_Schema_CheatSheet.md) and [SchemasAndInference.md](SchemasAndInference.md). |
| `nz/co/siliconst/ui5/metaui/utils/UrlValidator` | The data-source origin policy, documented below. |
| `nz/co/siliconst/ui5/metaui/utils/Logger` | Debug mode, documented below. |
| `nz/co/siliconst/ui5/metaui/constants/MetaUIConstants` | `SCHEMA_TYPE` and `RENDER_MODE` only, with their derived types `SchemaTypeType` and `RenderModeType`. These are closed sets that `ISchema` is defined in terms of. `WIDGET_TYPE` and `LAYOUT_STRATEGY` are **not** public: they grow with every new widget and layout, and the vocabulary you actually author against is the string values, which are documented and covered by the test oracle. |

### Extension tier

The contract for code that plugs into MetaUI. [CreatingPlugins.md](CreatingPlugins.md) and [PolicyBasedRulesEngine.md](PolicyBasedRulesEngine.md) are its documentation.

| Module | What it is |
| :--- | :--- |
| `nz/co/siliconst/ui5/metaui/plugins/controls/BasePlugin` | The class a custom control plugin extends. |
| `nz/co/siliconst/ui5/metaui/core/PluginStateBase` | Its base class, whose protected members `CreatingPlugins.md` documents by name. |
| `nz/co/siliconst/ui5/metaui/core/PluginRegistry` | `registerPluginPath()`, `registerLayoutPath()`, `registerActionPath()`, `registerPolicyConditionPath()`, `registerPolicyEffectPath()`. |
| `nz/co/siliconst/ui5/metaui/core/PipelineManager` | `GlobalPipeline`, and the `PipelineManager` type it is declared as. |
| `nz/co/siliconst/ui5/metaui/core/Registry` | `GlobalPipeline.validators` is a `Registry`; `register()` lives on it. |
| `nz/co/siliconst/ui5/metaui/core/Engine` | Handed to every custom layout by `ILayoutManager`. |
| `nz/co/siliconst/ui5/metaui/interfaces/IPlugin` | `IPlugin`, `IPluginEngineContext`, `IPluginStateReceiver`, `IPluginValidationResult`. |
| `nz/co/siliconst/ui5/metaui/interfaces/IPipeline` | `IValidator`, `IFormatter`, `IParser`, `IValidationResult`, `IValidatorRuleExtraction`. |
| `nz/co/siliconst/ui5/metaui/interfaces/IPolicyPlugin` | `IPolicyConditionPlugin` and `IPolicyEffectPlugin`. |
| `nz/co/siliconst/ui5/metaui/interfaces/ILayoutManager` | The contract a custom layout implements. |
| `nz/co/siliconst/ui5/metaui/interfaces/IEngineHost` | Reachable from `Engine`. |
| `nz/co/siliconst/ui5/metaui/interfaces/ISchemaBuilderPlugin` | A custom schema builder. |
| `nz/co/siliconst/ui5/metaui/openapi/interfaces/IOpenApiParserPlugin` | A custom OpenAPI parser. |
| `nz/co/siliconst/ui5/metaui/openapi/heuristics/interfaces/IHeuristicPlugin` | A custom OpenAPI heuristic. |
| `nz/co/siliconst/ui5/metaui/core/PolicyEngine` | `PropertyName` only — the union an `IPolicyEffectPlugin` must return. The `PolicyEngine` class itself is internal. |
| `nz/co/siliconst/ui5/metaui/utils/ControlCapabilities` | `INestedEditorLaunchOptions` only — the argument to `BasePlugin`'s nested-editor helper. |

### Internal tier

Everything else: the engine's collaborators (`StateManager`, `ValidationLedger`, `SchemaDirectiveNormalizer`, `LayoutMutator`, …), the host delegates (`DataSyncDelegate`, `ODataDelegate`, …), the layouts, the OpenAPI ingestion classes, the utility modules, the hardware controls, `GeneratorHost` and `InferredGeneratorHost`, and **all 51 concrete plugin classes**.

These are exported, loadable and subclassable, and they are not promised. Their names, signatures, protected members and behaviour may change in any release, including a patch. If you depend on one, pin an exact version.

Two consequences worth stating plainly:

- **The 51 concrete plugin classes stay exported and are internal.** `PluginRegistry` resolves them by AMD module path, so they cannot stop being exported; what the documented contract covers is the `(type, widget)` registration and the widget names, not the classes. Subclassing `LiveSearchPlugin` to override a protected method — as `test/webapp/plugins/MockLiveSearchPlugin.js` does — works, and is unsupported. Extend `BasePlugin` instead. `HardwareControlPlugin`, `PickerPlugin`, `TextLikeInputPlugin`, `NestedDialogPlugin` and `BaseOpenApiParser` are abstract bases that exist for the built-in plugins to share code; they are promotion candidates for a release that documents them, and until then they are internal too.
- **`DynamicHost.getStateManager()` is public, but `StateManager` is not.** The accessor will keep existing and keep returning that object; the object's own members are internal and may change in a patch. The same holds for `getDebugDomMetadata()`, which is typed `unknown` for the same reason.

### How the tiers are enforced

- On every pull request, `node .github/scripts/api-surface.js dist --check .github/api-surface.txt` fails if the committed snapshot is stale. **Every** change appears in the diff, internal included — the tier only decides what happens next.
- On release, `node .github/scripts/api-semver-gate.js` compares the package about to be published against the one on the registry. It refuses a patch bump that moves the public or extension tier, and a minor bump that removes or alters one. Internal changes are listed in the release log and never block.
- In `src/`, an `@internal` JSDoc tag demotes a declaration out of the gated tiers. Nothing in `src/` can promote one — promotion means documenting the symbol here and adding it to `API_TIERS`. The `@public` tag is currently a doc-comment convention with no effect on the tiers; do not read it as a promise.

### There is no plugin API version to pin against

The extension tier has no version of its own. There is no `pluginApiVersion` constant, no capability or revision field on `BasePlugin` or `PluginRegistry`, and no negotiation at registration time: a plugin compiled against one release is loaded by any other release that can resolve its module path, and a mismatch shows up as a runtime failure rather than a refusal to load.

Until that changes, the only thing to pin is the package version. Express it as a peer dependency on `@siliconst/metaui` with a caret range (`^2.0.0`), and treat a major bump of the library as a release of your plugin.

---

## Public Properties (Metadata)

| Property | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `schemaDefinition` | `any` | `null` | The structural schema defining the UI (either JSON Schema or OpenAPI specification). Can also accept a URL string to fetch remote schemas. |
| `schemaDefinitions` | `object` | `{}` | A dictionary of shared schema definitions parsed from the root schema or OpenAPI definition, used for `$ref` resolution. |
| `schemaTarget` | `string` | `null` | The specific definition or endpoint target to extract from a complex root schema (e.g. `CustomerProfile` or `#/paths/...`). |
| `pluginRegistry` | `object` | `null` | Optional custom `PluginRegistry` instance override for isolated host scoping. |
| `schemaBuilderRegistry` | `object` | `null` | Optional custom `SchemaBuilderRegistry` instance override. |
| `data` | `any` | `null` | The underlying data model as a native JS object. Supports two-way binding. Automatically updates on `submit` or continuously if `liveUpdate="true"`. |
| `dataJson` | `string` | `null` | The underlying data model as a stringified JSON. Supports two-way binding. Automatically updates on `submit` or continuously if `liveUpdate="true"`. |
| `liveUpdate` | `boolean` | `false` | If true, bypasses the sandbox and forcefully pushes field `change` events up to the two-way bound data models. |
| `isValid` | `boolean` | `true` | Tracks the global schema validation state of the entire form. |
| `useMessageManager` | `boolean` | `false` | If true, ties the internal validation errors directly into the global SAPUI5 `Messaging` (`MessageManager`) for centralized error popovers. |
| `modelName` | `string` | `"meta"` | The internal JSONModel namespace used by the Engine for absolute data bindings. |
| `debugMode` | `boolean` | `false` | If true, records diagnostic DOM and layout metadata accessible via `getDebugDomMetadata()`. |
| `editable` | `boolean` | `true` | If false, renders the entire generated layout as read-only. |
| `layoutBudget` | `int` | `0` | Controls how many nested fields can be recursively rendered inline before overflowing into a dialog. `0` disables inline sub-layouts. |
| `engineScopeId` | `string` | `null` | A deterministic internal prefix passed down recursively to prevent DOM ID collisions between multiple engines. |
| `width` | `sap.ui.core.CSSSize` | `"100%"` | Explicit CSS width of the host container (`min-width: 0`, `max-width: 100%`, `box-sizing: border-box` enforced for containment). |
| `height` | `sap.ui.core.CSSSize` | `"auto"` | Explicit CSS height of the host container (`"auto"` by default so embedded hosts size to their content). |

---

## Events (Metadata)

### `beforeSubmit`
Fired immediately before the validation pipeline triggers. Allows you to inject custom pre-flight logic or abort the submission process.
- **Parameters**: 
  - `payload` (object): The clean, sanitized data object extracted from the state manager.
  - `addError` (function): Callback to inject custom validation failures (`addError(fieldPath, message)`).
  - `preventDefault` (function): Callback to abort the submission entirely.

### `submit`
Fired after the validation pipeline passes successfully.
- **Parameters**: 
  - `payload` (object): The validated data object.
  - `payloadJson` (string): The stringified JSON version of the validated payload.

### `cancel`
Fired when a user explicitly cancels a form via the `sap.m.Dialog` (via the `openInDialog` API).

### `fieldChange`
Fired every time an individual field value is mutated by the user, regardless of whether `liveUpdate` is active or not.
- **Parameters**:
  - `fieldPath` (string): The schema path of the modified field (e.g., `CustomerName` or `General/CustomerName`).
  - `value` (any): The newly typed value of the field.
  - `payload` (object): The complete copy of the sandbox data state.
  - `isValid` (boolean): Whether the specific field currently passes its local schema validation rules.

### `validationStateChanged`
Fired when the global validity of the entire form changes.
- **Parameters**:
  - `isValid` (boolean): The current overarching state of the form layout.

### `validationError`
Fired discretely when a specific field fails validation.
- **Parameters**:
  - `fieldPath` (string): The schema path of the invalid field.
  - `message` (string): The error string describing the violation.

### `validationSuccess`
Fired discretely when a specific field passes validation.
- **Parameters**:
  - `fieldPath` (string): The schema path of the valid field.

### `error`
Fired when a catastrophic failure occurs during layout generation (e.g., duplicate IDs, unparseable schemas, unregistered plugin types, or remote fetch failures).
- **Parameters**:
  - `message` (string): Human-readable error description.
  - `exception` (object): The raw JavaScript Error object.

### `beforeLayoutSectionChange`
Fired by `WizardLayout` immediately when the user presses the "Next Step" button, **before** the layout physically transitions to the next step. Provides a structured hook for consumers to perform per-step validation — including asynchronous backend checks — and optionally block or resume the navigation.

> **Important:** With the modern MetaUI custom Wizard architecture, navigation is paused. Calling `preventDefault()` will immediately block the transition. If you are doing an async backend check, you must call `preventDefault()` synchronously during the event, and then call `resumeNavigation()` inside your Promise `.then()` to physically advance the Wizard once validation passes.

- **Parameters**:
  - `stepIndex` (int): The **0-based index** of the step the user is navigating **away from** (the source step).
  - `currentSectionIndex` (int): Alias for `stepIndex` (0-based index of the current wizard step).
  - `newSectionIndex` (int): The **0-based index** of the target wizard step being navigated to (`currentSectionIndex + 1`).
  - `payload` (object): A live snapshot of the full form payload at the moment of transition.
  - `preventDefault` (function): Blocks navigation synchronously. Call this immediately if you need to wait for an async backend check.
  - `addError` (function(fieldPath: string, errorMessage: string)): Blocks navigation **and** paints the specified field with an error state (and pushes to MessageManager if active). Use for async backend validation failures.
  - `resumeNavigation` (function): Explicitly allows navigation after a prior `preventDefault()` call. Intended for async consumer patterns (e.g., backend validation Promises). Calling this causes the wizard to advance to the next step immediately.

**Example — async backend check:**
```javascript
onBeforeLayoutSectionChange: function(oEvent) {
    var oParams = oEvent.getParameters();
    oParams.preventDefault(); // Block navigation immediately pending the async check
    myBackendService.validate(oParams.payload).then(function(result) {
        if (result.isValid) {
            oParams.resumeNavigation(); // Explicitly advances to the next step
        } else {
            oParams.addError("/Applicant/FirstName", result.errorMessage);
        }
    });
}
```

---

## Public Methods

| Method | Returns | Description |
| :--- | :--- | :--- |
| `setBindingContext(oContext: sap.ui.model.Context \| null \| undefined, sModelName?: string)` | `this` | Overridden to intercept OData V4 contexts and automatically initialize the `ODataDelegate`. |
| `bindObject(vPath: string \| { path: string; model?: string }, mParameters?: object)` | `this` | Overridden to bind the object context and attach an OData change listener. |
| `bindElement(vPath: string \| { path: string; model?: string }, mParameters?: object)` | `this` | Overridden to attach change listeners to Element bindings for OData synchronization. |
| `onBeforeRendering()` | `void` | Natively delegates properties to the internal `GeneratorHost` and boots the rendering engine. |
| `getBaseProperty(propertyName: string)` | `unknown` | Reads a property directly from the base UI5 control without inner-host interception. |
| `setBaseProperty(propertyName: string, value: unknown, suppressInvalidate?: boolean)` | `this` | Writes a property directly to the base UI5 control without inner-host forwarding. |
| `forwardResolvedSchemaToInnerHost(resolvedSchema: unknown)` | `void` | Forwards a resolved remote schema object to the inner `GeneratorHost` if already spawned. |
| `setProperty(propertyName: string, value: unknown, suppressInvalidate?: boolean)` | `this` | Transparent proxy. Routes manual property updates dynamically down to the spawned internal host. |
| `getProperty(propertyName: string)` | `unknown` | Transparent proxy. Automatically extracts the freshest inner data (e.g., intercepts calls to `getProperty("outputData")`, `getProperty("data")`, `getProperty("dataJson")`, and `getProperty("isValid")` and routes them to the inner host). |
| `generate()` | `Promise<void>` | Asynchronously preloads required plugins and generates the layout into the host aggregation. |
| `openInDialog(title?: string, submitButtonText?: string, cancelButtonText?: string, dialogWidth?: string, parentView?: Control)` | `Promise<void>` | Mounts the host inside a native `sap.m.Dialog` popup and resolves when the dialog closes. The `submitButtonText` triggers the validation/submit pipeline when clicked. |
| `triggerSubmit()` | `boolean` | Manually fires the validation and extraction pipeline. Returns `true` if validation passes, otherwise `false`. |
| `addCustomError(fieldPath: string, message: string)` | `void` | Manually applies a visual error state to a specific field and blocks form submission. |
| `clearCustomError(fieldPath: string)` | `void` | Clears a custom error message from a specific field. |
| `attachSubmit(fnFunction: (oEvent: Event) => void, oListener?: object)` | `this` | Attaches an event handler to the `submit` event. |
| `setSchemaDefinitions(definitions: Record<string, ISchema>)` | `this` | Sets the global `$ref` schema definitions dictionary on the host and inner host. |
| `getSchemaDefinitions()` | `Record<string, ISchema> \| undefined` | Retrieves the normalized `$ref` schema definitions dictionary from the inner host. |
| `getSchemaDefinition(refPath: string)` | `ISchema \| undefined` | Resolves a single `$ref` definition from the inner host. |
| `getStateManager()` | `StateManager \| null` | Proxies access to the active `StateManager` instance on the inner host. |
| `getDebugDomMetadata()` | `unknown` | Proxies access to the diagnostic DOM metadata tree from the inner host when `debugMode="true"`. |

---

## Library-Level Configuration

These are static entry points on library modules rather than on `DynamicHost`. They apply to every host in the page and are intended to be called once during application startup, before the first host renders.

### Extension registration (`PluginRegistry`, `GlobalPipeline`)

The signatures for registering custom plugins, layouts, validators, formatters and policy operators. [CreatingPlugins.md](CreatingPlugins.md) is the guide; this is the index. Every one of these is a global mutation that affects every host on the page, and a host that has already generated its layout is unaffected by a later call — so register from a UI5 component's `init` hook, before the first host renders.

| Entry point | Returns | Description |
| :--- | :--- | :--- |
| `PluginRegistry.getInstance()` | `PluginRegistry` | The process-wide singleton. A `DynamicHost` can be given its own isolated instance through the `pluginRegistry` property instead. |
| `registerPluginPath(type: FieldType, widgetName: string \| undefined, path: string)` | `void` | Maps a `(type, widget)` pair to a control plugin's UI5 AMD module path. Passing `undefined` for `widgetName` replaces the default plugin for that schema type. |
| `registerLayoutPath(strategy: string, path: string)` | `void` | Maps a `layoutStrategy` value to a layout module path. The built-in names are `form`, `table`, `wizard` and `compact`. |
| `registerActionPath(actionName: string, path: string)` | `void` | Records an action module path, readable with `getActionPath()` / `getActionPlugin()`. **No engine code path resolves a plugin through this index while rendering**; register action buttons with `registerPluginPath` and a widget name. |
| `registerPolicyConditionPath(conditionKey: string, path: string)` | `void` | Maps a `uiPolicies` condition operator to a module path. |
| `registerPolicyEffectPath(effectName: string, path: string)` | `void` | Maps a `uiPolicies` effect to a module path. |
| `GlobalPipeline.validators` | `Registry<IValidator>` | `register(name, validator)` adds a synchronous validator. `IValidator.validate` returns `IValidationResult`; it is not awaited. |
| `GlobalPipeline.formatters` | `Registry<IFormatter>` | `register(name, formatter)` adds a display formatter selected by `ui.formatter` / `ui.formatters`. |
| `GlobalPipeline.parsers` | `Registry<IParser>` | `register(name, parser)` makes a formatter reversible, so user input is parsed back to the stored value. |

The `path` arguments are **UI5 AMD module paths** — slash-separated, no file extension, resolved by `sap.ui.require` against the application's resource roots — not filesystem paths.

Replacing an existing key is permitted and emits one log entry at level `WARNING` (`[MetaUI] FieldPluginIndex: Overwriting existing key 'boolean'.`), which UI5's default log level of `ERROR` discards. `PluginRegistry` exposes no `has()` and no key listing, so a key cannot be tested for availability beforehand.

#### TypeScript consumers

The published package's type declarations are ambient. They are only in scope when the package is named in `compilerOptions.types`:

```jsonc
{ "compilerOptions": { "types": ["@types/openui5", "@siliconst/metaui"] } }
```

Without that entry every `import … from "nz/co/siliconst/ui5/metaui/…"` fails with `TS2307`, and every inherited member fails with `TS2339`. `skipLibCheck` is not required.

### `UrlValidator` (`nz/co/siliconst/ui5/metaui/utils/UrlValidator`)

Governs where a **schema-supplied** endpoint is allowed to send a request — `ui.dataSource.url`, `valueHelp.url`, and a remote `schemaDefinition` URL.

| Method | Returns | Description |
| :--- | :--- | :--- |
| `UrlValidator.setDataSourceOriginPolicy(mode: DataSourceOriginMode, allowedOrigins?: readonly string[])` | `void` | Installs the cross-origin policy. `mode` is `"any"` (default), `"same-origin"` or `"allowlist"`. `allowedOrigins` is read only in `"allowlist"` mode; each entry is normalized to its origin, and an unparseable entry is dropped with a logged warning rather than widening the policy. Calling this also clears the record of which cross-origin hosts have already been warned about. |
| `UrlValidator.getDataSourceOriginPolicy()` | `{ mode: DataSourceOriginMode; origins: string[] }` | Reads back the active mode and the normalized allowlist. |
| `UrlValidator.isSafeDataSourceUrl(rawUrl: unknown)` | `boolean` | The check the datasource plugins and `SchemaProvider` run. Useful if a consumer wants to pre-flight a URL under the same rules. |

```javascript
sap.ui.require(["nz/co/siliconst/ui5/metaui/utils/UrlValidator"], function (UrlValidator) {
    // Rendering schemas this application did not author:
    UrlValidator.setDataSourceOriginPolicy("allowlist", ["https://api.example.com"]);
});
```

**Scheme validation is not configurable and is always on:** a data source URL must resolve to `http:` or `https:`, and protocol-relative (`//host/...`) or backslash-prefixed values are refused outright. `mode` governs only the cross-origin decision, and the default (`"any"`) permits cross-origin requests with a one-time warning per origin. See [Supported Features § Security Posture & Trust Model](SupportedFeatures.md) for the reasoning and the residual exposure.

### `Logger` (`nz/co/siliconst/ui5/metaui/utils/Logger`)

| Method | Returns | Description |
| :--- | :--- | :--- |
| `Logger.setDebugMode(enabled: boolean)` | `void` | Enables `debug` / `info` entries and diagnostic popups. `warn` and `error` are emitted unconditionally and are **not** suppressed when this is off — every security refusal described in `SupportedFeatures.md` is a `warn`. |
| `Logger.isDebugMode()` | `boolean` | Reads the current debug mode flag. |
