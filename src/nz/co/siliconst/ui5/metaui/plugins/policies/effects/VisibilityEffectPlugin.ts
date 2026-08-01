import { IPolicyEffectPlugin } from "../../../interfaces/IPolicyPlugin";
import { PropertyName } from "../../../core/PolicyEngine";

/**
 * Translates semantic 'Show' and 'Hide' effects into boolean structural visibility states.
 * Enables conditions to toggle the visual presence of form fields dynamically.
 */
export class VisibilityEffectPlugin implements IPolicyEffectPlugin {
    /**
     * Determines if this plugin handles the given semantic effect string.
     * @param effect The effect defined in the schema (e.g., "Show", "Hide").
     * @returns True if the effect is handled by this plugin.
     */
    public canHandle(effect: string): boolean {
        return effect === "Show" || effect === "Hide";
    }

    /**
     * Resolves the "Show" or "Hide" effect into a concrete structural delta property.
     * Ensures symmetrical reversal when the governing condition fails.
     * @param isConditionMet Whether the governing policy condition passed.
     * @param originalEffect The original semantic effect declared in the schema.
     * @returns The resolved state mapping to the "visibility" property.
     */
    public resolveState(isConditionMet: boolean, originalEffect: string): { property: PropertyName, value: boolean } {
        const isShow = originalEffect === "Show";
        const baseValue = isShow ? true : false;
        
        return {
            property: "visibility",
            value: isConditionMet ? baseValue : !baseValue
        };
    }
}
