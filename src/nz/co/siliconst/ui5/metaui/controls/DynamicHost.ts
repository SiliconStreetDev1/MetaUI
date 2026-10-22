/**
 * @file DynamicHost.ts
 * @description Transparent wrapper control (Facade) that routes between Explicit Schema Mode
 * and Inference Mode, and manages remote schema resolution and OData context bindings.
 */

import Control, { $ControlSettings } from "sap/ui/core/Control";
import { CSSSize } from "sap/ui/core/library";
import ManagedObject from "sap/ui/base/ManagedObject";
import Context from "sap/ui/model/Context";
import Event from "sap/ui/base/Event";
import GeneratorHost from "./host/GeneratorHost";
import {
    HOST_CONTROL_METADATA,
    HOST_CONTROL_RENDERER,
    extractConstructorJsonLiterals
} from "./host/HostControlMetadata";
import { Logger } from "../utils/Logger";
import { ODataDelegate } from "./host/delegates/ODataDelegate";
import { SchemaResolutionDelegate } from "./host/delegates/SchemaResolutionDelegate";
import ODataV4Context from "sap/ui/model/odata/v4/Context";
import { isRecord } from "../utils/TypeGuards";
import { ISchema } from "../interfaces/ISchema";
import { StateManager } from "../core/StateManager";

export interface $DynamicHostSettings extends $ControlSettings {
    schemaDefinition?: unknown;
    schemaDefinitions?: Record<string, ISchema> | null;
    schemaTarget?: string | null;
    pluginRegistry?: unknown;
    schemaBuilderRegistry?: unknown;
    data?: unknown;
    dataJson?: string | null;
    liveUpdate?: boolean;
    isValid?: boolean;
    useMessageManager?: boolean;
    modelName?: string;
    engineScopeId?: string | null;
    debugMode?: boolean;
    editable?: boolean;
    layoutBudget?: number;
    width?: CSSSize;
    height?: CSSSize;
}

/**
 * A transparent wrapper control (Facade) that automatically chooses between Explicit Schema Mode
 * and Inference Mode based on the presence of a `'schemaDefinition'`.
 *
 * @namespace nz.co.siliconst.ui5.metaui.controls
 */
export default class DynamicHost extends Control {
    public sParentAggregationName?: string;
    private odataDelegate: ODataDelegate | null = null;
    private schemaResolutionDelegate!: SchemaResolutionDelegate;
    private _innerHost: GeneratorHost | null = null;
    private _initializedInner: boolean = false;
    private readonly _trackedElementBindings: Set<{ detachChange: (fn: () => void) => void }> = new Set();
    private readonly _onElementBindingChange = (): void => {
        this.initODataDelegate();
    };

    static readonly metadata = HOST_CONTROL_METADATA;
    static renderer = HOST_CONTROL_RENDERER;

    constructor(idOrSettings?: string | $DynamicHostSettings, settings?: $DynamicHostSettings) {
        const extracted = extractConstructorJsonLiterals(idOrSettings, settings);
        super(extracted.idOrSettings as string, extracted.settings);
        if (extracted.literalSchemaDefinition !== undefined) {
            this.setProperty("schemaDefinition", extracted.literalSchemaDefinition, true);
        }
        if (extracted.literalDataJson !== undefined) {
            this.setProperty("dataJson", extracted.literalDataJson, true);
        }
    }

    /** Initializes the control and its schema resolution delegate. */
    public init(): void {
        super.init();
        this.schemaResolutionDelegate = new SchemaResolutionDelegate(this);
    }

    /** Initializes or replaces the OData Delegate if an OData context is detected. */
    private initODataDelegate(): void {
        if (this.getBindingInfo("dataJson")) return;
        const dataBinding = this.getBindingInfo("data") as { path?: string } | undefined;
        if (dataBinding && dataBinding.path && dataBinding.path !== "") return;

        const namedODataContext = this.getBindingContext("odata");
        const oContext = namedODataContext || this.getBindingContext();
        if (!oContext) {
            if (this.odataDelegate) {
                this.odataDelegate.destroy();
                this.odataDelegate = null;
            }
            return;
        }
        if (this.odataDelegate && this.odataDelegate.getContext() === oContext) return;

        const candidate = oContext as {
            requestObject?: unknown;
            getObject?: unknown;
            getModel?: () => { getMetadata?: () => { getName?: () => string } } | null;
        };
        const hasRequestObject = typeof candidate.requestObject === "function";
        const modelClassName = candidate.getModel?.()?.getMetadata?.()?.getName?.() || "";
        const isODataModel = modelClassName.indexOf("odata") > -1 || modelClassName.indexOf("ODataModel") > -1;
        const isJsonModel = modelClassName === "sap.ui.model.json.JSONModel";
        const hasExplicitElementBinding = Boolean(this.getElementBinding("odata") || this.getElementBinding());
        const hasExplicitLiteralData =
            this.getBaseProperty("data") !== null || this.getBaseProperty("dataJson") !== null;

        if (!hasRequestObject && !isODataModel && !namedODataContext) {
            if (isJsonModel && (!hasExplicitElementBinding || hasExplicitLiteralData)) {
                return;
            }
        }

        if (this.odataDelegate) {
            this.odataDelegate.destroy();
            this.odataDelegate = null;
        }

        if (hasRequestObject || typeof candidate.getObject === "function") {
            Logger.debug(
                "[MetaUI DynamicHost]",
                `Instantiating ODataDelegate for context ${oContext.getPath()}`,
                "DynamicHost"
            );
            this.odataDelegate = new ODataDelegate(this, oContext as ODataV4Context);
            this.odataDelegate.syncToEngine();
        }
    }

    /** Standard UI5 method override. Sets the binding context and updates the OData delegate. */
    public setBindingContext(oContext: Context | null | undefined, sModelName?: string): this {
        super.setBindingContext(oContext as Context, sModelName);
        this.initODataDelegate();
        return this;
    }

    /** Attaches `_onElementBindingChange` to the resolved element binding for `vPath` / `mParameters`. */
    private attachElementBindingListener(
        vPath: string | { path?: string; model?: string },
        mParameters?: { model?: string }
    ): void {
        let sModelName: string | undefined;
        if (isRecord(vPath) && typeof vPath.model === "string") {
            sModelName = vPath.model;
        } else if (isRecord(mParameters) && typeof mParameters.model === "string") {
            sModelName = mParameters.model;
        } else if (typeof vPath === "string" && vPath.indexOf(">") > 0) {
            sModelName = vPath.substring(0, vPath.indexOf(">"));
        }
        const oBinding = this.getElementBinding(sModelName);
        if (oBinding) {
            oBinding.detachChange(this._onElementBindingChange);
            oBinding.attachChange(this._onElementBindingChange);
            this._trackedElementBindings.add(oBinding);
        }
    }

    /** Standard UI5 method override. Binds the object context and attaches an OData change listener. */
    public bindObject(vPath: string | { path: string; model?: string }, mParameters?: object): this {
        const bindArg =
            typeof vPath === "string" && isRecord(mParameters) ? { path: vPath, ...mParameters } : vPath;
        super.bindObject(bindArg as string);
        this.attachElementBindingListener(vPath, mParameters as { model?: string } | undefined);
        return this;
    }

    /** Standard UI5 method override. Binds the element to the given path and attaches a change listener. */
    public bindElement(vPath: string | { path: string; model?: string }, mParameters?: object): this {
        super.bindElement(vPath as string, mParameters);
        this.attachElementBindingListener(vPath, mParameters as { model?: string } | undefined);
        return this;
    }

    /**
     * Suppresses invalidation bubbling to parent views when this host is mounted in `dependents`.
     *
     * @param oOrigin Optional child control that triggered invalidation.
     */
    public override invalidate(oOrigin?: ManagedObject): void {
        if (this.sParentAggregationName === "dependents") {
            return;
        }
        super.invalidate(oOrigin);
    }

    /** Standard UI5 Lifecycle Hook. Evaluates the initial properties and spawns the GeneratorHost. */
    public onBeforeRendering(): void {
        this.initODataDelegate();
        if (!this._initializedInner) {
            const spawned = this.schemaResolutionDelegate.resolveAndSpawnInnerHost();
            if (spawned) {
                this._innerHost = spawned;
                this.setAggregation("_content", this._innerHost, this.sParentAggregationName === "dependents");
                this._initializedInner = true;
            }
        }
    }

    /** Reads a property directly from the base UI5 control without inner-host interception. */
    public getBaseProperty(propertyName: string): unknown {
        return super.getProperty(propertyName);
    }

    /** Writes a property directly to the base UI5 control without inner-host forwarding. */
    public setBaseProperty(propertyName: string, value: unknown, suppressInvalidate?: boolean): this {
        return super.setProperty(propertyName, value, suppressInvalidate);
    }

    /** Forwards a resolved remote schema object to the inner `GeneratorHost` if already spawned. */
    public forwardResolvedSchemaToInnerHost(resolvedSchema: unknown): void {
        if (this._innerHost) {
            this._innerHost.setProperty("schemaDefinition", resolvedSchema);
        }
    }

    /** Overrides standard UI5 setProperty to act as a transparent proxy. */
    public setProperty(propertyName: string, value: unknown, suppressInvalidate?: boolean): this {
        super.setProperty(propertyName, value, suppressInvalidate);
        if (
            propertyName === "schemaDefinition" &&
            typeof value === "string" &&
            (value.startsWith("http://") || value.startsWith("https://"))
        ) {
            this.schemaResolutionDelegate.startRemoteFetch(value);
            return this;
        }
        if (this._innerHost && propertyName !== "width" && propertyName !== "height") {
            this._innerHost.setProperty(propertyName, value, suppressInvalidate);
        } else if (
            !this._initializedInner &&
            (propertyName === "data" || propertyName === "dataJson" || propertyName === "schemaDefinition") &&
            value !== null &&
            value !== undefined
        ) {
            this.invalidate();
        }
        return this;
    }

    /** Proxies asynchronous layout generation down to the inner host. */
    public async generate(): Promise<void> {
        if (!this._innerHost) {
            this.onBeforeRendering();
        }
        const fetchPromise = this.schemaResolutionDelegate.getFetchPromise();
        if (fetchPromise) {
            await fetchPromise;
            if (!this._innerHost) {
                this.onBeforeRendering();
            }
        }
        if (this._innerHost) {
            await this._innerHost.generate();
        }
    }

    /** Programmatic API support. Routes dialog commands down to the spawned inner host. */
    public async openInDialog(
        title?: string,
        submitButtonText?: string,
        cancelButtonText?: string,
        dialogWidth?: string,
        parentView?: Control
    ): Promise<void> {
        if (!this._innerHost) {
            this.onBeforeRendering();
        }
        const fetchPromise = this.schemaResolutionDelegate.getFetchPromise();
        if (fetchPromise) {
            await fetchPromise;
            if (!this._innerHost) {
                this.onBeforeRendering();
            }
        }
        if (this._innerHost) {
            await this._innerHost.openInDialog(title, submitButtonText, cancelButtonText, dialogWidth, parentView);
        }
    }

    /** Proxies submission triggering down to the instantiated generator host. */
    public triggerSubmit(): boolean {
        return this._innerHost ? this._innerHost.triggerSubmit() : false;
    }

    /** Injects a custom error message onto a specific field. */
    public addCustomError(fieldPath: string, message: string): void {
        this._innerHost?.addCustomError(fieldPath, message);
    }

    /** Clears a custom error message from a specific field. */
    public clearCustomError(fieldPath: string): void {
        this._innerHost?.clearCustomError(fieldPath);
    }

    /** Overrides standard UI5 getProperty to transparently pull extracted data from the inner host. */
    public getProperty(propertyName: string): unknown {
        if (
            this._innerHost &&
            (propertyName === "outputData" ||
                propertyName === "data" ||
                propertyName === "dataJson" ||
                propertyName === "isValid")
        ) {
            return this._innerHost.getProperty(propertyName);
        }
        if (propertyName === "outputData") {
            return super.getProperty("data");
        }
        return super.getProperty(propertyName);
    }

    /** Attaches a handler to the `submit` event. */
    public attachSubmit(fnFunction: (oEvent: Event) => void, oListener?: object): this {
        return this.attachEvent("submit", fnFunction, oListener);
    }

    /** Sets the global `$ref` schema definitions dictionary on the host and inner host. */
    public setSchemaDefinitions(definitions: Record<string, ISchema>): this {
        this.setProperty("schemaDefinitions", definitions, true);
        this._innerHost?.setSchemaDefinitions(definitions);
        return this;
    }

    /** Retrieves the normalized `$ref` schema definitions dictionary from the inner host. */
    public getSchemaDefinitions(): Record<string, ISchema> | undefined {
        if (this._innerHost) {
            return this._innerHost.getSchemaDefinitions();
        }
        return (this.getProperty("schemaDefinitions") as Record<string, ISchema> | null) || undefined;
    }

    /** Resolves a single `$ref` definition from the inner host. */
    public getSchemaDefinition(refPath: string): ISchema | undefined {
        return this._innerHost ? this._innerHost.getSchemaDefinition(refPath) : undefined;
    }

    /** Proxies access to the active `StateManager` instance on the inner host. */
    public getStateManager(): StateManager | null {
        return this._innerHost ? this._innerHost.getStateManager() : null;
    }

    /** Proxies access to the diagnostic DOM metadata tree from the inner host. */
    public getDebugDomMetadata(): unknown {
        return this._innerHost ? this._innerHost.getDebugDomMetadata() : [];
    }

    /** Standard UI5 exit hook. Cleans up tracked element-binding listeners, the ODataDelegate, and inner host. */
    public exit(): void {
        for (const binding of Array.from(this._trackedElementBindings)) {
            binding.detachChange(this._onElementBindingChange);
        }
        this._trackedElementBindings.clear();
        this.odataDelegate?.destroy();
        this.odataDelegate = null;
        this._innerHost?.destroy();
        this._innerHost = null;
    }
}

// <generated-accessors>
// Generated by scripts/generate-control-accessors.js from this control's UI5 metadata.
// Do not edit by hand: run `npm run gen:accessors`. `npm run lint` fails if it is stale.

/**
 * Parameters delivered with the `beforeSubmit` event of `DynamicHost`.
 */
export interface DynamicHost$BeforeSubmitEventParameters {
    payload?: object;
    addError?: (...args: unknown[]) => unknown;
    preventDefault?: (...args: unknown[]) => unknown;
}

/**
 * Parameters delivered with the `submit` event of `DynamicHost`.
 */
export interface DynamicHost$SubmitEventParameters {
    payload?: object;
    payloadJson?: string;
}

/**
 * Parameters delivered with the `cancel` event of `DynamicHost` (none).
 */
export type DynamicHost$CancelEventParameters = object;

/**
 * Parameters delivered with the `fieldChange` event of `DynamicHost`.
 */
export interface DynamicHost$FieldChangeEventParameters {
    fieldPath?: string;
    value?: unknown;
    payload?: object;
    isValid?: boolean;
}

/**
 * Parameters delivered with the `validationStateChanged` event of `DynamicHost`.
 */
export interface DynamicHost$ValidationStateChangedEventParameters {
    isValid?: boolean;
}

/**
 * Parameters delivered with the `error` event of `DynamicHost`.
 */
export interface DynamicHost$ErrorEventParameters {
    message?: string;
    exception?: object;
}

/**
 * Parameters delivered with the `beforeLayoutSectionChange` event of `DynamicHost`.
 */
export interface DynamicHost$BeforeLayoutSectionChangeEventParameters {
    stepIndex?: number;
    currentSectionIndex?: number;
    newSectionIndex?: number;
    payload?: object;
    preventDefault?: (...args: unknown[]) => unknown;
    addError?: (...args: unknown[]) => unknown;
    resumeNavigation?: (...args: unknown[]) => unknown;
}

/**
 * Accessors UI5 generates at runtime from `DynamicHost`'s metadata, declared here so
 * TypeScript consumers can call them. Merged into the class by declaration merging.
 */
export default interface DynamicHost {
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
    setDebugMode(debugMode: boolean): this;
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
    attachBeforeSubmit(fn: (event: Event<DynamicHost$BeforeSubmitEventParameters, DynamicHost>) => void, listener?: object): this;
    attachBeforeSubmit<T>(
        data: T,
        fn: (event: Event<DynamicHost$BeforeSubmitEventParameters, DynamicHost>, data: T) => void,
        listener?: object
    ): this;
    detachBeforeSubmit(fn: (event: Event<DynamicHost$BeforeSubmitEventParameters, DynamicHost>) => void, listener?: object): this;
    fireBeforeSubmit(parameters?: DynamicHost$BeforeSubmitEventParameters): this;
    detachSubmit(fn: (event: Event<DynamicHost$SubmitEventParameters, DynamicHost>) => void, listener?: object): this;
    fireSubmit(parameters?: DynamicHost$SubmitEventParameters): this;
    attachCancel(fn: (event: Event<DynamicHost$CancelEventParameters, DynamicHost>) => void, listener?: object): this;
    attachCancel<T>(data: T, fn: (event: Event<DynamicHost$CancelEventParameters, DynamicHost>, data: T) => void, listener?: object): this;
    detachCancel(fn: (event: Event<DynamicHost$CancelEventParameters, DynamicHost>) => void, listener?: object): this;
    fireCancel(parameters?: DynamicHost$CancelEventParameters): this;
    attachFieldChange(fn: (event: Event<DynamicHost$FieldChangeEventParameters, DynamicHost>) => void, listener?: object): this;
    attachFieldChange<T>(
        data: T,
        fn: (event: Event<DynamicHost$FieldChangeEventParameters, DynamicHost>, data: T) => void,
        listener?: object
    ): this;
    detachFieldChange(fn: (event: Event<DynamicHost$FieldChangeEventParameters, DynamicHost>) => void, listener?: object): this;
    fireFieldChange(parameters?: DynamicHost$FieldChangeEventParameters): this;
    attachValidationStateChanged(
        fn: (event: Event<DynamicHost$ValidationStateChangedEventParameters, DynamicHost>) => void,
        listener?: object
    ): this;
    attachValidationStateChanged<T>(
        data: T,
        fn: (event: Event<DynamicHost$ValidationStateChangedEventParameters, DynamicHost>, data: T) => void,
        listener?: object
    ): this;
    detachValidationStateChanged(
        fn: (event: Event<DynamicHost$ValidationStateChangedEventParameters, DynamicHost>) => void,
        listener?: object
    ): this;
    fireValidationStateChanged(parameters?: DynamicHost$ValidationStateChangedEventParameters): this;
    attachError(fn: (event: Event<DynamicHost$ErrorEventParameters, DynamicHost>) => void, listener?: object): this;
    attachError<T>(data: T, fn: (event: Event<DynamicHost$ErrorEventParameters, DynamicHost>, data: T) => void, listener?: object): this;
    detachError(fn: (event: Event<DynamicHost$ErrorEventParameters, DynamicHost>) => void, listener?: object): this;
    fireError(parameters?: DynamicHost$ErrorEventParameters): this;
    attachBeforeLayoutSectionChange(
        fn: (event: Event<DynamicHost$BeforeLayoutSectionChangeEventParameters, DynamicHost>) => void,
        listener?: object
    ): this;
    attachBeforeLayoutSectionChange<T>(
        data: T,
        fn: (event: Event<DynamicHost$BeforeLayoutSectionChangeEventParameters, DynamicHost>, data: T) => void,
        listener?: object
    ): this;
    detachBeforeLayoutSectionChange(
        fn: (event: Event<DynamicHost$BeforeLayoutSectionChangeEventParameters, DynamicHost>) => void,
        listener?: object
    ): this;
    fireBeforeLayoutSectionChange(parameters?: DynamicHost$BeforeLayoutSectionChangeEventParameters): this;
}
// </generated-accessors>
