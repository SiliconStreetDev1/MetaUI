/**
 * @file DropdownPlugin.ts
 * @description Renders a sap.m.Select control for enum and valueHelp properties, preserving numeric enum types.
 */

import { OptionListPlugin } from "./OptionListPlugin";
import { IPropertyMetadata } from "../../interfaces/ISchema";
import Select from "sap/m/Select";
import Control from "sap/ui/core/Control";
import Event from "sap/ui/base/Event";

/**
 * Plugin responsible for rendering single-selection dropdown lists (`sap.m.Select`)
 * populated from `metadata.enum`, `metadata.valueHelp`, or `metadata.ui.valueHelp`.
 * Automatically coerces selected keys back to numbers when `metadata.type` is `"number"` or `"integer"`.
 *
 * @namespace nz.co.siliconst.ui5.metaui.plugins.controls
 * @internal
 */
export class DropdownPlugin extends OptionListPlugin {
    /**
     * Renders a `sap.m.Select` component.
     *
     * @param metadata The specific JSON schema properties for this field.
     * @param bindingPath The JSON path bound to this control.
     * @param modelName The UI5 JSONModel name.
     * @param engineScopeId The deterministic scope ID.
     * @param onChange The callback fired on value change.
     * @returns {Control} The configured Select control.
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
            return this.createOptionDisplayText(engineScopeId, bindingPath, modelName, metadata);
        }

        const isNumericType = metadata.type === "number" || metadata.type === "integer";

        const select = new Select({
            id: this.generateStableId(engineScopeId, bindingPath),
            selectedKey: this.generateBindingInfo(bindingPath, modelName) as unknown as string,
            forceSelection: false,
            width: "100%",
            required: this.isRequired(),
            change: (oEvent: Event) => {
                const src = oEvent.getSource() as Select;
                if (isNumericType) {
                    const rawKey = src.getSelectedKey();
                    const numVal = Number(rawKey);
                    if (rawKey !== "" && !Number.isNaN(numVal)) {
                        this.commitValue(src, numVal);
                    }
                }
                this.notifyChange(src.getId());
            }
        });

        this.populateItems(select, metadata);

        this.control = select;
        this.applyCommonDirectives(this.control, metadata, modelName);

        return this.control;
    }

    /**
     * Populates the `sap.m.Select` items from `metadata.ui.valueHelp`, `metadata.valueHelp`, or `metadata.enum`.
     *
     * @param select The target `sap.m.Select` control.
     * @param metadata The property metadata containing options.
     */
    private populateItems(select: Select, metadata: IPropertyMetadata): void {
        this.syncOptionItems(
            select,
            this.buildOptionItems(metadata, metadata.enum),
            () => {
                const prevKey = typeof select.getSelectedKey === "function" ? select.getSelectedKey() : "";
                return prevKey ? [prevKey] : [];
            },
            (keys) => {
                if (typeof select.setSelectedKey === "function") {
                    select.setSelectedKey(keys[0]);
                }
            }
        );
    }

    /**
     * Retrieves the currently selected key, coerced to a number if the property type is numeric.
     *
     * @param sourceControl Optional runtime source control (e.g., cloned table cell).
     * @returns {unknown} The selected value.
     */
    protected getValue(sourceControl?: Control): unknown {
        if (!this.isEditable) {
            return this.getModelValue(sourceControl) ?? "";
        }
        const select = (sourceControl ?? this.control) as Select | undefined;
        if (!select || typeof select.getSelectedKey !== "function") {
            return this.getModelValue(select) ?? "";
        }
        const key = select.getSelectedKey();
        if (key === "" && !select.getDomRef()) {
            const modelVal = this.getModelValue(select);
            if (modelVal !== undefined && modelVal !== null && modelVal !== "") {
                return modelVal;
            }
        }
        if ((this.metadata?.type === "number" || this.metadata?.type === "integer") && key !== "") {
            const num = Number(key);
            if (!Number.isNaN(num)) {
                return num;
            }
        }
        return key;
    }

    /**
     * Applies dynamic `readOnly`, `required`, and item list updates to the `Select` control.
     */
    protected applyState(): void {
        if (!this.control || !this.metadata || !this.isEditable) {
            return;
        }
        const select = this.control as Select;
        select.setEditable(this.isControlEditable());
        select.setRequired(this.isRequired());
        this.populateItems(select, this.metadata);
    }
}
