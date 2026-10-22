/**
 * @file BinaryEffectPlugin.ts
 * @description Unified table-driven policy effect plugin translating all 8 binary effects
 * (Show, Hide, Validate, Invalidate, Require, Optional, Enable, Disable) into structural UI deltas.
 */

import { IPolicyEffectPlugin } from "../../../interfaces/IPolicyPlugin";
import { PropertyName } from "../../../core/PolicyEngine";

const EFFECT_TABLE: Readonly<Record<string, readonly [PropertyName, boolean]>> = {
    Show: ["visibility", true],
    Hide: ["visibility", false],
    Validate: ["validity", true],
    Invalidate: ["validity", false],
    Require: ["required", true],
    Optional: ["required", false],
    Enable: ["editable", true],
    Disable: ["editable", false]
};

/**
 * Table-driven policy effect plugin that translates semantic policy effects into binary structural UI deltas
 * with automatic symmetrical reversal when the governing condition is false.
 *
 * @namespace nz.co.siliconst.ui5.metaui.plugins.policies.effects
 * @public
 */
export class BinaryEffectPlugin implements IPolicyEffectPlugin {
    /**
     * Resolves any registered binary policy effect into its target structural property and boolean state.
     *
     * @param isConditionMet Whether the governing policy condition passed.
     * @param originalEffect The semantic effect name declared in the schema.
     * @returns {{ property: PropertyName; value: boolean }} The resolved property and boolean value.
     */
    public resolveState(
        isConditionMet: boolean,
        originalEffect: string
    ): { property: PropertyName; value: boolean } {
        const entry = EFFECT_TABLE[originalEffect] || ["visibility", true];
        const [property, baseValue] = entry;
        return {
            property,
            value: isConditionMet ? baseValue : !baseValue
        };
    }
}

