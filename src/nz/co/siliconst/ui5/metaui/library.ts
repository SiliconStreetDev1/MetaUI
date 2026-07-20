/**
 * @file library.ts
 * @description Standard SAP UI5 library registration file. Exposes the MetaUI namespace 
 * and automatically bootstraps the internal PluginRegistry.
 */

import Core from "sap/ui/core/Core";

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
        "nz.co.siliconst.ui5.metaui.controls.GeneratorHost",
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
export default (window as unknown)["nz"]["co"]["siliconst"]["ui5"]["metaui"];
