import Control from "sap/ui/core/Control";
import RenderManager from "sap/ui/core/RenderManager";
import { Logger } from "../../utils/Logger";
import { SchemaNormalizer } from "../../core/SchemaNormalizer";
import { SchemaValidator } from "../../core/SchemaValidator";
import { Engine } from "../../core/Engine";
import { StateManager } from "../../core/StateManager";
import { PolicyEngine } from "../../core/PolicyEngine";
import { DataSyncDelegate } from "./delegates/DataSyncDelegate";
import { ValidationDelegate } from "./delegates/ValidationDelegate";
import { DialogDelegate } from "./delegates/DialogDelegate";
import MessageBox from "sap/m/MessageBox";
import MessageStrip from "sap/m/MessageStrip";
import VBox from "sap/m/VBox";
import { PluginRegistry } from "../../core/PluginRegistry";
import { LayoutScorer } from "../../core/LayoutScorer";
import { LayoutMutator } from "../../core/LayoutMutator";
import { DefaultLayoutGenerator } from "../../core/DefaultLayoutGenerator";
import type { ISchema } from "../../interfaces/ISchema";

/**
 * Base wrapper element for embedding the dynamic form natively via Explicit Schemas.
 * 
 * This class serves as the core rendering engine for standard MetaUI implementations.
 * It manages the lifecycle of the Engine, StateManager, and the delegation of 
 * data synchronization, validation, and dialog interactions.
 * 
 * @namespace nz.co.siliconst.ui5.metaui.controls.host
 */
export default class GeneratorHost extends Control {

    protected stateManager: StateManager | null = null;
    protected generatedContent: Control | null = null;
    /** The embedded engine responsible for rendering the UI controls */
    protected engine: Engine | null = null;
    
    /** 
     * The Policy-Based Rules Engine.
     * Continuously evaluates declarative cross-field rules and pushes visual/structural mutations down into the plugins.
     */
    protected policyEngine: PolicyEngine | null = null;
    
    private policyDebounceTimer: any = null;
    protected activeModelName: string = "";

    protected dataSyncDelegate!: DataSyncDelegate;
    protected validationDelegate!: ValidationDelegate;
    protected dialogDelegate!: DialogDelegate;

    static readonly metadata = {
        properties: {
            schemaDefinition: { type: "any", defaultValue: null },
            schemaDefinitions: { type: "object", defaultValue: {} },
            schemaTarget: { type: "string", defaultValue: null },
            pluginRegistry: { type: "object", defaultValue: null },
            schemaBuilderRegistry: { type: "object", defaultValue: null },
            data: { type: "object", defaultValue: null, bindable: "bindable" },
            dataJson: { type: "string", defaultValue: null, bindable: "bindable" },
            liveUpdate: { type: "boolean", defaultValue: false },
            isValid: { type: "boolean", defaultValue: true },
            useMessageManager: { type: "boolean", defaultValue: false },
            modelName: { type: "string", defaultValue: "meta" },
            debugMode: { type: "boolean", defaultValue: false },
            editable: { type: "boolean", defaultValue: true },
            layoutBudget: { type: "int", defaultValue: 0 },
            engineScopeId: { type: "string", defaultValue: null }
        },
        aggregations: {
            _content: { type: "sap.ui.core.Control", multiple: false, visibility: "hidden" }
        },
        events: {
            beforeSubmit: {
                parameters: {
                    payload: { type: "object" },
                    addError: { type: "function" },
                    preventDefault: { type: "function" }
                }
            },
            submit: {
                parameters: {
                    payload: { type: "object" },
                    payloadJson: { type: "string" }
                }
            },
            cancel: {},
            fieldChange: {
                parameters: {
                    fieldPath: { type: "string" },
                    value: { type: "any" },
                    payload: { type: "object" },
                    isValid: { type: "boolean" }
                }
            },
            validationStateChanged: { parameters: { isValid: { type: "boolean" } } },
            validationError: { parameters: { fieldPath: { type: "string" }, message: { type: "string" } } },
            validationSuccess: { parameters: { fieldPath: { type: "string" } } },
            error: { parameters: { message: { type: "string" }, exception: { type: "object" } } }
        }
    };

    static renderer = {
        apiVersion: 2,
        render(rm: RenderManager, control: GeneratorHost) {
            rm.openStart("div", control);
            rm.style("width", "100%");
            rm.style("height", "100%");
            rm.openEnd();

            const content = control.getAggregation("_content") as Control;
            if (content) {
                rm.renderControl(content);
            }

            rm.close("div");
        }
    };

    /**
     * Standard UI5 Constructor.
     */
    constructor(idOrSettings?: string | object, settings?: object) {
        super(idOrSettings as string, settings);
    }

    /**
     * Initializes the control and instantiates the composition delegates.
     * Delegates must be initialized here rather than in the constructor so they are 
     * available before `applySettings` runs during UI5's control lifecycle.
     */
    public init(): void {
        super.init();

        // Initialize Composition Delegates
        this.dataSyncDelegate = new DataSyncDelegate(this);
        this.validationDelegate = new ValidationDelegate(this);
        this.dialogDelegate = new DialogDelegate(this as any);

        this.onInternalFieldChange = this.onInternalFieldChange.bind(this);
    }

    /**
     * Enables or disables debug mode.
     */
    public setDebugMode(enabled: boolean): this {
        this.setProperty("debugMode", enabled, true);
        Logger.setDebugMode(enabled);
        return this;
    }


    /**
     * Returns the active state manager instance managing the JSON payload.
     */
    public getStateManager(): StateManager | null {
        return this.stateManager;
    }

    /**
     * Resolves a reference pointer against the global schema definitions dictionary.
     * @param refPath The string reference path (e.g., "#/definitions/User")
     * @returns The resolved ISchema or undefined
     */
    public getSchemaDefinition(refPath: string): ISchema | undefined {
        const defs = this.getProperty("schemaDefinitions") as Record<string, ISchema>;
        if (!defs || !refPath) return undefined;
        let key = refPath;
        if (key.startsWith("#/definitions/")) {
            key = key.substring(14);
        } else if (key.startsWith("#/components/schemas/")) {
            key = key.substring(21);
        }
        return defs[key];
    }

    /**
     * Safely destroys the currently generated UI tree and cleans up references.
     * This is called before every regeneration to prevent memory leaks.
     */
    public tearDownGeneratedLayout(): void {
        if (this.generatedContent) {
            this.validationDelegate.unregisterObject(this.generatedContent);
            this.generatedContent.destroy();
            this.generatedContent = null;
        }
    }

    /**
     * Internal event handler triggered by the Engine when a field value changes.
     * Coordinates LiveUpdate syncs, validation state tracking, and bubbling the change upwards.
     */
    protected onInternalFieldChange(isValid: boolean, fieldKey?: string, errorMessage?: string, controlId?: string): void {
        const payload = this.stateManager ? this.stateManager.extractPayload() : {};

        if (this.getProperty("liveUpdate") === true) {
            if (this.getProperty("debugMode")) {
                Logger.debug("[MetaUI]", "liveUpdate is enabled, pushing outbound payload.", "GeneratorHost");
            }
            this.dataSyncDelegate.pushToBindings(payload);
        }

        const currentValidity = this.getProperty("isValid") as boolean;
        if (isValid !== currentValidity) {
            this.setProperty("isValid", isValid, true);
            this.fireEvent("validationStateChanged", { isValid });
            if (this.getProperty("debugMode")) {
                Logger.debug("[MetaUI]", `Validation state shifted to: ${isValid}`, "GeneratorHost");
            }
        }

        this.fireEvent("fieldChange", {
            fieldPath: fieldKey || "",
            value: undefined,
            payload: payload,
            isValid: isValid
        });

        // Trigger PBRE Live Evaluation
        if (this.policyEngine && fieldKey) {
            if (this.policyDebounceTimer) clearTimeout(this.policyDebounceTimer);
            this.policyDebounceTimer = setTimeout(() => {
                this.evaluatePolicies();
            }, 200);
        }
    }

    /**
     * Executes the PBRE policy evaluations and orchestrates the delta updates to the UI plugins.
     * Acts as the bridge between the headless PolicyEngine calculations and the physical UI5 plugins.
     * 
     * @param changedPath The specific JSON path that triggered the evaluation (used for incremental sweeps).
     *                    If undefined, a full engine sweep is performed (e.g. during initial render or manual submit).
     */
    private evaluatePolicies(): void {
        if (!this.policyEngine || !this.stateManager || !this.engine) return;
        const payload = this.stateManager.extractPayload();
        const deltas = this.policyEngine.evaluate(payload);
        for (const delta of deltas) {
            const plugin = this.engine.getPluginByPath(delta.target);
            if (plugin) {
                // Systemic Failsafe: State Pruning on Hide/Disable
                if ((delta.property === "visibility" || delta.property === "editable") && delta.value === false) {
                    this.stateManager.setProperty(delta.target, undefined); 
                }

                switch (delta.property) {
                    case "visibility": 
                        if (plugin.applyVisibility) plugin.applyVisibility(delta.value);
                        break;
                    case "validity":
                        if (delta.value) {
                            this.engine.reportPolicyError(delta.target, null);
                        } else {
                            this.engine.reportPolicyError(delta.target, delta.errorMessage || "Validation failed by policy");
                        }
                        break;
                    case "required":
                        if (plugin.applyRequired) plugin.applyRequired(delta.value);
                        break;
                    case "editable":
                        if (plugin.applyEditable) plugin.applyEditable(delta.value);
                        break;
                }
            }
        }
    }

    /**
     * Standard UI5 Exit Hook. Ensures complete teardown of the engine and state manager.
     */
    public exit(): void {
        if (this.engine) {
            this.engine.destroy();
            this.engine = null;
        }

        if (this.stateManager) {
            this.stateManager.getModel().destroy();
            this.stateManager = null;
        }

        if (this.generatedContent) {
            this.generatedContent.destroy();
            this.generatedContent = null;
        }
    }

    /** Cached schema for intelligent diffing during inference mode hot-swaps */
    protected parsedSchema: Record<string, unknown> | null = null;

    /**
     * Exposes the parsed schema to the DataSyncDelegate for diffing.
     */
    public getParsedSchema(): Record<string, unknown> | null {
        return this.parsedSchema;
    }

    /**
     * Standard UI5 Rendering Hook.
     * Evaluates whether it possesses a schema or data. If so, triggers the internal engine generation.
     */
    public onBeforeRendering(): void {
        if (this.getProperty("debugMode")) {
            Logger.debug("[MetaUI GeneratorHost]", `onBeforeRendering called. Engine boot state: schemaDefinition exists = ${!!this.getProperty("schemaDefinition")}, data exists = ${!!this.getProperty("data")}, dataJson exists = ${!!this.getProperty("dataJson")}`, "GeneratorHost");
        }

        if (!this.generatedContent) {
            const hasSchema = !!this.getProperty("schemaDefinition");
            const hasData = !!this.getProperty("dataJson") || !!this.getProperty("data");

            if (hasSchema || hasData) {
                this.generate();
            } else {
                const msg = "GeneratorHost skipped rendering. Neither 'schemaDefinition' nor 'data' was provided.";
                Logger.error("[MetaUI]", msg, "GeneratorHost");
                this.fireEvent("error", { message: msg });
                throw new Error(msg); // Eradicate silent errors
            }
        }
    }

    /**
     * Public API method to manually trigger form submission.
     * Executes all structural validations, clears old messages, and pushes payload to bindings.
     * @returns boolean True if submission succeeded, false if validation failed.
     */
    public triggerSubmit(): boolean {
        if (this.stateManager && this.engine) {
            let isPrevented = false;

            this.validationDelegate.removeAllMessages();

            // Run PBRE Full Sweep before validation to ensure visibility states are perfect
            if (this.policyEngine) {
                this.evaluatePolicies();
            }

            // PBRE Architecture Rule 12: Controls are deliberately isolated from UI5's native 
            // MessageManager auto-sync. We must explicitly instruct plugins to paint their 
            // visual red borders (ValueState) manually during a full form submission sweep.
            const errors = this.engine.validateAll(true);
            if (errors.length > 0) {
                if (this.getProperty("useMessageManager") === true) {
                    this.validationDelegate.pushMessage("", "One or more fields failed schema validation. Please review the highlighted fields.");
                }
                for (const err of errors) {
                    if (err.fieldKey && err.errorMessage) {
                        this.validationDelegate.pushMessage(err.fieldKey, err.errorMessage, err.fieldLabel);
                    }
                }
                return false;
            }

            const payload = this.stateManager.extractPayload();
            const payloadJson = JSON.stringify(payload);

            this.fireEvent("beforeSubmit", {
                payload,
                preventDefault: () => { isPrevented = true; },
                addError: (propertyPath: string, errorMessage: string) => {
                    isPrevented = true;
                    if (this.getProperty("useMessageManager") === true) {
                        this.validationDelegate.pushMessage(propertyPath, errorMessage);
                    }
                    if (this.engine) {
                        const plugin = this.engine.getPluginByPath(propertyPath);
                        if (plugin && typeof plugin.setVisualValidationState === "function") {
                            plugin.setVisualValidationState(false, errorMessage);
                        }
                    }
                }
            });

            if (isPrevented) {
                return false;
            }

            this.dataSyncDelegate.pushToBindings(payload);
            this.fireEvent("submit", { payload, payloadJson });
            return true;
        }
        return false;
    }

    /**
     * Injects a custom error message onto a specific field.
     */
    public addCustomError(fieldPath: string, message: string): void {
        this.validationDelegate.addCustomError(fieldPath, message);
        if (this.getProperty("useMessageManager") !== true && this.engine) {
            const plugin = this.engine.getPluginByPath(fieldPath);
            if (plugin && typeof plugin.setVisualValidationState === "function") {
                plugin.setVisualValidationState(false, message);
            }
        }
    }

    /**
     * Clears a custom error message from a specific field.
     */
    public clearCustomError(fieldPath: string): void {
        this.validationDelegate.clearCustomError(fieldPath);
        if (this.getProperty("useMessageManager") !== true && this.engine) {
            const plugin = this.engine.getPluginByPath(fieldPath);
            if (plugin && typeof plugin.setVisualValidationState === "function") {
                const schemaValid = plugin.validate();
                plugin.setVisualValidationState(schemaValid.isValid, schemaValid.errorMessage);
            }
        }
    }

    /**
     * Toggles busy state on the host control.
     */
    public setBusy(isBusy: boolean): this {
        super.setBusy(isBusy);
        return this;
    }

    /**
     * Intercepts property changes. Hot-swaps data gracefully if it's an inputData change,
     * or forces a full UI teardown if it's a structural property change (like schemaDefinition).
     */
    public setProperty(propertyName: string, value: unknown, suppressInvalidate?: boolean): this {
        if (propertyName === "useMessageManager" && this.stateManager) {
            this.stateManager.setUseMessageManager(value === true);
        }

        if (propertyName === "dataJson" || propertyName === "data") {
            this.dataSyncDelegate.handleInputDataHotSwap(propertyName, value, suppressInvalidate);
            return this;
        }

        if (propertyName === "editable" || propertyName === "debugMode" || propertyName === "schemaDefinition" || propertyName === "schemaTarget") {
            const currentVal = this.getProperty(propertyName);
            if (currentVal !== value) {
                super.setProperty(propertyName, value, suppressInvalidate);
                this.tearDownGeneratedLayout();
            }
            return this;
        }

        return super.setProperty(propertyName, value, suppressInvalidate);
    }

    /**
     * Bypasses the interceptor to write directly to the base UI5 control.
     */
    public setBaseProperty(propertyName: string, value: unknown, suppressInvalidate?: boolean): this {
        return super.setProperty(propertyName, value, suppressInvalidate);
    }

    /**
     * Internal reference to the active generate promise.
     * Prevents concurrent redundant layouts from being generated when properties are set rapidly or DialogDelegate triggers it.
     */
    private _generatePromise: Promise<void> | null = null;

    /**
     * The core rendering pipeline entry point.
     * Uses Promise resolution to debounce concurrent or rapid consecutive calls natively without arbitrary timeouts.
     * @returns Promise that resolves when the layout is successfully built and mounted.
     */
    public async generate(): Promise<void> {
        if (this._generatePromise) {
            return this._generatePromise;
        }
        this._generatePromise = Promise.resolve().then(async () => {
            try {
                await this._doGenerate();
            } catch (e) {
                Logger.error("[MetaUI]", "Error in deferred generate: " + e, "GeneratorHost");
                throw e; // Ensure it bubbles up to awaiters
            } finally {
                this._generatePromise = null;
            }
        });
        return this._generatePromise;
    }

    /**
     * The underlying synchronous generator orchestration method.
     * Normalizes the schema, sets up the state manager, loads missing plugins over the network,
     * orchestrates the Engine build, and mounts the generated UI components into the internal tree.
     */
    private async _doGenerate(): Promise<void> {
        try {
            this.tearDownGeneratedLayout();

            // CRITICAL FIX: Extract the unsaved internal payload BEFORE destroying the state manager
            // Otherwise, toggling editable (or other structural properties) will wipe user inputs!
            let internalPayload = null;
            if (this.stateManager) {
                internalPayload = this.stateManager.extractPayload();
            }

            if (this.engine) {
                this.engine.destroy();
                this.engine = null;
            }
            if (this.stateManager) {
                this.stateManager.getModel().destroy();
                this.stateManager = null;
            }

            let rawSchema = this.getProperty("schemaDefinition");
            if (rawSchema && typeof rawSchema === "object") {
                rawSchema = JSON.parse(JSON.stringify(rawSchema));
            }
            const isSchemaEmpty = !rawSchema || (typeof rawSchema === "object" && Object.keys(rawSchema).length === 0);

            let inputData = this.getProperty("data");
            const inputDataJson = this.getProperty("dataJson");

            let dataParseError = "";

            if (inputDataJson) {
                try {
                    inputData = JSON.parse(inputDataJson as string);
                } catch (e) {
                    dataParseError = "Failed to parse inputDataJson string: " + (e as Error).message;
                    Logger.error("[MetaUI]", dataParseError, "GeneratorHost");
                    this.fireEvent("error", { message: dataParseError, exception: e });
                    inputData = {}; // Fallback to empty object to allow schema to render
                }
            } else if (typeof inputData === "string") {
                try {
                    inputData = JSON.parse(inputData);
                } catch (e) {
                    dataParseError = "Failed to parse inputData string: " + (e as Error).message;
                    Logger.error("[MetaUI]", dataParseError, "GeneratorHost");
                    this.fireEvent("error", { message: dataParseError, exception: e });
                    inputData = {}; // Fallback to empty object to allow schema to render
                }
            }

            // The internal payload represents the user's latest un-extracted edits. It must take priority, unless an external data-swap failed.
            const finalData = dataParseError ? inputData : (internalPayload || inputData);

            if (!finalData || Object.keys(finalData).length === 0) {
                if (isSchemaEmpty) {
                    const msg = "No payload provided and no explicit schema defined. Cannot infer UI.";
                    Logger.error("[MetaUI]", msg, "GeneratorHost");
                    this.fireEvent("error", { message: msg });
                    throw new Error(msg);
                }
            }

            const schemaToNormalize = isSchemaEmpty ? null : rawSchema;
            const normalizedSchema = SchemaNormalizer.normalize(schemaToNormalize, finalData);

            // Cache the parsed/inferred schema so DataSyncDelegate can diff against it later
            this.parsedSchema = normalizedSchema as Record<string, unknown>;

            if (normalizedSchema) {
                if (normalizedSchema.uiPolicies && normalizedSchema.uiPolicies.length > 0) {
                    this.policyEngine = new PolicyEngine(normalizedSchema.uiPolicies);
                } else {
                    this.policyEngine = null;
                }

                const schemaErrors = SchemaValidator.validateSchemaStructure(normalizedSchema);
                if (schemaErrors.length > 0) {
                    const errorMsg = "Schema Structural Errors Found:\n- " + schemaErrors.join("\n- ");
                    // Let's log it out loudly regardless of debug mode, so developers can see why it didn't render
                    Logger.error("[MetaUI]", errorMsg, "GeneratorHost");
                    if (this.getProperty("debugMode")) {
                        MessageBox.error(errorMsg, { title: "MetaUI Schema Error" });
                        return;
                    }
                }
            }

            const rawDefinitions = this.getProperty("schemaDefinitions") as Record<string, any> || {};
            
            // Extract any definitions embedded inside the root schema definition
            let parsedRawSchema = rawSchema;
            if (typeof rawSchema === "string" && rawSchema.trim() !== "") {
                try {
                    parsedRawSchema = JSON.parse(rawSchema);
                } catch (e) {
                    // Ignore parse errors here; SchemaNormalizer will throw loudly later if invalid.
                }
            }

            if (parsedRawSchema && typeof parsedRawSchema === "object" && (parsedRawSchema as any).definitions) {
                Object.assign(rawDefinitions, (parsedRawSchema as any).definitions);
                this.setProperty("schemaDefinitions", rawDefinitions, true);
            }

            let normalizedDefinitions: Record<string, ISchema> | undefined;
            if (Object.keys(rawDefinitions).length > 0) {
                normalizedDefinitions = {};
                for (const key in rawDefinitions) {
                    try {
                        normalizedDefinitions[key] = SchemaNormalizer.normalize(rawDefinitions[key]) as ISchema;
                    } catch (e) {
                        Logger.warn(`[MetaUI] Failed to normalize schema definition '${key}'`, "", "GeneratorHost");
                    }
                }
            }

            const budget = this.getProperty("layoutBudget") as number;

            // Ensure we have a uiLayout synthesized before applying scoring and mutation 
            // (crucial for inferred/swagger schemas)
            if (DefaultLayoutGenerator.ensureLayout(normalizedSchema as ISchema)) {
                Logger.warn("[MetaUI GeneratorHost] Missing 'uiLayout' array in schema. Synthesized a default layout mapping to prevent a blank render.");
            }

            LayoutScorer.apply(normalizedSchema as ISchema, budget, normalizedDefinitions);
            LayoutMutator.apply(normalizedSchema as ISchema);

            const activePluginRegistry = this.getProperty("pluginRegistry") || PluginRegistry.getInstance();
            
            const pathsToLoad = activePluginRegistry.getPathsToLoad(normalizedSchema as ISchema);
            const needsNetworkLoad = Array.from(pathsToLoad).some((path: any) => !sap.ui.require(path));

            if (needsNetworkLoad) {
                this.setBusy(true);
                await activePluginRegistry.preloadDependencies(normalizedSchema as ISchema);
                this.setBusy(false);
            }

            // Inject defaults into empty payload values
            if (normalizedSchema && finalData) {
                this.dataSyncDelegate.injectSchemaDefaults(normalizedSchema, finalData);
            }

            this.activeModelName = "metaUI_" + this.getId();
            this.stateManager = new StateManager(finalData, normalizedSchema, this.activeModelName);
            this.stateManager.setUseMessageManager(this.getProperty("useMessageManager") === true);
            this.setModel(this.stateManager.getModel(), this.activeModelName);

            if (!this.engine) {
                const isEditable = this.getProperty("editable") !== false;
                const useMessageManager = this.getProperty("useMessageManager") === true;
                const activePluginRegistry = this.getProperty("pluginRegistry") || PluginRegistry.getInstance();
                this.engine = new Engine(isEditable, useMessageManager, activePluginRegistry);
                this.engine.host = this;
            }

            this.generatedContent = this.engine.build(
                normalizedSchema,
                this.stateManager.getModel(),
                this.activeModelName,
                this.triggerSubmit.bind(this),
                this.getId(),
                this.onInternalFieldChange.bind(this)
            );

            // Defect #15: PBRE Initialization Blackout - Force headless evaluation of initial visibility state
            if (this.policyEngine) {
                this.evaluatePolicies();
            }

            let contentContainer = this.generatedContent;

            const hasProperties = normalizedSchema && Object.keys(normalizedSchema).length > 0;

            if (!hasProperties) {
                const strip = new MessageStrip({
                    text: "Warning: The generated UI is blank. Reason: The schema (or inferred schema) contains no valid properties to render.",
                    type: "Warning",
                    showIcon: true,
                    showCloseButton: true
                });
                strip.addStyleClass("sapUiSmallMargin");
                contentContainer = new VBox({
                    items: [strip]
                });
            } else if (dataParseError) {
                const strip = new MessageStrip({
                    text: "Data Error: " + dataParseError + ". The form has been rendered with a blank dataset.",
                    type: "Error",
                    showIcon: true,
                    showCloseButton: true
                });
                strip.addStyleClass("sapUiSmallMargin");
                
                if (typeof (contentContainer as any).insertItem === "function") {
                    (contentContainer as any).insertItem(strip, 0);
                } else if (typeof (contentContainer as any).insertContent === "function") {
                    (contentContainer as any).insertContent(strip, 0);
                } else {
                    contentContainer = new VBox({
                        items: [strip, this.generatedContent!]
                    });
                }
            } else if (this.engine.hasPartialRenderingErrors) {
                const strip = new MessageStrip({
                    text: "Layout partially rendered. Some fields failed to generate due to configuration errors.",
                    type: "Warning",
                    showIcon: true,
                    showCloseButton: true
                });
                strip.addStyleClass("sapUiSmallMarginBottom");
                contentContainer = new VBox({
                    items: [strip, this.generatedContent]
                });
            }

            this.setAggregation("_content", contentContainer);
            this.validationDelegate.registerObject(this.generatedContent);

            const payload = this.stateManager.extractPayload();
            this.dataSyncDelegate.pushToBindings(payload);

            // Retroactively expand the dialog if the heuristic determines it needs more space
            this.dialogDelegate.calculateAndApplyOptimalWidth(this.parsedSchema);

        } catch (error) {
            this.setBusy(false);
            const msg = "Fatal crash during layout generation: " + (error as Error).message;
            Logger.error("[MetaUI]", msg, "GeneratorHost");
            this.fireEvent("error", { message: msg, exception: error });
            this.validationDelegate.mountCrashBoundary(error as Error);
            throw error; // Completely eliminate silent error swallowing
        }
    }



    /**
     * Programmatic API. Re-parents the generated content into a dialog and opens it.
     */
    public openInDialog(title: string = "Form", submitButtonText: string = "OK", cancelButtonText: string = "Cancel", dialogWidth: string = "auto", parentView?: Control): void {
        const isGenerated = !!this.generatedContent;
        this.dialogDelegate.openInDialog(title, submitButtonText, isGenerated, cancelButtonText, dialogWidth, parentView);
    }
}
