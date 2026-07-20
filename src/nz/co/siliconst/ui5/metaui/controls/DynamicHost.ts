import Control from "sap/ui/core/Control";
import RenderManager from "sap/ui/core/RenderManager";
import GeneratorHost from "./host/GeneratorHost";
import { Logger } from "../utils/Logger";
import { ODataDelegate } from "./host/delegates/ODataDelegate";

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
    private _innerHost: GeneratorHost | null = null;
    private odataDelegate: ODataDelegate | null = null;
    private _initializedInner: boolean = false;

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
    private initODataDelegate(): void {
        if (!this.odataDelegate) {
            const oContext = this.getBindingContext("odata") || this.getBindingContext();
            if (oContext) {
                Logger.debug("[MetaUI DynamicHost]", `Context found for delegate initialization: ${oContext.getPath()}`, "DynamicHost");
                if (typeof (oContext as any).requestObject === "function" || typeof (oContext as any).getObject === "function") {
                    Logger.debug("[MetaUI DynamicHost]", `Context supports requestObject/getObject. Instantiating ODataDelegate.`, "DynamicHost");
                    this.odataDelegate = new ODataDelegate(this, oContext as any);
                    this.odataDelegate.syncToEngine();
                } else {
                    Logger.debug("[MetaUI DynamicHost]", `Context does NOT support requestObject/getObject! Keys: ${Object.keys(oContext)}`, "DynamicHost");
                }
            }
        }
    }

    public setBindingContext(oContext: sap.ui.model.Context | null | undefined, sModelName?: string): this {
        super.setBindingContext(oContext, sModelName);
        this.initODataDelegate();
        return this;
    }

    public bindElement(vPath: string | any, mParameters?: object): this {
        super.bindElement(vPath, mParameters);
        const sModelName = typeof vPath === "object" ? vPath.model : undefined;
        const oBinding = this.getElementBinding(sModelName);
        if (oBinding) {
            oBinding.attachChange(() => {
                this.initODataDelegate();
            });
        }
        return this;
    }

    public onBeforeRendering(): void {
        Logger.debug("[MetaUI DynamicHost]", `onBeforeRendering called. _initializedInner: ${this._initializedInner}`, "DynamicHost");

        this.initODataDelegate();

        if (!this._initializedInner) {
            const schema = this.getProperty("schemaDefinition");
            const dataJson = this.getProperty("dataJson");
            const data = this.getProperty("data");

            const hasSchema = !!schema;
            const hasData = !!dataJson || !!data;

            Logger.debug("[MetaUI DynamicHost]", `Evaluating boot. hasSchema: ${hasSchema}, hasData: ${hasData}`, "DynamicHost");

            // Only boot if we have either a schema or some data to infer from
            if (hasSchema || hasData) {
                if (this.getProperty("debugMode")) {
                    Logger.debug("[MetaUI DynamicHost]", `Booting inner host. hasSchema: ${hasSchema}, hasData: ${hasData}`, "DynamicHost");
                }
                // The architectural Facade router logic:
                // We've simplified this! We no longer use HostFactory or separate subclasses.
                // GeneratorHost is fully capable of inferring the schema if none is provided.
                this._innerHost = new GeneratorHost();

                // 1. Forward all static values to the spawned host BEFORE mounting.
                // Since we no longer use bindProperty, it's perfectly safe to set raw properties before mounting.
                const props = this.getMetadata().getProperties();
                for (const propName in props) {
                    const val = super.getProperty(propName);
                    if (val !== null && val !== undefined) {
                        this._innerHost.setProperty(propName, val);
                    }
                }

                // 2. Mount so it inherits models and triggers lifecycle.
                this.setAggregation("_content", this._innerHost);

                // 3. Forward all event subscriptions.
                // By proxying the events upwards, the developer can subscribe to `<meta:DynamicHost submit="...">` 
                // and perfectly receive the inner host's submission event.
                const events = this.getMetadata().getEvents();
                for (const eventName in events) {
                    this._innerHost.attachEvent(eventName, (oEvent: any) => {
                        // Natively push updated payload out to any bound Fiori Element properties.
                        // Using super.setProperty prevents an infinite loop back down to _innerHost.
                        if (eventName === "submit" || eventName === "fieldChange") {
                            const params = oEvent.getParameters();
                            if (params.payload) {
                                super.setProperty("data", params.payload, true);

                                const str = params.payloadJson || JSON.stringify(params.payload, null, 2);
                                super.setProperty("dataJson", str, true);
                            }
                            if (eventName === "fieldChange" && this.odataDelegate) {
                                this.odataDelegate.handleFieldChange(params.fieldPath, params.value);
                            }
                        }
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
        if (propertyName === "data" || propertyName === "dataJson" || propertyName === "schemaDefinition") {
            if (this.getProperty("debugMode")) {
                Logger.debug("[MetaUI DynamicHost]", `Wrapper received setProperty: ${propertyName}`, "DynamicHost");
            }
        }
        super.setProperty(propertyName, value, suppressInvalidate);
        if (this._innerHost) {
            this._innerHost.setProperty(propertyName, value, suppressInvalidate);
        } else if (propertyName === "data" || propertyName === "dataJson" || propertyName === "schemaDefinition") {
            if (this.getProperty("debugMode")) {
                Logger.debug("[MetaUI DynamicHost]", `_innerHost not yet initialized when ${propertyName} was set. Booting will happen on next render.`, "DynamicHost");
            }
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
        if (this._innerHost && (propertyName === "data" || propertyName === "dataJson")) {
            return this._innerHost.getProperty(propertyName);
        }
        return super.getProperty(propertyName);
    }
}
