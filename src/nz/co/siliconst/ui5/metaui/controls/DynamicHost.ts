import Control from "sap/ui/core/Control";
import RenderManager from "sap/ui/core/RenderManager";
import GeneratorHost from "./host/GeneratorHost";
import { Logger } from "../utils/Logger";
import { ODataDelegate } from "./host/delegates/ODataDelegate";
import ODataV4Context from "sap/ui/model/odata/v4/Context";
import { SchemaBuilderRegistry } from "../core/SchemaBuilderRegistry";

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
    private odataDelegate: ODataDelegate | null = null;

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
            validationSuccess: { parameters: { fieldPath: { type: "string" } } },
            error: { parameters: { message: { type: "string" }, exception: { type: "object" } } }
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

    /**
     * Internal reference to the generated inner host instance.
     * @private
     */
    private _innerHost: GeneratorHost | null = null;

    /**
     * Flag indicating if the inner host has been initialized.
     * @private
     */
    private _initializedInner: boolean = false;

    /**
     * Initializes the OData Delegate if an OData context is detected.
     * This allows DynamicHost to seamlessly synchronize metadata and properties from an OData model.
     * @private
     */
    private initODataDelegate(): void {
        if (!this.odataDelegate) {
            // Guard: If the user explicitly bound dataJson, do not steal the context.
            if (this.getBindingInfo("dataJson")) {
                return;
            }

            // Guard: If the user explicitly bound 'data' to a specific property path, do not steal the context.
            const dataBinding = this.getBindingInfo("data") as any;
            if (dataBinding && dataBinding.path && dataBinding.path !== "") {
                return;
            }

            const oContext = this.getBindingContext("odata") || this.getBindingContext();
            if (oContext) {
                Logger.debug("[MetaUI DynamicHost]", `Context found for delegate initialization: ${oContext.getPath()}`, "DynamicHost");
                if (oContext && (oContext as ODataV4Context).requestObject && typeof (oContext as ODataV4Context).requestObject === "function") {
                    Logger.debug("[MetaUI DynamicHost]", `Context supports requestObject/getObject. Instantiating ODataDelegate.`, "DynamicHost");
                    this.odataDelegate = new ODataDelegate(this, oContext as ODataV4Context);
                    this.odataDelegate.syncToEngine();
                } else {
                    Logger.debug("[MetaUI DynamicHost]", `Context does NOT support requestObject/getObject! Keys: ${Object.keys(oContext)}`, "DynamicHost");
                }
            }
        }
    }

    /**
     * Standard UI5 method override.
     * Sets the binding context for the control and attempts to initialize the OData delegate
     * if the context points to an OData model.
     * 
     * @param {sap.ui.model.Context | null | undefined} oContext The binding context object
     * @param {string} [sModelName] Optional model name
     * @returns {this} The control instance for chaining
     */
    public setBindingContext(oContext: sap.ui.model.Context | null | undefined, sModelName?: string): this {
        super.setBindingContext(oContext, sModelName);
        this.initODataDelegate();
        return this;
    }

    /**
     * Standard UI5 method override.
     * Binds the element to the given path and attaches a change listener to re-evaluate
     * the OData delegate when the element binding resolves.
     * 
     * @param {string | Record<string, unknown>} vPath The binding path or configuration object
     * @param {object} [mParameters] Optional mapping parameters
     * @returns {this} Reference to this instance for chaining
     */
    public bindElement(vPath: string | Record<string, unknown>, mParameters?: object): this {
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

    /**
     * Standard UI5 Lifecycle Hook.
     * Evaluates the initial properties and spawns the GeneratorHost.
     * It handles the complex lifecycle task of copying all bindings, raw properties, and event listeners 
     * down to the inner host perfectly transparently.
     */
    public onBeforeRendering(): void {
        Logger.debug("[MetaUI DynamicHost]", `onBeforeRendering called. _initializedInner: ${this._initializedInner}`, "DynamicHost");

        this.initODataDelegate();

        if (!this._initializedInner) {
            let schemaRaw = this.getProperty("schemaDefinition");

            // 1. URL Detection & Fetching
            if (typeof schemaRaw === "string" && (schemaRaw.startsWith("http://") || schemaRaw.startsWith("https://"))) {
                if ((this as any)._fetchingSchema) return; // Prevent re-entry
                (this as any)._fetchingSchema = true;
                
                sap.ui.require(["sap/ui/core/BusyIndicator", "sap/m/MessageToast"], (BusyIndicator: any, MessageToast: any) => {
                    BusyIndicator.show(0);
                    fetch(schemaRaw as string)
                        .then(res => {
                            if (!res.ok) throw new Error("HTTP " + res.status);
                            return res.json();
                        })
                        .then(json => {
                            const plugin = SchemaBuilderRegistry.getBuilderFor(json);
                            const finalSchema = plugin ? plugin.build(json) : json;
                            super.setProperty("schemaDefinition", finalSchema, true);
                            (this as any)._fetchingSchema = false;
                            BusyIndicator.hide();
                            this.invalidate(); // Force re-render with resolved schema
                        })
                        .catch(err => {
                            Logger.warn("[MetaUI DynamicHost]", "Failed to fetch remote schema: " + err, "DynamicHost");
                            if (MessageToast) MessageToast.show("Failed to fetch remote schema");
                            super.setProperty("schemaDefinition", null, true); // Fallback to full inference
                            (this as any)._fetchingSchema = false;
                            BusyIndicator.hide();
                            this.invalidate();
                        });
                });
                return; // Abort this render cycle until fetch completes
            }

            // 2. Local Plugin Detection (Stringified JSON or Raw Object)
            let schema = schemaRaw;
            if (schema && typeof schema === "string" && (schema as string).trim().startsWith("{")) {
                try {
                    schema = JSON.parse(schema);
                } catch (e) {
                    // Ignore, let standard validation catch it
                }
            }

            if (schema && typeof schema === "object") {
                const plugin = SchemaBuilderRegistry.getBuilderFor(schema);
                if (plugin) {
                    schema = plugin.build(schema);
                    // Silently update the wrapper property so the inner host gets the final parsed MetaUI format
                    super.setProperty("schemaDefinition", schema, true);
                }
            }

            const dataJson = this.getProperty("dataJson");
            const data = this.getProperty("data");

            let hasSchema = !!schema;
            if (hasSchema && typeof schema === "object" && Object.keys(schema).length === 0) {
                hasSchema = false; // Treat empty object as no schema
            }

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
                    this._innerHost.attachEvent(eventName, (oEvent: sap.ui.base.Event) => {
                        // Natively push updated payload out to any bound Fiori Element properties.
                        // Using super.setProperty prevents an infinite loop back down to _innerHost.
                        if (eventName === "submit" || eventName === "fieldChange") {
                            const params = oEvent.getParameters();
                            if (params.payload) {
                                const isLive = this.getProperty("liveUpdate") === true;
                                if (eventName === "submit" || isLive) {
                                    super.setProperty("data", params.payload, true);

                                    const str = params.payloadJson || JSON.stringify(params.payload, null, 2);
                                    super.setProperty("dataJson", str, true);
                                }
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
     * If the inner host has not booted yet, it forces initialization immediately.
     * 
     * @param {string} [title="Form"] The title of the dialog
     * @param {string} [submitButtonText="OK"] The text for the primary action button
     * @param {string} [cancelButtonText="Cancel"] The text for the cancel button
     * @param {string} [dialogWidth="auto"] The width of the dialog
     * @param {sap.ui.core.Control} [parentView] The parent view to attach the dialog to for model inheritance.
     */
    public openInDialog(title?: string, submitButtonText?: string, cancelButtonText?: string, dialogWidth?: string, parentView?: Control): void {
        if (!this._innerHost) {
            this.onBeforeRendering(); // Force init if they bypassed UI5 rendering
        }
        this._innerHost?.openInDialog(title, submitButtonText, cancelButtonText, dialogWidth, parentView);
    }

    /**
     * Proxies submission triggering down to the instantiated generator host.
     * Evaluates the internal Engine validation suite and returns true if structurally sound.
     * 
     * @returns {boolean} True if the internal payload passes schema validation, false otherwise.
     */
    public triggerSubmit(): boolean {
        if (!this._innerHost) {
            return false;
        }
        return this._innerHost.triggerSubmit();
    }

    /**
     * Injects a custom error message onto a specific field.
     * Useful for injecting custom backend validation errors.
     * 
     * @param {string} fieldPath The schema key path to target.
     * @param {string} message The custom error message to display.
     */
    public addCustomError(fieldPath: string, message: string): void {
        if (this._innerHost && typeof (this._innerHost as any).addCustomError === "function") {
            (this._innerHost as any).addCustomError(fieldPath, message);
        }
    }

    /**
     * Clears a custom error message from a specific field.
     * 
     * @param {string} fieldPath The schema key path to target.
     */
    public clearCustomError(fieldPath: string): void {
        if (this._innerHost && typeof (this._innerHost as any).clearCustomError === "function") {
            (this._innerHost as any).clearCustomError(fieldPath);
        }
    }

    /**
     * Overrides standard UI5 getProperty to transparently pull extracted data from the inner host.
     * Ensures that querying the DynamicHost facade for `data` always yields the freshest payload.
     * 
     * @param {string} propertyName The name of the property to retrieve
     * @returns {unknown} The property value
     */
    public getProperty(propertyName: string): unknown {
        if (propertyName === "outputData") {
            propertyName = "data"; // Forward deprecated outputData to data
        }
        if (this._innerHost && (propertyName === "data" || propertyName === "dataJson")) {
            return this._innerHost.getProperty(propertyName);
        }
        return super.getProperty(propertyName);
    }
}
