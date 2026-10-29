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
| `Hide` | Hides the field (and its companion label) from the layout and suppresses validation errors while hidden. | `Show` |
| `Show` | Displays a previously hidden field. | `Hide` |
| `Require` | Makes a field mandatory (shows red asterisk). Blocks submission. | `Optional` |
| `Optional` | Removes mandatory enforcement. | `Require` |
| `Disable` | Disables the field: its real widget renders greyed out and non-interactive (`setEnabled(false)`). Editability is untouched; for a read-only look use `ui.readOnly`. | `Enable` |
| `Enable` | Lifts a `Disable`. Cannot enable a field that `ui.enabled: false` or the host's `enabled="false"` disabled, and has no effect on a field whose `ui.enabledOn` expression owns its enabled state (a warning is logged). | `Disable` |
| `Invalidate` | Instantly paints the field red and blocks submission. | `Validate` |
| `Validate` | Clears custom error states. | `Invalidate` |

## Supported Conditions (`IPolicyCondition`)

You can evaluate the state of the payload using the <!-- DOC_COUNT:policyConditions -->6 built-in condition operators (implemented by `NumericGreaterThanConditionPlugin`, `NumericLessThanConditionPlugin`, `StringEqualsConditionPlugin`, `DateLessThanConditionPlugin`, `IsNullConditionPlugin`, and `IsNotNullConditionPlugin`, with shared pointer/entry helpers in `PolicyConditionUtil`). Each operator resolves the active JSON data via a `JSON Pointer`.

### NumericGreaterThan / NumericLessThan (`NumericGreaterThanConditionPlugin`, `NumericLessThanConditionPlugin`)
Coerces the value to a number.
```json
{
  "condition": {
    "NumericGreaterThan": { "/TotalGuests": 6 }
  }
}
```

### StringEquals (`StringEqualsConditionPlugin`)
Strictly matches string variants.
```json
{
  "condition": {
    "StringEquals": { "/AccommodationType": "Campsite" }
  }
}
```

### DateLessThan (`DateLessThanConditionPlugin`)
Compares an ISO date string or `Date` value against a threshold date string (`"YYYY-MM-DD"` or `"$today"`).
```json
{
  "condition": {
    "DateLessThan": { "/CheckInDate": "$today" }
  }
}
```

### IsNull / IsNotNull (`IsNullConditionPlugin`, `IsNotNullConditionPlugin`)
Evaluates structural existence (undefined, null, or empty string).
```json
{
  "condition": {
    "IsNull": ["/Vehicle/RegistrationNumber"]
  }
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

Because PBRE is plugin-based, you can introduce custom conditions and effects tailored to your domain logic without touching the core `PolicyEngine`.

### 1. Creating a Custom Condition Plugin
Let's build a plugin that checks if a string contains a specific substring.

**File:** `plugins/policies/conditions/StringContainsConditionPlugin.ts`
```typescript
import { IPolicyConditionPlugin } from "nz/co/siliconst/ui5/metaui/interfaces/IPolicyPlugin";

export class StringContainsConditionPlugin implements IPolicyConditionPlugin {
    public evaluate(conditionPayload: unknown, data: unknown, resolvePointer: (d: unknown, p: string) => unknown): boolean {
        if (!conditionPayload || typeof conditionPayload !== "object" || Array.isArray(conditionPayload)) {
            return false;
        }
        const entries = Object.entries(conditionPayload as Record<string, unknown>);
        if (entries.length === 0) {
            return false;
        }

        for (const [path, targetStr] of entries) {
            const val = resolvePointer(data, path);
            if (typeof val !== "string" || typeof targetStr !== "string" || !val.includes(targetStr)) {
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
