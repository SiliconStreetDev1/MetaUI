/**
 * @file OptionListPlugin.ts
 * @description Shared abstract base class for the plugins that render a list of selectable options
 * (`sap.m.Select`, `sap.m.ComboBox`, `sap.m.MultiComboBox`), consolidating `valueHelp` resolution,
 * display-mode key-to-text mapping, and item-list synchronisation.
 */

import { BasePlugin } from "./BasePlugin";
import { IPropertyMetadata, IValueHelpOption } from "../../interfaces/ISchema";
import Item from "sap/ui/core/Item";
import Control from "sap/ui/core/Control";

/**
 * A single resolved `{ key, text }` option, already stringified for the UI5 `Item` aggregation.
 */
export interface IOptionItem {
    key: string;
    text: string;
}

/**
 * The structural contract shared by every UI5 control that owns an `items` aggregation of
 * `sap.ui.core.Item` — `sap.m.Select`, `sap.m.ComboBox`, and `sap.m.MultiComboBox`.
 */
export interface IOptionListControl extends Control {
    getItems(): Item[];
    destroyItems(): unknown;
    addItem(item: Item): unknown;
}

/**
 * Shared abstract base class for `DropdownPlugin`, `MultiSelectPlugin`, and any other plugin that
 * populates a UI5 option list. Owns the three pieces every such plugin otherwise reimplements:
 * the `ui.valueHelp` → `valueHelp` resolution order, the display-mode mapping from stored key to
 * option text, and the "replace the items only when they actually differ" synchronisation that
 * keeps the user's selection alive across a metadata update.
 *
 * @namespace nz.co.siliconst.ui5.metaui.plugins.controls
 * @public
 */
export abstract class OptionListPlugin extends BasePlugin {
    /**
     * Resolves the configured option list, preferring `ui.valueHelp` over the schema-level `valueHelp`.
     *
     * @param metadata The property metadata.
     * @returns {IValueHelpOption[] | undefined} The configured options, or `undefined` when none are declared.
     */
    protected resolveValueHelpList(metadata: IPropertyMetadata): IValueHelpOption[] | undefined {
        if (Array.isArray(metadata.ui?.valueHelp)) {
            return metadata.ui.valueHelp;
        }
        return Array.isArray(metadata.valueHelp) ? metadata.valueHelp : undefined;
    }

    /**
     * Builds the desired `{ key, text }` option list from the configured `valueHelp`, falling back to
     * the supplied enum list. A `valueHelp` list always wins, even when it is empty.
     *
     * @param metadata The property metadata.
     * @param enumList The schema enum to use when no `valueHelp` is configured.
     * @returns {IOptionItem[]} The stringified options to put into the control's `items` aggregation.
     */
    protected buildOptionItems(metadata: IPropertyMetadata, enumList?: unknown[]): IOptionItem[] {
        const vhList = this.resolveValueHelpList(metadata);
        const desiredItems: IOptionItem[] = [];
        if (vhList) {
            for (const opt of vhList) {
                desiredItems.push({ key: String(opt.key), text: String(opt.text) });
            }
            return desiredItems;
        }
        if (Array.isArray(enumList)) {
            for (const val of enumList) {
                desiredItems.push({ key: String(val), text: String(val) });
            }
        }
        return desiredItems;
    }

    /**
     * Creates the display-mode `sap.m.Text` for a single-valued option list, mapping the stored key
     * through the configured `valueHelp` so the user reads the option text rather than the raw key.
     * Falls back to the plain bound value when no options are configured.
     *
     * @param engineScopeId Deterministic scope ID prefix.
     * @param bindingPath Property binding path.
     * @param modelName The UI5 JSONModel alias.
     * @param metadata The property metadata.
     * @returns {Control} The configured `sap.m.Text` control.
     */
    protected createOptionDisplayText(
        engineScopeId: string | undefined,
        bindingPath: string,
        modelName: string,
        metadata: IPropertyMetadata
    ): Control {
        const vhList = this.resolveValueHelpList(metadata);
        if (!vhList || vhList.length === 0) {
            return this.createDisplayText(engineScopeId, bindingPath);
        }
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

    /**
     * Replaces the control's `items` aggregation with `desiredItems`, but only when the two actually
     * differ. Rebuilding an identical list would destroy and recreate every `Item`, which drops the
     * user's open selection, so the equality check is load-bearing rather than an optimisation.
     * The current selection is read before the swap and written back afterwards.
     *
     * @param target The option list control to synchronise.
     * @param desiredItems The option list the metadata now implies.
     * @param readSelection Reads the currently selected keys from the control.
     * @param writeSelection Restores the selected keys onto the rebuilt control.
     */
    protected syncOptionItems(
        target: IOptionListControl,
        desiredItems: IOptionItem[],
        readSelection: () => string[],
        writeSelection: (keys: string[]) => void
    ): void {
        const existingItems = typeof target.getItems === "function" ? target.getItems() : [];
        if (
            existingItems.length === desiredItems.length &&
            existingItems.every(
                (item, idx) => item.getKey() === desiredItems[idx].key && item.getText() === desiredItems[idx].text
            )
        ) {
            return;
        }

        const previousKeys = readSelection();
        target.destroyItems();
        for (const opt of desiredItems) {
            target.addItem(new Item({ key: opt.key, text: opt.text }));
        }
        if (previousKeys.length > 0) {
            writeSelection(previousKeys);
        }
    }
}
