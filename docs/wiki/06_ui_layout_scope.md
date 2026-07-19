# 06. UI Layout Scope Resolution

The MetaUI engine is heavily reliant on the `scope` property within the `uiLayout` elements. The `scope` acts as the definitive path connecting a UI visual control block back to its corresponding metadata definition in the JSON Schema `properties` block.

This mechanism ensures the layout is entirely decoupled from the data structure, allowing you to freely re-order, group, or hide fields without mutating the core data payload.

## The Scope Syntax

MetaUI utilizes the **JSON Pointer** syntax standard (RFC 6901) for scope definition. 

Every scope must start with `#/properties/` to denote that we are navigating down the JSON Schema object tree starting from the root schema.

### 1. Root Level Properties

To bind a UI control to a property defined at the root of the schema, simply append the property name.

**Data Payload:**
```json
{
    "FirstName": "John"
}
```

**Schema `properties` block:**
```json
"properties": {
    "FirstName": { "type": "string" }
}
```

**Layout Scope:**
```json
{ "type": "Control", "scope": "#/properties/FirstName" }
```

### 2. Deeply Nested Objects

When you have properties nested inside `object` structures, the scope path must chain through each nested `properties` block. 

**Data Payload:**
```json
{
    "Address": {
        "City": "Auckland"
    }
}
```

**Schema `properties` block:**
```json
"properties": {
    "Address": {
        "type": "object",
        "properties": {
            "City": { "type": "string" }
        }
    }
}
```

**Layout Scope:**
```json
{ "type": "Control", "scope": "#/properties/Address/properties/City" }
```

> [!WARNING]
> Do NOT use standard JavaScript dot-notation (e.g. `#/properties/Address.City`). MetaUI strictly enforces the `/properties/` segment delimiter to remain compliant with standard JSON Schema draft-07 parsing.

### 3. Drilling into Arrays

Arrays are slightly different because their inner structure is defined within the `items` block, rather than a direct `properties` block. 

**Data Payload:**
```json
{
    "Contacts": [
        { "Name": "Alice" }
    ]
}
```

**Schema `properties` block:**
```json
"properties": {
    "Contacts": {
        "type": "array",
        "items": {
            "type": "object",
            "properties": {
                "Name": { "type": "string" }
            }
        }
    }
}
```

**Layout Scope:**
```json
{ "type": "Control", "scope": "#/properties/Contacts/items/properties/Name" }
```

## Abstract Data Binding
The beauty of this architecture is that while the `scope` explicitly defines the JSON Schema path (e.g., `#/properties/Address/properties/City`), the underlying **MetaUI Engine automatically normalizes this path into a standard UI5 Data Binding path** (e.g., `{meta>/Address/City}`). 

You as the developer only ever need to worry about the schema scope!
