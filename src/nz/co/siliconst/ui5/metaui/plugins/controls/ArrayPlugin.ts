/**
 * @file ArrayPlugin.ts
 * @description Renders a button in table cells or compact forms that opens a modal table editor for nested arrays.
 */

import { INestedDialogDescriptor, NestedDialogPlugin } from "./NestedDialogPlugin";
import { IPropertyMetadata, ISchema } from "../../interfaces/ISchema";
import { I18n, MetaUITextKey, TEXT_KEY } from "../../utils/I18n";

/**
 * Plugin responsible for rendering nested array triggers (`sap.m.Button`) inside table cells or forms,
 * launching a modal `DynamicHost` table dialog when pressed.
 *
 * @namespace nz.co.siliconst.ui5.metaui.plugins.controls
 * @public
 */
export class ArrayPlugin extends NestedDialogPlugin {
    protected readonly defaultErrorTooltipKey: MetaUITextKey = TEXT_KEY.nestedArrayInvalid;
    protected readonly emptyFallbackValue: unknown = [];

    /**
     * Resolves the default button label for nested arrays.
     *
     * @param metadata The property metadata.
     * @returns {string} The button label stem.
     */
    protected getDefaultLabel(metadata: IPropertyMetadata): string {
        return metadata.ui?.label || I18n.getText(TEXT_KEY.nestedArrayLabel);
    }

    /**
     * Resolves the list icon for the nested array trigger button.
     *
     * @param _canEdit Unused editability flag.
     * @returns {string} The SAP icon URI.
     */
    protected getButtonIcon(_canEdit: boolean): string {
        return "sap-icon://list";
    }

    /**
     * Coerces the current raw model value to an array.
     *
     * @param rawCurrent The raw model value.
     * @returns {unknown[]} The array payload.
     */
    protected override coerceCurrentData(rawCurrent: unknown): unknown {
        return Array.isArray(rawCurrent) ? rawCurrent : [];
    }

    /**
     * Coerces the saved modal payload to an array.
     *
     * @param extractedData The payload returned by the nested `DynamicHost`.
     * @returns {unknown[]} The saved array.
     */
    protected override coerceSavedData(extractedData: unknown): unknown {
        return Array.isArray(extractedData) ? extractedData : [];
    }

    /**
     * Builds the modal `layoutStrategy: "table"` sub-schema descriptor for the nested array.
     *
     * @param metadata The array property metadata.
     * @returns {INestedDialogDescriptor} The modal dialog descriptor.
     */
    protected buildDialogDescriptor(metadata: IPropertyMetadata): INestedDialogDescriptor {
        const title = metadata.ui?.label || I18n.getText(TEXT_KEY.nestedArrayLabel);
        const subSchema: ISchema = {
            title,
            type: "array",
            layoutStrategy: "table",
            items: metadata.items || { type: "object", properties: {} },
            uiLayout: metadata.items?.uiLayout || metadata.uiLayout,
            readOnly: metadata.readOnly,
            minItems: metadata.minItems,
            maxItems: metadata.maxItems,
            uniqueItems: metadata.uniqueItems,
            ui: this.buildSubSchemaUi(metadata)
        };
        return { title, subSchema, isArrayRoot: true };
    }
}
