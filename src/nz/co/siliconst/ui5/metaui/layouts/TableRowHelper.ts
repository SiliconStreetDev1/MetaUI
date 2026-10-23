/**
 * @file TableRowHelper.ts
 * @description Pure helper utilities for TableLayout to resolve `$ref` item schemas,
 * synthesize default row skeletons from schema metadata, and mutate bound array models
 * on row addition or deletion.
 */

import { IPropertyMetadata, ISchema } from "../interfaces/ISchema";
import { Engine } from "../core/Engine";
import { PayloadValidator } from "../core/PayloadValidator";
import { SchemaWalker } from "../core/SchemaWalker";
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
        if (meta.type !== "object" || !meta.properties) {
            return this.createLeafSkeleton(meta);
        }
        const rootObj: Record<string, unknown> = {};
        const objectsByScope = new Map<string, Record<string, unknown>>([["#", rootObj]]);

        SchemaWalker.walk(
            meta,
            (ctx) => {
                const splitIdx = ctx.scope.lastIndexOf("/properties/");
                if (splitIdx === -1) {
                    return "skip-subtree";
                }
                const parentScope = ctx.scope.slice(0, splitIdx);
                const parentObj = objectsByScope.get(parentScope);
                if (!parentObj) {
                    return "skip-subtree";
                }
                if (ctx.node.type === "object" && ctx.node.properties) {
                    const childObj: Record<string, unknown> = {};
                    parentObj[ctx.key] = childObj;
                    objectsByScope.set(ctx.scope, childObj);
                    return undefined;
                }
                parentObj[ctx.key] = this.createLeafSkeleton(ctx.node);
                return "skip-subtree";
            },
            {
                resolveRefs: false,
                onTruncate: (scope) => {
                    const splitIdx = scope.lastIndexOf("/properties/");
                    if (splitIdx === -1) return;
                    const parentScope = scope.slice(0, splitIdx);
                    const key = scope.slice(splitIdx + "/properties/".length);
                    const parentObj = objectsByScope.get(parentScope);
                    if (parentObj && !(key in parentObj)) {
                        parentObj[key] = {};
                    }
                }
            }
        );
        return rootObj;
    }

    private static createLeafSkeleton(meta: ISchema | IPropertyMetadata): unknown {
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
        this.revealAppendedRow(tbl, newData.length);

        engine.onArrayMutated(info.path, -1);
        const validationRes = this.validateArrayCountConstraints(newData, tableSchema, engine, actualPath);
        if (engine.onChange) {
            engine.onChange(validationRes.isValid, actualPath.replace(/^\//, ""), validationRes.errorMessage);
        }
    }

    /**
     * Extends a growing table's rendered window so the row that was just appended is actually drawn.
     *
     * `TableLayout` pages the generated table at `TableLayout.GROWING_PAGE_SIZE` rows, and
     * `sap.m.GrowingEnablement` only ever renders the prefix `[0, _iLimit)`. That limit is recomputed
     * from `growingThreshold` on a Sort, Filter or Context change and on nothing else — a plain data
     * change leaves it alone (verified in `sap/m/GrowingEnablement-dbg.js`, `updateItems`). So a row
     * appended to a collection that already fills the window lands outside it: accepted into the
     * payload, counted by the growing trigger, and never drawn. That is the truncation defect again at
     * a new boundary, and it is why this call exists.
     *
     * `ListBase#requestItems` is the public, typed means of widening the window (`@since 1.92`, below
     * this library's floor). It raises the limit by exactly the shortfall in one pass, so only the rows
     * between the old window and the new one are rendered. The usual case costs nothing: a collection
     * smaller than one page is already fully inside the window and the shortfall is zero.
     *
     * Appending rather than inserting at index 0 is deliberate. An insert shifts every following row's
     * index, and `ValidationLedger.extractShiftedRowEntries` can only shift entries *down* by one —
     * it models a deletion — so every existing row's painted error would move to its neighbour. That
     * is a worse defect than the one being fixed, and an invisible one.
     *
     * @param tbl The table whose window may need widening.
     * @param rowCount The collection's length after the append.
     */
    private static revealAppendedRow(tbl: Table, rowCount: number): void {
        if (!tbl.getGrowing()) {
            return;
        }
        // Null when the table has no growing delegate yet, which is also when `requestItems` throws.
        const growingInfo = tbl.getGrowingInfo();
        if (!growingInfo) {
            return;
        }
        const shortfall = rowCount - growingInfo.actual;
        if (shortfall <= 0) {
            return;
        }
        tbl.requestItems(shortfall);
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

