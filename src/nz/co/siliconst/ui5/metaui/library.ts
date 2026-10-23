/**
 * @file library.ts
 * @description Standard SAP UI5 library registration file. Exposes the MetaUI namespace
 * and automatically bootstraps the internal PluginRegistry.
 */

import Core from "sap/ui/core/Core";

// Eagerly bundle the 8 baseline primitive/container control plugins and 4 layout managers into library-preload.js
// so standard JSON Schema / inferred forms render with zero extra AMD network round-trips; specialized, hardware,
// action, and remote-datasource plugins are lazy-loaded on demand via PluginRegistry.preloadDependencies().
import "nz/co/siliconst/ui5/metaui/plugins/controls/StringPlugin";
import "nz/co/siliconst/ui5/metaui/plugins/controls/NumberPlugin";
import "nz/co/siliconst/ui5/metaui/plugins/controls/BooleanPlugin";
import "nz/co/siliconst/ui5/metaui/plugins/controls/ObjectPlugin";
import "nz/co/siliconst/ui5/metaui/plugins/controls/ArrayPlugin";
import "nz/co/siliconst/ui5/metaui/plugins/controls/DropdownPlugin";
import "nz/co/siliconst/ui5/metaui/plugins/controls/MultiInputPlugin";
import "nz/co/siliconst/ui5/metaui/plugins/controls/DatePlugin";
import "nz/co/siliconst/ui5/metaui/core/DefaultLayoutGenerator";
import "nz/co/siliconst/ui5/metaui/utils/ExpressionBuilder";

// Explicitly import core Layouts
import "nz/co/siliconst/ui5/metaui/layouts/FormLayout";
import "nz/co/siliconst/ui5/metaui/layouts/TableLayout";
import "nz/co/siliconst/ui5/metaui/layouts/WizardLayout";
import "nz/co/siliconst/ui5/metaui/layouts/CompactLayout";

// Delegate to standard library registration.
//
// `dependencies` is the EAGER list: UI5 resolves every entry while this factory runs. It must
// therefore contain exactly the libraries the eagerly bundled plugins and layouts above import,
// and nothing else. `sap.ui.unified` (FileUploaderPlugin) and `sap.ui.codeeditor`
// (CodeEditorPlugin) are reachable only through plugin modules that
// PluginRegistry.preloadDependencies() requires on demand, so both are declared
// `<lazy>true</lazy>` in `.library` and are deliberately absent here.
//
// Listing a library here that is not eagerly imported is not merely redundant. This list once
// carried `sap.ndc`, which ships with SAPUI5 but not with OpenUI5, so resolving
// `sap/ndc/library.js` 404'd on every OpenUI5 distribution and took the whole library factory -
// and therefore the whole form - down with it. Both survivors ship with OpenUI5 too.
Core.initLibrary({
    name: "nz.co.siliconst.ui5.metaui",
    version: "2.0.0",
    dependencies: [
        "sap.ui.core",
        "sap.m",
        "sap.ui.layout"
    ],
    controls: [
        "nz.co.siliconst.ui5.metaui.controls.DynamicHost",
        "nz.co.siliconst.ui5.metaui.controls.host.GeneratorHost",
        "nz.co.siliconst.ui5.metaui.controls.host.InferredGeneratorHost",
        "nz.co.siliconst.ui5.metaui.controls.BaseHardwareControl",
        "nz.co.siliconst.ui5.metaui.controls.CameraControl",
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
