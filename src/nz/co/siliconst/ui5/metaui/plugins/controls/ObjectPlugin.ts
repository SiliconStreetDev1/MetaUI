/**
 * @file ObjectPlugin.ts
 * @description Renders a button that launches a modal DynamicHost dialog for nested object editing,
 * and validates nested object payloads headlessly via PayloadValidator.
 */

import { INestedDialogDescriptor, NestedDialogPlugin } from "./NestedDialogPlugin";
import { IPropertyMetadata, ISchema } from "../../interfaces/ISchema";
import { isRecord } from "../../utils/TypeGuards";
import { I18n, MetaUITextKey, TEXT_KEY } from "../../utils/I18n";

/**
 * Plugin responsible for rendering nested object triggers (`sap.m.Button`) inside forms or table cells,
 * opening a modal `DynamicHost` dialog when pressed.
 *
 * @namespace nz.co.siliconst.ui5.metaui.plugins.controls
 * @public
 */
export class ObjectPlugin extends NestedDialogPlugin {
    protected readonly defaultErrorTooltipKey: MetaUITextKey = TEXT_KEY.nestedObjectInvalid;
    protected readonly emptyFallbackValue: unknown = null;

    /**
     * Resolves the default button label for nested objects.
     *
     * @param metadata The property metadata.
     * @returns {string} The button label stem.
     */
    protected getDefaultLabel(metadata: IPropertyMetadata): string {
        return metadata.ui?.label || I18n.getText(TEXT_KEY.nestedObjectLabel);
    }

    /**
     * Resolves the edit/display icon for the nested object trigger button.
     *
     * @param canEdit True if editable.
     * @returns {string} The SAP icon URI.
     */
    protected getButtonIcon(canEdit: boolean): string {
        return canEdit ? "sap-icon://edit" : "sap-icon://display";
    }

    /**
     * Coerces the current raw model value to a record object.
     *
     * @param rawCurrent The raw model value.
     * @returns {Record<string, unknown>} The record payload.
     */
    protected override coerceCurrentData(rawCurrent: unknown): unknown {
        return isRecord(rawCurrent) ? rawCurrent : {};
    }

    /**
     * Builds the modal sub-schema descriptor for the nested object.
     *
     * @param metadata The nested object's property metadata.
     * @returns {INestedDialogDescriptor} The modal dialog descriptor.
     */
    protected buildDialogDescriptor(metadata: IPropertyMetadata): INestedDialogDescriptor {
        const title = metadata.ui?.label || I18n.getText(TEXT_KEY.nestedObjectTitle);
        const subSchema: ISchema = {
            title,
            type: "object",
            properties: metadata.properties || {},
            additionalProperties: metadata.additionalProperties,
            uiLayout: metadata.uiLayout,
            readOnly: metadata.readOnly,
            minProperties: metadata.minProperties,
            maxProperties: metadata.maxProperties,
            required: Array.isArray(metadata.required) ? metadata.required : undefined,
            ui: this.buildSubSchemaUi(metadata)
        };
        return { title, subSchema, isArrayRoot: false };
    }
}
