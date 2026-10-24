/**
 * @file ControlDirectiveUtil.ts
 * @description Stateless utility methods used by BasePlugin to apply schema UI directives,
 * bind static and expression-based `controlProps`, construct formatter bindings,
 * update visual validation states, resolve contextual paths, and launch modal sub-schema dialogs.
 */

import { IDataSourceConfig, IPropertyMetadata } from "../interfaces/ISchema";
import { IEngineHost } from "../interfaces/IEngineHost";
import { PipelineManager } from "../core/PipelineManager";
import { ExpressionBuilder } from "./ExpressionBuilder";
import { Logger } from "./Logger";
import { isRecord } from "./TypeGuards";
import { UrlValidator } from "./UrlValidator";
import {
    forEachBoundControl, INestedEditorLaunchOptions, isEditableSupport, isEnabledSupport,
    isRequiredSupport, isValueStateSupport, openNestedHostDialog, resolveContextualPath, resolveDataSourceDescriptor,
    sanitizeUriPropertyValue, vetControlProperty, writeControlProperty
} from "./ControlCapabilities";
import { AccessibilityUtil, IAccessibilityContext } from "./AccessibilityUtil";
import Control from "sap/ui/core/Control";
import Button from "sap/m/Button";
import TextControl, { $TextSettings } from "sap/m/Text";
import BindingParser from "sap/ui/base/BindingParser";
import { PropertyBindingInfo } from "sap/ui/base/ManagedObject";
import { ValueState } from "sap/ui/core/library";
import { ButtonType, ListMode } from "sap/m/library";

export * from "./ControlCapabilities";

/**
 * Binding-info members `BindingParser` fills by resolving a name against the global scope. None of them
 * can legitimately appear in a binding MetaUI builds from a schema rule.
 */
const RESOLVED_REFERENCE_KEYS: readonly string[] = ["formatter", "events", "factory", "type"];

/**
 * Stateless utility methods for applying UI directives, building bindings, and launching nested dialogs.
 *
 * @namespace nz.co.siliconst.ui5.metaui.utils
 * @internal
 */
export class ControlDirectiveUtil {
    /**
     * Resolves the absolute model path for a control, taking table row binding contexts into account.
     *
     * @param target The target UI5 control instance.
     * @param rawPath The relative or absolute property binding path.
     * @param modelName The UI5 JSONModel alias name.
     * @returns {string} The resolved absolute JSONModel path starting with `/`.
     */
    public static resolveAbsolutePath(target: Control | undefined, rawPath: string, modelName: string = "meta"): string {
        return resolveContextualPath(target, rawPath, modelName);
    }

    /**
     * Creates a read-only `sap.m.Text` control for display mode (`isEditable = false`).
     *
     * @param id Optional deterministic control ID.
     * @param effectiveBinding The property binding descriptor or binding path string.
     * @param metadata Optional property metadata for applying common directives.
     * @param pathForExpr The binding path used to resolve relative expression bindings.
     * @param modelName The UI5 JSONModel alias name.
     * @returns {Control} The configured `sap.m.Text` control.
     */
    public static createDisplayTextControl(
        id: string | undefined,
        effectiveBinding: PropertyBindingInfo | string,
        metadata: IPropertyMetadata | undefined,
        pathForExpr: string,
        modelName: string = "meta"
    ): Control {
        const textCtrl = new TextControl({
            id,
            text: effectiveBinding as $TextSettings["text"]
        });
        if (metadata) {
            this.applyCommonDirectives(textCtrl, textCtrl, metadata, pathForExpr, false, modelName);
        }
        return textCtrl;
    }

    /**
     * Applies dynamic editability changes to the primary interactive control.
     *
     * @param target The primary interactive UI5 control.
     * @param effectiveEditable True to enable editing, false for read-only.
     */
    public static applyEditableState(target: Control | undefined, effectiveEditable: boolean): void {
        if (!target) {
            return;
        }
        type TableControl = Control & {
            setMode?: (mode: ListMode) => void;
            getHeaderToolbar?: () => { getContent?: () => Control[] } | undefined;
        };
        const tableCandidate = target as TableControl;
        if (
            target.getMetadata().getName() === "sap.m.Table" &&
            typeof tableCandidate.setMode === "function"
        ) {
            tableCandidate.setMode(effectiveEditable ? ListMode.Delete : ListMode.None);
            const toolbarContent = tableCandidate.getHeaderToolbar?.()?.getContent?.() || [];
            for (const item of toolbarContent) {
                if (typeof item.data === "function" && item.data("metauiTableAddBtn") === true) {
                    item.setVisible(effectiveEditable);
                }
            }
            return;
        }
        if (isEditableSupport(target)) {
            target.setEditable(effectiveEditable);
            if (effectiveEditable && isEnabledSupport(target)) {
                target.setEnabled(true);
            }
        } else if (isEnabledSupport(target)) {
            target.setEnabled(effectiveEditable);
        } else if (target.getMetadata().hasProperty("readOnly")) {
            target.setProperty("readOnly", !effectiveEditable);
        }
    }

    /**
     * Applies dynamic required indicator changes to the primary interactive control.
     *
     * @param target The primary interactive UI5 control.
     * @param required True if the field is mandatory.
     */
    public static applyRequiredState(target: Control | undefined, required: boolean): void {
        if (isRequiredSupport(target)) {
            target.setRequired(required);
        }
    }

    /**
     * Applies common UI directives (`readOnly`, `visible`, `visibleOn`, `enabled`, `enabledOn`, `valueState`, `controlProps`)
     * to a generated UI5 control and its primary interactive target.
     *
     * @param control The outer UI5 control instance.
     * @param effectiveTarget The primary interactive UI5 control (`mainControl ?? control`).
     * @param metadata The property metadata containing `ui` directives.
     * @param pathForExpr The binding path used to resolve relative expression bindings.
     * @param isEditable Whether the owning plugin is in edit mode.
     * @param modelName The UI5 JSONModel alias name.
     * @param accessibility Optional plugin-supplied required flag and inner name targets.
     */
    public static applyCommonDirectives(
        control: Control,
        effectiveTarget: Control,
        metadata: IPropertyMetadata,
        pathForExpr: string,
        isEditable: boolean,
        modelName: string = "meta",
        accessibility?: IAccessibilityContext
    ): void {
        if (pathForExpr) {
            control.data("metauiBindingPath", pathForExpr);
            if (effectiveTarget !== control) {
                effectiveTarget.data("metauiBindingPath", pathForExpr);
            }
        }
        const isPropReadOnly = Boolean(metadata.readOnly || metadata.ui?.readOnly);
        const canEdit = isEditable && !isPropReadOnly && metadata.ui?.enabled !== false;
        if (isEditableSupport(effectiveTarget)) {
            effectiveTarget.setEditable(canEdit);
        } else if (!canEdit && isEnabledSupport(effectiveTarget)) {
            effectiveTarget.setEnabled(false);
        } else if (!canEdit && effectiveTarget.getMetadata().hasProperty("readOnly")) {
            effectiveTarget.setProperty("readOnly", true);
        }

        if (metadata.description && !effectiveTarget.getTooltip()) {
            effectiveTarget.setTooltip(metadata.description);
        }

        AccessibilityUtil.applyAccessibility(effectiveTarget, metadata, accessibility);

        if (!metadata.ui) {
            return;
        }

        if (metadata.ui.visible === false) {
            control.setVisible(false);
        } else if (metadata.ui.visibleOn) {
            const parsed = this.parseDirectiveBinding(metadata.ui.visibleOn, pathForExpr, modelName);
            if (parsed) {
                control.bindProperty("visible", parsed);
            }
        }

        if (metadata.ui.enabled === false && isEnabledSupport(effectiveTarget)) {
            effectiveTarget.setEnabled(false);
        } else if (metadata.ui.enabledOn && effectiveTarget.getMetadata().hasProperty("enabled")) {
            // The hasProperty guard is not optional: ManagedObject.bindProperty throws for a
            // property the control does not declare. sap.m.Text has no `enabled`, and it backs
            // the display mode of most widgets, so an unguarded bind turned `enabledOn` into a
            // hard render failure for the whole field. The sibling directives above and below
            // already guard this way via isEnabledSupport/isValueStateSupport.
            const parsed = this.parseDirectiveBinding(metadata.ui.enabledOn, pathForExpr, modelName);
            if (parsed) {
                effectiveTarget.bindProperty("enabled", parsed);
            }
        }

        if (metadata.ui.valueState && isValueStateSupport(effectiveTarget)) {
            effectiveTarget.setValueState(metadata.ui.valueState as ValueState);
        }

        if (isRecord(metadata.ui.controlProps)) {
            this.applyControlProps(control, effectiveTarget, metadata.ui.controlProps, pathForExpr, modelName);
        }
    }

    /**
     * Builds and parses a schema-supplied condition rule into a UI5 `PropertyBindingInfo`.
     *
     * Rules embedding raw UI5 complex-binding syntax are refused by `ExpressionBuilder.buildChecked`
     * and never reach `BindingParser`, whose named-formatter resolution would otherwise invoke an
     * arbitrary global with the live field value. A rule the parser cannot read is reported and skipped
     * rather than thrown, so one hostile directive cannot abort the render of the whole form.
     *
     * @param rule The raw `visibleOn`, `enabledOn` or `controlProps` expression.
     * @param pathForExpr Current property path for relative expression resolution.
     * @param modelName Active UI5 model name.
     * @returns {PropertyBindingInfo | undefined} The parsed binding, or `undefined` when refused.
     */
    private static parseDirectiveBinding(
        rule: string,
        pathForExpr: string,
        modelName: string
    ): PropertyBindingInfo | undefined {
        const expr = ExpressionBuilder.buildChecked(rule, pathForExpr, modelName);
        if (expr === undefined) {
            return undefined;
        }
        const normalizedExpr = expr.replace(/\$\{metaui>/g, `\${${modelName}>`);
        try {
            const parsed = BindingParser.complexParser(normalizedExpr);
            if (!parsed || typeof parsed !== "object") {
                return undefined;
            }
            if (!this.carriesNoResolvedReference(normalizedExpr, parsed)) {
                Logger.warn(
                    `REFUSED condition rule ('${rule}'): the parsed binding resolved a named global reference.`,
                    undefined,
                    "ControlDirectiveUtil"
                );
                return undefined;
            }
            return parsed;
        } catch (e) {
            Logger.warn(
                `Unparseable binding expression from schema ('${rule}'): ${(e as Error).message}`,
                undefined,
                "ControlDirectiveUtil"
            );
            return undefined;
        }
    }

    /**
     * Verifies, at the sink, that `BindingParser` resolved no named global reference out of a
     * schema-supplied rule.
     *
     * `ExpressionBuilder` refuses complex-binding syntax by grammar; this is the independent backstop
     * that does not depend on reading UI5's parser correctly. A single-token model binding must come
     * back as a plain path, and an expression binding's parts must be plain paths too — the compiled
     * expression's own top-level formatter is the only function MetaUI ever produces here.
     *
     * @param expr The expression string handed to `BindingParser`.
     * @param parsed The binding info it returned.
     * @returns {boolean} True when no part carries a resolved `formatter`, `events`, `factory` or `type`.
     */
    private static carriesNoResolvedReference(expr: string, parsed: PropertyBindingInfo): boolean {
        const isResolved = (candidate: unknown): boolean =>
            isRecord(candidate) && RESOLVED_REFERENCE_KEYS.some((key) => candidate[key] !== undefined);
        if (!expr.startsWith("{=")) {
            return !isResolved(parsed);
        }
        const parts = (parsed as PropertyBindingInfo & { parts?: unknown[] }).parts;
        return !Array.isArray(parts) || !parts.some(isResolved);
    }

    /**
     * Applies arbitrary static or expression-bound UI5 control properties from `ui.controlProps`.
     *
     * Every entry is vetted against the target control's UI5 property metadata before it is written, and
     * is then written through the control's own generated setter rather than `ManagedObject.setProperty`,
     * so UI5's typed-setter sanitization is never bypassed. Values destined for a `sap.ui.core.URI`
     * property are routed through `UrlValidator`, statically and through a formatter when bound.
     *
     * @param outerControl The outer wrapper control.
     * @param effectiveTarget The interactive control target.
     * @param controlProps Dictionary of UI5 property names to values or binding expressions.
     * @param pathForExpr Current property path for relative expression resolution.
     * @param modelName Active UI5 model name.
     */
    private static applyControlProps(
        outerControl: Control,
        effectiveTarget: Control,
        controlProps: Record<string, unknown>,
        pathForExpr: string,
        modelName: string
    ): void {
        for (const [propName, propVal] of Object.entries(controlProps)) {
            const target = effectiveTarget.getMetadata().hasProperty(propName)
                ? effectiveTarget
                : outerControl.getMetadata().hasProperty(propName)
                  ? outerControl
                  : undefined;
            const verdict = vetControlProperty(target, propName);
            if (!verdict.allowed || !target) {
                Logger.warn(`REFUSED controlProps entry '${propName}': ${verdict.reason}.`, undefined, "ControlDirectiveUtil");
                continue;
            }
            if (typeof propVal === "string" && propVal.startsWith("{") && propVal.endsWith("}")) {
                const parsed = this.parseDirectiveBinding(propVal, pathForExpr, modelName);
                if (parsed) {
                    this.writeVettedProp(target, propName, verdict.isUri ? this.withUriSanitizer(parsed) : parsed, true);
                }
                continue;
            }
            if (verdict.isUri && !UrlValidator.isSafeUiResourceUri(propVal)) {
                Logger.warn(`REFUSED controlProps entry '${propName}': unsafe URI scheme.`, undefined, "ControlDirectiveUtil");
                continue;
            }
            this.writeVettedProp(target, propName, propVal, false);
        }
    }

    /**
     * Binds or writes a vetted `ui.controlProps` value, containing any rejection UI5 raises.
     *
     * The type gate proves a property *exists* and is scalar; it cannot prove the schema supplied a value
     * UI5 will accept for it. `ManagedObject.validateProperty` throws on an out-of-range enum
     * (`{"type": "NotAValidInputType"}` on `sap.m.Input`) and on any mistyped scalar
     * (`{"maxLength": "abc"}`) — verified in the browser harness — and an uncaught throw here would take
     * down the render of the whole form. One bad entry is refused and logged instead, like every other
     * refusal in this gate.
     *
     * @param target The control receiving the property.
     * @param propName The UI5 property name.
     * @param value The vetted value, or the parsed binding when `asBinding` is true.
     * @param asBinding True to bind the property, false to write it.
     */
    private static writeVettedProp(target: Control, propName: string, value: unknown, asBinding: boolean): void {
        try {
            if (asBinding) {
                target.bindProperty(propName, value as PropertyBindingInfo);
            } else {
                writeControlProperty(target, propName, value);
            }
        } catch (e) {
            Logger.warn(
                `REFUSED controlProps entry '${propName}': UI5 rejected the value (${(e as Error).message}).`,
                undefined,
                "ControlDirectiveUtil"
            );
        }
    }

    /**
     * Wraps a parsed binding so the value finally written to a `sap.ui.core.URI` property is protocol-checked,
     * closing the case where the unsafe URI arrives through the model rather than through the schema literal.
     *
     * @param parsed The binding info produced by `BindingParser`.
     * @returns {PropertyBindingInfo} The same binding with a sanitizing formatter appended.
     */
    private static withUriSanitizer(parsed: PropertyBindingInfo): PropertyBindingInfo {
        const original = parsed.formatter;
        const sanitized: PropertyBindingInfo & Record<string, unknown> = { ...parsed };
        sanitized.formatter = function formatSafeUri(this: unknown, ...values: unknown[]): string {
            const resolved = typeof original === "function" ? original.apply(this, values) : values[0];
            return sanitizeUriPropertyValue(resolved);
        };
        return sanitized;
    }

    /**
     * Builds a UI5 `PropertyBindingInfo` object or binding string, wiring `PipelineManager` formatters when declared.
     *
     * @param bindingPath The JSON path to bind.
     * @param modelName The UI5 JSONModel alias name.
     * @param metadata Optional property metadata containing formatter directives.
     * @param type Optional UI5 data type name.
     * @param additionalOptions Optional additional binding configuration properties.
     * @returns {PropertyBindingInfo | string} The constructed binding descriptor.
     */
    public static generateBindingInfo(
        bindingPath: string,
        modelName: string = "meta",
        metadata?: IPropertyMetadata,
        type?: string,
        additionalOptions?: Record<string, unknown>
    ): PropertyBindingInfo | string {
        const formatters =
            metadata?.ui?.formatters || (metadata?.ui?.formatter ? [metadata.ui.formatter] : undefined);

        if (!formatters?.length && !type && !additionalOptions) {
            return `{${modelName}>${bindingPath}}`;
        }

        const baseInfo: PropertyBindingInfo & Record<string, unknown> = {
            path: `${modelName}>${bindingPath}`,
            ...(type ? { type } : {}),
            ...(additionalOptions || {})
        };

        if (formatters && formatters.length > 0) {
            const formatterArgs = metadata?.ui?.args;
            baseInfo.formatter = (rawValue: unknown) =>
                PipelineManager.getInstance().runFormatters(rawValue, formatters, formatterArgs);
        }

        return baseInfo;
    }

    /**
     * Applies visual validation feedback (`ValueState` or `ButtonType.Reject`) to a UI5 control.
     *
     * @param target The target UI5 control.
     * @param isValid True if the field is valid, false otherwise.
     * @param errorMessage Optional validation error message.
     */
    public static applyVisualValidationState(target: Control, isValid: boolean, errorMessage?: string): void {
        if (isValueStateSupport(target)) {
            target.setValueState(isValid ? ValueState.None : ValueState.Error);
            if (typeof target.setValueStateText === "function") {
                target.setValueStateText(isValid ? "" : errorMessage || "Invalid input");
            }
            return;
        }
        if (target instanceof Button) {
            if (target.data("metauiOrigTooltip") === null) {
                target.data("metauiOrigTooltip", target.getTooltip_AsString() || "");
            }
            const origTooltip = (target.data("metauiOrigTooltip") as string) || "";
            target.setType(isValid ? ButtonType.Default : ButtonType.Reject);
            target.setTooltip(isValid ? origTooltip : errorMessage || "Validation error");
            AccessibilityUtil.setLiveValidationDescription(target, isValid ? "" : errorMessage || "Validation error");
            return;
        }
        if (typeof target.data === "function") {
            if (target.data("metauiOrigTooltip") === null) {
                target.data("metauiOrigTooltip", target.getTooltip_AsString?.() || "");
            }
            const origTooltip = (target.data("metauiOrigTooltip") as string) || "";
            target.data("metauiErrorState", isValid ? null : true);
            target.toggleStyleClass?.("metauiValidationError", !isValid);
            target.setTooltip?.(isValid ? origTooltip : errorMessage || "Validation error");
            // A red border and a tooltip are a sighted affordance only. Controls without a `valueState`
            // (Slider, RatingIndicator, the hardware composites) publish the message as an accessible
            // description instead; controls that do have one already emit aria-invalid/aria-errormessage
            // from their own renderer and must not announce it a second time.
            AccessibilityUtil.setLiveValidationDescription(target, isValid ? "" : errorMessage || "Validation error");
        }
    }

    /**
     * Resolves an `IDataSourceConfig` descriptor from `metadata.ui.dataSource` or object-based `valueHelp`.
     *
     * @param metadata The property metadata to inspect.
     * @returns {IDataSourceConfig | undefined} The normalized data source configuration.
     */
    public static resolveDataSourceConfig(metadata: IPropertyMetadata): IDataSourceConfig | undefined {
        return resolveDataSourceDescriptor(metadata);
    }

    /**
     * Spawns a modal `DynamicHost` dialog for editing or viewing a nested sub-schema,
     * forwards extracted data on submit, and deterministically destroys the host once closed.
     *
     * @param options Configuration for the nested modal editor.
     */
    public static openNestedHostDialog(options: INestedEditorLaunchOptions): void {
        openNestedHostDialog(options);
    }

    /**
     * Clears dynamic row state flags and resets ValueState on all controls bound under a path prefix.
     *
     * @param root The root generated UI5 control tree.
     * @param host The owning engine host.
     * @param cleanPrefix The path prefix to match.
     */
    public static clearBoundControlSubtree(root: Control, host: IEngineHost, cleanPrefix: string): void {
        forEachBoundControl(root, host, cleanPrefix, (inspectable) => {
            inspectable.data?.("metauiParseInvalid", null);
            inspectable.data?.("metauiDynamicRequired", null);
            inspectable.data?.("metauiDynamicVisible", null);
            ControlDirectiveUtil.applyVisualValidationState(inspectable as Control, true);
        }, true);
    }

    /**
     * Applies a row policy state (`visibility`, `required`, `editable`) to all controls bound to `cleanPath`.
     *
     * @param root The root generated UI5 control tree.
     * @param host The owning engine host.
     * @param cleanPath The target field path.
     * @param property The state property to apply.
     * @param value The boolean state value.
     */
    public static applyBoundRowPolicyState(
        root: Control, host: IEngineHost, cleanPath: string,
        property: "visibility" | "required" | "editable", value: boolean
    ): void {
        forEachBoundControl(root, host, cleanPath, (inspectable) => {
            const ctrl = inspectable as Control;
            if (property === "visibility") {
                inspectable.data?.("metauiDynamicVisible", value);
                inspectable.setVisible?.(value);
                if (!value) this.applyVisualValidationState(ctrl, true);
            } else if (property === "editable") {
                this.applyEditableState(ctrl, value);
            } else if (property === "required") {
                inspectable.data?.("metauiDynamicRequired", value);
                this.applyRequiredState(ctrl, value);
            }
        });
        if (property === "editable") {
            forEachBoundControl(root, host, cleanPath, (inspectable) => {
                this.applyEditableState(inspectable as Control, value);
            }, true);
        }
    }
}
