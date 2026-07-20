import Control from "sap/ui/core/Control";
import RenderManager from "sap/ui/core/RenderManager";
import GeneratorHost from "./host/GeneratorHost";
import HostFactory from "../core/HostFactory";
import { Logger } from "../utils/Logger";

/**
 * A transparent wrapper control (Facade) that automatically chooses between Explicit Schema Mode 
 * and Inference Mode based on the presence of a 'schemaDefinition'.
 * 
 * This maintains total architectural separation of the modes without forcing developers to 
 * use different XML tags.
 * 
 * @namespace nz.co.siliconst.ui5.metaui.controls
 */
export default class DynamicHost extends Control {
    static readonly metadata = {
        properties: {
            schemaDefinition: { type: "any", defaultValue: null },
            inputData: { type: "any", defaultValue: null, bindable: "bindable" },
            inputDataJson: { type: "string", defaultValue: null, bindable: "bindable" },
            outputData: { type: "object", defaultValue: null, bindable: "bindable" },
            outputDataJson: { type: "string", defaultValue: null, bindable: "bindable" },
            liveUpdate: { type: "boolean", defaultValue: false },
            isValid: { type: "boolean", defaultValue: true },
            useMessageManager: { type: "boolean", defaultValue: false },
            modelName: { type: "string", defaultValue: "meta" },
            debugMode: { type: "boolean", defaultValue: false },
            displayMode: { type: "boolean", defaultValue: false }
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
        render(rm: RenderManager, control: DynamicHost) {
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

    private _innerHost: GeneratorHost | null = null;
    private _initializedInner: boolean = false;

    /**
     * Standard UI5 Lifecycle Hook.
     * Evaluates the initial properties and spawns the appropriate inner host strategy via the HostFactory.
     * It handles the complex lifecycle task of copying all bindings, raw properties, and event listeners 
     * down to the inner host perfectly transparently.
     */
    public onBeforeRendering(): void {
        if (!this._initializedInner) {
            const hasSchema = !!this.getProperty("schemaDefinition");
            const hasData = !!this.getProperty("inputDataJson") || !!this.getProperty("inputData");
            
            // Only boot if we have either a schema or some data to infer from
            if (hasSchema || hasData) {
                if (this.getProperty("debugMode")) {
                    Logger.debug("[MetaUI DynamicHost]", `Booting inner host. hasSchema: ${hasSchema}, hasData: ${hasData}`, "DynamicHost");
                }
                // The architectural Facade router logic:
                this._innerHost = HostFactory.createHost(hasSchema);
                
                // 1. Mount FIRST so it inherits all UI5 models from the tree.
                // CRITICAL: If we attempt to bind properties before the control is mounted in the DOM, 
                // the inner control becomes an 'orphan' and the UI5 Model framework will fail to resolve the bindings.
                this.setAggregation("_content", this._innerHost);
                
                // 2. Forward all bindings and static values to the spawned host.
                // This ensures the inner host stays perfectly synchronized with any changes to the outer wrapper's XML bindings.
                const props = this.getMetadata().getProperties();
                for (const propName in props) {
                    const bindingInfo = this.getBindingInfo(propName);
                    if (!bindingInfo) {
                        const val = this.getProperty(propName);
                        // don't overwrite with nulls if it's default
                        if (val !== null && val !== undefined) {
                            this._innerHost.setProperty(propName, val);
                        }
                    }
                }
                
                // 3. Forward all event subscriptions.
                // By proxying the events upwards, the developer can subscribe to `<meta:DynamicHost submit="...">` 
                // and perfectly receive the inner host's submission event.
                const events = this.getMetadata().getEvents();
                for (const eventName in events) {
                    this._innerHost.attachEvent(eventName, (oEvent: any) => {
                        this.fireEvent(eventName, oEvent.getParameters());
                    });
                }

                this._initializedInner = true;
            }
        }
    }

    /**
     * Overrides standard UI5 setProperty to act as a transparent proxy.
     * When a property is updated on the wrapper (either programmatically or via a binding update),
     * it instantly mirrors that value down to the inner instantiated host.
     */
    public setProperty(propertyName: string, value: unknown, suppressInvalidate?: boolean): this {
        super.setProperty(propertyName, value, suppressInvalidate);
        if (this._innerHost) {
            this._innerHost.setProperty(propertyName, value, suppressInvalidate);
        }
        return this;
    }





    /**
     * Programmatic API support. Routes dialog commands down to the spawned inner host.
     */
    public openInDialog(title?: string, submitButtonText?: string, cancelButtonText?: string): void {
        if (!this._innerHost) {
            this.onBeforeRendering(); // Force init if they bypassed UI5 rendering
        }
        this._innerHost?.openInDialog(title, submitButtonText, cancelButtonText);
    }

    /**
     * Proxies submission triggering down to the instantiated generator host.
     */
    public triggerSubmit(): boolean {
        if (!this._innerHost) {
            return false;
        }
        return (this._innerHost as any).triggerSubmit();
    }

    /**
     * Overrides standard UI5 getProperty to transparently pull extracted data from the inner host.
     */
    public getProperty(propertyName: string): any {
        if (this._innerHost && (propertyName === "outputData" || propertyName === "outputDataJson")) {
            return this._innerHost.getProperty(propertyName);
        }
        return super.getProperty(propertyName);
    }
}
