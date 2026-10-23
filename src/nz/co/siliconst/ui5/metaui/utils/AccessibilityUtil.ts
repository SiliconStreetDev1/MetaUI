/**
 * @file AccessibilityUtil.ts
 * @description Stateless accessibility helpers that wire ARIA naming (`ariaLabelledBy`), descriptions
 * (`ariaDescribedBy`), required indicators, `sap.ui.core.InvisibleText` lifecycle in the UI5 static area,
 * companion `sap.m.Label` reconciliation, and table cell column-header naming across generated control trees.
 */

import { IPropertyMetadata } from "../interfaces/ISchema";
import { isRequiredSupport } from "./ControlCapabilities";
import Control from "sap/ui/core/Control";
import UI5Element from "sap/ui/core/Element";
import InvisibleText from "sap/ui/core/InvisibleText";
import Label from "sap/m/Label";

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
 *
 * @namespace nz.co.siliconst.ui5.metaui.utils
 * @internal
 */
export interface IAriaLabelSupport extends Control {
    addAriaLabelledBy(id: string): this;
    removeAriaLabelledBy(id: string): string | null;
    getAriaLabelledBy(): string[];
}

/**
 * Structural contract for a UI5 control that declares the `ariaDescribedBy` association.
 *
 * @namespace nz.co.siliconst.ui5.metaui.utils
 * @internal
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
 *
 * @namespace nz.co.siliconst.ui5.metaui.utils
 * @internal
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
 * @internal
 */
export function isAriaLabelSupport(control: unknown): control is IAriaLabelSupport {
    return declaresAssociation(control, "ariaLabelledBy");
}

/**
 * Narrows a control to one that can carry an `ariaDescribedBy` reference.
 *
 * @param control The candidate control.
 * @returns {boolean} True when `ariaDescribedBy` is declared.
 * @internal
 */
export function isAriaDescriptionSupport(control: unknown): control is IAriaDescriptionSupport {
    return declaresAssociation(control, "ariaDescribedBy");
}

/**
 * Stateless utility methods for managing ARIA associations, `InvisibleText` instances, and label reconciliation.
 *
 * @namespace nz.co.siliconst.ui5.metaui.utils
 * @internal
 */
export class AccessibilityUtil {
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
    public static applyAccessibility(
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
}
