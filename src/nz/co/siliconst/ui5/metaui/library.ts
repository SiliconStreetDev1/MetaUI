/**
 * @file library.ts
 * @description Standard SAP UI5 library registration file. Exposes the MetaUI namespace 
 * and automatically bootstraps the internal PluginRegistry.
 */

import Core from "sap/ui/core/Core";
import { PluginRegistry } from "./core/PluginRegistry";
import { StringPlugin } from "./plugins/StringPlugin";
import { NumberPlugin } from "./plugins/NumberPlugin";
import { BooleanPlugin } from "./plugins/BooleanPlugin";
import { DropdownPlugin } from "./plugins/DropdownPlugin";
import { DatePlugin } from "./plugins/DatePlugin";
import { TimePlugin } from "./plugins/TimePlugin";
import { DateTimePlugin } from "./plugins/DateTimePlugin";
import { ArrayPlugin } from "./plugins/ArrayPlugin";

import { TextAreaPlugin } from "./plugins/TextAreaPlugin";
import { SwitchPlugin } from "./plugins/SwitchPlugin";

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
        "nz.co.siliconst.ui5.metaui.controls.GeneratorHost"
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
registry.register("dropdown", DropdownPlugin);
registry.register("date", DatePlugin);
registry.register("time", TimePlugin);
registry.register("datetime", DateTimePlugin);
registry.register("array", ArrayPlugin);

// Exporting window object safely for UI5 compatibility if needed
export default (window as any)["nz"]["co"]["siliconst"]["ui5"]["metaui"];
