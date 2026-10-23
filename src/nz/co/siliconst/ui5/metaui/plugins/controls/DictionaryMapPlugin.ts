/**
 * @file DictionaryMapPlugin.ts
 * @description Renders a dynamic key-value dictionary map (`additionalProperties: { type: ... }`).
 * Synchronizes an array of `{ key, value }` entries in a local JSONModel with the parent object map.
 */

import { BasePlugin } from "./BasePlugin";
import { IPropertyMetadata } from "../../interfaces/ISchema";
import { IPlugin } from "../../interfaces/IPlugin";
import { PayloadValidator } from "../../core/PayloadValidator";
import { AccessibilityUtil } from "../../utils/AccessibilityUtil";
import { DictionaryMapUtil, IDictionaryEntry } from "../../utils/DictionaryMapUtil";
import { deepClone } from "../../utils/TypeGuards";
import { I18n, TEXT_KEY } from "../../utils/I18n";
import Control from "sap/ui/core/Control";
import VBox from "sap/m/VBox";
import HBox from "sap/m/HBox";
import Button from "sap/m/Button";
import Input from "sap/m/Input";
import Title from "sap/m/Title";
import Text from "sap/m/Text";
import JSONModel from "sap/ui/model/json/JSONModel";
import PropertyBinding from "sap/ui/model/PropertyBinding";
import { TitleLevel, ValueState } from "sap/ui/core/library";
import { ButtonType, FlexAlignItems, FlexJustifyContent } from "sap/m/library";

/**
 * Plugin responsible for rendering dynamic key-value dictionary maps (`ui.widget = "dictionaryMap"`
 * or `additionalProperties: { type: ... }`).
 *
 * @namespace nz.co.siliconst.ui5.metaui.plugins.controls
 * @internal
 */
export class DictionaryMapPlugin extends BasePlugin {
    private localModel?: JSONModel;
    private rowsContainer?: VBox;
    private addButton?: Button;
    private valueSchema: IPropertyMetadata = { type: "string" };
    private isSyncingFromParent: boolean = false;
    private isSyncingToParent: boolean = false;
    private parentBinding?: PropertyBinding;
    private parentBindingHandler?: () => void;
    private childPlugins: IPlugin[] = [];
    private scopeId?: string;
    private hasInvalidKeys: boolean = false;

    /** Renders the dictionary header bar and dynamic entry list inside a `sap.m.VBox`. */
    public render(
        metadata: IPropertyMetadata,
        bindingPath: string,
        modelName: string = "meta",
        engineScopeId?: string,
        onChange?: (isValid: boolean, fieldKey?: string, errorMessage?: string, controlId?: string) => void
    ): Control {
        this.initialize(metadata, bindingPath, modelName, onChange);
        this.scopeId = engineScopeId;
        this.hasInvalidKeys = false;
        this.valueSchema =
            metadata.additionalProperties && typeof metadata.additionalProperties === "object"
                ? deepClone(metadata.additionalProperties)
                : { type: "string" };

        this.localModel = new JSONModel({ entries: [] as IDictionaryEntry[] });
        const canEdit = this.isControlEditable();
        const headerTitle = new Title({
            text: metadata.ui?.label || this.fieldKey || I18n.getText(TEXT_KEY.dictionaryLabel),
            level: TitleLevel.H5
        });

        this.addButton = new Button({
            id: this.generateStableId(engineScopeId, `${bindingPath}-add`),
            text: I18n.getText(TEXT_KEY.dictionaryAddEntry),
            icon: "sap-icon://add",
            type: ButtonType.Transparent,
            visible: canEdit,
            press: () => this.addEntry()
        });

        const headerBar = new HBox({
            width: "100%",
            justifyContent: FlexJustifyContent.SpaceBetween,
            alignItems: FlexAlignItems.Center,
            items: [headerTitle, this.addButton]
        }).addStyleClass("sapUiTinyMarginBottom");

        this.rowsContainer = new VBox({ width: "100%" });
        const wrapper = new VBox({
            id: this.generateStableId(engineScopeId, bindingPath),
            width: "100%",
            items: [headerBar, this.rowsContainer]
        }).addStyleClass("sapUiSmallMarginBottom");

        wrapper.setModel(this.localModel, "dict");
        wrapper.attachModelContextChange(() => this.attachParentModelSync(wrapper));
        wrapper.addEventDelegate({ onBeforeRendering: () => this.attachParentModelSync(wrapper) });

        this.control = wrapper;
        this.applyCommonDirectives(this.control, metadata, modelName);
        return this.control;
    }

    /** Attaches a `PropertyBinding` listener to the parent `JSONModel` to refresh entries on external changes. */
    private attachParentModelSync(wrapper: Control): void {
        const parentModel = (wrapper.getModel(this.modelName) || this.engineContext?.getModel()) as
            | JSONModel
            | undefined;
        if (!parentModel || this.parentBinding) return;

        const absPath = this.resolveAbsolutePath(wrapper);
        const binding = parentModel.bindProperty(absPath);
        this.parentBindingHandler = () => {
            if (!this.isSyncingToParent) {
                this.syncFromParentModel(parentModel, absPath);
            }
        };
        binding.attachChange(this.parentBindingHandler);
        this.parentBinding = binding;
        this.syncFromParentModel(parentModel, absPath);
    }

    /** Reads the object map from the parent `JSONModel` and populates `this.localModel` `/entries`. */
    private syncFromParentModel(parentModel: JSONModel, absPath: string): void {
        if (!this.localModel) return;
        this.isSyncingFromParent = true;
        try {
            const rawMap = parentModel.getProperty(absPath);
            const entries = DictionaryMapUtil.extractEntries(rawMap, this.metadata?.properties);
            this.hasInvalidKeys = false;
            this.localModel.setProperty("/entries", entries);
            this.rebuildRows();
        } finally {
            this.isSyncingFromParent = false;
        }
    }

    /** Re-evaluates `ValueState` across all active key `Input` controls in `this.rowsContainer`. */
    private refreshKeyValidityStates(): void {
        if (!this.rowsContainer || !this.localModel) return;
        for (const item of this.rowsContainer.getItems()) {
            if (item instanceof HBox) {
                const keyControl = item.getItems()[0];
                const rawIdx = keyControl?.data("metauiDictKeyIndex");
                if (keyControl instanceof Input && typeof rawIdx === "number") {
                    const status = DictionaryMapUtil.evaluateKeyValidity(
                        keyControl.getValue(),
                        rawIdx,
                        this.localModel,
                        this.metadata?.properties
                    );
                    keyControl.setValueState(status.isValid ? ValueState.None : ValueState.Error);
                    keyControl.setValueStateText(status.message);
                }
            }
        }
    }

    /** Serializes the local `/entries` array back into a flat object map on the parent `JSONModel`. */
    private syncToParentModel(): void {
        if (this.isSyncingFromParent || !this.localModel || !this.control) return;
        const parentModel = (this.control.getModel(this.modelName) || this.engineContext?.getModel()) as
            | JSONModel
            | undefined;
        if (!parentModel) return;

        const rawEntries = this.localModel.getProperty("/entries");
        const entries: IDictionaryEntry[] = Array.isArray(rawEntries) ? rawEntries : [];
        const absPath = this.resolveAbsolutePath(this.control);
        const existingObj = parentModel.getProperty(absPath);

        const { record, hasInvalidKeys } = DictionaryMapUtil.serializeEntries(
            entries,
            existingObj,
            this.metadata?.properties
        );
        this.hasInvalidKeys = hasInvalidKeys;
        this.refreshKeyValidityStates();

        this.isSyncingToParent = true;
        try {
            parentModel.setProperty(absPath, record);
        } finally {
            this.isSyncingToParent = false;
        }
        this.notifyChange();
    }

    /** Appends a new unique key-value entry to the dictionary and syncs to the parent model. */
    private addEntry(): void {
        if (!this.localModel) return;
        const rawEntries = this.localModel.getProperty("/entries");
        const entries: IDictionaryEntry[] = Array.isArray(rawEntries) ? [...rawEntries] : [];
        entries.push({
            key: DictionaryMapUtil.generateUniqueKey(entries),
            value: DictionaryMapUtil.createDefaultValue(this.valueSchema)
        });
        this.localModel.setProperty("/entries", entries);
        this.rebuildRows();
        this.syncToParentModel();
    }

    /** Removes the entry at the specified index and syncs to the parent model. */
    private removeEntry(index: number): void {
        if (!this.localModel) return;
        const rawEntries = this.localModel.getProperty("/entries");
        const entries: IDictionaryEntry[] = Array.isArray(rawEntries) ? [...rawEntries] : [];
        if (index < 0 || index >= entries.length) return;
        entries.splice(index, 1);
        this.localModel.setProperty("/entries", entries);
        this.rebuildRows();
        this.syncToParentModel();
    }

    /** Destroys all active child value plugins before rebuilding rows or tearing down the plugin. */
    private destroyChildPlugins(): void {
        for (const cp of this.childPlugins) {
            if (typeof cp.destroy === "function") {
                cp.destroy();
            }
        }
        this.childPlugins = [];
    }

    /** Reconstructs the visual rows in `this.rowsContainer` from the current `/entries` list. */
    private rebuildRows(): void {
        if (!this.rowsContainer || !this.localModel) return;
        this.destroyChildPlugins();
        this.rowsContainer.destroyItems();

        const rawEntries = this.localModel.getProperty("/entries");
        const entries: IDictionaryEntry[] = Array.isArray(rawEntries) ? rawEntries : [];
        const canEdit = this.isControlEditable();

        if (entries.length === 0) {
            this.rowsContainer.addItem(
                new Text({ text: I18n.getText(TEXT_KEY.dictionaryEmpty) }).addStyleClass("sapUiTinyMarginBottom")
            );
            return;
        }

        entries.forEach((_entry, idx) => {
            const { rowBox, valuePlugin } = DictionaryMapUtil.buildEntryRow({
                index: idx,
                canEdit,
                valueSchema: this.valueSchema,
                localModel: this.localModel!,
                scopeId: this.scopeId,
                fieldKey: this.fieldKey,
                engineContext: this.engineContext,
                staticProperties: this.metadata?.properties,
                onSync: () => this.syncToParentModel(),
                onRemove: (removeIdx) => this.removeEntry(removeIdx)
            });
            // `DictionaryMapUtil` parks each row's key and value labels in the row's `dependents`
            // aggregation, which UI5 never renders: the `labelFor` they carry resolves to nothing and the
            // inputs end up with no accessible name at all. Republish that text as an InvisibleText.
            AccessibilityUtil.materializeDependentLabels(rowBox);
            this.childPlugins.push(valuePlugin);
            this.rowsContainer?.addItem(rowBox);
        });
    }

    /** Validates dictionary keys and all nested entry value plugins. */
    public override validate(): { isValid: boolean; errorMessage?: string } {
        if (!this.control || !this.metadata || !this.isVisible()) return { isValid: true };
        if (this.hasInvalidKeys) {
            return { isValid: false, errorMessage: I18n.getText(TEXT_KEY.dictionaryInvalidKeys) };
        }

        let firstChildFailure: { isValid: boolean; errorMessage?: string } | null = null;
        for (const childPlugin of this.childPlugins) {
            const childRes = childPlugin.validate();
            if (typeof childPlugin.setVisualValidationState === "function") {
                childPlugin.setVisualValidationState(childRes.isValid, childRes.errorMessage);
            }
            if (!childRes.isValid && !firstChildFailure) {
                firstChildFailure = childRes;
            }
        }
        if (firstChildFailure) {
            return firstChildFailure;
        }

        return PayloadValidator.validateTree(
            this.metadata,
            this.getValue(),
            (ref) => this.engineContext?.getSchemaDefinition(ref) ?? null
        );
    }

    /** Retrieves the current dictionary object from the parent `JSONModel`. */
    protected getValue(): unknown {
        if (!this.control) return {};
        const parentModel = (this.control.getModel(this.modelName) || this.engineContext?.getModel()) as
            | JSONModel
            | undefined;
        return parentModel ? parentModel.getProperty(this.resolveAbsolutePath(this.control)) : {};
    }

    /** Re-applies editability state to the Add button and rebuilds entry rows. */
    protected applyState(): void {
        if (!this.control || !this.metadata) return;
        const canEdit = this.isControlEditable();
        if (this.addButton) {
            this.addButton.setVisible(canEdit);
        }
        this.rebuildRows();
    }

    /** Clears all visual validation errors across dictionary keys and child value plugins. */
    public override clearError(): void {
        this.hasInvalidKeys = false;
        this.refreshKeyValidityStates();
        for (const childPlugin of this.childPlugins) {
            childPlugin.clearError?.();
        }
        super.clearError();
    }

    /** Cleans up parent model bindings, child plugins, local JSONModel, and the outer control. */
    public override destroy(): void {
        if (this.parentBinding && this.parentBindingHandler) {
            this.parentBinding.detachChange(this.parentBindingHandler);
            this.parentBinding.destroy();
            this.parentBinding = undefined;
            this.parentBindingHandler = undefined;
        }
        this.destroyChildPlugins();
        if (this.localModel) {
            this.localModel.destroy();
            this.localModel = undefined;
        }
        this.rowsContainer = undefined;
        this.addButton = undefined;
        super.destroy();
    }
}
