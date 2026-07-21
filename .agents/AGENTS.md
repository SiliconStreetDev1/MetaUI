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
