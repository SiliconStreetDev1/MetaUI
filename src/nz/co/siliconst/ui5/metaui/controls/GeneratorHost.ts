/**
 * @file GeneratorHost.ts
 * @description The core UI5 custom control that exposes the MetaUI engine to host applications.
 */

import Control from "sap/ui/core/Control";
import RenderManager from "sap/ui/core/RenderManager";
import Dialog from "sap/m/Dialog";
import Button from "sap/m/Button";
import MessagePage from "sap/m/MessagePage";
import MessageBox from "sap/m/MessageBox";
import { Logger } from "../utils/Logger";
import { SchemaNormalizer } from "../core/SchemaNormalizer";
import { SchemaValidator } from "../core/SchemaValidator";
import { Engine } from "../core/Engine";
import { StateManager } from "../core/StateManager";
import { EventBus } from "../core/EventBus";
import { IFieldChangeEvent } from "../interfaces/IEventBus";
import Core from "sap/ui/core/Core";

/**
 * Wrapper element for embedding or popping the dynamic form.
 * 
 * @namespace nz.co.siliconst.ui5.metaui.controls
 */
export default class GeneratorHost extends Control {
    
    private stateManager: StateManager | null = null;
    private generatedContent: Control | null = null;
    private engine: Engine | null = null;
    private activeModelName: string = "";

    static readonly metadata = {
        properties: {
            /** The raw JSON metadata schema provided by the ABAP backend. */
            schemaDefinition: { type: "any", defaultValue: null },
            /** The initial data payload to populate the fields as an object. */
            initialData: { type: "any", defaultValue: null },
            /** The initial data payload provided as a raw JSON string. */
            initialDataJson: { type: "string", defaultValue: null },
            /** The final payload data object, updated on submit. */
            outputData: { type: "object", defaultValue: null },
            /** The final payload JSON string, updated on submit. */
            outputDataJson: { type: "string", defaultValue: null },
            /** If true, validation errors will be pushed to the global sap.ui.core.message.MessageManager. */
            useMessageManager: { type: "boolean", defaultValue: false },
            /** The active isolated UI5 JSONModel name alias for this host. */
            modelName: { type: "string", defaultValue: "meta" },
            /** Globally toggles debug mode logging for the MetaUI engine. */
            debugMode: { type: "boolean", defaultValue: false }
        },
        aggregations: {
            /** The internal hidden container holding the generated layouts. */
            _content: { type: "sap.ui.core.Control", multiple: false, visibility: "hidden" }
        },
        events: {
            /** Triggered before final submission, allowing host apps to run custom validation logic and halt submission if needed. */
            beforeSubmit: {
                parameters: {
                    /** The clean extracted JSON payload representing the current state. */
                    payload: { type: "object" },
                    /** Function to add a custom validation error message for a specific field path. */
                    addError: { type: "function" },
                    /** Function to prevent the default submission and dialog closure. */
                    preventDefault: { type: "function" }
                }
            },
            /** Triggered when the user submits the form via the Dialog modality. */
            submit: {
                parameters: {
                    /** The clean extracted JSON payload representing the current state. */
                    payload: { type: "object" },
                    /** The stringified final JSON payload. */
                    payloadJson: { type: "string" }
                }
            },
            /** Triggered if the dialog is cancelled. */
            cancel: {},
            /** Fired dynamically when any field value changes natively. */
            fieldChange: {
                parameters: {
                    fieldPath: { type: "string" },
                    value: { type: "any" },
                    payload: { type: "object" },
                    isValid: { type: "boolean" }
                }
            },
            /** Fired when a field fails built-in structural/pipeline validation. */
            validationError: {
                parameters: {
                    fieldPath: { type: "string" },
                    message: { type: "string" }
                }
            },
            /** Fired when a field passes built-in validation after an error. */
            validationSuccess: {
                parameters: {
                    fieldPath: { type: "string" }
                }
            }
        }
    };

    /**
     * Standard UI5 control renderer. Renders the generated internal content.
     */
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
     * Initializes the UI5 control.
     */
    public init(): void {
        super.init();
        this.onInternalFieldChange = this.onInternalFieldChange.bind(this);
        EventBus.getInstance().subscribe(this.onInternalFieldChange);
    }

    public setDebugMode(enabled: boolean): this {
        this.setProperty("debugMode", enabled, true);
        Logger.setDebugMode(enabled);
        return this;
    }

    private onInternalFieldChange(event: IFieldChangeEvent): void {
        // Only process events that belong to this instance's isolated model
        if (event.modelName && event.modelName === this.activeModelName) {
            let isValid = true;
            if (this.engine) {
                const schema = this.getProperty("schemaDefinition");
                // The engine inherently validates inside plugins, but we could do more here
                // We'll trust the Engine's state or let the payload pass.
            }
            
            const payload = this.stateManager ? this.stateManager.extractPayload() : {};
            
            this.fireEvent("fieldChange", {
                fieldPath: event.fieldName,
                value: event.newValue,
                payload: payload,
                isValid: true // simplified for now
            });
        }
    };

    /**
     * Standard UI5 lifecycle hook for destruction.
     * Guaranteed to tear down isolated models and unbind global event listeners.
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

        EventBus.getInstance().unsubscribe(this.onInternalFieldChange);
    }

    /**
     * Lifecycle hook to automatically generate the layout if bound declaratively in XML.
     */
    public onBeforeRendering(): void {
        if (!this.generatedContent && this.getProperty("schemaDefinition")) {
            this.generate();
        }
    }

    /**
     * Extracts the payload, pushes it to properties, and fires the submit event manually.
     * Returns true if submission was successful, false if validation failed or was prevented.
     */
    public triggerSubmit(): boolean {
        if (this.stateManager && this.engine) {
            let isPrevented = false;
            const useMessageManager = this.getProperty("useMessageManager") as boolean;
            let messageManager: any = null;
            
            if (useMessageManager) {
                messageManager = Core.getMessageManager();
                messageManager.removeAllMessages();
            }

            const pushMessage = (path: string, text: string) => {
                const targetPath = path ? `${this.activeModelName}>/${path}` : "";
                const displayText = path ? `Field '${path}': ${text}` : text;
                
                // Aggressive console logging as requested
                if (path) {
                    Logger.error(`[MetaUI Validation Error] ${displayText}`);
                } else {
                    Logger.error(`[MetaUI Validation Error] Global - ${text}`);
                }

                if (useMessageManager && messageManager) {
                    sap.ui.require(["sap/ui/core/message/Message"], (Message: any) => {
                        messageManager.addMessages(new Message({
                            message: displayText,
                            type: "Error" as any,
                            target: targetPath,
                            processor: this.stateManager?.getModel()
                        }));
                    });
                }
            };

            // 1. Run global schema validation
            const errors = this.engine.validateAll();
            if (errors.length > 0) {
                pushMessage("", "One or more fields failed schema validation. Please review the highlighted fields.");
                for (const err of errors) {
                    if (err.fieldKey && err.errorMessage) {
                        pushMessage(err.fieldKey, err.errorMessage);
                    }
                }
                return false; // Schema validation failed, inputs already turned red
            }

            const payload = this.stateManager.extractPayload();
            const payloadJson = JSON.stringify(payload);
            
            // 2. Fire beforeSubmit exit
            this.fireEvent("beforeSubmit", {
                payload,
                preventDefault: () => {
                    isPrevented = true;
                },
                addError: (propertyPath: string, errorMessage: string) => {
                    isPrevented = true;
                    if (useMessageManager && messageManager) {
                        pushMessage(propertyPath, errorMessage);
                    } else {
                        Logger.warn(`[MetaUI] Validation Error for ${propertyPath}: ${errorMessage}`, "GeneratorHost");
                    }
                }
            });

            if (isPrevented) {
                return false; // Exit validation failed or prevented submission
            }
            
            // Push final values to properties (updating XML bindings)
            this.setProperty("outputData", payload, true);
            this.setProperty("outputDataJson", payloadJson, true);
            
            this.fireEvent("submit", { payload, payloadJson });
            return true;
        }
        return false;
    }

    /**
     * Imperatively invalidates a field and highlights it with an error message.
     * @param fieldPath The path of the field (e.g. "address/city")
     * @param message The error message to display
     */
    public addCustomError(fieldPath: string, message: string): void {
        const useMessageManager = this.getProperty("useMessageManager") as boolean;
        if (useMessageManager && this.stateManager) {
            sap.ui.require(["sap/ui/core/message/Message"], (Message: any) => {
                const messageManager = Core.getMessageManager();
                messageManager.addMessages(new Message({
                    message: message,
                    type: "Error" as any,
                    target: `${this.stateManager?.getModel().getId()}>/${fieldPath}`,
                    processor: this.stateManager?.getModel()
                }));
            });
        }
    }

    /**
     * Reverts a custom error state on a field.
     * @param fieldPath The path of the field
     */
    public clearCustomError(fieldPath: string): void {
        const useMessageManager = this.getProperty("useMessageManager") as boolean;
        if (useMessageManager && this.stateManager) {
            const messageManager = Core.getMessageManager();
            const messages = messageManager.getMessageModel().getData();
            const target = `${this.stateManager.getModel().getId()}>/${fieldPath}`;
            
            const messageToRemove = messages.find((m: any) => m.getTarget() === target);
            if (messageToRemove) {
                messageManager.removeMessages(messageToRemove);
            }
        }
    }

    /**
     * Locks or unlocks the form while asynchronous operations are running.
     * @param isBusy true to lock the form, false to unlock.
     */
    public setBusy(isBusy: boolean): this {
        super.setBusy(isBusy);
        return this;
    }

    /**
     * Triggers the engine to parse the schema and build the layout.
     * Safely wrapped in a try/catch to prevent Launchpad crashes.
     */
    public generate(): void {
        try {
            // CRITICAL: Clean up previous instances to prevent UI5 memory leaks and duplicate ID collisions
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

            const rawSchema = this.getProperty("schemaDefinition");
            
            let initialData = this.getProperty("initialData");
            const initialDataJson = this.getProperty("initialDataJson");
            
            if (initialDataJson) {
                try {
                    initialData = JSON.parse(initialDataJson);
                } catch (e) {
                    Logger.error("[MetaUI] Failed to parse initialDataJson string.", (e as Error).message, "GeneratorHost");
                }
            } else if (typeof initialData === "string") {
                try {
                    initialData = JSON.parse(initialData);
                } catch (e) {
                    Logger.error("[MetaUI] Failed to parse initialData string.", (e as Error).message, "GeneratorHost");
                }
            }

            // 1. Normalize schema (allows fallback to data inference)
            const normalizedSchema = SchemaNormalizer.normalize(rawSchema, initialData);

            // 1.5. Validate Schema Structure
            if (normalizedSchema) {
                if (this.getProperty("debugMode") && (!normalizedSchema.uiLayout || normalizedSchema.uiLayout.length === 0)) {
                    MessageBox.warning("No explicit uiLayout provided. The MetaUI engine will auto-generate a default layout map.", { title: "MetaUI Debug Mode" });
                }

                const schemaErrors = SchemaValidator.validateSchemaStructure(normalizedSchema);
                if (schemaErrors.length > 0) {
                    const errorMsg = "Schema Structural Errors Found:\n- " + schemaErrors.join("\n- ");
                    if (this.getProperty("debugMode")) {
                        MessageBox.error(errorMsg, { title: "MetaUI Schema Error" });
                        return; // Block generation in debug mode
                    } else {
                        Logger.error("[MetaUI] Schema Structural Errors:", errorMsg, "GeneratorHost");
                    }
                }
            }

            // 2. Bootstrap isolated State Manager
            // Dynamically generate a 100% unique model name for isolation
            this.activeModelName = "metaUI_" + this.getId();
            
            this.stateManager = new StateManager(initialData || {}, this.activeModelName);
            this.setModel(this.stateManager.getModel(), this.activeModelName);

            // 3. Delegate to Layout Engine
            this.engine = new Engine();
            
            this.generatedContent = this.engine.build(
                normalizedSchema, 
                this.activeModelName, 
                this.triggerSubmit.bind(this),
                this.getId()
            );

            // 4. Mount into hidden aggregation
            this.setAggregation("_content", this.generatedContent);

        } catch (error) {
            Logger.error("[MetaUI] Engine failed to generate layout. Preventing Launchpad crash.", (error as Error).message, "GeneratorHost");
            
            const errorPage = new MessagePage({
                text: "UI Generation Failed",
                description: "The dynamic schema could not be rendered. Please check the Fiori console for diagnostic logs.",
                icon: "sap-icon://error"
            });

            this.setAggregation("_content", errorPage);
        }
    }

    /**
     * Dialog Modality: Opens the generated layout inside a sap.m.Dialog.
     * Automatically wires up customizable submit (default: 'OK') and 'Cancel' buttons.
     */
    public openInDialog(title: string = "Form", submitButtonText: string = "OK"): void {
        if (!this.generatedContent) {
            this.generate();
        }

        const dialog = new Dialog({
            title: title,
            contentWidth: "800px",
            content: [this], // Mount self inside the dialog
            beginButton: new Button({
                text: submitButtonText,
                type: "Emphasized",
                press: () => {
                    try {
                        const success = this.triggerSubmit();
                        if (success) {
                            dialog.close();
                        }
                    } catch (err) {
                        Logger.error("[MetaUI] Catastrophic error during validation/submit pipeline", (err as Error).message, "GeneratorHost");
                        this.fireEvent("validationError", { fieldPath: "root", message: (err as Error).message });
                    }
                }
            }),
            endButton: new Button({
                text: "Cancel",
                press: () => {
                    this.fireEvent("cancel");
                    dialog.close();
                }
            }),
            afterClose: () => {
                dialog.destroy();
            }
        });

        dialog.open();
    }

}
