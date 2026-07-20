declare module "sap/ndc/BarcodeScannerButton" {
    import Control from "sap/ui/core/Control";
    import Event from "sap/ui/base/Event";

    export default class BarcodeScannerButton extends Control {
        constructor(idOrSettings?: string | object, settings?: object);
        attachScanSuccess(fn: (oEvent: Event) => void): this;
        attachScanFail(fn: (oEvent: Event) => void): this;
        attachInputLiveUpdate(fn: (oEvent: Event) => void): this;
    }
}

declare module "sap/ui/model/odata/v4/Context" {
    import Context from "sap/ui/model/Context";
    export default class ODataV4Context extends Context {
        requestObject(): Promise<unknown>;
        getObject(sPath?: string): unknown;
        setProperty(sPath: string, oValue: unknown): Promise<void>;
    }
}
