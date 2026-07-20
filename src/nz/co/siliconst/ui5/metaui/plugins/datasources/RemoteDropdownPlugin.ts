/**
 * @file RemoteDropdownPlugin.ts
 * @description Renders a sap.m.Select that fetches valueHelp remotely via a JSON URL.
 */

import { BasePlugin } from "../controls/BasePlugin";
import { IPropertyMetadata, IRemoteValueHelpConfig } from "../../interfaces/ISchema";
import Select from "sap/m/Select";
import Item from "sap/ui/core/Item";
import Control from "sap/ui/core/Control";
import { Logger } from "../../utils/Logger";

/**
 * Handles rendering logic for dropdown inputs fetching data remotely.
 * Maps a URL response array to `sap.ui.core.Item` elements.
 * 
 * @namespace nz.co.siliconst.ui5.metaui.plugins.datasources
 * @public
 */
export class RemoteDropdownPlugin extends BasePlugin {
    
    public render(fieldMetadata: IPropertyMetadata, bindingPath: string, modelName: string = "meta", engineScopeId?: string, onChange?: (isValid: boolean, fieldKey?: string) => void): Control {
        this.onChange = onChange;
        this.metadata = fieldMetadata;

        const config = fieldMetadata.valueHelp as IRemoteValueHelpConfig;
        if (!config || !config.url) {
            Logger.warn("[MetaUI RemoteDropdownPlugin] No valid URL provided for remoteDropdown.");
            return new sap.m.Text({ text: "Error: No URL provided" }) as Control;
        }
        
        if (this.isDisplayMode) {
            sap.ui.requireSync("sap/m/Text");
            const TextControl = sap.ui.require("sap/m/Text");
            
            this.control = new TextControl({
                id: this.generateStableId(engineScopeId, bindingPath),
                text: `{${modelName}>${bindingPath}}` // We might not have the text mapping synchronously
            });
            
            // Optionally, we could fetch data and update the text formatter here
            
            this.applyCommonDirectives(this.control, fieldMetadata, modelName);
            return this.control as Control;
        }

        const select = new Select({
            id: this.generateStableId(engineScopeId, bindingPath),
            selectedKey: `{${modelName}>${bindingPath}}`,
            enabled: !fieldMetadata.ui?.readOnly,
            forceSelection: false,
            busy: true, // Show busy indicator while fetching
            change: (oEvent: sap.ui.base.Event) => {
                const result = this.validate();
                if (this.onChange) {
                    this.onChange(result.isValid, this.fieldKey);
                }
            }
        });

        // Add empty placeholder
        select.addItem(new Item({ key: "", text: "--- Select ---" }));

        // Fetch data remotely
        fetch(config.url)
            .then(res => {
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return res.json();
            })
            .then(data => {
                const arr = Array.isArray(data) ? data : (data.value || []);
                arr.forEach((item: any) => {
                    const k = config.keyPath ? item[config.keyPath] : item;
                    const t = config.textPath ? item[config.textPath] : item;
                    select.addItem(new Item({ key: String(k), text: String(t) }));
                });
                select.setBusy(false);
            })
            .catch(err => {
                Logger.error(`[MetaUI RemoteDropdownPlugin] Failed to fetch remote data from ${config.url}`, err.message);
                select.addItem(new Item({ key: "", text: "Error loading data" }));
                select.setBusy(false);
            });

        this.control = select;
        this.applyCommonDirectives(this.control, fieldMetadata, modelName);
        return this.control as Control;
    }

    protected getValue(): any {
        return this.control ? (this.control as Select).getSelectedKey() : null;
    }

    protected applyState(): void {
        if (this.control && this.metadata) {
            if (this.isDisplayMode) return;
            const select = this.control as Select;
            select.setEnabled(!this.metadata.ui?.readOnly);
        }
    }
}
