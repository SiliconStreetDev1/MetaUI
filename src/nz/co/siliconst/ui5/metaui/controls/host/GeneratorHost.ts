/**
 * @file GeneratorHost.ts
 * @description Base wrapper element for embedding the dynamic form natively via Explicit or Inferred Schemas.
 */

import Control from "sap/ui/core/Control";
import { CSSSize } from "sap/ui/core/library";
import Event from "sap/ui/base/Event";
import ManagedObject from "sap/ui/base/ManagedObject";
import { Logger } from "../../utils/Logger";
import { I18n, TEXT_KEY } from "../../utils/I18n";
import { Engine } from "../../core/Engine";
import { StateManager } from "../../core/StateManager";
import { DataSyncDelegate } from "./delegates/DataSyncDelegate";
import { ValidationDelegate } from "./delegates/ValidationDelegate";
import { DialogDelegate, IHostDialog } from "./delegates/DialogDelegate";
import { PolicyDelegate } from "./delegates/PolicyDelegate";
import { GenerationDelegate } from "./delegates/GenerationDelegate";
import {
    HOST_CONTROL_METADATA,
    HOST_CONTROL_RENDERER,
    extractConstructorJsonLiterals
} from "./HostControlMetadata";
import { PluginRegistry } from "../../core/PluginRegistry";
import type { ISchema } from "../../interfaces/ISchema";
import type { IEngineHost } from "../../interfaces/IEngineHost";

/**
 * Base wrapper element for embedding the dynamic form natively via Explicit or Inferred Schemas.
 * Manages the lifecycle of the Engine, StateManager, and delegates for data sync, validation, policies, and dialogs.
 *
 * @namespace nz.co.siliconst.ui5.metaui.controls.host
 */
export default class GeneratorHost extends Control implements IEngineHost, IHostDialog {
    public sParentAggregationName?: string;
    protected stateManager: StateManager | null = null;
    public generatedContent: Control | null = null;
    protected engine: Engine | null = null;
    public activeModelName: string = "";

    protected dataSyncDelegate!: DataSyncDelegate;
    protected validationDelegate!: ValidationDelegate;
    protected dialogDelegate!: DialogDelegate;
    protected policyDelegate!: PolicyDelegate;
    protected generationDelegate!: GenerationDelegate;

    private normalizedDefinitions: Record<string, ISchema> | undefined;
    protected parsedSchema: ISchema | null = null;
    private inferredSchemaBaseline: ISchema | null = null;
    private _generatePromise: Promise<void> | null = null;
    private preservePayloadOnRegenerate: boolean = false;
    private _preservedPayload: unknown = null;
    private _generationId: number = 0;
    private _pendingRegenerate: boolean = false;
    private _isDestroyed: boolean = false;

    static readonly metadata = HOST_CONTROL_METADATA;
    static renderer = HOST_CONTROL_RENDERER;

    /** Standard UI5 Constructor. */
    constructor(idOrSettings?: string | object, settings?: object) {
        const extracted = extractConstructorJsonLiterals(idOrSettings, settings);
        super(extracted.idOrSettings as string, extracted.settings);
        if (extracted.literalSchemaDefinition !== undefined) {
            this.setProperty("schemaDefinition", extracted.literalSchemaDefinition, true);
        }
        if (extracted.literalDataJson !== undefined) {
            this.setProperty("dataJson", extracted.literalDataJson, true);
        }
    }

    /** Initializes the control and instantiates the composition delegates. */
    public init(): void {
        super.init();
        this.dataSyncDelegate = new DataSyncDelegate(this);
        this.validationDelegate = new ValidationDelegate(this);
        this.dialogDelegate = new DialogDelegate(this);
        this.policyDelegate = new PolicyDelegate((anyValuePruned?: boolean) => {
            if (anyValuePruned && this.getProperty("liveUpdate") === true && this.stateManager) {
                this.dataSyncDelegate.pushToBindings(this.stateManager.extractPayload());
            }
            this.syncOverallValidity();
        });
        this.generationDelegate = new GenerationDelegate(this);
        this.onInternalFieldChange = this.onInternalFieldChange.bind(this);
    }

    /** Enables or disables debug mode. */
    public setDebugMode(enabled: boolean): this {
        this.setProperty("debugMode", enabled, true);
        Logger.setDebugMode(enabled);
        return this;
    }

    /** Returns the active state manager instance managing the JSON payload. */
    public getStateManager(): StateManager | null {
        return this.stateManager;
    }

    /** Resolves a reference pointer against the global schema definitions dictionary. */
    public getSchemaDefinition(refPath: string): ISchema | undefined {
        const res = this.validationDelegate.resolveDefinition(refPath, this.normalizedDefinitions);
        this.normalizedDefinitions = res.normalizedDefs;
        return res.definition;
    }

    /** Returns the normalized `$ref` definitions dictionary. */
    public getSchemaDefinitions(): Record<string, ISchema> | undefined {
        const res = this.validationDelegate.resolveDefinition("", this.normalizedDefinitions);
        return (this.normalizedDefinitions = res.normalizedDefs);
    }

    /** Safely destroys the currently generated UI tree and cleans up active engine references. */
    public tearDownGeneratedLayout(): void {
        this.policyDelegate?.cancelPendingEvaluation();
        this.engine?.destroy();
        this.engine = null;
        this.generatedContent?.destroy();
        this.generatedContent = null;
        this.destroyAggregation("_content", true);
    }

    /** Immediately flushes any pending debounced policy evaluation. */
    public evaluatePoliciesNow(): void {
        this.policyDelegate.cancelPendingEvaluation();
        this.policyDelegate.evaluateNow(this.stateManager, this.engine);
    }

    /** Resets the policy differential matrix and immediately re-evaluates all policies. */
    public resetAndEvaluatePoliciesNow(): void {
        this.policyDelegate.cancelPendingEvaluation();
        this.policyDelegate.reset();
        this.policyDelegate.evaluateNow(this.stateManager, this.engine);
    }

    /** Reverts uncommitted sandbox changes when a modal dialog is cancelled in transactional mode. */
    public revertUncommittedChanges(): void {
        if (this.getProperty("liveUpdate") !== true) {
            this.dataSyncDelegate.revertToCommittedData();
        }
    }

    /** Notifies the host that fresh input data arrived (potentially while `preloadIfNeeded` was awaiting). */
    public notifyAsyncDataArrived(): void {
        this._preservedPayload = null;
        if (this._generatePromise && !this.stateManager) {
            this._pendingRegenerate = true;
            this._generationId++;
        }
    }

    /** Synchronizes the host-level `isValid` property with the active `ValidationLedger` error state. */
    public syncOverallValidity(): void {
        const overallValid = !(this.engine?.hasActiveErrors() ?? false);
        if (overallValid !== (this.getProperty("isValid") as boolean)) {
            this.setBaseProperty("isValid", overallValid, true);
            this.fireEvent("validationStateChanged", { isValid: overallValid });
        }
    }

    /** Resets validation errors and re-evaluates PBRE policies after an in-place data hot-swap. */
    public onDataHotSwapped(): void {
        this.validationDelegate.removeAllMessages();
        this.engine?.clearValidationErrors();
        this.policyDelegate.reset();
        this.policyDelegate.evaluateNow(this.stateManager, this.engine);
        this.syncOverallValidity();
    }

    /** Internal event handler triggered by the Engine when a field value changes. */
    protected onInternalFieldChange(isValid: boolean, fieldKey?: string, errorMessage?: string): void {
        const isLive = this.getProperty("liveUpdate") === true;
        const hasFieldListeners = this.hasListeners("fieldChange");
        const payload = (isLive || hasFieldListeners) && this.stateManager ? this.stateManager.extractPayload() : {};
        const value = fieldKey && this.stateManager ? this.stateManager.getProperty(fieldKey) : undefined;
        const overallValid = isValid && !(this.engine?.hasActiveErrors() ?? false);
        this.dataSyncDelegate.runWithSyncLock(() => {
            if (isLive) {
                this.dataSyncDelegate.pushToBindings(payload);
            }
            this.validationDelegate.notifyFieldValidation(isValid, fieldKey, errorMessage, overallValid);
            if (hasFieldListeners) {
                this.fireEvent("fieldChange", {
                    fieldPath: ValidationDelegate.normalizeFieldPath(fieldKey),
                    value,
                    payload,
                    isValid
                });
            }
        });
        if (fieldKey && this.policyDelegate.hasPolicies()) {
            this.policyDelegate.scheduleEvaluation(this.stateManager, this.engine);
        }
    }

    /**
     * Suppresses invalidation bubbling to parent views when this host is mounted in `dependents`.
     *
     * @param oOrigin Optional child control that triggered invalidation.
     */
    public override invalidate(oOrigin?: ManagedObject): void {
        if (this.sParentAggregationName !== "dependents") {
            super.invalidate(oOrigin);
        }
    }

    /** Standard UI5 Exit Hook. Ensures complete teardown of the engine, delegates, and state manager. */
    public exit(): void {
        this._isDestroyed = true;
        this._generationId++;
        this.policyDelegate.destroy();
        this.dialogDelegate.destroy();
        this.engine?.destroy();
        this.engine = null;
        this.stateManager?.destroy();
        this.stateManager = null;
        this.tearDownGeneratedLayout();
    }

    /** Exposes the parsed schema to the Engine and delegates. */
    public getParsedSchema(): ISchema | null {
        return this.parsedSchema;
    }

    /** Exposes the pristine inferred schema baseline to DataSyncDelegate for hot-swap structural diffing. */
    public getInferredSchemaBaseline(): ISchema | null {
        return this.inferredSchemaBaseline;
    }

    /** Standard UI5 Rendering Hook. */
    public onBeforeRendering(): void {
        if (this.generatedContent) {
            return;
        }
        if (this.getProperty("schemaDefinition") || this.getProperty("dataJson") || this.getProperty("data")) {
            void this.generate().catch((err: unknown) => {
                Logger.debug(`Async generate rejected during onBeforeRendering: ${(err as Error).message}`, undefined, "GeneratorHost");
            });
            return;
        }
        const msg = "GeneratorHost skipped rendering. Neither 'schemaDefinition' nor 'data' was provided.";
        Logger.error(msg, undefined, "GeneratorHost");
        this.fireEvent("error", { message: msg });
        this.validationDelegate.mountCrashBoundary(new Error(msg));
    }

    /** Public API method to manually trigger form submission. */
    public triggerSubmit(): boolean {
        if (!this.stateManager || !this.engine) {
            return false;
        }
        this.validationDelegate.clearBeforeSubmitErrors();
        this.validationDelegate.removeAllMessages();
        this.policyDelegate.evaluateNow(this.stateManager, this.engine);
        const errors = this.engine.validateAll(true);
        this.syncOverallValidity();
        if (errors.length > 0) {
            this.validationDelegate.reportValidationErrors(errors);
            return false;
        }
        const payload = this.stateManager.extractPayload();
        if (!this.validationDelegate.confirmBeforeSubmit(payload)) {
            return false;
        }
        const payloadJson = JSON.stringify(payload, null, 2);
        this.dataSyncDelegate.runWithSyncLock(() => {
            this.dataSyncDelegate.pushToBindings(payload, payloadJson);
            this.fireEvent("submit", { payload, payloadJson });
        });
        return true;
    }

    /** Injects a custom error message onto a specific field. */
    public addCustomError(fieldPath: string, message: string): void {
        this.validationDelegate.addCustomError(fieldPath, message);
        this.engine?.reportCustomError(fieldPath, message);
        this.syncOverallValidity();
    }

    /** Clears a custom error message from a specific field. */
    public clearCustomError(fieldPath: string): void {
        this.validationDelegate.clearCustomError(fieldPath);
        this.engine?.reportCustomError(fieldPath, null);
        this.syncOverallValidity();
    }

    /** Toggles busy state on the host control. */
    public setBusy(isBusy: boolean): this {
        return super.setBusy(isBusy);
    }

    /** Intercepts property changes. Hot-swaps data gracefully or forces UI teardown on structural changes. */
    public setProperty(propertyName: string, value: unknown, suppressInvalidate?: boolean): this {
        if (propertyName === "useMessageManager") {
            this.stateManager?.setUseMessageManager(value === true);
            this.engine?.setUseMessageManager(value === true);
        }
        if (propertyName === "debugMode") {
            Logger.setDebugMode(Boolean(value));
        }
        if (propertyName === "dataJson" || propertyName === "data") {
            this.preservePayloadOnRegenerate = false;
            this._preservedPayload = null;
            this.dataSyncDelegate.handleInputDataHotSwap(propertyName, value, suppressInvalidate);
            return this;
        }
        if (propertyName === "schemaDefinitions") {
            this.normalizedDefinitions = undefined;
        }
        if (["editable", "debugMode", "layoutBudget", "schemaDefinition", "schemaTarget"].includes(propertyName)) {
            if (this.getProperty(propertyName) !== value) {
                super.setProperty(propertyName, value, suppressInvalidate);
                if (propertyName === "editable" || propertyName === "debugMode" || propertyName === "layoutBudget") {
                    this.preservePayloadOnRegenerate = true;
                } else {
                    this.preservePayloadOnRegenerate = false;
                    this._preservedPayload = null;
                    this.normalizedDefinitions = undefined;
                    this.stateManager?.destroy();
                    this.stateManager = null;
                }
                if (this._generatePromise) {
                    this._pendingRegenerate = true;
                    this._generationId++;
                }
                this.tearDownGeneratedLayout();
            }
            return this;
        }
        return super.setProperty(propertyName, value, suppressInvalidate);
    }

    /** Reads a property from the host, resolving `outputData` and on-demand `dataJson` against the committed `data` or live `StateManager`. */
    public getProperty(propertyName: string): unknown {
        if (propertyName === "outputData") {
            return this.dataSyncDelegate.resolveOutputData(super.getProperty("data"));
        }
        if (propertyName === "dataJson") {
            const stored = super.getProperty("dataJson");
            if (typeof stored === "string" && stored.length > 0) {
                return stored;
            }
            const sourceData =
                super.getProperty("liveUpdate") === true
                    ? this.dataSyncDelegate.resolveOutputData(super.getProperty("data"))
                    : super.getProperty("data");
            return sourceData !== undefined && sourceData !== null ? JSON.stringify(sourceData, null, 2) : stored;
        }
        return super.getProperty(propertyName);
    }

    /** Bypasses the interceptor to read or write directly on the base UI5 control. */
    public getBaseProperty(propertyName: string): unknown {
        return super.getProperty(propertyName);
    }

    /** Bypasses the interceptor to write directly to the base UI5 control. */
    public setBaseProperty(propertyName: string, value: unknown, suppressInvalidate?: boolean): this {
        return super.setProperty(propertyName, value, suppressInvalidate);
    }

    /** The core rendering pipeline entry point. */
    public async generate(): Promise<void> {
        if (this._generatePromise) {
            return this._generatePromise;
        }
        this._generatePromise = Promise.resolve().then(async () => {
            try {
                do {
                    this._pendingRegenerate = false;
                    await this._doGenerate();
                } while (this._pendingRegenerate && !this._isDestroyed && !this.isDestroyed());
            } finally {
                this._generatePromise = null;
            }
        });
        return this._generatePromise;
    }

    private async _doGenerate(): Promise<void> {
        const genId = ++this._generationId;
        try {
            this.tearDownGeneratedLayout();
            if (this.preservePayloadOnRegenerate && this.stateManager) {
                this._preservedPayload = this.stateManager.extractPayload();
            }
            this.preservePayloadOnRegenerate = false;
            this.stateManager?.destroy();
            this.stateManager = null;

            const prepared = this.generationDelegate.prepareSchemaAndData(this._preservedPayload);
            if (!prepared) {
                return;
            }
            this.parsedSchema = prepared.normalizedSchema;
            this.inferredSchemaBaseline = prepared.inferredBaseline;
            this.normalizedDefinitions = prepared.normalizedDefinitions;
            const activeRegistry =
                (this.getProperty("pluginRegistry") as PluginRegistry | null) || PluginRegistry.getInstance();
            this.policyDelegate.configure(prepared.normalizedSchema.uiPolicies, activeRegistry);

            await this.generationDelegate.preloadIfNeeded(
                prepared.normalizedSchema,
                activeRegistry,
                prepared.normalizedDefinitions
            );
            if (this._isDestroyed || this.isDestroyed() || this._pendingRegenerate || genId !== this._generationId) {
                return;
            }
            this.generationDelegate.applyLayoutScoring(
                prepared.normalizedSchema,
                prepared.normalizedDefinitions,
                activeRegistry
            );
            await this.generationDelegate.preloadIfNeeded(
                prepared.normalizedSchema,
                activeRegistry,
                prepared.normalizedDefinitions
            );
            if (this._isDestroyed || this.isDestroyed() || this._pendingRegenerate || genId !== this._generationId) {
                return;
            }

            this._preservedPayload = null;
            if (prepared.normalizedSchema && prepared.finalData) {
                this.dataSyncDelegate.injectSchemaDefaults(
                    prepared.normalizedSchema,
                    prepared.finalData,
                    0,
                    this.normalizedDefinitions
                );
            }
            const configuredModelName = this.getProperty("modelName") as string | null;
            this.activeModelName =
                configuredModelName && configuredModelName !== "meta"
                    ? configuredModelName
                    : "metaUI_" + this.getId();
            const configuredScopeId = (this.getProperty("engineScopeId") as string | null) || this.getId();

            this.stateManager = new StateManager(prepared.finalData, prepared.normalizedSchema);
            this.stateManager.setUseMessageManager(this.getProperty("useMessageManager") === true);
            this.setModel(this.stateManager.getModel(), this.activeModelName);

            this.engine = new Engine(
                this.getProperty("editable") !== false,
                this.getProperty("useMessageManager") === true,
                activeRegistry
            );
            this.engine.host = this;
            this.generatedContent = this.engine.build(
                prepared.normalizedSchema,
                this.stateManager.getModel(),
                this.activeModelName,
                this.triggerSubmit.bind(this),
                configuredScopeId,
                this.onInternalFieldChange.bind(this)
            );
            const container = this.generationDelegate.wrapWithStatusBanners(
                this.generatedContent,
                prepared.normalizedSchema,
                prepared.dataParseError,
                this.engine.hasPartialRenderingErrors
            );
            this.setAggregation("_content", container, this.sParentAggregationName === "dependents");
            this.policyDelegate.evaluateNow(this.stateManager, this.engine);
            this.syncOverallValidity();
            if (this.getProperty("liveUpdate") === true) {
                this.dataSyncDelegate.pushToBindings(this.stateManager.extractPayload());
            }
            this.dialogDelegate.calculateAndApplyOptimalWidth(this.parsedSchema);
        } catch (error) {
            this.setBusy(false);
            const msg = "Fatal crash during layout generation: " + (error as Error).message;
            Logger.error(msg, undefined, "GeneratorHost");
            this.fireEvent("error", { message: msg, exception: error });
            this.validationDelegate.mountCrashBoundary(error as Error);
            throw error;
        }
    }

    /** Sets the global `$ref` schema definitions dictionary on the host. */
    public setSchemaDefinitions(definitions: Record<string, ISchema>): this {
        return this.setProperty("schemaDefinitions", definitions, true);
    }

    /** Returns diagnostic metadata for all active plugin controls rendered by the Engine. */
    public getDebugDomMetadata(): Record<string, unknown>[] {
        return this.validationDelegate.collectDebugDomMetadata(this.engine);
    }

    /** Programmatic API. Re-parents the generated content into a dialog and opens it. */
    public openInDialog(
        title: string = I18n.getText(TEXT_KEY.dialogDefaultTitle),
        submitButtonText: string = I18n.getText(TEXT_KEY.dialogSubmit),
        cancelButtonText: string = I18n.getText(TEXT_KEY.dialogCancel),
        dialogWidth: string = "auto",
        parentView?: Control
    ): Promise<void> {
        return this.dialogDelegate.openInDialog(
            title,
            submitButtonText,
            !!this.generatedContent,
            cancelButtonText,
            dialogWidth,
            parentView
        );
    }
}

// <generated-accessors>
// Generated by scripts/generate-control-accessors.js from this control's UI5 metadata.
// Do not edit by hand: run `npm run gen:accessors`. `npm run lint` fails if it is stale.

/**
 * Parameters delivered with the `beforeSubmit` event of `GeneratorHost`.
 */
export interface GeneratorHost$BeforeSubmitEventParameters {
    payload?: object;
    addError?: (...args: unknown[]) => unknown;
    preventDefault?: (...args: unknown[]) => unknown;
}

/**
 * Parameters delivered with the `submit` event of `GeneratorHost`.
 */
export interface GeneratorHost$SubmitEventParameters {
    payload?: object;
    payloadJson?: string;
}

/**
 * Parameters delivered with the `cancel` event of `GeneratorHost` (none).
 */
export type GeneratorHost$CancelEventParameters = object;

/**
 * Parameters delivered with the `fieldChange` event of `GeneratorHost`.
 */
export interface GeneratorHost$FieldChangeEventParameters {
    fieldPath?: string;
    value?: unknown;
    payload?: object;
    isValid?: boolean;
}

/**
 * Parameters delivered with the `validationStateChanged` event of `GeneratorHost`.
 */
export interface GeneratorHost$ValidationStateChangedEventParameters {
    isValid?: boolean;
}

/**
 * Parameters delivered with the `error` event of `GeneratorHost`.
 */
export interface GeneratorHost$ErrorEventParameters {
    message?: string;
    exception?: object;
}

/**
 * Parameters delivered with the `beforeLayoutSectionChange` event of `GeneratorHost`.
 */
export interface GeneratorHost$BeforeLayoutSectionChangeEventParameters {
    stepIndex?: number;
    currentSectionIndex?: number;
    newSectionIndex?: number;
    payload?: object;
    preventDefault?: (...args: unknown[]) => unknown;
    addError?: (...args: unknown[]) => unknown;
    resumeNavigation?: (...args: unknown[]) => unknown;
}

/**
 * Accessors UI5 generates at runtime from `GeneratorHost`'s metadata, declared here so
 * TypeScript consumers can call them. Merged into the class by declaration merging.
 */
export default interface GeneratorHost {
    setSchemaDefinition(schemaDefinition: unknown): this;
    getSchemaTarget(): string;
    setSchemaTarget(schemaTarget: string): this;
    getPluginRegistry(): object;
    setPluginRegistry(pluginRegistry: object): this;
    getSchemaBuilderRegistry(): object;
    setSchemaBuilderRegistry(schemaBuilderRegistry: object): this;
    getData(): unknown;
    setData(data: unknown): this;
    getDataJson(): string;
    setDataJson(dataJson: string): this;
    getLiveUpdate(): boolean;
    setLiveUpdate(liveUpdate: boolean): this;
    getIsValid(): boolean;
    setIsValid(isValid: boolean): this;
    getUseMessageManager(): boolean;
    setUseMessageManager(useMessageManager: boolean): this;
    getModelName(): string;
    setModelName(modelName: string): this;
    getDebugMode(): boolean;
    getEditable(): boolean;
    setEditable(editable: boolean): this;
    getLayoutBudget(): number;
    setLayoutBudget(layoutBudget: number): this;
    getEngineScopeId(): string;
    setEngineScopeId(engineScopeId: string): this;
    getWidth(): CSSSize;
    setWidth(width: CSSSize): this;
    getHeight(): CSSSize;
    setHeight(height: CSSSize): this;
    attachBeforeSubmit(fn: (event: Event<GeneratorHost$BeforeSubmitEventParameters, GeneratorHost>) => void, listener?: object): this;
    attachBeforeSubmit<T>(
        data: T,
        fn: (event: Event<GeneratorHost$BeforeSubmitEventParameters, GeneratorHost>, data: T) => void,
        listener?: object
    ): this;
    detachBeforeSubmit(fn: (event: Event<GeneratorHost$BeforeSubmitEventParameters, GeneratorHost>) => void, listener?: object): this;
    fireBeforeSubmit(parameters?: GeneratorHost$BeforeSubmitEventParameters): this;
    attachSubmit(fn: (event: Event<GeneratorHost$SubmitEventParameters, GeneratorHost>) => void, listener?: object): this;
    attachSubmit<T>(
        data: T,
        fn: (event: Event<GeneratorHost$SubmitEventParameters, GeneratorHost>, data: T) => void,
        listener?: object
    ): this;
    detachSubmit(fn: (event: Event<GeneratorHost$SubmitEventParameters, GeneratorHost>) => void, listener?: object): this;
    fireSubmit(parameters?: GeneratorHost$SubmitEventParameters): this;
    attachCancel(fn: (event: Event<GeneratorHost$CancelEventParameters, GeneratorHost>) => void, listener?: object): this;
    attachCancel<T>(
        data: T,
        fn: (event: Event<GeneratorHost$CancelEventParameters, GeneratorHost>, data: T) => void,
        listener?: object
    ): this;
    detachCancel(fn: (event: Event<GeneratorHost$CancelEventParameters, GeneratorHost>) => void, listener?: object): this;
    fireCancel(parameters?: GeneratorHost$CancelEventParameters): this;
    attachFieldChange(fn: (event: Event<GeneratorHost$FieldChangeEventParameters, GeneratorHost>) => void, listener?: object): this;
    attachFieldChange<T>(
        data: T,
        fn: (event: Event<GeneratorHost$FieldChangeEventParameters, GeneratorHost>, data: T) => void,
        listener?: object
    ): this;
    detachFieldChange(fn: (event: Event<GeneratorHost$FieldChangeEventParameters, GeneratorHost>) => void, listener?: object): this;
    fireFieldChange(parameters?: GeneratorHost$FieldChangeEventParameters): this;
    attachValidationStateChanged(
        fn: (event: Event<GeneratorHost$ValidationStateChangedEventParameters, GeneratorHost>) => void,
        listener?: object
    ): this;
    attachValidationStateChanged<T>(
        data: T,
        fn: (event: Event<GeneratorHost$ValidationStateChangedEventParameters, GeneratorHost>, data: T) => void,
        listener?: object
    ): this;
    detachValidationStateChanged(
        fn: (event: Event<GeneratorHost$ValidationStateChangedEventParameters, GeneratorHost>) => void,
        listener?: object
    ): this;
    fireValidationStateChanged(parameters?: GeneratorHost$ValidationStateChangedEventParameters): this;
    attachError(fn: (event: Event<GeneratorHost$ErrorEventParameters, GeneratorHost>) => void, listener?: object): this;
    attachError<T>(
        data: T,
        fn: (event: Event<GeneratorHost$ErrorEventParameters, GeneratorHost>, data: T) => void,
        listener?: object
    ): this;
    detachError(fn: (event: Event<GeneratorHost$ErrorEventParameters, GeneratorHost>) => void, listener?: object): this;
    fireError(parameters?: GeneratorHost$ErrorEventParameters): this;
    attachBeforeLayoutSectionChange(
        fn: (event: Event<GeneratorHost$BeforeLayoutSectionChangeEventParameters, GeneratorHost>) => void,
        listener?: object
    ): this;
    attachBeforeLayoutSectionChange<T>(
        data: T,
        fn: (event: Event<GeneratorHost$BeforeLayoutSectionChangeEventParameters, GeneratorHost>, data: T) => void,
        listener?: object
    ): this;
    detachBeforeLayoutSectionChange(
        fn: (event: Event<GeneratorHost$BeforeLayoutSectionChangeEventParameters, GeneratorHost>) => void,
        listener?: object
    ): this;
    fireBeforeLayoutSectionChange(parameters?: GeneratorHost$BeforeLayoutSectionChangeEventParameters): this;
}
// </generated-accessors>
