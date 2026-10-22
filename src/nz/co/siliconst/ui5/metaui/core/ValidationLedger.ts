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
                Logger.error(`[MetaUI Engine] Error validating plugin at ${item.path}`, (error as Error).message);
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
        return errors;
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
        for (const [cleanPath, entry] of this.entries.entries()) {
            const matches = cleanSet.some((prefix) => cleanPath === prefix || cleanPath.startsWith(`${prefix}/`));
            if (!matches) {
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
        const shifted: Array<{ key: string; entry: IValidationLedgerEntry }> = [];
        for (const [key, entry] of this.entries.entries()) {
            if (!key.startsWith(`${cleanPrefix}/`)) {
                continue;
            }
            if (!entry.schemaError && !entry.policyError && !entry.customError) {
                continue;
            }
            const subPath = key.substring(cleanPrefix.length + 1);
            const slashIdx = subPath.indexOf("/");
            const rowToken = slashIdx === -1 ? subPath : subPath.substring(0, slashIdx);
            const rest = slashIdx === -1 ? "" : subPath.substring(slashIdx);
            const rowIdx = Number(rowToken);
            if (!Number.isInteger(rowIdx) || rowIdx < 0) {
                continue;
            }
            if (deletedRowIndex < 0 || rowIdx < deletedRowIndex) {
                shifted.push({ key, entry: { ...entry } });
            } else if (rowIdx > deletedRowIndex) {
                shifted.push({ key: `${cleanPrefix}/${rowIdx - 1}${rest}`, entry: { ...entry } });
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

    /** Clears all ledger entries, visual control errors, and active messages under a given path prefix. */
    public clearArrayEntries(arrayPath: string): void {
        const cleanPrefix = arrayPath.replace(/^\//, "");
        const matchesPrefix = (key: string): boolean =>
            !cleanPrefix || key === cleanPrefix || key.startsWith(`${cleanPrefix}/`);
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
                this.reportSchemaError(cleanPath, null);
            }
        } else if (property === "visibility") {
            this.dynamicVisiblePaths.set(cleanPath, value);
            if (!value && this.entries.has(cleanPath)) {
                this.reportSchemaError(cleanPath, null);
            }
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
