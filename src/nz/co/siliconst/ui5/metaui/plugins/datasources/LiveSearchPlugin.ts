/**
 * @file LiveSearchPlugin.ts
 * @description A custom datasource plugin that provides asynchronous live search (autocomplete) functionality.
 */

import { BasePlugin } from "../controls/BasePlugin";
import { IPropertyMetadata } from "../../interfaces/ISchema";
import Input from "sap/m/Input";
import Item from "sap/ui/core/Item";
import Control from "sap/ui/core/Control";
import { Logger } from "../../utils/Logger";

/**
 * A custom datasource plugin that provides asynchronous live search (autocomplete) functionality.
 * As the user types, it fetches suggestions from a remote endpoint.
 * 
 * @namespace nz.co.siliconst.ui5.metaui.plugins.datasources
 * @public
 */
export class LiveSearchPlugin extends BasePlugin {
    public render(fieldMetadata: IPropertyMetadata, bindingPath: string, modelName: string = "meta"): Control {
        this.metadata = fieldMetadata;
        
        const input = new Input({
            value: `{${modelName}>${bindingPath}}`,
            enabled: !fieldMetadata.ui?.readOnly,
            placeholder: "Type to search...",
            showSuggestion: true,
            suggest: (oEvent: unknown) => {
                const query = (oEvent as { getParameter: (s: string) => unknown }).getParameter("suggestValue");
                this.fetchSuggestions(input, query);
            },
            change: (oEvent: unknown) => {
                this.validate();
            }
        });

        this.control = input;
        return this.control as Control;
    }

    /**
     * Executes the REST fetch for suggestions based on a query. Can be overridden by mock subclasses.
     * @param input The UI5 Input to populate with suggestions.
     * @param query The text typed by the user.
     */
    protected fetchSuggestions(input: Input, query: string): void {
        const vhConfig = this.metadata?.valueHelp as unknown as Record<string, unknown>;
        if (!vhConfig || !vhConfig.url) {
            Logger.error("LiveSearchPlugin requires a valid valueHelp configuration with a URL.", "", "LiveSearchPlugin");
            return;
        }

        if (!query) {
            input.removeAllSuggestionItems();
            return;
        }
        
        input.setBusy(true);
        
        // In a real application, the query parameter would be passed to the backend (e.g. ?q=query)
        // Here, we simulate fetching and filter locally, but subclasses can override this entirely.
        fetch(vhConfig.url)
            .then(res => res.json())
            .then((data: unknown[]) => {
                const keyPath = vhConfig.keyPath || "key";
                const textPath = vhConfig.textPath || "text";
                
                input.removeAllSuggestionItems();

                // Simple client-side filter for demonstration
                const lowerQuery = query.toLowerCase();
                const filteredData = data.filter(item => {
                    const textValue = String(item[textPath] || item[keyPath]).toLowerCase();
                    return textValue.includes(lowerQuery);
                });
                
                filteredData.forEach(itemData => {
                    input.addSuggestionItem(new Item({ 
                        key: itemData[keyPath], 
                        text: itemData[textPath] || itemData[keyPath]
                    }));
                });
            })
            .catch(err => {
                Logger.error("Failed to load value help from " + vhConfig.url, err.message, "LiveSearchPlugin");
            })
            .finally(() => {
                input.setBusy(false);
            });
    }

    protected getValue(): any {
        return this.control ? (this.control as Input).getValue() : null;
    }

    protected applyState(): void {
        if (this.control && this.metadata) {
            (this.control as Input).setEnabled(!this.metadata.ui?.readOnly);
        }
    }
}
