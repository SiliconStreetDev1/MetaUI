import { IPolicyEffectPlugin } from "../../../interfaces/IPolicyPlugin";
import { PropertyName } from "../../../core/PolicyEngine";

/**
 * Translates semantic 'Enable' and 'Disable' effects into structural editable states.
 * Ties the UI5 `editable` or `enabled` states directly into the rules engine.
 */
export class EditableEffectPlugin implements IPolicyEffectPlugin {
    /**
     * Determines if this plugin handles the given semantic effect string.
     * @param effect The effect defined in the schema (e.g., "Enable", "Disable").
     * @returns True if the effect is handled by this plugin.
     */
    public canHandle(effect: string): boolean {
        return effect === "Enable" || effect === "Disable";
    }

    /**
     * Resolves the "Enable" or "Disable" effect into a concrete structural delta property.
     * Ensures symmetrical reversal when the governing condition fails.
     * @param isConditionMet Whether the governing policy condition passed.
     * @param originalEffect The original semantic effect declared in the schema.
     * @returns The resolved state mapping to the "editable" property.
     */
    public resolveState(isConditionMet: boolean, originalEffect: string): { property: PropertyName, value: boolean } {
        const isEnable = originalEffect === "Enable";
        const baseValue = isEnable ? true : false;
        
        return {
            property: "editable",
            value: isConditionMet ? baseValue : !baseValue
        };
    }
}
