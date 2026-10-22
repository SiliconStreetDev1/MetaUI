/**
 * @file ReferencePlugin.ts
 * @description Renders a button that resolves a $ref schema definition and opens a modal DynamicHost dialog.
 */

import { INestedDialogDescriptor, NestedDialogPlugin } from "./NestedDialogPlugin";
import { IPropertyMetadata, ISchema } from "../../interfaces/ISchema";
import { Logger } from "../../utils/Logger";

/**
 * Plugin responsible for rendering `$ref` schema reference triggers (`sap.m.Button`).
 * Resolves the target schema definition from the owning `Engine` context and opens a modal `DynamicHost` dialog.
 *
 * @namespace nz.co.siliconst.ui5.metaui.plugins.controls
 * @public
 */
export class ReferencePlugin extends NestedDialogPlugin {
    protected readonly defaultErrorTooltip: string = "Invalid referenced entity";
    protected readonly emptyFallbackValue: unknown = null;

    /**
     * Resolves the default button label from `metadata.ui.label` or the `$ref` tail segment.
     *
     * @param metadata The property metadata.
     * @returns {string} The button label stem.
     */
    protected getDefaultLabel(metadata: IPropertyMetadata): string {
        return metadata.ui?.label || metadata.$ref?.split("/").pop() || "Referenced Entity";
    }

    /**
     * Resolves the chain-link icon for the reference trigger button.
     *
     * @param _canEdit Unused editability flag.
     * @returns {string} The SAP icon URI.
     */
    protected getButtonIcon(_canEdit: boolean): string {
        return "sap-icon://chain-link";
    }

    /**
     * Resolves `metadata.$ref` via the owning `Engine` context and builds the modal dialog descriptor.
     *
     * @param metadata The reference property metadata containing `$ref`.
     * @returns {INestedDialogDescriptor | null} The resolved dialog descriptor, or `null` if `$ref` is missing/unresolved.
     */
    protected buildDialogDescriptor(metadata: IPropertyMetadata): INestedDialogDescriptor | null {
        if (!metadata.$ref) {
            Logger.error("[MetaUI ReferencePlugin] Missing '$ref' on reference property.", "", "ReferencePlugin");
            return null;
        }

        const resolvedSchema: ISchema | null = this.engineContext?.getSchemaDefinition(metadata.$ref) ?? null;
        if (!resolvedSchema) {
            Logger.error(
                `[MetaUI ReferencePlugin] Could not resolve schema definition for '${metadata.$ref}'.`,
                "",
                "ReferencePlugin"
            );
            return null;
        }

        const title =
            metadata.ui?.label || resolvedSchema.title || metadata.$ref.split("/").pop() || "Referenced Entity";
        return {
            title,
            subSchema: resolvedSchema,
            isArrayRoot: resolvedSchema.type === "array"
        };
    }
}
