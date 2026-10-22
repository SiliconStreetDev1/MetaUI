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
import {
    BLOCKED_CONTROL_PROPS, forEachBoundControl, INestedEditorLaunchOptions, isEditableSupport, isEnabledSupport,
    isRequiredSupport, isValueStateSupport, openNestedHostDialog, resolveContextualPath, resolveDataSourceDescriptor
} from "./ControlCapabilities";
import Control from "sap/ui/core/Control";
import Button from "sap/m/Button";
import TextControl, { $TextSettings } from "sap/m/Text";
import BindingParser from "sap/ui/base/BindingParser";
import { PropertyBindingInfo } from "sap/ui/base/ManagedObject";
import { ValueState } from "sap/ui/core/library";
import { ButtonType, ListMode } from "sap/m/library";

export * from "./ControlCapabilities";

/**
 * Stateless utility methods for applying UI directives, building bindings, and launching nested dialogs.
 *
 * @namespace nz.co.siliconst.ui5.metaui.utils
 * @public
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
     */
    public static applyCommonDirectives(
        control: Control,
        effectiveTarget: Control,
        metadata: IPropertyMetadata,
        pathForExpr: string,
        isEditable: boolean,
        modelName: string = "meta"
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

        if (!metadata.ui) {
            return;
        }

        if (metadata.ui.visible === false) {
            control.setVisible(false);
        } else if (metadata.ui.visibleOn) {
            const expr = ExpressionBuilder.build(metadata.ui.visibleOn, pathForExpr, modelName);
            const parsed = BindingParser.complexParser(expr);
            if (parsed && typeof parsed === "object") {
                control.bindProperty("visible", parsed);
            }
        }

        if (metadata.ui.enabled === false && isEnabledSupport(effectiveTarget)) {
            effectiveTarget.setEnabled(false);
        } else if (metadata.ui.enabledOn) {
            const expr = ExpressionBuilder.build(metadata.ui.enabledOn, pathForExpr, modelName);
            const parsed = BindingParser.complexParser(expr);
            if (parsed && typeof parsed === "object") {
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
     * Applies arbitrary static or expression-bound UI5 control properties from `ui.controlProps`.
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
            if (BLOCKED_CONTROL_PROPS.has(propName)) {
                Logger.warn("[MetaUI ControlDirectiveUtil]", `ILLEGAL OVERRIDE: '${propName}' is blocked in controlProps.`);
                continue;
            }
            const target = effectiveTarget.getMetadata().hasProperty(propName)
                ? effectiveTarget
                : outerControl.getMetadata().hasProperty(propName)
                  ? outerControl
                  : undefined;
            if (!target) {
                continue;
            }
            if (typeof propVal === "string" && propVal.startsWith("{") && propVal.endsWith("}")) {
                const normalizedExpr = ExpressionBuilder.build(propVal, pathForExpr, modelName).replace(
                    /\$\{metaui>/g,
                    `\${${modelName}>`
                );
                const parsed = BindingParser.complexParser(normalizedExpr);
                if (parsed && typeof parsed === "object") {
                    target.bindProperty(propName, parsed);
                    continue;
                }
            }
            target.setProperty(propName, propVal);
        }
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
