# Sandbox Reference Architecture

The internal MetaUI Sandbox (Playground) app serves as both a development testbed and a reference implementation for Fiori developers integrating MetaUI into their own apps. 

To ensure the Playground remains maintainable and acts as a clean best-practice guide, it strictly follows a modular, plugin-based architecture.

## 1. Scenario Helpers

The main `Playground.controller.js` does **not** contain massive `switch` statements to handle different test tiles (e.g. "Basic Form", "Double Bind", "Live String Binding").

Instead, the orchestration of how to bind the `GeneratorHost` to the test app's view model is abstracted into Scenario Helpers:
- `BaseScenarioHelper.js`: Handles the default unidirectional binding.
- `DoubleBindScenarioHelper.js`: Handles binding both `inputData` and `outputData` to the exact same shared property to demonstrate two-way synchronization.
- `StringBindingScenarioHelper.js`: Demonstrates parsing and binding raw JSON strings.

When a user clicks a tile, the Controller instantiates the correct Helper and calls `.bindHost()`, entirely decoupling the setup logic from the UI controller.

## 2. SnippetService

The code snippets displayed in the "Integration Examples" tab of the Sandbox are completely decoupled from the controller via the `SnippetService`.

`SnippetService.js` acts as a static repository for XML and JS snippets. It provides contextually relevant code examples based on the specific feature tile the user is currently interacting with, ensuring the reference documentation stays localized and manageable.
