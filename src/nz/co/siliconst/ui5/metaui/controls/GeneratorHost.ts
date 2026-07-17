/**
 * @file GeneratorHost.ts
 * @description The core UI5 custom control that exposes the MetaUI engine to host applications.
 */

import Control from "sap/ui/core/Control";
import RenderManager from "sap/ui/core/RenderManager";
import Dialog from "sap/m/Dialog";
import Button from "sap/m/Button";
import { SchemaNormalizer } from "../core/SchemaNormalizer";
import { Engine } from "../core/Engine";
import { StateManager } from "../core/StateManager";
import { BaseLayout } from "../layouts/BaseLayout";

/**
 * Enterprise wrapper element for embedding or popping the dynamic form.
 * 
 * @namespace nz.co.siliconst.ui5.metaui.controls
 */
export default class GeneratorHost extends Control {
    
    private stateManager: StateManager | null = null;
    private generatedContent: Control | null = null;

    static readonly metadata = {
        properties: {
            /** The raw JSON metadata schema provided by the ABAP backend. */
            schemaDefinition: { type: "object", defaultValue: null },
            /** The initial data payload to populate the fields. */
            initialData: { type: "object", defaultValue: {} }
        },
        aggregations: {
            /** The internal hidden container holding the generated layouts. */
            _content: { type: "sap.ui.core.Control", multiple: false, visibility: "hidden" }
        },
        events: {
            /** Triggered when the user submits the form via the Dialog modality. */
            submit: {
                parameters: {
                    /** The clean extracted JSON payload representing the current state. */
                    payload: { type: "object" }
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
     * Lifecycle hook to automatically generate the layout if bound declaratively in XML.
     */
    public onBeforeRendering(): void {
        if (!this.generatedContent && this.getProperty("schemaDefinition")) {
            this.generate();
        }
    }

    /**
     * Extracts the payload and fires the submit event manually. Useful for inline XML embedding.
     */
    public triggerSubmit(): void {
        if (this.stateManager) {
            const payload = this.stateManager.extractPayload();
            this.fireEvent("submit", { payload });
        }
    }

    /**
     * Triggers the engine to parse the schema and build the layout.
     * Must be called manually or hooked into onBeforeRendering if properties are bound.
     */
    public generate(): void {
        const rawSchema = this.getProperty("schemaDefinition");
        const initialData = this.getProperty("initialData");

        if (!rawSchema) {
            throw new Error("[MetaUI] Cannot generate layout without a schemaDefinition.");
        }

        // 1. Normalize schema
        const normalizedSchema = SchemaNormalizer.normalize(rawSchema);

        // 2. Bootstrap isolated State Manager
        this.stateManager = new StateManager(initialData);
        this.setModel(this.stateManager.getModel(), "meta");

        // 3. Delegate to Layout Engine
        const engine = new Engine();
        const layoutFactory = new BaseLayout();
        
        this.generatedContent = engine.build(normalizedSchema, layoutFactory);

        // 4. Mount into hidden aggregation
        this.setAggregation("_content", this.generatedContent);
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
                    if (this.stateManager) {
                        const payload = this.stateManager.extractPayload();
                        this.fireEvent("submit", { payload });
                    }
                    dialog.close();
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
