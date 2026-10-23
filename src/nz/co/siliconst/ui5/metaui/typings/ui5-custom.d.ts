/**
 * @file ui5-custom.d.ts
 * @description Ambient module declarations for UI5 libraries that ship without TypeScript
 * definitions in `@types/openui5` (sap.ui.richtexteditor is not part of the OpenUI5 type
 * bundle). Only the API surface actually consumed by MetaUI is declared.
 */

declare module "sap/ui/richtexteditor/RichTextEditor" {
    import Control from "sap/ui/core/Control";
    import { $ControlSettings } from "sap/ui/core/Control";
    import Event from "sap/ui/base/Event";

    /** Parameters delivered by the `change` event. */
    export interface RichTextEditor$ChangeEventParameters {
        newValue?: string;
    }

    /** Settings accepted by the `RichTextEditor` constructor. */
    export interface $RichTextEditorSettings extends $ControlSettings {
        value?: string;
        width?: string;
        height?: string;
        editable?: boolean;
        showGroupFont?: boolean;
        showGroupInsert?: boolean;
        change?: (oEvent: Event<RichTextEditor$ChangeEventParameters>) => void;
    }

    export default class RichTextEditor extends Control {
        constructor(id?: string | $RichTextEditorSettings, settings?: $RichTextEditorSettings);
        getValue(): string;
        setValue(value: string): this;
        setEditable(editable: boolean): this;
    }
}

declare module "sap/ui/base/BindingParser" {
    import { PropertyBindingInfo } from "sap/ui/base/ManagedObject";

    const BindingParser: {
        complexParser(
            sString: string,
            oContext?: object,
            bUnescape?: boolean,
            bTolerateFunctionsNotFound?: boolean,
            bStaticContext?: boolean,
            bFunctionsNotFound?: boolean,
            mLocals?: Record<string, unknown>
        ): PropertyBindingInfo | string | undefined;
    };

    export default BindingParser;
}
