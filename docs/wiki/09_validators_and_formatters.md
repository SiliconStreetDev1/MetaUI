# 08. Validators and Formatters

While structural validation (`required`, `maxLength`) is handled natively by the controls, business logic validation and data formatting is managed via the `PipelineManager`.

## Formatters

Formatters visually alter the data on the screen without mutating the underlying JSON payload.

### Built-in Formatters
You can trigger formatters by passing a string to `ui.formatter`. Some formatters require arguments (e.g., currency codes) passed via `ui.args`.

```json
{
  "EmployeeName": {
    "type": "string",
    "ui": {
      "label": "Full Name",
      "formatter": "textCase",
      "args": "upper"
    }
  }
}
```

### Custom Formatters
To create a new formatter, implement `IFormatter` from the `IPipeline` interface.

```typescript
import { IFormatter } from "nz/co/siliconst/ui5/metaui/interfaces/IPipeline";
import { GlobalPipeline } from "nz/co/siliconst/ui5/metaui/core/PipelineManager";

export class UppercaseFormatterPlugin implements IFormatter {
    public format(rawValue: any, args?: any): string {
        if (typeof rawValue === "string") return rawValue.toUpperCase();
        return String(rawValue);
    }
}

// Register it
GlobalPipeline.formatters.register("uppercase", new UppercaseFormatterPlugin());
```

## Validators

Validators inspect the value before submission. If they fail, they throw a `ValidationError` which highlights the control in red.

### Built-in Validators
Trigger them via the `ui.validators` array.

```json
{
  "EmailAddress": {
    "type": "string",
    "ui": {
      "label": "Email",
      "validators": ["email"]
    }
  }
}
```

### Custom Validators
To create a new validator, implement `IValidator` from the `IPipeline` interface.

```typescript
import { IValidator, IValidationResult } from "nz/co/siliconst/ui5/metaui/interfaces/IPipeline";
import { GlobalPipeline } from "nz/co/siliconst/ui5/metaui/core/PipelineManager";

export class IbanValidatorPlugin implements IValidator {
    public validate(parsedValue: any, args?: any): IValidationResult {
        if (!parsedValue) return { isValid: true }; // Let required validator handle empty checks
        
        if (!String(parsedValue).startsWith("XX")) {
            return { isValid: false, errorMessage: "Invalid IBAN prefix. Must start with XX." };
        }
        
        return { isValid: true };
    }
}

// Register it
GlobalPipeline.validators.register("iban", new IbanValidatorPlugin());
```
