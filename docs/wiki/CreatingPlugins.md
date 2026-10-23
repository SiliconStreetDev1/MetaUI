# Creating Custom Plugins

MetaUI renders a form by looking up a plugin for every `(type, widget)` pair in your schema. You extend it by registering your own plugins, validators, formatters and layouts against that lookup.

There are five extension points. All five are registered the same way — once, at application start — and all five are covered here:

| Extension point | Registered with | Selected from the schema by |
| :--- | :--- | :--- |
| Control plugin (a field) | `PluginRegistry.registerPluginPath()` | `ui.widget` (or the bare `type` for a default) |
| Validator | `GlobalPipeline.validators` | `ui.validators`, or the plugin's own `extractRule` hook |
| Formatter / parser | `GlobalPipeline.formatters` / `GlobalPipeline.parsers` | `ui.formatter` or `ui.formatters` |
| Layout strategy | `PluginRegistry.registerLayoutPath()` | `layoutStrategy` on the root schema |
| Policy condition / effect | `PluginRegistry.registerPolicyConditionPath()` / `registerPolicyEffectPath()` | `uiPolicies` — see [PolicyBasedRulesEngine.md](PolicyBasedRulesEngine.md) |

Read [§1](#1-two-things-that-are-not-optional) before writing any code. Both items in it are things the compiler and the runtime will not tell you clearly, and both stop a first plugin dead.

---

## 1. Two things that are not optional

### 1.1 TypeScript will not resolve the package until you list it in `types`

The published package ships one roll-up declaration file that contains an ambient `declare module "nz/co/siliconst/ui5/metaui/…"` block for every module. Ambient declarations are only in scope when the package is in `compilerOptions.types`. Nothing else pulls them in — not the import, not `paths`, not `moduleResolution`.

```jsonc
// tsconfig.json — the "@siliconst/metaui" entry is the whole fix
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Node",
    "lib": ["ES2022", "DOM"],
    "strict": true,
    "noEmit": true,
    "types": ["@types/openui5", "@siliconst/metaui"]
  },
  "include": ["webapp/**/*.ts"]
}
```

Leave `"@siliconst/metaui"` out and you get `TS2307: Cannot find module 'nz/co/siliconst/ui5/metaui/plugins/controls/BasePlugin'` once per import — and then, because the unresolved base class carries no members, one `TS2339: Property 'initialize' does not exist on type 'MyCustomPlugin'` for every inherited member you touch. Measured on the first plugin in §2.1: two `TS2307`s and fourteen `TS2339`s, sixteen errors from one file. Every error points at your code; the cause is the tsconfig.

`skipLibCheck` is **not** required. The build repoints and absolutizes every specifier inside the shipped declarations, so they type-check on their own.

You do not need an import alias. Import by the full module path exactly as the library does internally:

```typescript
import { BasePlugin } from "nz/co/siliconst/ui5/metaui/plugins/controls/BasePlugin";
```

### 1.2 Whether your plugin loads depends on how many functions your module exports

This is the single thing most likely to cost you an afternoon. `PluginRegistry` requires your module through `sap.ui.require` and then has to find a constructor inside whatever the module returned. It accepts, in order:

1. the module value itself, if it is a function;
2. `.default`, if that is a function;
3. the first named export whose key ends in `Plugin` or `Layout`;
4. the only exported function, if there is exactly one.

Nothing else. The UI5 TypeScript transpiler turns `export class Foo` into `exports.Foo = Foo` and `export default class Foo` into the module's own return value, so the shape of the module is decided by how you write the exports:

| What you write | What the module becomes | Loads? |
| :--- | :--- | :--- |
| `export default class AddressLookup` | the class itself | yes (rule 1) |
| `export class AddressLookupPlugin` | `{ AddressLookupPlugin }` | yes (rule 3) |
| `export class AddressLookup` — and nothing else | `{ AddressLookup }` | yes (rule 4) |
| `export class AddressLookup` **plus** `export function normalizePostcode` | `{ AddressLookup, normalizePostcode }` | **no** |
| `export class AddressLookupPlugin` plus `export function normalizePostcode` | `{ AddressLookupPlugin, normalizePostcode }` | yes (rule 3) |

The fourth row is the trap. Adding one exported helper to a file that worked breaks it, and deleting the helper fixes it, with no change to the class. What you see is an error in the console —

```
[MetaUI PluginRegistry] Module my/app/plugins/AddressLookup loaded successfully but exported no valid constructor.
[MetaUI Engine] Failed to generate field at /Street - [MetaUI Plugin Instantiation] Plugin my/app/plugins/AddressLookup was not preloaded or has no constructor!
```

— and, in the form, the text `[Error generating field /Street]` where the field should be, plus a warning strip above the form. Every other field renders normally.

**Write every plugin and layout module with `export default`, and keep helpers in a separate module.** That satisfies rule 1 and is the only shape that cannot be broken by a later edit.

---

## 2. A plugin that works, end to end

Four files. Each one below compiles under the tsconfig in §1.1 and was rendered in a browser against the published package.

### 2.1 The plugin

```typescript
// webapp/plugins/MyCustomPlugin.ts
import { BasePlugin } from "nz/co/siliconst/ui5/metaui/plugins/controls/BasePlugin";
import { IPropertyMetadata } from "nz/co/siliconst/ui5/metaui/interfaces/ISchema";
import Control from "sap/ui/core/Control";
import Input from "sap/m/Input";
import Event from "sap/ui/base/Event";

export default class MyCustomPlugin extends BasePlugin {
    public static readonly layoutScore: number = 1;
    public static readonly isNativelyWide: boolean = false;

    public render(
        metadata: IPropertyMetadata,
        bindingPath: string,
        modelName: string = "meta",
        engineScopeId?: string,
        onChange?: (isValid: boolean, fieldKey?: string, errorMessage?: string, controlId?: string) => void
    ): Control {
        this.initialize(metadata, bindingPath, modelName, onChange);

        if (!this.isEditable) {
            return this.createDisplayText(engineScopeId, bindingPath);
        }

        this.control = new Input({
            id: this.generateStableId(engineScopeId, bindingPath),
            value: this.generateBindingInfo(bindingPath, modelName),
            placeholder: metadata.ui?.placeholder,
            change: (event: Event) => {
                this.notifyChange((event.getSource() as Control).getId());
            }
        });

        this.applyCommonDirectives(this.control, metadata, modelName);
        return this.control;
    }

    protected getValue(sourceControl?: Control): unknown {
        const target = (sourceControl ?? this.control) as Input | undefined;
        return target && typeof target.getValue === "function" ? target.getValue() : undefined;
    }

    protected applyState(): void {
        const input = this.control as Input | undefined;
        if (!input || !this.metadata || typeof input.setEditable !== "function") {
            return;
        }
        input.setEditable(this.isControlEditable());
        input.setRequired(this.isRequired());
    }
}
```

Seven things in that file are load-bearing:

- **`export default`** — see §1.2.
- **`extends BasePlugin`** implies three abstract members. An empty subclass does not compile: `TS2654: Non-abstract class 'MyCustomPlugin' is missing implementations for the following members of 'BasePlugin': 'render', 'getValue', 'applyState'`.
- **`initialize(...)` first.** It populates `metadata`, `bindingPath`, `fieldKey`, `modelName` and `onChange`. Until it runs, `validate()` sees no metadata and reports the field valid — including a field that then fails to render (see [§9](#9-what-happens-when-your-plugin-fails)).
- **`generateStableId(...)`** keeps control IDs deterministic and collision-free across multiple hosts on one page. Pass it the `engineScopeId` you were handed.
- **`generateBindingInfo(...)`** rather than a hand-written `"{meta>/Path}"` string. It is what applies `ui.formatter` / `ui.formatters`; a raw binding string silently skips the formatter pipeline ([§7](#7-custom-formatters-and-parsers)).
- **`notifyChange(controlId)`** runs validation, paints the value state and reports upward. Passing the event source's ID is what makes the plugin work inside a table row, where the live control is a clone of the template rather than `this.control`.
- **`applyCommonDirectives(...)` last.** It applies `readOnly`, `visible`, `visibleOn`, `enabled`, `enabledOn`, `valueState`, `controlProps`, the tooltip and the accessible name. Skip it and the schema directives in that list are silently ignored for your widget — verified: a plugin without it renders `ui.visible: false` as a visible control and `ui.enabled: false` as an enabled one.

### 2.2 Register it

Registration is global and takes a UI5 AMD module path.

```typescript
// webapp/Component.ts
import UIComponent from "sap/ui/core/UIComponent";
import { PluginRegistry } from "nz/co/siliconst/ui5/metaui/core/PluginRegistry";

export default class Component extends UIComponent {
    public static metadata = { manifest: "json" };

    public init(): void {
        super.init();
        PluginRegistry.getInstance().registerPluginPath(
            "string",                                  // schema type
            "myCustomWidget",                          // ui.widget value that selects it
            "demo/metaui/consumer/plugins/MyCustomPlugin" // UI5 module path
        );
    }
}
```

The third argument is **a UI5 AMD module path, not a file path**: slash-separated, no `.ts`/`.js` extension, resolved by `sap.ui.require` against the application's resource roots. For an application whose namespace is `demo.metaui.consumer`, the file `webapp/plugins/MyCustomPlugin.ts` is the module `demo/metaui/consumer/plugins/MyCustomPlugin`. If the path does not resolve you get a 404 in the network panel and the same `[Error generating field …]` placeholder as a bad export shape.

**Register before the first host renders.** A UI5 component's `init` hook runs before any view is instantiated, which is why it is the right place. The registry is a process-wide singleton and a later registration is not an error — but a host that has already generated its layout keeps whatever it resolved at the time. A host rendered before the registration falls back to the default plugin for the schema type and logs

```
[MetaUI PluginRegistry] Unregistered widget 'myCustomWidget' for type 'string'; falling back to default 'string' plugin. (Reported once per registry.)
```

at UI5 log level `WARNING`, which is **below the default level** — so at default settings the form just quietly renders the wrong control. See [§9.4](#94-making-the-diagnostics-visible).

### 2.3 Use it from the schema

```json
{
  "type": "object",
  "properties": {
    "Code": {
      "type": "string",
      "ui": { "widget": "myCustomWidget", "label": "Code", "placeholder": "type here" }
    }
  }
}
```

### 2.4 What you should see

A `sap.m.Input` carrying the bound value and the placeholder, with the control ID `<engineScopeId>-Code`. If instead you see `[Error generating field /Code]` and a warning strip, go back to §1.2 and §2.2 — those two account for nearly every first-attempt failure.

---

## 3. What `BasePlugin` gives you

`BasePlugin` extends `PluginStateBase`. Between them they provide the state, the lifecycle and the helpers below. All of it is `protected` unless noted.

### 3.1 Protected state

| Member | Type | Meaning |
| :--- | :--- | :--- |
| `control` | `Control \| undefined` | The outer control you created and returned from `render()`. |
| `mainControl` | `Control \| undefined` | The inner interactive control, when `control` is a wrapper such as a `VBox`. Validation state, `labelFor`, editability and the accessible name all target `mainControl ?? control`. |
| `associatedLabel` | `Label \| undefined` | The companion `sap.m.Label`, linked by `setAssociatedLabel()`. |
| `metadata` | `IPropertyMetadata \| undefined` | The field's schema node. Set by `initialize()`; replaced by the policy engine through `onStateChange()`. |
| `bindingPath` | `string \| undefined` | The path passed to `render()`, e.g. `/CustomerName`. |
| `fieldKey` | `string \| undefined` | The same path without the leading slash. |
| `modelName` | `string` | The JSONModel alias for absolute bindings. Defaults to `meta`; the host usually passes its own. |
| `isEditable` | `boolean` | The host's edit mode, injected by `setEditable()` before `render()` runs. |
| `onChange` | callback | The engine's change listener. Set by `initialize()`; you normally reach it through `notifyChange()`. |
| `engineContext` | `IPluginEngineContext \| undefined` | `$ref` resolution, the active model, the submit hook and the validation-ledger callbacks. |
| `invalidParsePaths` | `Map<string, string>` | Per-path widget-level parse errors. Entries here short-circuit `validate()` and suppress the model write. |

### 3.2 The three members you must implement

| Member | Called by | Must do |
| :--- | :--- | :--- |
| `render(metadata, bindingPath, modelName?, engineScopeId?, onChange?, model?)` | `Engine.generateField()` | Create, bind and return the control. |
| `getValue(sourceControl?)` | `BasePlugin.validate()` and `BasePlugin.notifyChange()` | Return the raw current value from the control. Honour `sourceControl` when given — it is the table-row clone, not `this.control`. |
| `applyState()` | `updateMetadata()`, `applyEditable()`, `applyRequired()`, `setState()` | Push the current `metadata` onto the live control. |

`getValue()` is **not** called by `StateManager` — `StateManager` contains no call to it at all. Its only two callers in the library are `BasePlugin.validate()` and `BasePlugin.notifyChange()`. The payload reaches the model through UI5 two-way binding on the binding you created in `render()`; `getValue()` exists so the validation pipeline and the change notification can read the control's live, pre-binding-commit value.

Measured consequence: a plugin that binds through `generateBindingInfo()` and returns `null` from `getValue()` still contributes the typed value to the extracted payload. The two jobs are separate — `getValue()` decides what gets *validated*, the binding decides what gets *stored*. An action plugin that stores nothing returns `null` here and overrides `validate()` as well, so it neither validates nor blocks.

### 3.3 Lifecycle and helpers

| Member | Notes |
| :--- | :--- |
| `initialize(metadata, bindingPath, modelName?, onChange?)` | First statement of `render()`. |
| `generateStableId(engineScopeId, bindingPath)` | Deterministic control ID. Returns `undefined` when `engineScopeId` is absent, which is correct for table-row templates. |
| `generateBindingInfo(bindingPath, modelName?, type?, additionalOptions?)` | Builds the binding and wires in the formatter chain. |
| `applyCommonDirectives(control, metadata, modelName?)` | See §2.1. Entries that fail validation — an unknown `controlProps` key, an unparseable `visibleOn` — are logged and skipped, so the control still renders. |
| `notifyChange(controlId?)` | Commits the parsed value, validates, paints and reports upward. |
| `validate(sourceControl?)` | Runs the pipeline. Returns valid for a hidden control and for a plugin whose `metadata` was never set; returns **invalid** for a plugin that has metadata but no control. |
| `commitValue(sourceControl, value)` | Writes a value to the resolved absolute path, resolving the model from the control or from the engine context. Use it for any imperative write — a control that is not yet in the host's tree has no local model of its own. |
| `createDisplayText(engineScopeId, bindingPath, bindingInfo?)` | The read-only `sap.m.Text` rendering. Assigns `this.control` and returns it. |
| `resolveAbsolutePath(control?)` | Absolute model path, accounting for table-row binding contexts. |
| `isControlEditable()` | `isEditable && !metadata.readOnly && !metadata.ui.readOnly && metadata.ui.enabled !== false`. |
| `isRequired()` | Handles both `required: boolean` and the JSON Schema `required: string[]` form. |
| `isVisible()` | The outer control's visibility. A hidden control does not block submission. |
| `isAffordanceEnabled()` | `metadata.ui.enabled !== false`. Used with the flag in §3.5. |
| `setAssociatedLabel(label)` | Links the companion label so `required` and `visible` stay in step. |
| `setVisualValidationState(isValid, errorMessage?)` | `ValueState.Error` / `ValueState.None`, or `ButtonType.Reject` on a `sap.m.Button`. |
| `setState(property, value, message?)` | Runtime update of `visible`, `editable`, `required` or `valid`; calls `applyState()`. |
| `onStateChange(newMetadata)` | The policy engine's entry point. Replaces `metadata`, then calls `applyState()` and `validate()`. |
| `openNestedEditorDialog(options)` | Opens a nested modal host and tracks it for destruction. |
| `destroy()` | Destroys the control, any nested hosts and the accessibility helper texts. Override it — and call `super.destroy()` — if you own extra models or controls. |
| `getParseError(sourceControl?)` | Override to report a widget-level parse failure before the schema validators run. |
| `resolveAccessibleNameTargets(control)` | Override when the control that takes focus is not `mainControl ?? control`. |

### 3.4 Static contracts

Both are read off the class, not the instance, so declare them `static`.

- `public static layoutScore: number` (default `1`) — the field's layout weight, used by `LayoutScorer` to decide whether a nested schema renders inline or overflows into a dialog.
- `public static isNativelyWide: boolean` (default `false`) — `true` makes the form give the control the full 12-column width instead of placing it beside its label. Appropriate for editors like `TextArea` or `CodeEditor`.

### 3.5 `isNavigationAffordance`

```typescript
protected override readonly isNavigationAffordance: boolean = true;
```

Set it only on a control whose job is to *reach* something rather than to edit it — a link, a dialog trigger, a URL button. `applyCommonDirectives` disables any control that has no `editable` property when the host is read-only, which for a trigger hides the content behind a dead widget instead of protecting it. With the flag set, the control stays enabled in display mode and under `ui.readOnly`; only an explicit `ui.enabled: false` switches it off, and `ui.enabledOn` still wins. Leave it `false` for anything that mutates state — the built-in submit and clear buttons deliberately do.

---

## 4. Registering: the full set of entry points

```typescript
const registry = PluginRegistry.getInstance();

registry.registerPluginPath("string", "myCustomWidget", "demo/metaui/consumer/plugins/MyCustomPlugin");
registry.registerPluginPath("string", undefined, "demo/metaui/consumer/plugins/MyCustomPlugin"); // replaces the default
registry.registerLayoutPath("accordion", "demo/metaui/consumer/layouts/AccordionLayout");
registry.registerPolicyConditionPath("StringContains", "demo/metaui/consumer/policies/StringContainsCondition");
registry.registerPolicyEffectPath("Highlight", "demo/metaui/consumer/policies/HighlightEffect");
```

`registerActionPath()` and its readers `getActionPath()` / `getActionPlugin()` also exist, but **no code path in the engine calls them** — nothing resolves a plugin through the action index while rendering a form. Register action buttons with `registerPluginPath` and a widget name, which is what the built-in action plugins do. See [§5](#5-action-plugins).

### 4.1 Replacing a built-in

Passing `undefined` as the widget name registers the default plugin for a schema type, replacing the built-in for every form on the page:

```typescript
registry.registerPluginPath("boolean", undefined, "demo/metaui/consumer/plugins/MyCustomPlugin");
```

This works, and it is reported once per replaced key, at **error** level:

```
[MetaUI] FieldPluginIndex: Overwriting existing key 'boolean'.
[MetaUI] LayoutIndex: Overwriting existing key 'form'.
```

Error level is deliberate rather than cosmetic: UI5's default log level is `ERROR`, so a `warning` is discarded before it is even buffered, and replacing a built-in for an entire application used to produce no observable output at all in a default-configured app. You will now see these without changing any logging configuration.

Nothing throws, though, and nothing is returned, so the log line is the only signal — **there is no way to ask first**. `PluginRegistry` exposes no `has()` and no key listing. Its indices are private, and its only public surface is the five `register…Path` methods plus `getPlugin`, `getLayout`, `getActionPath`, `getActionPlugin`, `getPluginScore`, `isPluginNativelyWide`, `getPathsToLoad`, `preloadDependencies` and the two policy getters.

In practice: prefer a new widget name over replacing a default, and keep every registration in one function so the whole set is reviewable in one place.

---

## 5. Action plugins

An action plugin is an ordinary `BasePlugin` that renders a `sap.m.Button`, returns `null` from `getValue()` and overrides `validate()` so it never blocks submission.

```typescript
// webapp/plugins/MyActionPlugin.ts
import { BasePlugin } from "nz/co/siliconst/ui5/metaui/plugins/controls/BasePlugin";
import { IPropertyMetadata } from "nz/co/siliconst/ui5/metaui/interfaces/ISchema";
import Control from "sap/ui/core/Control";
import Button from "sap/m/Button";
import MessageToast from "sap/m/MessageToast";

export default class MyActionPlugin extends BasePlugin {
    // This button only opens something; it mutates nothing. Omit this line for a button
    // that changes state, so a read-only host disables it.
    protected override readonly isNavigationAffordance: boolean = true;

    public render(
        metadata: IPropertyMetadata,
        bindingPath: string,
        modelName: string = "meta",
        engineScopeId?: string,
        onChange?: (isValid: boolean, fieldKey?: string, errorMessage?: string, controlId?: string) => void
    ): Control {
        this.initialize(metadata, bindingPath, modelName, onChange);

        this.control = new Button({
            id: this.generateStableId(engineScopeId, bindingPath),
            text: metadata.ui?.label || "Execute",
            icon: "sap-icon://action",
            enabled: this.isAffordanceEnabled(),
            press: () => {
                MessageToast.show(`Action fired for ${this.fieldKey}`);
            }
        });

        this.applyCommonDirectives(this.control, metadata, modelName);
        return this.control;
    }

    public override validate(): { isValid: boolean; errorMessage?: string } {
        return { isValid: true };
    }

    protected getValue(): unknown {
        return null;
    }

    protected applyState(): void {
        const button = this.control as Button | undefined;
        if (button && this.metadata && !this.metadata.ui?.enabledOn) {
            button.setEnabled(this.isAffordanceEnabled());
        }
    }
}
```

```json
"triggerMyAction": {
  "type": "string",
  "ui": { "widget": "myCustomAction", "label": "Click Me", "args": "My Custom Parameter" }
}
```

Read custom parameters off `metadata.ui.args` (any shape) or `metadata.ui.options` (a string-keyed record).

### 5.1 The two ways a button goes wrong

A `sap.m.Button` has no `editable` property, only `enabled`. That one fact drives both failure modes. Measured, for three otherwise identical buttons in an `editable="false"` host:

| Button | `ui.visible: false` honoured | `ui.enabled: false` honoured | Enabled in a read-only host |
| :--- | :--- | :--- | :--- |
| No `applyCommonDirectives` | **no** — stays visible | **no** — stays enabled | yes |
| `applyCommonDirectives`, no affordance flag | yes | yes | **no** — disabled |
| `applyCommonDirectives` + `isNavigationAffordance` | yes | yes | yes |

Omitting `applyCommonDirectives` does not merely cost you the read-only behaviour: it drops `visible`, `visibleOn`, `enabled`, `enabledOn`, `valueState`, `controlProps`, the tooltip and the accessible name for that widget, with no diagnostic at all. Always call it. Then choose the flag deliberately: set it for a button that only navigates or opens, leave it off for a button that submits, clears or otherwise writes.

---

## 6. Custom validators

### 6.1 `IValidator.validate` is synchronous

```typescript
validate(parsedValue: unknown, args?: unknown): IValidationResult;
```

`IValidationResult` is `{ isValid: boolean; errorMessage?: string }`. There is no asynchronous validator contract, and the pipeline does not await anything.

**Returning a `Promise` does not fail loudly — it fails invisibly.** A promise is a truthy object whose `isValid` property is `undefined`, so `executeValidation` reads it as falsy and returns the promise itself as the result. Measured against a validator that resolves to `{ isValid: true }` for every input: the field is painted `ValueState.Error` with the generic text `Invalid input`, `triggerSubmit()` returns `false`, and the form can never be submitted. There is no message because the promise has no `errorMessage` either.

Do asynchronous checks where the framework supports them instead:

- per field, from your own plugin, writing the outcome through `getParseError()` or `setVisualValidationState()`;
- at submit time, in the `beforeSubmit` event, using its `preventDefault()` and `addError()` callbacks;
- per wizard step, in `beforeLayoutSectionChange`, using `preventDefault()` and `resumeNavigation()`.

All three are described in [APIReference.md](APIReference.md).

### 6.2 A validator that works

```typescript
import { GlobalPipeline } from "nz/co/siliconst/ui5/metaui/core/PipelineManager";
import { IValidationResult } from "nz/co/siliconst/ui5/metaui/interfaces/IPipeline";

GlobalPipeline.validators.register("forbiddenWord", {
    validate: (parsedValue: unknown, args?: unknown): IValidationResult => {
        const banned = (args as { word?: string } | undefined)?.word ?? "invalid";
        return String(parsedValue) === banned
            ? { isValid: false, errorMessage: `'${banned}' is not allowed here.` }
            : { isValid: true };
    }
});
```

```json
"specialField": {
  "type": "string",
  "ui": { "validators": ["required", { "name": "forbiddenWord", "args": { "word": "invalid" } }] }
}
```

An entry in `ui.validators` is either a bare name or `{ name, args }`. `args` is handed to `validate()` unchanged.

### 6.3 Self-activating validators

Implement the optional `extractRule` hook and the validator decides for itself, per field, whether it applies — no `ui.validators` entry needed. This is how the built-in constraint validators (`maxLength`, `pattern`, `range`, …) attach themselves.

```typescript
import { GlobalPipeline } from "nz/co/siliconst/ui5/metaui/core/PipelineManager";
import { IValidationResult } from "nz/co/siliconst/ui5/metaui/interfaces/IPipeline";
import { IPropertyMetadata } from "nz/co/siliconst/ui5/metaui/interfaces/ISchema";

GlobalPipeline.validators.register("evenNumber", {
    validate: (parsedValue: unknown): IValidationResult => {
        const n = Number(parsedValue);
        return Number.isFinite(n) && n % 2 === 0
            ? { isValid: true }
            : { isValid: false, errorMessage: "Value must be an even number." };
    },
    extractRule: (propMeta: IPropertyMetadata) => ({ active: propMeta.ui?.widget === "evenOnly" })
});
```

`extractRule` may also return `args`, which is merged into the argument map for that field.

### 6.4 The pipeline fails closed

Both of these produce an invalid field rather than a skipped check — verified:

| Situation | Result |
| :--- | :--- |
| `ui.validators` names a validator that is not registered | `{ isValid: false, errorMessage: "Schema configuration error: Requested validator 'forbiddenWurd' is not registered." }` |
| A registered validator throws | `{ isValid: false, errorMessage: "System validation error: <the thrown message>" }`, plus a logged error |

So a typo in a validator name is visible in the form, not silently permissive.

One ordering rule worth knowing: an empty value short-circuits to valid unless the field is `required`, or an array/object rule is active. Your validator is not called for an empty optional field.

---

## 7. Custom formatters and parsers

A **formatter** turns the stored value into what the user sees. A **parser** turns what the user typed back into what gets stored. A formatter that also implements `parse` is *presentational* (reversible), and `BasePlugin` will round-trip through it on every change. A formatter without `parse` — like the built-in `textCase` — is *transforming*: its output is written to the model as-is.

```typescript
import { GlobalPipeline } from "nz/co/siliconst/ui5/metaui/core/PipelineManager";
import { IFormatter, IParser } from "nz/co/siliconst/ui5/metaui/interfaces/IPipeline";

const skuFormatter: IFormatter & IParser = {
    format: (rawValue: unknown): string => {
        const digits = String(rawValue ?? "").replace(/[^0-9]/g, "");
        return digits.length === 8 ? `${digits.slice(0, 4)}-${digits.slice(4)}` : String(rawValue ?? "");
    },
    parse: (uiValue: unknown): unknown => String(uiValue ?? "").replace(/[^0-9]/g, "")
};

GlobalPipeline.formatters.register("sku", skuFormatter);
GlobalPipeline.parsers.register("sku", skuFormatter);
```

Two notes on the types:

- `GlobalPipeline.formatters` is typed `Registry<IFormatter>`, and `IFormatter` has no `parse`. Passing an object **literal** with a `parse` member is rejected by TypeScript's excess-property check (`TS2353`). Declare it as `IFormatter & IParser` in a variable first, as above.
- Registering the same object in both registries is the idiom the built-in date, phone and currency formatters use, and it is the clearest. The pipeline will also accept a formatter that merely carries a `parse` method with no `parsers` entry, but the explicit second registration is what makes the intent readable.

```json
"ProductSku": {
  "type": "string",
  "ui": { "widget": "myCustomWidget", "formatter": "sku", "label": "SKU" }
}
```

`ui.formatters` takes an array and applies them left to right on display; parsing runs the chain in reverse.

**A formatter only reaches the control if the plugin built its binding with `generateBindingInfo()`.** A plugin that hard-codes `` value: `{${modelName}>${bindingPath}}` `` bypasses the formatter entirely and the directive appears to do nothing. All built-in plugins use the helper; yours should too.

Verified round trip: stored `"12345678"` displays as `1234-5678`, and typing `1234-5678` stores `"12345678"`.

---

## 8. Custom layouts

A layout strategy owns the whole container for a schema. It implements `ILayoutManager` — a single `render` method — and delegates each field back to the engine.

```typescript
// webapp/layouts/AccordionLayout.ts
import { ILayoutManager } from "nz/co/siliconst/ui5/metaui/interfaces/ILayoutManager";
import { ISchema } from "nz/co/siliconst/ui5/metaui/interfaces/ISchema";
import { Engine } from "nz/co/siliconst/ui5/metaui/core/Engine";
import Control from "sap/ui/core/Control";
import Panel from "sap/m/Panel";
import VBox from "sap/m/VBox";
import Label from "sap/m/Label";

export default class AccordionLayout implements ILayoutManager {
    public render(
        schema: ISchema,
        modelName: string,
        engine: Engine,
        onSubmit?: () => void,
        bindingPath?: string
    ): Control {
        void onSubmit;
        const prefix = bindingPath ? `${bindingPath}/` : "/";
        const container = new VBox({ width: "100%" });

        for (const key of Object.keys(schema.properties || {})) {
            const meta = (schema.properties || {})[key];
            const field = engine.generateField(meta, `${prefix}${key}`, modelName);
            const label = new Label({ text: meta.ui?.label || meta.title || key });
            container.addItem(
                new Panel({
                    headerText: meta.ui?.label || meta.title || key,
                    expandable: true,
                    expanded: true,
                    content: [label, field]
                })
            );
        }
        return container;
    }
}
```

```typescript
PluginRegistry.getInstance().registerLayoutPath("accordion", "demo/metaui/consumer/layouts/AccordionLayout");
```

```json
{ "type": "object", "layoutStrategy": "accordion", "properties": { "…": {} } }
```

Four things to know:

- `engine.generateField(metadata, bindingPath, modelName, isTemplate?)` is the only call you need to produce a field. It instantiates the plugin, injects the engine context, registers the instance for validation and returns the control. Pass `isTemplate: true` for a control you are using as a table-row template.
- `engine.generateLayout(schema, modelName, bindingPath?)` recurses into a nested object or array.
- The schema you receive is already normalized: `$ref`s are resolved and a `uiLayout` tree has been synthesized if the author did not supply one. Walk `schema.uiLayout` if you want to honour the author's grouping, or `schema.properties` if your layout imposes its own structure — the example above does the latter.
- The built-in strategy names are `form`, `table`, `wizard` and `compact`. Registering any of those names replaces that built-in globally; see §4.1.

The module export rule in §1.2 applies to layout modules too, with one extra affordance: a named export ending in `Layout` resolves even alongside other exported functions.

---

## 9. What happens when your plugin fails

Two rules hold across every failure mode below, and they are worth stating together because they pull in opposite directions:

- **Degradation is per field.** One broken plugin costs you that field and raises a form-level warning strip. Every other field renders and works.
- **A field that could not be validated blocks submission.** A field that never became a control has nothing to validate it, so the form reports `isValid: false` and `triggerSubmit()` returns `false` rather than sending a payload with that field unchecked. A `required` field that failed to render does not quietly submit empty.

The visible details differ by mode.

### 9.1 The module does not load, or exports no constructor

Covers a 404 on the module path and the export-shape mismatch in §1.2; both were measured and behave identically.

- The field renders the text `[Error generating field /Street]`.
- A `sap.m.MessageStrip` appears above the form: *"Layout partially rendered. Some fields failed to generate due to configuration errors."*
- **Every other field renders normally.** `preloadDependencies()` settles rather than rejecting: an unloadable module is reported and the remaining modules still load, so one bad path costs you one field, not the layout.
- The console carries `[MetaUI PluginRegistry] Module … loaded successfully but exported no valid constructor` (or `Failed to lazy load module: …`), then a summary line, then `[MetaUI Engine] Failed to generate field at /Street`.
- **The form reports `isValid: false` and `triggerSubmit()` returns `false`.** The Engine records the path through `ValidationLedger.reportFieldGenerationFailure()` from the `catch` itself, which is the only point both this and the throwing-`render()` case pass through: the plugin never reached the engine's active list, so iterating plugins cannot see it. Nothing validated that field, so the form refuses to submit rather than sending a payload with it unchecked. `validateAll()` names the path with the message *"Field '/Street' failed to render, so its value could not be validated."*

### 9.2 `render()` throws

- Same placeholder, same warning strip, same per-field containment.
- **Submission is blocked either way**, whether `render()` threw before or after `initialize()`. Both verified. The two take different routes: a throw after `initialize()` leaves a registered plugin with metadata and no control, which `validate()` already fails closed on; a throw before it leaves a plugin with no metadata at all, whose `validate()` returns valid, and that one is caught only by the generation-failure record described in §9.1.
- Call `initialize()` as the first statement of `render()` anyway, as §2.1 says — not for validity now, but because every helper on `BasePlugin` reads the state it sets.

### 9.3 A validator throws, or is not registered

The field alone fails, with a message. See §6.4.

### 9.4 Making the diagnostics visible

Every failure in §9.1 to §9.3 is emitted through `Logger.error()` and is visible at UI5's default log level. Some lesser diagnostics are not: an unregistered widget name falling back to the type default (§2.2), and a skipped `controlProps` entry, go through `Logger.warn()`, which writes a UI5 log entry at level `WARNING`. UI5's default log level is `ERROR`, so those are discarded rather than merely hidden. While developing an extension, raise the level so you see them:

```javascript
sap.ui.require(["sap/base/Log"], function (Log) {
    Log.setLevel(Log.Level.WARNING);
});
```

Separately, `debugMode="true"` on the host (or `Logger.setDebugMode(true)`) enables MetaUI's own `debug`/`info` entries and turns field and layout failures into a `sap.m.MessageBox` popup, which is hard to miss. Errors and warnings are emitted regardless of that flag — but a warning still has to clear the UI5 log level to be recorded.

---

## 10. Limits to know before you commit

### 10.1 There is no plugin API version

Nothing on `BasePlugin`, `PluginRegistry` or `GlobalPipeline` reports a plugin API revision, and nothing is negotiated at registration time. A plugin compiled against one release is loaded by any release that can resolve its module path; a mismatch surfaces as a runtime failure, not as a refusal to load. The library does publish its own version — `2.0.0`, readable at runtime from the UI5 library registry — but that is the package version, not an extension contract version.

Pin the package. Express the dependency as a caret range on `@siliconst/metaui` and treat a major bump as a release of your plugin. [APIReference.md](APIReference.md) sets out which exports carry a compatibility promise and which do not.

### 10.2 You cannot subclass a concrete built-in plugin from TypeScript if you need its `private` members

The repository's own two extension examples, `test/webapp/plugins/MockLiveSearchPlugin.js` and `test/webapp/plugins/MockRemoteValueHelpPlugin.js`, subclass `LiveSearchPlugin` and `RemoteValueHelpPlugin` and override `scheduleSearch` and `openValueHelpDialog`. Both of those members are declared `private`. The examples work only because they are plain JavaScript, where the keyword has no effect at runtime.

Write the same subclass in TypeScript and it does not compile:

```
error TS2415: Class 'MockLiveSearchPlugin' incorrectly extends base class 'LiveSearchPlugin'.
  Property 'scheduleSearch' is private in type 'LiveSearchPlugin' but not in type 'MockLiveSearchPlugin'.
```

Declaring your override `private` as well does not help — TypeScript then reports *"Types have separate declarations of a private property"*. There is no legal form. Overriding a `public` or `protected` member of a built-in does compile; it is only the `private` ones that are closed to TypeScript.

So: **extend `BasePlugin`, not a concrete built-in.** If you genuinely need a built-in's behaviour with one piece changed, copy the piece you need into your own `BasePlugin` subclass rather than inheriting it. Note also that the concrete plugin classes are internal — see the tier table in [APIReference.md](APIReference.md) — so their `protected` and `private` members may change in any release, including a patch.

### 10.3 You cannot ask the registry what is already registered

No `has()`, no key enumeration. §4.1 covers what this means in practice.

### 10.4 Validators and formatters are eager; control plugins are lazy

`GlobalPipeline` registers validators, formatters and parsers as live instances, immediately, because they run inside synchronous binding formatters and keystroke validation. Control plugins and layouts are registered as *module paths* and required on demand, which is why their registration takes a string rather than a class, and why a typo in that string is not caught until a schema asks for the widget.
