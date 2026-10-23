/**
 * @file I18n.ts
 * @description Single entry point for every end-user-facing text MetaUI emits.
 *
 * Texts live in `src/nz/co/siliconst/ui5/metaui/messagebundle*.properties`, beside `library.js`,
 * which is where SAPUI5 expects a library's resource bundle. They are read through
 * `sap.ui.core.Lib.getResourceBundleFor` — the non-deprecated successor to
 * `Core.getLibraryResourceBundle`, which has been deprecated since UI5 1.119 and merely forwards
 * to it. Using the *library* bundle rather than a hand-rolled `ResourceBundle.create` matters:
 * when a Fiori app declares this library as a manifest dependency, UI5 loads the bundle
 * asynchronously as a subtask of loading the library, so the synchronous lookups below hit a warm
 * cache and issue no request of their own. It also means the bundle automatically follows the
 * app's session locale and any active terminologies, and that `supportedLocales` /
 * `fallbackLocale` are taken from the library's generated `manifest.json` instead of being
 * duplicated in code.
 *
 * The bundle is deliberately *not* cached in this module: UI5 caches it per locale itself, and
 * re-reading it on every call is what keeps texts from going stale after a locale switch.
 *
 * There is no English copy of these texts in TypeScript. A key that resolves to nothing is a
 * packaging defect, not a condition to paper over, so {@link I18n.getText} reports it through
 * {@link Logger} and returns the key — visibly wrong on screen rather than silently plausible.
 */

import Lib from "sap/ui/core/Lib";
import ResourceBundle from "sap/base/i18n/ResourceBundle";
import { Logger } from "./Logger";

/** UI5 library name under which the message bundle is registered. */
export const METAUI_LIBRARY_NAME = "nz.co.siliconst.ui5.metaui";

/**
 * Every text key MetaUI can emit, keyed by a short symbolic name.
 *
 * Declaring them here rather than inlining string literals makes the set closed: {@link I18n.getText}
 * only accepts a member of this object, so a key cannot be used without also appearing in the
 * `i18n: every declared text key resolves` test, which checks each one against the shipped bundle.
 */
export const TEXT_KEY = {
    required: "metaui.validation.required",
    requiredNull: "metaui.validation.required.null",
    minLength: "metaui.validation.minLength",
    maxLength: "metaui.validation.maxLength",
    pattern: "metaui.validation.pattern",
    email: "metaui.validation.email",
    url: "metaui.validation.url",
    urlProtocol: "metaui.validation.url.protocol",
    iban: "metaui.validation.iban",
    ibanChecksum: "metaui.validation.iban.checksum",
    integer: "metaui.validation.integer",
    finiteNumber: "metaui.validation.number.finite",
    multipleOf: "metaui.validation.multipleOf",
    rangeMinimum: "metaui.validation.range.minimum",
    rangeExclusiveMinimum: "metaui.validation.range.exclusiveMinimum",
    rangeMaximum: "metaui.validation.range.maximum",
    rangeExclusiveMaximum: "metaui.validation.range.exclusiveMaximum",
    enumMembership: "metaui.validation.enum",
    constEquality: "metaui.validation.const",
    arrayMinItems: "metaui.validation.array.minItems",
    arrayMaxItems: "metaui.validation.array.maxItems",
    arrayUniqueItems: "metaui.validation.array.uniqueItems",
    objectMinProperties: "metaui.validation.object.minProperties",
    objectMaxProperties: "metaui.validation.object.maxProperties",
    systemError: "metaui.validation.systemError",
    fieldPrefix: "metaui.validation.field",
    rowPrefix: "metaui.validation.row",
    invalidValue: "metaui.validation.invalidValue",
    invalidItem: "metaui.validation.invalidItem",
    dateParseError: "metaui.picker.date.parseError",
    timeParseError: "metaui.picker.time.parseError",
    dateTimeParseError: "metaui.picker.dateTime.parseError",
    numberParseError: "metaui.number.parseError",
    integerParseError: "metaui.number.integerParseError",
    dictionaryLabel: "metaui.dictionary.defaultLabel",
    dictionaryAddEntry: "metaui.dictionary.addEntry",
    dictionaryEmpty: "metaui.dictionary.empty",
    dictionaryInvalidKeys: "metaui.dictionary.invalidKeys",
    fileUploadNoFile: "metaui.fileUpload.noFile",
    fileUploadImageAlt: "metaui.fileUpload.imageAlt",
    fileUploadPlaceholder: "metaui.fileUpload.placeholder",
    fileUploadBrowse: "metaui.fileUpload.browse",
    hardwareImageAlt: "metaui.hardware.imageAlt",
    hardwareSignatureAlt: "metaui.hardware.signatureAlt",
    geolocationCoordinates: "metaui.geolocation.coordinates",
    multiInputPlaceholder: "metaui.multiInput.placeholder",
    passwordPlaceholder: "metaui.password.placeholder",
    editorExpand: "metaui.editor.expand",
    editorDialogTitle: "metaui.editor.dialogTitle",
    editorClose: "metaui.editor.close",
    nestedEdit: "metaui.nested.edit",
    nestedView: "metaui.nested.view",
    nestedViewSummary: "metaui.nested.viewSummary",
    nestedArrayLabel: "metaui.nested.array.label",
    nestedArrayInvalid: "metaui.nested.array.invalid",
    nestedObjectLabel: "metaui.nested.object.label",
    nestedObjectTitle: "metaui.nested.object.title",
    nestedObjectInvalid: "metaui.nested.object.invalid",
    nestedReferenceLabel: "metaui.nested.reference.label",
    nestedReferenceInvalid: "metaui.nested.reference.invalid",
    actionClearForm: "metaui.action.clearForm",
    actionSubmit: "metaui.action.submit",
    actionOpenLink: "metaui.action.openLink",
    dataSourceSearchPlaceholder: "metaui.dataSource.searchPlaceholder",
    dataSourceSelectPlaceholder: "metaui.dataSource.selectPlaceholder",
    dataSourceValueHelpPlaceholder: "metaui.dataSource.valueHelpPlaceholder",
    dataSourceValueHelpTitle: "metaui.dataSource.valueHelpTitle"
} as const;

/** Union of the text keys declared in {@link TEXT_KEY}. */
export type MetaUITextKey = (typeof TEXT_KEY)[keyof typeof TEXT_KEY];

/** Keys already reported as unresolvable, so a broken bundle logs once per key instead of per keystroke. */
const reportedMissingKeys = new Set<string>();

/**
 * Reads end-user texts from the MetaUI library resource bundle.
 *
 * @namespace nz.co.siliconst.ui5.metaui.utils
 * @public
 */
export class I18n {
    /**
     * Returns the library's resource bundle for the current session locale, or `undefined` when it
     * cannot be obtained (no UI5 library registration, or the bundle failed to load).
     *
     * @returns {ResourceBundle | undefined} The locale-matched bundle, or `undefined`.
     */
    public static getBundle(): ResourceBundle | undefined {
        try {
            return Lib.getResourceBundleFor(METAUI_LIBRARY_NAME);
        } catch (error) {
            Logger.error(
                "[MetaUI I18n]",
                `Could not load the resource bundle for library '${METAUI_LIBRARY_NAME}': ${(error as Error).message}`,
                "I18n"
            );
            return undefined;
        }
    }

    /**
     * Resolves a text key against the library bundle.
     *
     * Values are passed as `args` and substituted into the translated sentence through its `{0}`,
     * `{1}`, … placeholders. They are never concatenated onto a translated fragment, because the
     * position of a value inside a sentence differs between languages.
     *
     * @param key A key declared in {@link TEXT_KEY}.
     * @param args Values for the text's placeholders, in placeholder order. Omit for texts with none.
     * @returns {string} The locale-specific text, or the key itself if it resolves nowhere.
     */
    public static getText(key: MetaUITextKey, args?: (string | number)[]): string {
        const bundle = I18n.getBundle();
        if (bundle) {
            // bIgnoreKeyFallback = true: a missing key yields undefined instead of the key string,
            // which is what lets a packaging defect be distinguished from a legitimate text.
            const text = bundle.getText(key, args, true);
            if (text !== undefined) {
                return text;
            }
        }
        if (!reportedMissingKeys.has(key)) {
            reportedMissingKeys.add(key);
            Logger.error(
                "[MetaUI I18n]",
                `No text for key '${key}' in messagebundle.properties of '${METAUI_LIBRARY_NAME}'. ` +
                    "The key is being rendered verbatim; the bundle is missing from the deployment or the key was removed.",
                "I18n"
            );
        }
        return key;
    }

    /**
     * Reports whether a key resolves to a text anywhere in the bundle's fallback chain, without
     * logging and without substituting placeholders.
     *
     * @param key The key to probe. Any string is accepted so that absent keys can be asserted on.
     * @returns {boolean} True when the key resolves to a text.
     */
    public static hasText(key: string): boolean {
        const bundle = I18n.getBundle();
        return bundle ? bundle.getText(key, undefined, true) !== undefined : false;
    }

    /**
     * Lists every text key the library can emit.
     *
     * @returns {MetaUITextKey[]} All values of {@link TEXT_KEY}.
     */
    public static getDeclaredKeys(): MetaUITextKey[] {
        return Object.values(TEXT_KEY);
    }
}
