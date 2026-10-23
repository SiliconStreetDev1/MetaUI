/**
 * @file LiveSearchPlugin.ts
 * @description Renders a sap.m.Input with live type-ahead suggestions fetched from a remote REST endpoint.
 */

import { TextLikeInputPlugin } from "../controls/TextLikeInputPlugin";
import { IDataSourceConfig, IPropertyMetadata } from "../../interfaces/ISchema";
import { ControlDirectiveUtil, extractDataSourceList } from "../../utils/ControlDirectiveUtil";
import Input from "sap/m/Input";
import SuggestionItem from "sap/m/SuggestionItem";
import Control from "sap/ui/core/Control";
import Event from "sap/ui/base/Event";
import { Logger } from "../../utils/Logger";
import { UrlValidator } from "../../utils/UrlValidator";
import { isRecord } from "../../utils/TypeGuards";
import { I18n, TEXT_KEY } from "../../utils/I18n";

/**
 * Plugin responsible for rendering an `Input` control with remote live type-ahead suggestions (`ui.widget = "liveSearch"`).
 * Includes debounce throttling and monotonic request sequencing to discard out-of-order network responses.
 *
 * @namespace nz.co.siliconst.ui5.metaui.plugins.datasources
 * @public
 */
export class LiveSearchPlugin extends TextLikeInputPlugin {
    private debounceTimer?: ReturnType<typeof setTimeout>;
    private requestSequence: number = 0;

    /**
     * Constructs a `sap.m.Input` configured with `showSuggestion: true` and remote suggestion fetching.
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
        const ds = ControlDirectiveUtil.resolveDataSourceConfig(metadata);
        return new Input({
            id: this.generateStableId(engineScopeId, bindingPath),
            value: this.generateBindingInfo(bindingPath, modelName) as unknown as string,
            placeholder: metadata.ui?.placeholder || I18n.getText(TEXT_KEY.dataSourceSearchPlaceholder),
            required: this.isRequired(),
            showSuggestion: true,
            startSuggestion: 2,
            filterSuggests: false,
            suggest: (oEvent: Event) => {
                const src = oEvent.getSource() as Input;
                const params = oEvent.getParameters() as { suggestValue?: string };
                const term = params.suggestValue || "";
                this.scheduleSearch(src, term, ds);
            },
            suggestionItemSelected: (oEvent: Event) => {
                const src = oEvent.getSource() as Input;
                const params = oEvent.getParameters() as { selectedItem?: SuggestionItem };
                const selectedItem = params.selectedItem;
                if (selectedItem) {
                    const selectedVal = selectedItem.getKey() || selectedItem.getText();
                    src.setValue(selectedVal);
                    this.commitValue(src, selectedVal);
                }
                this.notifyChange(src.getId());
            },
            change: (oEvent: Event) => {
                const src = oEvent.getSource() as Input;
                this.notifyChange(src.getId());
            }
        });
    }

    /**
     * Schedules a debounced remote search query (250ms) and cancels any pending timer.
     *
     * @param input The target `sap.m.Input` control.
     * @param term The user's search term.
     * @param ds The configured `IDataSourceConfig` block.
     */
    private scheduleSearch(input: Input, term: string, ds?: IDataSourceConfig): void {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }
        if (!ds || !ds.url || term.trim().length < 2) {
            return;
        }
        if (!UrlValidator.isSafeDataSourceUrl(ds.url)) {
            Logger.warn(
                "[MetaUI LiveSearchPlugin]",
                `REFUSED dataSource.url '${ds.url}': blocked by the data source URL policy, no search term was sent.`,
                "LiveSearchPlugin"
            );
            return;
        }
        const currentSeq = ++this.requestSequence;
        this.debounceTimer = setTimeout(() => {
            void this.executeSearch(input, term.trim(), ds.url, ds.keyField, ds.textField, ds.dataPath, currentSeq);
        }, 250);
    }

    /**
     * Executes the remote HTTP request and populates `SuggestionItem` aggregations if the sequence is still current.
     *
     * @param input The target `sap.m.Input` control.
     * @param term The search query string.
     * @param urlTemplate The endpoint URL or template containing `{query}`.
     * @param keyField The JSON property key for item keys.
     * @param textField The JSON property key for item display text.
     * @param dataPath Optional dot-separated path to the array inside the response payload.
     * @param seq The monotonic request sequence number.
     */
    private async executeSearch(
        input: Input,
        term: string,
        urlTemplate: string,
        keyField: string,
        textField: string,
        dataPath: string | undefined,
        seq: number
    ): Promise<void> {
        try {
            const targetUrl = urlTemplate.includes("{query}")
                ? urlTemplate.replace("{query}", encodeURIComponent(term))
                : `${urlTemplate}${urlTemplate.includes("?") ? "&" : "?"}q=${encodeURIComponent(term)}`;

            if (!UrlValidator.isSafeDataSourceUrl(targetUrl)) {
                throw new Error("target URL blocked by the data source URL policy");
            }

            const response = await fetch(targetUrl);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const rawPayload: unknown = await response.json();
            if (seq !== this.requestSequence || input.isDestroyed()) {
                return;
            }

            const items = extractDataSourceList(rawPayload, dataPath);
            input.destroySuggestionItems();

            for (const row of items) {
                if (isRecord(row)) {
                    const keyVal = row[keyField] !== undefined ? String(row[keyField]) : "";
                    const textVal = row[textField] !== undefined ? String(row[textField]) : keyVal;
                    input.addSuggestionItem(
                        new SuggestionItem({
                            key: keyVal,
                            text: textVal,
                            description: keyVal !== textVal ? keyVal : ""
                        })
                    );
                }
            }
        } catch (err) {
            Logger.warn(
                "[MetaUI LiveSearchPlugin]",
                `Live search request failed: ${(err as Error).message}`,
                "LiveSearchPlugin"
            );
        }
    }

    /**
     * Clears any pending debounce timer and destroys the underlying UI5 control.
     */
    public override destroy(): void {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = undefined;
        }
        super.destroy();
    }
}
