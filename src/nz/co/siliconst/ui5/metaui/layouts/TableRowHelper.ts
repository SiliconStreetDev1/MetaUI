/**
 * @file TableRowHelper.ts
 * @description Pure helper utilities for TableLayout to resolve `$ref` item schemas,
 * synthesize default row skeletons from schema metadata, and mutate bound array models
 * on row addition or deletion.
 */

import { IPropertyMetadata, ISchema } from "../interfaces/ISchema";
import { Engine } from "../core/Engine";
import { PayloadValidator } from "../core/PayloadValidator";
import { Logger } from "../utils/Logger";
import { deepClone } from "../utils/TypeGuards";
import Table from "sap/m/Table";
import ColumnListItem from "sap/m/ColumnListItem";
import JSONModel from "sap/ui/model/json/JSONModel";

/**
 * Stateless helper methods for `TableLayout`.
 *
 * @namespace nz.co.siliconst.ui5.metaui.layouts
 * @public
 */
export class TableRowHelper {
    /**
     * Resolves the effective `items` schema for a table, dereferencing `$ref` definitions on the host when needed.
     *
     * @param schema The table array schema.
     * @param engine The active MetaUI Engine instance.
     * @param bindingPath The array binding path for diagnostic logging.
     * @returns {IPropertyMetadata | undefined} The resolved `items` metadata.
     */
    public static resolveItemsSchema(
        schema: ISchema,
        engine: Engine,
        bindingPath: string
    ): IPropertyMetadata | undefined {
        let itemsSchema = schema.items;
        if (itemsSchema && !itemsSchema.properties && itemsSchema.$ref) {
            Logger.debug(
                `[MetaUI] TableLayout detecting reference widget for ${bindingPath}. Resolving ${itemsSchema.$ref}`,
                "",
                "TableLayout"
            );
            const host = engine.host;
            if (host && typeof host.getSchemaDefinition === "function") {
                const resolved = host.getSchemaDefinition(itemsSchema.$ref);
                if (resolved && resolved.properties) {
                    const requiredList = Array.isArray(resolved.required) ? resolved.required : [];
                    const clonedProps = deepClone(resolved.properties);
                    for (const reqKey of requiredList) {
                        if (clonedProps[reqKey]) {
                            clonedProps[reqKey].required = true;
                        }
                    }
                    itemsSchema = {
                        ...(resolved as IPropertyMetadata),
                        properties: clonedProps
                    };
                } else if (resolved && ["string", "number", "integer", "boolean"].includes(resolved.type as string)) {
                    const mergedPrimitive: IPropertyMetadata = {
                        ...itemsSchema,
                        ...(resolved as IPropertyMetadata)
                    };
                    delete mergedPrimitive.$ref;
                    itemsSchema = mergedPrimitive;
                } else {
                    Logger.error(`[MetaUI] TableLayout resolved schema but it has no properties!`, "", "TableLayout");
                }
            } else {
                Logger.error(
                    `[MetaUI] TableLayout cannot resolve ${itemsSchema.$ref} because engine.host.getSchemaDefinition is missing!`,
                    "",
                    "TableLayout"
                );
            }
        }
        return itemsSchema;
    }

    /**
     * Recursively synthesizes a default row value skeleton from an `ISchema` or `IPropertyMetadata` definition.
     *
     * @param meta The item schema or property metadata.
     * @returns {unknown} The synthesized default row object or primitive value.
     */
    public static createSkeleton(meta: ISchema | IPropertyMetadata): unknown {
        if (meta.type === "object" && meta.properties) {
            const obj: Record<string, unknown> = {};
            for (const key of Object.keys(meta.properties)) {
                obj[key] = this.createSkeleton(meta.properties[key]);
            }
            return obj;
        }
        if (meta.type === "array") {
            return [];
        }
        const propMeta = meta as IPropertyMetadata;
        if (propMeta.default !== undefined) {
            return deepClone(propMeta.default);
        }
        if (meta.type === "string") {
            return Array.isArray(propMeta.enum) && propMeta.enum.length > 0 ? propMeta.enum[0] : "";
        }
        if (meta.type === "number" || meta.type === "integer") {
            return 0;
        }
        if (meta.type === "boolean") {
            return false;
        }
        return "";
    }

    /**
     * Appends a newly synthesized row to the bound `JSONModel` array and notifies the `Engine`.
     *
     * @param tbl The target `sap.m.Table` control.
     * @param modelName The UI5 JSONModel alias.
     * @param itemsSchema The resolved `items` metadata used to build the skeleton row.
     * @param engine The owning `Engine` instance.
     * @param actualPath The bound array path.
     */
    public static addRow(
        tbl: Table | undefined,
        modelName: string,
        itemsSchema: IPropertyMetadata,
        engine: Engine,
        actualPath: string,
        tableSchema?: ISchema
    ): void {
        if (!tbl) return;
        const model = tbl.getModel(modelName) as JSONModel | undefined;
        const info = tbl.getBindingInfo("items") as { path?: string } | undefined;
        if (!model || !info || !info.path) return;

        const rawData = model.getProperty(info.path);
        const data = Array.isArray(rawData) ? rawData : [];
        const newData = [...data, this.createSkeleton(itemsSchema)];
        model.setProperty(info.path, newData);

        engine.onArrayMutated(info.path, -1);
        const validationRes = this.validateArrayCountConstraints(newData, tableSchema, engine, actualPath);
        if (engine.onChange) {
            engine.onChange(validationRes.isValid, actualPath.replace(/^\//, ""), validationRes.errorMessage);
        }
    }

    /**
     * Deletes a row `ColumnListItem` from the bound `JSONModel` array, notifies the `Engine`,
     * and clears shifted array validation errors.
     *
     * @param item The `ColumnListItem` being deleted.
     * @param modelName The UI5 JSONModel alias.
     * @param engine The owning `Engine` instance.
     * @param actualPath The bound array path.
     * @param tableSchema Optional array schema holding item count constraints.
     */
    public static deleteRow(
        item: ColumnListItem | undefined,
        modelName: string,
        engine: Engine,
        actualPath: string,
        tableSchema?: ISchema
    ): void {
        if (!item) return;
        const path = item.getBindingContext(modelName)?.getPath();
        if (!path) return;
        const model = item.getModel(modelName) as JSONModel | undefined;
        if (!model) return;

        const splitPaths = path.split("/");
        const index = parseInt(splitPaths.pop() || "0", 10);
        let arrayPath = splitPaths.join("/");
        if (arrayPath === "") arrayPath = "/";

        const rawData = model.getProperty(arrayPath);
        const data = Array.isArray(rawData) ? rawData : [];
        const newData = [...data];
        newData.splice(index, 1);
        model.setProperty(arrayPath, newData);

        engine.onArrayMutated(arrayPath, index);
        const validationRes = this.validateArrayCountConstraints(newData, tableSchema, engine, actualPath);
        if (engine.onChange) {
            engine.onChange(validationRes.isValid, actualPath.replace(/^\//, ""), validationRes.errorMessage);
        }
    }

    private static validateArrayCountConstraints(
        rows: unknown[],
        tableSchema: ISchema | undefined,
        engine: Engine,
        actualPath: string
    ): { isValid: boolean; errorMessage?: string } {
        if (
            !tableSchema ||
            (tableSchema.minItems === undefined &&
                tableSchema.maxItems === undefined &&
                tableSchema.uniqueItems !== true)
        ) {
            return { isValid: true };
        }
        const res = PayloadValidator.validateTree(
            {
                type: "array",
                minItems: tableSchema.minItems,
                maxItems: tableSchema.maxItems,
                uniqueItems: tableSchema.uniqueItems
            },
            rows
        );
        engine.reportSchemaError(actualPath, res.isValid ? null : res.errorMessage || "Invalid array items");
        return res;
    }
}

