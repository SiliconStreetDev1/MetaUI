/**
 * @file MultiSelectPlugin.ts
 * @description Renders a sap.m.MultiComboBox control for array properties with enum or valueHelp options.
 */

import { OptionListPlugin } from "./OptionListPlugin";
import { IPropertyMetadata } from "../../interfaces/ISchema";
import MultiComboBox from "sap/m/MultiComboBox";
import Control from "sap/ui/core/Control";
import Event from "sap/ui/base/Event";
import { PropertyBindingInfo } from "sap/ui/base/ManagedObject";

/**
 * Plugin responsible for rendering multi-selection combo boxes (`sap.m.MultiComboBox`)
 * populated from `metadata.items.enum`, `metadata.enum`, `metadata.valueHelp`, or `metadata.ui.valueHelp`.
 *
 * @namespace nz.co.siliconst.ui5.metaui.plugins.controls
 * @public
 */
export class MultiSelectPlugin extends OptionListPlugin {
    /**
     * Renders a `sap.m.MultiComboBox` component.
     *
     * @param metadata The specific JSON schema properties for this field.
     * @param bindingPath The JSON path bound to this control.
     * @param modelName The UI5 JSONModel name.
     * @param engineScopeId The deterministic scope ID.
     * @param onChange The callback fired on value change.
     * @returns {Control} The configured MultiComboBox control.
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
            const vhList = this.resolveValueHelpList(metadata);
            const arrayFormatterBinding = this.generateBindingInfo(bindingPath, modelName, undefined, {
                formatter: (val: unknown) => {
                    if (!Array.isArray(val)) {
                        return "";
                    }
                    if (vhList && vhList.length > 0) {
                        return val
                            .map((item) => {
                                const matched = vhList.find((opt) => String(opt.key) === String(item));
                                return matched ? String(matched.text) : String(item);
                            })
                            .join(", ");
                    }
                    return val.join(", ");
                }
            }) as PropertyBindingInfo;
            return this.createDisplayText(engineScopeId, bindingPath, arrayFormatterBinding);
        }

        const isNumericItems =
            metadata.items?.type === "number" || metadata.items?.type === "integer";

        const selectedKeysBinding = isNumericItems
            ? this.generateBindingInfo(bindingPath, modelName, undefined, {
                  formatter: (val: unknown) => (Array.isArray(val) ? val.map((v) => String(v)) : [])
              })
            : this.generateBindingInfo(bindingPath, modelName);

        const mcb = new MultiComboBox({
            id: this.generateStableId(engineScopeId, bindingPath),
            selectedKeys: selectedKeysBinding as unknown as string[],
            width: "100%",
            placeholder: metadata.ui?.placeholder || "",
            required: this.isRequired(),
            selectionFinish: (oEvent: Event) => {
                const src = oEvent.getSource() as MultiComboBox;
                const keys = src.getSelectedKeys();
                const finalVals = isNumericItems
                    ? keys.map((k) => Number(k)).filter((n) => !Number.isNaN(n))
                    : keys;
                this.commitValue(src, finalVals);
                this.notifyChange(src.getId());
            }
        });

        this.populateItems(mcb, metadata);

        this.control = mcb;
        this.applyCommonDirectives(this.control, metadata, modelName);

        return this.control;
    }

    /**
     * Populates the `MultiComboBox` items from `metadata.ui.valueHelp`, `metadata.valueHelp`, `metadata.items.enum`, or `metadata.enum`.
     *
     * @param mcb The target `sap.m.MultiComboBox` control.
     * @param metadata The property metadata containing options.
     */
    private populateItems(mcb: MultiComboBox, metadata: IPropertyMetadata): void {
        this.syncOptionItems(
            mcb,
            this.buildOptionItems(metadata, metadata.items?.enum || metadata.enum),
            () => (typeof mcb.getSelectedKeys === "function" ? mcb.getSelectedKeys() : []),
            (keys) => {
                if (typeof mcb.setSelectedKeys === "function") {
                    mcb.setSelectedKeys(keys);
                }
            }
        );
    }

    /**
     * Retrieves the array of selected keys from the `MultiComboBox`, coerced to numbers if `items.type` is numeric.
     *
     * @param sourceControl Optional runtime source control (e.g., cloned table cell).
     * @returns {unknown} The selected keys array.
     */
    protected getValue(sourceControl?: Control): unknown {
        if (!this.isEditable) {
            const modelVal = this.getModelValue(sourceControl);
            return Array.isArray(modelVal) ? modelVal : [];
        }
        const mcb = (sourceControl ?? this.control) as MultiComboBox | undefined;
        if (!mcb || typeof mcb.getSelectedKeys !== "function") {
            return [];
        }
        const keys = mcb.getSelectedKeys();
        if (keys.length === 0 && !mcb.getDomRef()) {
            const modelVal = this.getModelValue(mcb);
            if (Array.isArray(modelVal)) {
                return modelVal;
            }
        }
        if (this.metadata?.items?.type === "number" || this.metadata?.items?.type === "integer") {
            return keys.map((k) => Number(k)).filter((n) => !Number.isNaN(n));
        }
        return keys;
    }

    /**
     * Applies dynamic `readOnly`, `required`, and item list updates to the `MultiComboBox`.
     */
    protected applyState(): void {
        if (!this.control || !this.metadata || !this.isEditable) {
            return;
        }
        const mcb = this.control as MultiComboBox;
        mcb.setEditable(this.isControlEditable());
        mcb.setRequired(this.isRequired());
        this.populateItems(mcb, this.metadata);
    }
}
