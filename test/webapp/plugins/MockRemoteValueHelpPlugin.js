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
        fetchData(comboBox) {
            var vhConfig = this.metadata && this.metadata.valueHelp;
            if (!vhConfig || !vhConfig.url) {
                return;
            }
            
            comboBox.setBusy(true);
            
            // Simulate network latency for sandbox testing
            setTimeout(() => {
                // Call the original fetchData method which performs the actual fetch
                super.fetchData(comboBox);
            }, 800); // 800ms artificial delay
        }
    }

    return {
        MockRemoteValueHelpPlugin: MockRemoteValueHelpPlugin
    };
});
