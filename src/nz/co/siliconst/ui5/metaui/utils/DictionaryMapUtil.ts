/**
 * @file DictionaryMapUtil.ts
 * @description Pure transformation and row-construction utilities for DictionaryMapPlugin.
 * Converts between parent object maps and local `{ key, value }[]` arrays and builds UI5 entry rows.
 */

import { IPropertyMetadata } from "../interfaces/ISchema";
import { IPlugin, IPluginEngineContext } from "../interfaces/IPlugin";
import { WIDGET_TYPE } from "../constants/MetaUIConstants";
import { PluginRegistry } from "../core/PluginRegistry";
import { DataInferenceBuilder } from "../core/DataInferenceBuilder";
import { deepClone, isRecord } from "./TypeGuards";
import Control from "sap/ui/core/Control";
import HBox from "sap/m/HBox";
import Button from "sap/m/Button";
import Input from "sap/m/Input";
import Label from "sap/m/Label";
import FlexItemData from "sap/m/FlexItemData";
import JSONModel from "sap/ui/model/json/JSONModel";
import Model from "sap/ui/model/Model";
import Context from "sap/ui/model/Context";
import Event from "sap/ui/base/Event";
import { TextAlign, ValueState } from "sap/ui/core/library";
import { ButtonType, FlexAlignItems } from "sap/m/library";

/**
 * Internal representation of a single key-value entry in the local dictionary model.
 */
export interface IDictionaryEntry {
    /** The dictionary entry key string. */
    key: string;
    /** The dictionary entry value. */
    value: unknown;
}

/**
 * Result of serializing an array of dictionary entries back into a flat object record.
 */
export interface IDictionarySerializationResult {
    /** The serialized key-value object map (including preserved static properties). */
    readonly record: Record<string, unknown>;
    /** True if any entry had an empty or duplicate key. */
    readonly hasInvalidKeys: boolean;
}

/**
 * Configuration options for building a single visual dictionary entry row.
 */
export interface IDictionaryRowBuildOptions {
    /** The 0-based index of the entry in `/entries`. */
    readonly index: number;
    /** Whether the row is rendered in editable mode. */
    readonly canEdit: boolean;
    /** The schema metadata for the entry value. */
    readonly valueSchema: IPropertyMetadata;
    /** The local `JSONModel` holding `/entries`. */
    readonly localModel: JSONModel;
    /** Optional deterministic scope ID prefix. */
    readonly scopeId?: string;
    /** Optional field key name. */
    readonly fieldKey?: string;
    /** Optional engine context from the owning plugin. */
    readonly engineContext?: IPluginEngineContext;
    /** Optional map of declared static properties on the parent object schema. */
    readonly staticProperties?: Record<string, IPropertyMetadata>;
    /** Callback invoked whenever the key or value changes. */
    readonly onSync: () => void;
    /** Callback invoked when the row's delete button is pressed. */
    readonly onRemove: (index: number) => void;
}

/**
 * Stateless helper methods for `DictionaryMapPlugin`.
 *
 * @namespace nz.co.siliconst.ui5.metaui.utils
 * @internal
 */
export class DictionaryMapUtil {
    /**
     * Extracts dynamic `{ key, value }` entries from a raw object map, excluding declared static properties.
     *
     * @param rawMap The raw object from the parent model.
     * @param staticProperties Optional map of declared static properties on the object schema.
     * @returns {IDictionaryEntry[]} Cloned array of dynamic entries.
     */
    public static extractEntries(
        rawMap: unknown,
        staticProperties?: Record<string, IPropertyMetadata>
    ): IDictionaryEntry[] {
        if (!isRecord(rawMap)) {
            return [];
        }
        const staticKeys = staticProperties ? Object.keys(staticProperties) : [];
        const entries: IDictionaryEntry[] = [];
        for (const [k, v] of Object.entries(rawMap)) {
            if (!staticKeys.includes(k)) {
                entries.push({ key: k, value: deepClone(v) });
            }
        }
        return entries;
    }

    /**
     * Serializes an array of `{ key, value }` entries back into a flat object record,
     * preserving any static properties and flagging empty or duplicate keys.
     *
     * @param entries The current list of dictionary entries.
     * @param existingObj The existing parent object (to preserve declared static properties).
     * @param staticProperties Optional map of declared static properties on the object schema.
     * @returns {IDictionarySerializationResult} The resulting object map and key validity flag.
     */
    public static serializeEntries(
        entries: IDictionaryEntry[],
        existingObj: unknown,
        staticProperties?: Record<string, IPropertyMetadata>
    ): IDictionarySerializationResult {
        const record: Record<string, unknown> = {};

        if (isRecord(existingObj) && staticProperties) {
            for (const staticKey of Object.keys(staticProperties)) {
                if (staticKey in existingObj) {
                    record[staticKey] = existingObj[staticKey];
                }
            }
        }

        const staticKeySet = new Set<string>(staticProperties ? Object.keys(staticProperties) : []);
        const seenKeys = new Set<string>();
        let hasInvalidKeys = false;

        for (const entry of entries) {
            const trimmedKey = typeof entry.key === "string" ? entry.key.trim() : "";
            if (!trimmedKey || seenKeys.has(trimmedKey) || staticKeySet.has(trimmedKey)) {
                hasInvalidKeys = true;
                continue;
            }
            seenKeys.add(trimmedKey);
            record[trimmedKey] = entry.value;
        }

        return { record, hasInvalidKeys };
    }

    /**
     * Synthesizes a default value for a newly added dictionary entry based on its value schema.
     *
     * @param valueSchema The property metadata for the entry value.
     * @returns {unknown} The synthesized default value.
     */
    public static createDefaultValue(valueSchema: IPropertyMetadata): unknown {
        if (valueSchema.default !== undefined) {
            return deepClone(valueSchema.default);
        }
        switch (valueSchema.type) {
            case "number":
            case "integer":
                return 0;
            case "boolean":
                return false;
            case "array":
                return [];
            case "object":
                return {};
            default:
                return "";
        }
    }

    /**
     * Generates a unique `key_N` identifier not currently present in `entries`.
     *
     * @param entries The current list of dictionary entries.
     * @returns {string} A unique key name.
     */
    public static generateUniqueKey(entries: IDictionaryEntry[]): string {
        const existingKeys = new Set(entries.map((e) => e.key));
        let index = entries.length + 1;
        let candidate = `key_${index}`;
        while (existingKeys.has(candidate)) {
            index++;
            candidate = `key_${index}`;
        }
        return candidate;
    }

    /**
     * Resolves the effective `IPropertyMetadata` for a dictionary entry value, dereferencing `$ref`,
     * detecting polymorphic `oneOf`/`anyOf` schemas, and inferring structure for untyped object values.
     *
     * @param baseSchema The declared `additionalProperties` schema.
     * @param entryValue The runtime value of the current dictionary entry.
     * @param engineContext Optional engine context for `$ref` resolution.
     * @returns {IPropertyMetadata} The resolved property metadata for rendering the value control.
     */
    public static resolveEntryValueSchema(
        baseSchema: IPropertyMetadata,
        entryValue: unknown,
        engineContext?: IPluginEngineContext
    ): IPropertyMetadata {
        let meta = deepClone(baseSchema);
        if (meta.$ref && engineContext) {
            const refSchema = engineContext.getSchemaDefinition(meta.$ref);
            if (refSchema) {
                meta = {
                    ...meta,
                    type: refSchema.type || "object",
                    properties: refSchema.properties ? deepClone(refSchema.properties) : meta.properties
                };
            }
        }
        if ((meta.oneOf && meta.oneOf.length > 0) || (meta.anyOf && meta.anyOf.length > 0) || meta.discriminator) {
            meta.type = "object";
            meta.ui = { ...(meta.ui || {}), widget: meta.ui?.widget || WIDGET_TYPE.POLYMORPHIC };
            return meta;
        }
        if (isRecord(entryValue) && (!meta.properties || Object.keys(meta.properties).length === 0)) {
            meta.type = "object";
            meta.properties = DataInferenceBuilder.inferPropertiesFromObject(entryValue);
        }
        return meta;
    }

    /**
     * Evaluates whether a dictionary entry key at `index` is non-empty, not reserved by a static property,
     * and unique across all entries in `localModel`.
     *
     * @param rawKey The candidate key string.
     * @param index The 0-based entry index in `/entries`.
     * @param localModel The local `JSONModel` holding `/entries`.
     * @param staticProperties Optional map of declared static properties on the parent object schema.
     * @returns {{ isValid: boolean; message: string }} Validation status and message.
     */
    public static evaluateKeyValidity(
        rawKey: unknown,
        index: number,
        localModel: JSONModel,
        staticProperties?: Record<string, IPropertyMetadata>
    ): { isValid: boolean; message: string } {
        const staticKeySet = new Set<string>(staticProperties ? Object.keys(staticProperties) : []);
        const trimmed = typeof rawKey === "string" ? rawKey.trim() : "";
        if (!trimmed) {
            return { isValid: false, message: "Key cannot be empty." };
        }
        if (staticKeySet.has(trimmed)) {
            return { isValid: false, message: `Key '${trimmed}' is reserved as a static property.` };
        }
        const allEntries = localModel.getProperty("/entries") as IDictionaryEntry[] | undefined;
        const isDuplicate =
            Array.isArray(allEntries) &&
            allEntries.some((e, i) => i !== index && typeof e.key === "string" && e.key.trim() === trimmed);
        if (isDuplicate) {
            return { isValid: false, message: "Duplicate key is not allowed." };
        }
        return { isValid: true, message: "" };
    }

    /**
     * Builds a single `sap.m.HBox` row containing the key control, value plugin control, and optional delete button.
     *
     * @param options Configuration for building the dictionary row.
     * @returns {{ rowBox: HBox; valuePlugin: IPlugin }} The constructed row container and instantiated child plugin.
     */
    public static buildEntryRow(options: IDictionaryRowBuildOptions): { rowBox: HBox; valuePlugin: IPlugin } {
        const entryPath = `/entries/${options.index}`;
        const initialKeyStatus = this.evaluateKeyValidity(
            options.localModel.getProperty(`${entryPath}/key`),
            options.index,
            options.localModel,
            options.staticProperties
        );
        const keyControl: Control = options.canEdit
            ? new Input({
                  value: `{dict>${entryPath}/key}`,
                  placeholder: "Key",
                  tooltip: "Dictionary entry key",
                  width: "12rem",
                  valueState: initialKeyStatus.isValid ? ValueState.None : ValueState.Error,
                  valueStateText: initialKeyStatus.message,
                  change: (oEvent: Event) => {
                      const input = oEvent.getSource() as Input;
                      options.localModel.setProperty(`${entryPath}/key`, input.getValue());
                      const status = this.evaluateKeyValidity(
                          input.getValue(),
                          options.index,
                          options.localModel,
                          options.staticProperties
                      );
                      input.setValueState(status.isValid ? ValueState.None : ValueState.Error);
                      input.setValueStateText(status.message);
                      options.onSync();
                  }
              }).addStyleClass("sapUiTinyMarginEnd")
            : new Label({
                  text: `{dict>${entryPath}/key}:`,
                  width: "10rem",
                  textAlign: TextAlign.End
              }).addStyleClass("sapUiTinyMarginEnd");
        keyControl.data("metauiDictKeyIndex", options.index);

        const entryVal = options.localModel.getProperty(`${entryPath}/value`);
        const clonedValueMeta = this.resolveEntryValueSchema(options.valueSchema, entryVal, options.engineContext);
        const registry = options.engineContext?.pluginRegistry || PluginRegistry.getInstance();
        const valuePlugin = registry.getPlugin(
            clonedValueMeta.type || "string",
            clonedValueMeta.ui?.widget
        );
        if (typeof valuePlugin.setEditable === "function") {
            valuePlugin.setEditable(options.canEdit);
        }
        if (options.engineContext && typeof valuePlugin.setEngineContext === "function") {
            valuePlugin.setEngineContext({
                ...options.engineContext,
                getModel: () => options.localModel as Model | undefined
            });
        }

        const rowScopeId = options.scopeId ? `${options.scopeId}-${options.fieldKey}-row-${options.index}` : undefined;
        const valueControl = valuePlugin.render(clonedValueMeta, `${entryPath}/value`, "dict", rowScopeId, () =>
            options.onSync()
        );
        valueControl.setLayoutData(new FlexItemData({ growFactor: 1 }));
        valueControl.setModel(options.localModel, "dict");
        const bindingContext = options.localModel.createBindingContext(entryPath) as Context | undefined;
        if (bindingContext) {
            valueControl.setBindingContext(bindingContext, "dict");
        }

        const rowItems: Control[] = [keyControl, valueControl];
        if (options.canEdit) {
            rowItems.push(
                new Button({
                    icon: "sap-icon://decline",
                    type: ButtonType.Transparent,
                    tooltip: "Remove entry",
                    press: () => options.onRemove(options.index)
                }).addStyleClass("sapUiTinyMarginBegin")
            );
        }

        const rowBox = new HBox({ width: "100%", alignItems: FlexAlignItems.Center, items: rowItems }).addStyleClass(
            "sapUiTinyMarginBottom"
        );
        if (options.canEdit) {
            const keyLabel = new Label({ text: "Dictionary entry key", labelFor: keyControl });
            const valLabel = new Label({
                text: clonedValueMeta.ui?.label || "Dictionary entry value",
                required: Boolean(clonedValueMeta.required),
                labelFor: valueControl
            });
            rowBox.addDependent(keyLabel);
            rowBox.addDependent(valLabel);
            valuePlugin.setAssociatedLabel?.(valLabel);
        } else if (keyControl instanceof Label) {
            keyControl.setLabelFor(valueControl);
            valuePlugin.setAssociatedLabel?.(keyControl);
        }
        return { rowBox, valuePlugin };
    }
}
