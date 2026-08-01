import { IPolicyEffectPlugin } from "../../../interfaces/IPolicyPlugin";
import { PropertyName } from "../../../core/PolicyEngine";

/**
 * Translates semantic 'Validate' and 'Invalidate' effects into structural validity states.
 * Connects arbitrary cross-field logic to standard UI5 value states (e.g., Error vs None).
 */
export class ValidityEffectPlugin implements IPolicyEffectPlugin {
    /**
     * Determines if this plugin handles the given semantic effect string.
     * @param effect The effect defined in the schema (e.g., "Validate", "Invalidate").
     * @returns True if the effect is handled by this plugin.
     */
    public canHandle(effect: string): boolean {
        return effect === "Validate" || effect === "Invalidate";
    }

    /**
     * Resolves the "Validate" or "Invalidate" effect into a concrete structural delta property.
     * Ensures symmetrical reversal when the governing condition fails.
     * @param isConditionMet Whether the governing policy condition passed.
     * @param originalEffect The original semantic effect declared in the schema.
     * @returns The resolved state mapping to the "validity" property.
     */
    public resolveState(isConditionMet: boolean, originalEffect: string): { property: PropertyName, value: boolean } {
        const isValid = originalEffect === "Validate";
        const baseValue = isValid ? true : false;
        
        return {
            property: "validity",
            value: isConditionMet ? baseValue : !baseValue
        };
    }
}
