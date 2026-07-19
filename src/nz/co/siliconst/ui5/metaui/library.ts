/**
 * @file library.ts
 * @description Standard SAP UI5 library registration file. Exposes the MetaUI namespace 
 * and automatically bootstraps the internal PluginRegistry.
 */

import Core from "sap/ui/core/Core";
import { PluginRegistry } from "./core/PluginRegistry";
import "./core/LayoutRegistry";
import { StringPlugin } from "./plugins/controls/StringPlugin";
import { NumberPlugin } from "./plugins/controls/NumberPlugin";
import { BooleanPlugin } from "./plugins/controls/BooleanPlugin";
import { DropdownPlugin } from "./plugins/controls/DropdownPlugin";
import { DatePlugin } from "./plugins/controls/DatePlugin";
import { TimePlugin } from "./plugins/controls/TimePlugin";
import { DateTimePlugin } from "./plugins/controls/DateTimePlugin";
import { ArrayPlugin } from "./plugins/controls/ArrayPlugin";

import { TextAreaPlugin } from "./plugins/controls/TextAreaPlugin";
import { SwitchPlugin } from "./plugins/controls/SwitchPlugin";
import { LiveSearchPlugin } from "./plugins/datasources/LiveSearchPlugin";

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

/**
 * Global Bootstrapper: Maps all standard primitive types to their respective plugins.
 */
const registry = PluginRegistry.getInstance();
registry.register("string", StringPlugin);
registry.register("string", TextAreaPlugin, "textArea");
registry.register("number", NumberPlugin);
registry.register("boolean", BooleanPlugin);
registry.register("boolean", SwitchPlugin, "switch");
// @ts-ignore: Custom UI widgets mapped back to string primitives for UI orchestration
registry.register("dropdown", DropdownPlugin);
registry.register("date", DatePlugin);
// @ts-ignore
registry.register("time", TimePlugin);
// @ts-ignore
registry.register("datetime", DateTimePlugin);
registry.register("array", ArrayPlugin);
registry.register("string", LiveSearchPlugin, "liveSearch");

// Exporting window object safely for UI5 compatibility if needed
export default (window as any)["nz"]["co"]["siliconst"]["ui5"]["metaui"];
