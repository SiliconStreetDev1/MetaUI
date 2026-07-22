/**
 * @file RemoteValueHelpPlugin.ts
 * @description A custom datasource plugin that simulates fetching data from a remote server.
 */

import { BasePlugin } from "../controls/BasePlugin";
import { IPropertyMetadata, IRemoteValueHelpConfig } from "../../interfaces/ISchema";
import ComboBox from "sap/m/ComboBox";
import Item from "sap/ui/core/Item";
import Control from "sap/ui/core/Control";
import { Logger } from "../../utils/Logger";

/**
 * A custom datasource plugin that simulates fetching data from a remote server.
 * Proves out custom data sources that dynamically load value help.
 * 
 * @namespace nz.co.siliconst.ui5.metaui.plugins.datasources
 * @public
 */
export class RemoteValueHelpPlugin extends BasePlugin {
    private isLoaded = false;

    /**
     * Renders a `ComboBox` that simulates fetching data from a remote server.
     * 
     * @param fieldMetadata The specific JSON schema properties for this field.
     * @param bindingPath The JSON path bound to this control.
     * @param modelName The UI5 JSONModel name.
     * @returns {Control} The configured ComboBox control.
     */
    public render(fieldMetadata: IPropertyMetadata, bindingPath: string, modelName: string = "meta"): Control {
        this.metadata = fieldMetadata;
        
        const comboBox = new ComboBox({
            selectedKey: `{${modelName}>${bindingPath}}`,
            enabled: !fieldMetadata.ui?.readOnly,
            placeholder: "Select a country...",
            change: (oEvent: sap.ui.base.Event) => {
                const item = (oEvent as sap.ui.base.Event).getParameter("selectedItem");
                const val = item ? item.getKey() : (oEvent as sap.ui.base.Event).getParameter("value"); // Allow free text as well
                this.validate();
            }
        });

        // Perform an async load against the REST endpoint
        comboBox.attachEventOnce("loadItems", () => {
            this.fetchData(comboBox);
        });

        this.control = comboBox;
        return this.control as Control;
    }

    /**
     * Executes the REST fetch for data.
     * @param comboBox The UI5 ComboBox to populate.
     */
    protected fetchData(comboBox: ComboBox): void {
        const vhConfig = this.metadata?.valueHelp as IRemoteValueHelpConfig;
        if (!vhConfig || !vhConfig.url) {
            Logger.error("RemoteValueHelpPlugin requires a valid valueHelp configuration with a URL.", "", "RemoteValueHelpPlugin");
            return;
        }
        
        comboBox.setBusy(true);
        
        fetch(vhConfig.url)
            .then(res => res.json())
            .then((data: Record<string, unknown>[]) => {
                const keyPath = vhConfig.keyPath || "key";
                const textPath = vhConfig.textPath || "text";
                
                data.forEach(itemData => {
                    comboBox.addItem(new Item({ 
                        key: itemData[keyPath], 
                        text: itemData[textPath] || itemData[keyPath]
                    }));
                });
            })
            .catch(err => {
                Logger.error("Failed to load value help from " + vhConfig.url, err.message, "RemoteValueHelpPlugin");
            })
            .finally(() => {
                comboBox.setBusy(false);
                this.isLoaded = true;
            });
    }

    /**
     * Retrieves the current selected key.
     * @returns {unknown} The selected key.
     */
    protected getValue(): unknown {
        return this.control ? (this.control as ComboBox).getSelectedKey() : null;
    }

    /**
     * Applies dynamic read-only state.
     */
    protected applyState(): void {
        if (this.control && this.metadata) {
            (this.control as ComboBox).setEnabled(!this.metadata.ui?.readOnly);
        }
    }
}
