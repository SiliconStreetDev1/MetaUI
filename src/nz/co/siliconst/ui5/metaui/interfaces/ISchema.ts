/**
 * @file ISchema.ts
 * @description MetaUI v2 Core Schema Contract.
 * Aligned with standard JSON-Schema syntax (properties, items) for native AI generation,
 * with a proprietary 'ui' directive block for Fiori visual orchestration.
 */

export type FieldType = "string" | "number" | "boolean" | "date" | "dropdown" | "time" | "datetime" | "array" | "object";

/**
 * Value help structure mapping SAP Key/Text pairs.
 */
export interface IValueHelp {
    key: string;
    text: string;
}

/**
 * Visual orchestration directives to separate layout from data modeling.
 */
export interface IUIDirective {
    label?: string;
    isKey?: boolean;
    readOnly?: boolean;
    widget?: string;
    group?: string;
    visibleOn?: string;
    enabledOn?: string;
    format?: string;
    rows?: number;
    fullWidth?: boolean;
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
    minimum?: number;
    maximum?: number;
    pattern?: string;
    
    // Numeric specifics
    precision?: number;
    scale?: number;
    
    // Value constraints
    valueHelp?: IValueHelp[];
    
    // Nested recursion for objects and arrays
    properties?: Record<string, IPropertyMetadata>;
    items?: IPropertyMetadata;
}

/**
 * The master schema contract ingested by the Engine.
 */
export interface ISchema {
    title?: string;
    type?: "object" | "array"; // Implicit layout hinting
    properties?: Record<string, IPropertyMetadata>;
    items?: IPropertyMetadata;
}
