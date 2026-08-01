# Policy-Based Rules Engine (PBRE)

The **Policy-Based Rules Engine (PBRE)** is a native MetaUI subsystem that allows developers to define complex, cross-field logical behaviors using pure declarative JSON. 

Following MetaUI's **Plugin-First Architecture**, the PBRE does not hardcode its conditions or effects. Instead, it delegates all logic to modular `IPolicyConditionPlugin` and `IPolicyEffectPlugin` implementations registered via the `PluginRegistry`. This ensures the engine remains fully extensible.

With PBRE, you never need to write custom JavaScript `onChange` events to hide a field, make it mandatory, or validate it based on the value of another field. The orchestration engine tracks dependencies natively, invokes the appropriate plugins, and applies state updates in real-time.

## The `uiPolicies` Array

Policies are defined at the root of the schema inside the `uiPolicies` array. Each policy consists of a **Condition**, a **Target**, and an **Effect**.

### Example: Making a field mandatory based on another field

```json
{
  "title": "Guest Details",
  "type": "object",
  "properties": {
    "Nationality": { "type": "string", "enum": ["South African", "Foreigner"] },
    "PassportNumber": { "type": "string" }
  },
  "uiPolicies": [
    {
      "effect": "Require",
      "targets": ["/PassportNumber"],
      "condition": {
        "StringEquals": { "/Nationality": "Foreigner" }
      }
    }
  ]
}
```

### Symmetrical Reversals (Zero-Code Wipes)

The engine is inherently symmetrical. You do **not** need to write an opposing rule. 
If the user selects "South African" in the example above, the condition (`StringEquals: Foreigner`) fails. The engine natively detects this failure and automatically applies the inverse effect (making it `Optional`).

## Supported Effects (`PolicyEffectType`)

| Effect | Description | Reversal (Automatic) |
|---|---|---|
| `Hide` | Hides the field from the layout. Natively cleans up unbound data. | `Show` |
| `Show` | Displays a previously hidden field. | `Hide` |
| `Require` | Makes a field mandatory (shows red asterisk). Blocks submission. | `Optional` |
| `Optional` | Removes mandatory enforcement. | `Require` |
| `Disable` | Greys out the field (read-only). | `Enable` |
| `Enable` | Restores field editability. | `Disable` |
| `Invalidate` | Instantly paints the field red and blocks submission. | `Validate` |
| `Validate` | Clears custom error states. | `Invalidate` |

## Supported Conditions (`IPolicyCondition`)

You can evaluate the state of the payload using standard operators. The operator parses the active JSON data via a `JSON Pointer`.

### NumericGreaterThan / NumericLessThan
Coerces the value to a number.
```json
"condition": {
  "NumericGreaterThan": { "/TotalGuests": 6 }
}
```

### StringEquals
Strictly matches string variants.
```json
"condition": {
  "StringEquals": { "/AccommodationType": "Campsite" }
}
```

### IsNull / IsNotNull
Evaluates structural existence (undefined, null, or empty string).
```json
"condition": {
  "IsNull": ["/Vehicle/RegistrationNumber"]
}
```

## Advanced Example: Custom Validation Errors

You can use the `Invalidate` effect combined with a custom `message` to perform logic checks that are too complex for a standard regex pattern.

```json
{
  "uiPolicies": [
    {
      "effect": "Invalidate",
      "targets": ["/Age"],
      "condition": {
        "NumericLessThan": { "/Age": 18 }
      },
      "message": "Primary applicant must be 18 or older to make a booking."
    }
  ]
}
```
When the user types `16` into `/Age`, the field instantly turns red and displays the provided message, overriding any native type validations.

## Tutorial: Building a Custom Policy Plugin

Because PBRE is plugin-based, you can introduce custom conditions and effects tailored to your enterprise logic without touching the core `PolicyEngine`.

### 1. Creating a Custom Condition Plugin
Let's build a plugin that checks if a string contains a specific substring.

**File:** `plugins/policies/conditions/StringContainsConditionPlugin.ts`
```typescript
import { IPolicyConditionPlugin } from "nz/co/siliconst/ui5/metaui/interfaces/IPolicyPlugin";

export class StringContainsConditionPlugin implements IPolicyConditionPlugin {
    public canHandle(conditionKey: string): boolean {
        return conditionKey === "StringContains";
    }

    public evaluate(conditionPayload: unknown, data: unknown, resolvePointer: (d: unknown, p: string) => unknown): boolean {
        const payload = conditionPayload as Record<string, string>;
        if (!payload) return true;

        for (const [path, targetStr] of Object.entries(payload)) {
            const val = resolvePointer(data, path);
            if (typeof val !== "string" || !val.includes(targetStr)) {
                return false;
            }
        }
        return true;
    }
}
```

### 2. Registering the Plugin
You must register the new plugin with the `PluginRegistry` so the `PolicyEngine` can discover it.

```typescript
import { PluginRegistry } from "nz/co/siliconst/ui5/metaui/core/PluginRegistry";

// In your app initialization logic:
PluginRegistry.getInstance().registerPolicyConditionPath(
    "StringContains", 
    "my/custom/namespace/plugins/policies/conditions/StringContainsConditionPlugin"
);
```

### 3. Using it in the Schema
Now you can use `StringContains` directly in your declarative JSON schemas:

```json
{
  "uiPolicies": [
    {
      "effect": "Hide",
      "targets": ["/SpecialDietaryRequirements"],
      "condition": {
        "StringContains": { "/MealPlan": "Standard" }
      }
    }
  ]
}
```

The exact same workflow applies to `IPolicyEffectPlugin` if you wish to introduce custom visual reactions beyond Show/Hide/Validate.
