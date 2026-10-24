/**
 * @file RemoteValueHelpPlugin.ts
 * @description Renders a sap.m.Input with a ValueHelp icon that opens a sap.m.SelectDialog populated from a REST API.
 */

import { TextLikeInputPlugin } from "../controls/TextLikeInputPlugin";
import { IPropertyMetadata } from "../../interfaces/ISchema";
import { ControlDirectiveUtil, extractDataSourceList } from "../../utils/ControlDirectiveUtil";
import Input from "sap/m/Input";
import SelectDialog from "sap/m/SelectDialog";
import StandardListItem from "sap/m/StandardListItem";
import Control from "sap/ui/core/Control";
import JSONModel from "sap/ui/model/json/JSONModel";
import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";
import ListBinding from "sap/ui/model/ListBinding";
import Event from "sap/ui/base/Event";
import { Logger } from "../../utils/Logger";
import { UrlValidator } from "../../utils/UrlValidator";
import { isRecord } from "../../utils/TypeGuards";
import { I18n, TEXT_KEY } from "../../utils/I18n";

/**
 * Plugin responsible for rendering an `Input` with a Value Help dialog (`sap.m.SelectDialog`)
 * populated asynchronously from a REST endpoint (`ui.widget = "valueHelp"`).
 *
 * @namespace nz.co.siliconst.ui5.metaui.plugins.datasources
 * @internal
 */
export class RemoteValueHelpPlugin extends TextLikeInputPlugin {
    private selectDialog?: SelectDialog;
    private dialogModel?: JSONModel;
    private activeTargetInput?: Input;

    /**
     * Constructs a `sap.m.Input` with `showValueHelp: true`.
     *
     * @param metadata The specific JSON schema properties for this field.
     * @param bindingPath The JSON path bound to this control.
     * @param modelName The UI5 JSONModel name.
     * @param engineScopeId The deterministic scope ID.
     * @returns {Control} The configured Input control.
     */
    protected createEditableControl(
        metadata: IPropertyMetadata,
        bindingPath: string,
        modelName: string,
        engineScopeId?: string
    ): Control {
        return new Input({
            id: this.generateStableId(engineScopeId, bindingPath),
            value: this.generateBindingInfo(bindingPath, modelName) as unknown as string,
            placeholder: metadata.ui?.placeholder || I18n.getText(TEXT_KEY.dataSourceValueHelpPlaceholder),
            required: this.isRequired(),
            showValueHelp: true,
            valueHelpRequest: (oEvent: Event) => {
                const src = oEvent.getSource() as Input;
                void this.openValueHelpDialog(src, metadata);
            },
            change: (oEvent: Event) => {
                const src = oEvent.getSource() as Input;
                this.notifyChange(src.getId());
            }
        });
    }

    /**
     * Lazily creates and opens the `sap.m.SelectDialog`, fetching remote items from `metadata.ui.dataSource`.
     *
     * @param input The owning `sap.m.Input` control.
     * @param metadata The property metadata containing `ui.dataSource`.
     */
    protected async openValueHelpDialog(input: Input, metadata: IPropertyMetadata): Promise<void> {
        const ds = ControlDirectiveUtil.resolveDataSourceConfig(metadata);
        if (!ds || !ds.url) {
            Logger.warn("Missing dataSource.url for valueHelp widget.", undefined, "RemoteValueHelpPlugin");
            return;
        }
        if (!UrlValidator.isSafeDataSourceUrl(ds.url)) {
            Logger.warn(`REFUSED dataSource.url '${ds.url}': blocked by the data source URL policy.`, undefined, "RemoteValueHelpPlugin");
            return;
        }

        this.activeTargetInput = input;

        if (!this.selectDialog) {
            this.dialogModel = new JSONModel({ items: [] });
            const applyDialogFilter = (oEvent: Event): void => {
                const params = oEvent.getParameters() as { value?: string; itemsBinding?: ListBinding };
                const sValue = (params.value || "").trim();
                const binding = params.itemsBinding;
                if (binding) {
                    if (!sValue) {
                        binding.filter([]);
                        return;
                    }
                    const combinedFilter = new Filter({
                        filters: [
                            new Filter(ds.textField, FilterOperator.Contains, sValue),
                            new Filter(ds.keyField, FilterOperator.Contains, sValue)
                        ],
                        and: false
                    });
                    binding.filter([combinedFilter]);
                }
            };
            this.selectDialog = new SelectDialog({
                title: metadata.ui?.label || I18n.getText(TEXT_KEY.dataSourceValueHelpTitle),
                liveChange: applyDialogFilter,
                search: applyDialogFilter,
                confirm: (oEvent: Event) => {
                    const targetInput = this.activeTargetInput || (this.control as Input);
                    const params = oEvent.getParameters() as { selectedItem?: StandardListItem };
                    const selectedItem = params.selectedItem;
                    if (selectedItem && targetInput) {
                        const selectedKey = selectedItem.getDescription() || selectedItem.getTitle();
                        targetInput.setValue(selectedKey);
                        this.commitValue(targetInput, selectedKey);
                        this.notifyChange(targetInput.getId());
                    }
                }
            });

            this.selectDialog.setModel(this.dialogModel, "vh");
            this.selectDialog.bindAggregation("items", {
                path: "vh>/items",
                template: new StandardListItem({
                    title: `{vh>${ds.textField}}`,
                    description: `{vh>${ds.keyField}}`
                })
            });
        }

        try {
            const response = await fetch(ds.url);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            const rawData: unknown = await response.json();
            if (!this.selectDialog || this.selectDialog.isDestroyed() || input.isDestroyed()) {
                return;
            }
            const list = extractDataSourceList(rawData, ds.dataPath).map((entry) => {
                if (!isRecord(entry)) {
                    return entry;
                }
                const clone: Record<string, unknown> = { ...entry };
                if (clone[ds.keyField] !== undefined && clone[ds.keyField] !== null) {
                    clone[ds.keyField] = String(clone[ds.keyField]);
                }
                if (clone[ds.textField] !== undefined && clone[ds.textField] !== null) {
                    clone[ds.textField] = String(clone[ds.textField]);
                }
                return clone;
            });
            this.dialogModel?.setProperty("/items", list);
        } catch (err) {
            Logger.error(`Failed to load ValueHelp data: ${(err as Error).message}`, undefined, "RemoteValueHelpPlugin");
            if (!this.selectDialog || this.selectDialog.isDestroyed() || input.isDestroyed()) {
                return;
            }
        }

        const itemsBinding = this.selectDialog.getBinding("items") as ListBinding | undefined;
        itemsBinding?.filter([]);
        this.selectDialog.open("");
    }

    /**
     * Destroys the cached `SelectDialog`, its `JSONModel`, and the primary `Input` control.
     */
    public override destroy(): void {
        if (this.selectDialog) {
            this.selectDialog.destroy();
            this.selectDialog = undefined;
        }
        if (this.dialogModel) {
            this.dialogModel.destroy();
            this.dialogModel = undefined;
        }
        super.destroy();
    }
}
