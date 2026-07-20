/**
 * @file library.ts
 * @description Standard SAP UI5 library registration file. Exposes the MetaUI namespace 
 * and automatically bootstraps the internal PluginRegistry.
 */

import Core from "sap/ui/core/Core";

// Explicitly import core plugins to bundle them into library-preload.js
import "nz/co/siliconst/ui5/metaui/plugins/controls/StringPlugin";
import "nz/co/siliconst/ui5/metaui/plugins/controls/NumberPlugin";
import "nz/co/siliconst/ui5/metaui/plugins/controls/BooleanPlugin";
import "nz/co/siliconst/ui5/metaui/plugins/controls/ObjectPlugin";
import "nz/co/siliconst/ui5/metaui/plugins/controls/ArrayPlugin";
import "nz/co/siliconst/ui5/metaui/plugins/controls/DropdownPlugin";
import "nz/co/siliconst/ui5/metaui/plugins/controls/DatePlugin";
import "nz/co/siliconst/ui5/metaui/core/DefaultLayoutGenerator";
import "nz/co/siliconst/ui5/metaui/utils/ExpressionBuilder";

// Explicitly import core Layouts
import "nz/co/siliconst/ui5/metaui/layouts/FormLayout";
import "nz/co/siliconst/ui5/metaui/layouts/TableLayout";
import "nz/co/siliconst/ui5/metaui/layouts/WizardLayout";
import "nz/co/siliconst/ui5/metaui/layouts/CompactLayout";

// Delegate to standard library registration
Core.initLibrary({
    name: "nz.co.siliconst.ui5.metaui",
    version: "1.0.0",
    dependencies: [
        "sap.ui.core",
        "sap.m",
        "sap.ui.layout",
        "sap.ui.table"
    ],
    controls: [
        "nz.co.siliconst.ui5.metaui.controls.DynamicHost",
        "nz.co.siliconst.ui5.metaui.controls.host.GeneratorHost",
        "nz.co.siliconst.ui5.metaui.controls.BaseHardwareControl",
        "nz.co.siliconst.ui5.metaui.controls.CameraControl",
        "nz.co.siliconst.ui5.metaui.controls.BarcodeScannerControl",
        "nz.co.siliconst.ui5.metaui.controls.SignatureControl",
        "nz.co.siliconst.ui5.metaui.controls.VoiceInputControl",
        "nz.co.siliconst.ui5.metaui.controls.GeolocationControl",
        "nz.co.siliconst.ui5.metaui.controls.RichTextControl"
    ],
    elements: [],
    interfaces: [],
    noLibraryCSS: true
});

// Exporting window object safely for UI5 compatibility if needed
declare global {
    interface Window {
        nz: {
            co: {
                siliconst: {
                    ui5: {
                        metaui: Record<string, unknown>;
                    };
                };
            };
        };
    }
}

export default window.nz.co.siliconst.ui5.metaui;
