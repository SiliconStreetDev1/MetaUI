/**
 * @file NestedCaption.ts
 * @description Builds the read-only caption of a nested drill-down button.
 *
 * A caption names what the button opens. It does not preview the record: the dialog behind the
 * button is the data view, and a button is the wrong place to read values from.
 *
 * Previewing the object's own values was tried and withdrawn. Picking the first few scalars in
 * declaration order guesses at which values identify a record, and the guess is usually wrong;
 * the result then truncated twice over, once here and again in the button's own CSS, so the
 * reader could not tell whether the part they could not see mattered. An array still shows its
 * entry count, because a count is bounded, always meaningful, and not a guess.
 *
 * An author who wants a specific caption sets `ui.dialogButtonText`, which overrides this
 * entirely and is checked before this class is reached.
 */

import { I18n, TEXT_KEY } from "./I18n";

/**
 * Read-only caption builder for the nested drill-down button of `ObjectPlugin`, `ArrayPlugin` and
 * `ReferencePlugin`.
 *
 * @namespace nz.co.siliconst.ui5.metaui.utils
 * @internal
 */
export class NestedCaption {
    /**
     * Builds the caption for a nested value shown on a read-only host.
     *
     * An array is summarized by its entry count. Everything else gets the plain `View <label>`
     * form, whatever the value holds.
     *
     * @param label The resolved field label.
     * @param value The nested value bound to the button.
     * @returns {string} The localized caption, never empty.
     */
    public static build(label: string, value: unknown): string {
        if (Array.isArray(value)) {
            return I18n.getText(TEXT_KEY.nestedViewSummary, [label, value.length]);
        }
        return I18n.getText(TEXT_KEY.nestedView, [label]);
    }
}
