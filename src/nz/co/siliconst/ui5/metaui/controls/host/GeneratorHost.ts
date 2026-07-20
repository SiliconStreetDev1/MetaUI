import Control from "sap/ui/core/Control";
import RenderManager from "sap/ui/core/RenderManager";
import { Logger } from "../../utils/Logger";
import { SchemaNormalizer } from "../../core/SchemaNormalizer";
import { SchemaValidator } from "../../core/SchemaValidator";
import { Engine } from "../../core/Engine";
import { StateManager } from "../../core/StateManager";
import { DataSyncDelegate } from "./delegates/DataSyncDelegate";
import { ValidationDelegate } from "./delegates/ValidationDelegate";
import { DialogDelegate } from "./delegates/DialogDelegate";
import MessageBox from "sap/m/MessageBox";

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
    protected engine: Engine | null = null;
    protected activeModelName: string = "";

    protected dataSyncDelegate!: DataSyncDelegate;
    protected validationDelegate!: ValidationDelegate;
    protected dialogDelegate!: DialogDelegate;

    static readonly metadata = {
        properties: {
            schemaDefinition: { type: "any", defaultValue: null },
            data: { type: "object", defaultValue: null, bindable: "bindable" },
            dataJson: { type: "string", defaultValue: null, bindable: "bindable" },
            liveUpdate: { type: "boolean", defaultValue: false },
            isValid: { type: "boolean", defaultValue: true },
            useMessageManager: { type: "boolean", defaultValue: false },
            modelName: { type: "string", defaultValue: "meta" },
            debugMode: { type: "boolean", defaultValue: false },
            editable: { type: "boolean", defaultValue: true }
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
            validationSuccess: { parameters: { fieldPath: { type: "string" } } }
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
        super(idOrSettings, settings);
    }

    /**
     * Initializes the control and instantiates the composition delegates.
     * Delegates must be initialized here rather than in the constructor so they are 
     * available before `applySettings` runs during UI5's control lifecycle.
     */
    public init(): void {
        super.init();

        // Initialize Composition Delegates
        this.dataSyncDelegate = new DataSyncDelegate(this as any);
        this.validationDelegate = new ValidationDelegate(this as any);
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
            } else if (this.getProperty("debugMode")) {
                Logger.debug("[MetaUI]", "GeneratorHost skipped rendering. Neither 'schemaDefinition' nor data was provided.", "GeneratorHost");
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

            const errors = this.engine.validateAll();
            if (errors.length > 0) {
                this.validationDelegate.pushMessage("", "One or more fields failed schema validation. Please review the highlighted fields.");
                for (const err of errors) {
                    if (err.fieldKey && err.errorMessage) {
                        this.validationDelegate.pushMessage(err.fieldKey, err.errorMessage);
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
                    this.validationDelegate.pushMessage(propertyPath, errorMessage);
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
    }

    /**
     * Clears a custom error message from a specific field.
     */
    public clearCustomError(fieldPath: string): void {
        this.validationDelegate.clearCustomError(fieldPath);
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
        if (propertyName === "dataJson" || propertyName === "data") {
            this.dataSyncDelegate.handleInputDataHotSwap(propertyName, value, suppressInvalidate);
            return this;
        }

        if (propertyName === "editable" || propertyName === "debugMode" || propertyName === "schemaDefinition") {
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
     * The core rendering pipeline.
     * Normalizes the schema, sets up the state manager, orchestrates the engine build,
     * and sets the generated UI components into the internal aggregation tree.
     */
    public generate(): void {
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

            const rawSchema = this.getProperty("schemaDefinition");
            let inputData = this.getProperty("data");
            const inputDataJson = this.getProperty("dataJson");

            if (inputDataJson) {
                try {
                    inputData = JSON.parse(inputDataJson as string);
                } catch (e) {
                    Logger.error("[MetaUI]", "Failed to parse inputDataJson string: " + (e as Error).message, "GeneratorHost");
                }
            } else if (typeof inputData === "string") {
                try {
                    inputData = JSON.parse(inputData);
                } catch (e) {
                    Logger.error("[MetaUI]", "Failed to parse inputData string: " + (e as Error).message, "GeneratorHost");
                }
            }

            // The internal payload represents the user's latest un-extracted edits. It must take priority.
            const finalData = internalPayload || inputData || {};

            const normalizedSchema = SchemaNormalizer.normalize(rawSchema, finalData);

            // Cache the parsed/inferred schema so DataSyncDelegate can diff against it later
            this.parsedSchema = normalizedSchema as Record<string, unknown>;

            if (normalizedSchema) {
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

            this.activeModelName = "metaUI_" + this.getId();
            this.stateManager = new StateManager(finalData, normalizedSchema, this.activeModelName);
            this.setModel(this.stateManager.getModel(), this.activeModelName);

            this.engine = new Engine(this.getProperty("editable") as boolean);

            this.generatedContent = this.engine.build(
                normalizedSchema,
                this.stateManager.getModel(),
                this.activeModelName,
                this.triggerSubmit.bind(this),
                this.getId(),
                this.onInternalFieldChange.bind(this)
            );

            this.setAggregation("_content", this.generatedContent);
            this.validationDelegate.registerObject(this.generatedContent);

            const payload = this.stateManager.extractPayload();
            this.dataSyncDelegate.pushToBindings(payload);

        } catch (error) {
            Logger.error("[MetaUI]", "Fatal crash during layout generation: " + (error as Error).message, "GeneratorHost");
            this.validationDelegate.mountCrashBoundary(error as Error);
        }
    }

    /**
     * Programmatic API. Re-parents the generated content into a dialog and opens it.
     */
    public openInDialog(title: string = "Form", submitButtonText: string = "OK"): void {
        const isGenerated = !!this.generatedContent;
        this.dialogDelegate.openInDialog(title, submitButtonText, isGenerated);
    }
}
