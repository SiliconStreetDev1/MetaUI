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
2. [Deployment](Deployment.md)
   - Route A: bundle MetaUI into your app
   - Route B: deploy MetaUI once as a shared BSP library
   - Local development
3. [Schemas & Data Inference](SchemasAndInference.md)
   - Defining a JSON Schema
   - Full Data Inference Mode
   - Supported Field Plugins
4. [OpenAPI Integration](OpenAPIIntegration.md)
   - Dynamic Target Extraction
   - OpenAPI v2 / v3 Parsing
   - Feature & Constraint Mapping
5. [Data Binding & State Management](DataBindingAndState.md)
   - The Tri-Binding Interface
   - The Validation Pipeline & State Management
   - Change Handling
6. [API Reference (DynamicHost)](APIReference.md)
   - Properties
   - Events
   - Methods
   - Library-Level Configuration (`UrlValidator`, `Logger`)
7. [Extensibility](CreatingPlugins.md)
   - Creating Custom Plugins
   - The BasePlugin Lifecycle
8. [Policy-Based Rules Engine (PBRE)](PolicyBasedRulesEngine.md)
   - Declarative Conditions (`NumericGreaterThan`, `NumericLessThan`, `StringEquals`, `DateLessThan`, `IsNull`, `IsNotNull`)
   - Symmetrical Effects (`Show`, `Hide`, `Require`, `Optional`, `Validate`, `Invalidate`, `Enable`, `Disable`)
9. [AI Instruction Manual & Schema Cheat Sheet](AI_Schema_CheatSheet.md)
   - Exhaustive Schema Dictionary & Widget Registry
10. [Testing Routines & Automated Verification](09_Testing_Routines_and_Automation.md)
   - `TestOracle.js`, QUnit Physical DOM Unit Tests, E2E Matrix, Sandbox Smoke Tests, and Standalone Consumer Verification
11. [Supported Features & Known Limitations](SupportedFeatures.md)
   - Complete Source-Derived Capability Inventory (<!-- DOC_COUNT:pluginMappings -->`51` Widget Mappings, <!-- DOC_COUNT:validators -->`14` Validators, <!-- DOC_COUNT:formatters -->`4` Formatters, <!-- DOC_COUNT:parsers -->`3` Parsers, <!-- DOC_COUNT:policyConditions -->`6` Policy Conditions, <!-- DOC_COUNT:policyEffects -->`8` Policy Effects) and Honest Known Limitations
   - **Security Posture & Trust Model** — what an untrusted schema may and may not do, and the residual exposure that remains
