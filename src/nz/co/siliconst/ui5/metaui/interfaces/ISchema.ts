/**
 * @file ISchema.ts
 * @description MetaUI v2 Core Schema Contract.
 * Aligned with standard JSON-Schema syntax (properties, items) for interoperability with standard tooling,
 * with a proprietary 'ui' directive block for Fiori visual orchestration.
 */

import { RenderModeType, SchemaTypeType } from "../constants/MetaUIConstants";

export type FieldType = SchemaTypeType | "date";

/**
 * Value help structure mapping SAP Key/Text pairs.
 */
export interface IValueHelp {
    key: string;
    text: string;
}

export type IValueHelpOption = IValueHelp;

/**
 * Explicit validation rule descriptor attached to `ui.validators`.
 */
export interface IValidationRule {
    name: string;
    args?: unknown;
}

/**
 * Configuration for asynchronous REST or OData data sources used by `RemoteDropdownPlugin`,
 * `LiveSearchPlugin`, `RemoteValueHelpPlugin`, and `ODataListBindingPlugin`.
 */
export interface IDataSourceConfig {
    url: string;
    keyField: string;
    textField: string;
    dataPath?: string;
    modelName?: string;
}

/**
 * An element in the visual layout tree.
 */
export interface ILayoutElement {
    type: "Group" | "Control" | "HorizontalLayout" | "VerticalLayout" | "WizardStep";
    label?: string;
    scope?: string; // JSON Pointer to property, e.g. "#/properties/FirstName"
    elements?: ILayoutElement[];
    widget?: string; // Optional override for the widget
}

/**
 * Visual orchestration directives to separate layout from data modeling.
 */
export interface IUIDirective {
    label?: string;
    placeholder?: string;
    isKey?: boolean;
    readOnly?: boolean;
    visible?: boolean;
    enabled?: boolean;
    widget?: string;
    visibleOn?: string;
    enabledOn?: string;
    format?: string;
    valueState?: string;
    rows?: number;
    expandable?: boolean;
    fullWidth?: boolean;
    controlProps?: Record<string, unknown>;
    options?: Record<string, unknown>;
    valueHelp?: IValueHelp[];
    dataSource?: IDataSourceConfig;
    validators?: (string | IValidationRule)[];
    formatter?: string;
    formatters?: string[];
    args?: unknown;
    dialogButtonText?: string;
    layoutBudget?: number;
    renderMode?: RenderModeType;
    /** Optional ResponsiveGridLayout label span override (1–12 for label-beside-field width, or 0 to hide labels). */
    labelSpan?: number;
}

/**
 * Remote endpoint configuration for asynchronous value-help lookups.
 */
export interface IRemoteValueHelpConfig {
    url: string;
    keyPath: string;
    textPath: string;
}

export type PolicyEffectType = "Require" | "Hide" | "Disable" | "Invalidate" | "Show" | "Enable" | "Validate" | "Optional";

/**
 * Map of condition operator keys to their path/threshold payloads for the Policy-Based Rule Engine.
 */
export interface IPolicyCondition {
    NumericGreaterThan?: Record<string, number>;
    NumericLessThan?: Record<string, number>;
    StringEquals?: Record<string, string>;
    DateLessThan?: Record<string, string>;
    IsNull?: string[];
    IsNotNull?: string[];
    [operator: string]: unknown; // Extensible for other operators
}

/**
 * Declarative cross-field rule evaluated by {@link PolicyEngine}.
 */
export interface IPolicy {
    effect: PolicyEffectType;
    targets: string[];
    condition: IPolicyCondition;
    message?: string;
}

/**
 * Standard JSON-Schema property definition.
 */
export interface IPropertyMetadata {
    type: FieldType;
    $ref?: string;
    /** Standard JSON-Schema title. Used as the label fallback when `ui.label` is absent. */
    title?: string;
    /** Standard JSON-Schema description. Used as tooltip fallback on generated controls. */
    description?: string;

    // MetaUI specific orchestration
    ui?: IUIDirective;

    // Standard validations
    required?: boolean | string[];
    format?: string;
    const?: unknown;
    maxLength?: number;
    minLength?: number;
    minimum?: number;
    maximum?: number;
    pattern?: string;

    // Numeric specifics
    precision?: number;
    scale?: number;
    multipleOf?: number;

    // Value constraints
    valueHelp?: IValueHelp[] | IRemoteValueHelpConfig;
    enum?: (string | number | boolean | null)[];

    // OpenAPI Advanced features
    default?: unknown;
    nullable?: boolean;
    writeOnly?: boolean;
    readOnly?: boolean;
    example?: unknown;
    deprecated?: boolean;
    exclusiveMinimum?: boolean | number;
    exclusiveMaximum?: boolean | number;

    // Array Validation
    maxItems?: number;
    minItems?: number;
    uniqueItems?: boolean;

    // Object Validation
    maxProperties?: number;
    minProperties?: number;

    // Polymorphism and Composition
    oneOf?: IPropertyMetadata[];
    anyOf?: IPropertyMetadata[];
    allOf?: IPropertyMetadata[];
    not?: IPropertyMetadata;
    discriminator?: { propertyName: string; mapping?: Record<string, string> };

    // Nested recursion for objects and arrays
    properties?: Record<string, IPropertyMetadata>;
    items?: IPropertyMetadata;
    uiLayout?: ILayoutElement[];
    additionalProperties?: boolean | IPropertyMetadata;
}

/**
 * The master schema contract ingested by the Engine.
 */
export interface ISchema {
    title?: string;
    ui?: IUIDirective;
    uiPolicies?: IPolicy[];
    layoutStrategy?: string;
    type?: "object" | "array"; // Implicit layout hinting
    properties?: Record<string, IPropertyMetadata>;
    items?: IPropertyMetadata;
    uiLayout?: ILayoutElement[];
    additionalProperties?: boolean | IPropertyMetadata;
    required?: string[];
    readOnly?: boolean;
    maxItems?: number;
    minItems?: number;
    uniqueItems?: boolean;
    maxProperties?: number;
    minProperties?: number;
    oneOf?: IPropertyMetadata[];
    anyOf?: IPropertyMetadata[];
    allOf?: IPropertyMetadata[];
    definitions?: Record<string, ISchema>;
}
