sap.ui.define([
    "nz/co/siliconst/ui5/metaui/plugins/datasources/RemoteValueHelpPlugin"
], function (RemoteValueHelpPluginModule) {
    "use strict";

    /**
     * A Mock subclass of the real RemoteValueHelpPlugin.
     * Intercepts the fetchData method to inject artificial latency,
     * ensuring the test application operates independently of a real backend, while
     * keeping the core MetaUI engine pure.
     */
    class MockRemoteValueHelpPlugin extends RemoteValueHelpPluginModule.RemoteValueHelpPlugin {
        openValueHelpDialog(input, metadata) {
            return super.openValueHelpDialog(input, metadata);
        }
    }

    return {
        MockRemoteValueHelpPlugin: MockRemoteValueHelpPlugin
    };
});
