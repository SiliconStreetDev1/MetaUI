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

## 13. AI Documentation Audits
- **NEVER SUMMARIZE**: When auditing or writing documentation, you must never summarize or skip properties. You must systematically extract every single property from the source TypeScript interfaces and every single mapped widget from the PluginRegistry, and document them exhaustively line-by-line.
- **Mandatory Verification Artifact**: Every single time you modify or update the Wiki documentation, you must concurrently generate or update the `wiki_verification_results.md` artifact. This artifact must cross-reference every documented property, method, and event against the exact TypeScript source file lines (e.g., `interfaces/ISchema.ts:16`) to forensically prove 100% accuracy and prevent hallucination.

## 14. Library Utility Boundaries
- **Core vs Sandbox**: Any utility, parser, or extractor built for the test Sandbox that provides generic parsing, detection, or capability useful to external consumers (e.g. dynamic Swagger endpoint extractors) MUST be built as a TypeScript module within the core src/ library and exposed as a public API, rather than hidden inside the 	est/webapp/util/ sandbox.

## 15. Keep It Simple (Anti-Overengineering Rule)
- **No Massive Flattening Algorithms**: Do not overcomplicate recursive tree parsing or layout manipulation just because you assume a framework (like UI5) can't handle it. 
- **Basic Swaps Only**: When modifying a layout array, apply the simplest possible transformation (e.g., swapping a Control for a Group). Never write convoluted logic that destroys the original structure.

## 16. Test Sandbox Scenario Registration
- **Whitelist Check:** Whenever you create a new scenario file in TEST/webapp/mockData/scenarios/ and register it in index.json, you MUST also update the hardcoded whitelist array inside TEST/webapp/controller/ScenarioRunner.controller.js. If you fail to do this, the new scenario will silently fail to appear in the Playground.

## 17. Strict Instructions Adherence
- **Stop Doing What I Am Not Asking You To Do:** Never override or circumvent explicit user instructions. If the user asks for a goal or specific text, provide it immediately without side-tracking or performing unauthorized investigations.


## 18. No Hacky Workarounds or Shotgun Debugging
- **Stop Shotgun Fixing:** Never add redundant code (e.g. mindlessly assigning \	his.mainControl = this.control\ everywhere) just to force a bug fix to work. If you encounter a bug, trace the architectural root cause (e.g. UI5 property lifecycle vs binding parsing) instead of bypassing it with try-catch hacks or overriding core properties indiscriminately.
- **Respect Base Class Defaults:** If a base class provides a robust fallback (e.g. defaulting to \	his.control\ when \	his.mainControl\ is undefined), DO NOT explicitly override it unless absolutely structurally necessary (e.g. when wrapping in an \HBox\).
# #   1 9 .   S t r i c t   W i k i   &   A I   C h e a t   S h e e t   D o c u m e n t a t i o n  
 -   * * M a n d a t o r y   D o c u m e n t a t i o n : * *   A n y   n e w l y   i n t r o d u c e d   s y n t a x ,   s c h e m a   p r o p e r t i e s ,   o r   f r a m e w o r k   c a p a b i l i t i e s   m u s t   b e   f u l l y   d o c u m e n t e d   i n   t h e   W i k i   i m m e d i a t e l y .   N o   n e w   f e a t u r e   c a n   b e   c o n s i d e r e d   c o m p l e t e   w i t h o u t   u p d a t e d   d o c u m e n t a t i o n .  
 -   * * Z e r o - H a l l u c i n a t i o n   C h e a t   S h e e t : * *   A   d e d i c a t e d   \ A I _ S c h e m a _ C h e a t S h e e t . m d \   m u s t   b e   m a i n t a i n e d   a n d   s t r i c t l y   v e r i f i e d   a g a i n s t   \ I S c h e m a . t s \ .   A n y   A I   i n t e r a c t i n g   w i t h   M e t a U I   m u s t   u s e   t h i s   C h e a t   S h e e t   a s   t h e   a b s o l u t e   g r o u n d   t r u t h   t o   p r e v e n t   h a l l u c i n a t i o n   o f   n o n - e x i s t e n t   s c h e m a   p r o p e r t i e s .  
 
## 20. Typescript Compilation Cleanliness
- **No Inline JS Pollution:** NEVER compile TypeScript files inline without a designated outDir, and NEVER leave .js or .js.map files polluting the src folder. Always clean up temporary test scripts.

## 21. Test-Driven Maintenance (TDM)
- **Always Verify Changes:** Whenever an architectural change is made to the core engine, or a new plugin is added to the framework, the AI MUST concurrently generate a corresponding Unit Test (Tier 1) and/or update the relevant Sandbox JSON Mock Scenario (e.g. `kitchen_sink.json` for Tier 2/3). The AI must run the test suite to prove it works before concluding the task.

## 22. Rigorous E2E Testing
- **No Generic Checks:** AI must never write generic or hardcoded UI existence checks.
- **Exhaustive Coverage:** All E2E tests MUST dynamically load JSON mock datasets and assert exact value bindings via loops to guarantee exhaustive 100% coverage.

## 23. Rigorous Zero-Trust Testing Mandate
- **Banning lazy testing**: AI must never use `assert.ok(instance)` as a test.
- **Physical Sandbox**: Unit Tests must physically mount the control in a DOM sandbox using `sap.ui.qunit.utils.createAndAppendDiv`.
- **Dynamic Mutation**: E2E tests must be dynamically generated from the schema and rigorously mutate state to prove validation/policy reactivity across all binding variants and render targets.
- **The Double-Entry Rule**: Whenever a new plugin is added to `PluginRegistry.ts`, the AI MUST simultaneously add the mapping entry to the dictionary inside `TestOracle.js`.

## 24. Sunk Cost Component Fallacy
- **Do not hack native constraints**: If a native framework component (like `sap.m.Wizard`) fundamentally contradicts MetaUI's architectural constraints (e.g., requiring a specific physical ancestor like a NavContainer while MetaUI dynamically hosts in VBoxes), **DO NOT** attempt to hack the component's render modes, events, or typings. If it doesn't fit the zero-hacks architecture, discard the native component and build a custom composable element using base primitives (`VBox`, `HBox`, `SimpleForm`) that strictly adheres to the MetaUI design system.
