/**
 * @file DropdownPlugin.ts
 * @description Renders a sap.m.Select control for enum and valueHelp properties, preserving numeric enum types.
 */

import { BasePlugin } from "./BasePlugin";
import { IPropertyMetadata, IValueHelpOption } from "../../interfaces/ISchema";
import Select from "sap/m/Select";
import Item from "sap/ui/core/Item";
import Control from "sap/ui/core/Control";
import JSONModel from "sap/ui/model/json/JSONModel";
import Event from "sap/ui/base/Event";

/**
 * Plugin responsible for rendering single-selection dropdown lists (`sap.m.Select`)
 * populated from `metadata.enum`, `metadata.valueHelp`, or `metadata.ui.valueHelp`.
 * Automatically coerces selected keys back to numbers when `metadata.type` is `"number"` or `"integer"`.
 *
 * @namespace nz.co.siliconst.ui5.metaui.plugins.controls
 * @public
 */
export class DropdownPlugin extends BasePlugin {
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
            const vhList: IValueHelpOption[] | undefined = Array.isArray(metadata.ui?.valueHelp)
                ? metadata.ui.valueHelp
                : Array.isArray(metadata.valueHelp)
                  ? metadata.valueHelp
                  : undefined;
            if (vhList && vhList.length > 0) {
                const displayBinding = this.generateBindingInfo(bindingPath, modelName, undefined, {
                    formatter: (val: unknown) => {
                        if (val === undefined || val === null) {
                            return "";
                        }
                        const matched = vhList.find((opt) => String(opt.key) === String(val));
                        return matched ? String(matched.text) : String(val);
                    }
                });
                return this.createDisplayText(engineScopeId, bindingPath, displayBinding);
            }
            return this.createDisplayText(engineScopeId, bindingPath);
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
                    const model = src.getModel(modelName) as JSONModel | undefined;
                    if (model) {
                        const targetPath = this.resolveAbsolutePath(src);
                        const numVal = Number(rawKey);
                        if (rawKey !== "" && !Number.isNaN(numVal)) {
                            model.setProperty(targetPath, numVal);
                        }
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
        const vhList: IValueHelpOption[] | undefined = Array.isArray(metadata.ui?.valueHelp)
            ? metadata.ui.valueHelp
            : Array.isArray(metadata.valueHelp)
              ? metadata.valueHelp
              : undefined;

        const desiredItems: Array<{ key: string; text: string }> = [];
        if (vhList) {
            for (const opt of vhList) {
                desiredItems.push({ key: String(opt.key), text: String(opt.text) });
            }
        } else if (metadata.enum && Array.isArray(metadata.enum)) {
            for (const val of metadata.enum) {
                desiredItems.push({ key: String(val), text: String(val) });
            }
        }

        const existingItems = typeof select.getItems === "function" ? select.getItems() : [];
        if (
            existingItems.length === desiredItems.length &&
            existingItems.every(
                (item, idx) => item.getKey() === desiredItems[idx].key && item.getText() === desiredItems[idx].text
            )
        ) {
            return;
        }

        const prevKey = typeof select.getSelectedKey === "function" ? select.getSelectedKey() : "";
        select.destroyItems();
        for (const opt of desiredItems) {
            select.addItem(new Item({ key: opt.key, text: opt.text }));
        }
        if (prevKey && typeof select.setSelectedKey === "function") {
            select.setSelectedKey(prevKey);
        }
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
