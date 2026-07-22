/**
 * @file ISchema.ts
 * @description MetaUI v2 Core Schema Contract.
 * Aligned with standard JSON-Schema syntax (properties, items) for native AI generation,
 * with a proprietary 'ui' directive block for Fiori visual orchestration.
 */

export type FieldType = "string" | "number" | "integer" | "boolean" | "date" | "array" | "object";

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
    fullWidth?: boolean;
    validators?: (string | IValidationRule)[];
    formatter?: string;
    args?: unknown;
    dialogButtonText?: string;
}

export interface IRemoteValueHelpConfig {
    url: string;
    keyPath: string;
    textPath: string;
}

/**
 * Standard JSON-Schema property definition.
 */
export interface IPropertyMetadata {
    type: FieldType;
    
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
    
    // Nested recursion for objects and arrays
    properties?: Record<string, IPropertyMetadata>;
    items?: IPropertyMetadata;
    uiLayout?: ILayoutElement[];
    additionalProperties?: boolean;
}

/**
 * The master schema contract ingested by the Engine.
 */
export interface ISchema {
    title?: string;
    layoutStrategy?: string;
    type?: "object" | "array"; // Implicit layout hinting
    properties?: Record<string, IPropertyMetadata>;
    items?: IPropertyMetadata;
    uiLayout?: ILayoutElement[];
    additionalProperties?: boolean;
}
