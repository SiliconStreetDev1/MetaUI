import { IPolicyEffectPlugin } from "../../../interfaces/IPolicyPlugin";
import { PropertyName } from "../../../core/PolicyEngine";

/**
 * Translates semantic 'Require' and 'Optional' effects into structural requirement states.
 * Ensures the UI5 `required` property dynamically responds to data thresholds.
 */
export class RequirementEffectPlugin implements IPolicyEffectPlugin {
    /**
     * Determines if this plugin handles the given semantic effect string.
     * @param effect The effect defined in the schema (e.g., "Require", "Optional").
     * @returns True if the effect is handled by this plugin.
     */
    public canHandle(effect: string): boolean {
        return effect === "Require" || effect === "Optional";
    }

    /**
     * Resolves the "Require" or "Optional" effect into a concrete structural delta property.
     * Ensures symmetrical reversal when the governing condition fails.
     * @param isConditionMet Whether the governing policy condition passed.
     * @param originalEffect The original semantic effect declared in the schema.
     * @returns The resolved state mapping to the "required" property.
     */
    public resolveState(isConditionMet: boolean, originalEffect: string): { property: PropertyName, value: boolean } {
        const isRequire = originalEffect === "Require";
        const baseValue = isRequire ? true : false;
        
        return {
            property: "required",
            value: isConditionMet ? baseValue : !baseValue
        };
    }
}
