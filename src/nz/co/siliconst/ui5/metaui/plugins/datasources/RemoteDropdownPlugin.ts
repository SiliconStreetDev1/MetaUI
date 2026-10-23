/**
 * @file RemoteDropdownPlugin.ts
 * @description Renders a sap.m.Select or sap.m.ComboBox populated asynchronously from a REST endpoint.
 */

import { OptionListPlugin } from "../controls/OptionListPlugin";
import { IPropertyMetadata } from "../../interfaces/ISchema";
import { ControlDirectiveUtil, extractDataSourceList } from "../../utils/ControlDirectiveUtil";
import Select from "sap/m/Select";
import ComboBox from "sap/m/ComboBox";
import Item from "sap/ui/core/Item";
import Control from "sap/ui/core/Control";
import JSONModel from "sap/ui/model/json/JSONModel";
import Event from "sap/ui/base/Event";
import { Logger } from "../../utils/Logger";
import { UrlValidator } from "../../utils/UrlValidator";
import { isRecord } from "../../utils/TypeGuards";
import { WIDGET_TYPE } from "../../constants/MetaUIConstants";

/**
 * Plugin responsible for rendering a `sap.m.Select` or `sap.m.ComboBox` (`ui.widget = "remoteDropdown"`, `"remoteSelect"`, or `"combobox"`)
 * populated asynchronously from a REST endpoint defined in `metadata.ui.dataSource` or `metadata.valueHelp`.
 *
 * @namespace nz.co.siliconst.ui5.metaui.plugins.datasources
 * @internal
 */
export class RemoteDropdownPlugin extends OptionListPlugin {
    private optionsModel?: JSONModel;

    /**
     * Renders a `ComboBox` or `Select` control in edit mode or a `Text` control in display mode.
     *
     * @param metadata The specific JSON schema properties for this field.
     * @param bindingPath The JSON path bound to this control.
     * @param modelName The UI5 JSONModel name.
     * @param engineScopeId The deterministic scope ID.
     * @param onChange The callback fired on value change.
     * @returns {Control} The configured Select, ComboBox, or Text control.
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

        if (this.optionsModel) {
            this.optionsModel.destroy();
        }
        this.optionsModel = new JSONModel({ items: [] });

        const isComboBox = metadata.ui?.widget === WIDGET_TYPE.COMBOBOX;
        const bindingInfo = this.generateBindingInfo(bindingPath, modelName, undefined, {
            formatter: (val: unknown) => {
                if (val !== undefined && val !== null && val !== "" && this.optionsModel) {
                    const strVal = String(val);
                    const currentItems =
                        (this.optionsModel.getProperty("/items") as Array<{ key: string; text: string }>) || [];
                    if (!currentItems.some((item) => item.key === strVal)) {
                        this.optionsModel.setProperty("/items", [...currentItems, { key: strVal, text: strVal }]);
                    }
                }
                return val !== undefined && val !== null ? String(val) : "";
            }
        }) as unknown as string;

        if (isComboBox) {
            const combo = new ComboBox({
                id: this.generateStableId(engineScopeId, bindingPath),
                selectedKey: bindingInfo,
                width: "100%",
                placeholder: metadata.ui?.placeholder || "",
                required: this.isRequired(),
                change: (oEvent: Event) => {
                    const src = oEvent.getSource() as ComboBox;
                    const nextVal = src.getSelectedKey() || src.getValue();
                    const model = (src.getModel(modelName) || this.engineContext?.getModel()) as JSONModel | undefined;
                    if (model) {
                        model.setProperty(this.resolveAbsolutePath(src), nextVal);
                    }
                    this.notifyChange(src.getId());
                }
            });
            this.control = combo;
        } else {
            const select = new Select({
                id: this.generateStableId(engineScopeId, bindingPath),
                selectedKey: bindingInfo,
                forceSelection: false,
                width: "100%",
                required: this.isRequired(),
                change: (oEvent: Event) => {
                    const src = oEvent.getSource() as Control;
                    this.notifyChange(src.getId());
                }
            });
            this.control = select;
        }

        const target = this.control as Select | ComboBox;
        target.setModel(this.optionsModel, "metaui_remote_opts");
        target.bindAggregation("items", {
            path: "metaui_remote_opts>/items",
            template: new Item({
                key: "{metaui_remote_opts>key}",
                text: "{metaui_remote_opts>text}"
            }),
            templateShareable: true
        });
        target.attachModelContextChange((oEvent: Event) => {
            const src = (oEvent.getSource() as Select | ComboBox) || target;
            this.ensureBoundValueItem(src);
        });
        this.applyCommonDirectives(this.control, metadata, modelName);
        void this.loadRemoteItems(target, metadata);

        return this.control;
    }

    /**
     * Ensures the currently bound model value exists in the `items` model so `sap.m.Select` displays it
     * even before async loading finishes or when operating offline.
     *
     * @param target The target `Select` or `ComboBox` control.
     */
    private ensureBoundValueItem(target: Select | ComboBox): void {
        if (target.isDestroyed() || !this.optionsModel) return;
        const boundVal = this.getModelValue(target);
        if (boundVal === undefined || boundVal === null || boundVal === "") return;
        const strVal = String(boundVal);
        const currentItems = (this.optionsModel.getProperty("/items") as Array<{ key: string; text: string }>) || [];
        const exists = currentItems.some((item) => item.key === strVal);
        if (!exists) {
            this.optionsModel.setProperty("/items", [...currentItems, { key: strVal, text: strVal }]);
        }
    }

    /**
     * Merges newly loaded items with any fallback items already registered from bound table rows.
     *
     * @param loadedItems The authoritative list of `{ key, text }` options.
     */
    private mergeAndSetItems(loadedItems: Array<{ key: string; text: string }>): void {
        if (!this.optionsModel) return;
        const existingItems = (this.optionsModel.getProperty("/items") as Array<{ key: string; text: string }>) || [];
        const loadedKeySet = new Set(loadedItems.map((it) => it.key));
        const merged = [...loadedItems];
        for (const existing of existingItems) {
            if (existing.key && !loadedKeySet.has(existing.key)) {
                loadedKeySet.add(existing.key);
                merged.push(existing);
            }
        }
        this.optionsModel.setProperty("/items", merged);
    }

    /**
     * Fetches remote options from the resolved `dataSource.url` and populates the control's `items` model.
     *
     * @param target The `Select` or `ComboBox` control to populate.
     * @param metadata The property metadata.
     */
    private async loadRemoteItems(target: Select | ComboBox, metadata: IPropertyMetadata): Promise<void> {
        const ds = ControlDirectiveUtil.resolveDataSourceConfig(metadata);
        if (!ds || !ds.url) {
            this.mergeAndSetItems(this.buildOptionItems(metadata, metadata.enum));
            this.ensureBoundValueItem(target);
            return;
        }

        if (!UrlValidator.isSafeDataSourceUrl(ds.url)) {
            Logger.warn(
                "[MetaUI RemoteDropdownPlugin]",
                `REFUSED dataSource.url '${ds.url}': blocked by the data source URL policy.`,
                "RemoteDropdownPlugin"
            );
            this.ensureBoundValueItem(target);
            return;
        }

        try {
            const response = await fetch(ds.url);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            const rawPayload: unknown = await response.json();
            if (target.isDestroyed() || !this.optionsModel) {
                return;
            }

            const rows = extractDataSourceList(rawPayload, ds.dataPath);
            const loadedItems: Array<{ key: string; text: string }> = [];

            for (const row of rows) {
                if (isRecord(row)) {
                    const keyVal = row[ds.keyField] !== undefined ? String(row[ds.keyField]) : "";
                    const textVal = row[ds.textField] !== undefined ? String(row[ds.textField]) : keyVal;
                    loadedItems.push({ key: keyVal, text: textVal });
                }
            }
            this.mergeAndSetItems(loadedItems);
            this.ensureBoundValueItem(target);
        } catch (err) {
            this.ensureBoundValueItem(target);
            Logger.error(
                "[MetaUI RemoteDropdownPlugin]",
                `Failed to fetch remote dropdown options: ${(err as Error).message}`,
                "RemoteDropdownPlugin"
            );
        }
    }

    /**
     * Retrieves the currently selected key from the `Select` or `ComboBox`.
     *
     * @param sourceControl Optional cloned row control to read from when bound inside a `TableLayout`.
     * @returns {unknown} The selected key string.
     */
    protected getValue(sourceControl?: Control): unknown {
        if (!this.isEditable) {
            return this.getModelValue(sourceControl) ?? "";
        }
        const target = sourceControl || this.control;
        if (!target) {
            return "";
        }
        const liveVal =
            target instanceof ComboBox
                ? target.getSelectedKey() || target.getValue()
                : typeof (target as Select).getSelectedKey === "function"
                  ? (target as Select).getSelectedKey()
                  : "";
        const itemCount =
            typeof (target as Select | ComboBox).getItems === "function"
                ? (target as Select | ComboBox).getItems().length
                : 0;
        if (liveVal === "" && (!target.getDomRef() || itemCount === 0)) {
            const modelVal = this.getModelValue(target);
            if (modelVal !== undefined && modelVal !== null) {
                return modelVal;
            }
        }
        return liveVal;
    }

    /**
     * Applies dynamic `readOnly` and `required` state updates to the `Select` or `ComboBox`.
     */
    protected applyState(): void {
        if (!this.control || !this.metadata || !this.isEditable) {
            return;
        }
        const target = this.control as Select | ComboBox;
        target.setEditable(this.isControlEditable());
        target.setRequired(this.isRequired());
    }

    /**
     * Destroys the internal options `JSONModel` and primary UI5 control.
     */
    public override destroy(): void {
        if (this.optionsModel) {
            this.optionsModel.destroy();
            this.optionsModel = undefined;
        }
        super.destroy();
    }
}
