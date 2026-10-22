# MetaUI Documentation

Welcome to the official developer wiki for the **MetaUI Engine** (`nz.co.siliconst.ui5.metaui`).

## What is MetaUI?

MetaUI is a metadata-driven SAPUI5 layout generation engine designed specifically for edge cases where standard Fiori Element annotations cannot be used. It is **not** a replacement for Fiori Elements, but rather an assistive framework for scenarios involving highly dynamic JSON payloads or non-OData data structures. For these edge cases, it eliminates the need for developers to write static XML views or manually wire up repetitive form fields by dynamically instantiating native UI5 Fiori layouts based on declarative JSON schemas or raw inbound payloads.

## The Orchestrator Architecture

The core of the framework is built on a strict **Plugin-First** philosophy. 
- **The Engine**: The core class (`Engine.ts`) is merely an orchestrator. It does not parse schemas or build UI elements itself. It delegates responsibilities downward.
- **The SchemaNormalizer**: Automatically normalizes developer inputs or seamlessly infers layout metadata natively from data structures.
- **The PluginRegistry**: Maps field definitions to fully decoupled, standalone UI5 control plugins (e.g., `StringPlugin`, `DatePlugin`, `ObjectPlugin`). Plugins have zero knowledge of each other, ensuring the framework remains infinitely extensible.

---

## Table of Contents

1. [Getting Started](GettingStarted.md)
   - Installation & Setup
   - Declarative Usage (XML)
   - Programmatic Usage (JS/TS)
   - Dialog Popups (Basic Usage)
2. [Schemas & Data Inference](SchemasAndInference.md)
   - Defining a JSON Schema
   - Full Data Inference Mode
   - Supported Field Plugins
3. [OpenAPI Integration](OpenAPIIntegration.md)
   - Dynamic Target Extraction
   - OpenAPI v2 / v3 Parsing
   - Feature & Constraint Mapping
4. [Data Binding & State Management](DataBindingAndState.md)
   - The Tri-Binding Interface
   - The Validation Pipeline & State Management
   - Change Handling
5. [API Reference (DynamicHost)](APIReference.md)
   - Properties
   - Events
   - Methods
6. [Extensibility](CreatingPlugins.md)
   - Creating Custom Plugins
   - The BasePlugin Lifecycle
7. [Policy-Based Rules Engine (PBRE)](PolicyBasedRulesEngine.md)
   - Declarative Conditions (`NumericGreaterThan`, `NumericLessThan`, `StringEquals`, `DateLessThan`, `IsNull`, `IsNotNull`)
   - Symmetrical Effects (`Show`, `Hide`, `Require`, `Optional`, `Validate`, `Invalidate`, `Enable`, `Disable`)
8. [AI Instruction Manual & Schema Cheat Sheet](AI_Schema_CheatSheet.md)
   - Exhaustive Schema Dictionary & Widget Registry
9. [Testing Routines & Automated Verification](09_Testing_Routines_and_Automation.md)
   - `TestOracle.js`, QUnit Physical DOM Unit Tests, E2E Matrix, Sandbox Smoke Tests, and Standalone Consumer Verification
10. [Supported Features & Known Limitations](SupportedFeatures.md)
   - Complete Source-Derived Capability Inventory (`52` Widget Mappings, `14` Validators, `4` Formatters, `3` Parsers, `6` Policy Conditions, `8` Policy Effects) and Honest Known Limitations
