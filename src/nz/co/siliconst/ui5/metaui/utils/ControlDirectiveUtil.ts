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
import Control from "sap/ui/core/Control";
import UI5Element from "sap/ui/core/Element";
import InvisibleText from "sap/ui/core/InvisibleText";
import Button from "sap/m/Button";
import Label from "sap/m/Label";
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

/** Custom-data key holding the id of the `InvisibleText` that supplies a control's accessible name. */
const A11Y_NAME_DATA_KEY = "metauiA11yNameId";

/** Custom-data key holding the id of the `InvisibleText` that supplies a control's `ui.description`. */
const A11Y_DESCRIPTION_DATA_KEY = "metauiA11yDescriptionId";

/** Custom-data key holding the id of the `InvisibleText` that carries a live validation message. */
const A11Y_ERROR_DATA_KEY = "metauiA11yErrorId";

/**
 * Custom-data key recording which control an accessibility text was created for. A cloned table row cell
 * inherits both the association and the custom data of its template, so without an owner stamp a clone
 * would rewrite — or destroy — the text every other row in the column is named by.
 */
const A11Y_OWNER_DATA_KEY = "metauiA11yOwner";

const A11Y_DATA_KEYS: readonly string[] = [A11Y_NAME_DATA_KEY, A11Y_DESCRIPTION_DATA_KEY, A11Y_ERROR_DATA_KEY];

/**
 * Structural contract for a UI5 control that declares the `ariaLabelledBy` association.
 */
export interface IAriaLabelSupport extends Control {
    addAriaLabelledBy(id: string): this;
    removeAriaLabelledBy(id: string): string | null;
    getAriaLabelledBy(): string[];
}

/**
 * Structural contract for a UI5 control that declares the `ariaDescribedBy` association.
 */
export interface IAriaDescriptionSupport extends Control {
    addAriaDescribedBy(id: string): this;
    removeAriaDescribedBy(id: string): string | null;
    getAriaDescribedBy(): string[];
}

/**
 * Structural view of `sap.m.Label` that admits the documented "clear this association" argument. UI5's
 * generated typing for `setLabelFor` only names the set case, but `ManagedObject` explicitly accepts
 * `null` to clear an association, and clearing is the only way to retract a `labelFor` that points from a
 * label the layout never renders.
 */
interface IClearableLabelFor {
    setLabelFor(target: Control | null): unknown;
}

/**
 * Accessibility facts a plugin knows about its own field that the raw `IPropertyMetadata` cannot express:
 * whether the schema makes the field mandatory (`required` may be declared on the parent as an array), and
 * which inner controls should actually carry the accessible name when the outer control cannot.
 */
export interface IAccessibilityContext {
    /** True when the schema marks this field mandatory. Drives the control's `required` / `aria-required`. */
    required?: boolean;
    /** Controls that should receive the accessible name and description. Defaults to the effective target. */
    nameTargets?: Control[];
}

/**
 * Reports whether a control declares a given UI5 association, read from its own metadata rather than
 * guessed from its class name, so inherited associations are honoured and unknown controls are skipped.
 *
 * @param control The candidate control.
 * @param name The association name to look for.
 * @returns {boolean} True when the control declares the association.
 */
function declaresAssociation(control: unknown, name: string): boolean {
    const candidate = control as Control | undefined;
    if (!candidate || typeof candidate.getMetadata !== "function") {
        return false;
    }
    const associations = candidate.getMetadata().getAllAssociations() as Record<string, unknown> | undefined;
    return Boolean(associations && associations[name]);
}

/**
 * Narrows a control to one that can carry an `ariaLabelledBy` reference.
 *
 * @param control The candidate control.
 * @returns {boolean} True when `ariaLabelledBy` is declared.
 */
export function isAriaLabelSupport(control: unknown): control is IAriaLabelSupport {
    return declaresAssociation(control, "ariaLabelledBy");
}

/**
 * Narrows a control to one that can carry an `ariaDescribedBy` reference.
 *
 * @param control The candidate control.
 * @returns {boolean} True when `ariaDescribedBy` is declared.
 */
export function isAriaDescriptionSupport(control: unknown): control is IAriaDescriptionSupport {
    return declaresAssociation(control, "ariaDescribedBy");
}

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

        this.applyAccessibility(effectiveTarget, metadata, accessibility);

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
     * Wires the accessibility state every generated field owes assistive technology: the mandatory flag
     * (`required` → `aria-required`), an accessible name when the schema supplies an explicit label, and
     * `description` as an accessible description rather than only a mouse-only tooltip.
     *
     * The name comes from `ui.label` (which `SchemaDirectiveNormalizer` already resolves to the explicit
     * label, the schema `title`, or a humanized property key) and never from the raw binding path, so every
     * normalized property arrives here with something a person can recognise. A field that is about to be
     * paired with a rendered `sap.m.Label` has this synthetic name released again by the layout (see
     * {@link reconcileLabelAssociation}), so no control ends up carrying both a `<label for>` and a
     * competing `aria-labelledby` — the combination screen readers are documented to skip.
     *
     * @param effectiveTarget The primary interactive UI5 control.
     * @param metadata The property metadata containing `title`, `description` and `ui` directives.
     * @param accessibility Optional plugin-supplied required flag and inner name targets.
     */
    private static applyAccessibility(
        effectiveTarget: Control,
        metadata: IPropertyMetadata,
        accessibility?: IAccessibilityContext
    ): void {
        const targets =
            accessibility?.nameTargets && accessibility.nameTargets.length > 0
                ? accessibility.nameTargets
                : [effectiveTarget];
        const isRequired = accessibility?.required ?? metadata.required === true;
        const name = metadata.ui?.label || metadata.title || "";
        for (const target of targets) {
            if (isRequiredSupport(target)) {
                target.setRequired(isRequired);
            }
            if (name && !this.rendersOwnName(target, name)) {
                this.setAccessibleName(target, name);
            }
            if (metadata.description) {
                this.setAccessibleDescription(target, metadata.description);
            }
        }
    }

    /**
     * Reports whether the control already paints the name itself, as a `sap.m.Button` or a `sap.m.Title`
     * built from the same `ui.label` does. Naming such a control again does not make it more accessible,
     * it makes a screen reader read the caption twice.
     *
     * @param target The control about to be named.
     * @param name The accessible name resolved from the schema.
     * @returns {boolean} True when the control's own `text` or `title` property already carries that name.
     */
    private static rendersOwnName(target: Control, name: string): boolean {
        const metadata = target.getMetadata();
        return ["text", "title"].some(
            (property) => metadata.hasProperty(property) && target.getProperty(property) === name
        );
    }

    /**
     * Gives a control an accessible name backed by a `sap.ui.core.InvisibleText`, for the cases where no
     * visible `sap.m.Label` can ever point at it: a table cell named by its column header, a field whose
     * labels are suppressed with `ui.labelSpan: 0`, and the inner input of a composite hardware control.
     *
     * @param target The control that needs the name.
     * @param text The text a screen reader should announce as the field's name.
     */
    public static setAccessibleName(target: Control | undefined, text: string): void {
        this.writeAccessibilityText(target, A11Y_NAME_DATA_KEY, text, true, false);
    }

    /**
     * Drops the synthetic accessible name from a control, used when a rendered `sap.m.Label` takes the job
     * over through `labelFor`.
     *
     * @param target The control whose synthetic name should be released.
     */
    public static clearAccessibleName(target: Control | undefined): void {
        this.writeAccessibilityText(target, A11Y_NAME_DATA_KEY, "", true, false);
    }

    /**
     * Exposes `ui.description` to assistive technology as an accessible description, not only as the
     * `title` attribute a tooltip produces.
     *
     * @param target The control that the description belongs to.
     * @param text The description text, or an empty string to remove it.
     */
    public static setAccessibleDescription(target: Control | undefined, text: string): void {
        this.writeAccessibilityText(target, A11Y_DESCRIPTION_DATA_KEY, text, false, false);
    }

    /**
     * Publishes a live validation message as an accessible description. This is only used for controls that
     * have no `valueState` of their own; a control that does have one already exposes `aria-invalid` and
     * `aria-errormessage` through its own renderer, and adding a second channel would announce it twice.
     *
     * @param target The control in the invalid state.
     * @param text The validation message, or an empty string once the field is valid again.
     */
    public static setLiveValidationDescription(target: Control | undefined, text: string): void {
        this.writeAccessibilityText(target, A11Y_ERROR_DATA_KEY, text, false, true);
    }

    /**
     * Creates, updates or releases one of a control's accessibility texts.
     *
     * The `InvisibleText` is rendered into UI5's static area, because `aria-labelledby` can only resolve an
     * id that is actually in the DOM and a `dependents` aggregation is never rendered. Ownership is stamped
     * on the text so {@link destroyAccessibilityTexts} can free it without a registry, and so a cloned row
     * cell never destroys or rewrites the text its template shares with every other row.
     *
     * @param target The control the text belongs to.
     * @param dataKey The custom-data key under which the text's id is recorded.
     * @param text The text to announce, or an empty string to release it.
     * @param isName True to wire `ariaLabelledBy`, false to wire `ariaDescribedBy`.
     * @param enforceOwner True when an inherited text from a cloned template must be replaced, not reused.
     */
    private static writeAccessibilityText(
        target: Control | undefined,
        dataKey: string,
        text: string,
        isName: boolean,
        enforceOwner: boolean
    ): void {
        if (!target || typeof target.data !== "function") {
            return;
        }
        if (isName ? !isAriaLabelSupport(target) : !isAriaDescriptionSupport(target)) {
            return;
        }
        const recordedId = target.data(dataKey);
        const existing = typeof recordedId === "string" ? UI5Element.getElementById(recordedId) : undefined;
        const isInherited = Boolean(existing) && existing?.data(A11Y_OWNER_DATA_KEY) !== target.getId();
        if (existing && enforceOwner && isInherited) {
            this.unlinkAccessibilityText(target, recordedId as string, isName);
            target.data(dataKey, null);
        } else if (existing) {
            if (text) {
                (existing as InvisibleText).setText(text);
                return;
            }
            this.unlinkAccessibilityText(target, recordedId as string, isName);
            if (!isInherited) {
                existing.destroy();
            }
            target.data(dataKey, null);
            return;
        }
        if (!text) {
            return;
        }
        const invisible = new InvisibleText({ text });
        invisible.data(A11Y_OWNER_DATA_KEY, target.getId());
        invisible.toStatic();
        target.data(dataKey, invisible.getId());
        if (isName) {
            (target as IAriaLabelSupport).addAriaLabelledBy(invisible.getId());
        } else {
            (target as IAriaDescriptionSupport).addAriaDescribedBy(invisible.getId());
        }
    }

    /**
     * Removes an accessibility text's id from the control's `ariaLabelledBy` or `ariaDescribedBy`
     * association without touching the text itself.
     *
     * @param target The control holding the reference.
     * @param textId The id of the `InvisibleText` to unlink.
     * @param isName True for `ariaLabelledBy`, false for `ariaDescribedBy`.
     */
    private static unlinkAccessibilityText(target: Control, textId: string, isName: boolean): void {
        if (isName && isAriaLabelSupport(target)) {
            target.removeAriaLabelledBy(textId);
        } else if (!isName && isAriaDescriptionSupport(target)) {
            target.removeAriaDescribedBy(textId);
        }
    }

    /**
     * Points a control's `ariaLabelledBy` at an already rendered control that carries the visible text —
     * a wizard step title, a table toolbar title — instead of synthesizing a second copy of that text.
     *
     * @param control The control that needs the name.
     * @param labelProvider The rendered control whose text names it.
     */
    public static associateAriaLabel(control: Control | undefined, labelProvider: Control | undefined): void {
        if (!control || !labelProvider || !isAriaLabelSupport(control)) {
            return;
        }
        if (!control.getAriaLabelledBy().includes(labelProvider.getId())) {
            control.addAriaLabelledBy(labelProvider.getId());
        }
    }

    /**
     * Settles which of the two naming mechanisms a field uses, once the layout knows whether its companion
     * `sap.m.Label` will actually be rendered.
     *
     * A rendered label wins: UI5's own `LabelEnablement` already surfaces it on the control, so MetaUI
     * releases the synthetic name and leaves exactly one mechanism in place. A label the layout parks in a
     * `dependents` aggregation (`ui.labelSpan: 0`) is never rendered, so its `labelFor` is dropped — it would
     * otherwise leave an `aria-labelledby` pointing at an element that does not exist — and the synthetic
     * `InvisibleText` becomes the control's name instead.
     *
     * @param label The companion label the layout created.
     * @param labelText The text the label displays.
     * @param isLabelRendered False when the label is parked as a dependent and never reaches the DOM.
     */
    public static reconcileLabelAssociation(label: Label, labelText: string, isLabelRendered: boolean): void {
        const targetId = label.getLabelFor();
        const target = targetId ? UI5Element.getElementById(targetId) : undefined;
        const control = target instanceof Control ? target : undefined;
        if (isLabelRendered) {
            this.clearAccessibleName(control);
            return;
        }
        (label as IClearableLabelFor).setLabelFor(null);
        this.setAccessibleName(control, labelText);
    }

    /**
     * Materializes every `sap.m.Label` that a composite widget parked in its `dependents` aggregation.
     * Such a label is never rendered, so its `labelFor` produces a dangling `aria-labelledby`; the text it
     * carries is republished as an `InvisibleText` on the control it names.
     *
     * @param root The composite control whose dependents should be inspected.
     */
    public static materializeDependentLabels(root: Control | undefined): void {
        if (!root || typeof root.getDependents !== "function") {
            return;
        }
        for (const dependent of root.getDependents()) {
            if (!(dependent instanceof Label)) {
                continue;
            }
            const targetId = dependent.getLabelFor();
            const target = targetId ? UI5Element.getElementById(targetId) : undefined;
            if (target instanceof Control && dependent.getText()) {
                this.reconcileLabelAssociation(dependent, dependent.getText(), false);
            }
        }
    }

    /**
     * Names a generated table cell after its column header, for the cells SAPUI5 cannot reach.
     *
     * `sap.m.ColumnListItem` already pushes the column header `sap.m.Label` into the `ariaLabelledBy` of
     * every row cell whose control declares that association — verified in the browser harness, where an
     * editable cell renders `aria-labelledby="<header label id>"` without MetaUI doing anything. Naming
     * those cells again would make a screen reader read the column header twice, so they are left alone.
     *
     * So a cell that can hold the association has its synthetic name withdrawn instead — leaving it would
     * make the screen reader read the column header twice, which a unit assertion pins.
     *
     * What UI5 cannot do is reach inside a composite cell: a cell rendered as a `VBox` wrapping an input
     * declares no `ariaLabelledBy`, so neither the wrapper nor the input it contains is ever associated
     * with the header. Those nested inputs are what this names.
     *
     * @param cell The generated cell control.
     * @param headerText The column header text.
     */
    public static nameCellByColumnHeader(cell: Control | undefined, headerText: string): void {
        if (!cell || !headerText) {
            return;
        }
        if (isAriaLabelSupport(cell)) {
            this.clearAccessibleName(cell);
            return;
        }
        for (const nested of this.collectInputDescendants(cell)) {
            this.setAccessibleName(nested, headerText);
        }
    }

    /**
     * Collects the `sap.m.InputBase` controls nested inside a composite control. The search is restricted to
     * text-entry controls on purpose: a composite also contains buttons and icons whose own labels must not
     * be overwritten by the field's name.
     *
     * @param root The composite control to search.
     * @returns {Control[]} The nested text-entry controls, outermost first.
     */
    public static collectInputDescendants(root: Control): Control[] {
        return root
            .findAggregatedObjects(true)
            .filter((candidate): candidate is Control => candidate instanceof Control && candidate.isA("sap.m.InputBase"));
    }

    /**
     * Destroys the `InvisibleText` instances a control tree owns. They live in UI5's static area rather than
     * in the tree, so nothing else would collect them when the owning plugin is destroyed.
     *
     * @param root The root of the generated control tree being torn down.
     */
    public static destroyAccessibilityTexts(root: Control | undefined): void {
        if (!root) {
            return;
        }
        const nested = root
            .findAggregatedObjects(true)
            .filter((candidate): candidate is Control => candidate instanceof Control);
        for (const node of [root, ...nested]) {
            if (typeof node.data !== "function") {
                continue;
            }
            for (const key of A11Y_DATA_KEYS) {
                const recordedId = node.data(key);
                if (typeof recordedId !== "string") {
                    continue;
                }
                const text = UI5Element.getElementById(recordedId);
                if (text && !text.isDestroyed() && text.data(A11Y_OWNER_DATA_KEY) === node.getId()) {
                    text.destroy();
                }
                node.data(key, null);
            }
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
                    "[MetaUI ControlDirectiveUtil]",
                    `REFUSED condition rule ('${rule}'): the parsed binding resolved a named global reference.`,
                    "ControlDirectiveUtil"
                );
                return undefined;
            }
            return parsed;
        } catch (e) {
            Logger.warn(
                "[MetaUI ControlDirectiveUtil]",
                `Unparseable binding expression from schema ('${rule}'): ${(e as Error).message}`,
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
                Logger.warn(
                    "[MetaUI ControlDirectiveUtil]",
                    `REFUSED controlProps entry '${propName}': ${verdict.reason}.`,
                    "ControlDirectiveUtil"
                );
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
                Logger.warn(
                    "[MetaUI ControlDirectiveUtil]",
                    `REFUSED controlProps entry '${propName}': unsafe URI scheme.`,
                    "ControlDirectiveUtil"
                );
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
                "[MetaUI ControlDirectiveUtil]",
                `REFUSED controlProps entry '${propName}': UI5 rejected the value (${(e as Error).message}).`,
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
            this.setLiveValidationDescription(target, isValid ? "" : errorMessage || "Validation error");
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
            this.setLiveValidationDescription(target, isValid ? "" : errorMessage || "Validation error");
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
