/**
 * @file ISchema.ts
 * @description MetaUI v2 Core Schema Contract.
 * Aligned with standard JSON-Schema syntax (properties, items) for native AI generation,
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

export interface IValidationRule {
    name: string;
    args?: unknown;
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
    isKey?: boolean;
    readOnly?: boolean;
    widget?: string;
    visibleOn?: string;
    enabledOn?: string;
    format?: string;
    rows?: number;
    expandable?: boolean;
    fullWidth?: boolean;
    controlProps?: Record<string, unknown>;
    validators?: (string | IValidationRule)[];
    formatter?: string;
    args?: unknown;
    dialogButtonText?: string;
    layoutBudget?: number;
    renderMode?: RenderModeType;
}

export interface IRemoteValueHelpConfig {
    url: string;
    keyPath: string;
    textPath: string;
}

export type PolicyEffectType = "Require" | "Hide" | "Disable" | "Invalidate" | "Show" | "Enable" | "Validate" | "Optional";

export interface IPolicyCondition {
    NumericGreaterThan?: Record<string, number>;
    NumericLessThan?: Record<string, number>;
    StringEquals?: Record<string, string>;
    DateLessThan?: Record<string, string>;
    IsNull?: string[];
    IsNotNull?: string[];
    [operator: string]: unknown; // Extensible for other operators
}

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
    
    // MetaUI specific orchestration
    ui?: IUIDirective;
    
    // Standard validations
    required?: boolean;
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
    enum?: string[] | number[];
    
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
    discriminator?: { propertyName: string, mapping?: Record<string, string> };
    
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
    uiPolicies?: IPolicy[];
    layoutStrategy?: string;
    type?: "object" | "array"; // Implicit layout hinting
    properties?: Record<string, IPropertyMetadata>;
    items?: IPropertyMetadata;
    uiLayout?: ILayoutElement[];
    additionalProperties?: boolean;
    definitions?: Record<string, ISchema>;
}
