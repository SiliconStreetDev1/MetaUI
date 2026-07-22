# MetaUI Rules

## Architectural Strictness
- **Persona Adherence**: Always read the `persona.md` file in the knowledge base before writing any code.
- **Strict Typing**: Never use the `any` type (or similar bypasses like `unknown`) to silence TypeScript errors. Always use and import the correct typings.
- **Zero-Hacks Architecture**: Strictly follow the MetaUI zero-hacks architecture and maintain rigorous architectural standards without workarounds.

## Core Architecture & Feature Memory
**CRITICAL: Do not remove, mock, or simplify any of the following features when refactoring. They are foundational to MetaUI.**

1. **Popup Dialog API & Configurable Buttons**
   - The engine relies on \DialogDelegate.ts\ to build native \sap.m.Dialog\ instances.
   - The \GeneratorHost\ and \DynamicHost\ expose an \openInDialog(title: string, submitButtonText: string)\ method. 
   - **Crucial Rule:** The \submitButtonText\ is fully configurable (e.g., passing 'Extract Payload', 'Save', 'OK'). It mounts to the \eginButton\ of the dialog and inherently triggers the \submit\ event when pressed.
   - **Testing Wrappers:** Sandbox controllers (like \BaseController.js\) must NEVER construct manual dialogs with hardcoded 'Close' buttons for the engine. They MUST delegate to \host.openInDialog()\ to preserve the configurable button functionality.

2. **The DynamicHost Facade**
   - \DynamicHost.ts\ is a wrapper facade that spawns either a \GeneratorHost\ or an \InferredGeneratorHost\ internally depending on inference mode.
   - **Crucial Rule:** \DynamicHost.ts\ MUST proxy all public programmatic APIs down to the inner host (e.g., \	riggerSubmit()\, \openInDialog()\, and \getProperty('outputData')\). If these proxies are dropped, extraction workflows will silently crash or return blank payloads.

3. **Data Extraction & Submit Pipelines**
   - Pressing the configurable popup submit button, or calling \.triggerSubmit()\, evaluates validation against the \SchemaValidator\.
   - On success, it reads \outputData\ from the internal \StateManager\ and fires the \submit\ event.
   - Parents listen to \submit\ (or attach via \.attachSubmit()\) to receive the \payload\ parameter.

4. **Live Update capabilities**
   - MetaUI hosts accept a \liveUpdate\ boolean property. If true, any field changes automatically extract data without requiring a manual submit button.
   - When modifying XML layouts (e.g., in a \Table\), do not hardcode \editable='false'\ on JSON source editors. They must support Live Editing two-way binding.

5. **Inference Mode**
   - \InferredGeneratorHost\ dynamically generates UI purely from \inputData\ (no schema needed). It leverages \SchemaNormalizer\ to hot-swap schemas without destroying the DOM.

## 6. Documentation Synchronization
- **CRITICAL RULE**: Whenever you make an architectural change, rename a property, or refactor a component, your final mandatory step MUST be to use grep_search across the 'docs/wiki/' folder. You must proactively find and update all stale code snippets, XML examples, and explanations to perfectly match your new code changes. Do not wait to be asked.

## 7. SAPUI5 Custom Library Deployment & Fact-Checking
- **Zero Hallucination Policy:** If asked about configuring SAPUI5 custom library paths for ABAP deployment or local servers, DO NOT GUESS. You must perform rigorous web checks (5+ times) to confirm ABAP deployment mechanics. If you cannot find absolute proof, you must explicitly tell the user "I DON'T KNOW". 
- **The App Index Truth:** For a custom library to load successfully on an ABAP server or Fiori Launchpad, you MUST NOT use `index.html` (it is ignored by Launchpad) and you MUST NOT rely on `resourceRoots` in the consuming app's `manifest.json` (it is ignored by the global UI5 core loader for external libraries).
- **404 Resource Fallback:** If the ABAP server throws a 404 searching for a custom library inside a `/resources/` folder, it means the **SAP UI5 App Index** does not know the library exists. 
- **The Fix:** Do not hack path strings to fix this. Fix the SAP App Index. The library must be deployed via standard tooling (`ui5-task-abapdeploy`) so its `manifest.json` is at the root of the BSP, and the ABAP program `/UI5/APP_INDEX_CALCULATE` must be executed to register it globally. Manual `SE38` uploads bury the manifest and break the index.

## 8. Refactoring Constraints
- **Data Preservation Rule:** Never delete or overwrite existing test scenarios or datasets during a UI refactor without explicitly migrating 100% of the underlying data.
- **NEVER DELETE FUNCTIONALITY (Absolute Rule):** Do not remove UI dropdowns, testing capabilities, or programmatic sandbox bridges just to "clean up" the code. The Playground is a comprehensive testing matrix that requires all combinations of Data Scenarios, Binding Engines, and Render Targets to exist simultaneously. When refactoring, you must preserve 100% of the testing functionality.

## 9. Data Binding & Extraction Sandbox
- **Tri-Binding Engine:** The `DynamicHost` accepts data via three native UI5 paths: `dataJson` (string), `data` (object), or automatically via OData context (`ODataDelegate`).
- **Live vs Transactional Modes:** The engine acts as a secure sandbox. By default (`liveUpdate = false`), it does **not** two-way bind outbound data to protect the parent model from unvalidated keystrokes. Data is only extracted when `triggerSubmit()` is called, which runs validation and fires the `submit` event with the clean payload. If `liveUpdate = true`, the engine explicitly breaks the sandbox and forcefully pushes unvalidated data back up into the two-way bindings continuously.

## 10. Core Framework Capabilities (DO NOT DEPRECATE)
The following are native features of the Engine that must remain fully supported:
- **Full & Hybrid Inference**: The ability to bind raw data payloads with no schema (Full Inference) or partial schemas via `additionalProperties: true` (Hybrid Inference) to dynamically generate UIs.
- **Strict Native Validation Pipeline**: Natively maps standard JSON Schema rules (`minLength`, `maxLength`, `pattern`, `minimum`, `maximum`) and `ui.format` strings (`email`, `url`, `iban`) directly to `sap.m.InputBase` error states without needing explicit UI validation blocks.
- **Custom Error API**: The programmatic ability for consumers to trigger `addCustomError` and `clearCustomError` asynchronously during `fieldChange` events to manually paint fields red for remote backend checks.
- **Declarative UI Orchestration**: Defining Fiori layouts via the `layoutStrategy` and `uiLayout` array elements (Group, Control, HorizontalLayout, WizardStep) to fully detach visual presentation from nested data structures.

## 11. Test Sandbox Capabilities (DO NOT SIMPLIFY)
The Playground Sandbox is an exhaustive matrix testing application. You must never simplify it or remove options. It must always test combinations of:
- **Data Scenarios**: Kitchen Sink, Hybrid Inference, Full Inference, Wizard Layout, Relational Arrays, Deep Structure.
- **Binding Modes**: `string` (JSON serialization), `object` (native JS references), and `odata` (Mocked OData v2/v4 bindings).
- **Render Targets**: `embedded` (XML Fragment declarative integration), `js_scratch` (Programmatic VBox instantiation), and `js_dialog` (Programmatic Popup).
- **Live Toggles**: Dynamic runtime toggling of `liveUpdate`, `editable`, `useMessageManager` (Popover), `forceCustomError`, and `debugMode`.

## 12. MessageManager & Validation Sandbox
- **Do Not Register Controls to MessageManager**: The MetaUI framework handles its own model validation via `StateManager`. NEVER register controls globally with `Messaging.registerObject(control)` in an attempt to make UI5 handle `valueState` natively. Doing so causes UI5's internal binding sync to aggressively delete our custom schema errors.
- **Manual Visual States**: Plugins must always handle their own `valueState` via `setValueState(Error)` manually.
