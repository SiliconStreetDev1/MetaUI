/**
 * @file DictionaryMapPlugin.ts
 * @description Plugin for rendering open-ended JSON Dictionaries (additionalProperties).
 */

import { BasePlugin } from "./BasePlugin";
import { ISchema, IPropertyMetadata } from "../../interfaces/ISchema";
import { PluginRegistry } from "../../core/PluginRegistry";
import VBox from "sap/m/VBox";
import HBox from "sap/m/HBox";
import Input from "sap/m/Input";
import Button from "sap/m/Button";
import Title from "sap/m/Title";
import Table from "sap/m/Table";
import Column from "sap/m/Column";
import Label from "sap/m/Label";
import ColumnListItem from "sap/m/ColumnListItem";
import JSONModel from "sap/ui/model/json/JSONModel";
import Control from "sap/ui/core/Control";
import Dialog from "sap/m/Dialog";
import Toolbar from "sap/m/Toolbar";
import ToolbarSpacer from "sap/m/ToolbarSpacer";

/**
 * Plugin for rendering open-ended JSON Dictionaries (additionalProperties).
 * Uses a local JSONModel and sap.m.Table to provide a stable, zero-hack UI5 two-way binding experience.
 * 
 * @public
 */
export default class DictionaryMapPlugin extends BasePlugin {
    private _isSyncing: boolean = false;
    private _binding: sap.ui.model.PropertyBinding | null = null;

    public canHandle(schema: ISchema | IPropertyMetadata): boolean {
        return schema.type === "object" && typeof schema.additionalProperties === "object";
    }

    public render(
        schema: ISchema | IPropertyMetadata, 
        bindingPath: string, 
        modelName: string, 
        engineScopeId: string, 
        onChange?: () => void, 
        model?: sap.ui.model.Model
    ): Control {
        this.onChange = onChange;
        this.metadata = schema as IPropertyMetadata;



        const valueSchema = (schema.additionalProperties as IPropertyMetadata) || { type: "string" };
        const container = new VBox({ width: "100%" }).addStyleClass("sapUiSmallMarginTopBottom");
        
        const absolutePath = bindingPath.startsWith("/") ? bindingPath : `/${bindingPath}`;
        
        // 1. Initialize local flat array model for the Table
        const currentData = model ? model.getProperty(absolutePath) || {} : {};

        
        const localItems = Object.keys(currentData).map(k => ({ key: k, value: currentData[k] }));
        const localModel = new JSONModel({ items: localItems });
        
        // Setup listener to flush local model back to parent dictionary model
        const syncToParent = () => {
            if (!model) return;
            this._isSyncing = true;
            const items = localModel.getProperty("/items") as Record<string, unknown>[];
            const newDict: Record<string, unknown> = {};
            items.forEach(item => {
                if (item.key && item.key.trim() !== "") {
                    newDict[item.key] = item.value;
                }
            });

            model.setProperty(absolutePath, newDict);
            if (this.onChange) this.onChange();
            this._isSyncing = false;
        };

        if (model) {
            this._binding = model.bindProperty(absolutePath);
            this._binding.attachChange(() => {
                if (this._isSyncing) return;
                const currentData = model.getProperty(absolutePath) || {};

                const localItems = Object.keys(currentData).map(k => ({ key: k, value: currentData[k] }));
                localModel.setProperty("/items", localItems);
            });
            this._binding.initialize();
        }

        const headerItems: Control[] = [
            new Title({ text: schema.title || schema.ui?.label || "Dictionary Map", level: "H5" })
        ];

        if (this.isEditable) {
            headerItems.push(
                new Button({
                    text: "Add Property",
                    icon: "sap-icon://add",
                    press: () => {
                        const items = localModel.getProperty("/items") as Record<string, unknown>[];
                        items.push({ key: "", value: null });
                        localModel.setProperty("/items", items);
                        syncToParent();
                    }
                })
            );
        }

        const header = new HBox({
            justifyContent: "SpaceBetween",
            alignItems: "Center",
            items: headerItems
        }).addStyleClass("sapUiSmallMarginBottom");

        container.addItem(header);

        // 2. Build the Table
        const columns = [
            new Column({ header: new Label({ text: "Key" }) }),
            new Column({ header: new Label({ text: "Value" }) })
        ];

        if (this.isEditable) {
            columns.push(new Column({ width: "4rem", hAlign: "Center" }));
        }

        const table = new Table({
            mode: "None",
            noDataText: "No metadata properties defined.",
            columns: columns
        });

        table.setModel(localModel, "localDict");

        table.bindItems({
            path: "localDict>/items",
            factory: (sId: string, oContext: sap.ui.model.Context) => {
                const rowPath = oContext.getPath();
                
                // Key Input
                const keyInput = new Input({
                    value: "{localDict>key}",
                    editable: this.isEditable,
                    change: () => syncToParent()
                });

                // Value Control
                const plugin = PluginRegistry.getInstance().getPlugin(valueSchema.type || "string", valueSchema.ui?.widget);
                
                // Temporarily override value schema readOnly state if the dictionary as a whole is readOnly
                const effectiveValueSchema = { ...valueSchema };
                if (!this.isEditable) {
                    if (!effectiveValueSchema.ui) effectiveValueSchema.ui = {};
                    effectiveValueSchema.ui.readOnly = true;
                }

                const valueControl = plugin.render(
                    effectiveValueSchema,
                    `${rowPath}/value`,
                    "localDict",
                    "dict_" + Date.now(),
                    () => syncToParent(),
                    localModel
                );

                const cells: Control[] = [keyInput, valueControl];

                if (this.isEditable) {
                    const delBtn = new Button({
                        icon: "sap-icon://delete",
                        type: "Reject",
                        press: () => {
                            const items = localModel.getProperty("/items") as Record<string, unknown>[];
                            const matchIndex = parseInt(rowPath.split("/").pop() || "0", 10);
                            items.splice(matchIndex, 1);
                            localModel.setProperty("/items", items);
                            syncToParent();
                        }
                    });
                    cells.push(delBtn);
                }

                return new ColumnListItem({ cells });
            }
        });

        container.addItem(table);

        this.control = new Button({
            id: this.generateStableId(engineScopeId, bindingPath),
            text: !this.isEditable ? "View Dictionary" : "Edit Dictionary",
            icon: !this.isEditable ? "sap-icon://display" : "sap-icon://form",
            press: () => {

                const dialog = new Dialog({
                    title: schema.title || schema.ui?.label || "Dictionary Map",
                    contentWidth: "600px",
                    contentHeight: "400px",
                    horizontalScrolling: false,
                    content: [container],
                    buttons: [
                        new Button({
                            text: !this.isEditable ? "Close" : "OK",
                            type: "Emphasized",
                            press: () => {
                                dialog.close();
                            }
                        })
                    ],
                    afterClose: () => {
                        // Remove container so it isn't destroyed when the dialog is destroyed
                        dialog.removeAllContent();
                        dialog.destroy();
                    }
                });
                
                // Add dependent to ensure models are inherited properly if needed
                if (this.control) {
                    this.control.addDependent(dialog);
                }
                dialog.open();
            }
        });

        this.applyCommonDirectives(this.control, schema, modelName);

        return this.control as Control;
    }

    protected getValue(): unknown {
        return null;
    }

    public validate(): import("../../interfaces/IPlugin").IPluginValidationResult {
        return { isValid: true };
    }

    protected applyState(): void {
    }

    public destroy(): void {
        if (this._binding) {
            this._binding.destroy();
            this._binding = null;
        }
        super.destroy();
    }
}
