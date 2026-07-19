# 06. Conditional Logic

Dynamic forms require fields to react to the state of other fields. MetaUI utilizes a custom `ConditionEngine` coupled with native UI5 Expression Bindings to achieve zero-javascript reactivity.

## `ui.visibleOn` and `ui.enabledOn`

You can attach boolean condition strings to any property schema using `visibleOn` or `enabledOn`.

### Root Payload Traversal

Prefix variables with `$root.` to instruct the engine to evaluate the variable from the root of the JSON payload. The engine securely transpiles this into an isolated UI5 Expression Binding path (`${meta>/path}`).

```json
{
  "type": "object",
  "properties": {
    "DocumentType": {
      "type": "string",
      "ui": { "label": "Document Type" }
    },
    "PassportNumber": {
      "type": "string",
      "ui": {
        "label": "Passport ID",
        "visibleOn": "$root.DocumentType === 'PASSPORT'"
      }
    }
  }
}
```

*Result*: The `PassportNumber` input is completely hidden from the DOM until the `DocumentType` field strictly equals `'PASSPORT'`.

## Supported Operators

The transpiler supports standard logical and mathematical operators:
- Equality: `===`, `!==`, `==`, `!=`
- Mathematical: `>`, `<`, `>=`, `<=`
- Logical: `&&`, `||`
- Grouping: `(`, `)`

Example of a complex rule:
```json
"visibleOn": "($root.Age >= 18 && $root.Country === 'US') || $root.IsExempt === true"
```

## Security & Memory Safety

Expressions are strictly bound to the isolated `meta` JSONModel. The bindings are natively attached to the `visible` and `enabled` properties of the generated UI5 Controls. Because it leverages the core UI5 framework, there are no dangerous `eval()` calls and no trailing event listeners polluting memory.
