/**
 * @file MultiInputPlugin.ts
 * @description Renders a sap.m.MultiInput control for primitive array tokenization.
 */

import { BasePlugin } from "./BasePlugin";
import { IPropertyMetadata } from "../../interfaces/ISchema";
import MultiInput from "sap/m/MultiInput";
import Token from "sap/m/Token";
import Control from "sap/ui/core/Control";
import Event from "sap/ui/base/Event";
import { PropertyBindingInfo } from "sap/ui/base/ManagedObject";
import { I18n, TEXT_KEY } from "../../utils/I18n";

/**
 * Plugin responsible for rendering tokenized primitive arrays (`sap.m.MultiInput`).
 *
 * @namespace nz.co.siliconst.ui5.metaui.plugins.controls
 * @public
 */
export class MultiInputPlugin extends BasePlugin {
    /**
     * Renders a `sap.m.MultiInput` component bound to a primitive array in the `JSONModel`.
     * The token entry field honours `items.maxLength` (the JSON-Schema-correct per-entry limit) and falls back
     * to the property-level `maxLength` so the directive behaves as it does on every other text entry control.
     *
     * @param metadata The specific JSON schema properties for this field.
     * @param bindingPath The JSON path bound to this control.
     * @param modelName The UI5 JSONModel name.
     * @param engineScopeId The deterministic scope ID.
     * @param onChange The callback fired on value change.
     * @returns {Control} The configured MultiInput control.
     */
    public render(
        metadata: IPropertyMetadata,
        bindingPath: string,
        modelName: string = "meta",
        engineScopeId?: string,
        onChange?: (isValid: boolean, fieldKey?: string, errorMessage?: string, controlId?: string) => void
    ): Control {
        this.initialize(metadata, bindingPath, modelName, onChange);

        if (!this.isEditable) {
            const arrayFormatterBinding = this.generateBindingInfo(bindingPath, modelName, undefined, {
                formatter: (val: unknown) => (Array.isArray(val) ? val.join(", ") : "")
            }) as PropertyBindingInfo;
            return this.createDisplayText(engineScopeId, bindingPath, arrayFormatterBinding);
        }

        const isNumericItems =
            metadata.items?.type === "number" || metadata.items?.type === "integer";

        const multiInput = new MultiInput({
            id: this.generateStableId(engineScopeId, bindingPath),
            width: "100%",
            showValueHelp: false,
            placeholder: metadata.ui?.placeholder || I18n.getText(TEXT_KEY.multiInputPlaceholder),
            maxLength: metadata.items?.maxLength ?? metadata.maxLength ?? 0,
            required: this.isRequired(),
            tokenUpdate: (oEvent: Event) => {
                const params = oEvent.getParameters() as {
                    type?: string;
                    addedTokens?: Token[];
                    removedTokens?: Token[];
                };
                const src = oEvent.getSource() as MultiInput;
                const currentTokens = src.getTokens();
                const removedSet = new Set(params.removedTokens || []);
                const survivingKeys = currentTokens
                    .filter((t) => !removedSet.has(t))
                    .map((t) => t.getKey());
                if (Array.isArray(params.addedTokens)) {
                    for (const added of params.addedTokens) {
                        const addedKey = added.getKey();
                        if (!survivingKeys.includes(addedKey)) {
                            survivingKeys.push(addedKey);
                        }
                    }
                }
                const finalValues = isNumericItems
                    ? survivingKeys.map((v) => Number(v)).filter((n) => !Number.isNaN(n))
                    : survivingKeys;

                this.commitValue(src, finalValues);
                this.notifyChange(src.getId());
            }
        });

        multiInput.addValidator((args: { text: string }) => {
            const text = args.text.trim();
            if (!text) {
                return null;
            }
            if (isNumericItems && Number.isNaN(Number(text))) {
                return null;
            }
            return new Token({ key: text, text });
        });

        multiInput.bindAggregation("tokens", {
            path: `${modelName}>${bindingPath}`,
            template: new Token({
                key: `{${modelName}>}`,
                text: `{${modelName}>}`
            }),
            templateShareable: true
        });

        this.control = multiInput;
        this.applyCommonDirectives(this.control, metadata, modelName);

        return this.control;
    }

    /**
     * Retrieves the current array of token values from the bound model or `MultiInput` tokens.
     *
     * @param sourceControl Optional runtime source control (e.g., cloned table cell).
     * @returns {unknown} The array of primitive values.
     */
    protected getValue(sourceControl?: Control): unknown {
        if (!this.isEditable) {
            const modelVal = this.getModelValue(sourceControl);
            return Array.isArray(modelVal) ? modelVal : [];
        }
        const mi = (sourceControl ?? this.control) as MultiInput | undefined;
        if (!mi) {
            return [];
        }
        if (typeof mi.getTokens === "function") {
            const keys = mi.getTokens().map((t) => t.getKey());
            if (keys.length > 0 || mi.getDomRef()) {
                if (this.metadata?.items?.type === "number" || this.metadata?.items?.type === "integer") {
                    return keys.map((k) => Number(k)).filter((n) => !Number.isNaN(n));
                }
                return keys;
            }
        }
        const modelVal = this.getModelValue(mi);
        return Array.isArray(modelVal) ? modelVal : [];
    }

    /**
     * Applies dynamic `readOnly` and `required` state updates to the `MultiInput`.
     */
    protected applyState(): void {
        if (!this.control || !this.metadata || !this.isEditable) {
            return;
        }
        const mi = this.control as MultiInput;
        mi.setEditable(this.isControlEditable());
        mi.setRequired(this.isRequired());
    }
}
