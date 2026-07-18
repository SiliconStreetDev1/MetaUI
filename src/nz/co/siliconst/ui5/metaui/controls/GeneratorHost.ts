/**
 * @file GeneratorHost.ts
 * @description The core UI5 custom control that exposes the MetaUI engine to host applications.
 */

import Control from "sap/ui/core/Control";
import RenderManager from "sap/ui/core/RenderManager";
import Dialog from "sap/m/Dialog";
import Button from "sap/m/Button";
import MessagePage from "sap/m/MessagePage";
import Log from "sap/base/Log";
import { SchemaNormalizer } from "../core/SchemaNormalizer";
import { Engine } from "../core/Engine";
import { StateManager } from "../core/StateManager";
import { BaseLayout } from "../layouts/BaseLayout";

/**
 * Wrapper element for embedding or popping the dynamic form.
 * 
 * @namespace nz.co.siliconst.ui5.metaui.controls
 */
export default class GeneratorHost extends Control {
    
    private stateManager: StateManager | null = null;
    private generatedContent: Control | null = null;
    private engine: Engine | null = null;

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
            useMessageManager: { type: "boolean", defaultValue: false }
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
            cancel: {}
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
    }

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
                messageManager = sap.ui.getCore().getMessageManager();
                messageManager.removeAllMessages();
            }

            // Helper to add messages securely via async require so it isn't a hard dependency
            const pushMessage = (path: string, text: string) => {
                if (useMessageManager && messageManager) {
                    sap.ui.require(["sap/ui/core/message/Message"], (Message: any) => {
                        messageManager.addMessages(new Message({
                            message: text,
                            type: "Error" as any,
                            target: `${this.stateManager?.getModel().getId()}>/${path}`,
                            processor: this.stateManager?.getModel()
                        }));
                    });
                }
            };

            // 1. Run global schema validation
            if (!this.engine.validateAll()) {
                pushMessage("", "One or more fields failed schema validation. Please review the highlighted fields.");
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
                        Log.warning(`[MetaUI] Validation Error for ${propertyPath}: ${errorMessage}`, "GeneratorHost");
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
     * Triggers the engine to parse the schema and build the layout.
     * Safely wrapped in a try/catch to prevent Launchpad crashes.
     */
    public generate(): void {
        try {
            const rawSchema = this.getProperty("schemaDefinition");
            
            let initialData = this.getProperty("initialData");
            const initialDataJson = this.getProperty("initialDataJson");
            
            if (initialDataJson) {
                try {
                    initialData = JSON.parse(initialDataJson);
                } catch (e) {
                    Log.error("[MetaUI] Failed to parse initialDataJson string.", (e as Error).message, "GeneratorHost");
                }
            } else if (typeof initialData === "string") {
                try {
                    initialData = JSON.parse(initialData);
                } catch (e) {
                    Log.error("[MetaUI] Failed to parse initialData string.", (e as Error).message, "GeneratorHost");
                }
            }

            // 1. Normalize schema (allows fallback to data inference)
            const normalizedSchema = SchemaNormalizer.normalize(rawSchema, initialData);

            // 2. Bootstrap isolated State Manager
            this.stateManager = new StateManager(initialData || {});
            
            // Dynamically generate a 100% unique model name for isolation
            const modelName = "metaUI_" + this.getId();
            this.setModel(this.stateManager.getModel(), modelName);

            // 3. Delegate to Layout Engine
            this.engine = new Engine();
            const layoutFactory = new BaseLayout();
            
            this.generatedContent = this.engine.build(normalizedSchema, layoutFactory, modelName);

            // 4. Mount into hidden aggregation
            this.setAggregation("_content", this.generatedContent);

        } catch (error) {
            Log.error("[MetaUI] Engine failed to generate layout. Preventing Launchpad crash.", (error as Error).message, "GeneratorHost");
            
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
     * Automatically wires up 'Save' and 'Cancel' buttons.
     */
    public openInDialog(title: string = "Dynamic Form", submitButtonText: string = "Save"): void {
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
                    const success = this.triggerSubmit();
                    if (success) {
                        dialog.close();
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
