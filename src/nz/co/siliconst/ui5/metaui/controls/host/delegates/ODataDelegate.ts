import { DynamicHost } from "../DynamicHost";
import Context from "sap/ui/model/Context";
import { Logger } from "../../../utils/Logger";

/**
 * Universal OData Delegate.
 * Natively detects and manages two-way synchronization for both OData V2 and V4 contexts
 * without requiring controller-level mappings.
 */
export class ODataDelegate {
    private host: DynamicHost;
    private context: Context;
    private odataType: "V2" | "V4" | null = null;
    private isSyncing: boolean = false;

    /**
     * Initializes a new instance of the ODataDelegate.
     * 
     * @param {DynamicHost} host The parent MetaUI DynamicHost instance managing the UI generation.
     * @param {Context} context The active UI5 Model Context bound to the host.
     */
    constructor(host: DynamicHost, context: Context) {
        this.host = host;
        this.context = context;
        this.detectODataType();
    }

    /**
     * Evaluates the underlying UI5 Model bound to the context to determine if it is an
     * OData V2 or OData V4 model. This determination drives the synchronization strategy.
     * 
     * @private
     */
    private detectODataType(): void {
        const model = this.context.getModel();
        // sap.ui.model.odata.v4.ODataModel
        // sap.ui.model.odata.v2.ODataModel
        const sClassName = model.getMetadata().getName();
        if (sClassName.indexOf("v4") > -1) {
            this.odataType = "V4";
        } else if (sClassName.indexOf("v2") > -1 || sClassName.indexOf("ODataModel") > -1) {
            this.odataType = "V2";
        }
    }

    /**
     * Extracts the full entity payload from the bound OData context and pushes it to the Engine.
     * V4 uses an asynchronous requestObject(), while V2 retrieves it synchronously.
     * 
     * @public
     */
    public syncToEngine(): void {
        if (!this.odataType) return;

        if (this.odataType === "V4") {
            // V4 uses async requestObject()
            if (typeof (this.context as any).requestObject === "function") {
                (this.context as any).requestObject().then((oData: any) => {
                    this.pushPayload(oData);
                }).catch((err: Error) => {
                    Logger.error("[MetaUI]", "Failed to extract V4 Context payload: " + err.message, "ODataDelegate");
                });
            }
        } else if (this.odataType === "V2") {
            // V2 uses sync getObject()
            const oData = this.context.getObject();
            if (oData) {
                this.pushPayload(oData);
            }
        }
    }

    /**
     * Cleans the raw OData payload by stripping framework metadata properties (keys starting with '@' or '__')
     * and pushes the sanitized business data into the MetaUI DynamicHost state manager.
     * 
     * @param {any} oData The raw JSON object extracted from the OData model context.
     * @private
     */
    private pushPayload(oData: any): void {
        if (!oData) return;
        
        // Remove OData metadata properties before pushing to MetaUI
        const cleanData = { ...oData };
        for (const key of Object.keys(cleanData)) {
            if (key.startsWith("@") || key.startsWith("__")) {
                delete cleanData[key];
            }
        }

        this.isSyncing = true;
        this.host.setProperty("data", cleanData);
        this.isSyncing = false;
    }

    /**
     * Intercepts a field change from the MetaUI Engine and translates it into an OData PATCH.
     */
    public handleFieldChange(fieldPath: string, value: any): void {
        if (this.isSyncing || !this.odataType) return;

        try {
            if (this.odataType === "V4") {
                // V4 sets property directly on context
                this.context.setProperty(fieldPath, value);
            } else if (this.odataType === "V2") {
                // V2 sets property on model, specifying the context path
                const model = this.context.getModel();
                model.setProperty(fieldPath, value, this.context);
            }
            if (this.host.getProperty("debugMode")) {
                Logger.debug("[MetaUI]", `ODataDelegate Patched ${fieldPath} = ${value} via ${this.odataType}`, "ODataDelegate");
            }
        } catch (e) {
            Logger.error("[MetaUI]", `Failed to patch OData context: ${(e as Error).message}`, "ODataDelegate");
        }
    }
}
