/**
 * @file ControlCapabilities.ts
 * @description Structural TypeScript contracts, runtime capability type guards, contextual path
 * and dataSource resolution, and nested modal DynamicHost dialog orchestration for UI5 controls.
 */

import { IDataSourceConfig, IPropertyMetadata, ISchema } from "../interfaces/ISchema";
import { IEngineHost } from "../interfaces/IEngineHost";
import { deepClone, isRecord } from "./TypeGuards";
import { UrlValidator } from "./UrlValidator";
import Control from "sap/ui/core/Control";
import ManagedObject from "sap/ui/base/ManagedObject";
import DataType from "sap/ui/base/DataType";
import Event from "sap/ui/base/Event";
import { ValueState } from "sap/ui/core/library";
import type DynamicHost from "../controls/DynamicHost";

/**
 * Structural contract for bound UI5 controls inspected during tree traversal.
 *
 * @namespace nz.co.siliconst.ui5.metaui.utils
 * @internal
 */
export interface IBoundInspectable {
    /** Reads or writes custom data on the UI5 element. */
    data?: (key: string, value?: unknown) => unknown;
    /** Returns false when a picker control currently holds an unparseable value. */
    isValidValue?: () => boolean;
    /** Updates the control's ValueState. */
    setValueState?: (state: ValueState) => void;
    /** Updates the control's ValueStateText. */
    setValueStateText?: (text: string) => void;
    /** Updates the control's visibility. */
    setVisible?: (visible: boolean) => void;
    /** Returns a named child aggregation from the UI5 ManagedObject. */
    getAggregation?: (name: string) => ManagedObject | ManagedObject[] | null;
}

/** Core UI5 properties managed by MetaUI that cannot be overridden via `ui.controlProps`. */
export const BLOCKED_CONTROL_PROPS: ReadonlySet<string> = new Set([
    "value", "selectedKey", "selectedKeys", "selected", "dateValue",
    "tokens", "editable", "enabled", "visible", "valueState", "valueStateText"
]);

/**
 * UI5 primitive property types a schema-supplied `ui.controlProps` entry may target.
 *
 * `ManagedObject` declares exactly seven built-in primitives — `string`, `boolean`, `int`, `float`,
 * `object`, `function` and `any`. Only the four scalar ones are accepted, which closes `object`,
 * `function` and `any` (and their array forms) without naming a single property. Registered UI5 types
 * (`sap.ui.core.CSSSize`, `sap.ui.core.URI`, every enum) resolve to one of these four.
 */
export const ALLOWED_CONTROL_PROP_PRIMITIVES: ReadonlySet<string> = new Set(["string", "boolean", "int", "float"]);

/**
 * UI5 property names whose value is injected into the DOM as markup rather than as text.
 *
 * UI5 metadata carries no "renders raw HTML" flag, so unlike every other rule in this gate these can
 * only be refused by name. Markup still reaches `sap.m.FormattedText` the supported way — through the
 * bound field value, where the control's own sanitizing setter runs — just not through `ui.controlProps`.
 */
export const HTML_SINK_CONTROL_PROPS: ReadonlySet<string> = new Set(["htmlText", "html", "innerHTML", "content"]);

/** The UI5 property type whose values are URIs and therefore require protocol validation. */
const URI_PROPERTY_TYPE = "sap.ui.core.URI";

/**
 * Outcome of vetting a single `ui.controlProps` entry against the control's UI5 metadata.
 *
 * @namespace nz.co.siliconst.ui5.metaui.utils
 * @internal
 */
export interface IControlPropVerdict {
    /** True when the property may be written to the control. */
    readonly allowed: boolean;
    /** True when the property is declared as `sap.ui.core.URI` and its value must pass `UrlValidator`. */
    readonly isUri: boolean;
    /** Human-readable refusal reason, present only when `allowed` is false. */
    readonly reason?: string;
}

/**
 * Vets a schema-supplied `ui.controlProps` entry against the target control's UI5 property metadata.
 *
 * The gate is an allowlist over the closed set of UI5 property types rather than a list of dangerous
 * property names: a property is accepted only when the control actually declares it, it is not one of
 * the core state properties MetaUI owns, it is not a raw-markup sink, and its declared type resolves to
 * a scalar primitive.
 *
 * @param target The control that declares the property, or `undefined` when no control declares it.
 * @param propName The `ui.controlProps` key.
 * @returns {IControlPropVerdict} The verdict, including whether the value needs URI validation.
 */
export function vetControlProperty(target: Control | undefined, propName: string): IControlPropVerdict {
    if (BLOCKED_CONTROL_PROPS.has(propName)) {
        return { allowed: false, isUri: false, reason: "it is a core state property owned by MetaUI" };
    }
    if (HTML_SINK_CONTROL_PROPS.has(propName)) {
        return { allowed: false, isUri: false, reason: "it is rendered as raw markup" };
    }
    if (!target) {
        return { allowed: false, isUri: false, reason: "no generated control declares it" };
    }
    const declaredType = target.getMetadata().getProperty(propName)?.type ?? "";
    if (!declaredType) {
        return { allowed: false, isUri: false, reason: "the control declares no type for it" };
    }
    const resolved = DataType.getType(declaredType);
    const primitive = resolved ? resolved.getPrimitiveType().getName() : declaredType;
    if (!ALLOWED_CONTROL_PROP_PRIMITIVES.has(primitive)) {
        return { allowed: false, isUri: false, reason: `its UI5 type '${declaredType}' is not a scalar primitive` };
    }
    return { allowed: true, isUri: declaredType === URI_PROPERTY_TYPE };
}

/**
 * Sanitizes a value destined for a `sap.ui.core.URI` property, collapsing unsafe schemes to the empty string.
 *
 * @param rawValue The candidate URI value resolved from the schema or from a model binding.
 * @returns {string} The trimmed URI when safe, otherwise an empty string.
 */
export function sanitizeUriPropertyValue(rawValue: unknown): string {
    return UrlValidator.isSafeUiResourceUri(rawValue) ? rawValue.trim() : "";
}

/**
 * Writes a vetted `ui.controlProps` value through the control's own generated setter when one exists,
 * so that any sanitization or coercion UI5 implements in that setter still runs. `ManagedObject.setProperty`
 * bypasses those setters and is used only for properties that do not generate one.
 *
 * @param target The control receiving the property.
 * @param propName The UI5 property name.
 * @param value The vetted value.
 */
export function writeControlProperty(target: Control, propName: string, value: unknown): void {
    const setterName = `set${propName.charAt(0).toUpperCase()}${propName.slice(1)}`;
    const candidate: unknown = Reflect.get(target, setterName);
    if (typeof candidate === "function") {
        (candidate as (propValue: unknown) => unknown).call(target, value);
        return;
    }
    target.setProperty(propName, value);
}

/**
 * Structural contract for UI5 controls that support `ValueState` visual feedback.
 *
 * @namespace nz.co.siliconst.ui5.metaui.utils
 * @internal
 */
export interface IValueStateSupport {
    /**
     * Sets the visual validation state on the UI5 control.
     *
     * @param state The target `ValueState` enum value.
     * @returns {unknown} The control instance for chaining.
     */
    setValueState(state: ValueState): unknown;

    /**
     * Sets the validation message text displayed when the control is focused.
     *
     * @param text The validation message string.
     * @returns {unknown} The control instance for chaining.
     */
    setValueStateText?(text: string): unknown;
}

/**
 * Structural contract for UI5 controls that expose a `setEditable` setter.
 *
 * @namespace nz.co.siliconst.ui5.metaui.utils
 * @internal
 */
export interface IEditableSupport {
    /**
     * Toggles whether the control can be edited by the user.
     *
     * @param editable True to allow editing, false for read-only.
     * @returns {unknown} The control instance for chaining.
     */
    setEditable(editable: boolean): unknown;
}

/**
 * Structural contract for UI5 controls that expose a `setEnabled` setter.
 *
 * @namespace nz.co.siliconst.ui5.metaui.utils
 * @internal
 */
export interface IEnabledSupport {
    /**
     * Toggles whether the control is interactive.
     *
     * @param enabled True to enable interaction, false to disable.
     * @returns {unknown} The control instance for chaining.
     */
    setEnabled(enabled: boolean): unknown;
}

/**
 * Structural contract for UI5 controls that expose a `setRequired` setter.
 *
 * @namespace nz.co.siliconst.ui5.metaui.utils
 * @internal
 */
export interface IRequiredSupport {
    /**
     * Toggles the required indicator on the control.
     *
     * @param required True if the field is mandatory.
     * @returns {unknown} The control instance for chaining.
     */
    setRequired(required: boolean): unknown;
}

/**
 * Configuration options for launching a nested modal `DynamicHost` dialog.
 *
 * @namespace nz.co.siliconst.ui5.metaui.utils
 * @public
 */
export interface INestedEditorLaunchOptions {
    /** Dialog header title. */
    readonly title: string;
    /** Normalized sub-schema to render inside the modal. */
    readonly subSchema: ISchema;
    /** Initial data payload for the nested editor. */
    readonly currentData: unknown;
    /** Optional global `$ref` definitions dictionary. */
    readonly definitions?: Record<string, ISchema>;
    /** Whether the nested form should be editable. */
    readonly editable: boolean;
    /**
     * Layout budget for the nested host. Passed explicitly so the parent's budget never has to travel
     * as an annotation written onto the consumer's schema. 0 disables inline sub-layouts in the dialog.
     */
    readonly layoutBudget?: number;
    /** True when the root sub-schema represents an array table. */
    readonly isArrayRoot?: boolean;
    /** Callback invoked with the validated extracted data when the user submits the dialog. */
    readonly onSave: (extractedData: unknown) => void;
    /** Optional lifecycle callback invoked when the nested `DynamicHost` instance is created. */
    readonly onHostCreated?: (host: DynamicHost) => void;
}

/**
 * Type guard verifying whether a UI5 control implements `setValueState`.
 *
 * @param control The candidate UI5 control instance.
 * @returns {boolean} True if `setValueState` is available on the control.
 */
export function isValueStateSupport(control: unknown): control is IValueStateSupport {
    return (
        control !== null &&
        typeof control === "object" &&
        typeof (control as IValueStateSupport).setValueState === "function"
    );
}

/**
 * Type guard verifying whether a UI5 control implements `setEditable`.
 *
 * @param control The candidate UI5 control instance.
 * @returns {boolean} True if `setEditable` is available on the control.
 */
export function isEditableSupport(control: unknown): control is IEditableSupport {
    return (
        control !== null &&
        typeof control === "object" &&
        typeof (control as IEditableSupport).setEditable === "function"
    );
}

/**
 * Type guard verifying whether a UI5 control implements `setEnabled`.
 *
 * @param control The candidate UI5 control instance.
 * @returns {boolean} True if `setEnabled` is available on the control.
 */
export function isEnabledSupport(control: unknown): control is IEnabledSupport {
    return (
        control !== null &&
        typeof control === "object" &&
        typeof (control as IEnabledSupport).setEnabled === "function"
    );
}

/**
 * Type guard verifying whether a UI5 control implements `setRequired`.
 *
 * @param control The candidate UI5 control instance.
 * @returns {boolean} True if `setRequired` is available on the control.
 */
export function isRequiredSupport(control: unknown): control is IRequiredSupport {
    return (
        control !== null &&
        typeof control === "object" &&
        typeof (control as IRequiredSupport).setRequired === "function"
    );
}

/**
 * Resolves the absolute model path for a control, taking table row binding contexts into account.
 *
 * @param target The target UI5 control instance.
 * @param rawPath The relative or absolute property binding path.
 * @param modelName The UI5 JSONModel alias name.
 * @returns {string} The resolved absolute JSONModel path starting with `/`.
 */
export function resolveContextualPath(
    target: Control | undefined,
    rawPath: string,
    modelName: string = "meta"
): string {
    const ctxPath = target?.getBindingContext(modelName)?.getPath() || "";
    if (ctxPath) {
        const normalizedCtx = ctxPath.replace(/\/$/, "");
        if (rawPath === normalizedCtx || rawPath.startsWith(`${normalizedCtx}/`)) {
            return rawPath;
        }
        const cleanRel = rawPath.replace(/^\//, "");
        return cleanRel ? `${normalizedCtx}/${cleanRel}` : normalizedCtx;
    }
    return rawPath.startsWith("/") ? rawPath : `/${rawPath}`;
}

/**
 * Resolves an `IDataSourceConfig` descriptor from `metadata.ui.dataSource` or object-based `valueHelp`.
 *
 * @param metadata The property metadata to inspect.
 * @returns {IDataSourceConfig | undefined} The normalized data source configuration.
 */
export function resolveDataSourceDescriptor(metadata: IPropertyMetadata): IDataSourceConfig | undefined {
    if (metadata.ui?.dataSource?.url) {
        return metadata.ui.dataSource;
    }
    const vh = metadata.ui?.valueHelp ?? metadata.valueHelp;
    if (isRecord(vh) && typeof vh.url === "string") {
        return {
            url: vh.url,
            keyField:
                typeof vh.keyPath === "string"
                    ? vh.keyPath
                    : typeof vh.keyField === "string"
                      ? vh.keyField
                      : "id",
            textField:
                typeof vh.textPath === "string"
                    ? vh.textPath
                    : typeof vh.textField === "string"
                      ? vh.textField
                      : "name",
            dataPath: typeof vh.dataPath === "string" ? vh.dataPath : undefined
        };
    }
    return undefined;
}

/**
 * Extracts an array of records from a raw JSON payload using an optional dot-separated `dataPath`.
 *
 * @param payload The parsed JSON response payload.
 * @param dataPath Optional dot-separated path (e.g., `"data.items"`).
 * @returns {unknown[]} The extracted array of items.
 */
export function extractDataSourceList(payload: unknown, dataPath?: string): unknown[] {
    if (!dataPath) {
        return Array.isArray(payload) ? payload : [];
    }
    let cursor: unknown = payload;
    for (const seg of dataPath.split(".")) {
        if (isRecord(cursor) && seg in cursor) {
            cursor = cursor[seg];
        } else {
            return [];
        }
    }
    return Array.isArray(cursor) ? cursor : [];
}

/**
 * Spawns a modal `DynamicHost` dialog for editing or viewing a nested sub-schema,
 * forwards extracted data on submit, and deterministically destroys the host once closed.
 *
 * @param options Configuration for the nested modal editor.
 */
export function openNestedHostDialog(options: INestedEditorLaunchOptions): void {
    sap.ui.require(
        ["nz/co/siliconst/ui5/metaui/controls/DynamicHost"],
        (DynamicHostClass: typeof DynamicHost) => {
            const wrappedData: Record<string, unknown> = options.isArrayRoot
                ? { items: Array.isArray(options.currentData) ? deepClone(options.currentData) : [] }
                : isRecord(options.currentData)
                  ? deepClone(options.currentData)
                  : {};

            const host = new DynamicHostClass({
                schemaDefinition: deepClone(options.subSchema),
                schemaDefinitions: options.definitions || null,
                data: wrappedData,
                editable: options.editable,
                layoutBudget: options.layoutBudget ?? 0,
                liveUpdate: false
            });
            options.onHostCreated?.(host);

            host.attachSubmit((oEvent: Event) => {
                const params = oEvent.getParameters() as { payload?: unknown };
                const payload = params.payload;
                const result =
                    options.isArrayRoot && isRecord(payload) && Array.isArray(payload.items)
                        ? payload.items
                        : payload;
                options.onSave(result);
            });

            void host.openInDialog(options.title, options.editable ? "Save" : "Close").finally(() => {
                if (!host.isDestroyed()) {
                    host.destroy();
                }
            });
        }
    );
}

/**
 * Recursively traverses a UI5 control tree and invokes `callback` for every control bound to `targetPath`.
 *
 * @param control Root UI5 control or child aggregation element.
 * @param host Active engine host holding the model alias.
 * @param targetPath Normalized path or path prefix to match.
 * @param callback Callback invoked for each matching bound control.
 * @param matchPrefix When true, matches `targetPath` and any descendant path under `targetPath/`.
 */
export function forEachBoundControl(
    control: ManagedObject | null | undefined,
    host: IEngineHost,
    targetPath: string,
    callback: (inspectable: IBoundInspectable) => void,
    matchPrefix: boolean = false
): void {
    if (!control || typeof control !== "object" || typeof control.getBindingContext !== "function") return;
    const inspectable = control as ManagedObject & IBoundInspectable;
    const matchesTarget = (resolved: string): boolean => {
        const clean = resolved.replace(/^\//, "");
        return matchPrefix ? !targetPath || clean === targetPath || clean.startsWith(`${targetPath}/`) : clean === targetPath;
    };

    let matched = false;
    const context = control.getBindingContext(host.activeModelName);
    const ctxPath = context ? context.getPath().replace(/^\//, "") : "";

    if (typeof inspectable.data === "function") {
        const taggedPath = inspectable.data("metauiBindingPath");
        if (typeof taggedPath === "string") {
            const cleanTag = taggedPath.replace(/^\//, "");
            const fullPath = ctxPath ? (cleanTag ? `${ctxPath}/${cleanTag}` : ctxPath) : cleanTag;
            if (matchesTarget(fullPath)) {
                callback(inspectable);
                matched = true;
            }
        }
    }

    if (!matched && typeof control.getBindingInfo === "function") {
        for (const prop of ["value", "selectedKey", "selectedKeys", "dateValue", "selected", "state", "text", "tokens"]) {
            const info = control.getBindingInfo(prop) as { path?: string; parts?: { path?: string }[] } | undefined;
            const boundPath = info?.parts?.[0]?.path ?? info?.path;
            if (boundPath !== undefined) {
                const cleanBound = boundPath.replace(/^\//, "");
                const fullPath = ctxPath ? (cleanBound ? `${ctxPath}/${cleanBound}` : ctxPath) : cleanBound;
                if (matchesTarget(fullPath)) {
                    callback(inspectable);
                    break;
                }
            }
        }
    }

    if (typeof inspectable.getAggregation === "function") {
        for (const aggName of Object.keys(control.getMetadata().getAllAggregations())) {
            const child = inspectable.getAggregation(aggName);
            if (Array.isArray(child)) {
                child.forEach((c) => forEachBoundControl(c, host, targetPath, callback, matchPrefix));
            } else if (child) {
                forEachBoundControl(child, host, targetPath, callback, matchPrefix);
            }
        }
    }
}
