/**
 * @file ValidationLedger.ts
 * @description Single-authority coordinator for the three-tier validation state ledger (schemaError, policyError, customError),
 * recursive table-row array validation, visual control error resolution, and UI5 Messaging synchronization.
 */

import { ISchema, IPropertyMetadata } from "../interfaces/ISchema";
import { IPlugin, IPluginValidationResult } from "../interfaces/IPlugin";
import { IEngineHost } from "../interfaces/IEngineHost";
import { PayloadValidator } from "./PayloadValidator";
import { SchemaNormalizer } from "./SchemaNormalizer";
import { ControlDirectiveUtil, forEachBoundControl } from "../utils/ControlDirectiveUtil";
import { Logger } from "../utils/Logger";
import { I18n, TEXT_KEY } from "../utils/I18n";
import { isRecord } from "../utils/TypeGuards";
import Control from "sap/ui/core/Control";
import Messaging from "sap/ui/core/Messaging";
import Message from "sap/ui/core/message/Message";
import MessageType from "sap/ui/core/message/MessageType";

/** Three-tier validation state entry tracked per normalized field path. */
export interface IValidationLedgerEntry {
    schemaError: string | null;
    policyError: string | null;
    customError: string | null;
}

/**
 * Coordinates validation errors across schema validators, PolicyEngine rules, and consumer custom errors,
 * resolving a single authoritative visual state on each field plugin or table cell and owning all UI5 Messaging entries.
 *
 * @namespace nz.co.siliconst.ui5.metaui.core
 * @public
 */
export class ValidationLedger {
    private readonly entries: Map<string, IValidationLedgerEntry> = new Map();
    private readonly activeMessages: Map<string, Message> = new Map();
    private readonly dynamicRequiredPaths: Map<string, boolean> = new Map();
    private readonly dynamicVisiblePaths: Map<string, boolean> = new Map();

    /**
     * Paths the Engine could not turn into a control at all, keyed by normalized path, with the message to report.
     *
     * These are deliberately **not** `entries`. A three-tier entry is data state: it is cleared whenever the data is
     * hot-swapped, the form is cleared or the policy engine resets, and `resolveVisualState` paints it onto a control.
     * A generation failure is structural: there is no control to paint, and the field stays unvalidatable until the
     * layout is rebuilt, so the record must survive every one of those resets. Only {@link clearFieldGenerationFailures},
     * which the Engine calls when it disposes the previous build, discards them.
     */
    private readonly generationFailures: Map<string, string> = new Map();

    constructor(
        private useMessageManager: boolean,
        private readonly getPluginByPath: (path: string) => IPlugin | undefined,
        private readonly getActivePlugins: () => ReadonlyArray<{ plugin: IPlugin; path: string }>,
        private readonly getHost: () => IEngineHost | undefined
    ) {}

    /** Updates UI5 MessageManager integration at runtime, purging or publishing active ledger messages. */
    public setUseMessageManager(use: boolean): void {
        if (this.useMessageManager === use) {
            return;
        }
        if (!use && this.activeMessages.size > 0) {
            Messaging.removeMessages(Array.from(this.activeMessages.values()));
            this.activeMessages.clear();
        }
        this.useMessageManager = use;
        if (use) {
            for (const cleanPath of this.entries.keys()) {
                this.resolveVisualState(cleanPath);
            }
        }
    }

    /** Returns true if a field or table cell (or an ancestor container) is currently hidden. */
    public isPathHidden(fieldPath: string): boolean {
        const cleanPath = fieldPath.replace(/^\//, "");
        const plugin = this.getPluginByPath(cleanPath);
        if (plugin && !plugin.isVisible()) {
            return true;
        }
        if (this.dynamicVisiblePaths.get(cleanPath) === false) {
            return true;
        }
        for (const [visPath, isVis] of this.dynamicVisiblePaths.entries()) {
            if (!isVis && cleanPath.startsWith(`${visPath}/`)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Returns true if a nested field path belongs to an optional parent object that is currently absent or completely unpopulated.
     */
    public isInsideAbsentOptionalObject(fieldPath: string): boolean {
        const cleanPath = fieldPath.replace(/^\//, "");
        const parts = cleanPath.split("/");
        if (parts.length < 2) {
            return false;
        }
        const host = this.getHost();
        const stateManager = host && typeof host.getStateManager === "function" ? host.getStateManager() : null;
        const schema = stateManager ? stateManager.getSchema() : host?.getParsedSchema?.() || null;
        if (!schema || !stateManager) {
            return false;
        }
        const isUnpopulatedRecord = (val: unknown): boolean => {
            if (val === undefined || val === null || val === "") {
                return true;
            }
            if (Array.isArray(val)) {
                return val.length === 0;
            }
            if (isRecord(val)) {
                return Object.values(val).every(isUnpopulatedRecord);
            }
            return false;
        };
        let prefix = "";
        for (let i = 0; i < parts.length - 1; i++) {
            prefix = prefix ? `${prefix}/${parts[i]}` : parts[i];
            const scopeStr = `#/properties/${prefix.replace(/\//g, "/properties/")}`;
            const { meta } = SchemaNormalizer.resolveScope(schema, scopeStr);
            if (meta && meta.type === "object" && meta.required !== true && this.dynamicRequiredPaths.get(prefix) !== true) {
                const parentVal = stateManager.getProperty(`/${prefix}`);
                if (isUnpopulatedRecord(parentVal)) {
                    return true;
                }
            }
        }
        return false;
    }

    /** Iterates through all active plugins, table-row arrays, and custom/policy errors in the ledger. */
    public validateAll(applyVisualState: boolean = false): IPluginValidationResult[] {
        const errors: IPluginValidationResult[] = [];
        for (const item of this.getActivePlugins()) {
            try {
                if (this.isInsideAbsentOptionalObject(item.path)) {
                    this.reportSchemaError(item.path, null);
                    continue;
                }
                const result = item.plugin.validate();
                if (applyVisualState || result.isValid) {
                    this.reportSchemaError(item.path, result.isValid ? null : result.errorMessage || "Invalid input");
                }
                if (!result.isValid) {
                    result.fieldKey = result.fieldKey || item.path.replace(/^\//, "");
                    errors.push(result);
                    Logger.error("[MetaUI Validation] Plugin failed validation:", item.path || item.plugin.constructor.name);
                }
            } catch (error) {
                // Fail closed, exactly as `PipelineManager.executeValidation` does one layer down. A plugin that
                // crashes has not proved the field is valid, and swallowing the crash let `hasActiveErrors()` stay
                // false so `triggerSubmit()` fired `submit` on a form nobody had actually validated.
                const msg = (error as Error).message;
                Logger.error(`[MetaUI Engine] Error validating plugin at ${item.path}`, msg);
                const fieldKey = item.path.replace(/^\//, "");
                const errorMessage = I18n.getText(TEXT_KEY.systemError, [msg]);
                this.reportCrashedPluginError(fieldKey, errorMessage, applyVisualState);
                if (!errors.some((e) => e.fieldKey === fieldKey)) {
                    errors.push({ isValid: false, fieldKey, fieldLabel: fieldKey, errorMessage });
                }
            }
        }

        const host = this.getHost();
        const stateManager = host && typeof host.getStateManager === "function" ? host.getStateManager() : null;
        if (stateManager) {
            const payload = stateManager.extractPayload();
            const schema = stateManager.getSchema();
            if (payload && schema) {
                const resolveDef = (ref: string): ISchema | null => host?.getSchemaDefinition?.(ref) || null;
                const arrayErrors = PayloadValidator.validatePayloadArrays(
                    schema,
                    payload,
                    "",
                    this.getPluginByPath,
                    resolveDef,
                    (p) => this.getDynamicRowRequired(p),
                    (p) => this.isPathHidden(p)
                );
                for (const err of arrayErrors) {
                    if (err.fieldKey) {
                        if (!err.isValid && applyVisualState) {
                            this.reportSchemaError(err.fieldKey, err.errorMessage || "Invalid input");
                        } else if (err.isValid && !this.hasControlParseError(err.fieldKey)) {
                            this.reportSchemaError(err.fieldKey, null);
                        }
                    }
                }
                errors.push(...arrayErrors.filter((e) => !e.isValid));
            }
        }

        for (const [cleanPath, entry] of this.entries.entries()) {
            const plugin = this.getPluginByPath(cleanPath);
            const isHidden = this.isPathHidden(cleanPath);
            const activeLedgerError = entry.customError || (isHidden ? null : entry.policyError || entry.schemaError);
            if (activeLedgerError !== null) {
                if (applyVisualState) {
                    this.resolveVisualState(cleanPath);
                }
                if (!errors.some((e) => e.fieldKey === cleanPath)) {
                    const fieldLabel = plugin?.getFieldLabel() || cleanPath;
                    errors.push({ isValid: false, fieldKey: cleanPath, fieldLabel, errorMessage: activeLedgerError });
                }
            }
        }

        errors.push(...this.collectGenerationFailureResults(errors));
        return errors;
    }

    /**
     * Records the schema error raised by a plugin whose `validate()` threw.
     *
     * The entry is always stored, so `hasActiveErrors()` and therefore the host's `isValid` report the crash even
     * on a non-painting pass. Resolving the visual state is guarded because the control that just crashed may
     * crash again inside `setVisualValidationState`, which would abort the remaining plugins in `validateAll`.
     *
     * @param fieldKey The slash-stripped path of the crashed plugin.
     * @param errorMessage The system error message to record.
     * @param applyVisualState True when this pass is allowed to repaint the field.
     */
    private reportCrashedPluginError(fieldKey: string, errorMessage: string, applyVisualState: boolean): void {
        this.ensureEntry(fieldKey).schemaError = errorMessage;
        if (!applyVisualState) {
            return;
        }
        try {
            this.resolveVisualState(fieldKey);
        } catch (visualError) {
            Logger.error(
                "[MetaUI ValidationLedger]",
                `Could not paint the validation crash on '${fieldKey}': ` + (visualError as Error).message,
                "ValidationLedger"
            );
        }
    }

    /** Validates a specific inline array path and its nested rows, painting individual invalid cells. */
    public validateArrayField(arrayPath: string, meta: IPropertyMetadata): boolean {
        const cleanPath = arrayPath.replace(/^\//, "");
        if (this.isPathHidden(cleanPath) || meta.ui?.visible === false) {
            this.reportSchemaError(cleanPath, null);
            return true;
        }
        const host = this.getHost();
        const stateManager = host && typeof host.getStateManager === "function" ? host.getStateManager() : null;
        const payload = stateManager ? stateManager.extractPayload() : undefined;
        const subSchema: ISchema = {
            type: "object",
            properties: { [cleanPath]: meta },
            required: meta.required === true ? [cleanPath] : undefined
        };
        const currentVal = stateManager ? stateManager.getProperty(`/${cleanPath}`) : undefined;
        const fallbackFromPayload =
            payload && typeof payload === "object" && !Array.isArray(payload)
                ? (payload as Record<string, unknown>)[cleanPath]
                : undefined;
        const wrappedPayload = { [cleanPath]: currentVal ?? fallbackFromPayload };
        const resolveDef = (ref: string): ISchema | null => host?.getSchemaDefinition?.(ref) || null;
        const arrayErrors = PayloadValidator.validatePayloadArrays(
            subSchema,
            wrappedPayload,
            "",
            this.getPluginByPath,
            resolveDef,
            (p) => this.getDynamicRowRequired(p),
            (p) => this.isPathHidden(p)
        );
        let allValid = true;
        for (const err of arrayErrors) {
            if (err.fieldKey) {
                if (!err.isValid) {
                    this.reportSchemaError(err.fieldKey, err.errorMessage || "Invalid input");
                    allValid = false;
                } else if (!this.hasControlParseError(err.fieldKey)) {
                    this.reportSchemaError(err.fieldKey, null);
                }
            }
        }
        return allValid;
    }

    /** Returns true if any tracked field currently holds an active custom, policy, or schema error. */
    public hasActiveErrors(): boolean {
        // A field that never became a control cannot be hidden, cleared or re-validated into health, so it is
        // checked before the data-driven entries and is not subject to the `isPathHidden` exemption below.
        if (this.generationFailures.size > 0) {
            return true;
        }
        for (const [cleanPath, entry] of this.entries.entries()) {
            const isHidden = this.isPathHidden(cleanPath);
            if (entry.customError || (!isHidden && (entry.policyError || entry.schemaError))) {
                return true;
            }
        }
        return false;
    }

    /**
     * Checks whether any of the given field paths (or their nested child paths) currently has an active policy or custom error.
     *
     * @param fieldPaths Array of field paths belonging to a section or wizard step.
     * @returns {boolean} True if an active error exists for any of the paths.
     */
    public hasActiveErrorsForPaths(fieldPaths: string[]): boolean {
        const cleanSet = fieldPaths.map((p) => p.replace(/^\//, ""));
        const matchesScope = (cleanPath: string): boolean =>
            cleanSet.some((prefix) => cleanPath === prefix || cleanPath.startsWith(`${prefix}/`));
        // A wizard step holding a field that failed to generate must not be navigable past, for the same
        // reason the whole form must not be submittable: nothing validated that field.
        for (const cleanPath of this.generationFailures.keys()) {
            if (matchesScope(cleanPath)) {
                return true;
            }
        }
        for (const [cleanPath, entry] of this.entries.entries()) {
            if (!matchesScope(cleanPath)) {
                continue;
            }
            const isHidden = this.isPathHidden(cleanPath);
            if (entry.customError || (!isHidden && (entry.policyError || entry.schemaError))) {
                return true;
            }
        }
        return false;
    }

    /**
     * Extracts surviving row validation entries under `arrayPath`, shifting row indices greater than `deletedRowIndex`
     * down by 1 when a row is deleted (or preserving indices when `deletedRowIndex === -1` for row append).
     *
     * @param arrayPath The array binding path.
     * @param deletedRowIndex The deleted row index, `-1` for row append, or `undefined` to discard all entries.
     * @returns {Array<{ key: string; entry: IValidationLedgerEntry }>} Shifted row entries to restore after cleanup.
     */
    public extractShiftedRowEntries(
        arrayPath: string,
        deletedRowIndex?: number
    ): Array<{ key: string; entry: IValidationLedgerEntry }> {
        if (deletedRowIndex === undefined) {
            return [];
        }
        const cleanPrefix = arrayPath.replace(/^\//, "");
        // A root array (`"/"`) strips to `""`, and ledger keys are stored without their leading slash,
        // so its row entries are keyed `"0/Name"` rather than `"/0/Name"`. Matching on `"/"` found nothing
        // and every surviving row error was dropped on each add/delete.
        const rowPrefix = cleanPrefix ? `${cleanPrefix}/` : "";
        const shifted: Array<{ key: string; entry: IValidationLedgerEntry }> = [];
        for (const [key, entry] of this.entries.entries()) {
            if (!key.startsWith(rowPrefix)) {
                continue;
            }
            if (!entry.schemaError && !entry.policyError && !entry.customError) {
                continue;
            }
            const subPath = key.substring(rowPrefix.length);
            const slashIdx = subPath.indexOf("/");
            const rowToken = slashIdx === -1 ? subPath : subPath.substring(0, slashIdx);
            const rest = slashIdx === -1 ? "" : subPath.substring(slashIdx);
            // An empty row token can only occur for a root array, where `Number("")` is 0; require real digits.
            if (!/^\d+$/.test(rowToken)) {
                continue;
            }
            const rowIdx = Number(rowToken);
            if (deletedRowIndex < 0 || rowIdx < deletedRowIndex) {
                shifted.push({ key, entry: { ...entry } });
            } else if (rowIdx > deletedRowIndex) {
                shifted.push({ key: `${rowPrefix}${rowIdx - 1}${rest}`, entry: { ...entry } });
            }
        }
        return shifted;
    }

    /**
     * Restores shifted row validation entries after an array mutation and re-applies their visual error states.
     *
     * @param shiftedEntries Array of shifted ledger entries returned by `extractShiftedRowEntries`.
     */
    public restoreRowEntries(shiftedEntries: ReadonlyArray<{ key: string; entry: IValidationLedgerEntry }>): void {
        for (const item of shiftedEntries) {
            const targetEntry = this.ensureEntry(item.key);
            if (item.entry.schemaError) {
                targetEntry.schemaError = item.entry.schemaError;
            }
            if (item.entry.policyError && !targetEntry.policyError) {
                targetEntry.policyError = item.entry.policyError;
            }
            if (item.entry.customError) {
                targetEntry.customError = item.entry.customError;
            }
            this.resolveVisualState(item.key);
        }
    }

    /**
     * Clears all ledger entries, visual control errors, and active messages under a given path prefix.
     *
     * `""` means "every entry" (used by the Clear Form action). `"/"` is the binding path of a **root**
     * array and must only clear that array's row entries — not unrelated consumer custom errors — exactly
     * as `"/Items"` only clears `Items` and its descendants.
     *
     * @param arrayPath The path prefix to clear, `"/"` for a root array, or `""` to clear the whole ledger.
     */
    public clearArrayEntries(arrayPath: string): void {
        const cleanPrefix = arrayPath.replace(/^\//, "");
        const isRootArray = !cleanPrefix && arrayPath !== "";
        const matchesPrefix = (key: string): boolean => {
            if (isRootArray) {
                return /^\d+($|\/)/.test(key);
            }
            return !cleanPrefix || key === cleanPrefix || key.startsWith(`${cleanPrefix}/`);
        };
        for (const key of Array.from(this.entries.keys())) {
            if (matchesPrefix(key)) {
                this.setNativeControlError(key, undefined, true);
                const msg = this.activeMessages.get(key);
                if (msg && this.useMessageManager) {
                    Messaging.removeMessages(msg);
                    this.activeMessages.delete(key);
                }
                this.entries.delete(key);
            }
        }
        for (const key of Array.from(this.dynamicRequiredPaths.keys())) {
            if (matchesPrefix(key)) {
                this.dynamicRequiredPaths.delete(key);
            }
        }
        for (const key of Array.from(this.dynamicVisiblePaths.keys())) {
            if (matchesPrefix(key)) {
                this.dynamicVisiblePaths.delete(key);
            }
        }
        const host = this.getHost();
        if (host?.generatedContent) {
            ControlDirectiveUtil.clearBoundControlSubtree(host.generatedContent, host, cleanPrefix);
        }
    }

    /** Reports a localized schema validation error to the coordinator ledger. */
    public reportSchemaError(fieldPath: string, errorMessage: string | null): void {
        const cleanPath = fieldPath.replace(/^\//, "");
        this.ensureEntry(cleanPath).schemaError = errorMessage;
        this.resolveVisualState(cleanPath);
    }

    /** Reports a cross-field policy error to the coordinator ledger. */
    public reportPolicyError(fieldPath: string, errorMessage: string | null): void {
        const cleanPath = fieldPath.replace(/^\//, "");
        this.ensureEntry(cleanPath).policyError = errorMessage;
        this.resolveVisualState(cleanPath);
    }

    /** Reports (or clears, when `null`) an external custom error in the coordinator ledger. */
    public reportCustomError(fieldPath: string, errorMessage: string | null): void {
        const cleanPath = fieldPath.replace(/^\//, "");
        this.ensureEntry(cleanPath).customError = errorMessage;
        this.resolveVisualState(cleanPath);
    }

    /**
     * Records a field (or sub-layout) the Engine could not generate, so the form reports invalid and refuses to submit.
     *
     * Without this the failure was visible and permissive at the same time: the field painted the
     * `[Error generating field X]` placeholder and raised the form-level warning strip, while `hasActiveErrors()`
     * stayed false, `isValid` stayed `true` and `triggerSubmit()` fired `submit`. A `required` field that never
     * rendered therefore submitted empty with no error and no block - the exact silent-degradation failure the
     * per-field placeholder exists to prevent. Nothing validates a control that does not exist, so the only correct
     * answer is to fail closed.
     *
     * @param fieldPath The binding path the Engine was generating when it failed. `""` is the root layout.
     * @param errorMessage The message to surface in `validateAll()` and in UI5 Messaging.
     */
    public reportFieldGenerationFailure(fieldPath: string, errorMessage: string): void {
        this.generationFailures.set(fieldPath.replace(/^\//, ""), errorMessage);
    }

    /**
     * Discards every recorded generation failure. Called by the Engine when it disposes the previous build, because
     * a rebuild re-runs generation and will re-record anything that fails again.
     */
    public clearFieldGenerationFailures(): void {
        this.generationFailures.clear();
    }

    /**
     * Returns the recorded generation failures, keyed by normalized path.
     *
     * @returns {ReadonlyMap<string, string>} Path to error message for every field that could not be generated.
     */
    public getFieldGenerationFailures(): ReadonlyMap<string, string> {
        return this.generationFailures;
    }

    /**
     * Builds one validation result per recorded generation failure, skipping paths already reported by another tier.
     *
     * @param existing The results collected so far in this pass, used to avoid reporting a path twice.
     * @returns {IPluginValidationResult[]} One result per generation failure not already present in `existing`.
     */
    private collectGenerationFailureResults(existing: IPluginValidationResult[]): IPluginValidationResult[] {
        const results: IPluginValidationResult[] = [];
        for (const [cleanPath, errorMessage] of this.generationFailures.entries()) {
            if (existing.some((e) => e.fieldKey === cleanPath) || results.some((e) => e.fieldKey === cleanPath)) {
                continue;
            }
            results.push({ isValid: false, fieldKey: cleanPath, fieldLabel: cleanPath, errorMessage });
        }
        return results;
    }

    /** Applies a policy state (`visibility`, `required`, `editable`) to cloned table row cell controls. */
    public applyRowControlState(
        targetPath: string,
        property: "visibility" | "required" | "editable",
        value: boolean
    ): void {
        const cleanPath = targetPath.replace(/^\//, "");
        if (property === "required") {
            this.dynamicRequiredPaths.set(cleanPath, value);
            if (!value && this.entries.get(cleanPath)?.schemaError) {
                this.clearSchemaErrorIfNowValid(cleanPath);
            }
        } else if (property === "visibility") {
            // The stored schemaError is deliberately kept: `isPathHidden()` already suppresses it from
            // `hasActiveErrors()`, `validateAll()` and the painted state while the field is hidden, and
            // deleting it would destroy a real format or range failure that must reappear on unhide.
            this.dynamicVisiblePaths.set(cleanPath, value);
        }
        const host = this.getHost();
        if (!host || !host.generatedContent) {
            return;
        }
        ControlDirectiveUtil.applyBoundRowPolicyState(host.generatedContent, host, cleanPath, property, value);
        if (property === "visibility" && this.entries.has(cleanPath)) {
            this.resolveVisualState(cleanPath);
        }
    }

    /**
     * Re-validates a field whose dynamic `required` flag was just relaxed and clears its schema error
     * only when the field now passes, mirroring the plugin-backed route in `PolicyDelegate.evaluateNow`.
     * The stored error may be a format, range or pattern failure that a `required: false` policy must not erase.
     *
     * @param cleanPath The slash-stripped field path whose `required` constraint was lifted.
     */
    private clearSchemaErrorIfNowValid(cleanPath: string): void {
        const plugin = this.getPluginByPath(cleanPath);
        if (plugin) {
            if (plugin.validate().isValid) {
                this.reportSchemaError(cleanPath, null);
            }
            return;
        }
        const host = this.getHost();
        const stateManager = host && typeof host.getStateManager === "function" ? host.getStateManager() : null;
        const meta = this.resolveMetaForDataPath(cleanPath);
        if (!meta || !stateManager) {
            Logger.debug(
                "[MetaUI ValidationLedger]",
                `Cannot re-validate '${cleanPath}' after relaxing 'required'; its stored schema error is kept ` +
                    `and will be recomputed by the next validateAll().`
            );
            return;
        }
        const resolveDef = (ref: string): ISchema | null => host?.getSchemaDefinition?.(ref) || null;
        const result = PayloadValidator.validateTree(meta, stateManager.getProperty(`/${cleanPath}`), resolveDef, 0, false);
        if (result.isValid) {
            this.reportSchemaError(cleanPath, null);
        }
    }

    /**
     * Resolves the schema metadata behind a live data path, stepping into `items` for numeric row indices
     * (e.g. `"Items/0/Price"` resolves through `properties.Items.items.properties.Price`).
     *
     * @param cleanPath The slash-stripped data path.
     * @returns {IPropertyMetadata | undefined} The resolved metadata, or undefined when the path is unknown.
     */
    private resolveMetaForDataPath(cleanPath: string): IPropertyMetadata | undefined {
        const host = this.getHost();
        const stateManager = host && typeof host.getStateManager === "function" ? host.getStateManager() : null;
        const schema = stateManager ? stateManager.getSchema() : host?.getParsedSchema?.() || null;
        if (!schema || !cleanPath) {
            return undefined;
        }
        let node: IPropertyMetadata | undefined = {
            type: schema.type || "object",
            properties: schema.properties,
            items: schema.items
        };
        for (const segment of cleanPath.split("/")) {
            if (!node) {
                return undefined;
            }
            const definition: ISchema | undefined = node.$ref ? host?.getSchemaDefinition?.(node.$ref) : undefined;
            const items: IPropertyMetadata | undefined = node.items || definition?.items;
            const properties: Record<string, IPropertyMetadata> | undefined = node.properties || definition?.properties;
            node = /^\d+$/.test(segment) ? items : properties?.[segment];
        }
        return node;
    }

    /** Purges all tracked messages and clears the ledger on engine teardown or hot-swap. */
    public clear(resetVisuals: boolean = false): void {
        if (resetVisuals) {
            for (const cleanPath of this.entries.keys()) {
                const plugin = this.getPluginByPath(cleanPath);
                if (plugin) {
                    plugin.setVisualValidationState(true);
                } else {
                    this.setNativeControlError(cleanPath, undefined, true);
                }
            }
        }
        if (this.useMessageManager && this.activeMessages.size > 0) {
            Messaging.removeMessages(Array.from(this.activeMessages.values()));
        }
        this.entries.clear();
        this.activeMessages.clear();
        this.dynamicRequiredPaths.clear();
        this.dynamicVisiblePaths.clear();
    }

    private ensureEntry(cleanPath: string): IValidationLedgerEntry {
        let entry = this.entries.get(cleanPath);
        if (!entry) {
            entry = { schemaError: null, policyError: null, customError: null };
            this.entries.set(cleanPath, entry);
        }
        return entry;
    }

    /** Re-evaluates the visual validation state and MessageManager entry for a field path. */
    public resolveVisualState(fieldPath: string): void {
        const cleanPath = fieldPath.replace(/^\//, "");
        const plugin = this.getPluginByPath(cleanPath);
        const ledgerEntry = this.entries.get(cleanPath);
        const isHidden = this.isPathHidden(cleanPath);
        const errorMessage = ledgerEntry
            ? ledgerEntry.customError || (isHidden ? null : ledgerEntry.policyError || ledgerEntry.schemaError)
            : null;
        const isError = errorMessage !== null;

        if (plugin) {
            plugin.setVisualValidationState(!isError, isError ? errorMessage || undefined : undefined);
        } else if (ledgerEntry) {
            this.setNativeControlError(cleanPath, isError ? errorMessage || undefined : undefined);
        }
        if (!this.useMessageManager) {
            return;
        }

        const currentMsg = this.activeMessages.get(cleanPath);
        if (currentMsg) {
            Messaging.removeMessages(currentMsg);
            this.activeMessages.delete(cleanPath);
        }
        const targetPath = `/${cleanPath}`;
        const host = this.getHost();
        const processorModel =
            host && typeof host.getStateManager === "function" ? host.getStateManager()?.getModel() : undefined;
        if (processorModel) {
            const processorId = processorModel.getId();
            const allMsgs = Messaging.getMessageModel().getData() as Message[];
            const duplicates = allMsgs.filter(
                (m) => m.getMessageProcessor()?.getId() === processorId && m.getTarget() === targetPath
            );
            if (duplicates.length > 0) {
                Messaging.removeMessages(duplicates);
            }
        }
        if (isError) {
            const isCustom = Boolean(ledgerEntry?.customError);
            const displayLabel = plugin?.getFieldLabel() || cleanPath;
            const newMsg = new Message({
                message: isCustom
                    ? errorMessage || "Validation Error"
                    : `Field '${displayLabel}': ${errorMessage || "Validation Error"}`,
                additionalText: displayLabel !== targetPath ? displayLabel : undefined,
                type: MessageType.Error,
                target: targetPath,
                processor: processorModel,
                code: isCustom ? "CustomError" : undefined
            });
            Messaging.addMessages(newMsg);
            this.activeMessages.set(cleanPath, newMsg);
        } else if (processorModel && !this.hasActiveErrors()) {
            const processorId = processorModel.getId();
            const allMsgs = Messaging.getMessageModel().getData() as Message[];
            const summaryMsgs = allMsgs.filter(
                (m) => m.getMessageProcessor()?.getId() === processorId && m.getTarget() === ""
            );
            if (summaryMsgs.length > 0) {
                Messaging.removeMessages(summaryMsgs);
            }
        }
    }

    private setNativeControlError(targetPath: string, errorMessage?: string, clearParseFlag: boolean = false): void {
        const host = this.getHost();
        if (!host || !host.generatedContent) {
            return;
        }
        forEachBoundControl(host.generatedContent, host, targetPath.replace(/^\//, ""), (inspectable) => {
            if (clearParseFlag && typeof inspectable.data === "function") {
                inspectable.data("metauiParseInvalid", null);
            }
            ControlDirectiveUtil.applyVisualValidationState(inspectable as Control, !errorMessage, errorMessage);
        });
    }

    private getDynamicRowRequired(targetPath: string): boolean | undefined {
        const cleanPath = targetPath.replace(/^\//, "");
        if (this.dynamicRequiredPaths.has(cleanPath)) {
            return this.dynamicRequiredPaths.get(cleanPath);
        }
        const host = this.getHost();
        if (!host || !host.generatedContent) {
            return undefined;
        }
        let dynReq: boolean | undefined;
        forEachBoundControl(host.generatedContent, host, cleanPath, (inspectable) => {
            const val = inspectable.data?.("metauiDynamicRequired");
            if (typeof val === "boolean") {
                dynReq = val;
            }
        });
        return dynReq;
    }

    private hasControlParseError(targetPath: string): boolean {
        const host = this.getHost();
        if (!host || !host.generatedContent) {
            return false;
        }
        let hasParseError = false;
        forEachBoundControl(host.generatedContent, host, targetPath.replace(/^\//, ""), (inspectable) => {
            if (
                inspectable.data?.("metauiParseInvalid") === true ||
                (typeof inspectable.isValidValue === "function" && !inspectable.isValidValue())
            ) {
                hasParseError = true;
            }
        });
        return hasParseError;
    }
}
